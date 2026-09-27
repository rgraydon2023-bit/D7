import type { Cell, Letter } from "./letterTypes";

export type CropSource =
  | { kind: "primary" }
  | { kind: "permutation"; index: number };

export type Crop = {
  id: string;
  originCol: number;
  originRow: number;
  cells: Cell[];
  source: CropSource;
};

export type CropCriteria = {
  /** Prefer at least this many unique letters (1–3). */
  minUniqueLetters: number;
  /** Prefer rotation span of at least this many degrees. */
  minRotationSpan: number;
  /** Prefer when spacing is below letter size (overlap possible). */
  requireOverlap: boolean;
  /** Prefer at least this many different letter pairs among the 4 cells. */
  minLetterChanges: number;
};

export type CropEvaluation = {
  crop: Crop;
  uniqueLetters: number;
  rotationSpan: number;
  letterChanges: number;
  overlapRatio: number;
  scores: {
    diversity: number;
    contrast: number;
    overlap: number;
    tension: number;
    total: number;
  };
  passes: boolean;
  reasons: string[];
};

export const DEFAULT_CROP_CRITERIA: CropCriteria = {
  minUniqueLetters: 2,
  minRotationSpan: 45,
  requireOverlap: true,
  minLetterChanges: 2,
};

function cellAt(cells: Cell[], cols: number, col: number, row: number): Cell {
  return cells[row * cols + col];
}

/** Extract every 2×2 window from a grid. */
export function extract2x2Crops(
  cells: Cell[],
  cols: number,
  rows: number,
  source: CropSource,
): Crop[] {
  if (cols < 2 || rows < 2) return [];

  const sourceKey =
    source.kind === "primary" ? "primary" : `perm-${source.index}`;

  const crops: Crop[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const window: Cell[] = [
        cellAt(cells, cols, col, row),
        cellAt(cells, cols, col + 1, row),
        cellAt(cells, cols, col, row + 1),
        cellAt(cells, cols, col + 1, row + 1),
      ];
      crops.push({
        id: `crop-${sourceKey}-${col}-${row}`,
        originCol: col,
        originRow: row,
        source,
        cells: window.map((c, i) => ({
          ...c,
          id: `${c.id}-crop-${sourceKey}-${col}-${row}-${i}`,
        })),
      });
    }
  }
  return crops;
}

function uniqueLetterCount(cells: Cell[]): number {
  return new Set(cells.map((c) => c.letter)).size;
}

function rotationSpan(cells: Cell[]): number {
  const rotations = cells.map((c) => c.rotation);
  return Math.max(...rotations) - Math.min(...rotations);
}

/** Count adjacent edges (4 in a 2×2) where the letter changes. */
function letterChangeCount(cells: Cell[]): number {
  // indices: 0 1 / 2 3
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ];
  return edges.reduce(
    (n, [a, b]) => n + (cells[a].letter !== cells[b].letter ? 1 : 0),
    0,
  );
}

function averageNeighborRotationDelta(cells: Cell[]): number {
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ];
  const sum = edges.reduce((acc, [a, b]) => {
    let d = Math.abs(cells[a].rotation - cells[b].rotation) % 360;
    if (d > 180) d = 360 - d;
    return acc + d;
  }, 0);
  return sum / edges.length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function evaluateCrop(
  crop: Crop,
  spacing: number,
  fontSize: number,
  criteria: CropCriteria,
): CropEvaluation {
  const uniqueLetters = uniqueLetterCount(crop.cells);
  const span = rotationSpan(crop.cells);
  const letterChanges = letterChangeCount(crop.cells);
  const overlapRatio =
    fontSize <= 0 ? 0 : clamp01((fontSize - spacing) / fontSize + 0.15);
  const angularOverlap = clamp01(averageNeighborRotationDelta(crop.cells) / 90);

  const diversity = uniqueLetters / 3;
  const contrast = clamp01(span / 180);
  const overlap = clamp01(overlapRatio * 0.65 + angularOverlap * 0.35);
  const tension = letterChanges / 4;

  const total =
    diversity * 0.3 + contrast * 0.25 + overlap * 0.25 + tension * 0.2;

  const reasons: string[] = [];
  let passes = true;

  if (uniqueLetters < criteria.minUniqueLetters) {
    passes = false;
    reasons.push(`need ≥${criteria.minUniqueLetters} unique letters`);
  }
  if (span < criteria.minRotationSpan) {
    passes = false;
    reasons.push(`need ≥${criteria.minRotationSpan}° rotation span`);
  }
  if (criteria.requireOverlap && spacing >= fontSize && angularOverlap < 0.25) {
    passes = false;
    reasons.push("little overlap / angular tension");
  }
  if (letterChanges < criteria.minLetterChanges) {
    passes = false;
    reasons.push(`need ≥${criteria.minLetterChanges} letter-change edges`);
  }

  if (passes) {
    reasons.push("meets criteria");
  }

  return {
    crop,
    uniqueLetters,
    rotationSpan: span,
    letterChanges,
    overlapRatio,
    scores: {
      diversity,
      contrast,
      overlap,
      tension,
      total,
    },
    passes,
    reasons,
  };
}

export function evaluateAllCrops(
  cells: Cell[],
  cols: number,
  rows: number,
  spacing: number,
  fontSize: number,
  criteria: CropCriteria,
  permutations: { id: string; cells: Cell[] }[] = [],
): CropEvaluation[] {
  const fromPrimary = extract2x2Crops(cells, cols, rows, { kind: "primary" });
  const fromPermutations = permutations.flatMap((perm, index) =>
    extract2x2Crops(perm.cells, cols, rows, { kind: "permutation", index }),
  );

  return [...fromPrimary, ...fromPermutations]
    .map((crop) => evaluateCrop(crop, spacing, fontSize, criteria))
    .sort((a, b) => {
      if (a.passes !== b.passes) return a.passes ? -1 : 1;
      return b.scores.total - a.scores.total;
    });
}

export function lettersInCrop(cells: Cell[]): Letter[] {
  return [...new Set(cells.map((c) => c.letter))];
}
