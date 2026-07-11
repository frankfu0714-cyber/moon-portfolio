"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type AstronautHandle = {
  group: THREE.Group | null;
  tilt: THREE.Group | null;
};

type Props = {
  onFootstep?: (pos: THREE.Vector3) => void;
};

// Palette — cute Sketchfab-style semi-cartoon suit.
const SUIT = "#f6f3ea";
const SUIT_SHADOW = "#dad4c5";
const ACCENT = "#ff8a1c";
const ACCENT_DEEP = "#c25f0e";
const VISOR = "#0a0d1c";
const PANEL_BG = "#141824";
const LED_ORANGE = "#ff7a1a";
const LED_CYAN = "#7fd6ff";
const HOSE_GRAY = "#3a3f4a";
const BOOT_DARK = "#1c1f27";

// Y-axis anchors — feet touch the ground at Y=0.
// Derived from: boot bottom Y=0 → box center 0.055 → knee-local -0.315
// → knee world 0.37 → hip-local -0.4 → HIP_Y=0.77.
const HIP_Y = 0.77;
const TORSO_Y = 1.07;
const NECK_Y = 1.37;
const HELMET_Y = 1.63;
const SHOULDER_Y = 1.13;
const SHOULDER_X = 0.36;

// Curved life-support hose from chest-panel side up to helmet side.
function makeHose(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(side * 0.11, TORSO_Y + 0.06, 0.22),
    new THREE.Vector3(side * 0.28, TORSO_Y + 0.38, 0.06),
    new THREE.Vector3(side * 0.22, HELMET_Y - 0.2, -0.02),
  );
  return new THREE.TubeGeometry(curve, 20, 0.026, 10, false);
}

