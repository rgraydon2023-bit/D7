import type { ObjFace, TileModel, TileVariant, UpAxis } from "../lattice/types.ts";
import { fileToSpec, unpackCell } from "../lattice/types.ts";
import {
  DESCRIPTOR_ALGORITHM_VERSION,
  measureSpatialDescriptors,
  type MeshTri,
  type SpatialDescriptors,
} from "./descriptorV2.ts";
import { assignComparativeRanks, DESCRIPTOR_RANK_STORAGE_KEY, type DescriptorRankSnapshot } from "./descriptorRank.ts";
import { measureOpenVolume, type OpenVolumeMeasurement, type Voxel } from "./openVolume.ts";

/** The 12 architectural descriptors required for Part 2 OBJ evaluation. */
export const ARCH_DESCRIPTORS = [
  { id: "openVolume", name: "Open Volume" },
  { id: "convergent", name: "Convergent" },
  { id: "sculptural", name: "Sculptural" },
  { id: "visuallyConnected", name: "Visually Connected" },
  { id: "surreal", name: "Surreal" },
  { id: "monumental", name: "Monumental" },
  { id: "hierarchical", name: "Hierarchical" },
  { id: "sequential", name: "Sequential" },
  { id: "circulationActivated", name: "Circulation Activated" },
  { id: "centralized", name: "Centralized" },
  { id: "verticallyIntegrated", name: "Vertically Integrated" },
  { id: "luminous", name: "Luminous" },
] as const;

export type ArchDescriptorId = (typeof ARCH_DESCRIPTORS)[number]["id"];

export type MetricComponent = {
  name: string;
  /** Rounded 0–100 term. */
  value: number;
  /** Unrounded 0–100 term. Ranking uses this when present. */
  precise?: number;
  unit?: string;
  /** Unscaled measurement named by rawUnit. Full precision. */
  raw?: number;
  rawUnit?: string;
  weight: number;
  /** This term's points toward the 0–100 score. */
  contribution?: number;
};

export type DescriptorResult = {
  id: ArchDescriptorId;
  name: string;
  /** Rounded absolute geometric score, 0–100. */
  score: number;
  /** Full-precision absolute geometric score. Ranking uses this, not `score`. */
  absoluteScore: number;
  components: MetricComponent[];
  /** Unique rank in the current set. The highest number is the strongest expression. */
  comparativeRank?: number;
  /** Same value as comparativeRank. Kept so older readers see the new direction. */
  relativeRank?: number;
  relativePercentile?: number;
  cohortSize?: number;
  /** True only when stable form id was required to separate identical geometry. */
  tieBreakUsed?: boolean;
};

export type DescriptorSource = {
  positions: ArrayLike<number>;
  faces: Array<Pick<ObjFace, "vertices">>;
  up: UpAxis;
  unitScale: number;
};

export type RawObjMetrics = {
  occupiedCells: number;
  floorCells: number;
  passageCells: number;
  voidCells: number;
  verticalCells: number;
  occupiedVolume: number;
  horizontalArea: number;
  verticalArea: number;
  openBoundary: number;
  projection: number;
  recess: number;
  bboxX: number;
  bboxY: number;
  bboxZ: number;
  spanCellsX: number;
  spanCellsY: number;
  spanCellsZ: number;
  floorLevels: number;
  centroidOffsetPlan: number;
  edgeFloorRatio: number;
  skyOpenRatio: number;
  portCount: number;
  cellFeet: number;
  vertexCount: number;
  faceCount: number;
};

export type FormDescriptorEvaluation = {
  meshId: string;
  slotId: string;
  filename: string;
  category: "Gathering" | "Office" | "Lobby";
  code: string;
  name: string;
  status: "idle" | "analyzing" | "ready" | "error";
  confidence: number;
  error?: string;
  raw: RawObjMetrics | null;
  descriptors: DescriptorResult[];
};

const clamp100 = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Shared normalizations. Exported so calibration uses the same values as the scores. */
export type NormalizedDescriptorTerms = {
  voidShare: number;
  passageShare: number;
  porosity: number;
  verticalShare: number;
  floorShare: number;
  aspectTall: number;
  planAspect: number;
  areaBalance: number;
  recessNorm: number;
  projectionNorm: number;
  levelNorm: number;
  portNorm: number;
};

