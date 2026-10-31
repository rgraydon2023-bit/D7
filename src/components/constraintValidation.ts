import type { CompositionPlacement } from "./compositionEngine";
import { ATTRACTOR_OVERLAP_GAP, diagonalCenterGap, UNIT_LETTER_SPAN } from "./letterVolumeLayout";
import type { ConstraintStatus, GenerationRules, OrthogonalGrid } from "./optimizerTypes";

export function allowsAttractorOverlap(rules: GenerationRules) {
  const planSpan = Math.max(rules.maximumLetterSize, 0.1) * UNIT_LETTER_SPAN;
  const diagonalPull = rules.attractorGap != null
    && rules.attractorGap < diagonalCenterGap(rules.xyGap ?? 56, planSpan) - 1e-6;
  return diagonalPull
    || (rules.xyGap ?? Number.POSITIVE_INFINITY) <= ATTRACTOR_OVERLAP_GAP
    || (rules.zGap ?? Number.POSITIVE_INFINITY) <= ATTRACTOR_OVERLAP_GAP;
}

function pairOrigin(index: number, count: number) {
  const origin = index - (index % 2);
  return origin + 1 < count ? origin : null;
}

function sameAttractor(a: CompositionPlacement, b: CompositionPlacement, cols: number, rows: number, layers: number) {
  if (a.col === undefined || b.col === undefined || a.row === undefined || b.row === undefined) return false;
  const ax = pairOrigin(a.col, cols);
  const bx = pairOrigin(b.col, cols);
  const ay = pairOrigin(a.row, rows);
  const by = pairOrigin(b.row, rows);
  const az = pairOrigin(a.layerIndex, layers);
  const bz = pairOrigin(b.layerIndex, layers);
  return ax !== null && ax === bx && ay !== null && ay === by && az !== null && az === bz;
}

function depthHalf(placement: CompositionPlacement, rules: GenerationRules) {
  return placement.scale * (placement.scaleZ ?? 1) * (((rules.letterThicknessPercent ?? 12) / 100 + 0.04) / 2);
}

function extents(placement: CompositionPlacement, rules: GenerationRules) {
  return {
    x: placement.scale * (placement.scaleX ?? 1) * 0.5,
    y: placement.scale * (placement.scaleY ?? 1) * 0.5,
    z: depthHalf(placement, rules),
  };
}

export function gridDimensions(grid: OrthogonalGrid) {
  return {
    width: grid.xCells * grid.cellX,
    height: grid.yCells * grid.cellY,
    depth: grid.zCells * grid.cellZ,
    volume: grid.xCells * grid.cellX * grid.yCells * grid.cellY * grid.zCells * grid.cellZ,
  };
}

export function repairToHardConstraints(
  source: CompositionPlacement[],
  grid: OrthogonalGrid,
  rules: GenerationRules,
) {
  const dimensions = gridDimensions(grid);
  const repaired = structuredClone(source);
  repaired.forEach((placement) => {
    placement.scale = Math.max(rules.minimumLetterSize, Math.min(rules.maximumLetterSize, placement.scale));
    for (const key of ["scaleX", "scaleY"] as const) {
      const axis = placement[key] ?? 1;
      placement[key] = Math.max(rules.minimumLetterSize / placement.scale, Math.min(rules.maximumLetterSize / placement.scale, axis));
    }
    const extent = extents(placement, rules);
    const halfX = Math.max(0, dimensions.width / 2 - extent.x);
    const halfY = Math.max(0, dimensions.height / 2 - extent.y);
    const halfZ = Math.max(0, dimensions.depth / 2 - extent.z);
    placement.x = Math.max(-halfX, Math.min(halfX, placement.x));
    placement.y = Math.max(-halfY, Math.min(halfY, placement.y));
    placement.z = Math.max(-halfZ, Math.min(halfZ, placement.z));
    // Preserve an unobstructed route along the Y axis, unless an attractor is pulling this group together.
    const required = rules.minimumClearance / 2 + extent.x;
    if (!allowsAttractorOverlap(rules) && Math.abs(placement.x) < required) {
      const side = placement.x < 0 ? -1 : 1;
      placement.x = Math.max(-halfX, Math.min(halfX, side * required));
    }
  });
  return repaired;
}

