"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MAX_PUFFS = 24;
const LIFETIME = 0.9; // seconds

type Puff = {
  active: boolean;
  age: number;
  x: number;
  y: number;
  z: number;
};

export type DustPuffsHandle = {
  puff: (x: number, y: number, z: number) => void;
};

export const DustPuffs = forwardRef<DustPuffsHandle>(function DustPuffs(_, ref) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const nextIndex = useRef(0);

  const puffs = useMemo<Puff[]>(
    () =>
      Array.from({ length: MAX_PUFFS }, () => ({
        active: false,
        age: 0,
        x: 0,
        y: 0,
        z: 0,
      })),
    [],
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useImperativeHandle(
    ref,
    () => ({
      puff(x: number, y: number, z: number) {
        const p = puffs[nextIndex.current];
        p.active = true;
        p.age = 0;
        p.x = x + (Math.random() - 0.5) * 0.2;
        p.y = y;
        p.z = z + (Math.random() - 0.5) * 0.2;
        nextIndex.current = (nextIndex.current + 1) % MAX_PUFFS;
      },
    }),
    [puffs],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = puffs[i];
      if (!p.active) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -100, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.age += delta;
      if (p.age >= LIFETIME) {
        p.active = false;
        dummy.scale.setScalar(0);
        dummy.position.set(0, -100, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const t = p.age / LIFETIME;
      const scale = 0.15 + t * 0.55;
      const y = p.y + 0.05 + t * 0.35;
      dummy.position.set(p.x, y, p.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const alpha = 1 - t;
      color.setRGB(0.85 * alpha, 0.82 * alpha, 0.76 * alpha);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_PUFFS]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        color="#d4cec2"
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </instancedMesh>
  );
});
