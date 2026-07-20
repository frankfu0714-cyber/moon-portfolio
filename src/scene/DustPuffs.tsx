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

// Enough headroom for layered powder + grain bursts while running, landing,
// and overlapping with hover wash. Still one draw call.
const CAPACITY = 448;

type Particle = {
  active: boolean;
  age: number;
  life: number;
  startSize: number;
  endSize: number;
  opacity: number;
  gravity: number;
  drag: number;
  shade: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type DustPuffsHandle = {
  puff: (
    x: number,
    y: number,
    z: number,
    strength?: number,
    directionX?: number,
    directionZ?: number,
  ) => void;
  ambient: (x: number, y: number, z: number) => void;
  landing: (x: number, y: number, z: number, strength: number) => void;
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
        life: 1,
        startSize: 0,
        endSize: 0,
        opacity: 0,
        gravity: 0,
        drag: 0,
        shade: 1,
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
  const colors = useMemo(() => new Float32Array(CAPACITY * 3), []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    g.setDrawRange(0, CAPACITY);
    // Hide inactive particles far below the ground initially.
    for (let i = 0; i < CAPACITY; i++) {
      positions[i * 3 + 1] = -1000;
    }
    return g;
  }, [positions, alphas, sizes, colors]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      texture.dispose();
    };
  }, [geometry, texture]);

  // kind: footstep kick, ambient wisp, or landing burst.
  const spawn = (
    x: number,
    y: number,
    z: number,
    kind: "step" | "ambient" | "burst",
    strength = 1,
    directionX = 0,
    directionZ = 0,
  ) => {
    const directionLength = Math.hypot(directionX, directionZ);
    const backX = directionLength > 1e-4 ? -directionX / directionLength : 0;
    const backZ = directionLength > 1e-4 ? -directionZ / directionLength : 0;
    const count =
      kind === "burst"
        ? Math.round((34 + Math.random() * 12) * strength)
        : kind === "step"
          ? Math.round((22 + Math.random() * 8) * strength)
          : 1;
    for (let n = 0; n < count; n++) {
      const idx = nextIndex.current;
      const p = particles[idx];
      p.active = true;
      p.age = 0;
      const finePowder = kind === "ambient" || Math.random() < (kind === "burst" ? 0.72 : 0.64);
      const jitterR = kind === "burst" ? 0.22 : kind === "step" ? 0.14 : 0.08;
      const jTheta = Math.random() * Math.PI * 2;
      p.x = x + Math.cos(jTheta) * jitterR * Math.random();
      p.z = z + Math.sin(jTheta) * jitterR * Math.random();
      p.y = y + 0.035 + Math.random() * 0.07;
      if (finePowder) {
        const outward =
          kind === "burst"
            ? (0.34 + Math.random() * 0.52) * strength
            : kind === "step"
              ? (0.13 + Math.random() * 0.34) * strength
              : 0.025;
        const backKick = kind === "step" ? (0.12 + Math.random() * 0.3) * strength : 0;
        p.vx = Math.cos(jTheta) * outward + backX * backKick;
        p.vz = Math.sin(jTheta) * outward + backZ * backKick;
        p.vy = kind === "burst" ? 0.15 + Math.random() * 0.32 : kind === "step" ? 0.07 + Math.random() * 0.19 : 0.065;
        p.life = kind === "burst" ? 1.45 + Math.random() * 0.75 : kind === "step" ? 0.9 + Math.random() * 0.55 : 1.2;
        p.startSize = kind === "burst" ? 0.085 : 0.045;
        p.endSize = (kind === "burst" ? 0.56 : kind === "step" ? 0.44 : 0.2) * (0.75 + Math.random() * 0.5);
        p.opacity = kind === "ambient" ? 0.2 : kind === "burst" ? 0.5 : 0.5;
        p.gravity = 0.1;
        p.drag = 1.35;
        p.shade = 0.76 + Math.random() * 0.16;
      } else {
        // Brighter grains follow short lunar ballistic arcs while the powder
        // stays close to the surface. Their small size prevents a spark look.
        const outward =
          (kind === "burst" ? 0.58 + Math.random() * 0.88 : 0.34 + Math.random() * 0.64) * strength;
        const backKick = kind === "step" ? (0.18 + Math.random() * 0.38) * strength : 0;
        p.vx = Math.cos(jTheta) * outward + backX * backKick;
        p.vz = Math.sin(jTheta) * outward + backZ * backKick;
        p.vy = (kind === "burst" ? 0.4 + Math.random() * 0.62 : 0.24 + Math.random() * 0.46) * strength;
        p.life = kind === "burst" ? 0.8 + Math.random() * 0.58 : 0.52 + Math.random() * 0.4;
        p.startSize = 0.012 + Math.random() * 0.014;
        p.endSize = p.startSize * (1.15 + Math.random() * 0.5);
        p.opacity = 0.62 + Math.random() * 0.2;
        p.gravity = 0.72;
        p.drag = 0.32;
        p.shade = 0.86 + Math.random() * 0.14;
      }
      nextIndex.current = (nextIndex.current + 1) % CAPACITY;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      puff(x, y, z, strength, directionX, directionZ) {
        spawn(x, y, z, "step", strength, directionX, directionZ);
      },
      ambient(x, y, z) {
        spawn(x, y, z, "ambient");
      },
      landing(x, y, z, strength) {
        spawn(x, y, z, "burst", strength);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    for (let i = 0; i < CAPACITY; i++) {
      const p = particles[i];
      if (!p.active) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      p.age += delta;
      const t = p.age / p.life;
      if (t >= 1) {
        p.active = false;
        alphas[i] = 0;
        sizes[i] = 0;
        positions[i * 3 + 1] = -1000;
        continue;
      }
      const damping = Math.exp(-p.drag * delta);
      p.vx *= damping;
      p.vz *= damping;
      p.x += p.vx * delta;
      p.z += p.vz * delta;
      p.y += p.vy * delta;
      p.vy -= p.gravity * delta;

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      const fadeIn = Math.min(t / 0.09, 1);
      const fadeOut = 1 - Math.max((t - 0.16) / 0.84, 0);
      alphas[i] = p.opacity * fadeIn * fadeOut * fadeOut;
      const easedGrow = 1 - Math.pow(1 - t, 2);
      sizes[i] = THREE.MathUtils.lerp(p.startSize, p.endSize, easedGrow);
      colors[i * 3] = p.shade * 1.02;
      colors[i * 3 + 1] = p.shade;
      colors[i * 3 + 2] = p.shade * 0.94;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
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
              attribute vec3 aColor;
              varying float vAlpha;
              varying vec3 vColor;
              void main() {
                vAlpha = aAlpha;
                vColor = aColor;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * 380.0 / -mv.z;
                gl_Position = projectionMatrix * mv;
              }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uTexture;
              varying float vAlpha;
              varying vec3 vColor;
              void main() {
                if (vAlpha <= 0.001) discard;
                vec4 tex = texture2D(uTexture, gl_PointCoord);
                gl_FragColor = vec4(tex.rgb * vColor, tex.a * vAlpha);
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