export function countIntersections(
  placements: CompositionPlacement[],
  ignoreSharedAttractors = false,
  counts?: { cols: number; rows: number; layers: number },
) {
  let count = 0;
  for (let first = 0; first < placements.length; first++) {
    const a = placements[first];
    const aRadius = a.scale * Math.max(a.scaleX ?? 1, a.scaleY ?? 1, a.scaleZ ?? 1) * 0.38;
    for (let second = first + 1; second < placements.length; second++) {
      const b = placements[second];
      if (ignoreSharedAttractors && counts && sameAttractor(a, b, counts.cols, counts.rows, counts.layers)) continue;
      const bRadius = b.scale * Math.max(b.scaleX ?? 1, b.scaleY ?? 1, b.scaleZ ?? 1) * 0.38;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < aRadius + bRadius) count++;
    }
  }
  return count;
}

export function validateConstraints(
  placements: CompositionPlacement[],
  grid: OrthogonalGrid,
  rules: GenerationRules,
  sourceCount?: number,
  bounds: "body" | "center" = "body",
): ConstraintStatus {
  const dimensions = gridDimensions(grid);
  const half = { x: dimensions.width / 2, y: dimensions.height / 2, z: dimensions.depth / 2 };
  const allowAttractorOverlap = allowsAttractorOverlap(rules);
  const finite = placements.every((placement) => [placement.x, placement.y, placement.z, placement.rx, placement.ry, placement.rz, placement.scale].every(Number.isFinite));
  const withinBounds = finite && placements.every((placement) => {
    const extent = bounds === "center" ? { x: 0, y: 0, z: 0 } : extents(placement, rules);
    return Math.abs(placement.x) + extent.x <= half.x + 1e-6
      && Math.abs(placement.y) + extent.y <= half.y + 1e-6
      && Math.abs(placement.z) + extent.z <= half.z + 1e-6;
  });
  const clearanceSatisfied = placements.every((placement) => Math.abs(placement.x) - extents(placement, rules).x >= rules.minimumClearance / 2 - 1e-6);
  const sizeSatisfied = placements.every((placement) => {
    const dimensions = [placement.scale * (placement.scaleX ?? 1), placement.scale * (placement.scaleY ?? 1)];
    return Math.min(...dimensions) >= rules.minimumLetterSize - 1e-6 && Math.max(...dimensions) <= rules.maximumLetterSize + 1e-6;
  });
  const intersectionCount = countIntersections(placements, allowAttractorOverlap, {
    cols: grid.xCells,
    rows: grid.yCells,
    layers: grid.zCells,
  });
  const geometryValid = finite && intersectionCount <= rules.maximumIntersections;
  const violations: string[] = [];
  if (!grid.locked) violations.push("Grid dimensions must be locked before optimization");
  if (!withinBounds) violations.push("Geometry exceeds the locked grid boundary");
  if (!clearanceSatisfied) violations.push("Minimum circulation clearance is not satisfied");
  if (!sizeSatisfied) violations.push("Letter size limits are not satisfied");
  if (!geometryValid) violations.push(`Intersection limit exceeded (${intersectionCount}/${rules.maximumIntersections})`);
  if (sourceCount && !rules.allowRemove && sourceCount > grid.xCells * grid.yCells * grid.zCells) violations.push("Grid capacity is smaller than the required letter count");
  return {
    feasible: violations.length === 0,
    withinBounds,
    clearanceSatisfied,
    geometryValid,
    sizeSatisfied,
    intersectionCount,
    violations,
  };
}
