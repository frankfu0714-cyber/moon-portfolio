"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type AstronautHandle = {
  group: THREE.Group | null;
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

const SUIT = "#f2f0ea";
const SUIT_ACCENT = "#c9c4b8";
const VISOR = "#0d1224";
const ACCENT = "#ff9d4a";

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const bodyBob = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const lastFootstepStep = useRef(0);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
  }));

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const speedSquared =
      (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    // Walk cycle advances proportional to speed. At speed=1.2 (max), ~2 Hz.
    const cycleSpeed = Math.min(speed / 1.2, 1) * Math.PI * 2 * 1.8;
    walkPhase.current += cycleSpeed * delta;

    const walkAmount = Math.min(speed / 1.2, 1);
    const swing = Math.sin(walkPhase.current) * 0.55 * walkAmount;
    const swingArm = Math.sin(walkPhase.current) * 0.4 * walkAmount;

    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swingArm;
    if (rightArm.current) rightArm.current.rotation.x = swingArm;

    // Subtle idle sway when not moving.
    const idleSway = walkAmount < 0.05 ? Math.sin(performance.now() * 0.001) * 0.02 : 0;
    if (bodyBob.current) {
      const bob = Math.abs(Math.sin(walkPhase.current)) * 0.08 * walkAmount;
      bodyBob.current.position.y = bob + idleSway;
    }

    // Trigger a footstep event on each half-cycle when moving.
    if (walkAmount > 0.15 && onFootstep) {
      const currentStep = Math.floor(walkPhase.current / Math.PI);
      if (currentStep !== lastFootstepStep.current) {
        lastFootstepStep.current = currentStep;
        onFootstep(g.position);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={bodyBob}>
        {/* Legs — swing from hip joint */}
        <group ref={leftLeg} position={[-0.18, 0.5, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.13, 0.4, 6, 12]} />
            <meshStandardMaterial color={SUIT} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.58, 0.02]} castShadow>
            <boxGeometry args={[0.28, 0.14, 0.36]} />
            <meshStandardMaterial color={SUIT_ACCENT} roughness={0.85} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.18, 0.5, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.13, 0.4, 6, 12]} />
            <meshStandardMaterial color={SUIT} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.58, 0.02]} castShadow>
            <boxGeometry args={[0.28, 0.14, 0.36]} />
            <meshStandardMaterial color={SUIT_ACCENT} roughness={0.85} />
          </mesh>
        </group>

        {/* Torso */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.38, 6, 16]} />
          <meshStandardMaterial color={SUIT} roughness={0.65} />
        </mesh>

        {/* Chest control panel */}
        <mesh position={[0, 0.95, 0.32]} castShadow>
          <boxGeometry args={[0.28, 0.18, 0.02]} />
          <meshStandardMaterial
            color="#2a2f3d"
            roughness={0.4}
            emissive={ACCENT}
            emissiveIntensity={0.25}
          />
        </mesh>

        {/* Backpack */}
        <mesh position={[0, 1.0, -0.32]} castShadow>
          <boxGeometry args={[0.5, 0.6, 0.22]} />
          <meshStandardMaterial color={SUIT_ACCENT} roughness={0.85} />
        </mesh>

        {/* Arms — swing from shoulder */}
        <group ref={leftArm} position={[-0.42, 1.15, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.38, 6, 12]} />
            <meshStandardMaterial color={SUIT} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.5, 0]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={SUIT_ACCENT} roughness={0.85} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.42, 1.15, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.38, 6, 12]} />
            <meshStandardMaterial color={SUIT} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.5, 0]} castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={SUIT_ACCENT} roughness={0.85} />
          </mesh>
        </group>

        {/* Helmet */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.32, 24, 24]} />
          <meshStandardMaterial color={SUIT} roughness={0.4} />
        </mesh>

        {/* Visor */}
        <mesh position={[0, 1.55, 0.18]}>
          <sphereGeometry args={[0.24, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial
            color={VISOR}
            roughness={0.15}
            metalness={0.8}
            emissive="#4a80ff"
            emissiveIntensity={0.35}
          />
        </mesh>

        {/* Antenna */}
        <mesh position={[0.15, 1.85, -0.05]}>
          <cylinderGeometry args={[0.01, 0.01, 0.18, 6]} />
          <meshStandardMaterial color="#888" />
        </mesh>
        <mesh position={[0.15, 1.95, -0.05]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.2}
          />
        </mesh>
      </group>
    </group>
  );
});
