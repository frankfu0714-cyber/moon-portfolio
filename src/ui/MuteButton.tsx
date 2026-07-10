"use client";

import { motion } from "motion/react";
import { useSceneStore } from "@/lib/store";

export function MuteButton() {
  const muted = useSceneStore((s) => s.muted);
  const toggleMute = useSceneStore((s) => s.toggleMute);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={toggleMute}
      aria-label={muted ? "Unmute ambient audio" : "Mute ambient audio"}
      className="rounded-full border border-white/15 bg-black/40 backdrop-blur px-3 py-2 text-xs opacity-80 hover:opacity-100 transition font-mono"
    >
      {muted ? "SOUND · OFF" : "SOUND · ON"}
    </motion.button>
  );
}
