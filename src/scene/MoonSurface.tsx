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
      // Keep just a trace of the source as micro-relief. At the old 0.12
      // strength its large maria shapes repeated in the lighting too; 0.035
      // retains close-up regolith grain without rebuilding the distant grid.
      mat.bumpMap = colorMap;
      mat.bumpScale = 0.035;
      // Anti-tiling: color.jpg is a full 2:1 Moon map, not a tileable ground
      // texture. Its one large dark maria region therefore becomes an
      // unmistakable row/column pattern when repeated 44x. Randomize the
      // source phase independently in every UV cell and smoothly blend the
      // four neighbouring cells. Broad color variation comes from warped
      // FBM rather than from repeated landmarks in the photo; the photo is
      // retained mainly for its convincing close-up crater detail.
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            float mpHash(vec2 p){
              vec3 p3 = fract(vec3(p.xyx) * 0.1031);
              p3 += dot(p3, p3.yzx + 33.33);
              return fract((p3.x + p3.y) * p3.z);
            }
            vec2 mpHash2(vec2 p){
              vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
              p3 += dot(p3, p3.yzx + 33.33);
              return fract((p3.xx + p3.yz) * p3.zy);
            }
            float mpNoise(vec2 p){
              vec2 i = floor(p); vec2 f = fract(p);
              vec2 u = f * f * (3.0 - 2.0 * f);
              return mix(mix(mpHash(i), mpHash(i + vec2(1.0, 0.0)), u.x),
                         mix(mpHash(i + vec2(0.0, 1.0)), mpHash(i + vec2(1.0, 1.0)), u.x), u.y);
            }
            float mpFbm(vec2 p){
              float value = 0.0;
              float amplitude = 0.5;
              mat2 octaveTurn = mat2(1.62, -1.17, 1.17, 1.62);
              for(int i = 0; i < 4; i++){
                value += amplitude * mpNoise(p);
                p = octaveTurn * p + vec2(7.13, 3.71);
                amplitude *= 0.5;
              }
              return value / 0.9375;
            }
            vec4 mpSampleNoTile(sampler2D tex, vec2 uv){
              vec2 cell = floor(uv);
              vec2 f = fract(uv);
              // Keep most of each cell crisp and confine cross-fading to a
              // narrow band. A full-cell Hermite blend hid the grid but also
              // averaged away too much of the source's crater detail.
              vec2 blend = smoothstep(vec2(0.34), vec2(0.66), f);
              vec2 o00 = mpHash2(cell) * 2.0;
              vec2 o10 = mpHash2(cell + vec2(1.0, 0.0)) * 2.0;
              vec2 o01 = mpHash2(cell + vec2(0.0, 1.0)) * 2.0;
              vec2 o11 = mpHash2(cell + vec2(1.0, 1.0)) * 2.0;
              vec4 row0 = mix(texture2D(tex, uv + o00),
                              texture2D(tex, uv + o10), blend.x);
              vec4 row1 = mix(texture2D(tex, uv + o01),
                              texture2D(tex, uv + o11), blend.x);
              return mix(row0, row1, blend.y);
            }`,
          )
          .replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
              vec4 sampledDiffuseColor = mpSampleNoTile(map, vMapUv);
              float mpPhotoLum = dot(sampledDiffuseColor.rgb, vec3(0.3333));
              vec3 mpChroma = sampledDiffuseColor.rgb / max(mpPhotoLum, 0.08);

              // Domain-warped FBM supplies non-periodic maria/regolith
              // variation at two scales. It is evaluated in continuous UV
              // space, so there is no privileged horizontal or vertical
              // direction and no repeating grid to spot from above.
              vec2 mpWarp = vec2(
                mpFbm(vMapUv * 0.035 + vec2(17.3, 4.1)),
                mpFbm(vMapUv * 0.035 + vec2(-8.7, 21.6))
              ) - 0.5;
              float mpMacro = mpFbm(vMapUv * 0.055 + mpWarp * 1.8);
              float mpMeso = mpFbm(vMapUv * 0.19 - mpWarp * 0.65 + vec2(9.2, -5.4));

              // Compress the photo's large landmark contrast but retain its
              // fine crater texture, then restore natural broad variation
              // with the non-repeating procedural field above.
              float mpPhotoDetail = 0.72 + (mpPhotoLum - 0.5) * 0.55;
              float mpNaturalShade = 0.86 + (mpMacro - 0.5) * 0.34
                                           + (mpMeso - 0.5) * 0.10;
              sampledDiffuseColor.rgb = mpChroma * mpPhotoDetail * mpNaturalShade;
              diffuseColor *= sampledDiffuseColor;
            #endif`,
          );
      };
      mat.customProgramCacheKey = () => "moon-stochastic-antitile-v3";
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
          direction — the disc edge can never silhouette against space.
          Scaled 4x with CURVE_RADIUS (see terrain.ts) so the walkable
          area reads as effectively flat. Sphere top still sits at Y=-2
          (just under spawn) — R = 1280 with center Y = -1282. */}
      <mesh position={[0, -1282, 0]}>
        <sphereGeometry args={[1280, 96, 48]} />
        <meshStandardMaterial color="#b9b6ae" roughness={1} metalness={0} />
      </mesh>
      <SafeAsset label="moon-texture">
        <MoonTextureApplier materialRef={materialRef} />
      </SafeAsset>
    </>
  );
}
