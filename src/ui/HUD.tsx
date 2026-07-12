"use client";

import { motion, AnimatePresence } from "motion/react";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS } from "@/lib/waypoints";
import { DPad } from "./DPad";
import { InteractHint } from "./InteractHint";
import { MuteButton } from "./MuteButton";

export function HUD() {
  const nearWaypoint = useSceneStore((s) => s.nearWaypoint);
  const activePanel = useSceneStore((s) => s.activePanel);
  const openPanel = useSceneStore((s) => s.openPanel);
  const near = WAYPOINTS.find((w) => w.id === nearWaypoint);

  return (
    <>
      {/* Top-left brand */}
      <div className="pointer-events-none fixed top-4 left-4 z-30 no-select">
        <div className="text-xs uppercase tracking-[0.3em] opacity-60">
          GOLDOTAKU · 宅
        </div>
        <div className="text-sm mt-1 opacity-80">
          Frank Fu — Moon Portfolio
        </div>
      </div>

      {/* Top-right mute */}
      <div className="fixed top-4 right-4 z-30">
        <MuteButton />
      </div>

      {/* Bottom-left keyboard hint (desktop only) */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-30 no-select hidden sm:block">
        <AnimatePresence>
          {!activePanel && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="text-[11px] font-mono opacity-70 space-y-1"
            >
              <div>
                <Kbd>W</Kbd>
                <Kbd>A</Kbd>
                <Kbd>S</Kbd>
                <Kbd>D</Kbd>
                <span className="ml-2">walk</span>
              </div>
              <div>
                <Kbd>Shift</Kbd>
                <span className="ml-2">hold to run</span>
              </div>
              <div>
                <Kbd>E</Kbd>
                <span className="ml-2">interact at a flag</span>
              </div>
              <div>
                <Kbd>Esc</Kbd>
                <span className="ml-2">close panel</span>
              </div>
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

      {/* Asset credit pill — bottom right */}
      <div className="fixed bottom-3 right-3 z-30 no-select">
        <a
          href="https://poly.pizza/m/0076345b-bbea-42d5-931c-4a5ad2050b18"
          target="_blank"
          rel="noopener noreferrer"
          title={'"Astronaut A" by Quaternius via Poly Pizza (CC0 — credit kept as courtesy)'}
          className="block text-[10px] tracking-wide opacity-40 hover:opacity-80 transition-opacity rounded-full border border-white/15 px-2 py-1 bg-black/25 backdrop-blur-sm"
        >
          astronaut · Quaternius · CC0
        </a>
      </div>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block min-w-[1.8em] text-center rounded border border-white/25 px-1.5 py-0.5 mx-0.5">
      {children}
    </span>
  );
}
