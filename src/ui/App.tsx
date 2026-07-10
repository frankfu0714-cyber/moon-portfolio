"use client";

import { Scene } from "@/scene/Scene";
import { HUD } from "./HUD";
import { PanelShell } from "./PanelShell";
import { Loader } from "./Loader";
import { useKeyboardInput } from "@/lib/useKeyboardInput";

export function App() {
  useKeyboardInput();

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Scene />
      <HUD />
      <PanelShell />
      <Loader />
    </div>
  );
}
