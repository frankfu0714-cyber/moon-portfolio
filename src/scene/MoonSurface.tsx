"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";
import { fbm, sampleTerrainHeight } from "@/lib/terrain";

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

  const scatter = useMemo(() => {
    const items: { pos: [number, number, number]; scale: number; rot: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 0.42 + fbm(i, i + 5) * 0.5;
      const r = 25 + fbm(i * 2, i) * 60;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const waypoints: [number, number][] = [
        [12, -6],
        [-4, -18],
        [-16, 4],
      ];
      let ok = true;
      for (const [wx, wz] of waypoints) {
        if (Math.hypot(x - wx, z - wz) < 5) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const y = sampleTerrainHeight(x, z);
      items.push({
        pos: [x, y + 0.25, z],
        scale: 0.6 + fbm(i + 7, i + 11) * 1.6,
        rot: fbm(i + 1, i * 3) * Math.PI * 2,
      });
    }
    return items;
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
      {scatter.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <dodecahedronGeometry args={[s.scale, 0]} />
          <meshStandardMaterial color="#807a6d" roughness={1} flatShading />
        </mesh>
      ))}
    </>
  );
}
