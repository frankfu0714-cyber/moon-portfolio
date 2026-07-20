"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleMeshHeight } from "@/lib/terrain";

type Rock = {
  x: number;
  z: number;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  shade: number;
};

const CLEAR_ZONES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 7.5], // astronaut spawn and the main camera reveal
  [10, 16, 5.5], // Apollo lander
  [-8, 11, 5.5], // parked Cybertruck
  [-30, 20, 16.5], // habitat cluster
  [34, -20, 14.5], // rocket pad
  [-12, -36, 11.5], // neon tower compound
  [12, -6, 4.5], // waypoint rings
  [-4, -18, 4.5],
  [-16, 4, 4.5],
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isClear(x: number, z: number) {
  return CLEAR_ZONES.every(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) > radius);
}

function makeRock(
  x: number,
  z: number,
  radius: number,
  random: () => number,
): Rock {
  const sx = radius * (0.8 + random() * 0.75);
  const sy = radius * (0.45 + random() * 0.42);
  const sz = radius * (0.72 + random() * 0.7);
  return {
    x,
    z,
    scale: new THREE.Vector3(sx, sy, sz),
    rotation: new THREE.Euler(
      (random() - 0.5) * 0.34,
      random() * Math.PI * 2,
      (random() - 0.5) * 0.28,
    ),
    shade: 0.72 + random() * 0.3,
  };
}

function generateRocks() {
  const random = mulberry32(0x4d4f4f4e);
  const pebbles: Rock[] = [];
  const boulders: Rock[] = [];

  // Loose clusters look geological, unlike an even Poisson carpet. Each
  // cluster mixes mostly hand-sized stones with an occasional anchor rock.
  for (let cluster = 0; cluster < 24; cluster++) {
    const angle = random() * Math.PI * 2;
    const distance = 10 + Math.sqrt(random()) * 101;
    const centerX = Math.cos(angle) * distance;
    const centerZ = Math.sin(angle) * distance;
    const count = 4 + Math.floor(random() * 7);
    for (let i = 0; i < count; i++) {
      const scatterAngle = random() * Math.PI * 2;
      const scatter = Math.pow(random(), 1.7) * (2.3 + random() * 5.2);
      const x = centerX + Math.cos(scatterAngle) * scatter;
      const z = centerZ + Math.sin(scatterAngle) * scatter;
      if (Math.hypot(x, z) > 116 || !isClear(x, z)) continue;
      const isBoulder = i === 0 && random() > 0.42;
      const radius = isBoulder
        ? 0.48 + random() * 0.58
        : 0.075 + Math.pow(random(), 1.8) * 0.32;
      (isBoulder ? boulders : pebbles).push(makeRock(x, z, radius, random));
    }
  }

  // A few solitary rocks keep the spaces between clusters from feeling
  // deliberately empty, while retaining broad clear walking corridors.
  for (let i = 0; i < 34; i++) {
    const angle = random() * Math.PI * 2;
    const distance = 11 + Math.sqrt(random()) * 104;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (!isClear(x, z)) continue;
    pebbles.push(makeRock(x, z, 0.09 + random() * 0.24, random));
  }

  return { pebbles, boulders };
}

function RockInstances({ rocks, boulder = false }: { rocks: Rock[]; boulder?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    rocks.forEach((rock, index) => {
      scratch.position.set(
        rock.x,
        sampleMeshHeight(rock.x, rock.z) + rock.scale.y * 0.42,
        rock.z,
      );
      scratch.rotation.copy(rock.rotation);
      scratch.scale.copy(rock.scale);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
      color.setRGB(rock.shade * 0.88, rock.shade * 0.86, rock.shade * 0.82);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [color, rocks, scratch]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, rocks.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      {boulder ? (
        <dodecahedronGeometry args={[1, 0]} />
      ) : (
        <icosahedronGeometry args={[1, 0]} />
      )}
      <meshStandardMaterial
        color="#9a9790"
        roughness={1}
        metalness={0}
        flatShading
        vertexColors
      />
    </instancedMesh>
  );
}

export function MoonRocks() {
  const rocks = useMemo(generateRocks, []);
  return (
    <group>
      <RockInstances rocks={rocks.pebbles} />
      <RockInstances rocks={rocks.boulders} boulder />
    </group>
  );
}
