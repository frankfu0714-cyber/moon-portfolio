"use client";

import { useEffect, useRef } from "react";
import { useSceneStore } from "./store";

const KEY_FORWARD = new Set(["KeyW", "ArrowUp"]);
const KEY_BACK = new Set(["KeyS", "ArrowDown"]);
const KEY_LEFT = new Set(["KeyA", "ArrowLeft"]);
const KEY_RIGHT = new Set(["KeyD", "ArrowRight"]);
const KEY_INTERACT = new Set(["KeyE", "Enter"]);
const KEY_CLOSE = new Set(["Escape"]);
const KEY_RUN = new Set(["ShiftLeft", "ShiftRight"]);
const KEY_JUMP = new Set(["Space"]);
const KEY_ROAM = new Set(["KeyR"]); // toggle auto-roam wander mode
const KEY_FLOAT = new Set(["KeyF"]); // toggle boot-thruster float mode

export function useKeyboardInput() {
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const store = useSceneStore.getState;

    const publish = () => {
      const p = pressed.current;
      const forward =
        (p.has("forward") ? 1 : 0) - (p.has("back") ? 1 : 0);
      const strafe =
        (p.has("right") ? 1 : 0) - (p.has("left") ? 1 : 0);
      const running = p.has("run");
      const jumping = p.has("jump");
      useSceneStore.getState().setWalkInput({ forward, strafe, running, jumping });
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (KEY_CLOSE.has(e.code)) {
        const { activePanel, closePanel } = store();
        if (activePanel) {
          e.preventDefault();
          closePanel();
        }
        return;
      }

      if (KEY_INTERACT.has(e.code)) {
        const { nearWaypoint, activePanel, openPanel, closePanel } = store();
        if (activePanel) {
          closePanel();
        } else if (nearWaypoint) {
          openPanel(nearWaypoint);
        }
        return;
      }

      if (KEY_ROAM.has(e.code)) {
        store().toggleAutoRoam();
        return;
      }

      if (KEY_FLOAT.has(e.code)) {
        store().toggleFloatMode();
        return;
      }

      // Ignore walk input while a panel is open
      if (store().activePanel) return;

      let changed = false;
      if (KEY_FORWARD.has(e.code) && !pressed.current.has("forward")) {
        pressed.current.add("forward");
        changed = true;
      } else if (KEY_BACK.has(e.code) && !pressed.current.has("back")) {
        pressed.current.add("back");
        changed = true;
      } else if (KEY_LEFT.has(e.code) && !pressed.current.has("left")) {
        pressed.current.add("left");
        changed = true;
      } else if (KEY_RIGHT.has(e.code) && !pressed.current.has("right")) {
        pressed.current.add("right");
        changed = true;
      } else if (KEY_RUN.has(e.code) && !pressed.current.has("run")) {
        pressed.current.add("run");
        changed = true;
      } else if (KEY_JUMP.has(e.code)) {
        e.preventDefault(); // keep Space from scrolling the page
        if (!pressed.current.has("jump")) {
          pressed.current.add("jump");
          changed = true;
        }
      }
      if (changed) publish();
    };

    const onUp = (e: KeyboardEvent) => {
      let changed = false;
      if (KEY_FORWARD.has(e.code) && pressed.current.delete("forward")) changed = true;
      else if (KEY_BACK.has(e.code) && pressed.current.delete("back")) changed = true;
      else if (KEY_LEFT.has(e.code) && pressed.current.delete("left")) changed = true;
      else if (KEY_RIGHT.has(e.code) && pressed.current.delete("right")) changed = true;
      else if (KEY_RUN.has(e.code) && pressed.current.delete("run")) changed = true;
      else if (KEY_JUMP.has(e.code) && pressed.current.delete("jump")) changed = true;
      if (changed) publish();
    };

    const onBlur = () => {
      if (pressed.current.size > 0) {
        pressed.current.clear();
        publish();
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}

