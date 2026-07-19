"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  useMissionStore,
  selectVisitedCount,
  TOTAL_MISSIONS,
} from "@/lib/missionStore";
import {
  ALL_MISSION_IDS,
  WAYPOINT_MISSION_IDS,
  STRUCTURES,
  type MissionId,
} from "@/lib/missions";
import { WAYPOINTS } from "@/lib/waypoints";

const LABEL_ZH_BY_ID: Record<MissionId, string> = {
  ...Object.fromEntries(
    WAYPOINTS.map((w) => [w.id, w.labelZh]),
  ),
  ...Object.fromEntries(STRUCTURES.map((s) => [s.id, s.labelZh])),
} as Record<MissionId, string>;

const LABEL_BY_ID: Record<MissionId, string> = {
  ...Object.fromEntries(WAYPOINTS.map((w) => [w.id, w.label])),
  ...Object.fromEntries(STRUCTURES.map((s) => [s.id, s.label])),
} as Record<MissionId, string>;

const COLOR_BY_ID: Record<MissionId, string> = {
  ...Object.fromEntries(WAYPOINTS.map((w) => [w.id, w.flagColor])),
  ...Object.fromEntries(STRUCTURES.map((s) => [s.id, s.color])),
} as Record<MissionId, string>;

export function MissionProgress() {
  const visited = useMissionStore((s) => s.visited);
  const visitedCount = useMissionStore((s) => selectVisitedCount(s));
  const [expanded, setExpanded] = useState(false);

  const complete = visitedCount >= TOTAL_MISSIONS;

  return (
    <div
      className="relative no-select"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`rounded-full border backdrop-blur px-3 py-2 text-xs font-mono transition ${
          complete
            ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-100 opacity-100"
            : "border-white/15 bg-black/40 opacity-80 hover:opacity-100"
        }`}
        aria-label="Mission progress"
      >
        {complete ? "COMPLETE " : "MISSIONS "}·{" "}
        <span className="tabular-nums">
          {visitedCount}/{TOTAL_MISSIONS}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0b0d14]/95 backdrop-blur p-3 shadow-2xl"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-50 mb-2 px-1">
              Explore the moon
            </div>
            <ul className="space-y-1">
              {ALL_MISSION_IDS.map((id) => {
                const done = visited[id];
                const isWaypoint = WAYPOINT_MISSION_IDS.includes(
                  id as typeof WAYPOINT_MISSION_IDS[number],
                );
                return (
                  <li
                    key={id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                      done ? "opacity-100" : "opacity-55"
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full flex-none"
                      style={{
                        background: done
                          ? COLOR_BY_ID[id]
                          : "transparent",
                        border: `1px solid ${COLOR_BY_ID[id]}${done ? "" : "88"}`,
                      }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">
                        {LABEL_BY_ID[id]}
                        <span className="opacity-50 ml-1 text-[10px]">
                          {LABEL_ZH_BY_ID[id]}
                        </span>
                      </span>
                    </span>
                    <span className="text-[10px] opacity-40 uppercase tracking-widest">
                      {done ? "done" : isWaypoint ? "flag" : "site"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {complete ? (
              <div className="mt-2 text-[10px] opacity-70 px-1">
                Head to the rocket to launch.
              </div>
            ) : (
              <div className="mt-2 text-[10px] opacity-50 px-1">
                Approach and press <kbd className="font-mono">E</kbd>.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
