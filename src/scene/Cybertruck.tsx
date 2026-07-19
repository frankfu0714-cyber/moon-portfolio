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

const CYBERTRUCK_URL = "/models/cybertruck.glb";
useGLTF.preload(CYBERTRUCK_URL);

// Starting placement + rotation. Once driving, these are just the
// initial values - the truck's own state ref takes over.
export const CYBERTRUCK_START_X = -8;
export const CYBERTRUCK_START_Z = 11;
export const CYBERTRUCK_START_ROT_Y = 0.55;
export const CYBERTRUCK_COLLISION_R = 5.0;
// Enter-range: how close the astronaut has to be to see the "E · enter" hint.
export const CYBERTRUCK_INTERACT_R = 5.5;

// Live world-space state so the astronaut controller (proximity,
// collision, exit spawn) can read where the truck is right now
// without going through zustand-triggered re-renders.
export const vehicleState = {
  x: CYBERTRUCK_START_X,
  z: CYBERTRUCK_START_Z,
  heading: CYBERTRUCK_START_ROT_Y,
};

// Target world length + height. Length matches the reference photo's
// long-low stance; height matches the astronaut (see Astronaut.tsx:
// 1.80 * 0.97 ≈ 1.75 world units) so the driver appears sized to the
// vehicle. Ratio comes out ~3.83:1, close to the real 3:1 spec once
// you account for the tall canopy on this low-poly GLB.
const TARGET_LENGTH = 7.8;
const TARGET_HEIGHT = 1.75;

// Drive tuning
const BASE_SPEED = 4.5;
const BOOST_SPEED = 8.5;
const REVERSE_MULT = 0.5;
const ACCEL_LAMBDA = 2.6; // ~0.4s time-constant so we reach cap in ~0.8s
const TURN_RATE_LOW = 1.5; // rad/s when nearly stopped - tight parking
const TURN_RATE_HIGH = 0.55; // rad/s at top speed - wider highway arc
const WHEEL_WORLD_RADIUS = 0.55; // approx after scale; controls spin visual

// Chase camera when driving. Local-space offset from truck origin,
// converted to world every frame based on truck heading.
const CAM_LOCAL_Y = 3.4;
const CAM_LOCAL_BACK = 8.5;
const CAM_LOOK_AHEAD = 1.2;
const CAM_LOOK_UP = 1.4;
const CAM_LERP = 6;

