"use client";

import * as THREE from "three";

// Lunar outpost matching Frank's references: a modular metallic habitat
// (cylindrical modules on stilt legs, solar array, dish antennas, access
// stairs) plus a tall white Starship-style rocket on a launch pad. All
// primitive-built so it ships with zero external assets, with materials
// tuned to the scene's hard low sun.
//
// Both sites sit on terrain graded flat by FLAT_SITES in lib/terrain.ts:
// station at (-30, 20), rocket pad at (34, -20), ground height 0.1.

const GROUND = 0.1;

const hull = new THREE.MeshStandardMaterial({
  color: "#c9cdd3",
  metalness: 0.85,
  roughness: 0.38,
});
const hullDark = new THREE.MeshStandardMaterial({
  color: "#5a5f66",
  metalness: 0.8,
  roughness: 0.45,
});
const frame = new THREE.MeshStandardMaterial({
  color: "#3a3d42",
  metalness: 0.7,
  roughness: 0.5,
});
const solar = new THREE.MeshStandardMaterial({
  color: "#1d2f52",
  metalness: 0.9,
  roughness: 0.25,
});
const windowGlow = new THREE.MeshStandardMaterial({
  color: "#ffd9a0",
  emissive: "#ffb45e",
  emissiveIntensity: 2.2,
  toneMapped: false,
});
const rocketSkin = new THREE.MeshStandardMaterial({
  color: "#f2f3f5",
  metalness: 0.3,
  roughness: 0.42,
});
const padMat = new THREE.MeshStandardMaterial({
  color: "#63666b",
  metalness: 0.2,
  roughness: 0.9,
});
const yellowMat = new THREE.MeshStandardMaterial({
  color: "#e8c33a",
  metalness: 0.3,
  roughness: 0.6,
});
const black = new THREE.MeshStandardMaterial({
  color: "#111318",
  metalness: 0.4,
  roughness: 0.5,
});

// One ribbed horizontal habitat cylinder with end caps and hatch.
function HabModule({
  position,
  length,
  radius,
}: {
  position: [number, number, number];
  length: number;
  radius: number;
}) {
  const ribs = [];
  const nRibs = Math.max(3, Math.round(length / 1.4));
  for (let i = 0; i < nRibs; i++) {
    const x = -length / 2 + (length / (nRibs - 1)) * i;
    ribs.push(
      <mesh key={i} material={frame} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[radius + 0.04, 0.06, 8, 24]} />
      </mesh>,
    );
  }
  return (
    <group position={position}>
      <mesh material={hull} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, length, 24]} />
      </mesh>
      {ribs}
      {/* End caps */}
      <mesh material={hullDark} position={[length / 2 + 0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius * 0.82, radius * 0.82, 0.2, 8]} />
      </mesh>
      <mesh material={hullDark} position={[-length / 2 - 0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius * 0.82, radius * 0.82, 0.2, 8]} />
      </mesh>
      {/* Hatch cross-brace on the front cap */}
      <mesh material={frame} position={[length / 2 + 0.2, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.06, radius * 1.3, 0.14]} />
      </mesh>
      <mesh material={frame} position={[length / 2 + 0.2, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.06, radius * 1.3, 0.14]} />
      </mesh>
      {/* Window strip */}
      <mesh material={windowGlow} position={[0, 0.25, radius - 0.06]}>
        <boxGeometry args={[length * 0.55, 0.28, 0.18]} />
      </mesh>
    </group>
  );
}

