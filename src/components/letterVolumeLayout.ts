import type { Cell } from "./letterTypes";

export type VolumeOptions = {
  cells: Cell[];
  layerCells: Cell[][];
  cols: number;
  rows: number;
  spacing: number;
  zSpacing: number;
  /**
   * Center-to-letter distance along the 45° diagonal, in the same units as the gap sliders.
   * Omit it to keep each letter on the grid.
   */
  attractorGap?: number;
  letterSize: number;
  thickness: number;
  yRotationEnabled: boolean;
  yRotationRange: number;
};

/** Full width and height of a unit letter, before the size scale is applied. */
export const UNIT_LETTER_SPAN = 0.92;
/** Gap sliders use the same numbers as letter size. These are their lowest values. */
export const XY_GAP_MINIMUM = 8;
export const Z_GAP_MINIMUM = 0;
/** At this gap and below, each group of eight letters overlaps around its attractor. */
export const ATTRACTOR_OVERLAP_GAP = 10;
/** Maximum overlap as a fraction of the nominal letter span (42% remains exposed). */
const MAX_EDGE_OVERLAP = 0.58;

/**
 * Center distance for a gap slider. Gap values are center pitches, in the same units as the letter span.
 * Letters stay apart while the requested pitch is larger than the letter. At the letter edge they meet,
 * and further decreases overlap the edges until the slider minimum. Centers never coincide.
 */
export function letterCenterPitch(requestedPitch: number, letterSpan: number, minimumPitch: number) {
  const span = Math.max(letterSpan, 0.001);
  const requested = Math.max(requestedPitch, minimumPitch);
  if (requested >= span) return requested;
  const range = Math.max(span - minimumPitch, 0.001);
  const closeness = Math.min(1, Math.max(0, (span - requested) / range));
  return span - closeness * span * MAX_EDGE_OVERLAP;
}

/** XY-gap value where neighboring letters meet. Lower values overlap. */
export function xyContactGap(fontSize: number) {
  return Math.max(fontSize, 0.1) * UNIT_LETTER_SPAN;
}

/** Z-gap value where stacked letters meet. Lower values overlap. */
export function zContactGap(fontSize: number, thickness: number) {
  return letterDepthSpan(Math.max(fontSize / 50, 0.1), thickness, false) * 50;
}

/**
 * Grid pitch for one axis. Above 10 the letters approach but stay apart.
 * At 10 they meet, and the attractor pull creates the overlap below that.
 */
export function separatedPitch(gap: number, letterSpan: number) {
  const span = Math.max(letterSpan, 0.001);
  const requested = Math.max(gap, 0) / 50;
  if (gap > ATTRACTOR_OVERLAP_GAP) return Math.max(requested, span);
  return span;
}

/** 0 above the overlap gap, then 1 at a gap of 0. */
export function attractorBlend(gap: number) {
  if (!(gap <= ATTRACTOR_OVERLAP_GAP)) return 0;
  return 1 - Math.max(0, gap) / ATTRACTOR_OVERLAP_GAP;
}

export const DIAGONAL_GAP_MINIMUM = 0;
export const DIAGONAL_GAP_MAXIMUM = 120;

/** Distance from a group center to one letter along the 45° plan diagonal, in gap-slider units. */
export function diagonalCenterGap(spacing: number, planSpan: number) {
  return (separatedPitch(spacing, planSpan) * 50) / Math.SQRT2;
}

/** 1 keeps the grid diagonal. 0 sits on the center. Values above 1 spread letters out along the same ray. */
export function diagonalAttractorScale(requestedGap: number, spacing: number, planSpan: number) {
  const natural = diagonalCenterGap(spacing, planSpan);
  if (natural < 1e-6) return 1;
  return Math.max(0, requestedGap) / natural;
}

function pairOrigin(index: number, count: number) {
  const origin = index - (index % 2);
  return origin + 1 < count ? origin : null;
}

export type OctetBox = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
};

export type OctetMember = {
  col?: number;
  row?: number;
  layerIndex: number;
  x: number;
  y: number;
  z: number;
  halfX: number;
  halfY: number;
  halfZ: number;
};

/** Padding outside the letter faces, shared by the dashed boxes and the selection volume. */
export const OCTET_BOX_MARGIN = 0.02;

