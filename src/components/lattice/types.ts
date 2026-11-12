export const LATTICE_FEET = 20;
export const CELL_FEET = 2;
export const MAX_IMPORTS = 30;
export const REQUIRED_TILES = 15;

export type LatticeField = { cellsX: number; cellsY: number; cellsZ: number };
export const DEFAULT_LATTICE_FIELD: LatticeField = { cellsX: 8, cellsY: 8, cellsZ: 3 };

export const MAX_LATTICE_CELLS_PER_AXIS = 20;

export function clampLatticeCells(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_LATTICE_CELLS_PER_AXIS, Math.round(value)));
}

export function latticeCellCount(field: LatticeField) {
  return field.cellsX * field.cellsY * field.cellsZ;
}

export function latticePerformanceWarning(field: LatticeField) {
  const cells = latticeCellCount(field);
  if (cells > 200) return `Large board (${cells} cells) may stutter in the browser. Prefer a smaller Z depth (for example 20×20×1) when possible.`;
  if (cells > 100) return `Board has ${cells} cells. Assembly and orbiting may feel slower on larger grids.`;
  return null;
}
const PACK_BIAS = 400;

export type Mirror = "none" | "x" | "y";
export type Rotation = 0 | 90 | 180 | 270;
export type Grade = "PASS" | "REVIEW" | "FAIL";
export type Direction = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type UnitName = "feet" | "inches" | "meters" | "millimeters";
export type UpAxis = "y" | "z";
export type UpAxisMode = "auto" | UpAxis;
export type CameraMode = "iso" | "plan" | "section";
export type ColorMode = "white" | "category" | "typology";
export type DiagnosticMode =
  | "originals"
  | "lattice"
  | "interfaces"
  | "pairwise"
  | "transforms"
  | "assembly"
  | "validation"
  | "copies"
  | "continuity"
  | "distribution"
  | "obj-fidelity";

export type ContinuityOverlay = "all" | "floor" | "void" | "circulation" | "interlock";

export type DistributionPrefs = {
  weight: number;
  /** 0 = maximize dispersion; 1 = allow unlimited same-type aggregation. Default 0.4. */
  clustering: number;
  balanceTypologies: boolean;
  balanceCategories: boolean;
  preventLargeClusters: boolean;
  maxSameTypeRun: number;
  maxClusterSoft: number;
};

export type TypologyDistributionRow = {
  sourceId: string;
  slotId: string | null;
  filename: string;
  category: string | null;
  count: number;
  target: number;
  difference: number;
  percent: number;
  largestCluster: number;
  maxRun: number;
  avgSameTypeDistance: number;
};

export type DistributionReport = {
  score: number;
  typologyRows: TypologyDistributionRow[];
  categoryCounts: Record<string, number>;
  maxCluster: number;
  maxRun: number;
  neighborhoodDiversity: number;
  targetPerType: number;
};

export function fileToSpec(x: number, y: number, z: number, up: UpAxis): [number, number, number] {
  if (up === "y") return [x, -z, y];
  return [x, y, z];
}

export function resolvedUp(upAxis: UpAxis, mode: UpAxisMode): UpAxis {
  return mode === "auto" ? upAxis : mode;
}

export const UNIT_TO_FEET: Record<UnitName, number> = {
  feet: 1,
  inches: 1 / 12,
  meters: 3.280839895,
  millimeters: 0.003280839895,
};

export const ROTATIONS: Rotation[] = [0, 90, 180, 270];
export const MIRRORS: Mirror[] = ["none", "x", "y"];
export const DIRECTIONS: Direction[] = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];

export type ObjFace = { vertices: number[]; normals: number[] | null };
export type ObjGroup = { name: string; faceStart: number; faceCount: number };

export type ImportedObj = {
  id: string;
  filename: string;
  positions: Float32Array;
  normals: Float32Array;
  faces: ObjFace[];
  groups: ObjGroup[];
  suggestedSlotId: string | null;
  upAxis: UpAxis;
};

export type Placement = {
  meshId: string;
  slotId: string | null;
  rotation: Rotation;
  mirror: Mirror;
  ix: number;
  iy: number;
  iz: number;
  /**
   * Extra vertical offset in feet inside / across the 20' bay.
   * World Z = iz * LATTICE_FEET + zLift. Allows stacking with gaps in one plan bay.
   */
  zLift?: number;
  locked: boolean;
};

export type Vec3 = [number, number, number];
export type ConnectionPortType = "BRANCH_END" | "PLATFORM_EDGE" | "LANDING_EDGE" | "PASSAGE_END" | "CIRCULATION_END" | "EXPOSED_WALKABLE_EDGE";
export type ConnectionPort = {
  id: string;
  sourceFormId: string;
  type: ConnectionPortType;
  /** Feet in anchored, Z-up variant coordinates; never file-space coordinates. */
  localPosition: Vec3;
  elevation: number;
  outwardDirection: Vec3;
  upDirection: Vec3;
  usableWidth: number;
  usableDepth: number;
  confidence: number;
  sourceCells: number[];
  /** Reliable usable boundary in local variant coordinates; absent for raster fallback. */
  profile?: [Vec3,Vec3];
};
export type ConnectionClass = "DIRECT" | "ADAPTIVE" | "VERTICAL";
export type PortRejection = "DISTANCE" | "ANGLE" | "LATERAL OFFSET" | "ELEVATION" | "WIDTH" | "COLLISION" | "LOW CONFIDENCE" | "NETWORK REDUNDANT" | "PORT IN USE";
export type PortCandidate = { pair: PortPair; accepted: boolean; reason?: PortRejection };
export type PortPair = {
  tileA: string;
  tileB: string;
  portA: string;
  portB: string;
  from: Vec3;
  to: Vec3;
  distance: number;
  plan: number;
  rise: number;
  facing: number;
  widthCompatibility: number;
  usableWidth: number;
  confidence: number;
  score: number;
  connectionClass?: ConnectionClass;
  lateralOffset?: number;
  angle?: number;
  startWidth?: number;
  endWidth?: number;
  startDirection?: Vec3;
  endDirection?: Vec3;
  path?: Vec3[];
  fallback?: boolean;
  startProfile?: [Vec3,Vec3];
  endProfile?: [Vec3,Vec3];
  portOffsetA?: number;
  portOffsetB?: number;
};