function StiltLegs({
  x,
  z,
  y,
  spread,
}: {
  x: number;
  z: number;
  y: number;
  spread: number;
}) {
  const legs: [number, number][] = [
    [spread, spread],
    [-spread, spread],
    [spread, -spread],
    [-spread, -spread],
  ];
  return (
    <group position={[x, 0, z]}>
      {legs.map(([lx, lz], i) => (
        <group key={i} position={[lx, 0, lz]}>
          <mesh material={frame} position={[0, y / 2, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, y, 8]} />
          </mesh>
          <mesh material={frame} position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.3, 0.36, 0.12, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SolarPanel({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={frame} position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
      </mesh>
      <group rotation={[-0.5, 0, 0]}>
        <mesh material={solar} castShadow>
          <boxGeometry args={[3.1, 0.07, 1.9]} />
        </mesh>
        {/* Cell grid lines */}
        {[-1, -0.33, 0.33, 1].map((t, i) => (
          <mesh key={i} material={frame} position={[t * 1.45, 0.045, 0]}>
            <boxGeometry args={[0.04, 0.02, 1.9]} />
          </mesh>
        ))}
        <mesh material={frame} position={[0, 0.045, 0]}>
          <boxGeometry args={[3.1, 0.02, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}

function DishAntenna({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh material={frame} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 1, 8]} />
      </mesh>
      <group position={[0, 1.05, 0]} rotation={[-0.7, 0.4, 0]}>
        <mesh material={hull} castShadow>
          <sphereGeometry args={[0.85, 24, 10, 0, Math.PI * 2, 0, Math.PI / 3.2]} />
        </mesh>
        <mesh material={frame} position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
        </mesh>
        <mesh material={hullDark} position={[0, 0.9, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
        </mesh>
      </group>
    </group>
  );
}

function Stairs({
  position,
  rotationY,
  height,
}: {
  position: [number, number, number];
  rotationY: number;
  height: number;
}) {
  const steps = 6;
  const items = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    items.push(
      <mesh
        key={i}
        material={frame}
        position={[0, height * (1 - t) - 0.05, t * 1.6]}
        castShadow
      >
        <boxGeometry args={[1.1, 0.07, 0.3]} />
      </mesh>,
    );
  }
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {items}
      {/* Rails */}
      <mesh material={frame} position={[0.55, height * 0.55 + 0.35, 0.8]} rotation={[Math.atan2(height, 1.6), 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 2.4]} />
      </mesh>
      <mesh material={frame} position={[-0.55, height * 0.55 + 0.35, 0.8]} rotation={[Math.atan2(height, 1.6), 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 2.4]} />
      </mesh>
    </group>
  );
}

function Station() {
  const moduleY = GROUND + 2.1;
  return (
    <group position={[-30, 0, 20]} rotation={[0, 0.5, 0]}>
      {/* Two main habitat modules + connector */}
      <StiltLegs x={-2.6} z={0} y={moduleY - GROUND} spread={1.7} />
      <StiltLegs x={2.6} z={0.9} y={moduleY - GROUND} spread={1.5} />
      <HabModule position={[-2.6, moduleY, 0]} length={6.4} radius={1.55} />
      <HabModule position={[2.8, moduleY, 0.9]} length={5.2} radius={1.35} />
      <mesh material={hullDark} position={[0.2, moduleY, 0.45]} castShadow>
        <boxGeometry args={[1.6, 1.9, 1.9]} />
      </mesh>
      {/* Roof hardware */}
      <SolarPanel position={[-3.6, moduleY + 2.2, 0]} rotationY={0.15} />
      <SolarPanel position={[-0.4, moduleY + 2.2, 0.4]} rotationY={-0.2} />
      <DishAntenna position={[1.9, moduleY + 1.5, 0.9]} />
      <DishAntenna position={[-1.2, moduleY + 1.7, -0.6]} scale={0.55} />
      {/* Vertical airlock tank on legs */}
      <group position={[6.8, 0, 2.6]}>
        <StiltLegs x={0} z={0} y={1.5} spread={0.9} />
        <mesh material={hull} position={[0, GROUND + 3, 0]} castShadow>
          <cylinderGeometry args={[1.25, 1.25, 3.2, 20]} />
        </mesh>
        <mesh material={hullDark} position={[0, GROUND + 4.75, 0]} castShadow>
          <cylinderGeometry args={[1.27, 1.27, 0.5, 20]} />
        </mesh>
        <mesh material={hullDark} position={[0, GROUND + 5.1, 0]}>
          <sphereGeometry args={[1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} material={frame} position={[0, GROUND + 2.1 + i * 1.1, 0]}>
            <torusGeometry args={[1.29, 0.045, 8, 24]} />
          </mesh>
        ))}
        <mesh material={windowGlow} position={[0, GROUND + 3.4, 1.2]}>
          <boxGeometry args={[0.5, 0.5, 0.16]} />
        </mesh>
      </group>
      {/* Access stairs down from the near module hatch */}
      <Stairs position={[-2.6, GROUND, 1.7]} rotationY={0} height={moduleY - GROUND - 0.9} />
      {/* Ground marker lights */}
      {[[-6.5, 3.5], [5.5, -3], [-4, -4], [8.5, 5.5]].map(([lx, lz], i) => (
        <mesh key={i} material={windowGlow} position={[lx, GROUND + 0.15, lz]}>
          <cylinderGeometry args={[0.08, 0.1, 0.3, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function Rocket() {
  const padTop = GROUND + 0.35;
  const bodyR = 1.9;
  const bodyH = 12.5;
  const legs = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(a);
    const lz = Math.sin(a);
    return (
      <group key={i}>
        <mesh
          material={frame}
          position={[lx * (bodyR + 0.75), padTop + 1.5, lz * (bodyR + 0.75)]}
          rotation={[lz * 0.42, 0, -lx * 0.42]}
          castShadow
        >
          <cylinderGeometry args={[0.1, 0.14, 3.4, 8]} />
        </mesh>
        <mesh material={frame} position={[lx * (bodyR + 1.35), padTop + 0.08, lz * (bodyR + 1.35)]}>
          <cylinderGeometry args={[0.42, 0.5, 0.16, 10]} />
        </mesh>
      </group>
    );
  });
  const fins = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    return (
      <mesh
        key={i}
        material={rocketSkin}
        position={[Math.cos(a) * (bodyR + 0.5), padTop + 1.6, Math.sin(a) * (bodyR + 0.5)]}
        rotation={[0, -a, 0.32]}
        castShadow
      >
        <boxGeometry args={[1.7, 3, 0.14]} />
      </mesh>
    );
  });
  // Dotted porthole band near the top, like the reference render.
  const dots = [];
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + i * 0.23;
    dots.push(
      <mesh
        key={i}
        material={black}
        position={[Math.sin(a) * (bodyR + 0.02), padTop + bodyH - 2.2, -Math.cos(a) * (bodyR + 0.02)]}
        rotation={[0, a, 0]}
      >
        <cylinderGeometry args={[0.09, 0.09, 0.1, 8]} />
      </mesh>,
    );
  }
  // Entrance hatch: faces the spawn plaza (world origin) so you walk up
  // to it naturally. Recessed dark frame, white hatch with a porthole,
  // a glowing entry light, boarding steps and handrails.
  const doorA = Math.atan2(20, -34); // azimuth from pad center toward spawn
  const doorRy = Math.PI / 2 - doorA; // rotates a box's +z face onto that azimuth
  const dX = Math.cos(doorA);
  const dZ = Math.sin(doorA);
  const doorLatX = -dZ; // lateral (sideways) unit vector along the hull
  const doorLatZ = dX;
  const doorY = padTop + 1.2;
  return (
    <group position={[34, 0, -20]}>
      {/* --- Entrance --- */}
      {/* Recessed frame */}
      <mesh material={hullDark} position={[dX * 1.86, doorY + 0.05, dZ * 1.86]} rotation={[0, doorRy, 0]}>
        <boxGeometry args={[1.35, 2.15, 0.16]} />
      </mesh>
      {/* Hatch door, slightly proud of the hull */}
      <mesh material={rocketSkin} position={[dX * 1.98, doorY, dZ * 1.98]} rotation={[0, doorRy, 0]} castShadow>
        <boxGeometry args={[1.05, 1.85, 0.14]} />
      </mesh>
      {/* Porthole window */}
      <group position={[dX * 2.06, doorY + 0.55, dZ * 2.06]} rotation={[0, doorRy, 0]}>
        <mesh material={black} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 16]} />
        </mesh>
      </group>
      {/* Door seam handle */}
      <mesh material={frame} position={[dX * 2.07 + doorLatX * 0.32, doorY - 0.1, dZ * 2.07 + doorLatZ * 0.32]} rotation={[0, doorRy, 0]}>
        <boxGeometry args={[0.07, 0.4, 0.07]} />
      </mesh>
      {/* Glowing entry light above the hatch */}
      <mesh material={windowGlow} position={[dX * 2.0, padTop + 2.42, dZ * 2.0]} rotation={[0, doorRy, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.08]} />
      </mesh>
      {/* Boarding steps up to the sill */}
      <mesh material={padMat} position={[dX * 2.35, padTop + 0.18, dZ * 2.35]} rotation={[0, doorRy, 0]} castShadow>
        <boxGeometry args={[1.25, 0.16, 0.55]} />
      </mesh>
      <mesh material={padMat} position={[dX * 2.85, padTop + 0.08, dZ * 2.85]} rotation={[0, doorRy, 0]} castShadow>
        <boxGeometry args={[1.25, 0.16, 0.55]} />
      </mesh>
      {/* Handrails beside the steps */}
      {[1, -1].map((sgn) => (
        <group key={sgn}>
          <mesh material={frame} position={[dX * 2.6 + doorLatX * sgn * 0.72, padTop + 0.62, dZ * 2.6 + doorLatZ * sgn * 0.72]}>
            <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
          </mesh>
          {/* Top bar runs along the walking direction (radial). */}
          <group position={[dX * 2.6 + doorLatX * sgn * 0.72, padTop + 1.1, dZ * 2.6 + doorLatZ * sgn * 0.72]} rotation={[0, doorRy, 0]}>
            <mesh material={frame} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.75, 8]} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Launch pad + yellow safety ring */}
      <mesh material={padMat} position={[0, GROUND + 0.17, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[6.2, 6.6, 0.36, 36]} />
      </mesh>
      <mesh material={yellowMat} position={[0, padTop + 0.012, 0]}>
        <ringGeometry args={[5.1, 5.55, 36]} />
      </mesh>
      {/* Body */}
      <mesh material={rocketSkin} position={[0, padTop + bodyH / 2, 0]} castShadow>
        <cylinderGeometry args={[bodyR, bodyR, bodyH, 28]} />
      </mesh>
      {/* Dark intertank band */}
      <mesh material={hullDark} position={[0, padTop + bodyH - 3.4, 0]}>
        <cylinderGeometry args={[bodyR + 0.02, bodyR + 0.02, 0.55, 28]} />
      </mesh>
      {dots}
      {/* Nose: two tapers + rounded tip */}
      <mesh material={rocketSkin} position={[0, padTop + bodyH + 1.25, 0]} castShadow>
        <cylinderGeometry args={[1.15, bodyR, 2.5, 28]} />
      </mesh>
      <mesh material={rocketSkin} position={[0, padTop + bodyH + 3.55, 0]} castShadow>
        <cylinderGeometry args={[0.28, 1.15, 2.1, 24]} />
      </mesh>
      <mesh material={rocketSkin} position={[0, padTop + bodyH + 4.6, 0]}>
        <sphereGeometry args={[0.29, 16, 12]} />
      </mesh>
      {/* Little red wordmark */}
      <mesh material={new THREE.MeshStandardMaterial({ color: "#c33b2f", roughness: 0.5 })} position={[0, padTop + 4.6, bodyR + 0.02]}>
        <boxGeometry args={[0.9, 0.22, 0.06]} />
      </mesh>
      {fins}
      {legs}
      {/* Pad floodlights */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 7.4, GROUND, Math.sin(a) * 7.4]}>
            <mesh material={frame} position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 1.1, 8]} />
            </mesh>
            <mesh material={windowGlow} position={[0, 1.15, 0]}>
              <boxGeometry args={[0.34, 0.22, 0.22]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function MoonBase() {
  return (
    <>
      <Station />
      <Rocket />
    </>
  );
}