export function normalizedDescriptorTerms(raw: RawObjMetrics): NormalizedDescriptorTerms {
  return {
    voidShare: raw.voidCells / Math.max(1, raw.occupiedCells + raw.voidCells),
    passageShare: raw.passageCells / Math.max(1, raw.floorCells + raw.passageCells),
    porosity: raw.openBoundary / Math.max(1, raw.occupiedCells + raw.openBoundary),
    verticalShare: raw.verticalCells / Math.max(1, raw.occupiedCells),
    floorShare: raw.floorCells / Math.max(1, raw.occupiedCells),
    aspectTall: raw.bboxZ / Math.max(raw.bboxX, raw.bboxY, 0.01),
    // 0.01 is a zero-axis guard. It must not be an argument to Math.min, or every plan aspect becomes ~2000.
    planAspect: Math.max(raw.bboxX, raw.bboxY) / Math.max(0.01, Math.min(raw.bboxX, raw.bboxY)),
    areaBalance: raw.horizontalArea / Math.max(raw.horizontalArea + raw.verticalArea, 0.01),
    recessNorm: Math.min(1, raw.recess / 8),
    projectionNorm: Math.min(1, raw.projection / 12),
    levelNorm: Math.min(1, (raw.floorLevels - 1) / 4),
    portNorm: Math.min(1, raw.portCount / 8),
  };
}

function collectRawMetrics(model: TileModel): RawObjMetrics {
  const variant: TileVariant = model.variants[0] ?? {
    rotation: 0,
    mirror: "none",
    occupied: [],
    floor: [],
    passage: [],
    voidCells: [],
    vertical: [],
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    faces: {} as TileVariant["faces"],
  };
  const occupied = variant.occupied.length;
  const floor = variant.floor.length;
  const passage = variant.passage.length;
  const voids = variant.voidCells.length;
  const vertical = variant.vertical.length;
  const bx = Math.max(0.01, model.bboxMax[0] - model.bboxMin[0]);
  const by = Math.max(0.01, model.bboxMax[1] - model.bboxMin[1]);
  const bz = Math.max(0.01, model.bboxMax[2] - model.bboxMin[2]);
  const spanX = Math.max(1, variant.bounds.maxX - variant.bounds.minX + 1);
  const spanY = Math.max(1, variant.bounds.maxY - variant.bounds.minY + 1);
  const spanZ = Math.max(1, variant.bounds.maxZ - variant.bounds.minZ + 1);
  const floorZs = new Set(variant.floor.map((packed) => unpackCell(packed)[2]));
  const floorLevels = Math.max(1, floorZs.size);

  let floorSumX = 0;
  let floorSumY = 0;
  let edgeFloor = 0;
  for (const packed of variant.floor) {
    const [x, y] = unpackCell(packed);
    floorSumX += x;
    floorSumY += y;
    if (
      x === variant.bounds.minX ||
      x === variant.bounds.maxX ||
      y === variant.bounds.minY ||
      y === variant.bounds.maxY
    ) {
      edgeFloor += 1;
    }
  }
  const midX = (variant.bounds.minX + variant.bounds.maxX) / 2;
  const midY = (variant.bounds.minY + variant.bounds.maxY) / 2;
  const meanX = floor ? floorSumX / floor : midX;
  const meanY = floor ? floorSumY / floor : midY;
  const planDiagonal = Math.hypot(spanX, spanY) || 1;
  const centroidOffsetPlan = Math.hypot(meanX - midX, meanY - midY) / planDiagonal;

  const topZ = variant.bounds.maxZ;
  const topCells = spanX * spanY;
  let topOpen = 0;
  const topOccupied = new Set(
    variant.occupied.filter((packed) => unpackCell(packed)[2] === topZ).map((packed) => {
      const [x, y] = unpackCell(packed);
      return `${x}:${y}`;
    }),
  );
  for (let x = variant.bounds.minX; x <= variant.bounds.maxX; x += 1) {
    for (let y = variant.bounds.minY; y <= variant.bounds.maxY; y += 1) {
      if (!topOccupied.has(`${x}:${y}`)) topOpen += 1;
    }
  }

  return {
    occupiedCells: occupied,
    floorCells: floor,
    passageCells: passage,
    voidCells: voids,
    verticalCells: vertical,
    occupiedVolume: model.occupiedVolume,
    horizontalArea: model.horizontalArea,
    verticalArea: model.verticalArea,
    openBoundary: model.openBoundary,
    projection: model.projection,
    recess: model.recess,
    bboxX: bx,
    bboxY: by,
    bboxZ: bz,
    spanCellsX: spanX,
    spanCellsY: spanY,
    spanCellsZ: spanZ,
    floorLevels,
    centroidOffsetPlan,
    edgeFloorRatio: floor ? edgeFloor / floor : 0,
    skyOpenRatio: topCells ? topOpen / topCells : 0,
    portCount: variant.ports?.length ?? 0,
    cellFeet: model.cellFeet,
    vertexCount: model.vertexCount,
    faceCount: model.faceCount,
  };
}

