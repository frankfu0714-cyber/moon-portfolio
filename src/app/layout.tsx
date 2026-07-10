import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Frank Fu (GOLDOTAKU / 宅) — Moon Portfolio",
  description:
    "A chill, walkable moon-surface portfolio for GOLDOTAKU. 100 days, 20 apps. Build-in-public from Taiwan.",
  openGraph: {
    title: "Frank Fu (GOLDOTAKU / 宅) — Moon Portfolio",
    description:
      "A chill, walkable moon-surface portfolio for GOLDOTAKU. 100 days, 20 apps. Build-in-public from Taiwan.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
