"use client";

export function AboutPanel() {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed opacity-90">
      <p>
        <span className="text-white">Frank Fu</span> ·{" "}
        <span className="opacity-70">GOLDOTAKU / 宅</span>
      </p>
      <p>
        Build-in-public indie hacker from Taiwan. Currently on a self-imposed
        challenge: <span className="text-white">100 days, 20 apps</span>.
        Ship small, ship often, keep learning in front of everyone.
      </p>
      <p className="opacity-80">
        我是宅，一個在台灣的 indie hacker，正在挑戰 100 天做 20 支 App。
        每一支都邊做邊發，把過程留在網路上。
      </p>
      <p className="opacity-80">
        This portfolio is meant to feel like the work — small, deliberate,
        a little playful. Walk around, poke at things, don&apos;t rush.
      </p>
      <div className="pt-2 flex flex-wrap gap-2 text-xs">
        <Chip>iOS · Swift</Chip>
        <Chip>Web · Next.js</Chip>
        <Chip>macOS</Chip>
        <Chip>Design</Chip>
        <Chip>Build-in-public</Chip>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 px-3 py-1 opacity-80">
      {children}
    </span>
  );
}
