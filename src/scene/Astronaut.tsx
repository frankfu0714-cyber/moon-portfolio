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

// Realistic white NASA astronaut ("Astronaut" by Poly by Google, CC-BY),
// served from the model-viewer shared-assets repo. raw.githubusercontent.com
// sends `access-control-allow-origin: *`, so the cross-origin fetch is safe.
// The model is a single static mesh (no rig, no animations) standing 2.01
// units tall with its feet at the origin — locomotion is procedural: a
// low-gravity hop + forward lean driven by the controller's speed.
const MODEL_URL =
  "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/Astronaut.glb";

// 2.01-unit model * 0.85 ≈ 1.7 world units tall — matches the previous
// astronaut's framing under the third-person camera.
const MODEL_SCALE = 0.85;

// Procedural locomotion tuning.
const WALK_START_SPEED = 0.15; // below this the astronaut is treated as idle
const STRIDE_LENGTH = 1.05; // world units per full hop cycle
const HOP_AMP_WALK = 0.055; // hop height at walk speed
const HOP_AMP_RUN = 0.11; // hop height at full run
const LEAN_WALK = 0.09; // forward lean (rad) while walking
const LEAN_RUN = 0.2; // forward lean at full run
const SWAY_AMP = 0.03; // lateral roll per hop
const IDLE_BREATH_AMP = 0.012; // gentle bob while standing
const IDLE_BREATH_HZ = 0.45;

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const motionGroup = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const lastHalfStep = useRef(-1);
  const lean = useRef(0);
  const stepPos = useRef(new THREE.Vector3());

  const gltf = useGLTF(MODEL_URL);

  // Fresh instance per mount (StrictMode-safe). No skeleton, so a plain
  // recursive clone is all we need.
  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      // Clone materials before touching them so the shared useGLTF cache
      // keeps its originals. Slight roughness lift reads as suit fabric.
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mesh.material = (Array.isArray(mesh.material)
        ? mats.map((m) => tuneSuit(m))
        : tuneSuit(mats[0])) as THREE.Material;
    });
  }, [clonedScene]);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get tilt() {
      return tiltGroup.current;
    },
  }));

  useFrame((state, deltaRaw) => {
    const g = groupRef.current;
    const m = motionGroup.current;
    if (!g || !m) return;
    const dt = Math.min(deltaRaw, 0.05);

    const speedSquared = (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const runBlend = (g.userData.runBlend as number | undefined) ?? 0;
    const moving = speed >= WALK_START_SPEED;

    if (moving) {
      // Advance the hop cycle in lockstep with ground speed so the feet
      // never "slide": one full cycle per STRIDE_LENGTH world units.
      phase.current += (speed / STRIDE_LENGTH) * Math.PI * 2 * dt;

      const amp = THREE.MathUtils.lerp(HOP_AMP_WALK, HOP_AMP_RUN, runBlend);
      // |sin| keeps the hop always upward — a floaty low-gravity bounce.
      m.position.y = Math.abs(Math.sin(phase.current)) * amp;
      // Lateral sway alternates with each hop.
      m.rotation.z = Math.sin(phase.current) * SWAY_AMP;

      const targetLean = THREE.MathUtils.lerp(LEAN_WALK, LEAN_RUN, runBlend);
      lean.current = THREE.MathUtils.damp(lean.current, targetLean, 6, dt);

      // Fire a footstep at each landing (every half cycle, when |sin|
      // returns to zero).
      const halfStep = Math.floor(phase.current / Math.PI);
      if (halfStep !== lastHalfStep.current) {
        lastHalfStep.current = halfStep;
        if (onFootstep) {
          const side = halfStep % 2 === 0 ? 1 : -1;
          stepPos.current.set(
            g.position.x + Math.cos(g.rotation.y) * side * 0.16,
            g.position.y,
            g.position.z - Math.sin(g.rotation.y) * side * 0.16,
          );
          onFootstep(stepPos.current);
        }
      }
    } else {
      // Idle: settle the hop, breathe gently.
      phase.current = 0;
      lastHalfStep.current = -1;
      const breath =
        Math.sin(state.clock.elapsedTime * Math.PI * 2 * IDLE_BREATH_HZ) *
        IDLE_BREATH_AMP;
      m.position.y += (Math.max(0, breath) - m.position.y) * 0.08;
      m.rotation.z += (0 - m.rotation.z) * 0.1;
      lean.current = THREE.MathUtils.damp(lean.current, 0, 4, dt);
    }

    m.rotation.x = lean.current;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={tiltGroup}>
        <group ref={motionGroup}>
          <group scale={MODEL_SCALE}>
            <primitive object={clonedScene} />
          </group>
        </group>
      </group>
    </group>
  );
});

// Clone + gently tune the GLB's baked material so the white suit catches
// the hard lunar sun without blowing out.
function tuneSuit(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial;
  const c = std.clone();
  if ("roughness" in c) {
    c.roughness = Math.min(1, (std.roughness ?? 0.8) * 1.05);
    c.metalness = Math.min(0.15, std.metalness ?? 0);
    c.envMapIntensity = 0.7;
  }
  return c;
}
