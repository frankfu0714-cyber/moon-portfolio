// Mission system: what the player needs to interact with to "explore
// the moon." Three flag waypoints (portfolio panels), five structures
// with intro panels, and one gated rocket that unlocks the reward
// video once everything else is checked off.

import type { WaypointId } from "./waypoints";

// Interactable structure IDs — the five things you can walk up to and
// press E to learn about. Cybertruck is on the list too; visiting it
// counts on FIRST proximity (there's no separate intro panel — the
// truck itself is the interaction).
export type StructureId =
  | "lander"
  | "solar-farm"
  | "habitat"
  | "neon-tower"
  | "cybertruck";

// Mission = every waypoint + every structure. Rocket is separate: it
// LOCKS on total-mission-count = 0 and UNLOCKS at completion.
export type MissionId = WaypointId | StructureId;

export const WAYPOINT_MISSION_IDS: WaypointId[] = [
  "about",
  "projects",
  "contact",
];

export const STRUCTURE_MISSION_IDS: StructureId[] = [
  "lander",
  "solar-farm",
  "habitat",
  "neon-tower",
  "cybertruck",
];

export const ALL_MISSION_IDS: MissionId[] = [
  ...WAYPOINT_MISSION_IDS,
  ...STRUCTURE_MISSION_IDS,
];

export const TOTAL_MISSION_COUNT = ALL_MISSION_IDS.length;

export type Structure = {
  id: StructureId;
  label: string;
  labelZh: string;
  // World-space center for proximity detection. Cybertruck is dynamic
  // so its position lives on vehicleState instead — this constant is
  // kept as its parked spawn as a fallback.
  position: [number, number];
  interactRadius: number;
  // Accent color for the hint pill + panel top-bar.
  color: string;
  // Short intro paragraph shown in the panel. Placeholder copy — Frank
  // will tune the tone.
  intro: string;
  introZh?: string;
  // "cybertruck" doesn't open a panel; it's marked visited when the
  // astronaut walks within nearVehicle range. Skip its panel render.
  noPanel?: true;
};

export const STRUCTURES: Structure[] = [
  {
    id: "lander",
    label: "Apollo Lunar Module",
    labelZh: "登月艙",
    position: [10, 16],
    interactRadius: 6,
    color: "#f5d67a",
    intro:
      "NASA's original Apollo Lunar Module, sourced from the public-domain NASA 3D archive. In the real program this vehicle ferried astronauts from lunar orbit down to the regolith and back. Ours sits here as a landmark — a nod to where all of this started.",
    introZh:
      "NASA 公開檔案裡的阿波羅登月艙原型。真正的登月艙曾把太空人從月球軌道送到地表再回來；這裡放一台，是給整個場景一個致敬。",
  },
  {
    id: "solar-farm",
    label: "Solar Sail Array",
    labelZh: "太陽能陣列",
    // Centroid of the shifted SAIL_POSITIONS (see MoonBase.tsx).
    // Keep in sync if the farm ever moves again.
    position: [-9.1, 22],
    interactRadius: 5,
    color: "#ff8a5b",
    intro:
      "Vertical-sail solar array modeled after Solestial's next-gen lunar concept. Eight photovoltaic sheets face the sun azimuth, harvesting energy for the base. At lunar noon these produce roughly 40 kW peak — enough to keep the habitat and comms live through a two-week Earth day.",
    introZh:
      "參考 Solestial 的月面太陽能概念做的直立式陣列，八片電池板對著太陽方向。月午時峰值輸出約 40 kW，夠這座基地撐過一整個地球雙週的白天。",
  },
  {
    id: "habitat",
    label: "Habitat Station",
    labelZh: "居住艙",
    position: [-30, 20],
    interactRadius: 8,
    color: "#9dd6ff",
    intro:
      "Modular pressurized habitat plus airlock cluster. Two connected cylindrical modules on stilt legs, twin dish antennas, panelled roof — a modest base for a permanent lunar presence. Where the crew sleeps between EVAs.",
    introZh:
      "模組化加壓居住艙，兩節圓柱體用支架架在月表上，配上兩支碟型天線。EVA 之間，太空人就在這裡休息。",
  },
  {
    id: "neon-tower",
    label: "Neon Comms Tower",
    labelZh: "霓虹通訊塔",
    position: [-12, -36],
    interactRadius: 8,
    color: "#ff2fa0",
    intro:
      "Cyberpunk comms mast at the base perimeter — an X-braced steel truss laced with hot-pink and cyan neon rails. Half functional relay, half cyberpunk lighting rig. Also serves as the horizon marker for orientation.",
    introZh:
      "基地邊界的通訊塔:X 型桁架加上桃紅與電光藍霓虹軌道。一半是訊號中繼站,一半是賽博龐克路標。",
  },
  {
    id: "cybertruck",
    label: "Hover Cybertruck",
    labelZh: "懸浮 Cybertruck",
    position: [-8, 11], // fallback; live pos read from vehicleState
    interactRadius: 5.5,
    color: "#e6ffff",
    intro:
      "Hover-converted Cybertruck for lunar terrain. Wheels removed and replaced with four blue-flame ion thrusters. Press E to board and drive; WASD to steer, Shift to boost.",
    introZh: "把 Cybertruck 拆掉輪子改成離子推進的月面版。E 上車,WASD 開,Shift 加速。",
    noPanel: true, // driving it is the interaction
  },
];

export const STRUCTURE_BY_ID: Record<StructureId, Structure> =
  Object.fromEntries(STRUCTURES.map((s) => [s.id, s])) as Record<
    StructureId,
    Structure
  >;

// Rocket — the reward gate. Not part of TOTAL_MISSION_COUNT; unlocks
// once every mission above is visited.
export const ROCKET_POSITION: [number, number] = [34, -20];
export const ROCKET_INTERACT_RADIUS = 6;
export const ROCKET_COLOR = "#ff9370";
