"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/ui/App").then((m) => m.App), {
  ssr: false,
});

export default function Home() {
  return <App />;
}
