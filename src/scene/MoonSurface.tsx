"use client";

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const RADIUS = 240;
const SEGMENTS = 220;
const WALKABLE_R = 45;

// Deterministic hash-based value noise. Not fast, not pretty, but only runs once.
function hash(x: number, y: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
function valueNoise2D(x: number, y: number) {
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
function fbm(x: number, y: number) {
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

// Places pseudo-random craters at fixed seeds so bakes are deterministic.
const CRATERS: { x: number; z: number; r: number; depth: number }[] = (() => {
  const arr: { x: number; z: number; r: number; depth: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const a = (i * 137.508) % (Math.PI * 2);
    const rad = 6 + ((i * 17) % 220);
    // Skip anywhere too close to spawn / waypoints for gameplay.
    const cx = Math.cos(a) * rad;
    const cz = Math.sin(a) * rad;
    if (Math.hypot(cx, cz) < 5) continue;
    // Skip any within 4 units of the three waypoints.
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
    arr.push({
      x: cx,
      z: cz,
      r: 2 + ((i * 7) % 6) + fbm(i, i + 1) * 3,
      depth: 0.35 + fbm(i + 3, i + 5) * 0.9,
    });
  }
  return arr;
})();

function heightAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  // Rolling terrain, bigger amplitude farther from the walkable area.
  const nearBias = THREE.MathUtils.smoothstep(d, WALKABLE_R * 0.5, WALKABLE_R * 1.8);
  const base = (fbm(x * 0.03, z * 0.03) - 0.5) * 2.5;
  const detail = (fbm(x * 0.12, z * 0.12) - 0.5) * 0.5;
  let h = base * nearBias + detail * 0.6;

  // Central plateau near spawn stays mostly flat so the walk feels grounded.
  const flatFalloff = THREE.MathUtils.smoothstep(d, 3, WALKABLE_R * 0.7);
  h *= 0.15 + 0.85 * flatFalloff;

  // Craters — quadratic bowl with a lifted rim.
  for (const c of CRATERS) {
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.r * 1.4) {
      const t = cd / c.r;
      if (t < 1) {
        h -= (1 - t * t) * c.depth;
      } else {
        // Rim lift
        const rt = (t - 1) / 0.4;
        h += (1 - rt) * (1 - rt) * c.depth * 0.35;
      }
    }
  }

  return h;
}

export function MoonSurface() {
  const colorMap = useTexture("/textures/moon/color.jpg");

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(RADIUS * 2, RADIUS * 2, SEGMENTS, SEGMENTS);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    return geom;
  }, []);

  useEffect(() => {
    // The three.js Texture API is imperative — drei's useTexture returns a
    // mutable Texture, but the React Compiler flags hook returns as
    // frozen. This is a well-known pattern in R3F; suppress the check.
    /* eslint-disable react-hooks/immutability */
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.RepeatWrapping;
    colorMap.repeat.set(28, 28);
    colorMap.anisotropy = 8;
    colorMap.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
  }, [colorMap]);

  // Mid-distance scatter of small mounds/boulders so the ground has depth
  // without walling off the sky.
  const scatter = useMemo(() => {
    const items: { pos: [number, number, number]; scale: number; rot: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 0.42 + fbm(i, i + 5) * 0.5;
      const r = 25 + fbm(i * 2, i) * 60;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Skip anything that would clip a waypoint.
      const waypoints: [number, number][] = [
        [12, -6],
        [-4, -18],
        [-16, 4],
      ];
      let ok = true;
      for (const [wx, wz] of waypoints) {
        if (Math.hypot(x - wx, z - wz) < 5) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const y = heightAt(x, z);
      items.push({
        pos: [x, y + 0.25, z],
        scale: 0.6 + fbm(i + 7, i + 11) * 1.6,
        rot: fbm(i + 1, i * 3) * Math.PI * 2,
      });
    }
    return items;
  }, []);

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={colorMap}
          color="#b8b2a4"
          roughness={0.98}
          metalness={0}
        />
      </mesh>
      {scatter.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <dodecahedronGeometry args={[s.scale, 0]} />
          <meshStandardMaterial color="#807a6d" roughness={1} flatShading />
        </mesh>
      ))}
    </>
  );
}
