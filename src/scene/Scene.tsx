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
      shadows={false}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#05060a", 1);
      }}
    >
      <PerspectiveCamera
        makeDefault
        fov={55}
        near={0.1}
        far={800}
        position={[0, 3.2, -6.5]}
      />

      <fog attach="fog" args={["#0a0d15", 40, 180]} />

      {/* HDR environment lighting is nice-to-have. On production behind
          Vercel SSO the .hdr fetch redirects to an HTML login page, which
          RGBELoader can't parse and would throw — SafeAsset swallows
          that so the fixed lights below still light the scene. */}
      <SafeAsset label="hdri">
        <Environment files="/hdri-space.hdr" background={false} />
      </SafeAsset>

      {/* Baseline lighting that renders the scene even without the HDR. */}
      <hemisphereLight args={["#a9c4ff", "#3b2a1a", 0.55]} />
      <directionalLight
        position={[30, 40, 10]}
        intensity={1.8}
        color="#fff5e0"
      />
      <directionalLight
        position={[-20, 12, -30]}
        intensity={0.4}
        color="#7fb3ff"
      />
      <ambientLight intensity={0.25} color="#8fa8d6" />

      <Stars
        radius={220}
        depth={80}
        count={4000}
        factor={3.5}
        fade
        speed={0.4}
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
            intensity={0.7}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.15} darkness={0.7} />
        </EffectComposer>
      </SafeAsset>
    </Canvas>
  );
}
