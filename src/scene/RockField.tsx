"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { fbm, sampleTerrainHeight } from "@/lib/terrain";

// Deterministic rand seeded by an integer.
function seededRand(n: number) {
  const s = Math.sin(n * 91.371 + 17.5) * 43758.5453;
  return s - Math.floor(s);
}

// Build one rock geometry. Icosahedron subdiv 3 gives 642 vertices —
// enough for organic-looking noise displacement without shipping a heavy
// asset. Displacement uses the same fBm the terrain uses so the surfaces
// share a family resemblance.
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

type Placement = {
  variant: number;
  x: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotY: number;
  rotX: number;
  rotZ: number;
  color: THREE.Color;
};

const WAYPOINTS: [number, number][] = [
  [12, -6],
  [-4, -18],
  [-16, 4],
];

const VARIANT_COUNT = 8;
const ROCK_COUNT = 46;

// Mid-distance weighted radial samples. Rejects rocks inside 4 units of
// spawn (astronaut origin) and 3 units of waypoints so the walking path
// isn't obstructed.
function placeRocks(): Placement[] {
  const out: Placement[] = [];
  let seed = 100;
  let placed = 0;
  let guard = 0;
  while (placed < ROCK_COUNT && guard < ROCK_COUNT * 40) {
    guard++;
    seed++;

    const a = seededRand(seed) * Math.PI * 2;
    // Beta-ish distribution — square-rooted uniform pushes mass outward,
    // then we cap at 30 to keep boulders in view.
    const rBase = seededRand(seed + 1);
    const r = 5 + Math.sqrt(rBase) * 25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    if (Math.hypot(x, z) < 4) continue;
    let blocked = false;
    for (const [wx, wz] of WAYPOINTS) {
      if (Math.hypot(x - wx, z - wz) < 3) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    // Reject anything too close to a rock we already placed.
    let tooClose = false;
    for (const p of out) {
      if (Math.hypot(x - p.x, z - p.z) < 1.4) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Size: mostly 0.5–1.0, tail out to 2.0, plus 2 hero rocks.
    const isHero = placed < 2;
    const sRoll = seededRand(seed + 7);
    let base = isHero ? 1.75 + seededRand(seed + 8) * 0.35 : 0.4 + sRoll * sRoll * 1.4;
    base = THREE.MathUtils.clamp(base, 0.3, 2.1);

    // Non-uniform scale: flatter along Y, slightly stretched in X or Z.
    const stretch = 0.85 + seededRand(seed + 11) * 0.35;
    const scaleX = base * stretch;
    const scaleZ = base * (1.7 - stretch);
    const scaleY = base * (0.55 + seededRand(seed + 13) * 0.35);

    const rotY = seededRand(seed + 21) * Math.PI * 2;
    const rotX = (seededRand(seed + 22) - 0.5) * 0.28;
    const rotZ = (seededRand(seed + 23) - 0.5) * 0.28;

    // Rock tone — darker than the moon surface so they read as denser
    // basalt-like debris rather than dust.
    const tone = 0.32 + seededRand(seed + 31) * 0.18;
    const warm = seededRand(seed + 33) - 0.5;
    const color = new THREE.Color(
      tone + warm * 0.04,
      tone,
      tone - warm * 0.03,
    );

    out.push({
      variant: Math.floor(seededRand(seed + 41) * VARIANT_COUNT),
      x,
      z,
      scaleX,
      scaleY,
      scaleZ,
      rotY,
      rotX,
      rotZ,
      color,
    });
    placed++;
  }
  return out;
}

export function RockField() {
  const variants = useMemo(
    () => Array.from({ length: VARIANT_COUNT }, (_, i) => makeRock(i + 1)),
    [],
  );
  const rocks = useMemo(() => placeRocks(), []);

  return (
    <group>
      {rocks.map((r, i) => {
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
