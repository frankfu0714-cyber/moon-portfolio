"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Astronaut, type AstronautHandle } from "./Astronaut";
import { DustPuffs, type DustPuffsHandle } from "./DustPuffs";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS, type WaypointId } from "@/lib/waypoints";
import { sampleSlope, sampleTerrainHeight } from "@/lib/terrain";

const MAX_SPEED = 1.2; // units/sec — chill vibe
const ACCEL = 4;
const DAMP = 6;
const TURN_LERP = 6;

// Terrain-following.
const FOOT_OFFSET = 0.02;
const HEIGHT_LERP = 0.15; // per-frame low-pass; kills crater-rim jitter
const MAX_PITCH = 0.17; // ~10°
const PITCH_LERP = 0.12;

// Camera constants
const CAM_HEIGHT = 3.2;
const CAM_DISTANCE = 6.5;
const CAM_LOOK_AHEAD = 1.5;
const CAM_LERP_POS = 3.5;
const CAM_LERP_TARGET = 5;

export function AstronautController() {
  const astronautRef = useRef<AstronautHandle>(null);
  const dustRef = useRef<DustPuffsHandle>(null);

  const velocity = useRef(new THREE.Vector3());
  const heading = useRef(0);
  const targetHeading = useRef(0);
  const camPos = useRef(new THREE.Vector3(0, CAM_HEIGHT, -CAM_DISTANCE));
  const camTarget = useRef(new THREE.Vector3(0, 1.4, CAM_LOOK_AHEAD));
  const tmpVec = useRef(new THREE.Vector3());
  const tmpForward = useRef(new THREE.Vector3());
  const tmpDesired = useRef(new THREE.Vector3());

  const { camera } = useThree();

  // Initialize camera position on mount.
  useEffect(() => {
    camera.position.copy(camPos.current);
    camera.lookAt(camTarget.current);
  }, [camera]);

  useFrame((_, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const astronaut = astronautRef.current?.group;
    if (!astronaut) return;

    const { walkInput, activePanel } = useSceneStore.getState();
    const inputActive = !activePanel;

    // Compute desired movement direction in world space, camera-relative.
    tmpForward.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tmpForward.current.y = 0;
    tmpForward.current.normalize();
    const right = tmpVec.current.set(
      -tmpForward.current.z,
      0,
      tmpForward.current.x,
    );

    const desired = tmpDesired.current.set(0, 0, 0);
    if (inputActive) {
      desired
        .addScaledVector(tmpForward.current, walkInput.forward)
        .addScaledVector(right, walkInput.strafe);
      if (desired.lengthSq() > 1) desired.normalize();
    }
    desired.multiplyScalar(MAX_SPEED);

    // Damped velocity toward desired.
    velocity.current.x = THREE.MathUtils.damp(
      velocity.current.x,
      desired.x,
      desired.lengthSq() > 0.0001 ? ACCEL : DAMP,
      dt,
    );
    velocity.current.z = THREE.MathUtils.damp(
      velocity.current.z,
      desired.z,
      desired.lengthSq() > 0.0001 ? ACCEL : DAMP,
      dt,
    );

    // Zero tiny velocities to avoid drift-jitter.
    if (Math.abs(velocity.current.x) < 0.005) velocity.current.x = 0;
    if (Math.abs(velocity.current.z) < 0.005) velocity.current.z = 0;

    // Apply position.
    astronaut.position.x += velocity.current.x * dt;
    astronaut.position.z += velocity.current.z * dt;

    // Sample the surface and low-pass toward it so the astronaut tracks
    // crater rims and dunes without jitter on high-frequency vertices.
    const targetY =
      sampleTerrainHeight(astronaut.position.x, astronaut.position.z) +
      FOOT_OFFSET;
    astronaut.position.y += (targetY - astronaut.position.y) * HEIGHT_LERP;

    // Report speed to the astronaut mesh for animation blending.
    const speedSq =
      velocity.current.x * velocity.current.x +
      velocity.current.z * velocity.current.z;
    astronaut.userData.speedSquared = speedSq;

    // Store moving state (batch to avoid re-renders every frame).
    const moving = speedSq > 0.02;
    if (moving !== useSceneStore.getState().moving) {
      useSceneStore.getState().setMoving(moving);
    }

    // Rotate astronaut to face heading direction.
    if (speedSq > 0.02) {
      targetHeading.current = Math.atan2(
        velocity.current.x,
        velocity.current.z,
      );
    }
    heading.current = dampAngle(
      heading.current,
      targetHeading.current,
      TURN_LERP,
      dt,
    );
    astronaut.rotation.y = heading.current;

    // Body pitch/roll — approximate slope in the local forward/right axes
    // and apply it to the tilt group (inside the heading rotation) so it
    // reads as terrain adaptation rather than world-axis wobble.
    const tilt = astronautRef.current?.tilt;
    if (tilt) {
      const { dx, dz } = sampleSlope(
        astronaut.position.x,
        astronaut.position.z,
        0.5,
      );
      const forwardWorldX = Math.sin(heading.current);
      const forwardWorldZ = Math.cos(heading.current);
      const slopeForward = dx * forwardWorldX + dz * forwardWorldZ;
      const slopeRight = dx * forwardWorldZ - dz * forwardWorldX;
      const targetPitch = THREE.MathUtils.clamp(-slopeForward, -MAX_PITCH, MAX_PITCH);
      const targetRoll = THREE.MathUtils.clamp(-slopeRight * 0.5, -MAX_PITCH, MAX_PITCH);
      tilt.rotation.x += (targetPitch - tilt.rotation.x) * PITCH_LERP;
      tilt.rotation.z += (targetRoll - tilt.rotation.z) * PITCH_LERP;
    }

    // Proximity check for waypoints.
    let nearest: WaypointId | null = null;
    for (const w of WAYPOINTS) {
      const dx = astronaut.position.x - w.position[0];
      const dz = astronaut.position.z - w.position[2];
      if (dx * dx + dz * dz < w.proximityRadius * w.proximityRadius) {
        nearest = w.id;
        break;
      }
    }
    if (nearest !== useSceneStore.getState().nearWaypoint) {
      useSceneStore.getState().setNearWaypoint(nearest);
    }

    // Third-person follow camera (behind current heading).
    const behindX = astronaut.position.x - Math.sin(heading.current) * CAM_DISTANCE;
    const behindZ = astronaut.position.z - Math.cos(heading.current) * CAM_DISTANCE;
    camPos.current.x = THREE.MathUtils.damp(
      camPos.current.x,
      behindX,
      CAM_LERP_POS,
      dt,
    );
    camPos.current.z = THREE.MathUtils.damp(
      camPos.current.z,
      behindZ,
      CAM_LERP_POS,
      dt,
    );
    camPos.current.y = THREE.MathUtils.damp(
      camPos.current.y,
      CAM_HEIGHT + astronaut.position.y,
      CAM_LERP_POS,
      dt,
    );

    const aheadX =
      astronaut.position.x + Math.sin(heading.current) * CAM_LOOK_AHEAD;
    const aheadZ =
      astronaut.position.z + Math.cos(heading.current) * CAM_LOOK_AHEAD;
    camTarget.current.x = THREE.MathUtils.damp(
      camTarget.current.x,
      aheadX,
      CAM_LERP_TARGET,
      dt,
    );
    camTarget.current.z = THREE.MathUtils.damp(
      camTarget.current.z,
      aheadZ,
      CAM_LERP_TARGET,
      dt,
    );
    camTarget.current.y = THREE.MathUtils.damp(
      camTarget.current.y,
      1.4 + astronaut.position.y,
      CAM_LERP_TARGET,
      dt,
    );

    camera.position.copy(camPos.current);
    camera.lookAt(camTarget.current);
  });

  const handleFootstep = (pos: THREE.Vector3) => {
    dustRef.current?.puff(pos.x, pos.y - FOOT_OFFSET, pos.z);
  };

  return (
    <>
      <Astronaut ref={astronautRef} onFootstep={handleFootstep} />
      <DustPuffs ref={dustRef} />
    </>
  );
}

// Damp an angle across the -PI/+PI wrap-around.
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const eased = THREE.MathUtils.damp(0, delta, lambda, dt);
  return current + eased;
}
