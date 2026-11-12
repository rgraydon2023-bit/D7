import type { Cell } from "./letterTypes";
import { letterVolumeLayout, type VolumeOptions } from "./letterVolumeLayout";

export const DESCRIPTORS = [
  { id: "openVolume", name: "Open Volume", kind: "objective", metric: "spatial porosity" },
  { id: "convergent", name: "Convergent", kind: "objective", metric: "inward orientation" },
  { id: "sculptural", name: "Sculptural", kind: "subjective", metric: "formal variation proxy" },
  { id: "visuallyConnected", name: "Visually Connected", kind: "subjective", metric: "adjacency proxy" },
  { id: "surreal", name: "Surreal", kind: "subjective", metric: "defamiliarization proxy" },
  { id: "monumental", name: "Monumental", kind: "subjective", metric: "scale and verticality proxy" },
  { id: "hierarchical", name: "Hierarchical", kind: "objective", metric: "scale differentiation" },
  { id: "sequential", name: "Sequential", kind: "objective", metric: "path continuity" },
  { id: "circulationActivated", name: "Circulation Activated", kind: "objective", metric: "clear route ratio" },
  { id: "centralized", name: "Centralized", kind: "objective", metric: "radial concentration" },
  { id: "verticallyIntegrated", name: "Vertically Integrated", kind: "objective", metric: "stack alignment" },
  { id: "luminous", name: "Luminous", kind: "objective", metric: "sky exposure proxy" },
] as const;

export type DescriptorId = (typeof DESCRIPTORS)[number]["id"];
export type DescriptorSetting = { intensity: number; importance: number };
export type DescriptorSettings = Record<DescriptorId, DescriptorSetting>;
export type CompositionConstraints = {
  minCirculationClearance: number;
  maxWidth: number;
  maxHeight: number;
  maxDepth: number;
  intersectionTolerance: number;
  minLegibility: number;
};
export type CompositionPlacement = {
  cell: Cell;
  sourceIndex: number;
  layerIndex: number;
  col?: number;
  row?: number;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};
export type DescriptorScore = {
  id: DescriptorId;
  actual: number;
  target: number;
  deviation: number;
  weightedDeviation: number;
};
export type CompositionMetrics = {
  width: number;
  height: number;
  depth: number;
  clearance: number;
  intersections: number;
  legibility: number;
  weightedDeviation: number;
  scores: DescriptorScore[];
  warnings: string[];
};
export type CompositionAlternative = {
  id: string;
  seed: number;
  placements: CompositionPlacement[];
  metrics: CompositionMetrics;
};

export const DEFAULT_DESCRIPTORS = Object.fromEntries(
  DESCRIPTORS.map((descriptor) => [descriptor.id, { intensity: 35, importance: 50 }]),
) as DescriptorSettings;

export const DEFAULT_CONSTRAINTS: CompositionConstraints = {
  minCirculationClearance: 0.8,
  maxWidth: 18,
  maxHeight: 14,
  maxDepth: 18,
  intersectionTolerance: 20,
  minLegibility: 55,
};

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const normalized = (settings: DescriptorSettings, id: DescriptorId) => settings[id].intensity / 100;

// Conflicting intentions remain separate. The higher-importance operation keeps more authority.
function effectiveIntensity(settings: DescriptorSettings, id: DescriptorId) {
  const conflicts: Partial<Record<DescriptorId, DescriptorId[]>> = {
    openVolume: ["convergent", "centralized"],
    convergent: ["openVolume", "circulationActivated"],
    visuallyConnected: ["openVolume", "surreal"],
    monumental: ["openVolume"],
    circulationActivated: ["centralized", "convergent"],
    centralized: ["openVolume", "circulationActivated"],
    luminous: ["monumental"],
  };
  const own = settings[id];
  let damping = 1;
  for (const conflict of conflicts[id] ?? []) {
    const other = settings[conflict];
    const priority = other.importance / Math.max(own.importance + other.importance, 1);
    damping *= 1 - normalized(settings, conflict) * priority * 0.55;
  }
  return normalized(settings, id) * damping;
}

