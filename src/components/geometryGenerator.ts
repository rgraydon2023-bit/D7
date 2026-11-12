import { DESCRIPTORS, type CompositionPlacement, type DescriptorSettings } from "./compositionEngine";
import { attractorBlend, diagonalAttractorScale, pullToOctet, scaleTowardOctet, UNIT_LETTER_SPAN } from "./letterVolumeLayout";
import type { CandidateFocus, GenerationRules, OrthogonalGrid, SpatialAlternative } from "./optimizerTypes";
import type { Cell } from "./letterTypes";

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function slots(grid: OrthogonalGrid) {
  const offsetX = (grid.xCells - 1) * grid.cellX / 2;
  const offsetY = (grid.yCells - 1) * grid.cellY / 2;
  const offsetZ = (grid.zCells - 1) * grid.cellZ / 2;
  return Array.from({ length: grid.xCells * grid.yCells * grid.zCells }, (_, index) => {
    const xIndex = index % grid.xCells;
    const yIndex = Math.floor(index / grid.xCells) % grid.yCells;
    const zIndex = Math.floor(index / (grid.xCells * grid.yCells));
    return {
      col: xIndex,
      row: yIndex,
      x: xIndex * grid.cellX - offsetX,
      y: offsetY - yIndex * grid.cellY,
      z: zIndex * grid.cellZ - offsetZ,
      layerIndex: zIndex,
    };
  });
}

const effect = (settings: DescriptorSettings, id: keyof DescriptorSettings) => settings[id].intensity / 100;

/** Each descriptor remains an independent geometric operator. */
function descriptorOperations(
  placements: CompositionPlacement[],
  settings: DescriptorSettings,
  focus: CandidateFocus,
  intensity: number,
  random: () => number,
) {
  const letterFactor = focus === "letter" ? 1.2 : focus === "void" ? 0.65 : 1;
  const voidFactor = focus === "void" ? 1.2 : focus === "letter" ? 0.65 : 1;
  const strength = intensity / 100;
  const maxLayer = Math.max(...placements.map((item) => item.layerIndex), 1);
  for (const descriptor of DESCRIPTORS) {
    const amount = effect(settings, descriptor.id) * strength;
    switch (descriptor.id) {
      case "openVolume":
        placements.forEach((item) => {
          const radius = Math.hypot(item.x, item.y) || 1;
          item.x += item.x / radius * amount * 0.35 * voidFactor;
          item.y += item.y / radius * amount * 0.35 * voidFactor;
          item.scale *= 1 - amount * 0.08 * voidFactor;
        });
        break;
      case "convergent":
        placements.forEach((item) => {
          const target = Math.atan2(-item.y, -item.x) * 180 / Math.PI - 90;
          item.rz += target * amount * 0.35;
          item.x *= 1 - amount * 0.06;
          item.y *= 1 - amount * 0.06;
        });
        break;
      case "sculptural":
        placements.forEach((item, index) => {
          item.z += Math.sin(index * 0.71) * amount * 0.3 * letterFactor;
          item.rx += Math.sin(index * 0.43) * amount * 24 * letterFactor;
          item.scale *= 1 + Math.sin(index * 1.31) * amount * 0.12 * letterFactor;
        });
        break;
      case "visuallyConnected":
        placements.forEach((item, index) => {
          const next = placements[(index + 1) % placements.length];
          item.x += (next.x - item.x) * amount * 0.035;
          item.y += (next.y - item.y) * amount * 0.035;
        });
        break;
      case "surreal":
        placements.forEach((item) => {
          item.rx += (random() - 0.5) * amount * 65 * letterFactor;
          item.ry += (random() - 0.5) * amount * 65 * letterFactor;
          item.rz += (random() - 0.5) * amount * 45 * letterFactor;
        });
        break;
      case "monumental":
        placements.forEach((item) => {
          item.scale *= 1 + amount * 0.14 * letterFactor;
          item.z *= 1 + amount * 0.08;
        });
        break;
      case "hierarchical":
        placements.forEach((item) => {
          const centrality = 1 - Math.min(1, Math.hypot(item.x, item.y) / 8);
          item.scale *= 1 + (centrality - 0.35) * amount * 0.32 * letterFactor;
        });
        break;
      case "sequential":
        placements.forEach((item, index) => {
          const t = index / Math.max(placements.length - 1, 1);
          item.x += Math.sin(t * Math.PI * 2) * amount * 0.22;
          item.rz += t * amount * 24;
        });
        break;
      case "circulationActivated":
        placements.forEach((item) => {
          const side = item.x < 0 ? -1 : 1;
          if (Math.abs(item.x) < 0.8) item.x += side * amount * 0.38 * voidFactor;
        });
        break;
      case "centralized":
        placements.forEach((item) => {
          item.x *= 1 - amount * 0.1;
          item.y *= 1 - amount * 0.1;
        });
        break;
      case "verticallyIntegrated":
        placements.forEach((item) => {
          item.x = item.x * (1 - amount * 0.3) + Math.round(item.x * 2) / 2 * amount * 0.3;
          item.y = item.y * (1 - amount * 0.3) + Math.round(item.y * 2) / 2 * amount * 0.3;
          item.ry *= 1 - amount * 0.35;
        });
        break;
      case "luminous":
        placements.forEach((item) => {
          const upper = item.layerIndex / maxLayer;
          item.scale *= 1 - upper * amount * 0.1 * voidFactor;
          item.x *= 1 + upper * amount * 0.06 * voidFactor;
          item.y *= 1 + upper * amount * 0.06 * voidFactor;
        });
        break;
    }
  }
}

