"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, PerspectiveCamera, Stars, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AstronautController } from "./AstronautController";
import { MoonSurface } from "./MoonSurface";
import { EarthInSky } from "./EarthInSky";
import { WaypointFlag } from "./WaypointFlag";
import { MoonBase } from "./MoonBase";
import { SafeAsset } from "./SafeAsset";
import { WAYPOINTS } from "@/lib/waypoints";
import { sampleTerrainHeight } from "@/lib/terrain";

// Simple heartbeat that logs a frame count once a second. Proves the R3F
// render loop is alive on production — if this stops logging, the tick
// died (Timer/Clock issue, throw in a useFrame, tab throttling, etc.).

// Apollo lunar module parked just off the spawn path; the controller
// keeps the astronaut outside its footprint.
const LANDER_X = 10;
const LANDER_Z = 16;

// NASA's official Apollo Lunar Module model (public domain, textured,
// ~65k verts) served from raw.githubusercontent.com (CORS: *). Matches
// the realism of the Sketchfab astronaut far better than primitives.
const LM_URL =
  "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Apollo%20Lunar%20Module/Apollo%20Lunar%20Module.glb";
useGLTF.preload(LM_URL);

function MoonLander() {
  const gltf = useGLTF(LM_URL);
  const baseY = sampleTerrainHeight(LANDER_X, LANDER_Z);

  useMemo(() => {
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  return (
    <group position={[LANDER_X, baseY - 0.12, LANDER_Z]} rotation={[0, 0.6, 0]}>
      <primitive object={gltf.scene} scale={1.15} />
    </group>
  );
}


// Procedural sun glare: a camera-facing sprite with a canvas-painted
// radial gradient (blazing core, warm bloom, horizontal lens streak).
// Reads like a real sun flare instead of a flat white ball, and Bloom
// amplifies the toneMapped:false core.
function makeSunTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0.0, "rgba(255,255,255,1)");
  glow.addColorStop(0.05, "rgba(255,252,235,1)");
  glow.addColorStop(0.1, "rgba(255,243,200,0.85)");
  glow.addColorStop(0.22, "rgba(255,220,150,0.32)");
  glow.addColorStop(0.45, "rgba(255,200,110,0.1)");
  glow.addColorStop(0.7, "rgba(255,190,100,0.03)");
  glow.addColorStop(1.0, "rgba(255,190,100,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Horizontal lens streak
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(1, 0.07);
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.95);
  streak.addColorStop(0, "rgba(255,250,230,0.9)");
  streak.addColorStop(0.4, "rgba(255,235,180,0.35)");
  streak.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = streak;
  ctx.fillRect(-c, -c, size, size);
  ctx.restore();

  // Shorter vertical streak
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(0.05, 0.55);
  const vstreak = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.8);
  vstreak.addColorStop(0, "rgba(255,250,230,0.7)");
  vstreak.addColorStop(0.4, "rgba(255,235,180,0.22)");
  vstreak.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = vstreak;
  ctx.fillRect(-c * 20, -c, size * 20, size);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural Mars: a small rusty globe hanging in the sky opposite Earth.
