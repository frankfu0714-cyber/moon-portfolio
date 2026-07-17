"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS } from "@/lib/waypoints";
import { DPad } from "./DPad";
import { InteractHint } from "./InteractHint";
import { MuteButton } from "./MuteButton";

// How long the control hints stay on screen before fading away. Minimal
// cinematic HUD: after this, the frame is just the scene + a whisper of a
// title in the corner.
const HINTS_VISIBLE_MS = 9000;

export function HUD() {
  const nearWaypoint = useSceneStore((s) => s.nearWaypoint);
  const activePanel = useSceneStore((s) => s.activePanel);
  const openPanel = useSceneStore((s) => s.openPanel);
  const near = WAYPOINTS.find((w) => w.id === nearWaypoint);

  const [hintsVisible, setHintsVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHintsVisible(false), HINTS_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Top-left title — film-credit whisper */}
      <div className="pointer-events-none fixed top-5 left-5 z-30 no-select">
        <div className="text-[11px] uppercase tracking-[0.45em] opacity-55">
          Frank Fu
        </div>
        <div className="text-[9px] uppercase tracking-[0.35em] opacity-30 mt-1.5">
          GOLDOTAKU · 宅 — Moon Portfolio
        </div>
      </div>

      {/* Top-right mute */}
      <div className="fixed top-4 right-4 z-30 opacity-70 hover:opacity-100 transition-opacity">
        <MuteButton />
      </div>

      {/* Bottom-center control hints — one quiet line, fades out on its own */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 z-30 no-select hidden sm:block">
        <AnimatePresence>
          {hintsVisible && !activePanel && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.55, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 1.2 }}
              className="text-[10px] font-mono tracking-[0.2em] uppercase whitespace-nowrap"
            >
              W A S D&ensp;walk&ensp;·&ensp;Shift&ensp;run&ensp;·&ensp;E&ensp;interact&ensp;·&ensp;Esc&ensp;close
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Interact hint centered above head */}
      <InteractHint
        visible={!!near && !activePanel}
        label={near?.label ?? ""}
        labelZh={near?.labelZh ?? ""}
        color={near?.flagColor ?? "#fff"}
        onTap={() => near && openPanel(near.id)}
      />

      {/* Mobile d-pad */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 sm:hidden">
        <AnimatePresence>{!activePanel && <DPad />}</AnimatePresence>
      </div>

      {/* Asset credit — bottom right, near-invisible until hovered */}
      <div className="fixed bottom-3 right-3 z-30 no-select">
        <a
          href="https://poly.pizza/m/dLHpzNdygsg"
          target="_blank"
          rel="noopener noreferrer"
          title={'"Astronaut" by Poly by Google (CC-BY), via model-viewer shared assets'}
          className="block text-[9px] tracking-[0.15em] uppercase opacity-25 hover:opacity-70 transition-opacity"
        >
          astronaut · Poly by Google · CC-BY
        </a>
      </div>
    </>
  );
}