function absoluteScoreOf(components: MetricComponent[]) {
  const weightSum = components.reduce((sum, item) => sum + item.weight, 0) || 1;
  return components.reduce((sum, item) => sum + (item.precise ?? item.value) * item.weight, 0) / weightSum;
}

function withContribution(components: MetricComponent[]): MetricComponent[] {
  const weightSum = components.reduce((sum, item) => sum + item.weight, 0) || 1;
  return components.map((item) => {
    const precise = item.precise ?? item.value;
    return {
      ...item,
      value: clamp100(item.value),
      precise,
      contribution: Math.round((precise * item.weight / weightSum) * 10) / 10,
    };
  });
}

function fromDrafts(drafts: SpatialDescriptors[keyof SpatialDescriptors]): MetricComponent[] {
  return withContribution(drafts.map((item) => ({
    name: item.name,
    value: item.value,
    precise: item.precise ?? item.value,
    raw: item.raw,
    rawUnit: item.rawUnit,
    weight: item.weight,
  })));
}

function scoreDescriptors(open: OpenVolumeMeasurement, spatial: SpatialDescriptors): DescriptorResult[] {
  const make = (id: ArchDescriptorId, name: string, components: MetricComponent[]): DescriptorResult => {
    const absoluteScore = absoluteScoreOf(components);
    return {
      id,
      name,
      absoluteScore,
      score: clamp100(absoluteScore),
      components,
    };
  };

  return [
    make("openVolume", "Open Volume", withContribution([
      { name: "Architectural Open Space", raw: open.architecturalOpenSpace / 100, rawUnit: "free cells / occupied bounds", value: open.architecturalOpenSpace, weight: 0.35 },
      { name: "Permeability", raw: open.permeability / 100, rawUnit: "mean of six axis pass rates", value: open.permeability, weight: 0.3 },
      { name: "Interstitial Space", raw: open.interstitialOpenSpace / 100, rawUnit: "between-surface free cells / bounds", value: open.interstitialOpenSpace, weight: 0.25 },
      { name: "Low Mass", raw: open.lowMass / 100, rawUnit: "1 - mean 26-neighbor solidity", value: open.lowMass, weight: 0.1 },
      { name: "Enclosed Void (informational)", raw: open.enclosedVoidRatio / 100, rawUnit: "enclosed free cells / bounds", value: open.enclosedVoidRatio, weight: 0 },
    ])),
    make("convergent", "Convergent", fromDrafts(spatial.convergent)),
    make("sculptural", "Sculptural", fromDrafts(spatial.sculptural)),
    make("visuallyConnected", "Visually Connected", fromDrafts(spatial.visuallyConnected)),
    make("surreal", "Surreal", fromDrafts(spatial.surreal)),
    make("monumental", "Monumental", fromDrafts(spatial.monumental)),
    make("hierarchical", "Hierarchical", fromDrafts(spatial.hierarchical)),
    make("sequential", "Sequential", fromDrafts(spatial.sequential)),
    make("circulationActivated", "Circulation Activated", fromDrafts(spatial.circulationActivated)),
    make("centralized", "Centralized", fromDrafts(spatial.centralized)),
    make("verticallyIntegrated", "Vertically Integrated", fromDrafts(spatial.verticallyIntegrated)),
    make("luminous", "Luminous", fromDrafts(spatial.luminous)),
  ];
}

/** Confidence from voxel coverage and mesh complexity — not a fabricated quality grade. */
export function confidenceFromRaw(raw: RawObjMetrics) {
  const coverage = Math.min(1, raw.occupiedCells / 80);
  const floors = Math.min(1, raw.floorCells / 20);
  const verts = Math.min(1, raw.vertexCount / 500);
  return clamp100(40 + coverage * 25 + floors * 20 + verts * 15);
}

function vertexInCells(positions: ArrayLike<number>, index: number, up: UpAxis, unitScale: number, anchor: [number, number, number], cellFeet: number): [number, number, number] {
  const [x, y, z] = fileToSpec(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0, up);
  return [
    (x * unitScale - anchor[0]) / cellFeet,
    (y * unitScale - anchor[1]) / cellFeet,
    (z * unitScale - anchor[2]) / cellFeet,
  ];
}

export function sourceTriangles(source: DescriptorSource, anchor: [number, number, number], cellFeet: number): MeshTri[] {
  const triangles: MeshTri[] = [];
  for (const face of source.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const a = vertexInCells(source.positions, face.vertices[0], source.up, source.unitScale, anchor, cellFeet);
      const b = vertexInCells(source.positions, face.vertices[index], source.up, source.unitScale, anchor, cellFeet);
      const c = vertexInCells(source.positions, face.vertices[index + 1], source.up, source.unitScale, anchor, cellFeet);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross: [number, number, number] = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(cross[0], cross[1], cross[2]);
      if (length < 1e-8) continue;
      triangles.push({
        normal: [cross[0] / length, cross[1] / length, cross[2] / length],
        area: length / 2,
        centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        corners: [a, b, c],
      });
    }
  }
  return triangles;
}

