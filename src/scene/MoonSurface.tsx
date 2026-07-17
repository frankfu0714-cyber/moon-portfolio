"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";
import { sampleTerrainHeight } from "@/lib/terrain";
import { RockField } from "./RockField";

const RADIUS = 240;
const SEGMENTS = 220;

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
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(22, 22);
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
      mat.bumpScale = 0.18;
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
          color="#cfccc2"
          roughness={0.98}
          metalness={0}
        />
      </mesh>
      <SafeAsset label="moon-texture">
        <MoonTextureApplier materialRef={materialRef} />
      </SafeAsset>
      <RockField />
    </>
  );
}
