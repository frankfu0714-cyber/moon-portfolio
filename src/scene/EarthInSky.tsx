"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

// Cinematic Earth in the sky with a proper day/night terminator.
// A single custom ShaderMaterial samples the day map + the city-lights
// map and blends between them per fragment based on
// `dot(worldNormal, sunDir)`. City lights fade out on the day side
// automatically; the terminator is a smoothstep so it reads as a
// distinct-but-soft edge (~12° of blend). The atmosphere + sunlit
// crescent sprite behind the globe stays as-is.
const DAY_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg";
const LIGHTS_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png";

const EARTH_R = 42;

// The globe's radius in canvas pixels (out of a 512px square). Everything
// in the halo texture is positioned relative to this so the sprite can be
// scaled to line the glow up exactly with the mesh limb.
const CANVAS_GLOBE_R = 150;

// World-space positions of the Earth and the visible Sun sprite (see
// Scene.tsx SunInSky). Direction from Earth to Sun drives the day/night
// shader — using the SPRITE position (not the directional light's
// position) so what the player sees glowing in the sky is what casts
// Earth's daylight.
const EARTH_WORLD = new THREE.Vector3(14, 72, 236);
const SUN_WORLD = new THREE.Vector3(450, 130, -180);
const SUN_FROM_EARTH = SUN_WORLD.clone().sub(EARTH_WORLD).normalize();

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

// 1x1 solid textures so the shader has something safe to sample from
// while the real maps are still loading (or if SafeAsset catches a
// load error and the useEffect never runs).
function makeSolidTexture(r: number, g: number, b: number) {
  const t = new THREE.DataTexture(
    new Uint8Array([r, g, b, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const EARTH_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Sphere is unit-scaled and only rotated (no non-uniform scale), so
    // mat3(modelMatrix) preserves the normal direction. Normalize once
    // here rather than per-fragment.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader: day/night blend gated by dot(worldNormal, sunDir).
// - Day side: sample the day texture as-is.
// - Night side: darken + blue-tint the day texture (moonlit oceans),
//   then add the city-lights map warm-tinted so the grids glow.
// - Terminator: smoothstep across ±0.15 (~17° either side of the day/
//   night boundary) so the transition reads as distinct-but-soft.
// toneMapped:false on the material so the additive city lights output
// above 1.0 in linear space, which Bloom picks up as a real glow.
const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D lightsMap;
  uniform vec3 sunDir;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    float d = dot(vWorldNormal, sunDir);
    float dayness = smoothstep(-0.15, 0.15, d);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 lights = texture2D(lightsMap, vUv).rgb;
    // Blue-tinted moonlit night look for the base surface.
    vec3 nightBase = day * vec3(0.32, 0.42, 0.62) * 0.32;
    // Warm additive city lights — only appear on the night side.
    vec3 nightGlow = lights * vec3(1.5, 0.95, 0.55) * (1.0 - dayness);
    vec3 nightSide = nightBase + nightGlow;
    vec3 color = mix(nightSide, day, dayness);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function makeEarthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      // Solid fallbacks so a bare material doesn't sample undefined.
      dayMap: { value: makeSolidTexture(50, 68, 95) },
      lightsMap: { value: makeSolidTexture(0, 0, 0) },
      sunDir: { value: SUN_FROM_EARTH.clone() },
    },
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
    toneMapped: false,
    fog: false,
  });
}

function EarthTextureApplier({
  material,
}: {
  material: THREE.ShaderMaterial;
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
    material.uniforms.dayMap.value = dayMap;
    material.uniforms.lightsMap.value = lightsMap;
    material.needsUpdate = true;
  }, [dayMap, lightsMap, material]);

  return null;
}

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const material = useMemo(() => makeEarthMaterial(), []);
  const atmosphereTex = useMemo(() => makeAtmosphereTexture(), []);

  // Sprite scale: the canvas globe radius must project to EARTH_R world
  // units, so full canvas width (256px half) maps to this many units.
  const spriteSize = EARTH_R * (256 / CANVAS_GLOBE_R) * 2;

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.006;
    }
  });

  // Free the ShaderMaterial + fallback DataTextures on unmount.
  useEffect(() => {
    return () => {
      (material.uniforms.dayMap.value as THREE.Texture | null)?.dispose?.();
      (material.uniforms.lightsMap.value as THREE.Texture | null)?.dispose?.();
      material.dispose();
    };
  }, [material]);

  return (
    <group position={[EARTH_WORLD.x, EARTH_WORLD.y, EARTH_WORLD.z]}>
      <group ref={groupRef} rotation={[0.15, 2.6, 0]}>
        <mesh material={material}>
          <sphereGeometry args={[EARTH_R, 64, 64]} />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier material={material} />
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
