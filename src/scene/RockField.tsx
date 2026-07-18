"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { fbm, sampleTerrainHeight } from "@/lib/terrain";
import { ROCKS, VARIANT_COUNT, seededRand } from "@/lib/rocks";

// Build one rock geometry. Icosahedron subdiv 4 gives enough vertices for
// organic-looking noise displacement without shipping a heavy asset.
// Displacement uses the same fBm the terrain uses so the surfaces share a
// family resemblance.
function makeRock(seed: number): THREE.BufferGeometry {
  // Dense indexed sphere: indexed geometry gives smooth vertex normals
  // (the old icosahedron was non-indexed, so every triangle rendered as a
  // flat facet), and 64x48 segments carry fine surface detail.
  const geom = new THREE.SphereGeometry(1, 96, 64);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);

  const ox = seed * 13.7;
  const oy = seed * 27.1;
  const oz = seed * 41.3;

  // Random fracture planes: vertices poking past a plane get projected
  // back onto it, which slices flat "chip" facets with crisp edges into
  // the boulder -- the way real broken basalt looks.
  const cuts: { n: THREE.Vector3; d: number }[] = [];
  const cutCount = 5 + Math.floor(seededRand(seed + 51) * 3);
  for (let k = 0; k < cutCount; k++) {
    const u = seededRand(seed * 7.3 + k * 13.1) * 2 - 1;
    const th = seededRand(seed * 11.7 + k * 17.9) * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - u * u));
    cuts.push({
      n: new THREE.Vector3(rr * Math.cos(th), u, rr * Math.sin(th)),
      d: 0.55 + seededRand(seed * 3.1 + k * 29.3) * 0.28,
    });
  }

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Three planar fBm samples averaged so the displacement doesn't have
    // an obvious axis of symmetry. Amplitude falls off fast per octave so
    // low frequencies shape the silhouette and high frequencies only add
    // fine regolith-like granularity.
    let disp = 0;
    let amp = 1;
    let freq = 1.1;
    let norm = 0;
    for (let o = 0; o < 6; o++) {
      const s1 = fbm((v.x + ox) * freq, (v.y + oy) * freq);
      const s2 = fbm((v.y + oy) * freq, (v.z + oz) * freq);
      const s3 = fbm((v.z + oz) * freq, (v.x + ox) * freq);
      let n = (s1 + s2 + s3) / 3 - 0.5;
      // Fold the mid/high octaves into sharp ridges so the surface reads
      // as chipped, craggy rock instead of a polished pebble.
      if (o >= 1) {
        n = (0.5 - Math.abs(n) * 2) * 0.72;
      }
      disp += amp * n;
      norm += amp;
      amp *= 0.62;
      freq *= 2.15;
    }
    disp /= norm;

    // Scale each vertex outward/inward by the local noise. Amount varies
    // per rock so silhouettes differ.
    const perRockGain = 0.95 + seededRand(seed + 3) * 0.5;
    v.multiplyScalar(1 + disp * perRockGain);

    // Slice the fracture planes.
    for (const cut of cuts) {
      const pd = v.dot(cut.n);
      if (pd > cut.d) {
        v.addScaledVector(cut.n, cut.d - pd);
      }
    }

    // High-frequency grain over the whole surface — critically this runs
    // AFTER the fracture cuts, so the flat chip facets pick up rough
    // regolith texture instead of reading as polished glass.
    {
      const g1 =
        Math.sin(v.x * 23.7 + seed * 5.1) *
        Math.sin(v.y * 27.3 + seed * 3.7) *
        Math.sin(v.z * 25.1 + seed * 7.9);
      const g2 =
        Math.sin(v.x * 51.3 + seed * 2.3) *
        Math.sin(v.y * 47.7 + seed * 9.1) *
        Math.sin(v.z * 55.9 + seed * 4.7);
      const grain = g1 * 0.035 + g2 * 0.016;
      v.multiplyScalar(1 + grain);
    }

    // Flatten the underside so the rock reads as sitting on the ground
    // rather than a floating boulder.
    if (v.y < 0) v.y *= 0.38;

    pos.setXYZ(i, v.x, v.y, v.z);

    // Bake crevice shading into vertex colors: recessed areas darken,
    // ridges stay bright. Multiplies with the material color.
    const shade = THREE.MathUtils.clamp(0.68 + disp * 2.6, 0.3, 1);
    // Contact AO: rocks sit buried to local y ~ 0.48, so fade the base
    // band toward dark. Kills the bright rim where rock meets ground.
    const contact = THREE.MathUtils.smoothstep(v.y, 0.46, 0.92);
    const grounded = shade * (0.38 + 0.62 * contact);
    colors[i * 3] = grounded;
    colors[i * 3 + 1] = grounded;
    colors[i * 3 + 2] = grounded;
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export function RockField() {
  const variants = useMemo(
    () => Array.from({ length: VARIANT_COUNT }, (_, i) => makeRock(i + 1)),
    [],
  );

  // The old merged contact-shadow ring kept sprouting hard dark
  // triangles wherever rocks clustered or the terrain bucked under a
  // rim quad. Rocks are now sunk deep enough that their own vertex AO
  // plus the shadow map ground them, so the fake ring is gone for good.

  return (
    <group>
      {ROCKS.map((r, i) => {
        // Ground each rock against the LOWEST terrain point under its
        // footprint (center + ring samples), then bury it a bit. Sampling
        // only the center let rocks hover when the ground dipped nearby.
        const foot = Math.max(r.scaleX, r.scaleZ) * 0.8;
        let ground = sampleTerrainHeight(r.x, r.z);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ground = Math.min(
            ground,
            sampleTerrainHeight(
              r.x + Math.cos(a) * foot,
              r.z + Math.sin(a) * foot,
            ),
          );
        }
        const y = ground - r.scaleY * 0.48;
        return (
          <mesh
            key={i}
            geometry={variants[r.variant]}
            position={[r.x, y, r.z]}
            rotation={[r.rotX, r.rotY, r.rotZ]}
            scale={[r.scaleX, r.scaleY, r.scaleZ]}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial
              color={r.color}
              roughness={0.96}
              metalness={0}
              vertexColors
            />
          </mesh>
        );
      })}
    </group>
  );
}
