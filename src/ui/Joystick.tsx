"use client";

import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useSceneStore, type WalkInput } from "@/lib/store";

// ------------------------------------------------------------------
// Mobile virtual joystick: a big outer ring with a draggable knob.
// Drag direction = walk direction (analog), and pushing the knob all
// the way to the ring's edge kicks the astronaut into a run.
// ------------------------------------------------------------------

const RING_SIZE = 148; // outer circle diameter (px)
const KNOB_SIZE = 60; // inner circle diameter (px)
// Max distance the knob center travels from the ring center.
const TRAVEL = (RING_SIZE - KNOB_SIZE) / 2;
// Normalized magnitude at which walking becomes running (knob at edge).
const RUN_THRESHOLD = 0.92;

const IDLE_INPUT: WalkInput = {
  forward: 0,
  strafe: 0,
  running: false,
  jumping: false,
};

export function Joystick() {
  const ringRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [running, setRunning] = useState(false);
  const setWalkInput = useSceneStore((s) => s.setWalkInput);

  const publish = useCallback(
    (clientX: number, clientY: number) => {
      const ring = ringRef.current;
      if (!ring) return;
      const rect = ring.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      // Clamp the knob inside the ring.
      if (dist > TRAVEL) {
        dx = (dx / dist) * TRAVEL;
        dy = (dy / dist) * TRAVEL;
      }
      setKnob({ x: dx, y: dy });

      // Normalize to -1..1. Screen up = forward, so forward = -dy.
      const mag = Math.min(dist / TRAVEL, 1);
      const isRunning = mag >= RUN_THRESHOLD;
      setRunning(isRunning);
      setWalkInput({
        forward: -dy / TRAVEL,
        strafe: dx / TRAVEL,
        running: isRunning,
        jumping: false,
      });
    },
    [setWalkInput],
  );

  const release = useCallback(() => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    setRunning(false);
    setWalkInput(IDLE_INPUT);
  }, [setWalkInput]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className="no-select"
    >
      <div
        ref={ringRef}
        role="application"
        aria-label="Movement joystick — drag to walk, push to the edge to run"
        className={`relative rounded-full border backdrop-blur transition-colors duration-150 ${
          running
            ? "border-sky-300/70 bg-sky-400/10"
            : "border-white/20 bg-white/5"
        }`}
        style={{ width: RING_SIZE, height: RING_SIZE, touchAction: "none" }}
        onPointerDown={(e) => {
          pointerId.current = e.pointerId;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          publish(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerId.current === e.pointerId) publish(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (pointerId.current === e.pointerId) release();
        }}
        onPointerCancel={(e) => {
          if (pointerId.current === e.pointerId) release();
        }}
      >
        {/* Direction ticks — subtle N/S/E/W dots on the ring */}
        {[0, 90, 180, 270].map((deg) => (
          <span
            key={deg}
            className="absolute h-1 w-1 rounded-full bg-white/25"
            style={{
              left: "50%",
              top: "50%",
              transform: `rotate(${deg}deg) translateY(-${RING_SIZE / 2 - 8}px) translate(-50%, -50%)`,
            }}
          />
        ))}

        {/* Knob */}
        <div
          className={`absolute rounded-full border shadow-lg transition-colors duration-150 ${
            running
              ? "border-sky-200/80 bg-sky-300/30"
              : "border-white/30 bg-white/15"
          }`}
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            left: RING_SIZE / 2 - KNOB_SIZE / 2 + knob.x,
            top: RING_SIZE / 2 - KNOB_SIZE / 2 + knob.y,
          }}
        />

        {/* RUN label appears when the knob hits the edge */}
        <span
          className={`pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.3em] transition-opacity duration-150 ${
            running ? "opacity-80 text-sky-200" : "opacity-0"
          }`}
        >
          run
        </span>
      </div>
    </motion.div>
  );
}