function snapRotation(value: number, rules: GenerationRules) {
  const step = Math.max(1, rules.rotationStep);
  return Math.round(value / step) * step;
}

/** Added to each letter's slide rotation. Intensity 100 allows ±90°. */
function zRotationLimit(intensity: number) {
  return 90 * Math.max(0, Math.min(100, intensity)) / 100;
}

function clampZRotation(base: number, value: number, maxOffset: number, step: number) {
  const safeStep = Math.max(1, step);
  const delta = Math.max(-maxOffset, Math.min(maxOffset, value - base));
  let snapped = Math.round(delta / safeStep) * safeStep;
  if (Math.abs(snapped) > maxOffset) snapped = Math.sign(snapped) * Math.floor(maxOffset / safeStep) * safeStep;
  return base + snapped;
}

export function generateSpatialCandidate(args: {
  sourceCells: Cell[];
  grid: OrthogonalGrid;
  rules: GenerationRules;
  descriptors: DescriptorSettings;
  focus: CandidateFocus;
  seed: number;
  intensity: number;
  parent?: SpatialAlternative | null;
  preservePercent?: number;
}) {
  const { sourceCells, grid, rules, descriptors, focus, seed, intensity, parent } = args;
  const random = seededRandom(seed);
  const maxZOffset = zRotationLimit(intensity);
  const availableSlots = rules.allowReposition && !rules.lockExistingLocations ? shuffled(slots(grid), random) : slots(grid);
  let targetCount = Math.min(sourceCells.length, availableSlots.length);
  if (rules.allowRepeat) targetCount = availableSlots.length;
  if (rules.allowRemove) targetCount = Math.max(1, Math.round(targetCount * (0.86 + random() * 0.14)));
  const baseScale = Math.max(rules.minimumLetterSize, rules.maximumLetterSize);
  const placements: CompositionPlacement[] = [];
  for (let index = 0; index < targetCount; index++) {
    const slot = availableSlots[index];
    const sourceIndex = rules.allowRepeat ? Math.floor(random() * sourceCells.length) : index % sourceCells.length;
    const cell = sourceCells[sourceIndex];
    const jitter = rules.allowReposition && !rules.lockExistingLocations ? intensity / 100 * 0.12 : 0;
    const xyBlend = attractorBlend(rules.xyGap ?? 56);
    const zBlend = attractorBlend(rules.zGap ?? 56);
    const diagonalScale = rules.attractorGap == null
      ? 1
      : diagonalAttractorScale(rules.attractorGap, rules.xyGap ?? 56, baseScale * UNIT_LETTER_SPAN);
    const steps = {
      col: slot.col, row: slot.row, layer: slot.layerIndex,
      cols: grid.xCells, rows: grid.yCells, layers: grid.zCells,
      x: slot.x, y: slot.y, z: slot.z,
      xStep: grid.cellX, yStep: -grid.cellY, zStep: grid.cellZ,
    };
    const pulled = pullToOctet({ ...steps, xyBlend, zBlend });
    const attracted = diagonalScale === 1 ? pulled : scaleTowardOctet({ ...steps, scale: diagonalScale });
    placements.push({
      cell: { ...cell, id: `${cell.id}-candidate-${index}` },
      sourceIndex,
      layerIndex: slot.layerIndex,
      col: slot.col,
      row: slot.row,
      x: attracted.x + (random() - 0.5) * grid.cellX * jitter,
      y: attracted.y + (random() - 0.5) * grid.cellY * jitter,
      z: attracted.z + (random() - 0.5) * grid.cellZ * jitter,
      rx: rules.allowRotationX ? snapRotation((random() - 0.5) * 120 * intensity / 100, rules) : 0,
      ry: rules.allowRotationY ? snapRotation((random() - 0.5) * 2 * (rules.maximumRotationY ?? 90) * intensity / 100, rules) : 0,
      rz: rules.allowRotationZ ? clampZRotation(cell.rotation, cell.rotation + (random() - 0.5) * 2 * maxZOffset, maxZOffset, rules.rotationStep) : cell.rotation,
      scale: baseScale,
      scaleX: 1,
      scaleY: rules.preserveProportions ? 1 : 0.82 + random() * 0.36,
      scaleZ: rules.preserveProportions ? 1 : 0.82 + random() * 0.36,
    });
  }

  const fixedPositions = placements.map(({ x, y, z }) => ({ x, y, z }));
  const fixedGeometry = placements.map(({ scale, scaleX, scaleY, scaleZ }) => ({ scale, scaleX, scaleY, scaleZ }));
  if (rules.allowGeometryModification || rules.allowReposition) descriptorOperations(placements, descriptors, focus, intensity, random);
  if (!rules.allowReposition || rules.lockExistingLocations) placements.forEach((placement, index) => {
    placement.x = fixedPositions[index].x;
    placement.y = fixedPositions[index].y;
    placement.z = fixedPositions[index].z;
  });
  if (!rules.allowGeometryModification) placements.forEach((placement, index) => {
    placement.scale = fixedGeometry[index].scale;
    placement.scaleX = fixedGeometry[index].scaleX;
    placement.scaleY = fixedGeometry[index].scaleY;
    placement.scaleZ = fixedGeometry[index].scaleZ;
  });
  const preserveCount = parent ? Math.floor(Math.min(parent.placements.length, placements.length) * (args.preservePercent ?? 0) / 100) : 0;
  for (let index = 0; index < preserveCount; index++) placements[index] = structuredClone(parent!.placements[index]);

  placements.forEach((placement) => {
    placement.scale = Math.max(rules.minimumLetterSize, Math.min(rules.maximumLetterSize, placement.scale));
    if (!rules.allowRotationX) placement.rx = 0;
    if (!rules.allowRotationY) placement.ry = 0;
    else placement.ry = Math.max(-(rules.maximumRotationY ?? 90), Math.min(rules.maximumRotationY ?? 90, placement.ry));
    if (!rules.allowRotationZ) placement.rz = placement.cell.rotation;
    else placement.rz = clampZRotation(placement.cell.rotation, placement.rz, maxZOffset, rules.rotationStep);
    placement.rx = snapRotation(placement.rx, rules);
    placement.ry = snapRotation(placement.ry, rules);
    if (rules.preserveProportions) placement.scaleX = placement.scaleY = placement.scaleZ = 1;
  });
  return placements;
}
