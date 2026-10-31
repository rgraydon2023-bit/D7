import type { CompositionPlacement, DescriptorSettings } from "./compositionEngine";
import { evaluateSpatialDesign } from "./descriptorEvaluation";
import { gridDimensions } from "./constraintValidation";
import { letterDepthSpan, octetBoxes, UNIT_LETTER_SPAN } from "./letterVolumeLayout";
import type { CandidateFocus, GenerationRules, OptimizerControls, OrthogonalGrid, SelectionVolume, SpatialAlternative } from "./optimizerTypes";

function axisCenters(overall: number, selection: number, step: number) {
  const extent = Math.max(0, (overall - selection) / 2);
  if (extent === 0) return [0];
  const values: number[] = [];
  for (let value = -extent; value <= extent + 1e-6; value += Math.max(0.05, step)) values.push(Math.min(extent, value));
  if (values[values.length - 1] < extent - 1e-6) values.push(extent);
  return values;
}

function distributedSample<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * (items.length - 1) / Math.max(count - 1, 1))]);
}

function sourceAwareCenters(
  placements: CompositionPlacement[],
  overall: { width: number; height: number; depth: number },
  selection: Pick<SelectionVolume, "width" | "height" | "depth">,
  count: number,
) {
  const extents = {
    x: Math.max(0, (overall.width - selection.width) / 2),
    y: Math.max(0, (overall.height - selection.height) / 2),
    z: Math.max(0, (overall.depth - selection.depth) / 2),
  };
  const candidates = distributedSample(placements, count).map((placement) => ({
    x: Math.max(-extents.x, Math.min(extents.x, placement.x)),
    y: Math.max(-extents.y, Math.min(extents.y, placement.y)),
    z: Math.max(-extents.z, Math.min(extents.z, placement.z)),
  }));
  return [...new Map(candidates.map((center) => [`${center.x.toFixed(5)}:${center.y.toFixed(5)}:${center.z.toFixed(5)}`, center])).values()];
}

/** Same test as the gold selection highlight: the letter center is inside the crop. */
export function placementCenterInSelection(
  placement: { x: number; y: number; z: number },
  selection: { centerX: number; centerY: number; centerZ: number; width: number; height: number; depth: number },
) {
  return Math.abs(placement.x - selection.centerX) <= selection.width / 2 + 1e-6
    && Math.abs(placement.y - selection.centerY) <= selection.height / 2 + 1e-6
    && Math.abs(placement.z - selection.centerZ) <= selection.depth / 2 + 1e-6;
}

export function selectionEvaluationGrid(selection: Pick<SelectionVolume, "width" | "height" | "depth">, overall: OrthogonalGrid): OrthogonalGrid {
  const xCells = Math.max(2, Math.round(selection.width / overall.cellX));
  const yCells = Math.max(2, Math.round(selection.height / overall.cellY));
  const zCells = Math.max(2, Math.round(selection.depth / overall.cellZ));
  return {
    xCells,
    yCells,
    zCells,
    cellX: selection.width / xCells,
    cellY: selection.height / yCells,
    cellZ: selection.depth / zCells,
    locked: true,
  };
}

function rank(alternative: SpatialAlternative) {
  if (alternative.evaluation.constraints.feasible) return alternative.evaluation.fit ?? 0;
  return -1000 - alternative.evaluation.constraints.violations.length * 10 + Math.min(alternative.placements.length, 9);
}

