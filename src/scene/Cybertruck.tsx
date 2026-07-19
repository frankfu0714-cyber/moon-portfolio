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
// floats a fixed distance above the sampled terrain, four blue thruster
// sprites glow under the belly.

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
// Chassis bottom sits this many world units above the sampled terrain.
// 1.2 reads as "levitating" without floating so high it looks broken.
const HOVER_HEIGHT = 1.2;
// Idle bob: sin wave in Y, adds a subtle "not perfectly stationary"
// feel while parked or coasting.
const BOB_AMP = 0.15;
const BOB_PERIOD = 1.5;
// Pitch tilt (rotation around local X) driven by accel/decel — the
// truck noses up when accelerating, forward when braking, like a
// hover jet dipping its nose.
const TILT_MAX = 0.18; // ~10° max, reached at full accel/decel
const TILT_LERP = 3.0;

// Drive tuning — floatier than the ground version. Slower accel + less
// grippy turns to sell the "no wheels, gliding on jets" feel.
const BASE_SPEED = 5.0;
const BOOST_SPEED = 9.5;
const REVERSE_MULT = 0.5;
const ACCEL_LAMBDA = 1.5; // was 2.6 — smoother throttle response
const TURN_RATE_LOW = 1.05; // was 1.5 — less snappy at low speed
const TURN_RATE_HIGH = 0.42; // was 0.55 — wider arc at cap

// Chase camera when driving. Slightly higher than the ground version
// so we can see the thruster glow under the truck.
const CAM_LOCAL_Y = 3.6;
const CAM_LOCAL_BACK = 8.8;
const CAM_LOOK_AHEAD = 1.2;
const CAM_LOOK_UP = 1.4;
const CAM_LERP = 6;

