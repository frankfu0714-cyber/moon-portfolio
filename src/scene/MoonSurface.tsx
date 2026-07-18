"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";
import {
  sampleTerrainHeight,
  TERRAIN_RADIUS,
  TERRAIN_SEGMENTS,
} from "@/lib/terrain";
import { RockField } from "./RockField";

// Kept in lib/terrain.ts so the walk controller can sample the exact
// same triangle mesh the GPU renders.
const RADIUS = TERRAIN_RADIUS;
const SEGMENTS = TERRAIN_SEGMENTS;

// Applies the moon color texture to the shared material ref. Isolated so a
// texture load failure (e.g. Vercel SSO redirect returning HTML instead of
// JPG) can be caught by SafeAsset without collapsing the whole moon mesh.
function MoonTextureApplier({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const colorMap = useTexture("/textures/moon/color.jpg", (loaded) => {
    const tex = loaded as THREE.Texture;
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.repeat.set(44, 44);
    tex.anisotropy = 16;
    tex.needsUpdate = true;
  });

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      mat.map = colorMap;
      // Reuse the color map as a bump map — cheap micro-relief that makes
      // the regolith catch the low sun instead of reading as flat paint.
      mat.bumpMap = colorMap;
      mat.bumpScale = 0.3;
      // Anti-tiling: the 44x repeat makes the texture's big dark blotches
      // and track lines read as an obvious grid from any height. Patch the
      // map lookup so every fragment blends two decorrelated samples (the
      // second rotated + rescaled so its repeats never line up with the
      // first) selected by a smooth low-frequency noise mask, then modulate
      // brightness with an even lower-frequency noise. The repetition
      // becomes statistically invisible while the close-up detail stays.
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            float mpHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float mpNoise(vec2 p){
              vec2 i = floor(p); vec2 f = fract(p);
              vec2 u = f * f * (3.0 - 2.0 * f);
              return mix(mix(mpHash(i), mpHash(i + vec2(1.0, 0.0)), u.x),
                         mix(mpHash(i + vec2(0.0, 1.0)), mpHash(i + vec2(1.0, 1.0)), u.x), u.y);
            }`,
          )
          .replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
              vec2 mpUv2 = mat2(0.4081, -0.9129, 0.9129, 0.4081) * (vMapUv * 0.3714) + vec2(19.19, 7.33);
              vec4 mpA = texture2D(map, vMapUv);
              vec4 mpB = texture2D(map, mpUv2);
              float mpMask = smoothstep(0.30, 0.70, mpNoise(vMapUv * 0.147));
              vec4 sampledDiffuseColor = mix(mpA, mpB, mpMask);
              float mpVar = mpNoise(vMapUv * 0.043 + 31.7);
              sampledDiffuseColor.rgb *= 0.88 + 0.24 * mpVar;
              diffuseColor *= sampledDiffuseColor;
            #endif`,
          );
      };
      mat.customProgramCacheKey = () => "moon-antitile";
      mat.needsUpdate = true;
    }
  }, [colorMap, materialRef]);

  return null;
}

export function MoonSurface() {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(RADIUS * 2, RADIUS * 2, SEGMENTS, SEGMENTS);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, sampleTerrainHeight(x, z));
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          ref={materialRef}
          color="#dcd9d2"
          roughness={0.98}
          metalness={0}
        />
      </mesh>
      {/* The visible body of the moon: a huge sphere tucked just under the
          curved terrain cap so the horizon shows a round limb in every
          direction — the disc edge can never silhouette against space. */}
      <mesh position={[0, -322, 0]}>
        <sphereGeometry args={[320, 96, 48]} />
        <meshStandardMaterial color="#b9b6ae" roughness={1} metalness={0} />
      </mesh>
      <SafeAsset label="moon-texture">
        <MoonTextureApplier materialRef={materialRef} />
      </SafeAsset>
      <RockField />
    </>
  );
}
