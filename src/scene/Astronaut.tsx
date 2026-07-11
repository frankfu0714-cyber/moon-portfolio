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

const SUIT = "#eeece4";
const SUIT_SEAM = "#c9c4b8";
const HARDWARE = "#3a3f4a";
const HARDWARE_LIGHT = "#7a7f8c";
const VISOR = "#0a1020";
const VISOR_TINT = "#5a90ff";
const GOLD = "#d1a04a";
const ACCENT = "#ff9d4a";
const RED = "#ff5a4a";
const GREEN = "#78ff9a";

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

    const speedSquared = (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const cycleSpeed = Math.min(speed / 1.2, 1) * Math.PI * 2 * 1.8;
    walkPhase.current += cycleSpeed * delta;

    const walkAmount = Math.min(speed / 1.2, 1);
    const swing = Math.sin(walkPhase.current) * 0.55 * walkAmount;
    const swingArm = Math.sin(walkPhase.current) * 0.4 * walkAmount;

    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swingArm;
    if (rightArm.current) rightArm.current.rotation.x = swingArm;

    const idleSway =
      walkAmount < 0.05 ? Math.sin(performance.now() * 0.001) * 0.02 : 0;
    if (bodyBob.current) {
      const bob = Math.abs(Math.sin(walkPhase.current)) * 0.08 * walkAmount;
      bodyBob.current.position.y = bob + idleSway;
    }

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
        {/* LEGS ============================================================ */}
        <Leg side="left" groupRef={leftLeg} />
        <Leg side="right" groupRef={rightLeg} />

        {/* TORSO =========================================================== */}
        <mesh position={[0, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.33, 0.42, 8, 20]} />
          <meshStandardMaterial color={SUIT} roughness={0.72} metalness={0.05} />
        </mesh>

        {/* Torso seam (accent line down center) */}
        <mesh position={[0, 0.98, 0.33]}>
          <boxGeometry args={[0.015, 0.55, 0.005]} />
          <meshStandardMaterial color={HARDWARE} roughness={0.6} />
        </mesh>

        {/* Waist belt */}
        <mesh position={[0, 0.68, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.045, 8, 32]} />
          <meshStandardMaterial
            color={HARDWARE}
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
        {/* Belt buckle */}
        <mesh position={[0, 0.68, 0.35]}>
          <boxGeometry args={[0.10, 0.08, 0.04]} />
          <meshStandardMaterial
            color={GOLD}
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>

        {/* Neck gasket */}
        <mesh position={[0, 1.30, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.135, 0.035, 8, 24]} />
          <meshStandardMaterial
            color={HARDWARE_LIGHT}
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>

        {/* Chest control panel */}
        <group position={[0, 1.02, 0.32]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.20, 0.03]} />
            <meshStandardMaterial
              color="#1a1e28"
              roughness={0.35}
              metalness={0.6}
            />
          </mesh>
          {/* Screen glow strip */}
          <mesh position={[0, 0.045, 0.017]}>
            <planeGeometry args={[0.26, 0.05]} />
            <meshBasicMaterial color={VISOR_TINT} toneMapped={false} />
          </mesh>
          {/* Indicator lights */}
          <mesh position={[-0.11, -0.055, 0.017]}>
            <circleGeometry args={[0.014, 12]} />
            <meshBasicMaterial color={GREEN} toneMapped={false} />
          </mesh>
          <mesh position={[-0.07, -0.055, 0.017]}>
            <circleGeometry args={[0.014, 12]} />
            <meshBasicMaterial color={ACCENT} toneMapped={false} />
          </mesh>
          <mesh position={[-0.03, -0.055, 0.017]}>
            <circleGeometry args={[0.014, 12]} />
            <meshBasicMaterial color={RED} toneMapped={false} />
          </mesh>
          {/* Tiny logo patch on right side */}
          <mesh position={[0.09, -0.045, 0.017]}>
            <planeGeometry args={[0.10, 0.07]} />
            <meshBasicMaterial color={ACCENT} toneMapped={false} />
          </mesh>
        </group>

        {/* Shoulder pads */}
        <mesh position={[-0.42, 1.24, 0]} castShadow>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={SUIT_SEAM} roughness={0.55} metalness={0.15} />
        </mesh>
        <mesh position={[0.42, 1.24, 0]} castShadow>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={SUIT_SEAM} roughness={0.55} metalness={0.15} />
        </mesh>

        {/* BACKPACK ========================================================= */}
        <group position={[0, 1.02, -0.32]}>
          {/* Main pack body */}
          <mesh castShadow>
            <boxGeometry args={[0.52, 0.68, 0.22]} />
            <meshStandardMaterial
              color={SUIT_SEAM}
              roughness={0.55}
              metalness={0.25}
            />
          </mesh>
          {/* Vent grille (dark) */}
          <mesh position={[0, -0.05, -0.116]}>
            <boxGeometry args={[0.38, 0.18, 0.005]} />
            <meshStandardMaterial color={HARDWARE} roughness={0.7} />
          </mesh>
          {/* Emissive status bar on back */}
          <mesh position={[0, 0.20, -0.116]}>
            <planeGeometry args={[0.30, 0.02]} />
            <meshBasicMaterial color={VISOR_TINT} toneMapped={false} />
          </mesh>
          {/* Tanks on top corners */}
          <mesh position={[-0.20, 0.36, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.36, 16]} />
            <meshStandardMaterial
              color={HARDWARE_LIGHT}
              roughness={0.35}
              metalness={0.7}
            />
          </mesh>
          <mesh position={[0.20, 0.36, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.36, 16]} />
            <meshStandardMaterial
              color={HARDWARE_LIGHT}
              roughness={0.35}
              metalness={0.7}
            />
          </mesh>
          {/* Tank caps */}
          <mesh position={[-0.20, 0.55, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.03, 16]} />
            <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[0.20, 0.55, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.03, 16]} />
            <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.3} />
          </mesh>
          {/* Hoses connecting to helmet */}
          <mesh position={[-0.14, 0.42, 0.28]} rotation={[Math.PI / 3, 0, -0.15]}>
            <cylinderGeometry args={[0.022, 0.022, 0.42, 8]} />
            <meshStandardMaterial color={HARDWARE} roughness={0.7} />
          </mesh>
          <mesh position={[0.14, 0.42, 0.28]} rotation={[Math.PI / 3, 0, 0.15]}>
            <cylinderGeometry args={[0.022, 0.022, 0.42, 8]} />
            <meshStandardMaterial color={HARDWARE} roughness={0.7} />
          </mesh>
        </group>

        {/* ARMS ============================================================= */}
        <Arm side="left" groupRef={leftArm} />
        <Arm side="right" groupRef={rightArm} />

        {/* HELMET =========================================================== */}
        {/* Outer white shell */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.33, 32, 32]} />
          <meshStandardMaterial
            color={SUIT}
            roughness={0.35}
            metalness={0.2}
          />
        </mesh>
        {/* Inner dark shell (barely visible around visor edges) */}
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.305, 24, 24]} />
          <meshStandardMaterial
            color="#161822"
            roughness={0.5}
            metalness={0.3}
          />
        </mesh>
        {/* Visor — dark reflective spherical cap on front */}
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry
            args={[0.315, 32, 32, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.25, Math.PI * 0.45]}
          />
          <meshStandardMaterial
            color={VISOR}
            roughness={0.08}
            metalness={0.95}
            emissive={VISOR_TINT}
            emissiveIntensity={0.32}
          />
        </mesh>
        {/* Gold visor rim (top arc) */}
        <mesh position={[0, 1.70, 0.03]} rotation={[Math.PI * 0.15, 0, 0]}>
          <torusGeometry args={[0.24, 0.014, 8, 40, Math.PI * 0.9]} />
          <meshStandardMaterial
            color={GOLD}
            metalness={0.95}
            roughness={0.22}
          />
        </mesh>
        {/* Helmet side lamp (left) */}
        <mesh position={[-0.28, 1.60, 0.12]}>
          <cylinderGeometry args={[0.04, 0.04, 0.06, 12]} />
          <meshStandardMaterial
            color={HARDWARE_LIGHT}
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[-0.31, 1.60, 0.13]} rotation={[0, 0, Math.PI / 2]}>
          <circleGeometry args={[0.03, 16]} />
          <meshBasicMaterial color="#fff8dd" toneMapped={false} />
        </mesh>

        {/* Antenna */}
        <mesh position={[0.18, 1.90, -0.06]} rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.010, 0.010, 0.22, 6]} />
          <meshStandardMaterial
            color={HARDWARE_LIGHT}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0.20, 2.01, -0.06]}>
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>

        {/* Contact shadow disc — subtle dark patch under the astronaut so
             the boots don't float in the low-light scene. */}
        <mesh
          position={[0, 0.005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={-1}
        >
          <circleGeometry args={[0.55, 24]} />
          <meshBasicMaterial
            color="#000"
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
});