// Thruster VFX
// Blue-flame radial gradient sprite. Painted once as a canvas texture
// to avoid shipping a texture file for what's essentially two lerped
// color stops. Additive blend + toneMapped:false lets Bloom amplify
// the core into a real thruster glow.
function makeThrusterTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, "rgba(230, 255, 255, 1)");
  g.addColorStop(0.12, "rgba(150, 235, 255, 0.95)");
  g.addColorStop(0.32, "rgba(77, 214, 255, 0.7)");
  g.addColorStop(0.55, "rgba(0, 68, 255, 0.28)");
  g.addColorStop(1.0, "rgba(0, 30, 120, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// Four thruster positions in the truck's LOCAL frame (post-scale is
// applied at the truck's inner group, but the thrusters live on the
// outer, unscaled group so these numbers are directly in world units
// once the group is placed). One under each corner where a wheel-well
// used to be.
const THRUSTER_POSITIONS: [number, number, number][] = [
  [-0.9, -0.55, -2.4], // front-left
  [0.9, -0.55, -2.4],  // front-right
  [-0.9, -0.55, 2.4],  // rear-left
  [0.9, -0.55, 2.4],   // rear-right
];
const THRUSTER_IDLE_SCALE = 1.35;
const THRUSTER_ACTIVE_SCALE = 3.2;
const THRUSTER_IDLE_ALPHA = 0.55;
const THRUSTER_ACTIVE_ALPHA = 0.95;

export function Cybertruck() {
  const gltf = useGLTF(CYBERTRUCK_URL);
  const groupRef = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);
  const thrusterRefs = useRef<Array<THREE.Sprite | null>>([]);
  const { camera } = useThree();

  // Live truck state
  const pos = useRef(
    new THREE.Vector3(CYBERTRUCK_START_X, 0, CYBERTRUCK_START_Z),
  );
  const heading = useRef(CYBERTRUCK_START_ROT_Y);
  const speed = useRef(0);
  const prevSpeed = useRef(0);
  const pitch = useRef(0); // eased local-X rotation for accel/decel dip
  const camPos = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());
  const camInit = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const thrusterTex = useMemo(() => makeThrusterTexture(), []);

  // Model prep: shadows, per-axis fit-to-target scale, hide the wheel
  // + trim-cylinder nodes for the hover conversion.
  const modelInfo = useMemo(() => {
    const scene = gltf.scene.clone(true);
    // GLB's nose points at world -Z at heading = 0; drive controller
    // pushes +Z at heading = 0. Flip so W drives the nose forward.
    scene.rotation.y = Math.PI;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return;
      }
      // Hide wheel nodes (Sphere.001..004) AND the trim/exhaust
      // cylinders — Frank wants a fully wheel-less hover chassis.
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

  // Ground offset: measure how far the model's bounding box extends
  // below the group origin (after scale, with wheels hidden it's just
  // the body). Used with HOVER_HEIGHT to place the chassis a fixed
  // distance above the sampled terrain.
  const groundOffset = useRef(0);
  useEffect(() => {
    const t = tiltRef.current;
    if (!t) return;
    t.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(t);
    // t.position.y is 0 here; box.min.y is the model's world Y-min
    // with the group at origin. -box.min.y is what we need to add to
    // pos.y so the chassis bottom lands at world Y = pos.y.
    groundOffset.current = -box.min.y;
  }, [modelInfo]);

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
      // Coast to stop when parked / not driving.
      speed.current = THREE.MathUtils.damp(
        speed.current,
        0,
        ACCEL_LAMBDA * 1.6,
        dt,
      );
    }

    // Advance position along heading (no wheel spin — this is a hover).
    if (Math.abs(speed.current) > 0.001) {
      const dx = Math.sin(heading.current) * speed.current * dt;
      const dz = Math.cos(heading.current) * speed.current * dt;
      pos.current.x += dx;
      pos.current.z += dz;
    }

    // Hover: chassis bottom sits HOVER_HEIGHT above sampled terrain,
    // with a subtle sin bob so the truck reads as "not stationary" when
    // idle. Terrain sampled every frame so the truck follows crater
    // rims and ridges without ever touching down.
    const groundY = sampleTerrainHeight(pos.current.x, pos.current.z);
    const time = state.clock.elapsedTime;
    const bob = Math.sin((time / BOB_PERIOD) * Math.PI * 2) * BOB_AMP;
    pos.current.y = groundY + HOVER_HEIGHT + groundOffset.current + bob;

    // Pitch tilt: dv/dt drives a small local-X rotation on the tilt
    // group. Accelerating (dv > 0) rotates negative → nose up. Braking
    // rotates positive → nose down. Eased with damp so it doesn't
    // snap.
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

    // Write transform on the outer group
    g.position.copy(pos.current);
    g.rotation.y = heading.current;

    vehicleState.x = pos.current.x;
    vehicleState.z = pos.current.z;
    vehicleState.heading = heading.current;

    // Thruster animation: scale + opacity ramp with speed magnitude,
    // per-sprite noise flicker so each thruster shimmers independently.
    const speedFrac = Math.min(Math.abs(speed.current) / BOOST_SPEED, 1);
    for (let i = 0; i < thrusterRefs.current.length; i++) {
      const s = thrusterRefs.current[i];
      if (!s) continue;
      const flick1 = 0.85 + 0.15 * Math.sin(time * 17 + i * 2.31);
      const flick2 = 0.9 + 0.1 * Math.sin(time * 29 + i * 1.73);
      const scale =
        THREE.MathUtils.lerp(
          THRUSTER_IDLE_SCALE,
          THRUSTER_ACTIVE_SCALE,
          speedFrac,
        ) * flick1;
      s.scale.set(scale, scale, 1);
      const alpha =
        THREE.MathUtils.lerp(
          THRUSTER_IDLE_ALPHA,
          THRUSTER_ACTIVE_ALPHA,
          speedFrac,
        ) * flick2;
      (s.material as THREE.SpriteMaterial).opacity = alpha;
    }

    // Chase camera while driving.
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
      camPos.current.x = THREE.MathUtils.damp(
        camPos.current.x,
        tmp.x,
        CAM_LERP,
        dt,
      );
      camPos.current.y = THREE.MathUtils.damp(
        camPos.current.y,
        tmp.y,
        CAM_LERP,
        dt,
      );
      camPos.current.z = THREE.MathUtils.damp(
        camPos.current.z,
        tmp.z,
        CAM_LERP,
        dt,
      );

      const aheadX = pos.current.x + sinH * CAM_LOOK_AHEAD;
      const aheadZ = pos.current.z + cosH * CAM_LOOK_AHEAD;
      camTarget.current.x = THREE.MathUtils.damp(
        camTarget.current.x,
        aheadX,
        CAM_LERP,
        dt,
      );
      camTarget.current.y = THREE.MathUtils.damp(
        camTarget.current.y,
        pos.current.y + CAM_LOOK_UP,
        CAM_LERP,
        dt,
      );
      camTarget.current.z = THREE.MathUtils.damp(
        camTarget.current.z,
        aheadZ,
        CAM_LERP,
        dt,
      );

      camera.position.copy(camPos.current);
      camera.lookAt(camTarget.current);
    } else {
      camInit.current = false;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Tilt group carries the pitch (accel/decel dip). Model scale
          lives on an inner group so the sprite thrusters below stay in
          unscaled world units. */}
      <group ref={tiltRef}>
        <group scale={modelInfo.scale}>
          <primitive object={modelInfo.scene} />
        </group>
      </group>
      {THRUSTER_POSITIONS.map((p, i) => (
        <sprite
          key={i}
          position={p}
          ref={(el) => {
            thrusterRefs.current[i] = el;
          }}
        >
          <spriteMaterial
            map={thrusterTex}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}