export type TileVariant = {
  ports?: ConnectionPort[];
  rotation: Rotation;
  mirror: Mirror;
  occupied: number[];
  floor: number[];
  passage: number[];
  voidCells: number[];
  vertical: number[];
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  faces: Record<Direction, FaceLayer>;
};

export type FaceLayer = {
  cells: Map<string, FaceSample>;
  projection: number;
  recess: number;
};

export type FaceSample = { occupied: number; floor: number; passage: number; void: number; pocket: number };

export type TileModel = {
  id: string;
  filename: string;
  slotId: string | null;
  anchor: [number, number, number];
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  center: [number, number, number];
  minZ: number;
  maxZ: number;
  vertexCount: number;
  faceCount: number;
  occupiedVolume: number;
  horizontalArea: number;
  verticalArea: number;
  openBoundary: number;
  projection: number;
  recess: number;
  cellFeet: number;
  variants: TileVariant[];
  /** Read-only anchored source surface for assignment connector clearance; never rendered. */
  connectionSurface?: { positions: Float32Array; triangles: number[] };
};

export type ConnectionReport = {
  tileA: string;
  tileB: string;
  labelA: string;
  labelB: string;
  transformA: string;
  transformB: string;
  direction: Direction | "none";
  floor: Grade;
  void: Grade;
  circulation: Grade;
  collision: Grade;
  interlock: Grade;
  scores?: {
    floor: number;
    void: number;
    circulation: number;
    complementary: number;
    collision: number;
    total: number;
  };
  reason?: string;
};

export type PlacementNote = {
  tileId: string;
  sourceId: string;
  filename: string;
  rotation: Rotation;
  mirror: Mirror;
  ix: number;
  iy: number;
  iz: number;
  zLift?: number;
  score: number;
  floor: number;
  void: number;
  circulation: number;
  complementary: number;
  collision: number;
  distribution?: number;
  reason: string;
  neighbors: Array<{ id: string; direction: Direction; score: number }>;
};

export type PlacedTile = {
  id: string;
  variant: number;
  ix: number;
  iy: number;
  iz: number;
  /** Feet added to iz * LATTICE_FEET for in-bay stacking / connection alignment. */
  zLift?: number;
};

/** World Z (feet, Z-up) for a placed tile root. */
export function placementWorldZ(tile: Pick<PlacedTile, "iz" | "zLift"> | Pick<Placement, "iz" | "zLift">) {
  return tile.iz * LATTICE_FEET + (tile.zLift ?? 0);
}

export type Assembly = {
  portPairs?: PortPair[];
  id: "A" | "B" | "C";
  title: string;
  tiles: PlacedTile[];
  score: number;
  distributionScore: number;
  parts: ScoreParts;
  connections: ConnectionReport[];
  components: number;
  candidatesTested: number;
  placementNotes?: PlacementNote[];
  distribution?: DistributionReport;
};

export type ScoreParts = {
  interlock: number;
  circulation: number;
  floor: number;
  void: number;
  collision: number;
  connectivity: number;
  richness: number;
  compact: number;
  vertical: number;
};

export type SearchStats = {
  pairwiseComparisons: number;
  candidatesTested: number;
  milliseconds: number;
  analysisMilliseconds: number;
};

export function variantIndex(rotation: Rotation, mirror: Mirror) {
  return ROTATIONS.indexOf(rotation) * 3 + MIRRORS.indexOf(mirror);
}

export function packCell(x: number, y: number, z: number) {
  return (x + PACK_BIAS) * 1_000_000 + (y + PACK_BIAS) * 1_000 + (z + PACK_BIAS);
}

export function unpackCell(value: number): [number, number, number] {
  const z = (value % 1000) - PACK_BIAS;
  const y = (Math.floor(value / 1000) % 1000) - PACK_BIAS;
  const x = Math.floor(value / 1_000_000) - PACK_BIAS;
  return [x, y, z];
}

export function shiftPacked(value: number, ox: number, oy: number, oz: number) {
  const [x, y, z] = unpackCell(value);
  return packCell(x + ox, y + oy, z + oz);
}

export function oppositeDirection(direction: Direction): Direction {
  if (direction === "+X") return "-X";
  if (direction === "-X") return "+X";
  if (direction === "+Y") return "-Y";
  if (direction === "-Y") return "+Y";
  if (direction === "+Z") return "-Z";
  return "+Z";
}
