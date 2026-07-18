"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

// Cinematic night-side Earth matching the reference frame: deep blue
// globe you can still read continents on, warm glowing city grids, a
// bright sunlit crescent arc on the right limb, and a soft blue
// atmosphere halo. Textures come from the three.js examples repo on
// raw.githubusercontent.com (CORS: *).
const DAY_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg";
const LIGHTS_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png";

const EARTH_R = 42;

// The globe's radius in canvas pixels (out of a 512px square). Everything
// in the halo texture is positioned relative to this so the sprite can be
// scaled to line the glow up exactly with the mesh limb.
const CANVAS_GLOBE_R = 150;

// Painted halo: ONE continuous radial gradient for the atmosphere plus a
// soft offset ring for the sunlit crescent. Because it's a single gradient
// texture (not stacked translucent shells) the falloff is perfectly smooth
// - no concentric strips at the limb.
function makeAtmosphereTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  // Atmospheric limb glow: starts just inside the limb, peaks right at
  // it, then decays smoothly to nothing.
  const atm = ctx.createRadialGradient(c, c, 0, c, c, c);
  atm.addColorStop(0.0, "rgba(120,170,240,0)");
  atm.addColorStop(0.52, "rgba(120,170,240,0)");
  atm.addColorStop(0.575, "rgba(150,195,255,0.5)");
  atm.addColorStop(0.62, "rgba(120,170,240,0.26)");
  atm.addColorStop(0.72, "rgba(100,150,225,0.11)");
  atm.addColorStop(0.85, "rgba(90,140,215,0.04)");
  atm.addColorStop(1.0, "rgba(90,140,215,0)");
  ctx.fillStyle = atm;
  ctx.fillRect(0, 0, size, size);

  // Sunlit crescent: a soft bright ring whose centre is nudged right, so
  // only its right side pokes past the globe's limb. The globe mesh
  // occludes everything inside the disc, leaving a smooth white-blue arc.
  const cres = ctx.createRadialGradient(
    c + 14,
    c - 4,
    CANVAS_GLOBE_R * 0.75,
    c + 14,
    c - 4,
    CANVAS_GLOBE_R * 1.12,
  );
  cres.addColorStop(0.0, "rgba(234,245,255,0)");
  cres.addColorStop(0.62, "rgba(234,245,255,0.75)");
  cres.addColorStop(0.78, "rgba(200,228,255,0.3)");
  cres.addColorStop(1.0, "rgba(200,228,255,0)");
  ctx.fillStyle = cres;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function EarthTextureApplier({
  globeRef,
  lightsRef,
}: {
  globeRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  lightsRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const [dayMap, lightsMap] = useTexture(
    [DAY_MAP_URL, LIGHTS_MAP_URL],
    (loaded) => {
      for (const tex of loaded as THREE.Texture[]) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
      }
    },
  );

  useEffect(() => {
    // Unlit basic materials give full control over the look regardless
    // of scene lighting: the day map tinted a luminous night-blue reads
    // as moonlit oceans/continents, and the additive lights layer paints
    // the warm city grid on top so Bloom flares it like the reference.
    const globe = globeRef.current;
    if (globe) {
      globe.map = dayMap;
      globe.color = new THREE.Color("#6a8cbe");
      globe.needsUpdate = true;
    }
    const lights = lightsRef.current;
    if (lights) {
      lights.map = lightsMap;
      lights.visible = true;
      lights.needsUpdate = true;
    }
  }, [dayMap, lightsMap, globeRef, lightsRef]);

  return null;
}

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const globeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightsMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const atmosphereTex = useMemo(() => makeAtmosphereTexture(), []);

  // Sprite scale: the canvas globe radius must project to EARTH_R world
  // units, so full canvas width (256px half) maps to this many units.
  const spriteSize = EARTH_R * (256 / CANVAS_GLOBE_R) * 2;

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.006;
    }
  });

  return (
    <group position={[14, 72, 236]}>
      <group ref={groupRef} rotation={[0.15, 2.6, 0]}>
        {/* Night-blue globe (unlit) */}
        <mesh>
          <sphereGeometry args={[EARTH_R, 64, 64]} />
          <meshBasicMaterial ref={globeMatRef} color="#31435e" fog={false} />
        </mesh>
        {/* Additive city-lights layer - toneMapped:false pushes it past
            the Bloom threshold so the grids genuinely glow. Hidden until
            its texture arrives (a bare white additive sphere would
            otherwise white out the whole globe). */}
        <mesh>
          <sphereGeometry args={[EARTH_R * 1.002, 64, 64]} />
          <meshBasicMaterial
            ref={lightsMatRef}
            visible={false}
            color="#ffb066"
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier globeRef={globeMatRef} lightsRef={lightsMatRef} />
      </SafeAsset>
      {/* Atmosphere + crescent, painted as one smooth gradient billboard
          sitting just behind the globe. The globe mesh depth-occludes the
          centre of the sprite, so only the halo ring and the right-limb
          crescent show - with continuous falloff instead of the old
          stacked-shell colour strips. */}
      <sprite position={[0, 0, 8]} scale={[spriteSize, spriteSize, 1]}>
        <spriteMaterial
          map={atmosphereTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
    </group>
  );
}
