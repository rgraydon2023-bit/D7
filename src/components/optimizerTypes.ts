import type { CompositionPlacement, DescriptorId, DescriptorSettings } from "./compositionEngine";
import type { Cell } from "./letterTypes";

export type OptimizationFocus = "letter" | "void" | "combined" | "auto";
export type CandidateFocus = Exclude<OptimizationFocus, "auto">;

export type OrthogonalGrid = {
  xCells: number;
  yCells: number;
  zCells: number;
  cellX: number;
  cellY: number;
  cellZ: number;
  locked: boolean;
};

export type GenerationRules = {
  minimumClearance: number;
  minimumLetterSize: number;
  maximumLetterSize: number;
  allowRotationX: boolean;
  allowRotationY: boolean;
  maximumRotationY: number;
  allowRotationZ: boolean;
  rotationStep: number;
  preserveProportions: boolean;
  allowRepeat: boolean;
  allowRemove: boolean;
  allowReposition: boolean;
  lockExistingLocations: boolean;
  allowGeometryModification: boolean;
  maximumIntersections: number;
  letterThicknessPercent: number;
  /** Shared Slide gap sliders. At 10 and below, octet attractors pull letters into overlap. */
  xyGap: number;
  zGap: number;
  /** Center-to-letter distance along the 45° diagonal. Omit to leave letters on the grid. */
  attractorGap?: number;
};

export type OptimizerControls = {
  alternatives: number;
  generations: number;
  intensity: number;
  seed: number;
  combinedBalance: number;
  preservePercent: number;
  surrealManualLetter: number;
  surrealManualVoid: number;
};

export type SelectionVolume = {
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  stepX: number;
  stepY: number;
  stepZ: number;
};

export type MetricValue = {
  applicable: boolean;
  raw: number | null;
  unit: string;
  normalized: number | null;
  method: string;
  reliability: "measured" | "geometric proxy" | "manual assessment" | "inapplicable";
};

export type DescriptorMeasurement = {
  id: DescriptorId;
  letter: MetricValue;
  void: MetricValue;
};

export type DescriptorFit = DescriptorMeasurement & {
  target: number;
  importance: number;
  activeValue: number | null;
  deviation: number | null;
  weightedDeviation: number;
};

export type RawSpatialMetrics = {
  gridVolume: number;
  estimatedLetterVolume: number;
  estimatedVoidVolume: number;
  voidRatio: number;
  accessibleVoidRatio: number;
  largestVoidComponentRatio: number;
  sightlineRatio: number;
  skyExposureRatio: number;
  circulationContinuity: number;
  verticalConnectivity: number;
  adjacencyRatio: number;
  intersectionCount: number;
  boundsUtilization: number;
  centerDistance: number;
  orientationConvergence: number;
  scaleVariance: number;
  rotationVariation: number;
  sequenceContinuity: number;
};

export type ConstraintStatus = {
  feasible: boolean;
  withinBounds: boolean;
  clearanceSatisfied: boolean;
  geometryValid: boolean;
  sizeSatisfied: boolean;
  intersectionCount: number;
  violations: string[];
};

export type SpatialEvaluation = {
  raw: RawSpatialMetrics;
  descriptors: DescriptorFit[];
  fit: number | null;
  applicableWeight: number;
  constraints: ConstraintStatus;
  tradeoffs: string[];
};

export type SpatialAlternative = {
  id: string;
  seed: number;
  focus: CandidateFocus;
  placements: CompositionPlacement[];
  evaluation: SpatialEvaluation;
  generation: number;
  fullPlacements?: CompositionPlacement[];
  selection?: {
    centerX: number;
    centerY: number;
    centerZ: number;
    width: number;
    height: number;
    depth: number;
    evaluatedPositions: number;
    totalPositions: number;
    exhaustive: boolean;
  };
};

export type OptimizationInput = {
  sourceCells: Cell[];
  descriptors: DescriptorSettings;
  grid: OrthogonalGrid;
  rules: GenerationRules;
  controls: OptimizerControls;
  focus: OptimizationFocus;
  selection: SelectionVolume;
  lockedParent?: SpatialAlternative | null;
};

export const DEFAULT_GRID: OrthogonalGrid = {
  xCells: 8,
  yCells: 6,
  zCells: 4,
  cellX: 1.2,
  cellY: 1.2,
  cellZ: 1.2,
  locked: true,
};

export const DEFAULT_RULES: GenerationRules = {
  minimumClearance: 0.8,
  minimumLetterSize: 0.45,
  maximumLetterSize: 1.1,
  allowRotationX: true,
  allowRotationY: true,
  maximumRotationY: 90,
  allowRotationZ: true,
  rotationStep: 15,
  preserveProportions: true,
  allowRepeat: false,
  allowRemove: false,
  allowReposition: true,
  lockExistingLocations: false,
  allowGeometryModification: true,
  maximumIntersections: 24,
  letterThicknessPercent: 12,
  xyGap: 56,
  zGap: 56,
};

export const DEFAULT_OPTIMIZER_CONTROLS: OptimizerControls = {
  alternatives: 4,
  generations: 8,
  intensity: 55,
  seed: 41,
  combinedBalance: 50,
  preservePercent: 0,
  surrealManualLetter: 50,
  surrealManualVoid: 50,
};

export const DEFAULT_SELECTION: SelectionVolume = {
  enabled: false,
  width: 2,
  height: 2,
  depth: 2,
  stepX: 1,
  stepY: 1,
  stepZ: 1,
};
