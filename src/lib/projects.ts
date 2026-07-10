export type Project = {
  name: string;
  nameZh?: string;
  tagline: string;
  platform: "iOS" | "Web" | "Mac";
  href: string;
  accent: string;
};

// Placeholder URLs (#) — Frank to wire real project links after.
export const PROJECTS: Project[] = [
  {
    name: "Bonnie Chatting",
    tagline: "Chat-your-way-to-a-decision iOS app.",
    platform: "iOS",
    href: "#",
    accent: "#ffb1c1",
  },
  {
    name: "Wordstory",
    nameZh: "故事辭典",
    tagline: "EN–ZH dictionary that tells you a tiny story per word.",
    platform: "iOS",
    href: "#",
    accent: "#9dd6ff",
  },
  {
    name: "Video Essay Simulator",
    tagline: "Draft video essays in a distraction-free web sim.",
    platform: "Web",
    href: "#",
    accent: "#c9b6ff",
  },
  {
    name: "Trip Planner",
    tagline: "Plan trips with an itinerary that plans back.",
    platform: "Web",
    href: "#",
    accent: "#ffd580",
  },
  {
    name: "Uncle's Pills",
    tagline: "Gentle medication reminders for the family.",
    platform: "iOS",
    href: "#",
    accent: "#a7e7c4",
  },
  {
    name: "KeySave",
    tagline: "Save every keystroke you almost lost.",
    platform: "Mac",
    href: "#",
    accent: "#ffcf7a",
  },
  {
    name: "Hong Yan",
    nameZh: "鴻雁",
    tagline: "Slow, letter-shaped correspondence on the web.",
    platform: "Web",
    href: "#",
    accent: "#e8b4a0",
  },
  {
    name: "Shuimo",
    nameZh: "水墨",
    tagline: "Ink-fluid simulator that behaves like a brush.",
    platform: "Web",
    href: "#",
    accent: "#e2e6ea",
  },
  {
    name: "Suminagashi",
    nameZh: "墨流",
    tagline: "Marbled paper you can pull from your browser.",
    platform: "Web",
    href: "#",
    accent: "#b1c8ff",
  },
  {
    name: "Desktop Pet",
    tagline: "A tiny critter that lives on your menu bar.",
    platform: "Mac",
    href: "#",
    accent: "#ffe08a",
  },
  {
    name: "OnePost",
    tagline: "Draft once, post everywhere. For build-in-public.",
    platform: "Web",
    href: "#",
    accent: "#8ee0d1",
  },
  {
    name: "SplitCalc",
    tagline: "The budget calculator that actually splits the bill.",
    platform: "Web",
    href: "#",
    accent: "#ffb1c1",
  },
];
