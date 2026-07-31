export type Project = {
  name: string;
  nameZh?: string;
  tagline: string;
  platform: "iOS" | "Web" | "Mac" | "Windows" | "iOS · Mac" | "Mac · Win";
  href: string;
  accent: string;
};

// Synced from https://goldotakutw.com/apps
export const PROJECTS: Project[] = [
  {
    name: "Voice Typer",
    tagline: "Speech-to-text for Windows — speak, words appear. Works offline.",
    platform: "Windows",
    href: "https://github.com/frankfu0714-cyber/voice-typer/releases",
    accent: "#9dd6ff",
  },
  {
    name: "KeySave",
    tagline: "Offline-only password manager. AES-256, Face ID, zero servers.",
    platform: "iOS · Mac",
    href: "https://apps.apple.com/app/keysave-password-manager/id6770096263",
    accent: "#ffcf7a",
  },
  {
    name: "WordStory",
    nameZh: "故事辭典",
    tagline: "Save unknown words, let AI stitch them into a short story.",
    platform: "iOS",
    href: "https://apps.apple.com/us/app/wordstory-dictionary/id6780958957",
    accent: "#c9b6ff",
  },
  {
    name: "Bonnie Chatting",
    tagline: "選擇困難救星 — throw Bonnie your options, she decides.",
    platform: "iOS",
    href: "https://apps.apple.com/dz/app/bonnie-chatting/id6782144172",
    accent: "#ffb1c1",
  },
  {
    name: "NativeTone",
    tagline: "Grammar check + how a native speaker would actually say it.",
    platform: "iOS",
    href: "https://apps.apple.com/tw/app/nativetone/id6791874401",
    accent: "#a7e7c4",
  },
  {
    name: "Desktop Pet",
    tagline: "A tiny cat, Shiba, or Husky that lives on top of your screen.",
    platform: "Mac · Win",
    href: "https://github.com/frankfu0714-cyber/desktop-pet/releases",
    accent: "#ffe08a",
  },
  {
    name: "Trip Planner",
    nameZh: "旅行規劃",
    tagline: "AI builds your full itinerary, every stop linked to Google Maps.",
    platform: "Web",
    href: "https://trip-planner-jade-beta.vercel.app/",
    accent: "#ffd580",
  },
  {
    name: "Shuimo",
    nameZh: "水墨",
    tagline: "Real-time ink-in-water fluid sim — tap, swirl, or use gestures.",
    platform: "Web",
    href: "https://shuimo-delta.vercel.app/",
    accent: "#e2e6ea",
  },
  {
    name: "Hong Yan",
    nameZh: "鴻雁",
    tagline: "Turn everyday messages into classical Chinese (文言文) letters.",
    platform: "Web",
    href: "https://hongyan-two.vercel.app/",
    accent: "#e8b4a0",
  },
  {
    name: "CaptureKit Pro",
    tagline: "Extract, edit & export video frames — all in your browser.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/capturekit-pro/",
    accent: "#8ee0d1",
  },
  {
    name: "Tree of Life",
    nameZh: "生命之樹",
    tagline: "Wave at your webcam to grow a tree, bloom photos on branches.",
    platform: "Web",
    href: "https://tree-of-life-phi.vercel.app/",
    accent: "#a7e7c4",
  },
  {
    name: "Firework Gesture",
    nameZh: "幫你放煙火",
    tagline: "手勢放煙火 — wave to launch, wave again to burst.",
    platform: "Web",
    href: "https://firework-gesture.vercel.app/",
    accent: "#ffb1c1",
  },
  {
    name: "Video Essay Simulator",
    tagline: "Practice video essays & interviews with timed simulations.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/Video-Essay-Simulator/",
    accent: "#c9b6ff",
  },
  {
    name: "Retirement Calculator",
    tagline: "FIRE calculator with two strategies — when can you stop working?",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/fire-website/",
    accent: "#ffcf7a",
  },
  {
    name: "Event Toolkit",
    tagline: "Winner picker, countdowns, posters & notes for live events.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/event-tools/",
    accent: "#b1c8ff",
  },
  {
    name: "Event Splitter",
    nameZh: "分帳計算機",
    tagline: "Trip payment tracker — see who owes whom at a glance.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/budget-calculator/event-splitter/",
    accent: "#8ee0d1",
  },
  {
    name: "Expense Settlement",
    nameZh: "結帳計算機",
    tagline: "Per-person expense splitter with live-collab rooms.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/budget-calculator/expense-settlement/",
    accent: "#ffd580",
  },
  {
    name: "Mahjong Scorekeeper",
    nameZh: "麻將記分",
    tagline: "Four-player 麻將 scoring — no paper, no mental math.",
    platform: "Web",
    href: "https://frankfu0714-cyber.github.io/budget-calculator/mahjong/",
    accent: "#9dd6ff",
  },
];