function rotateTowardCenter(item: CompositionPlacement, amount: number) {
  const target = Math.atan2(-item.y, -item.x) * 180 / Math.PI - 90;
  item.rz += target * amount;
}

function applyDescriptor(
  id: DescriptorId,
  items: CompositionPlacement[],
  amount: number,
  random: () => number,
  constraints: CompositionConstraints,
) {
  if (amount <= 0) return;
  const maxLayer = Math.max(...items.map((item) => item.layerIndex), 1);
  switch (id) {
    case "openVolume":
      items.forEach((item) => {
        const radius = Math.hypot(item.x, item.y) || 1;
        item.x += (item.x / radius) * amount * 0.75;
        item.y += (item.y / radius) * amount * 0.75;
        item.scale *= 1 - amount * 0.12;
      });
      break;
    case "convergent":
      items.forEach((item) => {
        item.x *= 1 - amount * 0.16;
        item.y *= 1 - amount * 0.12;
        rotateTowardCenter(item, amount * 0.8);
      });
      break;
    case "sculptural":
      items.forEach((item, index) => {
        item.z += Math.sin(index * 0.73 + item.layerIndex) * amount * 0.7;
        item.x += Math.cos(index * 0.37) * amount * 0.35;
        item.rx += Math.sin(index) * amount * 35;
        item.scale *= 1 + Math.sin(index * 1.7) * amount * 0.18;
      });
      break;
    case "visuallyConnected":
      items.forEach((item, index) => {
        const neighbor = items[(index + 1) % items.length];
        item.x += (neighbor.x - item.x) * amount * 0.12;
        item.y += (neighbor.y - item.y) * amount * 0.12;
        item.z += (neighbor.z - item.z) * amount * 0.08;
      });
      break;
    case "surreal":
      items.forEach((item) => {
        item.rx += (random() - 0.5) * amount * 120;
        item.ry += (random() - 0.5) * amount * 130;
        item.rz += (random() - 0.5) * amount * 75;
        item.scale *= 0.82 + random() * amount * 0.65 + (1 - amount) * 0.18;
      });
      break;
    case "monumental":
      items.forEach((item) => {
        const vertical = item.layerIndex / maxLayer;
        item.scale *= 1 + amount * (0.2 + vertical * 0.28);
        item.z *= 1 + amount * 0.2;
      });
      break;
    case "hierarchical":
      items.forEach((item) => {
        const centrality = 1 - Math.min(1, Math.hypot(item.x, item.y) / 8);
        item.scale *= 1 + amount * (centrality * 0.75 - 0.15);
      });
      break;
    case "sequential":
      items.forEach((item, index) => {
        const t = index / Math.max(items.length - 1, 1);
        item.x += Math.sin(t * Math.PI * 2) * amount * 0.55;
        item.y += (t - 0.5) * amount * 0.9;
        item.rz += t * amount * 45;
      });
      break;
    case "circulationActivated": {
      const half = constraints.minCirculationClearance / 2;
      items.forEach((item) => {
        const side = item.x === 0 ? (random() > 0.5 ? 1 : -1) : Math.sign(item.x);
        const desired = half + item.scale * 0.48;
        if (Math.abs(item.x) < desired) item.x += side * (desired - Math.abs(item.x)) * amount;
        item.ry += side * amount * 12;
      });
      break;
    }
    case "centralized":
      items.forEach((item) => {
        item.x *= 1 - amount * 0.28;
        item.y *= 1 - amount * 0.28;
        rotateTowardCenter(item, amount * 0.35);
      });
      break;
    case "verticallyIntegrated":
      items.forEach((item) => {
        item.x = Math.round(item.x * 2) / 2 * amount + item.x * (1 - amount);
        item.y = Math.round(item.y * 2) / 2 * amount + item.y * (1 - amount);
        item.ry *= 1 - amount * 0.55;
      });
      break;
    case "luminous":
      items.forEach((item) => {
        const upper = item.layerIndex / maxLayer;
        item.scale *= 1 - upper * amount * 0.2;
        item.x *= 1 + upper * amount * 0.13;
        item.y *= 1 + upper * amount * 0.13;
        item.rx += upper * amount * 18;
      });
      break;
  }
}

