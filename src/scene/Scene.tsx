"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, PerspectiveCamera, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AstronautController } from "./AstronautController";
import { MoonSurface } from "./MoonSurface";
import { EarthInSky } from "./EarthInSky";
import { WaypointFlag } from "./WaypointFlag";
import { SafeAsset } from "./SafeAsset";
import { WAYPOINTS } from "@/lib/waypoints";

// Simple heartbeat that logs a frame count once a second. Proves the R3F
// render loop is alive on production — if this stops logging, the tick
// died (Timer/Clock issue, throw in a useFrame, tab throttling, etc.).
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
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-near={5}
        shadow-camera-far={250}
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
        depth={90}
        count={9000}
        factor={4.5}
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
