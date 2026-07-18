"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { sampleTerrainHeight } from "@/lib/terrain";

// Procedural Cybertruck: all-planes, no-curves stainless-steel wedge.
// Silhouette follows the reference photo - long hood ramping into a
// steep raked windshield, flat roof running the full cabin length,
// angular hexagonal wheel-arch cutouts, and the signature full-width
// horizontal light bars front and rear.

// Placement: parked between the spawn plaza and the lander so it reads
// from the first frame. Angled so it doesn't sit parallel to the lander.
export const CYBERTRUCK_X = 8;
export const CYBERTRUCK_Z = 8;
export const CYBERTRUCK_ROT_Y = 0.55; // ~31 degrees off axis
export const CYBERTRUCK_COLLISION_R = 2.8;

// Vehicle-local dimensions (X = length, Y = height, Z = width). Squat,
// long, wide stance with chunky off-road tires.
const LENGTH = 4.3;
const WIDTH = 1.72;
const WHEEL_R = 0.42;
const WHEEL_T = 0.36;
const FRONT_AXLE_X = 0.92;
const REAR_AXLE_X = 3.42;
const AXLE_Y = WHEEL_R;

// Wheel-arch cutout geometry. Each arch is a hexagonal notch carved up
// into the body's bottom edge from the wheel center.
const ARCH_HALF = 0.55;
const ARCH_TOP_INSET = 0.10;
const ARCH_TOP_Y = 0.88;
const ARCH_SHOULDER_Y = 0.36;
const BODY_BOTTOM_Y = 0.12;

function pushArch(path: [number, number][], cx: number) {
  // Emitted while walking the bottom edge front->back. The six points
  // trace: down-outer front -> up outer wall -> angled shoulder ->
  // arch top front -> arch top back -> angled shoulder -> back to bottom.
  path.push([cx - ARCH_HALF, BODY_BOTTOM_Y]);
  path.push([cx - ARCH_HALF, ARCH_SHOULDER_Y]);
  path.push([cx - ARCH_HALF + ARCH_TOP_INSET, ARCH_TOP_Y]);
  path.push([cx + ARCH_HALF - ARCH_TOP_INSET, ARCH_TOP_Y]);
  path.push([cx + ARCH_HALF, ARCH_SHOULDER_Y]);
  path.push([cx + ARCH_HALF, BODY_BOTTOM_Y]);
}

// Body outline walked counterclockwise from the front-bottom corner.
// The two hexagonal arches are notches carved up out of the bottom.
// The roof is flat from windshield top all the way to the tailgate
// (short bed + tonneau flush with cabin roofline).
function makeBodyGeometry() {
  const outline: [number, number][] = [];
  outline.push([0.12, BODY_BOTTOM_Y]); // front-bottom
  pushArch(outline, FRONT_AXLE_X); // hexagon notch for front wheels
  pushArch(outline, REAR_AXLE_X); // hexagon notch for rear wheels
  outline.push([LENGTH - 0.05, BODY_BOTTOM_Y]); // rear-bottom
  outline.push([LENGTH - 0.05, 1.10]); // tailgate top
  outline.push([1.95, 1.10]); // roof-front / windshield top (flat roof full cabin+bed)
  outline.push([1.35, 0.72]); // windshield base / hood back
  outline.push([0.45, 0.68]); // hood front / nose ridge back
  outline.push([0.12, 0.55]); // nose top

  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(outline[i][0], outline[i][1]);
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

// Dark tinted glass canopy wrapping windshield -> cabin greenhouse ->
// short rear-window rake. The bottom edge is embedded inside the body
// so only the visible faces (windshield, flat top, rear rake) show.
function makeGlassGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(1.35, 0.72); // windshield base
  shape.lineTo(1.95, 1.12); // windshield top (0.02 above roofline)
  shape.lineTo(2.85, 1.12); // cabin roof back
  shape.lineTo(3.15, 0.72); // rear window base
  shape.closePath();
  const inset = 0.08;
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: WIDTH - inset * 2,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -(WIDTH - inset * 2) / 2);
  return geom;
}

// Materials
const bodyMat = new THREE.MeshStandardMaterial({
  color: "#9a9d9f", // brushed titanium / cool stainless
  metalness: 0.9,
  roughness: 0.4,
  flatShading: true,
});

const glassMat = new THREE.MeshStandardMaterial({
  color: "#0a0d12",
  metalness: 0.55,
  roughness: 0.12,
  flatShading: true,
});

const seamMat = new THREE.MeshStandardMaterial({
  color: "#22252b",
  metalness: 0.4,
  roughness: 0.7,
});

const lightBarMat = new THREE.MeshStandardMaterial({
  color: "#ffeecc",
  emissive: "#ffeecc",
  emissiveIntensity: 2.6,
  metalness: 0,
  roughness: 0.35,
  toneMapped: false,
});

const tireMat = new THREE.MeshStandardMaterial({
  color: "#0d0e13",
  metalness: 0.05,
  roughness: 0.95,
});

const hubMat = new THREE.MeshStandardMaterial({
  color: "#1a1c22",
  metalness: 0.45,
  roughness: 0.55,
});

const hubSpokeMat = new THREE.MeshStandardMaterial({
  color: "#2a2c33",
  metalness: 0.5,
  roughness: 0.5,
});

