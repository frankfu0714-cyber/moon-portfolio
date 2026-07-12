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

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const lastFootstepStep = useRef(0);
  const stepPos = useRef(new THREE.Vector3());

  const { scene } = useGLTF(MODEL_URL);

  const bones = useMemo(() => {
    const find = (name: string) =>
      (scene.getObjectByName(name) as THREE.Object3D | undefined) ?? null;
    return {
      hips: find(BONE.hips),
      spine: find(BONE.spine),
      head: find(BONE.head),
      leftUpLeg: find(BONE.leftUpLeg),
      rightUpLeg: find(BONE.rightUpLeg),
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
      leftArm: snap(bones.leftArm),
      rightArm: snap(bones.rightArm),
      leftForeArm: snap(bones.leftForeArm),
      rightForeArm: snap(bones.rightForeArm),
    };
  }, [bones]);

  useEffect(() => {
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
    const walkAmount = Math.min(speed / 1.2, 1);
    const cycleSpeed = walkAmount * Math.PI * 2 * 1.8;
    walkPhase.current += cycleSpeed * delta;

    const legSwing = Math.sin(walkPhase.current) * 0.75 * walkAmount;
    const armSwing = Math.sin(walkPhase.current) * 0.55 * walkAmount;
    const doubleBob = Math.abs(Math.sin(walkPhase.current)) * walkAmount;

    if (bones.leftUpLeg) {
      bones.leftUpLeg.rotation.x = rest.leftUpLeg.x + legSwing;
    }
    if (bones.rightUpLeg) {
      bones.rightUpLeg.rotation.x = rest.rightUpLeg.x - legSwing;
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
      bones.spine.rotation.x =
        rest.spine.x + Math.sin(walkPhase.current * 2) * 0.05 * walkAmount;
    }
    if (bones.head) {
      bones.head.rotation.x =
        rest.head.x - Math.sin(walkPhase.current * 2) * 0.03 * walkAmount;
    }

    // Root bob + idle breathing on the hips (~2cm sway).
    if (bones.hips) {
      const idleT = performance.now() * 0.001;
      const idleWobble =
        walkAmount < 0.1 ? Math.sin(idleT * 1.6) * 0.02 : 0;
      const walkBob = doubleBob * 0.04;
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
