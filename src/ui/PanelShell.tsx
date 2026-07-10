"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useSceneStore } from "@/lib/store";
import { WAYPOINTS } from "@/lib/waypoints";
import { AboutPanel } from "./panels/AboutPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { ContactPanel } from "./panels/ContactPanel";

export function PanelShell() {
  const activePanel = useSceneStore((s) => s.activePanel);
  const closePanel = useSceneStore((s) => s.closePanel);

  useEffect(() => {
    if (!activePanel) return;
    document.body.style.cursor = "";
  }, [activePanel]);

  const waypoint = WAYPOINTS.find((w) => w.id === activePanel);

  return (
    <AnimatePresence mode="wait">
      {activePanel && waypoint && (
        <motion.div
          key={activePanel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closePanel}
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
              style={{ background: waypoint.flagColor }}
            />
            <div className="p-6 sm:p-8">
              <div className="flex items-baseline justify-between mb-4 gap-4">
                <div>
                  <div
                    className="text-xs uppercase tracking-[0.2em] opacity-60"
                    style={{ color: waypoint.flagColor }}
                  >
                    {waypoint.labelZh}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-medium mt-1">
                    {waypoint.label}
                  </h2>
                </div>
                <button
                  onClick={closePanel}
                  aria-label="Close panel"
                  className="text-sm opacity-60 hover:opacity-100 transition rounded-full px-3 py-1 border border-white/15"
                >
                  Esc
                </button>
              </div>
              {activePanel === "about" && <AboutPanel />}
              {activePanel === "projects" && <ProjectsPanel />}
              {activePanel === "contact" && <ContactPanel />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
