"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { sampleTerrainHeight, sampleSlope } from "@/lib/terrain";
import { useSceneStore } from "@/lib/store";
import { HoverJet } from "./HoverJet";

// Slope-align tuning
// How much of the world-normal alignment we blend in. 1 = truck lies
// fully flat on the slope (car-on-hillside look). 0 = never tilts,
// stays perfectly horizontal (old level-lock). 0.5 = hover-craft
// halfway suggestion: nose picks up the slope but doesn't commit to
// riding it. Frank picked this range 30-70; 0.5 reads best in preview.
const TESLA_SLOPE_BLEND = 0.5;
// Per-frame slerp factor toward the target chassis quaternion.
// 0.18 gives a soft ~0.5s ease when the truck crests a ridge without
// feeling laggy on flat ground.
const TESLA_TILT_SLERP = 0.18;
// Half-width of the finite-difference stencil sampleSlope uses. Larger
// values low-pass the slope so per-triangle terrain jitter doesn't
// snap the truck; 0.6 spans about two triangles at TERRAIN_SEGMENTS=380.
const SLOPE_SAMPLE_H = 0.6;

// Module-level scratch objects — quaternion math is called every
// frame and allocating in useFrame would churn the GC.
const _worldUp = new THREE.Vector3(0, 1, 0);
const _normalLocal = new THREE.Vector3();
const _tiltQuat = new THREE.Quaternion();
const _blendedTilt = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();

// Tesla-Cybertruck-style low-poly GLB by Mobolaji, sourced from
// Poly Pizza (CC-BY 3.0). Bundled at /public/models/cybertruck.glb.
// License CC-BY 3.0. Attribution shown in the credits pill.
// Original: https://poly.pizza/m/Jpar3f32mt (author Mobolaji).
// GLB has zero embedded textures - materials are all solid colors,
// so no trademark wordmark or Tesla logo is baked in.
//
// Hover conversion: wheels + trim cylinders hidden, chassis floats a
// fixed distance above the sampled terrain, four small blue jet
// nozzles (the shared HoverJet component — same aesthetic as the
// astronaut's FLOAT boots) glow directly under the chassis sill.

const CYBERTRUCK_URL = "/models/cybertruck.glb?v=2";
useGLTF.preload(CYBERTRUCK_URL);

export const CYBERTRUCK_START_X = -8;
export const CYBERTRUCK_START_Z = 11;
export const CYBERTRUCK_START_ROT_Y = 0.55;
// Tightened from the old 5.0 so the astronaut can approach right up
// to the chassis and the post-exit spawn actually lands next to the
// door instead of six-plus units off in space. Matches the truck's
// actual body footprint more honestly (~half-width 1.5, half-length
// 3.4; 2.8 is a reasonable circle-in-rectangle compromise).
export const CYBERTRUCK_COLLISION_R = 2.8;
export const CYBERTRUCK_INTERACT_R = 5.5;

// Live world-space state so the astronaut controller (proximity,
// collision, exit spawn) can read where the truck is right now
// without going through zustand-triggered re-renders.
export const vehicleState = {
  x: CYBERTRUCK_START_X,
  z: CYBERTRUCK_START_Z,
  heading: CYBERTRUCK_START_ROT_Y,
};

// Target world dimensions calibrated to the reference photo.
const TARGET_LENGTH = 6.8;
const TARGET_HEIGHT = 1.61;
const WIDTH_MULT = 0.75;

// Hover tuning
// Chassis bottom rides this many world units above the sampled terrain.
// 0.7 lands the sill just above astronaut-knee height (astronaut is
// 1.75 tall, so 0.7 / 1.75 = 40%) — clearly floating, with enough
// vertical space for the flame plumes to fall onto the ground
// beneath. 0.5 read as "resting on the ground"; anything above ~0.85
// pushes the sill into chest/hip territory again.
const HOVER_HEIGHT = 0.7;
// Bob amp 0.15 -> 0.06 per Frank's ask — the up/down range was too
// big and made the parked truck read as bobbing on rough water
// instead of just breathing in place. Period unchanged so the rhythm
// still feels the same, just a smaller vertical excursion.
const BOB_AMP = 0.06;
const BOB_PERIOD = 1.5;
// Vertical stretch applied to the HoverJet flame stack — cones and
// particles both elongate downward so the jets read as real thrusters
// spraying, not short blobs. Terrain occludes anything past ground
// plane, so the visible portion above ground stays bright while the
// tail cleanly fades into the regolith.
const JET_STRETCH_Y = 2.6;

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