function enforceConstraints(items: CompositionPlacement[], constraints: CompositionConstraints) {
  const maxRotation = 25 + (100 - constraints.minLegibility) * 1.25;
  const minScale = 0.45 + constraints.minLegibility / 220;
  items.forEach((item) => {
    item.rx = clamp(item.rx, -maxRotation, maxRotation);
    item.ry = clamp(item.ry, -maxRotation, maxRotation);
    item.rz = Math.max(-180, Math.min(180, item.rz));
    item.scale = Math.max(minScale, Math.min(2.1, item.scale));
    const halfClearance = constraints.minCirculationClearance / 2;
    if (Math.abs(item.x) - item.scale * 0.42 < halfClearance) {
      item.x = (item.x < 0 ? -1 : 1) * (halfClearance + item.scale * 0.42);
    }
  });
  const bounds = dimensions(items);
  const factor = Math.min(
    1,
    constraints.maxWidth / Math.max(bounds.width, 0.01),
    constraints.maxHeight / Math.max(bounds.height, 0.01),
    constraints.maxDepth / Math.max(bounds.depth, 0.01),
  );
  if (factor < 1) items.forEach((item) => {
    item.x *= factor;
    item.y *= factor;
    item.z *= factor;
    item.scale *= factor;
  });
}

function dimensions(items: CompositionPlacement[]) {
  const extents = items.map((item) => item.scale * 0.5);
  const minX = Math.min(...items.map((item, i) => item.x - extents[i]));
  const maxX = Math.max(...items.map((item, i) => item.x + extents[i]));
  const minY = Math.min(...items.map((item, i) => item.y - extents[i]));
  const maxY = Math.max(...items.map((item, i) => item.y + extents[i]));
  const minZ = Math.min(...items.map((item, i) => item.z - extents[i] * 0.35));
  const maxZ = Math.max(...items.map((item, i) => item.z + extents[i] * 0.35));
  return { width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
}

function analyze(items: CompositionPlacement[], settings: DescriptorSettings, constraints: CompositionConstraints): CompositionMetrics {
  const bounds = dimensions(items);
  const radial = items.map((item) => Math.hypot(item.x, item.y));
  const avgRadial = radial.reduce((a, b) => a + b, 0) / items.length;
  const scaleValues = items.map((item) => item.scale);
  const avgScale = scaleValues.reduce((a, b) => a + b, 0) / items.length;
  const scaleVariance = scaleValues.reduce((sum, value) => sum + (value - avgScale) ** 2, 0) / items.length;
  const rotationAverage = items.reduce((sum, item) => sum + Math.abs(item.rx) + Math.abs(item.ry), 0) / items.length / 2;
  const clearance = Math.min(...items.map((item) => Math.max(0, Math.abs(item.x) - item.scale * 0.42))) * 2;
  let intersections = 0;
  let adjacency = 0;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const distance = Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y, items[i].z - items[j].z);
    const threshold = (items[i].scale + items[j].scale) * 0.38;
    if (distance < threshold) intersections++;
    if (distance < threshold * 1.65) adjacency++;
  }
  const maxPairs = Math.max(items.length * 2, 1);
  const layerGroups = new Map<string, number>();
  items.forEach((item) => {
    const key = `${Math.round(item.x * 2)},${Math.round(item.y * 2)}`;
    layerGroups.set(key, (layerGroups.get(key) ?? 0) + 1);
  });
  const stackAlignment = [...layerGroups.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0) / items.length;
  const legibility = clamp(100 - rotationAverage * 0.75 - Math.sqrt(scaleVariance) * 18);
  const actual: Record<DescriptorId, number> = {
    openVolume: clamp((avgRadial / Math.max(bounds.width, bounds.height, 1)) * 170),
    convergent: clamp(100 - items.reduce((sum, item) => sum + Math.abs(Math.sin((item.rz + 90 - Math.atan2(-item.y, -item.x) * 180 / Math.PI) * Math.PI / 180)), 0) / items.length * 100),
    sculptural: clamp(rotationAverage * 1.2 + Math.sqrt(scaleVariance) * 65),
    visuallyConnected: clamp(adjacency / maxPairs * 100),
    surreal: clamp(rotationAverage * 1.4 + Math.sqrt(scaleVariance) * 75),
    monumental: clamp((bounds.height + bounds.depth) / Math.max(bounds.width, 1) * 45 + avgScale * 20),
    hierarchical: clamp(Math.sqrt(scaleVariance) * 130),
    sequential: clamp(100 - items.slice(1).reduce((sum, item, index) => sum + Math.min(1, Math.hypot(item.x - items[index].x, item.y - items[index].y) / 3), 0) / Math.max(items.length - 1, 1) * 100),
    circulationActivated: clamp(clearance / Math.max(constraints.minCirculationClearance, 0.01) * 80),
    centralized: clamp(100 - avgRadial / Math.max(bounds.width, bounds.height, 1) * 170),
    verticallyIntegrated: clamp(stackAlignment * 120),
    luminous: clamp((1 - items.filter((item) => item.layerIndex > 0 && item.scale > 1.1).length / items.length) * 100),
  };
  const totalImportance = DESCRIPTORS.reduce((sum, descriptor) => sum + settings[descriptor.id].importance, 0) || 1;
  const scores = DESCRIPTORS.map((descriptor) => {
    const target = settings[descriptor.id].intensity;
    const deviation = Math.abs(actual[descriptor.id] - target);
    return { id: descriptor.id, actual: actual[descriptor.id], target, deviation, weightedDeviation: deviation * settings[descriptor.id].importance / totalImportance };
  });
  const warnings: string[] = [];
  if (clearance + 0.01 < constraints.minCirculationClearance) warnings.push("Circulation clearance below minimum");
  if (intersections > constraints.intersectionTolerance) warnings.push("Intersection tolerance exceeded");
  if (legibility < constraints.minLegibility) warnings.push("Letter legibility below minimum");
  return {
    ...bounds,
    clearance,
    intersections,
    legibility,
    weightedDeviation: scores.reduce((sum, score) => sum + score.weightedDeviation, 0),
    scores,
    warnings,
  };
}

