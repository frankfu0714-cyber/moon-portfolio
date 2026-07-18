"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Astronaut, type AstronautHandle } from "./Astronaut";
import { DustPuffs, type DustPuffsHandle } from "./DustPuffs";
import { SafeAsset } from "./SafeAsset";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS, type WaypointId } from "@/lib/waypoints";
import { sampleMeshHeight, sampleSlope } from "@/lib/terrain";
import { resolveRockCollision } from "@/lib/rocks";

const WALK_SPEED = 1.2; // units/sec — chill vibe
const RUN_SPEED = 2.6; // units/sec — "run slowly" jog
// How fast the speed cap slews between walk and run when Shift toggles.
// ~150ms feel: `dampAngle`-style lerp at ~6.6/s gets us to ~63% in a frame
// at that time constant. Applied via THREE.MathUtils.damp on speedCap.
const SPEED_CAP_LAMBDA = 6.6;
const ACCEL = 4;
const DAMP = 6;
const TURN_LERP = 6;

// Low-gravity hop. Real lunar g would float ~4s — this is tuned for game
// feel: ~1.2s airtime, ~0.9 units apex.
const JUMP_SPEED = 3.1;
const GRAVITY = 5.2;

// Auto-roam: the astronaut picks a random reachable point, strolls to it,
// pauses a beat, picks another. Any manual WASD input overrides for as
// long as it's held; roam resumes when the keys are released.
const ROAM_SPEED = 1.15;
const ROAM_ARRIVE_DIST = 2.2;
const ROAM_MIN_R = 12;
const ROAM_MAX_R = 85;
const ROAM_PAUSE_MIN = 1.2;
const ROAM_PAUSE_MAX = 4.5;
const ROAM_STUCK_TIME = 4; // repick target if barely moving this long

// Boot-thruster float: hover height above the sampled ground, with a slow
// bob. floatBlend eases the transition both ways.
const FLOAT_HEIGHT = 1.15;
const FLOAT_BOB_AMP = 0.09;
const FLOAT_BOB_HZ = 0.55;
const FLOAT_BLEND_LAMBDA = 3.2;
const FLOAT_SPEED = 2.1; // gliding on jets is quicker than a stroll

// Keep the astronaut on the detailed part of the terrain cap, well away
// from where the curvature drop-off gets steep.
const WALK_BOUND = 120;

// Lander footprint (must match LANDER_X/Z in Scene.tsx).
const LANDER_X = 10;
const LANDER_Z = 16;
const LANDER_RADIUS = 3.6;

// Static solid footprints (XZ circles): the lander, the two halves of the
// moon-base habitat cluster, and the rocket launch pad (kept in sync with
// MoonBase.tsx placements).
const SOLID_CIRCLES = [
  { x: LANDER_X, z: LANDER_Z, r: LANDER_RADIUS },
  // Station habitat modules (narrow strips of small circles along each
  // cylinder instead of two huge discs, so the ground nearby is walkable).
  { x: -34.04, z: 22.21, r: 2.0 },
  { x: -32.28, z: 21.25, r: 2.0 },
  { x: -30.53, z: 20.29, r: 2.0 },
  { x: -28.52, z: 20.21, r: 1.8 },
  { x: -27.11, z: 19.45, r: 1.8 },
  { x: -25.71, z: 18.68, r: 1.8 },
  // Vertical airlock tank.
  { x: -22.79, z: 19.02, r: 1.5 },
  { x: 34, z: -20, r: 6.8 },
];

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
// When running, damping constants shrink so the camera lags further
// behind the astronaut — reads as momentum rather than jerk.
const CAM_LERP_POS_RUN = 2.2;
const CAM_LERP_TARGET_RUN = 3.4;

