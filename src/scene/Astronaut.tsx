"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type AstronautHandle = {
  group: THREE.Group | null;
  tilt: THREE.Group | null;
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

const MODEL_URL = "/models/astronaut.glb";
// Rig is standard Mixamo. GLTFLoader strips the ':' from names, so
// `mixamorig:Hips` in the raw GLB is exposed as `mixamorigHips`.
const BONE = {
  hips: "mixamorigHips",
  spine: "mixamorigSpine",
  head: "mixamorigHead",
  leftUpLeg: "mixamorigLeftUpLeg",
  rightUpLeg: "mixamorigRightUpLeg",
  leftLeg: "mixamorigLeftLeg",
  rightLeg: "mixamorigRightLeg",
  leftFoot: "mixamorigLeftFoot",
  rightFoot: "mixamorigRightFoot",
  leftArm: "mixamorigLeftArm",
  rightArm: "mixamorigRightArm",
  leftForeArm: "mixamorigLeftForeArm",
  rightForeArm: "mixamorigRightForeArm",
} as const;

const MODEL_SCALE = 1.0;

// Fold arms from the T-pose baked into the rig down to hang at the sides.
// The GLB's arm bones have local Y running along the bone (outward in T-pose),
// so `rotation.z` pivots the arm up/down in the shoulder plane. ~1.35 rad
// (~77°) brings the arm from horizontal to nearly vertical along the torso.
const ARM_DOWN_ANGLE = 1.35;
// Small forward rotation on the arm's swing axis so the hands sit slightly in
// front of the hips instead of clipping the backpack/torso side.
const ARM_FORWARD_TWEAK = 0.08;
// Subtle elbow bend so the forearm doesn't lock straight and read robotic.
const FOREARM_BEND_ANGLE = 0.15;
// Peak knee flex during the swing phase (radians). Negative rotation.x on the
// lower-leg bone bends the knee "backward" (calf up toward butt).
const KNEE_BEND_ANGLE = 0.7;
// Fraction of knee bend that carries into the ankle so the foot doesn't drag.
const FOOT_FOLLOW = 0.3;
// How fast the walk pose fades in/out as speed crosses the moving threshold.
// Full blend in ~0.25s so idle→walk isn't a snap.
const WALK_BLEND_LERP = 8;

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const walkBlend = useRef(0);
  const lastFootstepStep = useRef(0);
  const stepPos = useRef(new THREE.Vector3());

  const { scene } = useGLTF(MODEL_URL);

  const bones = useMemo(() => {
    const find = (name: string) => {
      if (!scene) return null;
      return (scene.getObjectByName(name) as THREE.Object3D | undefined) ?? null;
    };
    return {
      hips: find(BONE.hips),
      spine: find(BONE.spine),
      head: find(BONE.head),
      leftUpLeg: find(BONE.leftUpLeg),
      rightUpLeg: find(BONE.rightUpLeg),
      leftLeg: find(BONE.leftLeg),
      rightLeg: find(BONE.rightLeg),
      leftFoot: find(BONE.leftFoot),
      rightFoot: find(BONE.rightFoot),
      leftArm: find(BONE.leftArm),
      rightArm: find(BONE.rightArm),
      leftForeArm: find(BONE.leftForeArm),
      rightForeArm: find(BONE.rightForeArm),
    };
  }, [scene]);

  const rest = useMemo(() => {
    const snap = (b: THREE.Object3D | null) => ({
      x: b?.rotation.x ?? 0,
      y: b?.rotation.y ?? 0,
      z: b?.rotation.z ?? 0,
      py: b?.position.y ?? 0,
    });
    return {
      hips: snap(bones.hips),
      spine: snap(bones.spine),
      head: snap(bones.head),
      leftUpLeg: snap(bones.leftUpLeg),
      rightUpLeg: snap(bones.rightUpLeg),
      leftLeg: snap(bones.leftLeg),
      rightLeg: snap(bones.rightLeg),
      leftFoot: snap(bones.leftFoot),
      rightFoot: snap(bones.rightFoot),
      leftArm: snap(bones.leftArm),
      rightArm: snap(bones.rightArm),
      leftForeArm: snap(bones.leftForeArm),
      rightForeArm: snap(bones.rightForeArm),
    };
  }, [bones]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    const missing = (Object.entries(bones) as Array<[string, unknown]>)
      .filter(([, b]) => !b)
      .map(([k]) => k);
    if (missing.length) {
      console.warn(
        "[Astronaut] Missing bones — walk retarget degraded:",
        missing,
      );
    }
  }, [scene, bones]);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get tilt() {
      return tiltGroup.current;
    },
  }));

  useFrame((_, deltaRaw) => {
    const g = groupRef.current;
    if (!g) return;
    const delta = Math.min(deltaRaw, 0.05);

    const speedSquared =
      (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    // Instantaneous walk envelope from speed, then smoothly lerp into the
    // persistent walkBlend so idle→walk (and walk→idle) doesn't snap. All
    // walk-cycle rotations are scaled by walkBlend, so at rest the pose is
    // exactly the bind pose (arms down, legs straight).
    const speedEnv = Math.min(speed / 1.2, 1);
    walkBlend.current +=
      (speedEnv - walkBlend.current) * Math.min(1, WALK_BLEND_LERP * delta);
    const walkAmount = walkBlend.current;
    const cycleSpeed = walkAmount * Math.PI * 2 * 1.8;
    walkPhase.current += cycleSpeed * delta;

    const phase = walkPhase.current;
    const legSwing = Math.sin(phase) * 0.75 * walkAmount;
    // Arms swing at 65% of leg amplitude, phase-locked opposite the same-side
    // leg (left-arm-with-right-leg looks natural). Left leg uses +sin(phase)
    // so left arm uses +sin(phase - PI) = -sin(phase).
    const armSwing = Math.sin(phase) * 0.75 * 0.65 * walkAmount;
    // Knee bend only fires during the leg's swing phase (foot lifted). Cap
    // at 0 so we never hyperextend the knee during the stance phase.
    const leftKneeBend =
      -Math.max(0, Math.sin(phase + Math.PI / 2)) * KNEE_BEND_ANGLE * walkAmount;
    const rightKneeBend =
      -Math.max(0, Math.sin(phase - Math.PI / 2)) * KNEE_BEND_ANGLE * walkAmount;
    const doubleBob = Math.abs(Math.sin(phase * 2)) * walkAmount;

    if (bones.leftUpLeg) {
      bones.leftUpLeg.rotation.x = rest.leftUpLeg.x + legSwing;
    }
    if (bones.rightUpLeg) {
      bones.rightUpLeg.rotation.x = rest.rightUpLeg.x - legSwing;
    }
    if (bones.leftLeg) {
      bones.leftLeg.rotation.x = rest.leftLeg.x + leftKneeBend;
    }
    if (bones.rightLeg) {
      bones.rightLeg.rotation.x = rest.rightLeg.x + rightKneeBend;
    }
    if (bones.leftFoot) {
      bones.leftFoot.rotation.x = rest.leftFoot.x + leftKneeBend * FOOT_FOLLOW;
    }
    if (bones.rightFoot) {
      bones.rightFoot.rotation.x =
        rest.rightFoot.x + rightKneeBend * FOOT_FOLLOW;
    }
    // Arms: hang at sides (rotation.z bind), layer walk swing on X on top.
    // ARM_FORWARD_TWEAK nudges the hands slightly in front of the hips so
    // they don't clip the backpack/torso side.
    if (bones.leftArm) {
      bones.leftArm.rotation.x = rest.leftArm.x + ARM_FORWARD_TWEAK - armSwing;
      bones.leftArm.rotation.z = rest.leftArm.z + ARM_DOWN_ANGLE;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.x = rest.rightArm.x + ARM_FORWARD_TWEAK + armSwing;
      bones.rightArm.rotation.z = rest.rightArm.z - ARM_DOWN_ANGLE;
    }
    // Subtle elbow bend so forearms don't lock straight.
    if (bones.leftForeArm) {
      bones.leftForeArm.rotation.z = rest.leftForeArm.z + FOREARM_BEND_ANGLE;
    }
    if (bones.rightForeArm) {
      bones.rightForeArm.rotation.z = rest.rightForeArm.z - FOREARM_BEND_ANGLE;
    }
    if (bones.spine) {
      // Side-to-side sway around Z reads as counter-rotation of the shoulders
      // vs the hips — the classic "walk shimmy". Amplitude stays subtle.
      bones.spine.rotation.z = rest.spine.z + Math.sin(phase) * 0.04 * walkAmount;
    }
    if (bones.head) {
      bones.head.rotation.x =
        rest.head.x - Math.abs(Math.sin(phase * 2)) * 0.05 * walkAmount;
    }

    // Root bob + idle breathing on the hips. During walk, subtract a
    // vertical bob so the hips dip on double-step (both feet on ground) —
    // matches doubleBob's 2× frequency naturally.
    if (bones.hips) {
      const idleT = performance.now() * 0.001;
      const idleWobble =
        walkAmount < 0.1 ? Math.sin(idleT * 1.6) * 0.02 : 0;
      const walkBob = -doubleBob * 0.05;
      bones.hips.position.y = rest.hips.py + idleWobble + walkBob;
    }
    if (bones.head && walkAmount < 0.1) {
      const idleT = performance.now() * 0.001;
      bones.head.rotation.y = rest.head.y + Math.sin(idleT * 0.6) * 0.08;
    } else if (bones.head) {
      bones.head.rotation.y = rest.head.y;
    }

    // Emit footstep at each half-cycle (walkPhase crossing multiples of PI).
    // AstronautController grounds `g.position.y` to the terrain — pass the
    // full world position so puffs settle on the surface, not at y=0.
    if (walkAmount > 0.15 && onFootstep) {
      const currentStep = Math.floor(walkPhase.current / Math.PI);
      if (currentStep !== lastFootstepStep.current) {
        lastFootstepStep.current = currentStep;
        const side = currentStep % 2 === 0 ? 1 : -1;
        stepPos.current.set(
          g.position.x + Math.cos(g.rotation.y) * side * 0.18,
          g.position.y,
          g.position.z - Math.sin(g.rotation.y) * side * 0.18,
        );
        onFootstep(stepPos.current);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={tiltGroup}>
        <primitive object={scene} scale={MODEL_SCALE} />
      </group>
    </group>
  );
});
