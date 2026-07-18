"use client";

import { useMemo, useRef } from "react";
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