export function Cybertruck() {
  const gltf = useGLTF(CYBERTRUCK_URL);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Live truck state
  const pos = useRef(
    new THREE.Vector3(CYBERTRUCK_START_X, 0, CYBERTRUCK_START_Z),
  );
  const heading = useRef(CYBERTRUCK_START_ROT_Y);
  const speed = useRef(0);
  const wheelAngle = useRef(0);
  const camPos = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());
  const camInit = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  // Model prep: shadows + fit-to-target Vector3 scale + grab wheel refs.
  // FBX2glTF gave the model unusual per-node scales, so a native
  // bounding-box measure + per-axis scaling is the reliable way to
  // both hit the target dimensions and keep the reference proportions.
  const modelInfo = useMemo(() => {
    const wheels: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      // The GLB names its wheel meshes Sphere.001..004; grab them so we
      // can spin them while driving.
      if (o.name.startsWith("Sphere")) wheels.push(o);
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const nativeLength = Math.max(size.x, size.z);
    if (!nativeLength || !Number.isFinite(nativeLength)) {
      return { scale: [1, 1, 1] as [number, number, number], wheels };
    }
    const xz = TARGET_LENGTH / nativeLength;
    const y = size.y > 1e-4 ? TARGET_HEIGHT / size.y : xz;
    return { scale: [xz, y, xz] as [number, number, number], wheels };
  }, [gltf.scene]);

  // Ground offset: after scaling, measure how far the model's bounding
  // box extends below the group origin so we can lift the group and
  // land the wheels on the sampled terrain. Sampled once post-mount
  // (scale is constant); dynamic terrain-follow reuses this offset.
  const groundOffset = useRef(0);
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    groundOffset.current = g.position.y - box.min.y;
  }, [modelInfo]);

  useFrame((_, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const g = groupRef.current;
    if (!g) return;

    const { driving, walkInput, activePanel } = useSceneStore.getState();
    const inputActive = driving && !activePanel;

    if (inputActive) {
      // Throttle: W = forward, S = reverse. Boost via shift on forward only.
      const throttle = walkInput.forward;
      const wantsBoost = walkInput.running;
      const cap = wantsBoost ? BOOST_SPEED : BASE_SPEED;
      const targetSpeed =
        throttle >= 0
          ? cap * throttle
          : BASE_SPEED * REVERSE_MULT * throttle;
      speed.current = THREE.MathUtils.damp(
        speed.current,
        targetSpeed,
        ACCEL_LAMBDA,
        dt,
      );

      // Turn rate scales with speed: tight parking-lot arc at low
      // speed, wider highway arc at top speed. Only turn when moving.
      // Reverse flips steering direction so the truck feels natural.
      const speedMag = Math.abs(speed.current);
      const speedFrac = Math.min(speedMag / BOOST_SPEED, 1);
      const turnRate = THREE.MathUtils.lerp(
        TURN_RATE_LOW,
        TURN_RATE_HIGH,
        speedFrac,
      );
      // walkInput.strafe: D = +1 = right = turn heading clockwise (negative
      // yaw increment in Three's convention). A = -1 = left.
      if (speedMag > 0.05) {
        const dir = Math.sign(speed.current);
        heading.current -= walkInput.strafe * turnRate * dt * dir;
      }
    } else {
      // Coast to stop when parked / not driving.
      speed.current = THREE.MathUtils.damp(speed.current, 0, ACCEL_LAMBDA * 2, dt);
    }

    // Advance position along heading. THREE Y-rotation: local -Z rotated
    // by heading points at (sin, 0, cos) in world coords. That's our
    // forward.
    if (Math.abs(speed.current) > 0.001) {
      const dx = Math.sin(heading.current) * speed.current * dt;
      const dz = Math.cos(heading.current) * speed.current * dt;
      pos.current.x += dx;
      pos.current.z += dz;
      wheelAngle.current += (speed.current * dt) / WHEEL_WORLD_RADIUS;
    }

    // Terrain follow every frame - so if the truck drives off the flat
    // spot into cratered ground, the wheels track the surface.
    const groundY = sampleTerrainHeight(pos.current.x, pos.current.z);
    pos.current.y = groundY + groundOffset.current;

    // Write transform
    g.position.copy(pos.current);
    g.rotation.y = heading.current;

    // Publish for external consumers (astronaut proximity, collision).
    vehicleState.x = pos.current.x;
    vehicleState.z = pos.current.z;
    vehicleState.heading = heading.current;

    // Spin the wheels. Rotating the mesh's local X isn't strictly the
    // wheel's spin axis for every FBX2glTF orientation, but the wheels
    // are radially symmetric and the visual reads as "wheels moving."
    if (modelInfo.wheels.length > 0) {
      for (const w of modelInfo.wheels) {
        w.rotation.x = wheelAngle.current;
      }
    }

    // Chase camera while driving.
    if (driving) {
      const cosH = Math.cos(heading.current);
      const sinH = Math.sin(heading.current);
      // Camera sits behind the truck: local (0, CAM_LOCAL_Y, -CAM_LOCAL_BACK).
      // Local -Z rotated by heading = (sin, 0, cos); local +Z = -that.
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

      // Look slightly ahead of the truck, and a touch above it, so we
      // frame the road not the roof.
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
      // Not driving - reset init flag so the first frame after next
      // enter snaps the chase cam cleanly to the new pose.
      camInit.current = false;
    }
  });

  return (
    <group ref={groupRef} scale={modelInfo.scale}>
      <primitive object={gltf.scene} />
    </group>
  );
}
