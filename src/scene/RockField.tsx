"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { fbm, sampleTerrainHeight } from "@/lib/terrain";
import { ROCKS, VARIANT_COUNT, seededRand } from "@/lib/rocks";

// Build one rock geometry. Icosahedron subdiv 4 gives enough vertices for
// organic-looking noise displacement without shipping a heavy asset.
// Displacement uses the same fBm the terrain uses so the surfaces share a
// family resemblance.
function makeRock(seed: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1, 4);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  const ox = seed * 13.7;
  const oy = seed * 27.1;
  const oz = seed * 41.3;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Three planar fBm samples averaged so the displacement doesn't have
    // an obvious axis of symmetry.
    let disp = 0;
    let amp = 1;
    let freq = 2.4;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      const s1 = fbm((v.x + ox) * freq, (v.y + oy) * freq);
      const s2 = fbm((v.y + oy) * freq, (v.z + oz) * freq);
      const s3 = fbm((v.z + oz) * freq, (v.x + ox) * freq);
      disp += amp * ((s1 + s2 + s3) / 3);
      norm += amp;
      amp *= 0.5;
      freq *= 2.05;
    }
    disp = disp / norm - 0.5;

    // Scale each vertex outward/inward by the local noise. Amount varies
    // per rock so silhouettes differ.
    const perRockGain = 0.75 + seededRand(seed + 3) * 0.55;
    const s = 1 + disp * perRockGain;
    v.multiplyScalar(s);

    // Flatten the underside so the rock reads as sitting on the ground
    // rather than a floating boulder.
    if (v.y < 0) v.y *= 0.6;

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export function RockField() {
  const variants = useMemo(
    () => Array.from({ length: VARIANT_COUNT }, (_, i) => makeRock(i + 1)),
    [],
  );

  return (
    <group>
      {ROCKS.map((r, i) => {
        // Slight bury so the flat bottom disappears under the terrain.
        const y = sampleTerrainHeight(r.x, r.z) + r.scaleY * 0.55;
        return (
          <mesh
            key={i}
            geometry={variants[r.variant]}
            position={[r.x, y, r.z]}
            rotation={[r.rotX, r.rotY, r.rotZ]}
            scale={[r.scaleX, r.scaleY, r.scaleZ]}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial
              color={r.color}
              roughness={0.92}
              metalness={0}
            />
          </mesh>
        );
      })}
    </group>
  );
}
