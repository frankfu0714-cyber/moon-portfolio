"use client";

import { PROJECTS } from "@/lib/projects";

export function ProjectsPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm opacity-70">
        A rolling list — {PROJECTS.length} shipped, more on the way.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROJECTS.map((p) => (
          <li key={p.name}>
            <a
              href={p.href}
              target={p.href.startsWith("http") ? "_blank" : undefined}
              rel={p.href.startsWith("http") ? "noreferrer" : undefined}
              className="group block rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05] transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium">{p.name}</span>
                    {p.nameZh && (
                      <span className="text-[13px] opacity-60">
                        {p.nameZh}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] opacity-70 mt-1 line-clamp-2">
                    {p.tagline}
                  </p>
                </div>
                <span
                  className="shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border"
                  style={{
                    color: p.accent,
                    borderColor: `${p.accent}55`,
                  }}
                >
                  {p.platform}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-50 pt-2">
        Real project links coming soon — most are placeholders while I wire the URLs.
      </p>
    </div>
  );
}
