"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, PerspectiveCamera, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AstronautController } from "./AstronautController";
import { MoonSurface } from "./MoonSurface";
import { EarthInSky } from "./EarthInSky";
import { WaypointFlag } from "./WaypointFlag";
import { SafeAsset } from "./SafeAsset";
import { WAYPOINTS } from "@/lib/waypoints";
import { sampleTerrainHeight } from "@/lib/terrain";

// Simple heartbeat that logs a frame count once a second. Proves the R3F
// render loop is alive on production — if this stops logging, the tick
// died (Timer/Clock issue, throw in a useFrame, tab throttling, etc.).

// Apollo-style lunar module, fully procedural: gold-foil octagonal descent
// stage, silver ascent stage, four splayed legs with pads. Parked just off
// the spawn path; the controller keeps the astronaut outside its footprint.
const LANDER_X = 10;
const LANDER_Z = 16;

function MoonLander() {
  const baseY = sampleTerrainHeight(LANDER_X, LANDER_Z);
  const legs = [0, 1, 2, 3].map((i) => (i * Math.PI) / 2 + Math.PI / 4);
  return (
    <group position={[LANDER_X, baseY + 1.42, LANDER_Z]} rotation={[0, 0.6, 0]}>
      {/* Descent stage — gold foil octagon */}
      <mesh castShadow>
        <cylinderGeometry args={[2.0, 2.2, 1.25, 8]} />
        <meshStandardMaterial
          color="#d9a441"
          metalness={0.75}
          roughness={0.35}
          flatShading
        />
      </mesh>
      {/* Engine bell */}
      <mesh position={[0, -0.95, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.75, 0.7, 24]} />
        <meshStandardMaterial color="#3a3a3e" metalness={0.9} roughness={0.4} />
      </mesh>
      {/* Legs */}
      {legs.map((a, i) => (
        <group key={i} rotation={[0, a, 0]}>
          <mesh position={[2.6, -0.68, 0]} rotation={[0, 0, 0.8]} castShadow>
            <cylinderGeometry args={[0.055, 0.075, 1.95, 8]} />
            <meshStandardMaterial color="#c8c9cc" metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[2.45, -0.98, 0]} rotation={[0, 0, 1.18]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
            <meshStandardMaterial color="#9d9fa3" metalness={0.8} roughness={0.4} />
          </mesh>
          <mesh position={[3.3, -1.38, 0]} castShadow>
            <cylinderGeometry args={[0.5, 0.62, 0.14, 16]} />
            <meshStandardMaterial color="#d9a441" metalness={0.7} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Ascent stage — silver */}
      <group position={[0, 1.28, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[1.05, 1.35, 1.05, 8]} />
          <meshStandardMaterial
            color="#d7dade"
            metalness={0.85}
            roughness={0.3}
            flatShading
          />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.55, 1.0, 0.5, 8]} />
          <meshStandardMaterial
            color="#c2c6cc"
            metalness={0.85}
            roughness={0.32}
            flatShading
          />
        </mesh>
        {/* Windows */}
        <mesh position={[-0.5, 0.2, -1.08]} rotation={[0, -0.35, 0]}>
          <boxGeometry args={[0.3, 0.34, 0.06]} />
          <meshStandardMaterial color="#0c0e12" roughness={0.2} metalness={0.6} />
        </mesh>
        <mesh position={[0.5, 0.2, -1.08]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[0.3, 0.34, 0.06]} />
          <meshStandardMaterial color="#0c0e12" roughness={0.2} metalness={0.6} />
        </mesh>
        {/* Antenna */}
        <mesh position={[0.55, 1.3, 0.25]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
          <meshStandardMaterial color="#c8c9cc" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0.55, 1.72, 0.25]} scale={[1, 0.4, 1]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#d9a441" metalness={0.75} roughness={0.35} />
        </mesh>
      </group>
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
      <hemisphereLight args={["#aebfe0", "#3a352d", 0.3]} />
      <directionalLight
        position={[45, 26, -18]}
        intensity={3.4}
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
      <ambientLight intensity={0.14} color="#93a8cf" />

      <Stars
        radius={230}
        depth={120}
        count={16000}
        factor={5}
        fade
        speed={0.1}
      />

      {/* MoonSurface & EarthInSky each self-guard their texture fetch with
          SafeAsset, so geometry always renders even if the JPG can't
          load. Nest the whole planet subtree in SafeAsset too as a
          belt-and-braces defense. */}
      <SafeAsset label="moon">
        <MoonSurface />
      </SafeAsset>
      <SafeAsset label="earth">
        <EarthInSky />
      </SafeAsset>

      <SafeAsset label="lander">
        <MoonLander />
      </SafeAsset>

      {/* Visible sun — sits along the key light's direction (10x the light
          position) so every shadow in the scene points away from it. The
          disc is tone-mapping-exempt so Bloom flares it hard. */}
      <mesh position={[450, 260, -180]}>
        <sphereGeometry args={[22, 32, 32]} />
        <meshBasicMaterial color="#fffbe8" fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[450, 260, -180]}>
        <sphereGeometry args={[36, 32, 32]} />
        <meshBasicMaterial
          color="#ffe9a8"
          transparent
          opacity={0.2}
          fog={false}
          toneMapped={false}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

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
          <Vignette eskil={false} offset={0.18} darkness={0.75} />
        </EffectComposer>
      </SafeAsset>
    </Canvas>
  );
}

