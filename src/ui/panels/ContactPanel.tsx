"use client";

import { CONTACT_LINKS } from "@/lib/contact";

export function ContactPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm opacity-80">
        Say hi. I read everything, I don&apos;t always reply fast.
      </p>
      <ul className="space-y-2">
        {CONTACT_LINKS.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noreferrer" : undefined}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05] transition group"
            >
              <span className="text-sm opacity-70 uppercase tracking-wider">
                {l.label}
              </span>
              <span className="font-mono text-sm group-hover:text-white transition">
                {l.handle}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-50 pt-2">
        Some handles are best-guesses — will correct after Frank confirms.
      </p>
    </div>
  );
}
