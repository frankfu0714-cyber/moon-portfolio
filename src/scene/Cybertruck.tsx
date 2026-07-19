"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { sampleTerrainHeight } from "@/lib/terrain";
import { useSceneStore } from "@/lib/store";

// Tesla-Cybertruck-style low-poly GLB by Mobolaji, sourced from
// Poly Pizza (CC-BY 3.0). Bundled at /public/models/cybertruck.glb.
// License CC-BY 3.0. Attribution shown in the credits pill.
// Original: https://poly.pizza/m/Jpar3f32mt (author Mobolaji).
// GLB has zero embedded textures - materials are all solid colors,
// so no trademark wordmark or Tesla logo is baked in.
//
// Rebuilt as a HOVER vehicle: wheels + trim cylinders hidden, chassis
// floats a fixed distance above the sampled terrain, four small blue
// jet nozzles (matching the astronaut's boot-jet aesthetic) glow at
// the corners under the sill.

const CYBERTRUCK_URL = "/models/cybertruck.glb?v=2";
useGLTF.preload(CYBERTRUCK_URL);

// Starting placement + rotation. Once driving, these are just the
// initial values - the truck's own state ref takes over.
export const CYBERTRUCK_START_X = -8;
export const CYBERTRUCK_START_Z = 11;
export const CYBERTRUCK_START_ROT_Y = 0.55;
export const CYBERTRUCK_COLLISION_R = 5.0;
export const CYBERTRUCK_INTERACT_R = 5.5;

// Live world-space state so the astronaut controller (proximity,
// collision, exit spawn) can read where the truck is right now
// without going through zustand-triggered re-renders.
export const vehicleState = {
  x: CYBERTRUCK_START_X,
  z: CYBERTRUCK_START_Z,
  heading: CYBERTRUCK_START_ROT_Y,
};

// Target world dimensions calibrated to the reference photo. See the
// last land-Cybertruck PR for the derivation. Length + width + height
// unchanged from the ground version — this is a look tweak, not a
// silhouette tweak.
const TARGET_LENGTH = 6.8;
const TARGET_HEIGHT = 1.61;
const WIDTH_MULT = 0.75;

// Hover tuning
const HOVER_HEIGHT = 1.2;
const BOB_AMP = 0.15;
const BOB_PERIOD = 1.5;
const TILT_MAX = 0.18;
const TILT_LERP = 3.0;

// Drive tuning — floatier than the ground version.
const BASE_SPEED = 5.0;
const BOOST_SPEED = 9.5;
const REVERSE_MULT = 0.5;
const ACCEL_LAMBDA = 1.5;
const TURN_RATE_LOW = 1.05;
const TURN_RATE_HIGH = 0.42;

// Chase camera when driving.
const CAM_LOCAL_Y = 3.6;
const CAM_LOCAL_BACK = 8.8;
const CAM_LOOK_AHEAD = 1.2;
const CAM_LOOK_UP = 1.4;
const CAM_LERP = 6;

// Jet VFX — mirrors the astronaut's boot-jet approach:
// layered cones (wider blue outer + narrow white core), small glow
// sprite, trailing particle stream. Small + focused, not blob-fire.
//
// Four nozzles pulled well INSIDE the truck's footprint on X so the
// glow never pokes out past the body silhouette, and positioned at
// the sill (world Y = chassis bottom) so the flame originates from
// under the truck instead of below-ground. depthTest ON so the
// chassis actually occludes them from above/behind angles.
const JET_HALF_TRACK = 0.55;
const JET_AXLE_Z = 1.4;
const JET_POSITIONS: [number, number][] = [
  [-JET_HALF_TRACK, -JET_AXLE_Z],
  [JET_HALF_TRACK, -JET_AXLE_Z],
  [-JET_HALF_TRACK, JET_AXLE_Z],
  [JET_HALF_TRACK, JET_AXLE_Z],
];
// Baseline idle intensity so the truck reads as HOVERING even when
// parked — a full-off jet would suggest "landed" which contradicts
// the hover conversion.
const JET_IDLE_INTENSITY = 0.35;
const JET_MAX_INTENSITY = 1.0;

