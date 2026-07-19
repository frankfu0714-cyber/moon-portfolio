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

// The globe's radius in canvas pixels (out of a 512px square). Used
// by the atmospheric halo sprite behind the mesh.
const CANVAS_GLOBE_R = 150;

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

// Painted halo: a smooth radial gradient behind the globe. No fake
// sun-side crescent any more — the shader draws that per-fragment on
// the physically correct hemisphere.
function makeAtmosphereTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  const atm = ctx.createRadialGradient(c, c, 0, c, c, c);
  atm.addColorStop(0.0, "rgba(120,170,240,0)");
  atm.addColorStop(0.52, "rgba(120,170,240,0)");
  atm.addColorStop(0.575, "rgba(150,195,255,0.32)");
  atm.addColorStop(0.62, "rgba(120,170,240,0.18)");
  atm.addColorStop(0.72, "rgba(100,150,225,0.08)");
  atm.addColorStop(0.85, "rgba(90,140,215,0.03)");
  atm.addColorStop(1.0, "rgba(90,140,215,0)");
  ctx.fillStyle = atm;
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

    // Fresnel-based atmospheric limb glow: max at grazing view
    // angles, and GATED by sun-facing. The shadowed limb gets no
    // rim contribution at all (previous version added a faint haze
    // that read as an unwanted bright arc on the night limb).
    // Sharper falloff (pow 3.2) so the arc is a thin crescent on
    // the sunlit edge, not a fat halo.
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
    float sunAmount = clamp(sunFacing, 0.0, 1.0);
    vec3 atmoSun = vec3(0.55, 0.78, 1.15);
    color += atmoSun * rim * sunAmount * 1.1;

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

  // Sprite scale: the canvas globe radius must project to EARTH_R
  // world units, so full canvas width (256 px half) maps to this many
  // world units. Keep the halo billboard slightly larger than the
  // globe so its outer glow fringes past the mesh limb.
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
      {/* Symmetric atmospheric halo behind the globe — no baked-in
          crescent any more, since the shader draws the sunlit limb
          on the physically correct side. This sprite just adds the
          soft outer haze past the mesh silhouette. */}
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
