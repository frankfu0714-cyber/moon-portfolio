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
const CLIP_FALL = "Falling Idle";

// The GLB root node already bakes a 0.0242 normalization scale — the loaded
// scene stands 1.80 units tall with feet at y = 0 (verified empirically in a
// standalone three r185 harness). 1.80 * 0.97 ≈ 1.75 world units.
const MODEL_SCALE = 0.97;
const MODEL_Y_OFFSET = 0.02; // slight lift so boots never z-fight the terrain

// The model faces -Z at rest; the controller's forward at heading 0 is +Z,
// so spin the model half a turn to face its direction of travel.
const MODEL_YAW = Math.PI;

// Below this ground speed the astronaut is idle.
const WALK_START_SPEED = 0.15;

// Natural ground speeds (world units/sec) the clips were authored for —
// timeScale = actual speed / natural speed keeps feet from sliding.
const WALK_NATURAL_SPEED = 1.3;
const RUN_NATURAL_SPEED = 2.9;

// How fast animation weights blend when switching idle/walk/run.
const BLEND_RATE = 7;

// Post-animation arm spread (radians) so the idle pose doesn't sink the
// hands into the torso. Rolls the upper arms outward around the body's
// forward axis, stronger while idling, subtle while walking/running.
const ARM_SPREAD_BASE = 0.05;
const ARM_SPREAD_IDLE = 0.13;

const _armAxis = new THREE.Vector3();
const _gq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _cq = new THREE.Quaternion();