export const Astronaut = forwardRef<AstronautHandle, Props>(function Astronaut(
  { onFootstep },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const bodyBob = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const helmet = useRef<THREE.Group>(null);

  const leftHip = useRef<THREE.Group>(null);
  const rightHip = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);

  const leftShoulder = useRef<THREE.Group>(null);
  const rightShoulder = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null);
  const rightElbow = useRef<THREE.Group>(null);

  const walkPhase = useRef(0);
  const lastFootstepStep = useRef(0);
  const idleTime = useRef(Math.random() * 10);

  const hoseL = useMemo(() => makeHose(-1), []);
  const hoseR = useMemo(() => makeHose(1), []);

  useImperativeHandle(ref, () => ({
    get group() {
      return groupRef.current;
    },
    get tilt() {
      return tiltGroup.current;
    },
  }));

  useFrame((_, deltaRaw) => {
    const g = groupRef.current;
    if (!g) return;
    const delta = Math.min(deltaRaw, 0.05);

    const speedSquared = (g.userData.speedSquared as number | undefined) ?? 0;
    const speed = Math.sqrt(speedSquared);
    const walkAmount = Math.min(speed / 1.2, 1);

    if (walkAmount > 0.02) {
      // ~1.6Hz stride at top speed for a chill wander.
      walkPhase.current += (speed * 3.2 + 0.6) * delta;
    }
    if (walkPhase.current > Math.PI * 200) {
      walkPhase.current -= Math.PI * 200;
    }
    idleTime.current += delta;

    const phase = walkPhase.current;
    const legSwing = Math.sin(phase) * 0.35 * walkAmount;
    const armSwing = Math.sin(phase + Math.PI) * 0.25 * walkAmount;

    if (leftHip.current) leftHip.current.rotation.x = legSwing;
    if (rightHip.current) rightHip.current.rotation.x = -legSwing;

    const kneeFlex = walkAmount * 0.55;
    if (leftKnee.current)
      leftKnee.current.rotation.x = Math.max(0, -Math.sin(phase)) * kneeFlex;
    if (rightKnee.current)
      rightKnee.current.rotation.x =
        Math.max(0, -Math.sin(phase + Math.PI)) * kneeFlex;

    if (leftShoulder.current) leftShoulder.current.rotation.x = armSwing;
    if (rightShoulder.current) rightShoulder.current.rotation.x = -armSwing;

    // Constant elbow bend + subtle phase overlay so arms never look pinned.
    const baseElbow = 0.35;
    if (leftElbow.current)
      leftElbow.current.rotation.x = baseElbow + Math.sin(phase) * 0.08 * walkAmount;
    if (rightElbow.current)
      rightElbow.current.rotation.x =
        baseElbow + Math.sin(phase + Math.PI) * 0.08 * walkAmount;

    if (bodyBob.current) {
      bodyBob.current.position.y =
        Math.abs(Math.sin(phase * 2)) * 0.04 * walkAmount;
      bodyBob.current.rotation.z = Math.sin(phase) * 0.05 * walkAmount;
    }
    if (helmet.current) {
      helmet.current.rotation.z = -Math.sin(phase) * 0.02 * walkAmount;
    }

    if (torso.current) {
      const breathe = 1 + Math.sin(idleTime.current * 1.4) * 0.018 * (1 - walkAmount);
      torso.current.scale.y = breathe;
    }
    if (helmet.current && walkAmount < 0.2) {
      helmet.current.rotation.y =
        Math.sin(idleTime.current * 0.35) * 0.18 * (1 - walkAmount);
    } else if (helmet.current) {
      helmet.current.rotation.y *= 0.9;
    }

    if (walkAmount > 0.15 && onFootstep) {
      const currentStep = Math.floor(phase / Math.PI);
      if (currentStep !== lastFootstepStep.current) {
        lastFootstepStep.current = currentStep;
        onFootstep(g.position);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={tiltGroup}>
        <group ref={bodyBob}>
          {/* ── TORSO (rounded pillowy oval) ──────────────── */}
          <group ref={torso} position={[0, TORSO_Y, 0]}>
            <mesh scale={[0.3, 0.36, 0.26]} castShadow>
              <sphereGeometry args={[1, 28, 20]} />
              <meshStandardMaterial color={SUIT} roughness={0.6} />
            </mesh>

            {/* Waist belt — orange accent */}
            <mesh position={[0, -0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.28, 0.045, 12, 32]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT_DEEP}
                emissiveIntensity={0.15}
                roughness={0.55}
              />
            </mesh>
            <mesh position={[0, -0.24, 0.27]}>
              <boxGeometry args={[0.09, 0.08, 0.03]} />
              <meshStandardMaterial color={PANEL_BG} roughness={0.4} />
            </mesh>

            {/* Chest control panel */}
            <mesh position={[0, 0.02, 0.24]} castShadow>
              <boxGeometry args={[0.22, 0.18, 0.03]} />
              <meshStandardMaterial color={PANEL_BG} roughness={0.35} />
            </mesh>

            {/* Chest LEDs */}
            <mesh position={[-0.065, 0.055, 0.257]}>
              <boxGeometry args={[0.035, 0.035, 0.008]} />
              <meshStandardMaterial
                color={LED_ORANGE}
                emissive={LED_ORANGE}
                emissiveIntensity={1.8}
              />
            </mesh>
            <mesh position={[0, 0.055, 0.257]}>
              <boxGeometry args={[0.035, 0.035, 0.008]} />
              <meshStandardMaterial
                color={LED_ORANGE}
                emissive={LED_ORANGE}
                emissiveIntensity={1.2}
              />
            </mesh>
            <mesh position={[0.065, 0.055, 0.257]}>
              <boxGeometry args={[0.035, 0.035, 0.008]} />
              <meshStandardMaterial
                color={LED_CYAN}
                emissive={LED_CYAN}
                emissiveIntensity={1.4}
              />
            </mesh>
            <mesh position={[0, -0.045, 0.257]}>
              <boxGeometry args={[0.16, 0.025, 0.008]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.9}
              />
            </mesh>

            {/* Backpack (life-support unit) */}
            <mesh position={[0, 0, -0.22]} castShadow>
              <boxGeometry args={[0.4, 0.52, 0.18]} />
              <meshStandardMaterial color={SUIT_SHADOW} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0, -0.32]}>
              <boxGeometry args={[0.34, 0.06, 0.01]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.35}
              />
            </mesh>
            <mesh position={[-0.1, 0, -0.32]}>
              <cylinderGeometry args={[0.04, 0.04, 0.42, 12]} />
              <meshStandardMaterial color={SUIT} roughness={0.5} />
            </mesh>
            <mesh position={[0.1, 0, -0.32]}>
              <cylinderGeometry args={[0.04, 0.04, 0.42, 12]} />
              <meshStandardMaterial color={SUIT} roughness={0.5} />
            </mesh>
          </group>

          {/* ── NECK COLLAR ─────────────────────────────────── */}
          <mesh position={[0, NECK_Y, 0]}>
            <cylinderGeometry args={[0.13, 0.15, 0.07, 16]} />
            <meshStandardMaterial color={SUIT_SHADOW} roughness={0.7} />
          </mesh>

          {/* ── HOSES (curve from panel to helmet) ─────────── */}
          <mesh geometry={hoseL}>
            <meshStandardMaterial color={HOSE_GRAY} roughness={0.6} />
          </mesh>
          <mesh geometry={hoseR}>
            <meshStandardMaterial color={HOSE_GRAY} roughness={0.6} />
          </mesh>

          {/* ── HELMET ────────────────────────────────────── */}
          <group ref={helmet} position={[0, HELMET_Y, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.32, 32, 32]} />
              <meshStandardMaterial color={SUIT} roughness={0.35} />
            </mesh>
            <mesh position={[0, -0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.22, 0.028, 10, 24]} />
              <meshStandardMaterial color={SUIT_SHADOW} roughness={0.7} />
            </mesh>
            {/* Reflective visor (fully covers face) */}
            <mesh position={[0, 0.02, 0.14]} scale={[1.02, 0.86, 1]}>
              <sphereGeometry
                args={[0.26, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.62]}
              />
              <meshStandardMaterial
                color={VISOR}
                roughness={0.08}
                metalness={0.95}
                emissive="#2c4fb0"
                emissiveIntensity={0.2}
              />
            </mesh>
            {/* Orange trim above visor */}
            <mesh
              position={[0, 0.23, 0.02]}
              rotation={[Math.PI / 2 + 0.4, 0, 0]}
            >
              <torusGeometry args={[0.22, 0.022, 8, 24, Math.PI]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.5}
              />
            </mesh>
            {/* Antenna */}
            <mesh position={[0.14, 0.34, -0.02]} rotation={[0, 0, -0.15]}>
              <cylinderGeometry args={[0.012, 0.012, 0.22, 6]} />
              <meshStandardMaterial color="#8a8a8a" roughness={0.5} />
            </mesh>
            <mesh position={[0.18, 0.46, -0.03]}>
              <sphereGeometry args={[0.038, 12, 12]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={1.8}
              />
            </mesh>
          </group>

          {/* ── LEFT ARM ──────────────────────────────────── */}
          <group ref={leftShoulder} position={[-SHOULDER_X, SHOULDER_Y, 0]}>
            <mesh position={[0, 0.04, 0]} scale={[1, 0.7, 1]} castShadow>
              <sphereGeometry args={[0.15, 18, 16]} />
              <meshStandardMaterial color={SUIT} roughness={0.55} />
            </mesh>
            <mesh position={[0, -0.19, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.22, 6, 14]} />
              <meshStandardMaterial color={SUIT} roughness={0.65} />
            </mesh>
            <mesh position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.098, 0.028, 8, 16]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.25}
              />
            </mesh>
            <group ref={leftElbow} position={[0, -0.36, 0]}>
              <mesh position={[0, -0.15, 0.03]} castShadow>
                <capsuleGeometry args={[0.085, 0.2, 6, 14]} />
                <meshStandardMaterial color={SUIT} roughness={0.65} />
              </mesh>
              <mesh position={[0, -0.28, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 0.05, 16]} />
                <meshStandardMaterial color={ACCENT} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.36, 0.055]} castShadow>
                <sphereGeometry args={[0.11, 14, 12]} />
                <meshStandardMaterial
                  color={ACCENT}
                  emissive={ACCENT_DEEP}
                  emissiveIntensity={0.08}
                  roughness={0.55}
                />
              </mesh>
            </group>
          </group>

          {/* ── RIGHT ARM ─────────────────────────────────── */}
          <group ref={rightShoulder} position={[SHOULDER_X, SHOULDER_Y, 0]}>
            <mesh position={[0, 0.04, 0]} scale={[1, 0.7, 1]} castShadow>
              <sphereGeometry args={[0.15, 18, 16]} />
              <meshStandardMaterial color={SUIT} roughness={0.55} />
            </mesh>
            <mesh position={[0, -0.19, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.22, 6, 14]} />
              <meshStandardMaterial color={SUIT} roughness={0.65} />
            </mesh>
            <mesh position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.098, 0.028, 8, 16]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.25}
              />
            </mesh>
            <group ref={rightElbow} position={[0, -0.36, 0]}>
              <mesh position={[0, -0.15, 0.03]} castShadow>
                <capsuleGeometry args={[0.085, 0.2, 6, 14]} />
                <meshStandardMaterial color={SUIT} roughness={0.65} />
              </mesh>
              <mesh position={[0, -0.28, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 0.05, 16]} />
                <meshStandardMaterial color={ACCENT} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.36, 0.055]} castShadow>
                <sphereGeometry args={[0.11, 14, 12]} />
                <meshStandardMaterial
                  color={ACCENT}
                  emissive={ACCENT_DEEP}
                  emissiveIntensity={0.08}
                  roughness={0.55}
                />
              </mesh>
            </group>
          </group>

          {/* ── LEFT LEG ──────────────────────────────────── */}
          <group ref={leftHip} position={[-0.14, HIP_Y, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.11, 0.22, 6, 14]} />
              <meshStandardMaterial color={SUIT} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.114, 0.03, 8, 18]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.25}
              />
            </mesh>
            <group ref={leftKnee} position={[0, -0.4, 0]}>
              <mesh position={[0, -0.15, 0]} castShadow>
                <capsuleGeometry args={[0.105, 0.2, 6, 14]} />
                <meshStandardMaterial color={SUIT} roughness={0.7} />
              </mesh>
              {/* Boot — dark tread bottom */}
              <mesh position={[0, -0.315, 0.05]} castShadow>
                <boxGeometry args={[0.22, 0.11, 0.32]} />
                <meshStandardMaterial color={BOOT_DARK} roughness={0.85} />
              </mesh>
              {/* Boot — orange upper */}
              <mesh position={[0, -0.24, 0.04]} castShadow>
                <boxGeometry args={[0.2, 0.08, 0.26]} />
                <meshStandardMaterial
                  color={ACCENT}
                  emissive={ACCENT_DEEP}
                  emissiveIntensity={0.05}
                  roughness={0.6}
                />
              </mesh>
            </group>
          </group>

          {/* ── RIGHT LEG ─────────────────────────────────── */}
          <group ref={rightHip} position={[0.14, HIP_Y, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.11, 0.22, 6, 14]} />
              <meshStandardMaterial color={SUIT} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.114, 0.03, 8, 18]} />
              <meshStandardMaterial
                color={ACCENT}
                emissive={ACCENT}
                emissiveIntensity={0.25}
              />
            </mesh>
            <group ref={rightKnee} position={[0, -0.4, 0]}>
              <mesh position={[0, -0.15, 0]} castShadow>
                <capsuleGeometry args={[0.105, 0.2, 6, 14]} />
                <meshStandardMaterial color={SUIT} roughness={0.7} />
              </mesh>
              <mesh position={[0, -0.315, 0.05]} castShadow>
                <boxGeometry args={[0.22, 0.11, 0.32]} />
                <meshStandardMaterial color={BOOT_DARK} roughness={0.85} />
              </mesh>
              <mesh position={[0, -0.24, 0.04]} castShadow>
                <boxGeometry args={[0.2, 0.08, 0.26]} />
                <meshStandardMaterial
                  color={ACCENT}
                  emissive={ACCENT_DEEP}
                  emissiveIntensity={0.05}
                  roughness={0.6}
                />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
});
