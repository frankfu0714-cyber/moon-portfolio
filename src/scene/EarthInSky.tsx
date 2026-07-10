"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const earthMap = useTexture("/textures/earth/color.jpg");

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
            map={earthMap}
            emissive="#0a1a2a"
            emissiveIntensity={0.35}
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      </group>
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