// Soft blue-white radial glow, matching the astronaut's jetGlowTex.
function makeJetGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(190,225,255,0.55)");
  g.addColorStop(0.6, "rgba(130,190,255,0.16)");
  g.addColorStop(1, "rgba(130,190,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type JetSystem = {
  group: THREE.Group;
  cones: THREE.Mesh[];
  mats: Array<THREE.MeshBasicMaterial | THREE.SpriteMaterial>;
  particles: Array<{
    s: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    phase: number;
    speed: number;
  }>;
};

// Build a jet system imperatively so we own every mesh/material ref
// and can animate them per-frame without any React round-trips. This
// is the same shape the astronaut uses; the shared JetGlow texture
// paints identical soft-blue nozzles under the truck's chassis.
function makeJetSystem(glowTex: THREE.Texture): JetSystem {
  const group = new THREE.Group();
  const cones: THREE.Mesh[] = [];
  const mats: Array<THREE.MeshBasicMaterial | THREE.SpriteMaterial> = [];
  const particles: JetSystem["particles"] = [];

  JET_POSITIONS.forEach(([x, z], nozzleIdx) => {
    const nozzle = new THREE.Group();
    nozzle.position.set(x, 0, z);

    // Outer cone — wider soft-blue flare.
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.55, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#bfe4ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    outer.position.y = -0.27;
    outer.rotation.x = Math.PI; // point tip down
    nozzle.add(outer);
    cones.push(outer);
    mats.push(outer.material as THREE.MeshBasicMaterial);

    // Inner cone — narrow white core.
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.34, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    inner.position.y = -0.19;
    inner.rotation.x = Math.PI;
    nozzle.add(inner);
    cones.push(inner);
    mats.push(inner.material as THREE.MeshBasicMaterial);

    // Nozzle glow — small sprite at the emitter face.
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(0, -0.02, 0);
    glow.scale.set(0.5, 0.5, 1);
    nozzle.add(glow);
    mats.push(glowMat);

    // Trailing exhaust particles — 5 recycled sprites per nozzle that
    // drift down + fade, giving the jet its plume.
    for (let pi = 0; pi < 5; pi++) {
      const idx = nozzleIdx * 5 + pi;
      const pMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: "#8fd4ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Sprite(pMat);
      p.position.set(0, -0.12, 0);
      p.scale.set(0.12, 0.12, 1);
      nozzle.add(p);
      particles.push({
        s: p,
        mat: pMat,
        phase: (idx * 0.1618) % 1,
        speed: 1.25 + (idx % 5) * 0.17,
      });
    }

    group.add(nozzle);
  });

  return { group, cones, mats, particles };
}

