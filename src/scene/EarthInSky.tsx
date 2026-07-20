"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

// Cinematic Earth in the sky with a physically-motivated day/night
// terminator and Fresnel-style atmospheric rim glow — the bright limb
// is computed per fragment from the sun's world direction, so it is
// guaranteed to appear on the actual sun-facing hemisphere regardless
// of camera angle. Previous version painted a fake crescent onto a
// billboard sprite that always faced the camera, which could put the
// "sunlit" side on the wrong screen half depending on where the
// player was standing.
const DAY_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg";
const LIGHTS_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png";

const EARTH_R = 42;

// World-space positions of the Earth and the visible Sun sprite (see
// Scene.tsx SunInSky). Direction from Earth to Sun drives the day/night
// shader — using the SPRITE position (not the directional light's
// position) so what the player sees glowing in the sky is what casts
// Earth's daylight.
//
// The world sun is in +X, which projects to screen-LEFT from the
// player's default camera orientation (camera looks +Z; screen-right
// maps to world -X). So the physically-correct sun-facing hemisphere
// ends up on screen-LEFT of the visible Earth disc — matching what
// Frank sees ("sun is on the LEFT side of earth"). No negate here:
// physics + Frank's screen-relative expectation agree.
const EARTH_WORLD = new THREE.Vector3(14, 72, 236);
const SUN_WORLD = new THREE.Vector3(450, 130, -180);
const SUN_FROM_EARTH = SUN_WORLD.clone().sub(EARTH_WORLD).normalize();

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
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    // Sphere is unit-scaled and only rotated (no non-uniform scale),
    // so mat3(modelMatrix) preserves the normal direction.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Fragment shader: day/night blend + Fresnel-style atmospheric limb
// glow, both computed from the world-space sun direction.
//
// - Day side (dot(N, sunDir) > 0): sample the day texture, plus a
//   subtle blue atmospheric tint (very cheap Rayleigh proxy so it
//   reads as an atmosphere-covered planet, not a dry ball).
// - Night side (dot < 0): darken + blue-tint the day texture for
//   moonlit continents, then additively layer warm city lights.
// - Terminator: smoothstep across dot = ±0.25 (~29° either side of
//   the day/night boundary), soft-but-distinct — closer to Earth-
//   from-orbit photos than the razor edge of a hard step.
// - Atmospheric limb glow: Fresnel term (grazing angles) modulated
//   by sun-facing amount. Bright cyan-blue arc on the sunlit limb,
//   dim on the shadowed limb. Runs past 1.0 for Bloom pickup.
//
// toneMapped:false on the material so the limb glow + city lights
// output above 1.0 in linear space, letting Bloom flare them.
const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D lightsMap;
  uniform vec3 sunDir;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float sunFacing = dot(N, sunDir);
    float dayness = smoothstep(-0.25, 0.25, sunFacing);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 lights = texture2D(lightsMap, vUv).rgb;

    // Blue-tinted moonlit night base (dim, cool).
    vec3 nightBase = day * vec3(0.32, 0.42, 0.62) * 0.28;
    // Warm additive city lights — fade to zero on the day side.
    vec3 nightGlow = lights * vec3(1.6, 1.0, 0.55) * (1.0 - dayness);
    vec3 nightSide = nightBase + nightGlow;
    vec3 color = mix(nightSide, day, dayness);

    // Subtle Rayleigh-like atmospheric tint on the day side.
    color += vec3(0.06, 0.10, 0.16) * dayness;

    // Fresnel-based atmospheric limb glow: subtle bright blue arc
    // on the sunlit edge only. Restored from 0.55x back toward the
    // original 1.1x — Frank asked for a visible atmospheric-scatter
    // glow after the halo sprite came out. Kept the sharpened
    // pow-3.6 falloff so the arc lives on the sphere silhouette
    // and fades to zero right at the edge — no separate geometry
    // means no visible outer edge line, just the Fresnel term
    // dying naturally to 0 at the mesh boundary.
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.6);
    float sunAmount = clamp(sunFacing, 0.0, 1.0);
    vec3 atmoSun = vec3(0.55, 0.78, 1.15);
    color += atmoSun * rim * sunAmount * 0.95;

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

  // No halo sprite: the sprite's own quad silhouette was showing
  // through as a subtle line/edge ring around the sphere even after
  // gradient softening. Dropping it entirely — the shader's
  // Fresnel rim on the sphere provides all the atmospheric feel
  // and has no external geometry, so no silhouette edge to see.
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
    </group>
  );
}
