"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { sampleTerrainHeight } from "@/lib/terrain";

// Tesla-Cybertruck-style low-poly GLB by Mobolaji, sourced from
// Poly Pizza (CC-BY 3.0). Bundled at /public/models/cybertruck.glb so
// production doesn't depend on Poly Pizza's CDN staying up.
//
// License: CC-BY 3.0. Attribution shown in the credits pill.
// Original model URL: https://poly.pizza/m/Jpar3f32mt
// Author: Mobolaji (https://poly.pizza/u/Mobolaji)
//
// The GLB has zero embedded textures (materials are solid colors), so
// there is no trademark wordmark or Tesla logo baked in. Only the
// silhouette is emulated.

const CYBERTRUCK_URL = "/models/cybertruck.glb";
useGLTF.preload(CYBERTRUCK_URL);

// Placement: parked on the flattest patch of natural terrain within
// spawn view (13.6 units from origin, right-of-lander from the spawn
// camera). The previous (8, 8) spot sat on cratered ground where the
// wheels straddled bumps and the truck read as tilted; a one-shot
// grid search of sampleTerrainHeight over the 8-14-unit ring showed
// this coord has a total height range of ~3.6cm across a 3-unit
// radius (~6x flatter than the old spot). Angled so it doesn't sit
// parallel to the lander.
export const CYBERTRUCK_X = -8;
export const CYBERTRUCK_Z = 11;
export const CYBERTRUCK_ROT_Y = 0.55; // ~31 degrees off axis
export const CYBERTRUCK_COLLISION_R = 4.5;

// Target world length + height for the truck. Real Cybertruck is ~5.68m
// long by ~1.90m tall — a ~3:1 length:height ratio. This GLB's native
// silhouette is proportionally taller than that, so we scale X + Z off
// LENGTH but derive Y off HEIGHT to squash the wedge back to the
// reference stance. TARGET_HEIGHT = TARGET_LENGTH / 3.0.
const TARGET_LENGTH = 6.7;
const TARGET_LENGTH_TO_HEIGHT = 3.0;
const TARGET_HEIGHT = TARGET_LENGTH / TARGET_LENGTH_TO_HEIGHT;

export function Cybertruck() {
  const gltf = useGLTF(CYBERTRUCK_URL);
  const groupRef = useRef<THREE.Group>(null);

  // Enable shadows + compute a non-uniform fit-to-target scale from the
  // model's native bounding box (this GLB comes out of FBX2glTF with
  // unusual per-node scales, so we can't hard-code a scalar reliably).
  // Y is squashed independently so length:height matches the reference
  // 3:1 wedge even if the source model is stubbier.
  const scale = useMemo<[number, number, number]>(() => {
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const nativeLength = Math.max(size.x, size.z);
    if (!nativeLength || !Number.isFinite(nativeLength)) return [1, 1, 1];
    const xz = TARGET_LENGTH / nativeLength;
    const y = size.y > 1e-4 ? TARGET_HEIGHT / size.y : xz;
    return [xz, y, xz];
  }, [gltf.scene]);

  // Terrain-follow: sample the ground under the truck center. The
  // model's own transforms already put wheels on its baseline; we
  // just lift the whole thing so wheels touch the sampled terrain.
  const baseY = sampleTerrainHeight(CYBERTRUCK_X, CYBERTRUCK_Z);

  // After we know the scale, walk the tree once more to find the
  // model's local Y-min so we can offset it to sit on the ground.
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const box = new THREE.Box3().setFromObject(g);
    const dy = baseY - box.min.y;
    g.position.y += dy;
  }, [baseY, scale]);

  return (
    <group
      ref={groupRef}
      position={[CYBERTRUCK_X, baseY, CYBERTRUCK_Z]}
      rotation={[0, CYBERTRUCK_ROT_Y, 0]}
      scale={scale}
    >
      <primitive object={gltf.scene} />
    </group>
  );
}
