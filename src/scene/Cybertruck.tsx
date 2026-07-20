"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { sampleMeshHeight, sampleSlope } from "@/lib/terrain";
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
const _tiltMatrix = new THREE.Matrix4();
const _tiltedBounds = new THREE.Box3();

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
// Chassis bottom rides this many world units above the MAX terrain
// height sampled under the truck's footprint (center + 4 wheel
// contact points). Sampling the max — not just the center — prevents
// the "sometimes touches ground" pattern: on rolling terrain a ridge
// under a rear wheel would poke up through the chassis while the
// center sampled clear.
// 0.9 keeps the hover visibly clear while sitting lower.
// The exact wheel coordinates below are also used for terrain
// sampling, so the clearance follows the truck's real footprint.
const HOVER_HEIGHT = 0.9;
// Bob amp 0.15 -> 0.06 per Frank's ask — the up/down range was too
// big and made the parked truck read as bobbing on rough water
// instead of just breathing in place. Period unchanged so the rhythm
// still feels the same, just a smaller vertical excursion.
const BOB_AMP = 0.06;
const BOB_PERIOD = 1.5;
// Keep the truck flames compact around their wheel-well emitters.
// Longer trails projected far away from the truck at low camera
// angles and looked like four misplaced flames on the terrain.
const JET_STRETCH_Y = 1.0;

// Drive tuning — floatier than the ground version.
const BASE_SPEED = 5.0;
const BOOST_SPEED = 9.5;
const REVERSE_MULT = 0.5;
const ACCEL_LAMBDA = 1.5;
const TURN_RATE_LOW = 1.05;
const TURN_RATE_HIGH = 0.42;

// Chase camera when driving: user-controllable orbit around the truck.
// Mouse drag → yaw + pitch; scroll wheel → zoom distance. Yaw is stored
// as an OFFSET from the truck's heading so the camera stays behind the
// truck by default while the truck turns. Press C to snap the orbit
// back to defaults.
const CAM_DEFAULT_YAW_OFFSET = 0; // radians, 0 = directly behind
const CAM_DEFAULT_PITCH = 0.38;
const CAM_DEFAULT_DIST = 9.5;
const CAM_PITCH_MIN = -0.35;
const CAM_PITCH_MAX = 1.15;
const CAM_DIST_MIN = 4;
const CAM_DIST_MAX = 20;
const CAM_LOOK_AHEAD = 1.2;
const CAM_LOOK_UP = 1.4;
const CAM_LERP = 6;
// Camera-floor clearance above the terrain — never let the free-look
// camera sink into the mesh even at low pitches.
const CAM_FLOOR_LIFT = 0.6;

