import type { Cell } from "./letterTypes";

export type VolumeOptions = {
  cells: Cell[];
  layerCells: Cell[][];
  cols: number;
  rows: number;
  spacing: number;
  zSpacing: number;
  letterSize: number;
  thickness: number;
  yRotationEnabled: boolean;
  yRotationRange: number;
  /** Optional inward offset applied to a containing volume, not letter placement. */
  boxInset?: number;
};

export function stableYRotation(id: string, range: number): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  const fraction = (hash >>> 0) / 0xffffffff;
  return Math.round(((fraction * 2 - 1) * range) / 15) * 15;
}

export function letterVolumeLayout(options: VolumeOptions) {
  const worldSpacing = Math.max(options.spacing / 50, 0.12);
  const worldLetterSize = Math.max(options.letterSize / 50, 0.1);
  const worldZSpacing = options.zSpacing / 50;
  const letterDepth = worldLetterSize * (options.thickness / 100 + 0.04);
  // A Y-rotated letter can present its full face width along Z.
  const containedLetterDepth = options.yRotationEnabled ? worldLetterSize : letterDepth;
  const layers = [options.cells, ...options.layerCells];
  const offsetX = ((options.cols - 1) * worldSpacing) / 2;
  const offsetY = ((options.rows - 1) * worldSpacing) / 2;
  const placements = layers.flatMap((layer, layerIndex) =>
    layer.map((cell, index) => ({
      cell,
      layerIndex,
      col: index % options.cols,
      row: Math.floor(index / options.cols),
      x: (index % options.cols) * worldSpacing - offsetX,
      y: -(Math.floor(index / options.cols) * worldSpacing - offsetY),
      z: (layerIndex - (layers.length - 1) / 2) * worldZSpacing,
      yRotation: options.yRotationEnabled
        ? stableYRotation(cell.id, options.yRotationRange)
        : 0,
    })),
  );

  return {
    placements,
    worldLetterSize,
    width: (options.cols - 1) * worldSpacing + worldLetterSize,
    height: (options.rows - 1) * worldSpacing + worldLetterSize,
    depth: (layers.length - 1) * worldZSpacing + containedLetterDepth,
  };
}
