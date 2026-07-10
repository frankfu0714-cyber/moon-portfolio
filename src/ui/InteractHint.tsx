"use client";

import { AnimatePresence, motion } from "motion/react";

type Props = {
  visible: boolean;
  label: string;
  labelZh: string;
  color: string;
  onTap: () => void;
};

export function InteractHint({ visible, label, labelZh, color, onTap }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key={label}
          type="button"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          onClick={onTap}
          className="fixed left-1/2 -translate-x-1/2 top-[38%] z-30 pointer-events-auto"
        >
          <div
            className="rounded-full border px-4 py-2 backdrop-blur-md bg-black/40 shadow-lg no-select"
            style={{ borderColor: `${color}66` }}
          >
            <div className="flex items-center gap-3 text-sm">
              <span
                className="hidden sm:inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-mono"
                style={{ borderColor: `${color}88`, color }}
              >
                E
              </span>
              <span className="sm:hidden text-[11px]" style={{ color }}>
                tap
              </span>
              <span>
                View <span style={{ color }}>{label}</span>
                <span className="opacity-60 ml-2 text-[12px]">{labelZh}</span>
              </span>
            </div>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
