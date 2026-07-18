"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { sampleTerrainHeight } from "@/lib/terrain";

// Procedural Tesla Cybertruck: angular polygonal wedge body extruded from
// a side-view silhouette, dark tinted glass cabin, and four chunky wheels.
// Faithful to the truck's iconic all-planes-no-curves aesthetic and
// friendly to the moon scene's low-poly reference vocabulary.

// Placement: parked between the spawn plaza and the lander so it reads
// from the first frame — 10+ units from the lander center and clear of
// the sail farm's collision circles. Angled so it doesn't sit boringly
// parallel to the lander.
export const CYBERTRUCK_X = 8;
export const CYBERTRUCK_Z = 8;
export const CYBERTRUCK_ROT_Y = 0.55; // ~31 degrees off axis
export const CYBERTRUCK_COLLISION_R = 2.4;

// Vehicle-local dimensions (X = length, Y = height, Z = width).
const LENGTH = 3.2;
const WIDTH = 1.35;
const WHEEL_R = 0.34;
const WHEEL_T = 0.28;
const BODY_LIFT = WHEEL_R; // sit the body atop the wheel radius

// Side silhouette in vehicle-local (X, Y). All angular — no curves.
// The classic Cybertruck wedge: low pointed nose, hood ramp to raked
// windshield, short flat roof, back-window rake down to bed, vertical
// tailgate. Kept as one continuous outline so it extrudes cleanly.
const BODY_PROFILE: [number, number][] = [
  [0.18, 0.10],       // front bumper bottom
  [0.02, 0.36],       // pointed nose
  [0.38, 0.66],       // hood front
  [1.05, 0.66],       // windshield base
  [1.48, 1.05],       // roof front (windshield rake)
  [2.25, 1.05],       // roof back
  [2.55, 0.60],       // rear window base
  [3.10, 0.55],       // tailgate top
  [3.10, 0.10],       // tailgate bottom
];

function makeBodyGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(BODY_PROFILE[0][0], BODY_PROFILE[0][1]);
  for (let i = 1; i < BODY_PROFILE.length; i++) {
    shape.lineTo(BODY_PROFILE[i][0], BODY_PROFILE[i][1]);
  }
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: WIDTH,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -WIDTH / 2);
  return geom;
}

// Dark tinted glass wedge that sits on top of the body's shoulder line,
// covering windshield through rear window (Cybertruck-style continuous
// canopy). Inset slightly on Z so the metal shoulder is visible on the
// sides instead of glass wrapping the full width.
const GLASS_PROFILE: [number, number][] = [
  [1.05, 0.66],
  [1.48, 1.05],
  [2.25, 1.05],
  [2.55, 0.60],
];
const GLASS_INSET = 0.06;

function makeGlassGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(GLASS_PROFILE[0][0], GLASS_PROFILE[0][1]);
  for (let i = 1; i < GLASS_PROFILE.length; i++) {
    shape.lineTo(GLASS_PROFILE[i][0], GLASS_PROFILE[i][1]);
  }
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: WIDTH - GLASS_INSET * 2,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -(WIDTH - GLASS_INSET * 2) / 2);
  return geom;
}

const bodyMat = new THREE.MeshStandardMaterial({
  color: "#b4b8bd",
  metalness: 0.85,
  roughness: 0.35,
  flatShading: true,
});

const glassMat = new THREE.MeshStandardMaterial({
  color: "#0a0d12",
  metalness: 0.5,
  roughness: 0.15,
  flatShading: true,
});

const wheelMat = new THREE.MeshStandardMaterial({
  color: "#12131a",
  metalness: 0.15,
  roughness: 0.85,
});

const hubMat = new THREE.MeshStandardMaterial({
  color: "#4a4e57",
  metalness: 0.9,
  roughness: 0.3,
});

const interiorGlow = new THREE.MeshBasicMaterial({
  color: "#ff9550",
  toneMapped: false,
  transparent: true,
  opacity: 0.65,
  fog: false,
});

// Four wheel positions in vehicle-local space (X, Z). Wheels sit under
// the axle line at Y = WHEEL_R (body base is at Y = WHEEL_R too).
const WHEEL_INSET_X = 0.55;
const WHEEL_INSET_Z = 0.03;
const WHEEL_POSITIONS: [number, number][] = [
  [WHEEL_INSET_X, -(WIDTH / 2 - WHEEL_INSET_Z)],
  [WHEEL_INSET_X, WIDTH / 2 - WHEEL_INSET_Z],
  [LENGTH - WHEEL_INSET_X, -(WIDTH / 2 - WHEEL_INSET_Z)],
  [LENGTH - WHEEL_INSET_X, WIDTH / 2 - WHEEL_INSET_Z],
];

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, WHEEL_R, z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh material={wheelMat} castShadow>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, WHEEL_T, 18]} />
      </mesh>
      {/* Hub cap on the outward face */}
      <mesh
        material={hubMat}
        position={[0, z > 0 ? WHEEL_T / 2 + 0.005 : -(WHEEL_T / 2 + 0.005), 0]}
      >
        <cylinderGeometry args={[WHEEL_R * 0.55, WHEEL_R * 0.55, 0.02, 12]} />
      </mesh>
    </group>
  );
}

export function Cybertruck() {
  const bodyGeom = useMemo(() => makeBodyGeometry(), []);
  const glassGeom = useMemo(() => makeGlassGeometry(), []);

  // Sit the vehicle on the terrain. Sample the ground under the truck's
  // footprint and take the lowest so no wheel floats when the terrain
  // pitches mildly, but the truck as a whole reads level.
  let ground = sampleTerrainHeight(CYBERTRUCK_X, CYBERTRUCK_Z);
  for (const [lx, lz] of WHEEL_POSITIONS) {
    const wx = LENGTH / 2 - lx;
    const wz = lz;
    const cos = Math.cos(CYBERTRUCK_ROT_Y);
    const sin = Math.sin(CYBERTRUCK_ROT_Y);
    const sx = CYBERTRUCK_X + wx * cos - wz * sin;
    const sz = CYBERTRUCK_Z + wx * sin + wz * cos;
    ground = Math.min(ground, sampleTerrainHeight(sx, sz));
  }
  const y = ground + 0.02;

  return (
    <group
      position={[CYBERTRUCK_X, y, CYBERTRUCK_Z]}
      rotation={[0, CYBERTRUCK_ROT_Y, 0]}
    >
      {/* Recenter so the vehicle origin is the middle of the wheelbase */}
      <group position={[-LENGTH / 2, 0, 0]}>
        <mesh geometry={bodyGeom} material={bodyMat} castShadow receiveShadow />
        <mesh geometry={glassGeom} material={glassMat} castShadow />
        {/* Warm interior glow visible through the tinted windshield */}
        <mesh
          material={interiorGlow}
          position={[1.35, 0.88, 0]}
          rotation={[0, 0, -0.75]}
        >
          <planeGeometry args={[0.5, 0.18]} />
        </mesh>
        {WHEEL_POSITIONS.map(([x, z], i) => (
          <Wheel key={i} x={x} z={z} />
        ))}
      </group>
    </group>
  );
}