/**
 * Size and spacing of one dashed group of eight.
 * The selection volume uses this so its box matches a dashed box.
 * Returns null when the grid has no complete 2×2×2 group.
 */
export function dashedGroupMeasure(input: {
  cols: number;
  rows: number;
  layers: number;
  cellX: number;
  cellY: number;
  cellZ: number;
  letterScale: number;
  thickness: number;
  attractorScale?: number;
}) {
  if (input.cols < 2 || input.rows < 2 || input.layers < 2) return null;
  const frame = Math.max(1, input.attractorScale ?? 1);
  const plan = Math.max(input.letterScale, 0.001) * UNIT_LETTER_SPAN;
  const depth = letterDepthSpan(Math.max(input.letterScale, 0.001), input.thickness, false);
  const pad = OCTET_BOX_MARGIN * 2;
  return {
    width: frame * input.cellX + plan + pad,
    height: frame * input.cellY + plan + pad,
    depth: frame * input.cellZ + depth + pad,
    stepX: input.cellX * 2,
    stepY: input.cellY * 2,
    stepZ: input.cellZ * 2,
  };
}

/** Axis-aligned box around each complete group of eight. Leftover edge letters are left out. */
export function octetBoxes(
  members: OctetMember[],
  counts: { cols: number; rows: number; layers: number },
  margin = OCTET_BOX_MARGIN,
): OctetBox[] {
  const groups = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; count: number }>();
  for (const member of members) {
    if (member.col === undefined || member.row === undefined) continue;
    const ox = pairOrigin(member.col, counts.cols);
    const oy = pairOrigin(member.row, counts.rows);
    const oz = pairOrigin(member.layerIndex, counts.layers);
    if (ox === null || oy === null || oz === null) continue;
    const minX = member.x - member.halfX - margin;
    const maxX = member.x + member.halfX + margin;
    const minY = member.y - member.halfY - margin;
    const maxY = member.y + member.halfY + margin;
    const minZ = member.z - member.halfZ - margin;
    const maxZ = member.z + member.halfZ + margin;
    const key = `${ox}:${oy}:${oz}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { minX, maxX, minY, maxY, minZ, maxZ, count: 1 });
      continue;
    }
    group.minX = Math.min(group.minX, minX);
    group.maxX = Math.max(group.maxX, maxX);
    group.minY = Math.min(group.minY, minY);
    group.maxY = Math.max(group.maxY, maxY);
    group.minZ = Math.min(group.minZ, minZ);
    group.maxZ = Math.max(group.maxZ, maxZ);
    group.count += 1;
  }

  const boxes: OctetBox[] = [];
  for (const group of groups.values()) {
    if (group.count < 8) continue;
    boxes.push({
      x: (group.minX + group.maxX) / 2,
      y: (group.minY + group.maxY) / 2,
      z: (group.minZ + group.maxZ) / 2,
      width: group.maxX - group.minX,
      height: group.maxY - group.minY,
      depth: group.maxZ - group.minZ,
    });
  }
  return boxes;
}

/** Pull a letter toward the center of its 2×2×2 group. Edge letters outside a full group of 8 stay put. */
export function pullToOctet(input: {
  col: number; row: number; layer: number;
  cols: number; rows: number; layers: number;
  x: number; y: number; z: number;
  xStep: number; yStep: number; zStep: number;
  xyBlend: number; zBlend: number;
}) {
  const { col, row, layer, cols, rows, layers, x, y, z, xStep, yStep, zStep, xyBlend, zBlend } = input;
  const ox = pairOrigin(col, cols);
  const oy = pairOrigin(row, rows);
  const oz = pairOrigin(layer, layers);
  if (ox === null || oy === null || oz === null) return { x, y, z };
  return {
    x: x + xyBlend * (ox + 0.5 - col) * xStep,
    y: y + xyBlend * (oy + 0.5 - row) * yStep,
    z: z + zBlend * (oz + 0.5 - layer) * zStep,
  };
}

/**
 * Move a letter along the ray from its group center.
 * That ray is 45° in plan, and the same fraction of the way in Z, so the letter heads for the box center.
 * `scale` is relative to the grid position: 1 stays put, 0 meets the center.
 */
export function scaleTowardOctet(input: {
  col: number; row: number; layer: number;
  cols: number; rows: number; layers: number;
  x: number; y: number; z: number;
  xStep: number; yStep: number; zStep: number;
  scale: number;
}) {
  const { col, row, layer, cols, rows, layers, x, y, z, xStep, yStep, zStep, scale } = input;
  if (scale === 1) return { x, y, z };
  const ox = pairOrigin(col, cols);
  const oy = pairOrigin(row, rows);
  const oz = pairOrigin(layer, layers);
  if (ox === null || oy === null || oz === null) return { x, y, z };
  const cx = x + (ox + 0.5 - col) * xStep;
  const cy = y + (oy + 0.5 - row) * yStep;
  const cz = z + (oz + 0.5 - layer) * zStep;
  return {
    x: cx + (x - cx) * scale,
    y: cy + (y - cy) * scale,
    z: cz + (z - cz) * scale,
  };
}

export function zLayerPitch(zGap: number, letterDepth: number) {
  return separatedPitch(zGap, letterDepth);
}

/** Match the extrusion depth plus the 0.01 bevel on each face. */
export function letterDepthSpan(size: number, thickness: number, yRotationEnabled: boolean) {
  return size * (yRotationEnabled ? UNIT_LETTER_SPAN : thickness / 100 + 0.02);
}

/** Pixel layout uses a full font/image box; both preview and fitting share it. */
export function letterPlanLayout(cols: number, rows: number, gap: number, size: number) {
  const pitch = letterCenterPitch(gap, size * UNIT_LETTER_SPAN, XY_GAP_MINIMUM);
  return { pitch, width: (cols - 1) * pitch + size, height: (rows - 1) * pitch + size };
}

export function stableYRotation(id: string, range: number): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  const fraction = (hash >>> 0) / 0xffffffff;
  return Math.round(((fraction * 2 - 1) * range) / 15) * 15;
}

export function letterVolumeLayout(options: VolumeOptions) {
  const worldLetterSize = Math.max(options.letterSize / 50, 0.1);
  const planSpan = worldLetterSize * UNIT_LETTER_SPAN;
  const letterDepth = letterDepthSpan(worldLetterSize, options.thickness, false);
  const worldSpacing = separatedPitch(options.spacing, planSpan);
  const worldZSpacing = separatedPitch(options.zSpacing, letterDepth);
  const xyBlend = attractorBlend(options.spacing);
  const zBlend = attractorBlend(options.zSpacing);
  const diagonalScale = options.attractorGap == null
    ? 1
    : diagonalAttractorScale(options.attractorGap, options.spacing, planSpan);
  // A Y-rotated letter can present its full face width along Z.
  const containedLetterDepth = options.yRotationEnabled ? worldLetterSize : letterDepth;
  const layers = [options.cells, ...options.layerCells];
  const offsetX = ((options.cols - 1) * worldSpacing) / 2;
  const offsetY = ((options.rows - 1) * worldSpacing) / 2;
  const placements = layers.flatMap((layer, layerIndex) =>
    layer.map((cell, index) => {
      const col = index % options.cols;
      const row = Math.floor(index / options.cols);
      const x = col * worldSpacing - offsetX;
      const y = -(row * worldSpacing - offsetY);
      const z = (layerIndex - (layers.length - 1) / 2) * worldZSpacing;
      const steps = {
        col, row, layer: layerIndex,
        cols: options.cols, rows: options.rows, layers: layers.length,
        x, y, z,
        xStep: worldSpacing, yStep: -worldSpacing, zStep: worldZSpacing,
      };
      const pulled = pullToOctet({ ...steps, xyBlend, zBlend });
      const attracted = diagonalScale === 1 ? pulled : scaleTowardOctet({ ...steps, scale: diagonalScale });
      const frame = diagonalScale > 1 ? attracted : pulled;
      return {
        cell,
        layerIndex,
        col,
        row,
        x: attracted.x,
        y: attracted.y,
        z: attracted.z,
        frameX: frame.x,
        frameY: frame.y,
        frameZ: frame.z,
        yRotation: options.yRotationEnabled
          ? stableYRotation(cell.id, options.yRotationRange)
          : 0,
      };
    }),
  );

  return {
    placements,
    worldLetterSize,
    width: (options.cols - 1) * worldSpacing + worldLetterSize,
    height: (options.rows - 1) * worldSpacing + worldLetterSize,
    depth: (layers.length - 1) * worldZSpacing + containedLetterDepth,
  };
}
