"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

// Cinematic night-side Earth matching the reference frame: deep blue
// globe you can still read continents on, warm glowing city grids, a
// bright sunlit crescent arc on the right limb, and a soft blue
// atmosphere halo. Textures come from the three.js examples repo on
// raw.githubusercontent.com (CORS: *).
const DAY_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg";
const LIGHTS_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png";

const EARTH_R = 42;

function EarthTextureApplier({
  globeRef,
  lightsRef,
}: {
  globeRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  lightsRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const [dayMap, lightsMap] = useTexture(
    [DAY_MAP_URL, LIGHTS_MAP_URL],
    (loaded) => {
      for (const tex of loaded as THREE.Texture[]) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
      }
    },
  );

  useEffect(() => {
    // Unlit basic materials give full control over the look regardless
    // of scene lighting: the day map tinted a luminous night-blue reads
    // as moonlit oceans/continents, and the additive lights layer paints
    // the warm city grid on top so Bloom flares it like the reference.
    const globe = globeRef.current;
    if (globe) {
      globe.map = dayMap;
      globe.color = new THREE.Color("#7d9ecf");
      globe.needsUpdate = true;
    }
    const lights = lightsRef.current;
    if (lights) {
      lights.map = lightsMap;
      lights.visible = true;
      lights.needsUpdate = true;
    }
  }, [dayMap, lightsMap, globeRef, lightsRef]);

  return null;
}

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const globeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightsMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.006;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(performance.now() * 0.0004) * 0.01;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[14, 86, 232]}>
      <group ref={groupRef} rotation={[0.15, 2.6, 0]}>
        {/* Night-blue globe (unlit, brighter than before) */}
        <mesh>
          <sphereGeometry args={[EARTH_R, 64, 64]} />
          <meshBasicMaterial ref={globeMatRef} color="#31435e" fog={false} />
        </mesh>
        {/* Additive city-lights layer - toneMapped:false pushes it past
            the Bloom threshold so the grids genuinely glow. Hidden until
            its texture arrives (a bare white additive sphere would
            otherwise white out the whole globe). */}
        <mesh>
          <sphereGeometry args={[EARTH_R * 1.002, 64, 64]} />
          <meshBasicMaterial
            ref={lightsMatRef}
            visible={false}
            color="#ffb066"
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier globeRef={globeMatRef} lightsRef={lightsMatRef} />
      </SafeAsset>
      {/* Even atmospheric rim - brighter than before */}
      <mesh>
        <sphereGeometry args={[EARTH_R * 1.02, 48, 48]} />
        <meshBasicMaterial
          color="#9ccaff"
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Sunlit crescent: a rim shell displaced toward screen-right
          (-x from the camera's +z view direction) and slightly toward
          the camera, so its visible ring reads as a bright white-blue
          arc hugging the right limb - the reference's crescent. */}
      <mesh position={[-3.2, 1.4, -2.4]}>
        <sphereGeometry args={[EARTH_R * 1.012, 48, 48]} />
        <meshBasicMaterial
          color="#eaf5ff"
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <mesh position={[-1.6, 0.7, -1.2]}>
        <sphereGeometry args={[EARTH_R * 1.006, 48, 48]} />
        <meshBasicMaterial
          color="#cfe6ff"
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Wide soft halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[EARTH_R * 1.14, 48, 48]} />
        <meshBasicMaterial
          color="#6fa8e8"
          transparent
          opacity={0.075}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
