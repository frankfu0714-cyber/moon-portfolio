"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type AstronautHandle = {
  group: THREE.Group | null;
  tilt: THREE.Group | null;
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

const MODEL_URL = "/models/astronaut.glb";

// Quaternius' Astronaut A ships baked animations under the
// `CharacterArmature|<Name>` naming scheme. We only need these three; the
// other 21 clips (Wave, Jump, Duck, etc.) stay unbound.
const CLIP_IDLE = "CharacterArmature|Idle";
const CLIP_WALK = "CharacterArmature|Walk";
const CLIP_RUN = "CharacterArmature|Run";

// The Quaternius rig is authored at a much bigger world scale than the
// procedural astronaut it replaces. Scaled down so the astronaut roughly
// matches the previous framing (head just under the top of the third-person
// camera's near-plane bracket).
const MODEL_SCALE = 0.55;

// Speed cap targets — must stay in sync with AstronautController's
// WALK_SPEED / RUN_SPEED so the walk-vs-idle envelope hits its threshold at
// the right velocity.
const WALK_START_SPEED = 0.15; // below this the astronaut is treated as idle
const CROSSFADE_S = 0.15; // Frank spec: "smooth transition over ~150ms"

useGLTF.preload(MODEL_URL);

type Anim = "idle" | "walk" | "run";

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const currentAnim = useRef<Anim>("idle");
  const lastFootstepPhase = useRef(0);
  const stepPos = useRef(new THREE.Vector3());

  const gltf = useGLTF(MODEL_URL);
  // We DO want the raw GLB scene (with its skeleton), but a fresh instance
  // per component so multiple <Astronaut>s wouldn't collide. Here there's
  // only one, but cloning is cheap and keeps us safe against StrictMode
  // double-mount stealing the skeleton from the cached scene.
  //
  // NOTE: SkeletonUtils.clone would be more correct for skinned meshes with
  // shared skeletons, but for this single-instance use `scene.clone(true)`
  // preserves the bones enough for the mixer to bind to `clipRoot`.
  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  // Bind the AnimationMixer to the CLONED scene so each animation drives
  // this instance's skeleton, not the cached original. The clips themselves
  // (targetsBoneName) resolve against the mixer root's descendant tree.
  const { actions, names } = useAnimations(gltf.animations, clonedScene);

  useEffect(() => {
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
  }, [clonedScene]);

  // Log discovered clips once so we can spot rig-name drift without a
  // debugger. If the expected three clips aren't there, warn loudly.
  useEffect(() => {
    if (!names.length) return;
    console.log("[Astronaut] baked animation clips:", names);
    const expected = [CLIP_IDLE, CLIP_WALK, CLIP_RUN];
    const missing = expected.filter((n) => !actions[n]);
    if (missing.length) {
      console.warn(
        "[Astronaut] missing expected clips — animation will be degraded:",
        missing,
      );
    }
  }, [names, actions]);

  // Start Idle immediately on mount so the astronaut isn't a T-pose statue
  // while we wait for the first useFrame tick.
  useEffect(() => {
    const idle = actions[CLIP_IDLE];
    if (!idle) return;
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.play();
    return () => {
      idle.stop();
    };
  }, [actions]);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get tilt() {
      return tiltGroup.current;
    },
  }));

  const crossfadeTo = (next: Anim) => {
    if (currentAnim.current === next) return;
    const nameFor: Record<Anim, string> = {
      idle: CLIP_IDLE,
      walk: CLIP_WALK,
      run: CLIP_RUN,
    };
    const nextAction = actions[nameFor[next]];
    const prevAction = actions[nameFor[currentAnim.current]];
    if (!nextAction) return;
    nextAction.reset();
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.setEffectiveWeight(1);
    nextAction.enabled = true;
    nextAction.fadeIn(CROSSFADE_S);
    nextAction.play();
    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(CROSSFADE_S);
    }
    currentAnim.current = next;
  };

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    const speedSquared =
      (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const runBlend = (g.userData.runBlend as number | undefined) ?? 0;

    // Pick clip: idle when nearly stopped, run when the controller says the
    // shift-run envelope is dominant, walk otherwise.
    let target: Anim;
    if (speed < WALK_START_SPEED) target = "idle";
    else if (runBlend > 0.5) target = "run";
    else target = "walk";
    crossfadeTo(target);

    // Footstep dust — tied to the walk/run action's cycle time so puffs
    // land in sync with the baked animation's foot-plant beats. Two step
    // beats per loop, so we fire at every half-cycle boundary.
    const activeAction =
      currentAnim.current === "run"
        ? actions[CLIP_RUN]
        : currentAnim.current === "walk"
          ? actions[CLIP_WALK]
          : null;
    if (activeAction && onFootstep) {
      const clipLen = activeAction.getClip().duration || 1;
      const cycle = activeAction.time / clipLen; // 0..1
      const halfStep = Math.floor(cycle * 2);
      if (halfStep !== lastFootstepPhase.current) {
        lastFootstepPhase.current = halfStep;
        const side = halfStep % 2 === 0 ? 1 : -1;
        stepPos.current.set(
          g.position.x + Math.cos(g.rotation.y) * side * 0.18,
          g.position.y,
          g.position.z - Math.sin(g.rotation.y) * side * 0.18,
        );
        onFootstep(stepPos.current);
      }
    } else {
      // Reset so the first step after starting to walk always fires.
      lastFootstepPhase.current = -1;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={tiltGroup}>
        <group scale={MODEL_SCALE}>
          <primitive object={clonedScene} />
        </group>
      </group>
    </group>
  );
});