// Jet layout — one HoverJet at each of the four ORIGINAL wheel-node
// positions from the GLB (Sphere.001..004). We snapshot the wheel
// world positions during model prep, before hiding the wheel nodes,
// then multiply by the chassis scale to get the corresponding
// positions in chassisRef's local frame. Y is ignored (jets sit at
// the chassis SILL via jetGroupRef.position.y = -groundOffset).
// This guarantees the flames appear exactly where the tires used to
// be, no manual X/Z tuning needed if we ever change proportions.

// Base intensity while parked so the truck reads as HOVERING even
// when idle (full-off jets would suggest "landed").
const JET_IDLE_INTENSITY = 0.35;
const JET_MAX_INTENSITY = 1.0;

// Collision — obstacles the truck must not clip through. Populated
// lazily inside useFrame from AstronautController's SOLID_CIRCLES so
// we avoid a circular import at module init.
type SolidCircleLike = { x: number; z: number; r: number; truck?: boolean };

export function Cybertruck() {
  const gltf = useGLTF(CYBERTRUCK_URL);
  const groupRef = useRef<THREE.Group>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const jetGroupRef = useRef<THREE.Group>(null);
  // Decals live in their own group OUTSIDE the tilted chassis — they
  // must lie flat on the terrain no matter how the chassis pitches
  // with the slope. Parented to the outer group (position + yaw only),
  // never rotated on X/Z.
  const decalGroupRef = useRef<THREE.Group>(null);
  // One ground-decal mesh per jet emitter — bright cyan disc pooled
  // on the terrain directly beneath its flame. Populated by the
  // per-jet <mesh ref={...}> callback below.
  const groundDecalsRef = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  // Live truck state
  const pos = useRef(
    new THREE.Vector3(CYBERTRUCK_START_X, 0, CYBERTRUCK_START_Z),
  );
  const heading = useRef(CYBERTRUCK_START_ROT_Y);
  const speed = useRef(0);
  const camPos = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());
  const camInit = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  // Per-jet intensity ref — HoverJet reads .current each frame. We
  // keep one shared ref (all four jets pulse together) since they're
  // all downstream of the same throttle.
  const jetIntensityRef = useRef(JET_IDLE_INTENSITY);
  // Lazy-loaded SOLID_CIRCLES reference. Populated on first frame.
  const obstaclesRef = useRef<readonly SolidCircleLike[] | null>(null);

  const modelInfo = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.rotation.y = Math.PI;
    // Two-phase traversal:
    //   pass 1: enable shadows + capture wheel-node positions BEFORE
    //           we hide them, so we know exactly where the tires
    //           originally sat.
    //   pass 2: hide wheel + trim-cylinder nodes for the hover conversion.
    scene.updateMatrixWorld(true);
    const wheelWorldPositions: THREE.Vector3[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return;
      }
      // Wheel NODES (not the mesh primitives inside them) — Sphere.001..004
      // are direct children of RootNode. Snapshot their world position
      // after scene.rotation.y = Math.PI is applied, so we get the
      // POST-FLIP positions that align with how the model actually
      // renders in the scene.
      if (o.name.startsWith("Sphere")) {
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        wheelWorldPositions.push(wp);
      }
    });
    // Second pass: hide the nodes we snapshotted so the truck reads
    // as a wheel-less hover chassis.
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) return;
      if (o.name.startsWith("Sphere") || o.name.startsWith("Cylinder")) {
        o.visible = false;
      }
    });

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const nativeLength = Math.max(size.x, size.z);
    if (!nativeLength || !Number.isFinite(nativeLength)) {
      return {
        scene,
        scale: [1, 1, 1] as [number, number, number],
        jetPositions: [] as [number, number][],
      };
    }
    const lengthScale = TARGET_LENGTH / nativeLength;
    const widthScale = lengthScale * WIDTH_MULT;
    const yScale = size.y > 1e-4 ? TARGET_HEIGHT / size.y : lengthScale;
    const lengthIsX = size.x >= size.z;
    const scale: [number, number, number] = lengthIsX
      ? [lengthScale, yScale, widthScale]
      : [widthScale, yScale, lengthScale];
    // Convert wheel world positions (in the scene's own local frame,
    // since scene has no parent at this point) into chassisRef's local
    // frame by multiplying by the chassis scale. Y is dropped — jets
    // sit at the chassis sill via jetGroupRef.position.y = -groundOffset,
    // NOT at the wheel-center Y from the model.
    const jetPositions: [number, number][] = wheelWorldPositions.map((wp) => [
      wp.x * scale[0],
      wp.z * scale[2],
    ]);
    return { scene, scale, jetPositions };
  }, [gltf.scene]);

  // Ground offset: measure how far the model's bounding box extends
  // below the chassis group origin. Used with HOVER_HEIGHT to place
  // the chassis a fixed distance above the sampled terrain.
  const groundOffset = useRef(0);
  useEffect(() => {
    const c = chassisRef.current;
    if (!c) return;
    c.updateMatrixWorld(true);
    // CRITICAL: measure ONLY the scaled-model child, NOT the whole
    // chassis group. The chassis also holds the jet group whose flame
    // cones extend well below the chassis body (up to stretchY * 0.55
    // ≈ 1.4 units past the emitter). Measuring the whole group made
    // groundOffset inflate by that amount, which then lifted the
    // entire truck by the same amount — the reason Frank kept seeing
    // the sill floating at chest/shoulder height instead of at knee.
    // We want the body-bottom-to-terrain distance to be HOVER_HEIGHT,
    // not the (body-bottom - flame-tip)-to-terrain distance.
    const scaledModel = c.children.find((child) => child !== jetGroupRef.current);
    if (!scaledModel) return;
    const box = new THREE.Box3().setFromObject(scaledModel);
    groundOffset.current = -box.min.y;
  }, [modelInfo]);

  // Load SOLID_CIRCLES lazily so we don't create a circular import at
  // module top-level (AstronautController imports vehicleState from
  // this file; this file imports SOLID_CIRCLES from that file).
  useEffect(() => {
    let cancelled = false;
    import("./AstronautController").then((mod) => {
      if (cancelled) return;
      obstaclesRef.current = mod.SOLID_CIRCLES;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFrame((state, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const g = groupRef.current;
    const c = chassisRef.current;
    if (!g || !c) return;

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

    // Advance position along heading. Resolve collisions BEFORE
    // writing to pos so the truck doesn't pop-through-and-bounce-back.
    if (Math.abs(speed.current) > 0.001) {
      const dx = Math.sin(heading.current) * speed.current * dt;
      const dz = Math.cos(heading.current) * speed.current * dt;
      let nextX = pos.current.x + dx;
      let nextZ = pos.current.z + dz;

      // 1. Perimeter fence: radial WALK_BOUND clamp (same as the
      //    astronaut). WALK_BOUND is 120 in AstronautController; we
      //    hard-code here instead of importing to avoid an extra
      //    circular dep. Truck stops at 118 to leave a small margin
      //    for the neon fence rail's visual thickness.
      const RADIAL_LIMIT = 118 - CYBERTRUCK_COLLISION_R;
      const dNext = Math.hypot(nextX, nextZ);
      if (dNext > RADIAL_LIMIT) {
        const s = RADIAL_LIMIT / dNext;
        nextX *= s;
        nextZ *= s;
        speed.current = 0; // dead stop at the fence
      }

      // 2. SOLID_CIRCLES: every static structure the astronaut also
      //    avoids (habitat modules, lander legs, neon-tower fence
      //    posts, solar sails, rocket body). Skip our own truck entry
      //    (identified via .truck).
      const obstacles = obstaclesRef.current;
      if (obstacles) {
        for (const o of obstacles) {
          if (o.truck) continue;
          const rr = o.r + CYBERTRUCK_COLLISION_R;
          const odx = nextX - o.x;
          const odz = nextZ - o.z;
          const d = Math.hypot(odx, odz);
          if (d < rr && d > 1e-4) {
            // Push the proposed position out to the collision boundary.
            const push = (rr - d) / d;
            nextX += odx * push;
            nextZ += odz * push;
            speed.current *= 0.35; // strong slow-down on hit
          }
        }
      }

      pos.current.x = nextX;
      pos.current.z = nextZ;
    }

    // Hover: chassis bottom sits HOVER_HEIGHT above sampled terrain,
    // with a subtle sin bob so the truck reads as "not stationary".
    const groundY = sampleTerrainHeight(pos.current.x, pos.current.z);
    const time = state.clock.elapsedTime;
    const bob = Math.sin((time / BOB_PERIOD) * Math.PI * 2) * BOB_AMP;
    pos.current.y = groundY + HOVER_HEIGHT + groundOffset.current + bob;

    // Outer group carries position + yaw ONLY. The chassis child gets
    // the slope-aligned tilt (below). Decal group sits alongside the
    // chassis under the outer group so decals inherit position + yaw
    // but never the tilt — they must lie flat on the terrain.
    g.position.copy(pos.current);
    g.rotation.set(0, heading.current, 0);

    vehicleState.x = pos.current.x;
    vehicleState.z = pos.current.z;
    vehicleState.heading = heading.current;

    // Repark the jet group at the chassis sill (world Y = chassis
    // bottom); in the chassis group's local frame that's Y = -groundOffset.
    if (jetGroupRef.current) {
      jetGroupRef.current.position.y = -groundOffset.current;
    }

    // Sample slope at each of the 4 wheel contact points in world
    // space, average the resulting surface normals. Single-center
    // sampling snaps hard whenever the truck straddles a crater rim;
    // the 4-point average low-passes that.
    const cosHd = Math.cos(heading.current);
    const sinHd = Math.sin(heading.current);
    let nX = 0;
    let nY = 0;
    let nZ = 0;
    for (const [jx, jz] of modelInfo.jetPositions) {
      const worldX = pos.current.x + jx * cosHd + jz * sinHd;
      const worldZ = pos.current.z - jx * sinHd + jz * cosHd;
      const { dx, dz } = sampleSlope(worldX, worldZ, SLOPE_SAMPLE_H);
      // For a heightfield y = h(x, z), the surface normal is
      // normalize(-dh/dx, 1, -dh/dz). Sum without normalizing —
      // renormalize once after the loop for the true average.
      nX += -dx;
      nY += 1;
      nZ += -dz;
    }
    const nLen = Math.hypot(nX, nY, nZ);
    if (nLen > 1e-6) {
      nX /= nLen;
      nY /= nLen;
      nZ /= nLen;
    } else {
      nX = 0;
      nY = 1;
      nZ = 0;
    }

    // Transform the world normal into chassis-local frame by
    // inverting the outer group's yaw. Inverse of rotate-around-Y-by-θ
    // maps (x, y, z) -> (x*cos - z*sin, y, x*sin + z*cos).
    _normalLocal.set(nX * cosHd - nZ * sinHd, nY, nX * sinHd + nZ * cosHd);
    // Shortest-rotation quat from local up (0,1,0) to normalLocal.
    _tiltQuat.setFromUnitVectors(_worldUp, _normalLocal);
    // Blend with identity: at 1.0 the hover truck lies flat on the
    // hillside (looks like a car); at 0 it stays perfectly level. 0.5
    // suggests the slope without committing to it — right for a
    // hover craft.
    _blendedTilt.copy(_identityQuat).slerp(_tiltQuat, TESLA_SLOPE_BLEND);
    // Slerp chassis toward the target so the tilt eases in over
    // ~0.5s instead of snapping when the wheels cross a ridge.
    c.quaternion.slerp(_blendedTilt, TESLA_TILT_SLERP);

    // Drive the shared jet intensity ref — every HoverJet reads it.
    // Idle baseline so parked jets still glow, ramping with speed.
    const speedFrac = Math.min(Math.abs(speed.current) / BOOST_SPEED, 1);
    jetIntensityRef.current = THREE.MathUtils.lerp(
      JET_IDLE_INTENSITY,
      JET_MAX_INTENSITY,
      speedFrac,
    );

    // Ground decals: 4 flat cyan circles on the terrain, one directly
    // below each jet emitter. Sample terrain PER decal so on sloped
    // ground each circle hugs its own local surface height. Decals
    // now live under decalGroupRef (a sibling of the tilted chassis)
    // so they stay flat on world horizontal no matter how the truck
    // pitches. World Y for each decal = terrain + 0.02, and the
    // decal group is parented at pos.current, so local Y is offset.
    for (let i = 0; i < modelInfo.jetPositions.length; i++) {
      const decal = groundDecalsRef.current[i];
      if (!decal) continue;
      const [jx, jz] = modelInfo.jetPositions[i];
      const worldX = pos.current.x + jx * cosHd + jz * sinHd;
      const worldZ = pos.current.z - jx * sinHd + jz * cosHd;
      const terrainY = sampleTerrainHeight(worldX, worldZ);
      decal.position.y = terrainY + 0.02 - pos.current.y;
      const mat = decal.material as THREE.MeshBasicMaterial;
      mat.opacity = jetIntensityRef.current * 0.85;
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

    // OUTER group must stay yaw-only — the tilt lives on the chassis
    // now. Force X/Z to 0 in case any code path (collision, camera
    // math) ever touches them. Chassis is intentionally NOT clamped
    // here — its X/Z carry the slope tilt. The temporary warn fires
    // only if something upstream ever tries to push a non-yaw
    // rotation onto the outer group; remove once we're confident it
    // never fires in the wild.
    const TILT_EPS = 1e-4;
    if (
      Math.abs(g.rotation.x) > TILT_EPS ||
      Math.abs(g.rotation.z) > TILT_EPS
    ) {
      console.warn("[Cybertruck] outer group non-zero rotation clamped", {
        x: g.rotation.x,
        z: g.rotation.z,
      });
    }
    g.rotation.x = 0;
    g.rotation.z = 0;
  });

  return (
    <group ref={groupRef}>
      {/* Chassis child of the outer transform — this is what tilts to
          match the terrain slope (50% blend). The chassis carries the
          scaled truck body AND the jet group so flames follow the
          tilted body naturally. Decals live OUTSIDE this tilted
          subtree so they stay flat on the terrain regardless of
          chassis pitch. */}
      <group ref={chassisRef}>
        <group scale={modelInfo.scale}>
          <primitive object={modelInfo.scene} />
        </group>
        {/* Jet group: repositioned each frame to the chassis sill
            (Y = -groundOffset) so nozzles emit from under the belly,
            not from the truck's origin (which is above sill).
            Per-emitter X/Z come from the original wheel-node
            positions in the GLB — snapshotted before the wheels
            were hidden — so flames sit exactly where the tires
            used to be. */}
        <group ref={jetGroupRef}>
          {modelInfo.jetPositions.map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <HoverJet
                intensityRef={jetIntensityRef}
                stretchY={JET_STRETCH_Y}
                // Big round core ball at the emitter (Bloom picks it
                // up as a bright cyan-blue light source). Matches the
                // astronaut boot-jet look, just larger for the truck.
                coreScale={1.9}
                // Every jet gets its own pointLight so all four
                // nozzles light the terrain equally — not just the
                // front-left. Dialed to ~0.3 of the astronaut-boot
                // brightness; four combined roughly match a single
                // bright light without white-washing the underside.
                pointLight
                lightScale={0.3}
              />
            </group>
          ))}
        </group>
      </group>
      {/* Ground-decal group: sibling of chassis, parented at the
          outer group's origin (position + yaw only, no tilt). Each
          decal lies flat on world horizontal, its Y set per frame
          from the sampled terrain height under its jet's world
          position. Kept out of the tilted chassis so a truck cresting
          a slope doesn't rotate the "shadow" pools off the ground. */}
      <group ref={decalGroupRef}>
        {modelInfo.jetPositions.map(([x, z], i) => (
          <mesh
            key={i}
            ref={(m) => {
              groundDecalsRef.current[i] = m;
            }}
            position={[x, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.95, 32]} />
            <meshBasicMaterial
              color="#7ec8ff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              fog={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
