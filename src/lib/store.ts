import { create } from "zustand";
import type { WaypointId } from "./waypoints";

export type WalkInput = {
  forward: number; // -1..1
  strafe: number; // -1..1
  running: boolean; // shift-modifier — bumps the speed cap for a jog
};

type State = {
  ready: boolean;
  muted: boolean;
  activePanel: WaypointId | null;
  nearWaypoint: WaypointId | null;
  walkInput: WalkInput;
  moving: boolean;
};

type Actions = {
  setReady: (ready: boolean) => void;
  toggleMute: () => void;
  openPanel: (id: WaypointId) => void;
  closePanel: () => void;
  setNearWaypoint: (id: WaypointId | null) => void;
  setWalkInput: (input: WalkInput) => void;
  setMoving: (moving: boolean) => void;
};

export const useSceneStore = create<State & Actions>((set) => ({
  ready: false,
  muted: true,
  activePanel: null,
  nearWaypoint: null,
  walkInput: { forward: 0, strafe: 0, running: false },
  moving: false,
  setReady: (ready) => set({ ready }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  openPanel: (id) => set({ activePanel: id }),
  closePanel: () => set({ activePanel: null }),
  setNearWaypoint: (id) => set({ nearWaypoint: id }),
  setWalkInput: (walkInput) => set({ walkInput }),
  setMoving: (moving) => set({ moving }),
}));
