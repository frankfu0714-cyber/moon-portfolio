"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Capacity — enough for several bursts overlapping at max walk speed
// (~1.8 Hz cycle × 2 halves × 12 particles × 0.8s lifetime ≈ 35 concurrent).
const CAPACITY = 96;
const LIFETIME = 0.8;

type Particle = {
  active: boolean;
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type DustPuffsHandle = {
  puff: (x: number, z: number) => void;
  ambient: (x: number, z: number) => void;
};

function makeDustTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(240,236,224,0.55)");
  grad.addColorStop(1, "rgba(240,236,224,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const DustPuffs = forwardRef<DustPuffsHandle>(function DustPuffs(_, ref) {
  const pointsRef = useRef<THREE.Points>(null);
  const nextIndex = useRef(0);

  const texture = useMemo(() => makeDustTexture(), []);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: CAPACITY }, () => ({
        active: false,
        age: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      })),
    [],
  );

  const positions = useMemo(() => new Float32Array(CAPACITY * 3), []);
  const alphas = useMemo(() => new Float32Array(CAPACITY), []);
  const sizes = useMemo(() => new Float32Array(CAPACITY), []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setDrawRange(0, CAPACITY);
    // Hide inactive particles far below the ground initially.
    for (let i = 0; i < CAPACITY; i++) {
      positions[i * 3 + 1] = -1000;
    }
    return g;
  }, [positions, alphas, sizes]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      texture.dispose();
    };
  }, [geometry, texture]);

  const spawn = (x: number, z: number, burst: boolean) => {
    const count = burst ? 8 + Math.floor(Math.random() * 5) : 1;
    for (let n = 0; n < count; n++) {
      const idx = nextIndex.current;
      const p = particles[idx];
      p.active = true;
      p.age = 0;
      // Small jitter around the foot.
      const jitterR = burst ? 0.12 : 0.08;
      const jTheta = Math.random() * Math.PI * 2;
      p.x = x + Math.cos(jTheta) * jitterR * Math.random();
      p.z = z + Math.sin(jTheta) * jitterR * Math.random();
      p.y = 0.02 + Math.random() * 0.03;
      // Outward + up velocity for bursts; a soft drift for ambient.
      const outward = burst ? 0.35 + Math.random() * 0.5 : 0.05;
      const upward = burst ? 0.35 + Math.random() * 0.5 : 0.12;
      p.vx = Math.cos(jTheta) * outward;
      p.vz = Math.sin(jTheta) * outward;
      p.vy = upward;
      nextIndex.current = (nextIndex.current + 1) % CAPACITY;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      puff(x, z) {
        spawn(x, z, true);
      },
      ambient(x, z) {
        spawn(x, z, false);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    // Advance particles.
    for (let i = 0; i < CAPACITY; i++) {
      const p = particles[i];
      if (!p.active) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      p.age += delta;
      const t = p.age / LIFETIME;
      if (t >= 1) {
        p.active = false;
        alphas[i] = 0;
        sizes[i] = 0;
        positions[i * 3 + 1] = -1000;
        continue;
      }
      // Ease-out on horizontal, gravity-lite on vertical.
      const drag = 1 - t * 0.85;
      p.x += p.vx * drag * delta;
      p.z += p.vz * drag * delta;
      p.y += p.vy * drag * delta;
      p.vy -= 0.4 * delta; // gentle settle

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      // Alpha: fade 0 -> 0.65 -> 0 over lifetime.
      const fadeIn = Math.min(t / 0.15, 1);
      const fadeOut = 1 - Math.max((t - 0.15) / 0.85, 0);
      alphas[i] = 0.65 * fadeIn * fadeOut;
      // Size in world units: 0.03 -> 0.15.
      sizes[i] = 0.03 + t * 0.12;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        args={[
          {
            uniforms: {
              uTexture: { value: texture },
            },
            vertexShader: /* glsl */ `
              attribute float aAlpha;
              attribute float aSize;
              varying float vAlpha;
              void main() {
                vAlpha = aAlpha;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                // aSize is in world units — scale to pixels by projection.
                gl_PointSize = aSize * 380.0 / -mv.z;
                gl_Position = projectionMatrix * mv;
              }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uTexture;
              varying float vAlpha;
              void main() {
                if (vAlpha <= 0.001) discard;
                vec4 tex = texture2D(uTexture, gl_PointCoord);
                gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
              }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
          },
        ]}
      />
    </points>
  );
});
