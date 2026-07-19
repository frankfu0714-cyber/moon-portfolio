"use client";

import { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Reusable boot-jet / thruster VFX. Same aesthetic language across the
// astronaut's FLOAT mode and the hover Cybertruck's under-chassis jets.
//
// Structure per instance (identical to Astronaut.tsx's inline version):
//   - Outer cone   ConeGeometry(0.075, 0.52), soft blue #bfe4ff   ] inside
//   - Inner cone   ConeGeometry(0.038, 0.30), white core          ] stretchY
//   - 7 particles  small sprites drifting down + fading over ~0.8s ] wrapper
//   - Glow sprite  0.88x0.88 blue-white radial gradient — OUTSIDE
//     the stretchY wrapper so tall thrusters keep a round core ball
//   - Optional pointLight (default off) so a cluster of jets can share
//     one light instead of stacking many
//
// Callers drive brightness/visibility by writing to `intensityRef.current`
// each frame — 0 hides, 1 is max. HoverJet does its own useFrame with
// the same flicker + particle recycling as Astronaut's version so the
// two feel like one design.

export type HoverJetHandle = {
  group: THREE.Group | null;
};

type Props = {
  intensityRef: React.MutableRefObject<number>;
  // Optional per-jet point light so the ground under each nozzle
  // catches a warm blue spill. Callers can dial `lightScale` down
  // when they're mounting many jets in the same cluster (Cybertruck
  // uses 4) so the summed intensity doesn't white-out the underside.
  pointLight?: boolean;
  lightScale?: number;
  // Non-uniform vertical stretch for the flame stack — cones and
  // particle trails elongate together so the jet reads as a longer
  // thruster streak. Default 1 (astronaut boot aesthetic); the hover
  // Cybertruck uses ~2.5 for a real thruster feel. NOTE: the nozzle
  // glow sprite is intentionally OUTSIDE this wrapper so a tall flame
  // still has a round core ball, not a vertically-squashed ellipse.
  stretchY?: number;
  // Diameter multiplier for the nozzle "core ball" — the bright
  // additive glow sprite at the emitter face. Default 1 matches the
  // astronaut boot. Cybertruck asks for something larger so Bloom
  // picks it up as a real ball of light at each wheel-well.
  coreScale?: number;
};

// Soft round blue-white glow — matches Astronaut.tsx.
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

// Shared texture: painting a new canvas per instance is wasteful.
let sharedGlowTex: THREE.CanvasTexture | null = null;
function getGlowTex() {
  if (!sharedGlowTex) sharedGlowTex = makeJetGlowTexture();
  return sharedGlowTex;
}

export const HoverJet = forwardRef<HoverJetHandle, Props>(function HoverJet(
  { intensityRef, pointLight = false, lightScale = 1, stretchY = 1, coreScale = 1 },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const matsRef = useRef<Array<THREE.MeshBasicMaterial | THREE.SpriteMaterial>>([]);
  const conesRef = useRef<THREE.Mesh[]>([]);
  const particlesRef = useRef<
    Array<{
      s: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      phase: number;
      speed: number;
    }>
  >([]);
  const glowTex = useMemo(() => getGlowTex(), []);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
  }));

  // Registration callbacks. Refs pushed once per mount, cleared on
  // unmount so re-mount doesn't accumulate stale entries.
  useEffect(() => {
    return () => {
      matsRef.current = [];
      conesRef.current = [];
      particlesRef.current = [];
    };
  }, []);

  const registerAnyMat = (
    m: THREE.MeshBasicMaterial | THREE.SpriteMaterial | null,
  ) => {
    if (m && !matsRef.current.includes(m)) matsRef.current.push(m);
  };
  const registerMat = (m: THREE.MeshBasicMaterial | null) => registerAnyMat(m);
  const registerCone = (m: THREE.Mesh | null) => {
    if (m && !conesRef.current.includes(m)) conesRef.current.push(m);
  };
  const registerParticle = (sp: THREE.Sprite | null, idx: number) => {
    if (sp && !particlesRef.current.some((e) => e.s === sp)) {
      const mat = sp.material as THREE.SpriteMaterial;
      registerAnyMat(mat);
      particlesRef.current.push({
        s: sp,
        mat,
        phase: (idx * 0.1618) % 1,
        speed: 1.25 + (idx % 5) * 0.17,
      });
    }
  };
  const registerSpriteMat = (mat: THREE.SpriteMaterial | null) => {
    if (mat) registerAnyMat(mat);
  };

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const intensity = Math.max(0, Math.min(1, intensityRef.current));
    g.visible = intensity > 0.02;
    if (!g.visible) return;
    // Root scale gates visibility — matches astronaut's approach.
    g.scale.setScalar(Math.max(0.001, intensity));

    for (const m of matsRef.current) {
      m.opacity = intensity * (0.6 + Math.random() * 0.4);
    }
    if (lightRef.current) {
      lightRef.current.intensity =
        intensity * (2.0 + Math.random() * 2.2) * lightScale;
    }

    const t = state.clock.elapsedTime;
    for (let i = 0; i < conesRef.current.length; i++) {
      const c = conesRef.current[i];
      c.scale.y =
        0.72 +
        0.26 * Math.sin(t * 41 + i * 2.63) +
        0.14 * Math.sin(t * 89 + i * 5.1) +
        0.14 * Math.random();
      const w = 0.85 + 0.22 * Math.random();
      c.scale.x = w;
      c.scale.z = w;
      c.rotation.z = Math.sin(t * 23 + i * 3.7) * 0.08;
    }
    for (const pt of particlesRef.current) {
      const frac = (t * pt.speed + pt.phase) % 1;
      pt.s.position.y = -0.14 - frac * 0.85;
      pt.s.position.x =
        Math.sin((t * 7 + pt.phase * 40) * pt.speed) * 0.03 * frac;
      pt.s.position.z =
        Math.cos((t * 6 + pt.phase * 31) * pt.speed) * 0.03 * frac;
      const sc = 0.17 * (1 - frac * 0.72);
      pt.s.scale.set(sc, sc, 1);
      pt.mat.opacity = intensity * (1 - frac) * (0.65 + 0.3 * Math.random());
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* stretchY inner wrapper stretches the whole flame stack
          vertically without stretching the outer group's intensity
          scale animation. Sprites and cones alike elongate downward,
          which reads as a longer thruster streak. */}
      <group scale={[1, stretchY, 1]}>
        {/* Outer soft-blue cone */}
        <mesh ref={registerCone} position={[0, -0.26, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.075, 0.52, 12, 1, true]} />
          <meshBasicMaterial
            ref={registerMat}
            color="#bfe4ff"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Inner white core */}
        <mesh ref={registerCone} position={[0, -0.18, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.038, 0.3, 10, 1, true]} />
          <meshBasicMaterial
            ref={registerMat}
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Trailing exhaust particles */}
        {Array.from({ length: 7 }, (_, pi) => (
          <sprite
            key={pi}
            ref={(sp) => registerParticle(sp, pi)}
            position={[0, -0.2, 0]}
            scale={[0.14, 0.14, 1]}
          >
            <spriteMaterial
              map={glowTex}
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
      {/* Nozzle core-ball glow: sits OUTSIDE the stretchY wrapper so
          a tall Cybertruck flame still has a round core, not an
          ellipse. Sprites always face the camera, so the visual is a
          bright additive disc — with Bloom on it reads as a real ball
          of light at each emitter. */}
      <sprite position={[0, -0.01, 0]} scale={[0.88 * coreScale, 0.88 * coreScale, 1]}>
        <spriteMaterial
          ref={registerSpriteMat}
          map={glowTex}
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      {pointLight && (
        <pointLight
          ref={lightRef}
          position={[0, -0.35, 0]}
          color="#8ecbff"
          intensity={0}
          distance={5}
          decay={2}
        />
      )}
    </group>
  );
});
