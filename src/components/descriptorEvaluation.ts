import { DESCRIPTORS, type CompositionPlacement, type DescriptorSettings } from "./compositionEngine";
import { allowsAttractorOverlap, countIntersections, gridDimensions, validateConstraints } from "./constraintValidation";
import type {
  CandidateFocus,
  DescriptorFit,
  GenerationRules,
  MetricValue,
  OptimizerControls,
  OrthogonalGrid,
  RawSpatialMetrics,
  SpatialEvaluation,
} from "./optimizerTypes";

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));
const metric = (raw: number, unit: string, normalized: number, method: string, reliability: MetricValue["reliability"] = "geometric proxy"): MetricValue => ({ applicable: true, raw, unit, normalized: clamp100(normalized), method, reliability });
const na = (method: string): MetricValue => ({ applicable: false, raw: null, unit: "—", normalized: null, method, reliability: "inapplicable" });

function voxelAnalysis(placements: CompositionPlacement[], grid: OrthogonalGrid, rules: GenerationRules) {
  const resolution = { x: Math.min(12, Math.max(6, grid.xCells)), y: Math.min(12, Math.max(6, grid.yCells)), z: Math.min(10, Math.max(5, grid.zCells * 2)) };
  const dimensions = gridDimensions(grid);
  const total = resolution.x * resolution.y * resolution.z;
  const occupied = new Uint8Array(total);
  const indexOf = (x: number, y: number, z: number) => x + y * resolution.x + z * resolution.x * resolution.y;
  for (let z = 0; z < resolution.z; z++) for (let y = 0; y < resolution.y; y++) for (let x = 0; x < resolution.x; x++) {
    const px = (x + 0.5) / resolution.x * dimensions.width - dimensions.width / 2;
    const py = (y + 0.5) / resolution.y * dimensions.height - dimensions.height / 2;
    const pz = (z + 0.5) / resolution.z * dimensions.depth - dimensions.depth / 2;
    occupied[indexOf(x, y, z)] = placements.some((placement) => {
      const rx = placement.scale * (placement.scaleX ?? 1) * 0.48;
      const ry = placement.scale * (placement.scaleY ?? 1) * 0.48;
      const rz = placement.scale * (placement.scaleZ ?? 1) * (((rules.letterThicknessPercent ?? 12) / 100 + 0.04) / 2);
      return ((px - placement.x) / Math.max(rx, 0.01)) ** 2
        + ((py - placement.y) / Math.max(ry, 0.01)) ** 2
        + ((pz - placement.z) / Math.max(rz, 0.01)) ** 2 <= 1;
    }) ? 1 : 0;
  }
  const emptyCount = occupied.reduce((sum, value) => sum + (value ? 0 : 1), 0);
  const visited = new Uint8Array(total);
  const components: number[] = [];
  let accessible = 0;
  const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (let start = 0; start < total; start++) {
    if (occupied[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let size = 0;
    let touchesBoundary = false;
    while (queue.length) {
      const current = queue.pop()!;
      size++;
      const z = Math.floor(current / (resolution.x * resolution.y));
      const remaining = current - z * resolution.x * resolution.y;
      const y = Math.floor(remaining / resolution.x);
      const x = remaining % resolution.x;
      if (x === 0 || y === 0 || z === 0 || x === resolution.x - 1 || y === resolution.y - 1 || z === resolution.z - 1) touchesBoundary = true;
      for (const [dx, dy, dz] of directions) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= resolution.x || ny >= resolution.y || nz >= resolution.z) continue;
        const next = indexOf(nx, ny, nz);
        if (!occupied[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    components.push(size);
    if (touchesBoundary) accessible += size;
  }
  let sightlineHits = 0;
  let sightlineTotal = 0;
  for (let z = 0; z < resolution.z; z++) for (let y = 0; y < resolution.y; y++) {
    sightlineTotal++;
    if (Array.from({ length: resolution.x }, (_, x) => occupied[indexOf(x, y, z)]).every((value) => value === 0)) sightlineHits++;
  }
  for (let z = 0; z < resolution.z; z++) for (let x = 0; x < resolution.x; x++) {
    sightlineTotal++;
    if (Array.from({ length: resolution.y }, (_, y) => occupied[indexOf(x, y, z)]).every((value) => value === 0)) sightlineHits++;
  }
  let skyColumns = 0;
  let verticalColumns = 0;
  for (let x = 0; x < resolution.x; x++) for (let y = 0; y < resolution.y; y++) {
    const column = Array.from({ length: resolution.z }, (_, z) => occupied[indexOf(x, y, z)]);
    if (column[resolution.z - 1] === 0) skyColumns++;
    if (column.every((value) => value === 0)) verticalColumns++;
  }
  const centerX = Math.floor(resolution.x / 2);
  let routeEmpty = 0;
  for (let y = 0; y < resolution.y; y++) for (let z = 0; z < resolution.z; z++) if (!occupied[indexOf(centerX, y, z)]) routeEmpty++;
  return {
    voidRatio: emptyCount / total,
    accessibleRatio: accessible / Math.max(emptyCount, 1),
    largestComponentRatio: Math.max(0, ...components) / Math.max(emptyCount, 1),
    sightlineRatio: sightlineHits / Math.max(sightlineTotal, 1),
    skyExposureRatio: skyColumns / Math.max(resolution.x * resolution.y, 1),
    verticalConnectivity: verticalColumns / Math.max(resolution.x * resolution.y, 1),
    circulationContinuity: routeEmpty / Math.max(resolution.y * resolution.z, 1),
    componentCount: components.length,
  };
}

export function measureSpatialMetrics(placements: CompositionPlacement[], grid: OrthogonalGrid, rules: GenerationRules): RawSpatialMetrics & { voidComponents: number } {
  const dimensions = gridDimensions(grid);
  const scales = placements.map((placement) => placement.scale);
  const meanScale = scales.reduce((sum, value) => sum + value, 0) / Math.max(scales.length, 1);
  const scaleVariance = Math.sqrt(scales.reduce((sum, value) => sum + (value - meanScale) ** 2, 0) / Math.max(scales.length, 1));
  const rotations = placements.map((placement) => Math.hypot(placement.rx, placement.ry, placement.rz % 180));
  const rotationVariation = rotations.reduce((sum, value) => sum + value, 0) / Math.max(rotations.length, 1);
  const depthFactor = (rules.letterThicknessPercent ?? 12) / 100 + 0.04;
  const letterVolume = placements.reduce((sum, placement) => sum + placement.scale ** 3 * (placement.scaleX ?? 1) * (placement.scaleY ?? 1) * (placement.scaleZ ?? 1) * 0.45 * depthFactor, 0);
  const diagonal = Math.hypot(dimensions.width / 2, dimensions.height / 2, dimensions.depth / 2) || 1;
  const centerDistance = placements.reduce((sum, placement) => sum + Math.hypot(placement.x, placement.y, placement.z) / diagonal, 0) / Math.max(placements.length, 1);
  const convergence = placements.reduce((sum, placement) => {
    const desired = Math.atan2(-placement.y, -placement.x) * 180 / Math.PI - 90;
    const difference = Math.abs(((placement.rz - desired + 180) % 360) - 180);
    return sum + (1 - Math.min(180, difference) / 180);
  }, 0) / Math.max(placements.length, 1);
  let adjacency = 0;
  let sequenceDistance = 0;
  for (let index = 0; index < placements.length; index++) {
    const item = placements[index];
    for (let other = index + 1; other < placements.length; other++) {
      if (Math.hypot(item.x - placements[other].x, item.y - placements[other].y, item.z - placements[other].z) < (item.scale + placements[other].scale) * 0.8) adjacency++;
    }
    if (index > 0) sequenceDistance += Math.hypot(item.x - placements[index - 1].x, item.y - placements[index - 1].y, item.z - placements[index - 1].z);
  }
  const voxel = voxelAnalysis(placements, grid, rules);
  const minX = Math.min(...placements.map((placement) => placement.x - placement.scale / 2));
  const maxX = Math.max(...placements.map((placement) => placement.x + placement.scale / 2));
  const minY = Math.min(...placements.map((placement) => placement.y - placement.scale / 2));
  const maxY = Math.max(...placements.map((placement) => placement.y + placement.scale / 2));
  const minZ = Math.min(...placements.map((placement) => placement.z - placement.scale * (placement.scaleZ ?? 1) * depthFactor / 2));
  const maxZ = Math.max(...placements.map((placement) => placement.z + placement.scale * (placement.scaleZ ?? 1) * depthFactor / 2));
  const boundsUtilization = ((maxX - minX) * (maxY - minY) * (maxZ - minZ)) / Math.max(dimensions.volume, 0.001);
  return {
    gridVolume: dimensions.volume,
    estimatedLetterVolume: letterVolume,
    estimatedVoidVolume: dimensions.volume * voxel.voidRatio,
    voidRatio: voxel.voidRatio,
    accessibleVoidRatio: voxel.accessibleRatio,
    largestVoidComponentRatio: voxel.largestComponentRatio,
    sightlineRatio: voxel.sightlineRatio,
    skyExposureRatio: voxel.skyExposureRatio,
    circulationContinuity: voxel.circulationContinuity,
    verticalConnectivity: voxel.verticalConnectivity,
    adjacencyRatio: adjacency / Math.max(placements.length * 2, 1),
    intersectionCount: countIntersections(placements, allowsAttractorOverlap(rules), {
      cols: grid.xCells,
      rows: grid.yCells,
      layers: grid.zCells,
    }),
    boundsUtilization,
    centerDistance,
    orientationConvergence: convergence,
    scaleVariance,
    rotationVariation,
    sequenceContinuity: 1 - Math.min(1, sequenceDistance / Math.max(placements.length * Math.max(dimensions.width, dimensions.height, dimensions.depth) * 0.22, 1)),
    voidComponents: voxel.componentCount,
  };
}

function descriptorMeasurements(raw: ReturnType<typeof measureSpatialMetrics>, controls: OptimizerControls) {
  const volumeHeightRatio = Math.min(1, raw.boundsUtilization * 1.4);
  const hierarchy = Math.min(1, raw.scaleVariance / 0.35);
  const formalVariation = Math.min(1, raw.rotationVariation / 90 * 0.65 + hierarchy * 0.35);
  const centralized = 1 - Math.min(1, raw.centerDistance);
  const voidFragmentation = Math.min(1, (raw.voidComponents - 1) / 8);
  const manualLetter = metric(controls.surrealManualLetter, "% manual rating", controls.surrealManualLetter, "User assessment of unconventional letter relationships", "manual assessment");
  const manualVoid = metric(controls.surrealManualVoid, "% manual rating", controls.surrealManualVoid, "User assessment of unexpected spatial transitions", "manual assessment");
  return {
    openVolume: {
      letter: metric(raw.centerDistance, "mean normalized radius", raw.centerDistance * 100, "Letter dispersion relative to grid diagonal"),
      void: metric(raw.estimatedVoidVolume, "volume units³", raw.voidRatio * 100, "Voxel-estimated unobstructed volume / grid volume"),
    },
    convergent: {
      letter: metric(raw.orientationConvergence, "orientation ratio", raw.orientationConvergence * 100, "Letter axes directed toward common center"),
      void: metric(1 - raw.centerDistance, "center concentration ratio", centralized * 100, "Accessible-space concentration toward common destination"),
    },
    sculptural: {
      letter: metric(formalVariation, "complexity index", formalVariation * 100, "Rotation, scale and dimensional variation proxy"),
      void: metric(voidFragmentation, "fragmentation index", voidFragmentation * 100, "Connected-void fragmentation proxy"),
    },
    visuallyConnected: {
      letter: na("Visibility is evaluated in occupiable void space"),
      void: metric(raw.sightlineRatio, "clear sightline ratio", raw.sightlineRatio * 100, "Orthogonal unobstructed voxel sightlines"),
    },
    surreal: { letter: manualLetter, void: manualVoid },
    monumental: {
      letter: metric(volumeHeightRatio, "envelope utilization", volumeHeightRatio * 100, "Occupied envelope and relative scale proxy"),
      void: metric(raw.largestVoidComponentRatio, "largest void ratio", raw.largestVoidComponentRatio * 100, "Dominance of largest connected spatial volume"),
    },
    hierarchical: {
      letter: metric(raw.scaleVariance, "scale standard deviation", hierarchy * 100, "Differentiation of letter scales"),
      void: metric(voidFragmentation, "component differentiation", Math.min(100, voidFragmentation * 80 + raw.largestVoidComponentRatio * 20), "Primary versus secondary connected void proxy"),
    },
    sequential: {
      letter: metric(raw.sequenceContinuity, "ordered continuity ratio", raw.sequenceContinuity * 100, "Continuity between indexed letter positions"),
      void: metric(raw.circulationContinuity, "route continuity ratio", raw.circulationContinuity * 100, "Continuous central-route voxel clearance"),
    },
    circulationActivated: {
      letter: na("Circulation performance is evaluated in void space"),
      void: metric(raw.accessibleVoidRatio, "accessible void ratio", (raw.accessibleVoidRatio * 0.6 + raw.circulationContinuity * 0.4) * 100, "Exterior-connected void and continuous route proxy"),
    },
    centralized: {
      letter: metric(centralized, "center concentration ratio", centralized * 100, "Mean distance from primary center"),
      void: metric(1 - Math.abs(raw.largestVoidComponentRatio - 0.65), "central void dominance", (1 - Math.abs(raw.largestVoidComponentRatio - 0.65)) * 100, "Dominant connected void centeredness proxy"),
    },
    verticallyIntegrated: {
      letter: metric(raw.adjacencyRatio, "multilevel adjacency ratio", Math.min(100, raw.adjacencyRatio * 80), "Cross-level letter adjacency proxy"),
      void: metric(raw.verticalConnectivity, "clear vertical column ratio", raw.verticalConnectivity * 100, "Unobstructed multilevel voxel columns"),
    },
    luminous: {
      letter: na("Daylight potential is evaluated for negative space"),
      void: metric(raw.skyExposureRatio, "sky-exposed column ratio", raw.skyExposureRatio * 100, "Geometric daylight proxy using unobstructed sky columns"),
    },
  };
}

export function scoreMeasurements(
  measurements: ReturnType<typeof descriptorMeasurements>,
  descriptors: DescriptorSettings,
  focus: CandidateFocus,
  combinedBalance: number,
) {
  const fits: DescriptorFit[] = DESCRIPTORS.map((descriptor) => {
    const values = measurements[descriptor.id];
    let activeValue: number | null = null;
    if (focus === "letter" && values.letter.applicable) activeValue = values.letter.normalized;
    if (focus === "void" && values.void.applicable) activeValue = values.void.normalized;
    if (focus === "combined") {
      if (values.letter.applicable && values.void.applicable) activeValue = (values.letter.normalized! * combinedBalance + values.void.normalized! * (100 - combinedBalance)) / 100;
      else if (values.letter.applicable) activeValue = values.letter.normalized;
      else if (values.void.applicable) activeValue = values.void.normalized;
    }
    const importance = descriptors[descriptor.id].importance;
    const deviation = activeValue === null ? null : Math.abs(descriptors[descriptor.id].intensity - activeValue);
    return { id: descriptor.id, ...values, target: descriptors[descriptor.id].intensity, importance, activeValue, deviation, weightedDeviation: deviation === null ? 0 : deviation * importance };
  });
  const applicableWeight = fits.reduce((sum, item) => sum + (item.deviation !== null ? item.importance : 0), 0);
  const weightedDeviation = fits.reduce((sum, item) => sum + item.weightedDeviation, 0);
  return { fits, applicableWeight, fit: applicableWeight > 0 ? clamp100(100 - weightedDeviation / applicableWeight) : null };
}

export function evaluateSpatialDesign(args: {
  placements: CompositionPlacement[];
  grid: OrthogonalGrid;
  rules: GenerationRules;
  descriptors: DescriptorSettings;
  controls: OptimizerControls;
  focus: CandidateFocus;
  sourceCount?: number;
  bounds?: "body" | "center";
}): SpatialEvaluation {
  const raw = measureSpatialMetrics(args.placements, args.grid, args.rules);
  const measurements = descriptorMeasurements(raw, args.controls);
  const scored = scoreMeasurements(measurements, args.descriptors, args.focus, args.controls.combinedBalance);
  const constraints = validateConstraints(args.placements, args.grid, args.rules, args.sourceCount, args.bounds ?? "body");
  const tradeoffs: string[] = [];
  if (raw.voidRatio > 0.8 && raw.adjacencyRatio < 0.25) tradeoffs.push("Greater open volume reduces letter adjacency.");
  if (raw.scaleVariance > 0.25 && raw.skyExposureRatio < 0.6) tradeoffs.push("Stronger hierarchy reduces the daylight proxy.");
  if (raw.centerDistance < 0.35 && raw.circulationContinuity < 0.65) tradeoffs.push("Centralization constrains the continuous circulation route.");
  if (!tradeoffs.length) tradeoffs.push("No dominant measured tradeoff in this configuration.");
  return { raw, descriptors: scored.fits, fit: constraints.feasible ? scored.fit : null, applicableWeight: scored.applicableWeight, constraints, tradeoffs };
}
