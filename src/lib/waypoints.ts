import type { Vector3Tuple } from "three";

export type WaypointId = "about" | "projects" | "contact";

export type Waypoint = {
  id: WaypointId;
  label: string;
  labelZh: string;
  position: Vector3Tuple;
  flagColor: string;
  proximityRadius: number;
};

export const WAYPOINTS: Waypoint[] = [
  {
    id: "about",
    label: "About",
    labelZh: "關於",
    position: [12, 0, -7.5],
    flagColor: "#9dd6ff",
    proximityRadius: 3.2,
  },
  {
    id: "projects",
    label: "Projects",
    labelZh: "作品",
    position: [-4, 0, -18],
    flagColor: "#ffcf7a",
    proximityRadius: 3.2,
  },
  {
    id: "contact",
    label: "Contact",
    labelZh: "聯絡",
    position: [-19.5, 0, 2],
    flagColor: "#ff9db3",
    proximityRadius: 3.2,
  },
];
