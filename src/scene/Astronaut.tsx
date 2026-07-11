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
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

const MODEL_URL = "/models/astronaut.glb";
// Rig is standard Mixamo. Note: GLTFLoader strips the ':' from names,
// so `mixamorig:Hips` in the GLB is exposed as `mixamorigHips`.
const BONE = {
  hips: "mixamorigHips",
  spine: "mixamorigSpine",
  head: "mixamorigHead",
  leftUpLeg: "mixamorigLeftUpLeg",
  rightUpLeg: "mixamorigRightUpLeg",
  leftArm: "mixamorigLeftArm",
  rightArm: "mixamorigRightArm",
} as const;

const MODEL_SCALE = 1.0;

// Rig ships in T-pose. Fold arms toward the body (A-pose baseline) each frame
// so the character never sits with arms horizontal. Positive = arm swings down
// along body in the local shoulder frame.
const ARM_DOWN_ANGLE = 1.2;

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
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
  }));

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

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
    // Arms: hold A-pose baseline on Z, layer walk swing on X.
    if (bones.leftArm) {
      bones.leftArm.rotation.x = rest.leftArm.x - armSwing;
      bones.leftArm.rotation.z = rest.leftArm.z + ARM_DOWN_ANGLE;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.x = rest.rightArm.x + armSwing;
      bones.rightArm.rotation.z = rest.rightArm.z - ARM_DOWN_ANGLE;
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
    if (walkAmount > 0.15 && onFootstep) {
      const currentStep = Math.floor(walkPhase.current / Math.PI);
      if (currentStep !== lastFootstepStep.current) {
        lastFootstepStep.current = currentStep;
        const side = currentStep % 2 === 0 ? 1 : -1;
        stepPos.current.set(
          g.position.x + Math.cos(g.rotation.y) * side * 0.18,
          0,
          g.position.z - Math.sin(g.rotation.y) * side * 0.18,
        );
        onFootstep(stepPos.current);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} scale={MODEL_SCALE} />
    </group>
  );
});
