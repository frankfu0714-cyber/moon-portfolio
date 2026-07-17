// Deterministic moon-surface height field.
// Same function is called by MoonSurface (per-vertex displacement) and by
// AstronautController / WaypointFlag (per-frame footing) so the visual and
// walked heights can't drift.

import * as THREE from "three";

const WALKABLE_R = 45;

// Radius of the fake planet-curvature: beyond the walkable area the ground
// falls away quadratically (drop = d^2 / 2R) so the horizon reads as the
// limb of a sphere instead of the edge of a flat disc.
const CURVE_START = 40;
const CURVE_RADIUS = 280;

function hash(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const n00 = hash(xi, yi);
  const n10 = hash(xi + 1, yi);
  const n01 = hash(xi, yi + 1);
  const n11 = hash(xi + 1, yi + 1);
  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return nx0 * (1 - v) + nx1 * v;
}

export function fbm(x: number, y: number) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += valueNoise2D(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

export const CRATERS: {
  x: number;
  z: number;
  r: number;
  depth: number;
}[] = (() => {
  const arr: { x: number; z: number; r: number; depth: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const a = (i * 137.508) % (Math.PI * 2);
    const rad = 6 + ((i * 17) % 220);
    const cx = Math.cos(a) * rad;
    const cz = Math.sin(a) * rad;
    if (Math.hypot(cx, cz) < 5) continue;
    const waypoints: [number, number][] = [
      [12, -6],
      [-4, -18],
      [-16, 4],
    ];
    let ok = true;
    for (const [wx, wz] of waypoints) {
      if (Math.hypot(cx - wx, cz - wz) < 5) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const r = 2 + ((i * 7) % 6) + fbm(i, i + 1) * 3;
    // Depth is capped relative to radius so no crater can form a narrow
    // steep-walled pit — steep walls stretch the planar texture into
    // streaks and swallow the astronaut's feet.
    const depth = Math.min(0.35 + fbm(i + 3, i + 5) * 0.9, r * 0.16);
    arr.push({ x: cx, z: cz, r, depth });
  }
  return arr;
})();

// Kept in sync with MoonBase.tsx placements.
export const FLAT_SITES: { x: number; z: number; r: number; h: number }[] = [
  { x: -30, z: 20, r: 15, h: 0.1 },
  { x: 34, z: -20, r: 13, h: 0.1 },
];

export function sampleTerrainHeight(x: number, z: number) {
  const d = Math.hypot(x, z);
  const nearBias = THREE.MathUtils.smoothstep(
    d,
    WALKABLE_R * 0.5,
    WALKABLE_R * 1.8,
  );
  const base = (fbm(x * 0.03, z * 0.03) - 0.5) * 1.5;
  const detail = (fbm(x * 0.12, z * 0.12) - 0.5) * 0.35;
  let h = base * nearBias + detail * 0.6;

  const flatFalloff = THREE.MathUtils.smoothstep(d, 3, WALKABLE_R * 0.7);
  h *= 0.15 + 0.85 * flatFalloff;

  for (const c of CRATERS) {
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.r * 1.4) {
      const t = cd / c.r;
      if (t < 1) {
        h -= (1 - t * t) * c.depth;
      } else {
        const rt = (t - 1) / 0.4;
        h += (1 - rt) * (1 - rt) * c.depth * 0.35;
      }
    }
  }

  // Fine regolith micro-relief so the floor reads detailed up close.
  h += (fbm(x * 0.5 + 7.3, z * 0.5 - 3.1) - 0.5) * 0.1;

  // Graded building sites: terrain blends flat under the moon base and
  // the rocket launch pad so the structures sit level with no gaps.
  for (const f of FLAT_SITES) {
    const fd = Math.hypot(x - f.x, z - f.z);
    if (fd < f.r) {
      const w = 1 - THREE.MathUtils.smoothstep(fd, f.r * 0.55, f.r);
      h = h * (1 - w) + f.h * w;
    }
  }

  // Planet curvature.
  const beyond = Math.max(0, d - CURVE_START);
  h -= (beyond * beyond) / (2 * CURVE_RADIUS);

  return h;
}

// Central-difference slope. Returns d(height)/d(x) and d(height)/d(z) for
// the astronaut's body-pitch calculation.
export function sampleSlope(x: number, z: number, h = 0.5) {
  const hxp = sampleTerrainHeight(x + h, z);
  const hxn = sampleTerrainHeight(x - h, z);
  const hzp = sampleTerrainHeight(x, z + h);
  const hzn = sampleTerrainHeight(x, z - h);
  return {
    dx: (hxp - hxn) / (2 * h),
    dz: (hzp - hzn) / (2 * h),
  };
}
