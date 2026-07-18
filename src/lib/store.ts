import { create } from "zustand";
import type { WaypointId } from "./waypoints";

export type WalkInput = {
  forward: number; // -1..1
  strafe: number; // -1..1
  running: boolean; // shift-modifier — bumps the speed cap for a jog
  jumping: boolean; // space — low-gravity hop
};

type State = {
  ready: boolean;
  muted: boolean;
  activePanel: WaypointId | null;
  nearWaypoint: WaypointId | null;
  walkInput: WalkInput;
  moving: boolean;
  autoRoam: boolean; // astronaut wanders the moonscape on his own
  floatMode: boolean; // boot thrusters — hover above the regolith
};

type Actions = {
  setReady: (ready: boolean) => void;
  toggleMute: () => void;
  openPanel: (id: WaypointId) => void;
  closePanel: () => void;
  setNearWaypoint: (id: WaypointId | null) => void;
  setWalkInput: (input: WalkInput) => void;
  setMoving: (moving: boolean) => void;
  toggleAutoRoam: () => void;
  toggleFloatMode: () => void;
};

export const useSceneStore = create<State & Actions>((set) => ({
  ready: false,
  muted: true,
  activePanel: null,
  nearWaypoint: null,
  walkInput: { forward: 0, strafe: 0, running: false, jumping: false },
  moving: false,
  autoRoam: false,
  floatMode: false,
  setReady: (ready) => set({ ready }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  openPanel: (id) => set({ activePanel: id }),
  closePanel: () => set({ activePanel: null }),
  setNearWaypoint: (id) => set({ nearWaypoint: id }),
  setWalkInput: (walkInput) => set({ walkInput }),
  setMoving: (moving) => set({ moving }),
  toggleAutoRoam: () => set((s) => ({ autoRoam: !s.autoRoam })),
  toggleFloatMode: () => set((s) => ({ floatMode: !s.floatMode })),
}));
