export type ContactLink = {
  label: string;
  handle: string;
  href: string;
};

// Handles are best-effort — Frank to confirm/correct.
export const CONTACT_LINKS: ContactLink[] = [
  {
    label: "Email",
    handle: "frankfu0714@gmail.com",
    href: "mailto:frankfu0714@gmail.com",
  },
  {
    label: "X",
    handle: "@goldotaku",
    href: "https://x.com/goldotaku",
  },
  {
    label: "Threads",
    handle: "@goldotaku",
    href: "https://threads.net/@goldotaku",
  },
  {
    label: "LinkedIn",
    handle: "Frank Fu",
    href: "https://www.linkedin.com/in/frank-fu/",
  },
  {
    label: "GitHub",
    handle: "frankfu0714-cyber",
    href: "https://github.com/frankfu0714-cyber",
  },
];