export function generateAlternative(
  options: VolumeOptions,
  settings: DescriptorSettings,
  constraints: CompositionConstraints,
  seed: number,
): CompositionAlternative {
  const random = randomGenerator(seed);
  const layout = letterVolumeLayout(options);
  const placements: CompositionPlacement[] = layout.placements.map((placement, sourceIndex) => ({
    cell: placement.cell,
    sourceIndex,
    layerIndex: placement.layerIndex,
    x: placement.x,
    y: placement.y,
    z: placement.z,
    rx: 0,
    ry: placement.yRotation,
    rz: placement.cell.rotation,
    scale: layout.worldLetterSize,
  }));
  // Stable order makes each rule inspectable; weighting only resolves declared conflicts.
  for (const descriptor of DESCRIPTORS) {
    applyDescriptor(descriptor.id, placements, effectiveIntensity(settings, descriptor.id), random, constraints);
  }
  enforceConstraints(placements, constraints);
  return { id: `alternative-${seed}`, seed, placements, metrics: analyze(placements, settings, constraints) };
}

export function generateAlternatives(
  options: VolumeOptions,
  settings: DescriptorSettings,
  constraints: CompositionConstraints,
  seed: number,
  count: number,
) {
  return Array.from({ length: count }, (_, index) => generateAlternative(options, settings, constraints, seed + index * 7919));
}
