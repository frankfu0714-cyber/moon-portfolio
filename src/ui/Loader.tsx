"use client";

import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";

export function Loader() {
  const { progress, active } = useProgress();
  const pct = Math.min(100, Math.round(progress));
  // Hide once all trackable loads are done. active flips to false when the
  // LoadingManager queue drains; progress >= 100 is a fallback in case a
  // late-registered loader keeps active bouncing.
  const visible = active && progress < 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05060a] no-select"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0.9 }}
            animate={{
              scale: [0.95, 1.02, 0.95],
              opacity: [0.9, 1, 0.9],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#f6efe0] to-[#8f887b] shadow-[0_0_60px_rgba(246,239,224,0.35)]" />
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
          </motion.div>
          <div className="mt-8 text-xs uppercase tracking-[0.35em] opacity-70 font-mono">
            Landing on the moon
          </div>
          <div className="mt-2 text-[11px] font-mono opacity-50">{pct}%</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