function geometryKey(cells: Voxel[], triangles: MeshTri[], cellFeet: number, bbox: [number, number, number]) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  };
  mix(Math.round(cellFeet * 100));
  mix(cells.length);
  mix(triangles.length);
  mix(Math.round(bbox[0] * 10));
  mix(Math.round(bbox[1] * 10));
  mix(Math.round(bbox[2] * 10));
  for (const [x, y, z] of cells) {
    mix(x);
    mix(y);
    mix(z);
  }
  let area = 0;
  for (const triangle of triangles) area += triangle.area;
  mix(Math.round(area * 10));
  const step = Math.max(1, Math.floor(triangles.length / 24));
  for (let index = 0; index < triangles.length; index += step) {
    const triangle = triangles[index];
    mix(Math.round(triangle.normal[0] * 100));
    mix(Math.round(triangle.normal[2] * 100));
    mix(Math.round(triangle.centroid[0] * 10));
  }
  return `${DESCRIPTOR_ALGORITHM_VERSION}:${hash >>> 0}`;
}

type CachedEvaluation = Omit<FormDescriptorEvaluation, "slotId" | "category" | "code" | "name" | "status">;

const analysisCache = new Map<string, CachedEvaluation>();
let analysisCacheHits = 0;

/** How many evaluations were served from the geometry cache. */
export function descriptorAnalysisCacheHits() {
  return analysisCacheHits;
}

function cloneEvaluation(evaluation: CachedEvaluation): CachedEvaluation {
  return {
    ...evaluation,
    raw: evaluation.raw ? { ...evaluation.raw } : null,
    descriptors: evaluation.descriptors.map((descriptor) => ({
      ...descriptor,
      components: descriptor.components.map((component) => ({ ...component })),
      comparativeRank: undefined,
      relativeRank: undefined,
      relativePercentile: undefined,
      cohortSize: undefined,
      tieBreakUsed: undefined,
    })),
  };
}

export function evaluateTileModel(model: TileModel, source?: DescriptorSource): CachedEvaluation {
  const raw = collectRawMetrics(model);
  const occupied = (model.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
  const triangles = source ? sourceTriangles(source, model.anchor, model.cellFeet) : [];
  const key = geometryKey(occupied, triangles, model.cellFeet, [raw.bboxX, raw.bboxY, raw.bboxZ]);
  const cached = analysisCache.get(key);
  if (cached && cached.meshId === model.id) {
    analysisCacheHits += 1;
    return cloneEvaluation(cached);
  }
  const open = measureOpenVolume(occupied);
  const spatial = measureSpatialDescriptors({
    cells: occupied,
    cellFeet: model.cellFeet,
    bboxFeet: [raw.bboxX, raw.bboxY, raw.bboxZ],
    occupiedVolumeFeet: model.occupiedVolume,
    triangles,
  });
  const evaluation: CachedEvaluation = {
    meshId: model.id,
    filename: model.filename,
    confidence: confidenceFromRaw(raw),
    raw,
    descriptors: scoreDescriptors(open, spatial),
  };
  analysisCache.set(key, evaluation);
  return cloneEvaluation(evaluation);
}

export { DESCRIPTOR_RANK_STORAGE_KEY, type DescriptorRankSnapshot } from "./descriptorRank.ts";

/** Publish ranks for Lattice without feeding them into the solver. */
export function publishDescriptorRanks(forms: Array<Pick<FormDescriptorEvaluation, "slotId" | "meshId" | "filename" | "descriptors">>) {
  if (typeof sessionStorage === "undefined") return;
  const payload: DescriptorRankSnapshot = {
    version: DESCRIPTOR_ALGORITHM_VERSION,
    forms: forms.map((form) => ({
      slotId: form.slotId,
      meshId: form.meshId,
      filename: form.filename,
      descriptors: Object.fromEntries(form.descriptors.map((descriptor) => [descriptor.id, {
        absoluteScore: descriptor.absoluteScore,
        comparativeRank: descriptor.comparativeRank,
      }])),
    })),
  };
  sessionStorage.setItem(DESCRIPTOR_RANK_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Unique ranks across the supplied forms. The highest rank is the strongest
 * expression. Unchanged forms keep their cached absolute scores.
 */
export function assignRelativeRanks(forms: Array<{ slotId?: string; meshId?: string; descriptors: DescriptorResult[] }>) {
  assignComparativeRanks(forms.map((form, index) => ({
    formId: form.slotId || form.meshId || String(index).padStart(4, "0"),
    descriptors: form.descriptors,
  })));
}