// Canvas-painted texture (ochre base, darker maria blotches, a hint of a
// polar cap) so there is no external fetch to fail; a faint warm halo
// sprite sells the atmosphere.
function makeMarsTexture() {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Base rust gradient — slightly lighter equator.
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#8a4a2a");
  base.addColorStop(0.35, "#b5602f");
  base.addColorStop(0.55, "#c1713a");
  base.addColorStop(0.75, "#a5552c");
  base.addColorStop(1, "#7d4526");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Deterministic pseudo-random blotches (darker basalt plains).
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = h * 0.15 + rand() * h * 0.7;
    const r = 6 + rand() * 34;
    const dark = 0.05 + rand() * 0.16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(60,30,18,${dark})`);
    g.addColorStop(1, "rgba(60,30,18,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Lighter dusty highlands.
  for (let i = 0; i < 60; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 8 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(235,180,130,0.09)");
    g.addColorStop(1, "rgba(235,180,130,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // North polar cap.
  const cap = ctx.createLinearGradient(0, 0, 0, h * 0.16);
  cap.addColorStop(0, "rgba(245,240,235,0.85)");
  cap.addColorStop(1, "rgba(245,240,235,0)");
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, w, h * 0.16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMarsHaloTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, "rgba(255,170,110,0.10)");
  g.addColorStop(0.40, "rgba(255,175,115,0.16)");
  g.addColorStop(0.48, "rgba(255,180,120,0.22)");
  g.addColorStop(0.60, "rgba(255,160,100,0.10)");
  g.addColorStop(0.80, "rgba(255,150,90,0.03)");
  g.addColorStop(1.0, "rgba(255,150,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MARS_R = 11;

function MarsInSky() {
  const texture = useMemo(() => makeMarsTexture(), []);
  const halo = useMemo(() => makeMarsHaloTexture(), []);
  const globeRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (globeRef.current) globeRef.current.rotation.y += delta * 0.01;
  });
  // Halo canvas: glow ring peaks at 0.5 of the half-size → globe radius
  // maps to 0.42..0.5; scale so the ring hugs the limb.
  const haloScale = MARS_R * (1 / 0.46) * 2;
  return (
    <group position={[-215, 118, 96]}>
      <group ref={globeRef} rotation={[0.1, 1.2, 0.05]}>
        <mesh>
          <sphereGeometry args={[MARS_R, 48, 48]} />
          {/* Lambert shading gives a soft cosine terminator from the scene
              sun; the faint emissive keeps the night side from going fully
              black so the limb fades out gradually instead of a hard edge. */}
          <meshLambertMaterial map={texture} fog={false} emissive="#2a1409" />
        </mesh>
      </group>
      <sprite position={[0, 0, 0]} scale={[haloScale, haloScale, 1]}>
        <spriteMaterial
          map={halo}
          transparent
          depthWrite={false}
          depthTest={false}
          fog={false}
          blending={THREE.AdditiveBlending}
          opacity={0.55}
        />
      </sprite>
    </group>
  );
}

// Shooting stars: a small pool of glowing streaks that fire across the
// upper sky every few seconds, each a camera-facing elongated sprite
// with a painted head-to-tail gradient. toneMapped:false lets Bloom put
// a hot core on them.
const METEOR_COUNT = 14;
const METEOR_MIN_WAIT = 0.6;
const METEOR_MAX_WAIT = 4;

function makeMeteorTexture() {
  const w = 256;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Tail: long horizontal gradient, bright head on the right.
  const tail = ctx.createLinearGradient(0, 0, w, 0);
  tail.addColorStop(0, "rgba(160,190,255,0)");
  tail.addColorStop(0.55, "rgba(190,210,255,0.18)");
  tail.addColorStop(0.85, "rgba(230,240,255,0.6)");
  tail.addColorStop(1, "rgba(255,255,255,0.95)");
  ctx.fillStyle = tail;
  // Taper the tail vertically with a soft mask.
  for (let y = 0; y < h; y++) {
    const t = 1 - Math.abs(y - h / 2) / (h / 2);
    ctx.globalAlpha = Math.pow(t, 2.2);
    ctx.fillRect(0, y, w, 1);
  }
  ctx.globalAlpha = 1;
  // Hot head.
  const head = ctx.createRadialGradient(w - 14, h / 2, 0, w - 14, h / 2, 16);
  head.addColorStop(0, "rgba(255,255,255,1)");
  head.addColorStop(0.4, "rgba(235,244,255,0.7)");
  head.addColorStop(1, "rgba(210,225,255,0)");
  ctx.fillStyle = head;
  ctx.fillRect(w - 32, 0, 32, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _q = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);

type MeteorState = {
  active: boolean;
  wait: number;
  life: number;
  ttl: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  len: number;
};

function Meteors() {
  const texture = useMemo(() => makeMeteorTexture(), []);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const states = useRef<MeteorState[]>(
    Array.from({ length: METEOR_COUNT }, (_, i) => ({
      active: false,
      wait: 1 + i * 1.7, // stagger the first volley
      life: 0,
      ttl: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      len: 20,
    })),
  );

  const spawn = (m: MeteorState) => {
    // Start high on a wide sky shell, streak mostly sideways-down.
    const az = Math.random() * Math.PI * 2;
    const r = 170 + Math.random() * 60;
    const y = 110 + Math.random() * 110;
    m.pos.set(Math.cos(az) * r, y, Math.sin(az) * r);
    const dirAz = az + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = 90 + Math.random() * 110;
    m.vel.set(
      Math.cos(dirAz) * speed,
      -(18 + Math.random() * 45),
      Math.sin(dirAz) * speed,
    );
    m.ttl = 0.7 + Math.random() * 0.9;
    m.life = 0;
    m.len = 14 + Math.random() * 22;
    m.active = true;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const cam = state.camera;
    for (let i = 0; i < METEOR_COUNT; i++) {
      const m = states.current[i];
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      if (!m.active) {
        m.wait -= dt;
        mesh.visible = false;
        if (m.wait <= 0) spawn(m);
        continue;
      }
      m.life += dt;
      if (m.life >= m.ttl) {
        m.active = false;
        m.wait = METEOR_MIN_WAIT + Math.random() * (METEOR_MAX_WAIT - METEOR_MIN_WAIT);
        mesh.visible = false;
        continue;
      }
      m.pos.addScaledVector(m.vel, dt);
      mesh.visible = true;
      mesh.position.copy(m.pos);
      // Billboard the quad to the camera, then spin it in-plane so its X
      // axis lines up with the velocity as seen on screen.
      _q.copy(cam.quaternion);
      _v.copy(m.vel).applyQuaternion(_qInv.copy(cam.quaternion).invert());
      _q.multiply(_qz.setFromAxisAngle(_zAxis, Math.atan2(_v.y, _v.x)));
      mesh.quaternion.copy(_q);
      // Fade in fast, fade out at the end of life.
      const t = m.life / m.ttl;
      const fade = Math.min(1, t * 6) * (1 - Math.pow(t, 3));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = fade;
      mesh.scale.set(m.len, m.len * 0.16, 1);
    }
  });

  return (
    <group>
      {Array.from({ length: METEOR_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          visible={false}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={0}
            depthWrite={false}
            fog={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function SunInSky() {
  const texture = useMemo(() => makeSunTexture(), []);
  return (
    <sprite position={[450, 130, -180]} scale={[300, 300, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        fog={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}

// Soft light-blue glow hugging the horizon all around, like the faint
// haze above the hills in the reference frame. A big back-side dome with
// a vertical canvas gradient centered just above the equator.
function makeHorizonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  // canvas y=0 is the dome's zenith (v=1), y=512 the nadir (v=0);
  // the horizon sits at y=256.
  g.addColorStop(0.0, "rgba(150,190,235,0)");
  g.addColorStop(0.4, "rgba(150,190,235,0)");
  g.addColorStop(0.46, "rgba(150,190,235,0.05)");
  g.addColorStop(0.5, "rgba(170,205,242,0.14)");
  g.addColorStop(0.53, "rgba(182,212,246,0.2)");
  g.addColorStop(0.58, "rgba(168,203,240,0.1)");
  g.addColorStop(0.66, "rgba(150,190,235,0)");
  g.addColorStop(1.0, "rgba(150,190,235,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function HorizonGlow() {
  const texture = useMemo(() => makeHorizonTexture(), []);
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[290, 48, 48]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </mesh>
  );
}

// Futuristic boundary fence: a glowing neon ring marking the edge of the
// walkable cap (WALK_BOUND = 120 in the controller). Cyberpunk vibe per
// the reference — dark metal posts with a thin blue light strip, plus two
// continuous neon rails that follow the terrain around the full circle.
// toneMapped:false + Bloom makes the rails read as real neon tubes.
const FENCE_R = 122;
const FENCE_POSTS = 144;
const FENCE_CURVE_SAMPLES = 220;

function fenceRailCurve(yOffset: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < FENCE_CURVE_SAMPLES; i++) {
    const a = (i / FENCE_CURVE_SAMPLES) * Math.PI * 2;
    const x = Math.cos(a) * FENCE_R;
    const z = Math.sin(a) * FENCE_R;
    pts.push(new THREE.Vector3(x, sampleTerrainHeight(x, z) + yOffset, z));
  }
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
}

function FutureFence() {
  const { railTop, railMid, railDark, posts, strips } = useMemo(() => {
    const railTop = new THREE.TubeGeometry(
      fenceRailCurve(1.52),
      720,
      0.05,
      6,
      true,
    );
    const railMid = new THREE.TubeGeometry(
      fenceRailCurve(1.08),
      720,
      0.04,
      6,
      true,
    );
    const railDark = new THREE.TubeGeometry(
      fenceRailCurve(0.55),
      720,
      0.07,
      6,
      true,
    );

    // Instance matrices for the posts + their glow strips.
    const posts: THREE.Matrix4[] = [];
    const strips: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < FENCE_POSTS; i++) {
      const a = (i / FENCE_POSTS) * Math.PI * 2;
      const x = Math.cos(a) * FENCE_R;
      const z = Math.sin(a) * FENCE_R;
      const y = sampleTerrainHeight(x, z);
      q.setFromAxisAngle(up, -a);
      // Post spans well below the terrain sample and above the top rail so
      // rail-curve smoothing can never leave a floating rail with no post,
      // and the post stays visible from both sides at a distance.
      m.compose(new THREE.Vector3(x, y + 0.65, z), q, new THREE.Vector3(1, 1, 1));
      posts.push(m.clone());
      // Light strip on the inward face of the post.
      const ix = Math.cos(a) * (FENCE_R - 0.24);
      const iz = Math.sin(a) * (FENCE_R - 0.24);
      m.compose(
        new THREE.Vector3(ix, y + 0.95, iz),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      strips.push(m.clone());
    }
    return { railTop, railMid, railDark, posts, strips };
  }, []);

  const postRef = useRef<THREE.InstancedMesh>(null);
  const stripRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (postRef.current) {
      posts.forEach((mat, i) => postRef.current!.setMatrixAt(i, mat));
      postRef.current.instanceMatrix.needsUpdate = true;
    }
    if (stripRef.current) {
      strips.forEach((mat, i) => stripRef.current!.setMatrixAt(i, mat));
      stripRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [posts, strips]);

  // Slow neon pulse on the rails.
  const topMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const midMatRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (topMatRef.current) {
      topMatRef.current.color.setHSL(0.58, 1, 0.62 + Math.sin(t * 1.3) * 0.06);
    }
    if (midMatRef.current) {
      midMatRef.current.color.setHSL(0.6, 1, 0.5 + Math.sin(t * 1.3 + 1.7) * 0.06);
    }
  });

  return (
    <group>
      <mesh geometry={railTop}>
        <meshBasicMaterial ref={topMatRef} color="#6fb8ff" toneMapped={false} fog={false} />
      </mesh>
      <mesh geometry={railMid}>
        <meshBasicMaterial ref={midMatRef} color="#2f6dff" toneMapped={false} fog={false} />
      </mesh>
      <mesh geometry={railDark}>
        <meshStandardMaterial color="#171a22" roughness={0.6} metalness={0.6} />
      </mesh>
      <instancedMesh ref={postRef} args={[undefined, undefined, FENCE_POSTS]} castShadow>
        <boxGeometry args={[0.3, 2.5, 0.3]} />
        <meshStandardMaterial color="#14161c" roughness={0.55} metalness={0.65} />
      </instancedMesh>
      <instancedMesh ref={stripRef} args={[undefined, undefined, FENCE_POSTS]}>
        <boxGeometry args={[0.06, 1.5, 0.06]} />
        <meshBasicMaterial color="#4f9dff" toneMapped={false} fog={false} />
      </instancedMesh>
    </group>
  );
}

function FrameLoopHeartbeat() {
  const frames = useRef(0);
  const lastLog = useRef(0);
  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (now - lastLog.current > 1000) {
      console.log(`[R3F heartbeat] frames=${frames.current}`);
      lastLog.current = now;
    }
  });
  return null;
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#020308", 1);
      }}
    >
      <PerspectiveCamera
        makeDefault
        fov={55}
        near={0.1}
        far={800}
        position={[0, 3.2, -6.5]}
      />

      {/* Crisper horizon: fog starts far out and only softens the very
          edge of the terrain disc. */}
      <fog attach="fog" args={["#04050a", 100, 380]} />

      {/* HDR environment lighting is nice-to-have. On production behind
          Vercel SSO the .hdr fetch redirects to an HTML login page, which
          RGBELoader can't parse and would throw — SafeAsset swallows
          that so the fixed lights below still light the scene. */}
      <SafeAsset label="hdri">
        <Environment files="/hdri-space.hdr" background={false} />
      </SafeAsset>

      {/* Cinematic lunar lighting: one hard low sun that casts real
          shadows (rocks + astronaut), almost no fill — deep black shadow
          sides like the reference footage. */}
      <hemisphereLight args={["#aebfe0", "#3a352d", 0.2]} />
      <directionalLight
        position={[45, 13, -18]}
        intensity={2.5}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={5}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={[-20, 12, -30]}
        intensity={0.22}
        color="#7fb3ff"
      />
      <ambientLight intensity={0.09} color="#93a8cf" />

      <Stars
        radius={230}
        depth={120}
        count={16000}
        factor={5}
        fade
        speed={0.1}
      />

      <HorizonGlow />

      {/* MoonSurface & EarthInSky each self-guard their texture fetch with
          SafeAsset, so geometry always renders even if the JPG can't
          load. Nest the whole planet subtree in SafeAsset too as a
          belt-and-braces defense. */}
      <SafeAsset label="moon">
        <MoonSurface />
        <MoonBase />
      </SafeAsset>
      <SafeAsset label="earth">
        <EarthInSky />
      </SafeAsset>

      <SafeAsset label="lander">
        <MoonLander />
      </SafeAsset>

      {/* Visible sun glare sprite along the key light's direction (10x
          the light position) so every shadow points away from it. */}
      <SunInSky />
      <MarsInSky />
      <Meteors />
      <FutureFence />

      {WAYPOINTS.map((w) => (
        <WaypointFlag key={w.id} waypoint={w} />
      ))}

      <AstronautController />

      <FrameLoopHeartbeat />

      {/* Post-processing is a nice-to-have — if the composer fails to
          initialize on a given driver / browser, we still want the raw scene
          to render rather than a black canvas. SafeAsset lets R3F fall back
          to its default render loop when EffectComposer errors. */}
      <SafeAsset label="post">
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom
            intensity={0.85}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      </SafeAsset>
    </Canvas>
  );
}
