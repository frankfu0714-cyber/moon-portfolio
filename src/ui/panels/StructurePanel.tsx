"use client";

import type { Structure } from "@/lib/missions";

export function StructurePanel({ structure }: { structure: Structure }) {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed opacity-90">
      <p>{structure.intro}</p>
      {structure.introZh && (
        <p className="opacity-80">{structure.introZh}</p>
      )}
    </div>
  );
}
