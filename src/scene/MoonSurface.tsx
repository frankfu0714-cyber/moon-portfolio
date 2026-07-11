"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

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

const CRATERS: { x: number; z: number; r: number; depth: number }[] = (() => {
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
  const nearBias = THREE.MathUtils.smoothstep(d, WALKABLE_R * 0.5, WALKABLE_R * 1.8);
  const base = (fbm(x * 0.03, z * 0.03) - 0.5) * 2.5;
  const detail = (fbm(x * 0.12, z * 0.12) - 0.5) * 0.5;
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

  return h;
}

// Applies the moon color texture to the shared material ref. Isolated so a
// texture load failure (e.g. Vercel SSO redirect returning HTML instead of
// JPG) can be caught by SafeAsset without collapsing the whole moon mesh.
function MoonTextureApplier({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const colorMap = useTexture("/textures/moon/color.jpg", (loaded) => {
    const tex = loaded as THREE.Texture;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(28, 28);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  });

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      mat.map = colorMap;
      mat.needsUpdate = true;
    }
  }, [colorMap, materialRef]);

  return null;
}

export function MoonSurface() {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

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

  const scatter = useMemo(() => {
    const items: { pos: [number, number, number]; scale: number; rot: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 0.42 + fbm(i, i + 5) * 0.5;
      const r = 25 + fbm(i * 2, i) * 60;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
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
          ref={materialRef}
          color="#8f8878"
          roughness={0.98}
          metalness={0}
        />
      </mesh>
      <SafeAsset label="moon-texture">
        <MoonTextureApplier materialRef={materialRef} />
      </SafeAsset>
      {scatter.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <dodecahedronGeometry args={[s.scale, 0]} />
          <meshStandardMaterial color="#807a6d" roughness={1} flatShading />
        </mesh>
      ))}
    </>
  );
}