export function Cybertruck() {
  const gltf = useGLTF(CYBERTRUCK_URL);
  const groupRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
  const jetSystemRef = useRef<JetSystem | null>(null);
  const { camera } = useThree();

  // Live truck state
  const pos = useRef(
    new THREE.Vector3(CYBERTRUCK_START_X, 0, CYBERTRUCK_START_Z),
  );
  const heading = useRef(CYBERTRUCK_START_ROT_Y);
  const speed = useRef(0);
  const prevSpeed = useRef(0);
  const pitch = useRef(0);
  const camPos = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());
  const camInit = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const jetGlowTex = useMemo(() => makeJetGlowTexture(), []);
  // The jet system is built imperatively (Three primitives, not R3F)
  // and mounted via <primitive>. That gives us direct ownership of
  // every mesh/material without needing a ref juggling ceremony.
  const jetSystem = useMemo(
    () => makeJetSystem(jetGlowTex),
    [jetGlowTex],
  );
  jetSystemRef.current = jetSystem;

  const modelInfo = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.rotation.y = Math.PI;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return;
      }
      if (o.name.startsWith("Sphere") || o.name.startsWith("Cylinder")) {
        o.visible = false;
      }
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const nativeLength = Math.max(size.x, size.z);
    if (!nativeLength || !Number.isFinite(nativeLength)) {
      return { scene, scale: [1, 1, 1] as [number, number, number] };
    }
    const lengthScale = TARGET_LENGTH / nativeLength;
    const widthScale = lengthScale * WIDTH_MULT;
    const yScale = size.y > 1e-4 ? TARGET_HEIGHT / size.y : lengthScale;
    const lengthIsX = size.x >= size.z;
    const scale: [number, number, number] = lengthIsX
      ? [lengthScale, yScale, widthScale]
      : [widthScale, yScale, lengthScale];
    return { scene, scale };
  }, [gltf.scene]);

  const groundOffset = useRef(0);
  useEffect(() => {
    const t = tiltRef.current;
    if (!t) return;
    t.updateMatrixWorld(true);
    // Measure JUST the truck body, not the jet group (which is
    // parented to tiltRef too), otherwise the jet cones dragging
    // down would inflate groundOffset every mount.
    const scaledModel = t.children.find(
      (c) => c !== jetSystem.group,
    );
    if (!scaledModel) return;
    const box = new THREE.Box3().setFromObject(scaledModel);
    groundOffset.current = -box.min.y;
  }, [modelInfo, jetSystem]);

  useFrame((state, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const g = groupRef.current;
    const t = tiltRef.current;
    if (!g || !t) return;

    const { driving, walkInput, activePanel } = useSceneStore.getState();
    const inputActive = driving && !activePanel;

    if (inputActive) {
      const throttle = walkInput.forward;
      const wantsBoost = walkInput.running;
      const cap = wantsBoost ? BOOST_SPEED : BASE_SPEED;
      const targetSpeed =
        throttle >= 0 ? cap * throttle : BASE_SPEED * REVERSE_MULT * throttle;
      speed.current = THREE.MathUtils.damp(
        speed.current,
        targetSpeed,
        ACCEL_LAMBDA,
        dt,
      );

      const speedMag = Math.abs(speed.current);
      const speedFrac = Math.min(speedMag / BOOST_SPEED, 1);
      const turnRate = THREE.MathUtils.lerp(
        TURN_RATE_LOW,
        TURN_RATE_HIGH,
        speedFrac,
      );
      if (speedMag > 0.05) {
        const dir = Math.sign(speed.current);
        heading.current -= walkInput.strafe * turnRate * dt * dir;
      }
    } else {
      speed.current = THREE.MathUtils.damp(
        speed.current,
        0,
        ACCEL_LAMBDA * 1.6,
        dt,
      );
    }

    if (Math.abs(speed.current) > 0.001) {
      const dx = Math.sin(heading.current) * speed.current * dt;
      const dz = Math.cos(heading.current) * speed.current * dt;
      pos.current.x += dx;
      pos.current.z += dz;
    }

    const groundY = sampleTerrainHeight(pos.current.x, pos.current.z);
    const time = state.clock.elapsedTime;
    const bob = Math.sin((time / BOB_PERIOD) * Math.PI * 2) * BOB_AMP;
    pos.current.y = groundY + HOVER_HEIGHT + groundOffset.current + bob;

    const dvdt = (speed.current - prevSpeed.current) / Math.max(dt, 1e-4);
    prevSpeed.current = speed.current;
    const targetPitch = THREE.MathUtils.clamp(
      -dvdt * 0.05,
      -TILT_MAX,
      TILT_MAX,
    );
    pitch.current = THREE.MathUtils.damp(
      pitch.current,
      targetPitch,
      TILT_LERP,
      dt,
    );
    t.rotation.x = pitch.current;

    g.position.copy(pos.current);
    g.rotation.y = heading.current;

    vehicleState.x = pos.current.x;
    vehicleState.z = pos.current.z;
    vehicleState.heading = heading.current;

    // Reposition the whole jet group at the chassis sill each frame.
    // sill is at world Y = pos.y - groundOffset; in tiltRef's local
    // frame that's Y = -groundOffset.
    jetSystem.group.position.y = -groundOffset.current;

    // Jet animation — mirrors Astronaut.tsx's boot-jet loop. Idle
    // intensity keeps the nozzles glowing while parked so the truck
    // reads as hovering; ramps to full at boost speed.
    const speedFrac = Math.min(Math.abs(speed.current) / BOOST_SPEED, 1);
    const intensity = THREE.MathUtils.lerp(
      JET_IDLE_INTENSITY,
      JET_MAX_INTENSITY,
      speedFrac,
    );
    for (const m of jetSystem.mats) {
      m.opacity = intensity * (0.6 + Math.random() * 0.4);
    }
    for (let i = 0; i < jetSystem.cones.length; i++) {
      const c = jetSystem.cones[i];
      c.scale.y =
        0.72 +
        0.26 * Math.sin(time * 41 + i * 2.63) +
        0.14 * Math.sin(time * 89 + i * 5.1) +
        0.14 * Math.random();
      const w = 0.85 + 0.22 * Math.random();
      c.scale.x = w;
      c.scale.z = w;
      c.rotation.z = Math.sin(time * 23 + i * 3.7) * 0.08;
    }
    for (const pt of jetSystem.particles) {
      const frac = (time * pt.speed + pt.phase) % 1;
      pt.s.position.y = -0.12 - frac * 0.6;
      pt.s.position.x =
        Math.sin((time * 7 + pt.phase * 40) * pt.speed) * 0.03 * frac;
      pt.s.position.z =
        Math.cos((time * 6 + pt.phase * 31) * pt.speed) * 0.03 * frac;
      const sc = 0.14 * (1 - frac * 0.65);
      pt.s.scale.set(sc, sc, 1);
      pt.mat.opacity =
        intensity * (1 - frac) * (0.65 + 0.3 * Math.random());
    }

    if (driving) {
      const cosH = Math.cos(heading.current);
      const sinH = Math.sin(heading.current);
      const backDX = -sinH * CAM_LOCAL_BACK;
      const backDZ = -cosH * CAM_LOCAL_BACK;
      tmp.set(
        pos.current.x + backDX,
        pos.current.y + CAM_LOCAL_Y,
        pos.current.z + backDZ,
      );
      if (!camInit.current) {
        camPos.current.copy(tmp);
        camInit.current = true;
      }
      camPos.current.x = THREE.MathUtils.damp(camPos.current.x, tmp.x, CAM_LERP, dt);
      camPos.current.y = THREE.MathUtils.damp(camPos.current.y, tmp.y, CAM_LERP, dt);
      camPos.current.z = THREE.MathUtils.damp(camPos.current.z, tmp.z, CAM_LERP, dt);

      const aheadX = pos.current.x + sinH * CAM_LOOK_AHEAD;
      const aheadZ = pos.current.z + cosH * CAM_LOOK_AHEAD;
      camTarget.current.x = THREE.MathUtils.damp(camTarget.current.x, aheadX, CAM_LERP, dt);
      camTarget.current.y = THREE.MathUtils.damp(
        camTarget.current.y,
        pos.current.y + CAM_LOOK_UP,
        CAM_LERP,
        dt,
      );
      camTarget.current.z = THREE.MathUtils.damp(camTarget.current.z, aheadZ, CAM_LERP, dt);

      camera.position.copy(camPos.current);
      camera.lookAt(camTarget.current);
    } else {
      camInit.current = false;
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={tiltRef}>
        <group scale={modelInfo.scale}>
          <primitive object={modelInfo.scene} />
        </group>
        {/* Jet system parented INSIDE the tilt group so nozzles tilt
            with the chassis. Their Y is repositioned per-frame to the
            chassis sill via jetSystem.group.position.y. */}
        <primitive object={jetSystem.group} />
      </group>
    </group>
  );
}
