import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ALL_MISSION_IDS,
  TOTAL_MISSION_COUNT,
  type MissionId,
} from "./missions";

type State = {
  visited: Record<MissionId, boolean>;
  rocketRewardShown: boolean; // sticky so we don't auto-replay on refresh
};

type Actions = {
  markVisited: (id: MissionId) => void;
  markRocketRewardShown: () => void;
  resetMissions: () => void;
};

const emptyVisited = (): Record<MissionId, boolean> =>
  Object.fromEntries(ALL_MISSION_IDS.map((id) => [id, false])) as Record<
    MissionId,
    boolean
  >;

// Persists to localStorage. Whitelist just the `visited` map + the
// rocket-shown flag so future state additions don't get accidentally
// persisted (and we don't have to bump a version every time we add
// non-persistent state).
export const useMissionStore = create<State & Actions>()(
  persist(
    (set) => ({
      visited: emptyVisited(),
      rocketRewardShown: false,
      markVisited: (id) =>
        set((s) =>
          s.visited[id]
            ? s // already checked — avoid triggering re-renders
            : { visited: { ...s.visited, [id]: true } },
        ),
      markRocketRewardShown: () => set({ rocketRewardShown: true }),
      resetMissions: () =>
        set({ visited: emptyVisited(), rocketRewardShown: false }),
    }),
    {
      name: "moon-portfolio-missions",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : // SSR-safe stub. `persist` calls storage during hydration on
            // the server; return a no-op so it doesn't crash. The real
            // read happens client-side once the module rehydrates.
            {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            },
      ),
      // Only persist these keys — actions get serialized by default
      // and re-serializing functions across reloads is a footgun.
      partialize: (s) => ({
        visited: s.visited,
        rocketRewardShown: s.rocketRewardShown,
      }),
    },
  ),
);

// Selectors — call inside a component with useMissionStore((s) => ...).
export function selectVisitedCount(s: State): number {
  return ALL_MISSION_IDS.reduce(
    (n, id) => (s.visited[id] ? n + 1 : n),
    0,
  );
}

export function selectIsComplete(s: State): boolean {
  return ALL_MISSION_IDS.every((id) => s.visited[id]);
}

export function selectRocketUnlocked(s: State): boolean {
  return selectIsComplete(s);
}

export const TOTAL_MISSIONS = TOTAL_MISSION_COUNT;