// Jet layout — one HoverJet at each of the four ORIGINAL wheel-node
// positions from the GLB (Sphere.001..004). We snapshot the wheel
// world positions during model prep, before hiding the wheel nodes,
// then multiply all three axes by the chassis scale to get the
// corresponding positions in chassisRef's local frame.
// This guarantees the flames appear exactly where the tires used to
// be, including vertically inside the open wheel wells.

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
  // Free-orbit chase-cam state (driving only). Yaw is an OFFSET from
  // the truck's heading so the camera follows the truck's turns by
  // default. Pitch and dist are absolute.
  const orbitYawOffset = useRef(CAM_DEFAULT_YAW_OFFSET);
  const orbitPitch = useRef(CAM_DEFAULT_PITCH);
  const orbitDist = useRef(CAM_DEFAULT_DIST);
  const dragging = useRef(false);
  // Visible chassis bounds in chassisRef-local space. Keeping these
  // local makes the clearance measurement independent of whichever
  // position/tilt happened to be active when the effect ran.
  const chassisBounds = useRef(new THREE.Box3());

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
      // Wheel groups (not the mesh primitives inside them) —
      // Sphere.001..004 are direct children of RootNode. Use each
      // wheel's visible geometry center rather than its authored pivot;
      // the pivots are slightly off-center in this GLB.
      if (o.name.startsWith("Sphere")) {
        const wp = new THREE.Vector3();
        new THREE.Box3().setFromObject(o).getCenter(wp);
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
        jetPositions: [] as [number, number, number][],
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
    // frame by multiplying each axis by the matching chassis scale.
    // Preserve the GLB's wheel centers exactly. The model is not
    // centered on local X=0, so forcing symmetry around the scene
    // origin shifts the jets away from the visible wheel wells.
    // These coordinates are also the terrain-sampling footprint.
    const jetPositions: [number, number, number][] = wheelWorldPositions.map((wp) => [
      wp.x * scale[0],
      wp.y * scale[1],
      wp.z * scale[2],
    ]);
    return { scene, scale, jetPositions };
  }, [gltf.scene]);

  // Ground offset: measure how far the VISIBLE chassis body extends
  // below the chassis group origin. Bounds are converted into
  // chassis-local space so load timing, world position, and the
  // current slope tilt cannot contaminate the measurement.
  //
  // Two gotchas we defend against here (both bit us before):
  //   1. Don't measure the jet group — its stretched flame cones
  //      extend well below the chassis body and would inflate this.
  //   2. Don't include HIDDEN meshes (Sphere.*/Cylinder.* wheel and
  //      trim nodes are hidden but their geometry still counts in a
  //      naive Box3.setFromObject). The wheels extend below the
  //      chassis; if they're counted, HOVER_HEIGHT no longer means
  //      "visible sill to terrain" — the truck ends up sitting lower
  //      than the constant claims.
  const groundOffset = useRef(0);
  useEffect(() => {
    const c = chassisRef.current;
    if (!c) return;
    c.updateMatrixWorld(true);
    const scaledModel = c.children.find(
      (child) => child !== jetGroupRef.current,
    );
    if (!scaledModel) return;
    const box = new THREE.Box3();
    const tmpBox = new THREE.Box3();
    const chassisWorldInverse = c.matrixWorld.clone().invert();
    const meshToChassis = new THREE.Matrix4();
    scaledModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Skip if the mesh itself OR any ancestor up to scaledModel is
      // hidden — matches what the renderer actually draws.
      let cursor: THREE.Object3D | null = obj;
      while (cursor && cursor !== scaledModel.parent) {
        if (cursor.visible === false) return;
        cursor = cursor.parent;
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      meshToChassis.multiplyMatrices(chassisWorldInverse, mesh.matrixWorld);
      tmpBox.copy(mesh.geometry.boundingBox).applyMatrix4(meshToChassis);
      box.union(tmpBox);
    });
    if (!isFinite(box.min.y)) return;
    chassisBounds.current.copy(box);
    groundOffset.current = -box.min.y;
  }, [modelInfo]);

  // Drive-mode camera controls: mirror the astronaut's mouse-drag +
  // wheel-zoom orbit. All listeners no-op unless the truck is being
  // driven, so they don't interfere with the walking free-look. Skip
  // events whose target is UI so clicking a HUD button doesn't grab a
  // drag. Press C to reset orbit yaw/pitch/dist back to defaults.
  useEffect(() => {
    const isDriving = () => useSceneStore.getState().driving;
    const onPointerDown = (e: PointerEvent) => {
      if (!isDriving()) return;
      if (e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      if (el && el.closest("button, a, input, [data-ui]")) return;
      dragging.current = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      orbitYawOffset.current -= e.movementX * 0.005;
      orbitPitch.current = THREE.MathUtils.clamp(
        orbitPitch.current + e.movementY * 0.004,
        CAM_PITCH_MIN,
        CAM_PITCH_MAX,
      );
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!isDriving()) return;
      // deltaMode 1 (line-based, e.g. Firefox) reports ~1/33 of pixel
      // deltas — normalize before exponentiating so wheel feel matches
      // across browsers.
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      orbitDist.current = THREE.MathUtils.clamp(
        orbitDist.current * Math.exp(dy * 0.0012),
        CAM_DIST_MIN,
        CAM_DIST_MAX,
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isDriving()) return;
      if (e.key === "c" || e.key === "C") {
        orbitYawOffset.current = CAM_DEFAULT_YAW_OFFSET;
        orbitPitch.current = CAM_DEFAULT_PITCH;
        orbitDist.current = CAM_DEFAULT_DIST;
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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

    // Hover: chassis bottom sits HOVER_HEIGHT above the HIGHEST
    // terrain point under the truck's footprint (center + 4 wheel
    // contact positions). Sampling the MAX — not just the center —
    // is what prevents the "sometimes touches ground" bug: on
    // rolling terrain a ridge under a rear wheel could poke up
    // through the chassis while the center point was still clear.
    // sampleMeshHeight (exact triangle-interp of the displaced
    // plane) not sampleTerrainHeight, so we match the visible
    // surface pixel-for-pixel. Sampled every frame at current
    // pos.x/z after collision resolution — no caching, no lag.
    const cHd = Math.cos(heading.current);
    const sHd = Math.sin(heading.current);
    let groundY = sampleMeshHeight(pos.current.x, pos.current.z);
    for (const [jx, , jz] of modelInfo.jetPositions) {
      const wx = pos.current.x + jx * cHd + jz * sHd;
      const wz = pos.current.z - jx * sHd + jz * cHd;
      const y = sampleMeshHeight(wx, wz);
      if (y > groundY) groundY = y;
    }
    const time = state.clock.elapsedTime;
    const bob = Math.sin((time / BOB_PERIOD) * Math.PI * 2) * BOB_AMP;

    // Sample slope at each of the 4 wheel contact points in world
    // space, average the resulting surface normals. Single-center
    // sampling snaps hard whenever the truck straddles a crater rim;
    // the 4-point average low-passes that.
    const cosHd = Math.cos(heading.current);
    const sinHd = Math.sin(heading.current);
    let nX = 0;
    let nY = 0;
    let nZ = 0;
    for (const [jx, , jz] of modelInfo.jetPositions) {
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

    // Tilting around the chassis origin can swing a front/rear corner
    // lower than the unrotated sill. Recompute the visible bounds for
    // the current tilt and compensate by exactly that extra drop.
    // This keeps HOVER_HEIGHT stable even on crater rims and slopes.
    let tiltAwareGroundOffset = groundOffset.current;
    if (!chassisBounds.current.isEmpty()) {
      _tiltMatrix.makeRotationFromQuaternion(c.quaternion);
      _tiltedBounds.copy(chassisBounds.current).applyMatrix4(_tiltMatrix);
      tiltAwareGroundOffset = -_tiltedBounds.min.y;
    }
    pos.current.y = groundY + HOVER_HEIGHT + tiltAwareGroundOffset + bob;

    // Outer group carries position + yaw ONLY. The chassis child gets
    // the slope-aligned tilt above. Applying position after the tilt
    // lets the clearance compensation use the final frame quaternion.
    g.position.copy(pos.current);
    g.rotation.set(0, heading.current, 0);

    vehicleState.x = pos.current.x;
    vehicleState.z = pos.current.z;
    vehicleState.heading = heading.current;

    // Drive the shared jet intensity ref — every HoverJet reads it.
    // Idle baseline so parked jets still glow, ramping with speed.
    const speedFrac = Math.min(Math.abs(speed.current) / BOOST_SPEED, 1);
    jetIntensityRef.current = THREE.MathUtils.lerp(
      JET_IDLE_INTENSITY,
      JET_MAX_INTENSITY,
      speedFrac,
    );

    if (driving) {
      // Free-orbit chase-cam: user-drag yaw/pitch/zoom around the
      // truck. Yaw is stored as an OFFSET from the truck's heading
      // so the camera follows the truck's turns by default (matches
      // the old locked chase-cam behaviour) while still letting the
      // user drag to look around. Camera lerps toward the ideal
      // spherical position each frame for smoothing.
      const yaw = heading.current + orbitYawOffset.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(orbitPitch.current);
      const desX = pos.current.x - sinY * cosP * orbitDist.current;
      const desZ = pos.current.z - cosY * cosP * orbitDist.current;
      let desY =
        pos.current.y +
        Math.sin(orbitPitch.current) * orbitDist.current +
        CAM_LOOK_UP;
      // Never sink the camera into the regolith at low pitches.
      const floorY = sampleMeshHeight(desX, desZ) + CAM_FLOOR_LIFT;
      if (desY < floorY) desY = floorY;
      tmp.set(desX, desY, desZ);
      if (!camInit.current) {
        camPos.current.copy(tmp);
        camInit.current = true;
      }
      camPos.current.x = THREE.MathUtils.damp(camPos.current.x, tmp.x, CAM_LERP, dt);
      camPos.current.y = THREE.MathUtils.damp(camPos.current.y, tmp.y, CAM_LERP, dt);
      camPos.current.z = THREE.MathUtils.damp(camPos.current.z, tmp.z, CAM_LERP, dt);

      // Look-target: slightly ahead of the truck along its heading,
      // with a small upward bias so the view reads as a chase, not a
      // top-down. Ahead direction uses the truck heading (not the
      // orbit yaw) so orbiting the camera never rotates what the
      // camera is looking at — the truck stays framed.
      const cosH = Math.cos(heading.current);
      const sinH = Math.sin(heading.current);
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
        {/* Per-emitter X/Y/Z come from the original GLB wheel nodes,
            snapshotted before the wheels were hidden, so each flame
            begins at the actual center of its former tire. */}
        <group ref={jetGroupRef}>
          {modelInfo.jetPositions.map(([x, y, z], i) => (
            <group key={i} position={[x, y, z]}>
              <HoverJet
                intensityRef={jetIntensityRef}
                stretchY={JET_STRETCH_Y}
                // Big round core ball at each emitter. Scaled 1.5x
                // proportionally with the astronaut's boot balls
                // (which bumped to 1.35) so the two entities read
                // as the same VFX family.
                coreScale={2.85}
                // Every jet gets its own pointLight — 4 of these
                // cast a wheelbase-shaped light spill on the terrain,
                // matching the astronaut-in-float's ground illumination.
                // lightScale 0.55: brighter per-light than the earlier
                // 0.3, still tuned so 4 combined ≈ 1 astronaut light
                // without washing the underside white.
                pointLight
                lightScale={0.55}
              />
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
