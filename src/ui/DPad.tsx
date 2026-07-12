"use client";

import { motion } from "motion/react";
import { useCallback, useRef } from "react";
import { useSceneStore, type WalkInput } from "@/lib/store";

type Dir = "up" | "down" | "left" | "right";

export function DPad() {
  const active = useRef<Set<Dir>>(new Set());
  const setWalkInput = useSceneStore((s) => s.setWalkInput);

  const publish = useCallback(() => {
    const p = active.current;
    const input: WalkInput = {
      forward: (p.has("up") ? 1 : 0) - (p.has("down") ? 1 : 0),
      strafe: (p.has("right") ? 1 : 0) - (p.has("left") ? 1 : 0),
      // Mobile has no shift; run is desktop-only for now.
      running: false,
    };
    setWalkInput(input);
  }, [setWalkInput]);

  const start = useCallback(
    (d: Dir) => {
      if (!active.current.has(d)) {
        active.current.add(d);
        publish();
      }
    },
    [publish],
  );

  const end = useCallback(
    (d: Dir) => {
      if (active.current.delete(d)) publish();
    },
    [publish],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-3 grid-rows-3 gap-2 w-[196px] h-[196px] no-select"
    >
      <div />
      <PadButton onStart={() => start("up")} onEnd={() => end("up")} label="↑" />
      <div />
      <PadButton onStart={() => start("left")} onEnd={() => end("left")} label="←" />
      <div className="rounded-full bg-white/5 border border-white/10" />
      <PadButton onStart={() => start("right")} onEnd={() => end("right")} label="→" />
      <div />
      <PadButton onStart={() => start("down")} onEnd={() => end("down")} label="↓" />
      <div />
    </motion.div>
  );
}

type ButtonProps = {
  onStart: () => void;
  onEnd: () => void;
  label: string;
};

function PadButton({ onStart, onEnd, label }: ButtonProps) {
  return (
    <motion.button
      type="button"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onPointerLeave={onEnd}
      whileTap={{ scale: 0.9 }}
      className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur text-lg flex items-center justify-center text-white/90 active:bg-white/20"
      aria-label={`Move ${label}`}
    >
      {label}
    </motion.button>
  );
}
