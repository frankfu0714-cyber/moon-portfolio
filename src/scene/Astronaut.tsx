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
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

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
const MODEL_SCALE = 0.72;

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
  // SkeletonUtils.clone rebinds every SkinnedMesh to the CLONED bone
  // hierarchy. A plain `scene.clone(true)` leaves the cloned meshes bound to
  // the ORIGINAL skeleton, so the mixer animates bones nobody is skinned to
  // and the astronaut renders as a frozen statue gliding over the terrain.
  const clonedScene = useMemo(
    () => cloneWithSkeleton(gltf.scene) as THREE.Group,
    [gltf.scene],
  );

  // Repaint the Quaternius sci-fi suit as a NASA "pumpkin suit" orange
  // explorer: bright orange shell, white gloves/boots/trim, dark visor.
  // The GLB ships flat-colored materials (no textures), so a straight
  // palette swap by material name is safe. Materials are cloned before
  // mutation so the shared useGLTF cache keeps its original colors.
  useMemo(() => {
    const palette: Record<string, Partial<THREE.MeshStandardMaterial>> = {
      // Main suit shell - pumpkin orange fabric.
      SciFi_Main: { color: new THREE.Color("#e8712a"), roughness: 0.72, metalness: 0.02 },
      // Under-suit / joints - deep rust so the seams read as harness straps.
      SciFi_MainDark: { color: new THREE.Color("#8f3f16"), roughness: 0.7, metalness: 0.05 },
      // Trim panels - bright white.
      SciFi_Light: { color: new THREE.Color("#f4f2ec"), roughness: 0.6, metalness: 0.05 },
      // Accents (boots / helmet stripes) - clean white, no more gold.
      SciFi_Light_Accent: {
        color: new THREE.Color("#f2f0ea"),
        roughness: 0.55,
        metalness: 0.05,
      },
      // Visor glass / dark hardware - near-black with a glassy sheen.
      Grey: { color: new THREE.Color("#15171c"), roughness: 0.2, metalness: 0.55 },
    };
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const wasArray = Array.isArray(mesh.material);
      const mats = wasArray
        ? (mesh.material as THREE.Material[])
        : [mesh.material as THREE.Material];
      const repainted = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        const swap = palette[std.name];
        if (!swap) return m;
        const c = std.clone();
        Object.assign(c, swap);
        return c;
      });
      mesh.material = wasArray ? repainted : repainted[0];
    });
  }, [clonedScene]);

  // Strip root-translation tracks from every clip before we hand them to the
  // mixer. Quaternius' Walk and Run clips include baked hip/root position
  // tracks that shift the character forward in place — beautiful for a demo
  // reel, but here they fight `AstronautController`, which owns the world
  // position (WASD → velocity → root translation). If both apply, the
  // mixer's periodic reset of hip.position back to the loop start cancels
  // out the controller's per-frame delta and the astronaut plays the
  // animation in place while the camera pans forward.
  //
  // Fix: rebuild each clip without any `.position` tracks. We only want the
  // rig's bone rotations from the clip. Done once per gltf, cached in
  // `strippedClips`. This clones each clip before mutating so the shared
  // useGLTF cache isn't affected across remounts.
  //
  // Guards:
  // - If the filter would leave a clip with ZERO tracks (i.e. it was
  //   position-only), keep the original untouched. An empty-tracks clip
  //   makes `AnimationMixer.clipAction` return an action that plays
  //   nothing, and on some Three.js versions the mixer walks the empty
  //   track list into a bind step that throws. Cheaper to keep the tiny
  //   root drift than to risk a black-scene.
  // - Any thrown error inside the memo falls back to the raw
  //   `gltf.animations` — root motion returns, but the scene renders.
  const strippedClips = useMemo(() => {
    try {
      return gltf.animations.map((clip) => {
        const nonPos = clip.tracks.filter(
          (t) => !t.name.endsWith(".position"),
        );
        if (nonPos.length === 0 || nonPos.length === clip.tracks.length) {
          // Nothing to strip, OR stripping would empty the clip.
          return clip;
        }
        const c = clip.clone();
        c.tracks = nonPos;
        return c;
      });
    } catch (err) {
      console.warn(
        "[Astronaut] track-strip failed; falling back to raw clips —",
        err,
      );
      return gltf.animations;
    }
  }, [gltf.animations]);

  // Bind the AnimationMixer to the CLONED scene so each animation drives
  // this instance's skeleton, not the cached original.
  const { actions, names } = useAnimations(strippedClips, clonedScene);

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
  // debugger. If the expected three clips aren't there, warn loudly. Also
  // report how many .position tracks were stripped from Walk / Run so we
  // can confirm the anti-root-motion filter is doing what we expect.
  useEffect(() => {
    if (!names.length) return;
    console.log("[Astronaut] baked animation clips:", names);
    const strippedFrom = (name: string) => {
      const orig = gltf.animations.find((c) => c.name === name);
      const kept = strippedClips.find((c) => c.name === name);
      if (!orig || !kept) return 0;
      return orig.tracks.length - kept.tracks.length;
    };
    console.log(
      `[Astronaut] position tracks stripped — walk=${strippedFrom(CLIP_WALK)} run=${strippedFrom(CLIP_RUN)} idle=${strippedFrom(CLIP_IDLE)}`,
    );
    const expected = [CLIP_IDLE, CLIP_WALK, CLIP_RUN];
    const missing = expected.filter((n) => !actions[n]);
    if (missing.length) {
      console.warn(
        "[Astronaut] missing expected clips — animation will be degraded:",
        missing,
      );
    }
  }, [names, actions, gltf.animations, strippedClips]);

  // Start Idle immediately on mount so the astronaut isn't a T-pose statue
  // while we wait for the first useFrame tick. Wrapped in try/catch so a
  // broken clip binding can't unmount the whole Canvas subtree.
  useEffect(() => {
    const idle = actions[CLIP_IDLE];
    if (!idle) return;
    try {
      idle.reset();
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.play();
    } catch (err) {
      console.warn("[Astronaut] failed to start idle clip —", err);
      return;
    }
    return () => {
      try {
        idle.stop();
      } catch {
        // ignore
      }
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
    try {
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
    } catch (err) {
      // Never let an animation error kill the useFrame loop — that would
      // freeze the whole Canvas.
      console.warn("[Astronaut] crossfade failed —", err);
    }
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
    // Match playback rate to actual ground speed so the feet never slide:
    // at nominal speed the clip runs at 1x, slower/faster scales with it.
    if (activeAction) {
      const nominal = currentAnim.current === "run" ? 2.6 : 1.2;
      activeAction.timeScale = THREE.MathUtils.clamp(
        speed / nominal,
        0.55,
        1.45,
      );
    }

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