export function AstronautController() {
  const astronautRef = useRef<AstronautHandle>(null);
  const dustRef = useRef<DustPuffsHandle>(null);

  const velocity = useRef(new THREE.Vector3());
  const heading = useRef(0);
  const targetHeading = useRef(0);
  const idleDustTimer = useRef(0);
  const vy = useRef(0);
  const airborne = useRef(false);
  const speedCap = useRef(WALK_SPEED);
  const runBlend = useRef(0); // 0 = walk, 1 = run — smooths camera + anim
  const camPos = useRef(new THREE.Vector3(0, CAM_HEIGHT, -CAM_DISTANCE));
  const camTarget = useRef(new THREE.Vector3(0, 1.4, CAM_LOOK_AHEAD));
  // Free-look orbit state: the camera hangs off the astronaut on a
  // mouse-driven yaw/pitch instead of snapping behind the walk heading.
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0.28);
  const orbitDist = useRef(CAM_DISTANCE);
  const dragging = useRef(false);
  // Auto-roam state.
  const roamTarget = useRef<{ x: number; z: number } | null>(null);
  const roamPause = useRef(0);
  const roamStuck = useRef(0);
  // Float mode blend (0 = walking, 1 = hovering on the boot jets).
  const floatBlend = useRef(0);
  const floatTime = useRef(0);
  const tmpVec = useRef(new THREE.Vector3());
  const tmpForward = useRef(new THREE.Vector3());
  const tmpDesired = useRef(new THREE.Vector3());

  const { camera } = useThree();

  // Initialize camera position on mount.
  useEffect(() => {
    camera.position.copy(camPos.current);
    camera.lookAt(camTarget.current);
  });

  // Mouse free-look: drag to orbit, wheel to zoom. The view angle is
  // fully decoupled from the walking direction; WASD stays camera-
  // relative so movement always goes where you'd expect.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement | null;
      if (el && el.closest("button, a, input, [data-ui]")) return;
      dragging.current = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      orbitYaw.current -= e.movementX * 0.005;
      orbitPitch.current = THREE.MathUtils.clamp(
        orbitPitch.current + e.movementY * 0.004,
        -0.45,
        1.15,
      );
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      // Exponential zoom feels uniform whether close or far; deltaMode 1
      // (line-based wheels, e.g. Firefox) reports ~1/33 of pixel deltas.
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      orbitDist.current = THREE.MathUtils.clamp(
        orbitDist.current * Math.exp(dy * 0.0012),
        2.4,
        22,
      );
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  useFrame((_, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    const astronaut = astronautRef.current?.group;
    if (!astronaut) return;

    const { walkInput, activePanel, autoRoam, floatMode } =
      useSceneStore.getState();
    const inputActive = !activePanel;
    const manualActive =
      inputActive && (walkInput.forward !== 0 || walkInput.strafe !== 0);

    // Ease the float blend; floatTime drives the hover bob.
    floatBlend.current = THREE.MathUtils.damp(
      floatBlend.current,
      floatMode ? 1 : 0,
      FLOAT_BLEND_LAMBDA,
      dt,
    );
    floatTime.current += dt;

    // Slew the speed cap (and runBlend) toward the target so entering/
    // exiting run doesn't snap the velocity or the animation amplitude.
    // ~150ms transition matches SPEED_CAP_LAMBDA.
    const wantsRun = inputActive && walkInput.running;
    const baseCap = wantsRun ? RUN_SPEED : WALK_SPEED;
    // Hovering glides a touch faster than a stroll.
    const targetCap = THREE.MathUtils.lerp(
      baseCap,
      Math.max(baseCap, FLOAT_SPEED),
      floatBlend.current,
    );
    speedCap.current = THREE.MathUtils.damp(
      speedCap.current,
      targetCap,
      SPEED_CAP_LAMBDA,
      dt,
    );
    runBlend.current = THREE.MathUtils.damp(
      runBlend.current,
      wantsRun ? 1 : 0,
      SPEED_CAP_LAMBDA,
      dt,
    );

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
    if (manualActive) {
      desired
        .addScaledVector(tmpForward.current, walkInput.forward)
        .addScaledVector(right, walkInput.strafe);
      if (desired.lengthSq() > 1) desired.normalize();
      desired.multiplyScalar(speedCap.current);
    } else if (autoRoam && inputActive) {
      // Wander: head for the current target, pausing between legs.
      if (roamPause.current > 0) {
        roamPause.current -= dt;
      } else {
        if (!roamTarget.current) roamTarget.current = pickRoamTarget(astronaut.position);
        const t = roamTarget.current;
        const dx = t.x - astronaut.position.x;
        const dz = t.z - astronaut.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ROAM_ARRIVE_DIST) {
          roamTarget.current = null;
          roamPause.current =
            ROAM_PAUSE_MIN + Math.random() * (ROAM_PAUSE_MAX - ROAM_PAUSE_MIN);
        } else {
          const roamCap = Math.max(
            ROAM_SPEED,
            ROAM_SPEED * (1 + floatBlend.current),
          );
          desired.set(dx / dist, 0, dz / dist).multiplyScalar(roamCap);
          // If something (rock, module) keeps us pinned, give up on this
          // target and pick a fresh one.
          const speedNow = Math.hypot(velocity.current.x, velocity.current.z);
          if (speedNow < 0.25) {
            roamStuck.current += dt;
            if (roamStuck.current > ROAM_STUCK_TIME) {
              roamStuck.current = 0;
              roamTarget.current = null;
            }
          } else {
            roamStuck.current = 0;
          }
        }
      }
    }

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

    // Rocks are solid: circle-vs-circle push-out in the XZ plane. Because
    // only the penetrating component is removed, walking at a rock on an
    // angle slides you along its flank instead of stopping you dead.
    resolveRockCollision(astronaut.position);

    // The lander, moon-base modules and rocket pad are solid too — same
    // circle push-out as the rocks.
    for (const sc of SOLID_CIRCLES) {
      const ldx = astronaut.position.x - sc.x;
      const ldz = astronaut.position.z - sc.z;
      const ld = Math.hypot(ldx, ldz);
      if (ld < sc.r && ld > 1e-5) {
        const push = (sc.r - ld) / ld;
        astronaut.position.x += ldx * push;
        astronaut.position.z += ldz * push;
      }
    }

    // Soft world boundary — beyond this the curvature falls away fast.
    {
      const distO = Math.hypot(astronaut.position.x, astronaut.position.z);
      if (distO > WALK_BOUND) {
        const s = WALK_BOUND / distO;
        astronaut.position.x *= s;
        astronaut.position.z *= s;
      }
    }

    // Ground the boots on the *rendered* surface: sampleMeshHeight walks
    // the exact triangle of the displaced PlaneGeometry under the
    // astronaut, so the feet match the pixels the player sees -- no
    // sinking on steep crater walls, no hovering next to ridges (the old
    // footprint-max hack floated the feet wherever a neighbouring sample
    // caught higher ground).
    const px = astronaut.position.x;
    const pz = astronaut.position.z;
    const groundY = sampleMeshHeight(px, pz);
    const hoverLift =
      floatBlend.current *
      (FLOAT_HEIGHT +
        Math.sin(floatTime.current * Math.PI * 2 * FLOAT_BOB_HZ) * FLOAT_BOB_AMP);
    const targetY = groundY + FOOT_OFFSET + hoverLift;
    const floating = floatBlend.current > 0.5;

    // Low-gravity jump: Space launches, a simple ballistic arc brings the
    // astronaut back to the sampled terrain height. (Disabled while the
    // boot jets carry the astronaut.)
    if (!airborne.current && inputActive && walkInput.jumping && !floating) {
      airborne.current = true;
      vy.current = JUMP_SPEED;
      astronaut.position.y = Math.max(astronaut.position.y, targetY);
      dustRef.current?.puff(
        astronaut.position.x,
        targetY - FOOT_OFFSET,
        astronaut.position.z,
      );
    }
    if (airborne.current) {
      vy.current -= GRAVITY * dt;
      astronaut.position.y += vy.current * dt;
      if (vy.current <= 0 && astronaut.position.y <= targetY) {
        astronaut.position.y = targetY;
        airborne.current = false;
        const impact = 1 + Math.min(-vy.current * 0.3, 1.2);
        dustRef.current?.landing(
          astronaut.position.x,
          targetY - FOOT_OFFSET,
          astronaut.position.z,
          impact,
        );
        vy.current = 0;
      }
    } else {
      astronaut.position.y += (targetY - astronaut.position.y) * HEIGHT_LERP;
    }
    if (airborne.current && floating) {
      // Thrusters ignited mid-jump — the jets take over the descent.
      airborne.current = false;
      vy.current = 0;
    }
    astronaut.userData.airborne = airborne.current;
    astronaut.userData.floatBlend = floatBlend.current;

    // Report speed to the astronaut mesh for animation blending.
    const speedSq =
      velocity.current.x * velocity.current.x +
      velocity.current.z * velocity.current.z;
    astronaut.userData.speedSquared = speedSq;
    // Pass the run envelope so the walk cycle can pump faster / bigger.
    astronaut.userData.runBlend = runBlend.current;

    // Thruster wash: while hovering, the jets kick a light dust ring off
    // the ground below.
    if (floating) {
      idleDustTimer.current += dt;
      if (idleDustTimer.current > 0.22) {
        idleDustTimer.current = 0;
        dustRef.current?.ambient(
          astronaut.position.x + (Math.random() - 0.5) * 0.5,
          groundY,
          astronaut.position.z + (Math.random() - 0.5) * 0.5,
        );
      }
    } else
    // Idle ambient dust — subtle single particle every ~0.9s when stationary.
    if (speedSq < 0.02) {
      idleDustTimer.current += dt;
      if (idleDustTimer.current > 0.9) {
        idleDustTimer.current = 0;
        dustRef.current?.ambient(
          astronaut.position.x,
          astronaut.position.y - FOOT_OFFSET,
          astronaut.position.z,
        );
      }
    } else {
      idleDustTimer.current = 0;
    }

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

    // Free-look orbit camera around the astronaut's chest. Mouse drag
    // sets yaw/pitch, wheel sets distance; damping keeps it buttery and
    // lags a touch more during a run so it reads as momentum.
    const camLerpPos = THREE.MathUtils.lerp(
      CAM_LERP_POS,
      CAM_LERP_POS_RUN,
      runBlend.current,
    );
    const camLerpTarget = THREE.MathUtils.lerp(
      CAM_LERP_TARGET,
      CAM_LERP_TARGET_RUN,
      runBlend.current,
    );
    const pivotX = astronaut.position.x;
    const pivotY = astronaut.position.y + 1.4;
    const pivotZ = astronaut.position.z;
    const cosP = Math.cos(orbitPitch.current);
    const desX = pivotX - Math.sin(orbitYaw.current) * cosP * orbitDist.current;
    const desZ = pivotZ - Math.cos(orbitYaw.current) * cosP * orbitDist.current;
    let desY = pivotY + Math.sin(orbitPitch.current) * orbitDist.current;
    // Never sink the camera into the regolith.
    const floorY = sampleMeshHeight(desX, desZ) + 0.5;
    if (desY < floorY) desY = floorY;

    camPos.current.x = THREE.MathUtils.damp(camPos.current.x, desX, camLerpPos, dt);
    camPos.current.z = THREE.MathUtils.damp(camPos.current.z, desZ, camLerpPos, dt);
    camPos.current.y = THREE.MathUtils.damp(camPos.current.y, desY, camLerpPos, dt);

    camTarget.current.x = THREE.MathUtils.damp(camTarget.current.x, pivotX, camLerpTarget, dt);
    camTarget.current.z = THREE.MathUtils.damp(camTarget.current.z, pivotZ, camLerpTarget, dt);
    camTarget.current.y = THREE.MathUtils.damp(camTarget.current.y, pivotY, camLerpTarget, dt);

    camera.position.copy(camPos.current);
    camera.lookAt(camTarget.current);
  });

  const handleFootstep = (pos: THREE.Vector3) => {
    if (airborne.current) return; // no footfalls mid-air
    if (floatBlend.current > 0.3) return; // no footfalls on thrusters
    dustRef.current?.puff(pos.x, pos.y - FOOT_OFFSET, pos.z);
  };

  return (
    <>
      {/* Wrap the rigged-GLB astronaut in SafeAsset. If the GLB fetch fails
          (Vercel SSO redirect returning HTML, CORS, 404, malformed model),
          useGLTF throws — without a boundary that error unmounts the entire
          Canvas subtree and the whole scene goes black. The controller's
          useFrame keeps running with a null ref and simply no-ops. */}
      <SafeAsset label="astronaut">
        <Astronaut ref={astronautRef} onFootstep={handleFootstep} />
      </SafeAsset>
      <DustPuffs ref={dustRef} />
    </>
  );
}

// Pick a random wander destination on the walkable cap, rejecting spots
// inside any solid footprint (lander, base modules, rocket pad).
function pickRoamTarget(from: THREE.Vector3): { x: number; z: number } {
  for (let tries = 0; tries < 12; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const r = ROAM_MIN_R + Math.random() * (ROAM_MAX_R - ROAM_MIN_R);
    const x = from.x + Math.cos(ang) * r;
    const z = from.z + Math.sin(ang) * r;
    if (Math.hypot(x, z) > WALK_BOUND * 0.9) continue;
    let blocked = false;
    for (const sc of SOLID_CIRCLES) {
      if (Math.hypot(x - sc.x, z - sc.z) < sc.r + 2) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, z };
  }
  return { x: 0, z: 0 }; // safe fallback: spawn plaza
}

// Damp an angle across the -PI/+PI wrap-around.
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const eased = THREE.MathUtils.damp(0, delta, lambda, dt);
  return current + eased;
}
