"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, PerspectiveCamera, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AstronautController } from "./AstronautController";
import { MoonSurface } from "./MoonSurface";
import { EarthInSky } from "./EarthInSky";
import { WaypointFlag } from "./WaypointFlag";
import { WAYPOINTS } from "@/lib/waypoints";

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
        position={[0, 3.2, 6.5]}
      />

      <Suspense fallback={null}>
        <Environment files="/hdri-space.hdr" background={false} />
      </Suspense>

      <hemisphereLight args={["#a9c4ff", "#3b2a1a", 0.4]} />
      <directionalLight
        position={[30, 40, 10]}
        intensity={1.6}
        color="#fff5e0"
      />
      <ambientLight intensity={0.15} color="#8fa8d6" />

      <Stars
        radius={220}
        depth={80}
        count={4000}
        factor={3.5}
        fade
        speed={0.4}
      />

      <Suspense fallback={null}>
        <MoonSurface />
        <EarthInSky />
      </Suspense>

      {WAYPOINTS.map((w) => (
        <WaypointFlag key={w.id} waypoint={w} />
      ))}

      <Suspense fallback={null}>
        <AstronautController />
      </Suspense>

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={0.7}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.25}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.15} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