useGLTF.preload(MODEL_URL);

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const weights = useRef({ idle: 1, walk: 0, run: 0, fall: 0 });
  const prevCycle = useRef(0);
  const stepPos = useRef(new THREE.Vector3());
  const jetsRef = useRef<THREE.Group>(null);
  const jetLightRef = useRef<THREE.PointLight>(null);
  const jetMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const flameConesRef = useRef<THREE.Mesh[]>([]);
  const jetParticlesRef = useRef<
    { s: THREE.Sprite; mat: THREE.SpriteMaterial; phase: number; speed: number }[]
  >([]);
  const jetGlowTex = useMemo(() => makeJetGlowTexture(), []);
  const armBones = useRef<{ l: THREE.Object3D | null; r: THREE.Object3D | null }>({ l: null, r: null });

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
      fall: make(find(CLIP_FALL)),
    };
  }, [gltf.animations, mixer]);

  useEffect(() => {
    clonedScene.traverse((obj) => {
      if (obj.name.endsWith("LeftArm")) armBones.current.l = obj;
      if (obj.name.endsWith("RightArm")) armBones.current.r = obj;
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

  useFrame((state, deltaRaw) => {
    const g = groupRef.current;
    if (!g) return;
    const dt = Math.min(deltaRaw, 0.05);

    const speedSquared = (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const runBlend = (g.userData.runBlend as number | undefined) ?? 0;
    const airborne = (g.userData.airborne as boolean | undefined) ?? false;
    const floatBlend = (g.userData.floatBlend as number | undefined) ?? 0;
    const moving = speed >= WALK_START_SPEED;

    // Boot jets: visible only in float mode. Random per-frame flicker on
    // the flame scale + light intensity sells the thrust.
    if (jetsRef.current) {
      jetsRef.current.visible = floatBlend > 0.02;
      const flick = 0.8 + Math.random() * 0.35;
      jetsRef.current.scale.setScalar(Math.max(0.001, floatBlend));
      for (const m of jetMatsRef.current) {
        m.opacity = floatBlend * (0.6 + Math.random() * 0.4);
      }
      if (jetLightRef.current) {
        jetLightRef.current.intensity = floatBlend * (2.0 + Math.random() * 2.2);
      }
      if (floatBlend > 0.02) {
        const t = state.clock.elapsedTime;
        // Living flame: every frame the cones stretch/squash and jitter
        // sideways so the fire visibly licks and roars instead of sitting
        // as a static shape.
        for (let i = 0; i < flameConesRef.current.length; i++) {
          const c = flameConesRef.current[i];
          c.scale.y =
            0.72 +
            0.26 * Math.sin(t * 41 + i * 2.63) +
            0.14 * Math.sin(t * 89 + i * 5.1) +
            0.14 * Math.random();
          const w = 0.85 + 0.22 * Math.random();
          c.scale.x = w;
          c.scale.z = w;
          // No PI here: rotation.x is already PI from JSX; adding PI on z
          // composed into an un-flip that pointed the cone tip upward.
          c.rotation.z = Math.sin(t * 23 + i * 3.7) * 0.08;
        }
        // Exhaust stream: recycled glow puffs shooting down out of each
        // boot, shrinking and fading as they fall — reads as real thrust.
        for (const pt of jetParticlesRef.current) {
          const frac = (t * pt.speed + pt.phase) % 1;
          pt.s.position.y = -0.14 - frac * 0.85;
          pt.s.position.x = Math.sin((t * 7 + pt.phase * 40) * pt.speed) * 0.03 * frac;
          pt.s.position.z = Math.cos((t * 6 + pt.phase * 31) * pt.speed) * 0.03 * frac;
          const sc = 0.17 * (1 - frac * 0.72);
          pt.s.scale.set(sc, sc, 1);
          pt.mat.opacity = floatBlend * (1 - frac) * (0.65 + 0.3 * Math.random());
        }
      }
    }

    // Blend animation weights toward the current locomotion state.
    const w = weights.current;
    // Airborne (or hovering on the jets) overrides ground locomotion with
    // a faster blend so the pose change reads immediately.
    const airWeight = Math.max(airborne ? 1 : 0, floatBlend);
    w.fall = THREE.MathUtils.damp(w.fall, airWeight, 10, dt);
    const ground = 1 - w.fall;
    w.idle = THREE.MathUtils.damp(w.idle, moving ? 0 : 1, BLEND_RATE, dt);
    w.walk = THREE.MathUtils.damp(
      w.walk,
      moving ? 1 - runBlend : 0,
      BLEND_RATE,
      dt,
    );
    w.run = THREE.MathUtils.damp(w.run, moving ? runBlend : 0, BLEND_RATE, dt);

    actions.idle?.setEffectiveWeight(w.idle * ground);
    actions.walk?.setEffectiveWeight(w.walk * ground);
    actions.run?.setEffectiveWeight(w.run * ground);
    actions.fall?.setEffectiveWeight(w.fall);

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

    // Spread the upper arms outward after the mixer has posed the rig so
    // idle hands sit clear of the torso instead of clipping into it.
    const spread = ARM_SPREAD_BASE + ARM_SPREAD_IDLE * w.idle;
    g.getWorldQuaternion(_gq);
    _armAxis.set(0, 0, 1).applyQuaternion(_gq);
    spreadArm(armBones.current.l, spread);
    spreadArm(armBones.current.r, -spread);

    // Footstep dust: the dominant gait clip hits a footfall twice per
    // loop (at ~0% and ~50% of the cycle).
    if (moving && onFootstep && w.fall < 0.5) {
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

  const registerJetMat = (m: THREE.MeshBasicMaterial | null) => {
    if (m && !jetMatsRef.current.includes(m)) jetMatsRef.current.push(m);
  };
  const registerFlameCone = (m: THREE.Mesh | null) => {
    if (m && !flameConesRef.current.includes(m)) flameConesRef.current.push(m);
  };
  const registerJetParticle = (sp: THREE.Sprite | null, idx: number) => {
    if (sp && !jetParticlesRef.current.some((e) => e.s === sp)) {
      jetParticlesRef.current.push({
        s: sp,
        mat: sp.material as THREE.SpriteMaterial,
        phase: (idx * 0.1618) % 1,
        speed: 1.25 + (idx % 5) * 0.17,
      });
    }
  };

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={tiltGroup}>
        <group position={[0, MODEL_Y_OFFSET, 0]} rotation={[0, MODEL_YAW, 0]}>
          <group scale={MODEL_SCALE}>
            <primitive object={clonedScene} />
          </group>
        </group>
        {/* Boot thrusters — blue-white jet cones + glow under each sole,
            Iron-Man style. Hidden (scale ~0) unless float mode blends in. */}
        <group ref={jetsRef} visible={false}>
          {[-0.13, 0.13].map((x) => (
            <group key={x} position={[x, 0.06, 0]}>
              <mesh ref={registerFlameCone} position={[0, -0.26, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.075, 0.52, 12, 1, true]} />
                <meshBasicMaterial
                  ref={registerJetMat}
                  color="#bfe4ff"
                  transparent
                  opacity={0}
                  depthWrite={false}
                  toneMapped={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh ref={registerFlameCone} position={[0, -0.18, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.038, 0.3, 10, 1, true]} />
                <meshBasicMaterial
                  ref={registerJetMat}
                  color="#ffffff"
                  transparent
                  opacity={0}
                  depthWrite={false}
                  toneMapped={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <sprite position={[0, -0.01, 0]} scale={[0.88, 0.88, 1]}>
                <spriteMaterial
                  map={jetGlowTex}
                  transparent
                  depthWrite={false}
                  toneMapped={false}
                  blending={THREE.AdditiveBlending}
                />
              </sprite>
              {Array.from({ length: 7 }, (_, pi) => (
                <sprite
                  key={pi}
                  ref={(sp) => registerJetParticle(sp, pi + (x < 0 ? 0 : 7))}
                  position={[0, -0.2, 0]}
                  scale={[0.14, 0.14, 1]}
                >
                  <spriteMaterial
                    map={jetGlowTex}
                    color="#8fd4ff"
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </sprite>
              ))}
            </group>
          ))}
          <pointLight
            ref={jetLightRef}
            position={[0, -0.35, 0]}
            color="#8ecbff"
            intensity={0}
            distance={5}
            decay={2}
          />
        </group>
      </group>
    </group>
  );
});

// Soft round blue-white glow for the jet nozzles.
function makeJetGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(190,225,255,0.55)");
  g.addColorStop(0.6, "rgba(130,190,255,0.16)");
  g.addColorStop(1, "rgba(130,190,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Rotate an upper-arm bone by `angle` around the world-space `_armAxis`,
// preserving the animated pose underneath (delta applied in parent space).
function spreadArm(bone: THREE.Object3D | null, angle: number) {
  if (!bone || !bone.parent) return;
  bone.parent.getWorldQuaternion(_pq);
  _dq.setFromAxisAngle(_armAxis, angle);
  _cq.copy(_pq).invert().multiply(_dq).multiply(_pq);
  bone.quaternion.premultiply(_cq);
}

// Clone + gently tune the GLB's baked materials so the white suit catches
// the hard lunar sun without blowing out. The transparent visor glass is
// converted to an opaque gloss-black mask (no see-through face).
function tuneSuit(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial;
  const c = std.clone();
  if (c.transparent) {
    const v = c as THREE.MeshStandardMaterial;
    v.transparent = false;
    v.opacity = 1;
    v.depthWrite = true;
    if ("color" in v) v.color.set("#0a0b0e");
    if ("roughness" in v) {
      v.roughness = 0.22;
      v.metalness = 0.4;
      v.envMapIntensity = 1.0;
    }
  } else if ("roughness" in c) {
    c.roughness = Math.min(1, (std.roughness ?? 0.8) * 1.05);
    c.metalness = Math.min(0.2, std.metalness ?? 0);
    c.envMapIntensity = 0.7;
  }
  return c;
}

