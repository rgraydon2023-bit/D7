export type LatticeSlot = {
  id: string;
  category: "Gathering" | "Office" | "Lobby";
  code: string;
  name: string;
  keys: string[];
};

export const LATTICE_SLOTS: LatticeSlot[] = [
  { id: "G1", category: "Gathering", code: "G1", name: "Stepped Amphitheater", keys: ["g1", "stepped amphitheater", "amphitheater"] },
  { id: "G2", category: "Gathering", code: "G2", name: "Void-Field Gathering", keys: ["g2", "void-field", "void field"] },
  { id: "G3", category: "Gathering", code: "G3", name: "Inserted Horizontal Plate", keys: ["g3", "inserted horizontal", "horizontal plate"] },
  { id: "G4", category: "Gathering", code: "G4", name: "Contained Room-Within-Volume", keys: ["g4", "room-within", "room within", "contained room"] },
  { id: "G5", category: "Gathering", code: "G5", name: "Linear Edge Gallery", keys: ["g5", "linear edge", "edge gallery"] },
  { id: "O1", category: "Office", code: "O1", name: "Open Hall Workspace", keys: ["o1", "open hall"] },
  { id: "O2", category: "Office", code: "O2", name: "Cascaded / Terraced Plates", keys: ["o2", "cascaded", "terraced"] },
  { id: "O3", category: "Office", code: "O3", name: "Flat Deep-Plan Plate", keys: ["o3", "deep-plan", "deep plan"] },
  { id: "O4", category: "Office", code: "O4", name: "Void-Edge Workspace", keys: ["o4", "void-edge", "void edge"] },
  { id: "O5", category: "Office", code: "O5", name: "Folded / Undulating Work Surface", keys: ["o5", "undulating", "folded"] },
  { id: "L1", category: "Lobby", code: "L1", name: "Vertical Void Lobby", keys: ["l1", "vertical void"] },
  { id: "L2", category: "Lobby", code: "L2", name: "Compressed Sequential Lobby", keys: ["l2", "compressed sequential", "sequential lobby"] },
  { id: "L3", category: "Lobby", code: "L3", name: "Continuous Hall Lobby", keys: ["l3", "continuous hall"] },
  { id: "L4", category: "Lobby", code: "L4", name: "Topographic / Ground-Field Lobby", keys: ["l4", "topographic", "ground-field", "ground field"] },
  { id: "L5", category: "Lobby", code: "L5", name: "Linear Gallery Lobby", keys: ["l5", "linear gallery"] },
];

const SLOT_BY_ID = new Map(LATTICE_SLOTS.map((slot) => [slot.id, slot]));

export function slotById(id: string | null | undefined) {
  return id ? SLOT_BY_ID.get(id) ?? null : null;
}

export function suggestSlot(filename: string) {
  const normalized = filename.toLowerCase().replace(/[_]+/g, " ");
  let best: { id: string; length: number } | null = null;
  for (const slot of LATTICE_SLOTS) {
    for (const key of slot.keys) {
      if (!normalized.includes(key)) continue;
      if (!best || key.length > best.length) best = { id: slot.id, length: key.length };
    }
  }
  return best?.id ?? null;
}

export const CATEGORY_COLORS: Record<LatticeSlot["category"], string> = {
  Gathering: "#d6ad4f",
  Office: "#1293c2",
  Lobby: "#9bd5e4",
};

export function typologyColor(slotId: string | null) {
  const index = Math.max(0, LATTICE_SLOTS.findIndex((slot) => slot.id === slotId));
  const hue = (index * 24) % 360;
  return `hsl(${hue} 45% 62%)`;
}
