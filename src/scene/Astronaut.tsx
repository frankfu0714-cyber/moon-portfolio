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
import { SkeletonUtils } from "three-stdlib";

export type AstronautHandle = {
  group: THREE.Group | null;
  tilt: THREE.Group | null;
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

// Realistic rigged astronaut (Sketchfab, CC-BY 4.0) with baked Mixamo
// animation clips — real walking this time, not a procedural glide.
// media.githubusercontent.com sends `access-control-allow-origin: *`,
// so the cross-origin fetch is safe.
const MODEL_URL =
  "https://media.githubusercontent.com/media/BarthPaleologue/CosmosJourneyer/main/packages/game/src/asset/character/astronaut.glb";

// Clip names baked into the GLB.
const CLIP_IDLE = "Standing Idle";
const CLIP_WALK = "Walking Forward";
const CLIP_RUN = "Running";

// The GLB's skeleton stands ~74.7 raw units tall (skinned meshes render in
// skeleton space, ignoring node scale, so runtime bbox measurement lies —
// this is a measured constant instead). 74.7 * 0.0234 ≈ 1.75 world units.
const MODEL_SCALE = 0.0234;
const MODEL_Y_OFFSET = 0.03; // raw feet sit at y ≈ -1.23 → lift into place

// If the model faces the wrong way relative to the controller's heading,
// adjust this single constant (radians).
const MODEL_YAW = 0;

// Below this ground speed the astronaut is idle.
const WALK_START_SPEED = 0.15;

// Natural ground speeds (world units/sec) the clips were authored for —
// timeScale = actual speed / natural speed keeps feet from sliding.
const WALK_NATURAL_SPEED = 1.3;
const RUN_NATURAL_SPEED = 2.9;

// How fast animation weights blend when switching idle/walk/run.
const BLEND_RATE = 7;

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const weights = useRef({ idle: 1, walk: 0, run: 0 });
  const prevCycle = useRef(0);
  const stepPos = useRef(new THREE.Vector3());

  const gltf = useGLTF(MODEL_URL);

  // Skinned mesh — must clone via SkeletonUtils so the skeleton bindings
  // point at the cloned bones (StrictMode-safe fresh instance per mount).
  const clonedScene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  const mixer = useMemo(
    () => new THREE.AnimationMixer(clonedScene),
    [clonedScene],
  );

  const actions = useMemo(() => {
    const find = (name: string) =>
      gltf.animations.find((c) => c.name === name) ?? null;
    const make = (clip: THREE.AnimationClip | null) => {
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      return a;
    };
    return {
      idle: make(find(CLIP_IDLE)),
      walk: make(find(CLIP_WALK)),
      run: make(find(CLIP_RUN)),
    };
  }, [gltf.animations, mixer]);

  useEffect(() => {
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // Skinned meshes deform outside their static bounds — never cull.
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mesh.material = (Array.isArray(mesh.material)
        ? mats.map((m) => tuneSuit(m))
        : tuneSuit(mats[0])) as THREE.Material;
    });
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
    };
  }, [clonedScene, mixer]);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get tilt() {
      return tiltGroup.current;
    },
  }));

  useFrame((_state, deltaRaw) => {
    const g = groupRef.current;
    if (!g) return;
    const dt = Math.min(deltaRaw, 0.05);

    const speedSquared = (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const runBlend = (g.userData.runBlend as number | undefined) ?? 0;
    const moving = speed >= WALK_START_SPEED;

    // Blend animation weights toward the current locomotion state.
    const w = weights.current;
    w.idle = THREE.MathUtils.damp(w.idle, moving ? 0 : 1, BLEND_RATE, dt);
    w.walk = THREE.MathUtils.damp(
      w.walk,
      moving ? 1 - runBlend : 0,
      BLEND_RATE,
      dt,
    );
    w.run = THREE.MathUtils.damp(w.run, moving ? runBlend : 0, BLEND_RATE, dt);

    actions.idle?.setEffectiveWeight(w.idle);
    actions.walk?.setEffectiveWeight(w.walk);
    actions.run?.setEffectiveWeight(w.run);

    // Match stride to actual ground speed so feet never slide.
    if (actions.walk) {
      actions.walk.timeScale = moving
        ? THREE.MathUtils.clamp(speed / WALK_NATURAL_SPEED, 0.5, 1.6)
        : 1;
    }
    if (actions.run) {
      actions.run.timeScale = moving
        ? THREE.MathUtils.clamp(speed / RUN_NATURAL_SPEED, 0.5, 1.6)
        : 1;
    }

    mixer.update(dt);

    // Footstep dust: the dominant gait clip hits a footfall twice per
    // loop (at ~0% and ~50% of the cycle).
    if (moving && onFootstep) {
      const dominant = runBlend > 0.5 ? actions.run : actions.walk;
      if (dominant) {
        const clipDur = dominant.getClip().duration;
        const frac = (dominant.time % clipDur) / clipDur;
        const cycle = Math.floor(frac * 2);
        if (cycle !== prevCycle.current) {
          prevCycle.current = cycle;
          const side = cycle === 0 ? 1 : -1;
          stepPos.current.set(
            g.position.x + Math.cos(g.rotation.y) * side * 0.16,
            g.position.y,
            g.position.z - Math.sin(g.rotation.y) * side * 0.16,
          );
          onFootstep(stepPos.current);
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={tiltGroup}>
        <group position={[0, MODEL_Y_OFFSET, 0]} rotation={[0, MODEL_YAW, 0]}>
          <group scale={MODEL_SCALE}>
            <primitive object={clonedScene} />
          </group>
        </group>
      </group>
    </group>
  );
});

// Clone + gently tune the GLB's baked materials so the white suit catches
// the hard lunar sun without blowing out. Transparent parts (visor glass)
// are left untouched.
function tuneSuit(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial;
  const c = std.clone();
  if ("roughness" in c && !c.transparent) {
    c.roughness = Math.min(1, (std.roughness ?? 0.8) * 1.05);
    c.metalness = Math.min(0.2, std.metalness ?? 0);
    c.envMapIntensity = 0.7;
  }
  return c;
}
