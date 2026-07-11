"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

function EarthTextureApplier({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const earthMap = useTexture("/textures/earth/color.jpg");

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      mat.map = earthMap;
      mat.needsUpdate = true;
    }
  }, [earthMap, materialRef]);

  return null;
}

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(performance.now() * 0.0006) * 0.02;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[-40, 55, -110]}>
      <group ref={groupRef}>
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[7, 48, 48]} />
          <meshStandardMaterial
            ref={materialRef}
            color="#4a7ba8"
            emissive="#0a1a2a"
            emissiveIntensity={0.45}
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier materialRef={materialRef} />
      </SafeAsset>
      <mesh ref={glowRef}>
        <sphereGeometry args={[7.6, 32, 32]} />
        <meshBasicMaterial
          color="#7fb8ff"
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