export function selectBestSubvolume(args: {
  fullPlacements: CompositionPlacement[];
  overallGrid: OrthogonalGrid;
  selection: SelectionVolume;
  rules: GenerationRules;
  descriptors: DescriptorSettings;
  controls: OptimizerControls;
  focus: CandidateFocus;
  seed: number;
  generation: number;
  maxPositions?: number;
}) {
  const overall = gridDimensions(args.overallGrid);
  const selection = {
    ...args.selection,
    width: Math.min(args.selection.width, overall.width),
    height: Math.min(args.selection.height, overall.height),
    depth: Math.min(args.selection.depth, overall.depth),
  };
  const dashedBoxes = octetBoxes(args.fullPlacements.map((placement) => {
    const width = placement.scale * (placement.scaleX ?? 1);
    const height = placement.scale * (placement.scaleY ?? 1);
    const depth = placement.scale * (placement.scaleZ ?? 1);
    return {
      col: placement.col,
      row: placement.row,
      layerIndex: placement.layerIndex,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      halfX: (width * UNIT_LETTER_SPAN) / 2,
      halfY: (height * UNIT_LETTER_SPAN) / 2,
      halfZ: letterDepthSpan(depth, args.rules.letterThicknessPercent ?? 12, false) / 2,
    };
  }), { cols: args.overallGrid.xCells, rows: args.overallGrid.yCells, layers: args.overallGrid.zCells });
  const dashedCenters = dashedBoxes.map((box) => ({
    x: box.x,
    y: box.y,
    z: box.z,
    width: box.width,
    height: box.height,
    depth: box.depth,
  }));
  const xs = axisCenters(overall.width, selection.width, selection.stepX);
  const ys = axisCenters(overall.height, selection.height, selection.stepY);
  const zs = axisCenters(overall.depth, selection.depth, selection.stepZ);
  const steppedCenters = xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => ({
    x, y, z, width: selection.width, height: selection.height, depth: selection.depth,
  }))));
  const allCenters = dashedCenters.length ? dashedCenters : steppedCenters;
  const maxPositions = Math.max(1, args.maxPositions ?? allCenters.length);
  const exhaustive = allCenters.length <= maxPositions;
  const sourceBudget = exhaustive || dashedCenters.length ? 0 : Math.min(args.fullPlacements.length, Math.max(4, Math.floor(maxPositions / 4)));
  const alignedBudget = Math.max(1, maxPositions - sourceBudget);
  const alignedCenters = exhaustive ? allCenters : distributedSample(allCenters, alignedBudget);
  // Uniform sampling can miss a window that sits on a generated letter, so always
  // evaluate a representative set of windows centered on the actual geometry.
  const adaptiveCenters = sourceAwareCenters(args.fullPlacements, overall, selection, sourceBudget).map((center) => ({
    ...center,
    width: selection.width,
    height: selection.height,
    depth: selection.depth,
  }));
  const centers = dashedCenters.length
    ? dashedCenters
    : [...new Map([...adaptiveCenters, ...alignedCenters].map((center) => [`${center.x.toFixed(5)}:${center.y.toFixed(5)}:${center.z.toFixed(5)}`, center])).values()];
  const candidates: SpatialAlternative[] = [];
  centers.forEach((center, centerIndex) => {
    const window = {
      centerX: center.x,
      centerY: center.y,
      centerZ: center.z,
      width: center.width,
      height: center.height,
      depth: center.depth,
    };
    const contained = args.fullPlacements.filter((placement) => placementCenterInSelection(placement, window));
    if (!contained.length) return;
    const localPlacements = contained.map((placement) => ({ ...structuredClone(placement), x: placement.x - center.x, y: placement.y - center.y, z: placement.z - center.z }));
    const evaluation = evaluateSpatialDesign({
      placements: localPlacements,
      grid: selectionEvaluationGrid(window, args.overallGrid),
      rules: args.rules,
      descriptors: args.descriptors,
      controls: args.controls,
      focus: args.focus,
      bounds: "center",
    });
    candidates.push({
      id: `selection-${args.seed}-${args.generation}-${centerIndex}`,
      seed: args.seed,
      focus: args.focus,
      placements: localPlacements,
      fullPlacements: args.fullPlacements,
      evaluation,
      generation: args.generation,
      selection: {
        centerX: window.centerX,
        centerY: window.centerY,
        centerZ: window.centerZ,
        width: window.width,
        height: window.height,
        depth: window.depth,
        evaluatedPositions: centers.length,
        totalPositions: allCenters.length,
        exhaustive,
      },
    });
  });
  return candidates.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
