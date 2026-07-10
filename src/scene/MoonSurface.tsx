"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const RADIUS = 200;

export function MoonSurface() {
  const colorMap = useTexture("/textures/moon/color.jpg");

  const geometry = useMemo(() => {
    const geom = new THREE.CircleGeometry(RADIUS, 96);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, []);

  useMemo(() => {
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.RepeatWrapping;
    colorMap.repeat.set(20, 20);
    colorMap.anisotropy = 8;
  }, [colorMap]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        map={colorMap}
        color="#c8c2b6"
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}
