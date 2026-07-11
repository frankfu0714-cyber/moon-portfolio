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
    tex.repeat.set(28, 28);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  });

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      mat.map = colorMap;
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
          color="#8f8878"
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
