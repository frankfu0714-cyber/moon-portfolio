"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS } from "@/lib/waypoints";
import { STRUCTURE_BY_ID, ROCKET_COLOR } from "@/lib/missions";
import {
  useMissionStore,
  selectRocketUnlocked,
  selectVisitedCount,
  TOTAL_MISSIONS,
} from "@/lib/missionStore";
import { DPad } from "./DPad";
import { InteractHint } from "./InteractHint";
import { MuteButton } from "./MuteButton";
import { MissionProgress } from "./MissionProgress";
import { RocketRewardOverlay } from "./RocketRewardOverlay";

// How long the control hints stay on screen before fading away. Minimal
// cinematic HUD: after this, the frame is just the scene + a whisper of a
// title in the corner.
const HINTS_VISIBLE_MS = 9000;

function ModeButton({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`rounded-full border backdrop-blur px-3 py-2 text-xs transition font-mono ${
        on
          ? "border-sky-300/60 bg-sky-400/15 text-sky-100 opacity-100"
          : "border-white/15 bg-black/40 opacity-80 hover:opacity-100"
      }`}
    >
      {label} · {on ? "ON" : "OFF"}
    </motion.button>
  );
}

export function HUD() {
  const nearWaypoint = useSceneStore((s) => s.nearWaypoint);
  const activePanel = useSceneStore((s) => s.activePanel);
  const openPanel = useSceneStore((s) => s.openPanel);
  const autoRoam = useSceneStore((s) => s.autoRoam);
  const floatMode = useSceneStore((s) => s.floatMode);
  const toggleAutoRoam = useSceneStore((s) => s.toggleAutoRoam);
  const toggleFloatMode = useSceneStore((s) => s.toggleFloatMode);
  const nearVehicle = useSceneStore((s) => s.nearVehicle);
  const driving = useSceneStore((s) => s.driving);
  const enterVehicle = useSceneStore((s) => s.enterVehicle);
  const exitVehicle = useSceneStore((s) => s.exitVehicle);
  const nearStructure = useSceneStore((s) => s.nearStructure);
  const activeStructure = useSceneStore((s) => s.activeStructure);
  const openStructure = useSceneStore((s) => s.openStructure);
  const nearRocket = useSceneStore((s) => s.nearRocket);
  const showingRocketReward = useSceneStore((s) => s.showingRocketReward);
  const showRocketReward = useSceneStore((s) => s.showRocketReward);
  const rocketUnlocked = useMissionStore((s) => selectRocketUnlocked(s));
  const visitedCount = useMissionStore((s) => selectVisitedCount(s));
  const markVisited = useMissionStore((s) => s.markVisited);
  const markRocketRewardShown = useMissionStore(
    (s) => s.markRocketRewardShown,
  );

  const near = WAYPOINTS.find((w) => w.id === nearWaypoint);
  const structure = nearStructure ? STRUCTURE_BY_ID[nearStructure] : null;

  // Any modal / video open silences the world-space hints.
  const anyModalOpen =
    !!activePanel || !!activeStructure || showingRocketReward;

  // E priority (matches useKeyboardInput): rocket > vehicle >
  // structure > waypoint. Reflected here for the interact hint.
  let hint:
    | { label: string; labelZh: string; color: string; verb: string; onTap: () => void }
    | null = null;
  if (!anyModalOpen) {
    if (nearRocket) {
      if (rocketUnlocked) {
        hint = {
          label: "launch",
          labelZh: "發射",
          color: ROCKET_COLOR,
          verb: "",
          onTap: () => {
            showRocketReward();
            markRocketRewardShown();
          },
        };
      } else {
        hint = {
          label: `${visitedCount} / ${TOTAL_MISSIONS} missions`,
          labelZh: "任務未完成",
          color: "#8892a2",
          verb: "🔒",
          onTap: () => undefined,
        };
      }
    } else if (nearVehicle || driving) {
      hint = {
        label: driving ? "exit Cybertruck" : "enter Cybertruck",
        labelZh: driving ? "下車" : "上車",
        color: "#9dd6ff",
        verb: "",
        onTap: () => (driving ? exitVehicle() : enterVehicle()),
      };
    } else if (structure) {
      hint = {
        label: structure.label,
        labelZh: structure.labelZh,
        color: structure.color,
        verb: "Inspect",
        onTap: () => {
          openStructure(structure.id);
          markVisited(structure.id);
        },
      };
    } else if (near) {
      hint = {
        label: near.label,
        labelZh: near.labelZh,
        color: near.flagColor,
        verb: "View",
        onTap: () => {
          openPanel(near.id);
          markVisited(near.id);
        },
      };
    }
  }

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

      {/* Top-right controls: missions / roam / float / sound */}
      <div className="fixed top-4 right-4 z-30 flex gap-2 opacity-70 hover:opacity-100 transition-opacity">
        <MissionProgress />
        <ModeButton label="ROAM" on={autoRoam} onClick={toggleAutoRoam} />
        <ModeButton label="FLOAT" on={floatMode} onClick={toggleFloatMode} />
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
              W A S D&ensp;walk&ensp;·&ensp;Shift&ensp;run&ensp;·&ensp;R&ensp;roam&ensp;·&ensp;F&ensp;float&ensp;·&ensp;E&ensp;interact
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Interact hint centered above head. Single hint with priority:
          rocket > vehicle > structure > waypoint. Computed above. */}
      <InteractHint
        visible={!!hint}
        label={hint?.label ?? ""}
        labelZh={hint?.labelZh ?? ""}
        color={hint?.color ?? "#fff"}
        verb={hint?.verb ?? ""}
        onTap={hint?.onTap ?? (() => undefined)}
      />

      {/* Rocket reward video + completion toast */}
      <RocketRewardOverlay />

      {/* Mobile d-pad */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 sm:hidden">
        <AnimatePresence>{!activePanel && <DPad />}</AnimatePresence>
      </div>

      {/* Asset credits — bottom right, near-invisible until hovered */}
      <div className="fixed bottom-3 right-3 z-30 no-select flex flex-col items-end gap-1">
        <a
          href="https://sketchfab.com/3d-models/astronaut-d5a16f7ec11c4b1d876059cbf6adbf56"
          target="_blank"
          rel="noopener noreferrer"
          title={'Astronaut model from Sketchfab (CC-BY 4.0) · animations by Mixamo'}
          className="block text-[9px] tracking-[0.15em] uppercase opacity-25 hover:opacity-70 transition-opacity"
        >
          astronaut · Sketchfab · CC-BY 4.0
        </a>
        <a
          href="https://poly.pizza/m/Jpar3f32mt"
          target="_blank"
          rel="noopener noreferrer"
          title="Cybertruck model by Mobolaji, via Poly Pizza (CC-BY 3.0)"
          className="block text-[9px] tracking-[0.15em] uppercase opacity-25 hover:opacity-70 transition-opacity"
        >
          cybertruck · Mobolaji · Poly Pizza · CC-BY 3.0
        </a>
      </div>
    </>
  );
}
