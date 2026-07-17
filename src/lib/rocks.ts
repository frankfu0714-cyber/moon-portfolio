// Deterministic rock placement, shared between RockField (rendering) and
// AstronautController (collision). Keeping placement in one module means the
// rocks you see and the rocks you bump into can never drift apart.

import * as THREE from "three";

export function seededRand(n: number) {
  const s = Math.sin(n * 91.371 + 17.5) * 43758.5453;
  return s - Math.floor(s);
}

export type RockPlacement = {
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
  // Approximate footprint radius in world units, used for collision.
  collisionRadius: number;
};

const WAYPOINTS: [number, number][] = [
  [12, -6],
  [-4, -18],
  [-16, 4],
];

export const VARIANT_COUNT = 8;
const ROCK_COUNT = 46;

// Mid-distance weighted radial samples. Rejects rocks inside 4 units of
// spawn (astronaut origin) and 3 units of waypoints so the walking path
// isn't obstructed.
function placeRocks(): RockPlacement[] {
  const out: RockPlacement[] = [];
  let seed = 100;
  let placed = 0;
  let guard = 0;
  while (placed < ROCK_COUNT && guard < ROCK_COUNT * 40) {
    guard++;
    seed++;

    const a = seededRand(seed) * Math.PI * 2;
    // Beta-ish distribution - square-rooted uniform pushes mass outward,
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

    // Size: mostly 0.5-1.0, tail out to 2.0, plus 2 hero rocks.
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

    // Rock tone - pale sunlit regolith boulders, slightly darker than the
    // surface so they still read as solid debris.
    const tone = 0.5 + seededRand(seed + 31) * 0.14;
    const warm = seededRand(seed + 33) - 0.5;
    const color = new THREE.Color(
      tone + warm * 0.03,
      tone,
      tone - warm * 0.02,
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
      // The rock mesh is a displaced unit icosahedron, so its footprint is
      // roughly the larger horizontal scale. 0.85 keeps the collider just
      // inside the visual silhouette so you can brush against the surface
      // without an invisible-wall feel.
      collisionRadius: Math.max(scaleX, scaleZ) * 0.85,
    });
    placed++;
  }
  return out;
}

export const ROCKS: RockPlacement[] = placeRocks();

// Astronaut body radius for rock collision.
const BODY_RADIUS = 0.42;

/**
 * Push a position out of any rock collider it overlaps. Mutates and returns
 * the same object. Circle-vs-circle resolution in the XZ plane; sliding
 * falls out naturally because only the penetrating component is removed.
 * Small rocks (below ankle height) are ignored - the astronaut can step
 * over pebbles.
 */
export function resolveRockCollision(pos: { x: number; z: number }) {
  for (const rock of ROCKS) {
    // Pebbles under ~0.35 units tall aren't obstacles.
    if (rock.scaleY < 0.35) continue;
    const minDist = rock.collisionRadius + BODY_RADIUS;
    const dx = pos.x - rock.x;
    const dz = pos.z - rock.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) continue;
    const dist = Math.sqrt(distSq);
    if (dist < 1e-5) {
      // Dead-center overlap - push out along +x deterministically.
      pos.x = rock.x + minDist;
      continue;
    }
    const push = (minDist - dist) / dist;
    pos.x += dx * push;
    pos.z += dz * push;
  }
  return pos;
}