const interiorGlow = new THREE.MeshBasicMaterial({
  color: "#ff9550",
  toneMapped: false,
  transparent: true,
  opacity: 0.55,
  fog: false,
});

// Wheel: chunky black tire + solid hub cover with a subtle pentagon of
// raised spoke wedges (aero cover, per the brief).
function Wheel({ x, side }: { x: number; side: 1 | -1 }) {
  const zEdge = side * (WIDTH / 2 - WHEEL_T / 2 - 0.02);
  return (
    <group position={[x, AXLE_Y, zEdge]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh material={tireMat} castShadow>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, WHEEL_T, 20]} />
      </mesh>
      <mesh
        material={hubMat}
        position={[0, side * (WHEEL_T / 2 + 0.005), 0]}
      >
        <cylinderGeometry args={[WHEEL_R * 0.78, WHEEL_R * 0.78, 0.02, 20]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            material={hubSpokeMat}
            position={[
              Math.cos(a) * WHEEL_R * 0.42,
              side * (WHEEL_T / 2 + 0.012),
              Math.sin(a) * WHEEL_R * 0.42,
            ]}
            rotation={[0, -a, 0]}
          >
            <boxGeometry args={[WHEEL_R * 0.5, 0.01, WHEEL_R * 0.16]} />
          </mesh>
        );
      })}
      <mesh
        material={hubSpokeMat}
        position={[0, side * (WHEEL_T / 2 + 0.02), 0]}
      >
        <cylinderGeometry args={[WHEEL_R * 0.14, WHEEL_R * 0.14, 0.02, 8]} />
      </mesh>
    </group>
  );
}

// Panel seams — thin dark strips at door + cabin-to-bed edges. Adds
// the visible bodywork panel breaks called out in the brief.
function PanelSeams() {
  return (
    <>
      {[1, -1].map((s) => (
        <mesh
          key={"f" + s}
          material={seamMat}
          position={[1.35, 0.42, (s * WIDTH) / 2 + s * 0.001]}
        >
          <boxGeometry args={[0.02, 0.55, 0.006]} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh
          key={"r" + s}
          material={seamMat}
          position={[2.85, 0.42, (s * WIDTH) / 2 + s * 0.001]}
        >
          <boxGeometry args={[0.02, 0.55, 0.006]} />
        </mesh>
      ))}
    </>
  );
}

export function Cybertruck() {
  const bodyGeom = useMemo(() => makeBodyGeometry(), []);
  const glassGeom = useMemo(() => makeGlassGeometry(), []);

  // Sit the vehicle on the terrain: sample under each wheel and take the
  // lowest ground point so no wheel floats when the terrain pitches.
  const wheelWorld: [number, number][] = [
    [FRONT_AXLE_X, -(WIDTH / 2 - WHEEL_T / 2)],
    [FRONT_AXLE_X, WIDTH / 2 - WHEEL_T / 2],
    [REAR_AXLE_X, -(WIDTH / 2 - WHEEL_T / 2)],
    [REAR_AXLE_X, WIDTH / 2 - WHEEL_T / 2],
  ];
  let ground = sampleTerrainHeight(CYBERTRUCK_X, CYBERTRUCK_Z);
  for (const [lx, lz] of wheelWorld) {
    const wx = LENGTH / 2 - lx;
    const wz = lz;
    const cos = Math.cos(CYBERTRUCK_ROT_Y);
    const sin = Math.sin(CYBERTRUCK_ROT_Y);
    const sx = CYBERTRUCK_X + wx * cos - wz * sin;
    const sz = CYBERTRUCK_Z + wx * sin + wz * cos;
    ground = Math.min(ground, sampleTerrainHeight(sx, sz));
  }
  const y = ground + 0.015;

  return (
    <group
      position={[CYBERTRUCK_X, y, CYBERTRUCK_Z]}
      rotation={[0, CYBERTRUCK_ROT_Y, 0]}
    >
      {/* Recenter so the outer group's origin sits at the middle of the wheelbase */}
      <group position={[-LENGTH / 2, 0, 0]}>
        <mesh geometry={bodyGeom} material={bodyMat} castShadow receiveShadow />
        <mesh geometry={glassGeom} material={glassMat} castShadow />

        {/* Front light bar: thin warm-white slab wrapping the top of
            the front face, protruding just past the nose */}
        <mesh material={lightBarMat} position={[0.06, 0.5, 0]}>
          <boxGeometry args={[0.10, 0.05, WIDTH - 0.06]} />
        </mesh>

        {/* Rear light bar: matching strip mounted on the tailgate,
            near the top */}
        <mesh material={lightBarMat} position={[LENGTH - 0.02, 0.94, 0]}>
          <boxGeometry args={[0.06, 0.06, WIDTH - 0.10]} />
        </mesh>

        <PanelSeams />

        {/* Warm interior glow visible through the tinted windshield */}
        <mesh
          material={interiorGlow}
          position={[1.60, 0.90, 0]}
          rotation={[0, 0, -0.55]}
        >
          <planeGeometry args={[0.55, 0.14]} />
        </mesh>

        <Wheel x={FRONT_AXLE_X} side={-1} />
        <Wheel x={FRONT_AXLE_X} side={1} />
        <Wheel x={REAR_AXLE_X} side={-1} />
        <Wheel x={REAR_AXLE_X} side={1} />
      </group>
    </group>
  );
}