function Leg({
  side,
  groupRef,
}: {
  side: "left" | "right";
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const xSign = side === "left" ? -1 : 1;
  return (
    <group ref={groupRef} position={[xSign * 0.19, 0.55, 0]}>
      {/* Upper thigh */}
      <mesh position={[0, -0.18, 0]} castShadow>
        <capsuleGeometry args={[0.135, 0.24, 6, 14]} />
        <meshStandardMaterial color={SUIT} roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Knee joint ring */}
      <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.128, 0.028, 8, 20]} />
        <meshStandardMaterial
          color={HARDWARE}
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      {/* Shin */}
      <mesh position={[0, -0.52, 0]} castShadow>
        <capsuleGeometry args={[0.115, 0.22, 6, 14]} />
        <meshStandardMaterial color={SUIT} roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Boot body (angled forward) */}
      <mesh position={[0, -0.72, 0.06]} castShadow>
        <boxGeometry args={[0.24, 0.14, 0.36]} />
        <meshStandardMaterial
          color={SUIT_SEAM}
          roughness={0.55}
          metalness={0.2}
        />
      </mesh>
      {/* Boot toe cap */}
      <mesh position={[0, -0.71, 0.22]} castShadow>
        <boxGeometry args={[0.22, 0.10, 0.08]} />
        <meshStandardMaterial color={HARDWARE} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Boot sole (dark tread) */}
      <mesh position={[0, -0.80, 0.06]}>
        <boxGeometry args={[0.25, 0.03, 0.38]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.85} />
      </mesh>
      {/* Sole tread lines */}
      {[-0.12, -0.04, 0.04, 0.12, 0.20].map((z) => (
        <mesh key={z} position={[0, -0.815, z]}>
          <boxGeometry args={[0.24, 0.015, 0.012]} />
          <meshStandardMaterial color="#0a0c10" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Arm({
  side,
  groupRef,
}: {
  side: "left" | "right";
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const xSign = side === "left" ? -1 : 1;
  return (
    <group ref={groupRef} position={[xSign * 0.42, 1.18, 0]}>
      {/* Upper arm */}
      <mesh position={[0, -0.16, 0]} castShadow>
        <capsuleGeometry args={[0.105, 0.22, 6, 12]} />
        <meshStandardMaterial color={SUIT} roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Elbow ring */}
      <mesh position={[0, -0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.10, 0.024, 8, 18]} />
        <meshStandardMaterial
          color={HARDWARE}
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      {/* Forearm */}
      <mesh position={[0, -0.46, 0]} castShadow>
        <capsuleGeometry args={[0.098, 0.22, 6, 12]} />
        <meshStandardMaterial color={SUIT} roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Wrist cuff */}
      <mesh position={[0, -0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.095, 0.022, 8, 16]} />
        <meshStandardMaterial color={HARDWARE_LIGHT} metalness={0.65} roughness={0.35} />
      </mesh>
      {/* Glove */}
      <mesh position={[0, -0.70, 0.02]} castShadow>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial
          color={HARDWARE}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}
