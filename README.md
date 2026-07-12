# moon-portfolio

A chill, walkable moon-surface portfolio for **Frank Fu (GOLDOTAKU / 宅)**.
Keyboard-controlled astronaut. Three flags. Panels for About / Projects / Contact.
Built for the "100 days, 20 apps" build-in-public run.

Reference vibe: [abhishekdev-portfolio.vercel.app](https://abhishekdev-portfolio.vercel.app/) —
their rocket flies through space; here the astronaut walks the moon.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

- **WASD / arrow keys** — walk
- **E / Enter** — open the panel at the nearest flag
- **Esc** — close a panel
- Mobile: on-screen d-pad and tap-to-interact

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4
- `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`
- `zustand` for scene state (walk input, proximity, panel open/close)
- `motion` (Framer's successor) for 2D UI

The whole 3D scene is dynamically imported with `ssr: false` so nothing three-heavy
runs on the server. DPR capped at 1.5 for mobile Lighthouse.

## Directory map

```
src/
  app/          Next.js App Router entry (layout, page)
  lib/          Store, keyboard hook, waypoints/projects/contact config
  scene/        Everything inside <Canvas>: moon, earth, stars, astronaut,
                controller, waypoint flags, dust puffs, postprocessing
  ui/           2D overlays: HUD, panels, loader, d-pad, mute button
public/
  hdri-space.hdr             Poly Haven "Dikhololo Night" 1k
  textures/moon/color.jpg    Solar System Scope 2k moon albedo
  textures/earth/color.jpg   Solar System Scope 2k earth daymap
  models/astronaut.glb       "Astronaut A" by Quaternius via Poly Pizza (CC0)
  models/cesium-man.glb      Khronos sample walking model (kept as rigged-model reference)
```

## Asset credits

| Asset | Source | License |
| --- | --- | --- |
| Space HDRI (Dikhololo Night) | [Poly Haven](https://polyhaven.com/a/dikhololo_night) | CC0 |
| Moon 2k albedo | [Solar System Scope Textures](https://www.solarsystemscope.com/textures/) | CC-BY 4.0 |
| Earth 2k daymap | [Solar System Scope Textures](https://www.solarsystemscope.com/textures/) | CC-BY 4.0 |
| CesiumMan walking rig (reference only, not shipped in-scene) | [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | CC-BY 4.0 |
| Astronaut in scene — "Astronaut A" by Quaternius via [Poly Pizza](https://poly.pizza/) | [poly.pizza](https://poly.pizza/) | CC0 |

## What's stubbed

Everything renders and interacts, but a handful of things are best-effort placeholders
that Frank should confirm or replace:

- **Astronaut model.** Ships as Quaternius' "Astronaut A" (Poly Pizza, CC0). The
  GLB ships with 24 pre-baked animation clips; the scene plays
  `CharacterArmature|Idle`, `CharacterArmature|Walk`, and `CharacterArmature|Run`
  via `useAnimations`, crossfading (150 ms) between them based on move speed and
  Shift-run state. No hand-rolled bone math — the animator's polish carries the
  motion.
- **Project links.** All twelve projects in `src/lib/projects.ts` point to `#`.
  Wire real URLs.
- **Contact handles.** X, Threads, LinkedIn use best-guess handles/paths. GitHub is
  confirmed (`frankfu0714-cyber`). Confirm and correct in `src/lib/contact.ts`.
- **Sound.** The mute button toggles state but no audio track ships — no MP3/loop file
  is included. Drop a small chill loop at `public/audio/ambient.mp3` and wire it in
  `src/ui/App.tsx` (autoplay-safe: only start on first user interaction).
- **Moon displacement.** No topography/heightmap — the surface is a flat disc with a
  tiled color map. Add a bump/normal map at `public/textures/moon/normal.jpg` and pass
  `normalMap` in `MoonSurface.tsx` if you want more surface detail.

## Deploy

Push to GitHub, connect the repo in Vercel, ship. No env vars needed.

## License

Code: MIT (Frank). Third-party asset licenses live with the credits above.
