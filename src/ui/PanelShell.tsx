"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS } from "@/lib/waypoints";
import { STRUCTURE_BY_ID } from "@/lib/missions";
import { AboutPanel } from "./panels/AboutPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { ContactPanel } from "./panels/ContactPanel";
import { StructurePanel } from "./panels/StructurePanel";

// Discriminated shape passed to the shared modal chrome — whether the
// panel is showing a portfolio waypoint or a structure intro, both
// render the same rounded card with a colored top strip + label pair.
type PanelDescriptor = {
  key: string;
  label: string;
  labelZh: string;
  color: string;
  body: React.ReactNode;
};

export function PanelShell() {
  const activePanel = useSceneStore((s) => s.activePanel);
  const activeStructure = useSceneStore((s) => s.activeStructure);
  const closePanel = useSceneStore((s) => s.closePanel);
  const closeStructure = useSceneStore((s) => s.closeStructure);

  useEffect(() => {
    if (!activePanel && !activeStructure) return;
    document.body.style.cursor = "";
  }, [activePanel, activeStructure]);

  // Structure takes precedence over waypoint if both are somehow open
  // (shouldn't happen in practice — the E handler opens one or the
  // other, never both — but this is the safer render order).
  let descriptor: PanelDescriptor | null = null;
  let onClose: () => void = () => undefined;
  if (activeStructure) {
    const s = STRUCTURE_BY_ID[activeStructure];
    if (s) {
      descriptor = {
        key: `structure:${s.id}`,
        label: s.label,
        labelZh: s.labelZh,
        color: s.color,
        body: <StructurePanel structure={s} />,
      };
      onClose = closeStructure;
    }
  } else if (activePanel) {
    const w = WAYPOINTS.find((x) => x.id === activePanel);
    if (w) {
      descriptor = {
        key: `waypoint:${w.id}`,
        label: w.label,
        labelZh: w.labelZh,
        color: w.flagColor,
        body:
          activePanel === "about" ? (
            <AboutPanel />
          ) : activePanel === "projects" ? (
            <ProjectsPanel />
          ) : (
            <ContactPanel />
          ),
      };
      onClose = closePanel;
    }
  }

  return (
    <AnimatePresence mode="wait">
      {descriptor && (
        <motion.div
          key={descriptor.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0d14]/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-1 rounded-t-3xl"
              style={{ background: descriptor.color }}
            />
            <div className="p-6 sm:p-8">
              <div className="flex items-baseline justify-between mb-4 gap-4">
                <div>
                  <div
                    className="text-xs uppercase tracking-[0.2em] opacity-60"
                    style={{ color: descriptor.color }}
                  >
                    {descriptor.labelZh}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-medium mt-1">
                    {descriptor.label}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close panel"
                  className="text-sm opacity-60 hover:opacity-100 transition rounded-full px-3 py-1 border border-white/15"
                >
                  Esc
                </button>
              </div>
              {descriptor.body}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
