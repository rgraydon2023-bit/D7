import { slotById } from "./slots";
import {
  computeDistributionReport,
  DEFAULT_DISTRIBUTION_PREFS,
  farthestPointSeeds,
  occupancyFromAt,
  resolveClusterPolicy,
  scorePlacementDistribution,
  type DistributionPrefs,
} from "./distribution";
import type {
  Assembly,
  ConnectionReport,
  Direction,
  Grade,
  LatticeField,
  Placement,
  PlacementNote,
  PlacedTile,
  ScoreParts,
  SearchStats,
  TileModel,
  TileVariant,
} from "./types";
import { DEFAULT_LATTICE_FIELD, DIRECTIONS, LATTICE_FEET, oppositeDirection, packCell, placementWorldZ, shiftPacked, unpackCell, variantIndex } from "./types";

type Attachment = {
  from: number;
  to: number;
  fromVariant: number;
  toVariant: number;
  direction: Direction;
  dix: number;
  diy: number;
  diz: number;
  preview: number;
};

type Hooks = {
  cancelled: () => boolean;
  onProgress: (message: string, percent?: number) => void;
};

function optionHooks(hooks: Hooks, optionIndex: number, label: string): Hooks {
  const span = 100 / 3;
  const start = optionIndex * span;
  return {
    cancelled: hooks.cancelled,
    onProgress: (message, local = 0) => {
      const percent = Math.min(99, Math.round(start + (Math.max(0, Math.min(100, local)) / 100) * span));
      hooks.onProgress(`${label} · ${message}`, percent);
    },
  };
}

const NEIGHBORS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function gradeContinuity(pairs: number, possible: number): Grade {
  if (pairs >= 4 && (possible <= 0 || pairs / possible >= 0.2)) return "PASS";
  if (pairs >= 1) return "REVIEW";
  return "FAIL";
}

function gradeCollision(overlap: number, smaller: number): Grade {
  const ratio = overlap / Math.max(1, smaller);
  if (overlap === 0 || ratio <= 0.05) return "PASS";
  if (ratio <= 0.2) return "REVIEW";
  return "FAIL";
}

function gradeInterlock(connection: Pick<ConnectionReport, "floor" | "void" | "circulation" | "collision">, adjacent: number): Grade {
  if (adjacent === 0) return "FAIL";
  const strong = [connection.floor, connection.void, connection.circulation].filter((grade) => grade === "PASS").length;
  const soft = [connection.floor, connection.void, connection.circulation].filter((grade) => grade !== "FAIL").length;
  if (connection.collision === "FAIL" && strong === 0) return "FAIL";
  if (strong >= 1 && connection.collision !== "FAIL") return "PASS";
  if (strong >= 1) return "REVIEW";
  if (soft >= 1 && connection.collision !== "FAIL") return "REVIEW";
  return "FAIL";
}

function latticeStep(cellFeet: number) {
  return Math.round(LATTICE_FEET / cellFeet);
}

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function worldShift(ix: number, iy: number, iz: number, cellFeet: number, zLift = 0) {
  const step = latticeStep(cellFeet);
  const oz = iz * step + Math.round(zLift / cellFeet);
  return [ix * step, iy * step, oz] as const;
}

function shiftedSet(cells: number[], ox: number, oy: number, oz: number) {
  const set = new Set<number>();
  for (const cell of cells) set.add(shiftPacked(cell, ox, oy, oz));
  return set;
}

export function describeTransform(model: TileModel, placement: { rotation: TileVariant["rotation"]; mirror: TileVariant["mirror"]; ix: number; iy: number; iz: number; zLift?: number }) {
  const mirror = placement.mirror === "none" ? "no mirror" : placement.mirror === "x" ? "mirror X" : "mirror Y";
  const lift = placement.zLift ? ` +${placement.zLift.toFixed(1)}'` : "";
  return `${placement.rotation}° / ${mirror} / lattice ${placement.ix}, ${placement.iy}, ${placement.iz}${lift}`;
}

function labelFor(model: TileModel) {
  const slot = slotById(model.slotId);
  return slot ? `${slot.code} ${slot.name}` : model.filename;
}

function dominantDirection(dix: number, diy: number, diz: number): Direction | "none" {
  const ax = Math.abs(dix);
  const ay = Math.abs(diy);
  const az = Math.abs(diz);
  const largest = Math.max(ax, ay, az);
  if (largest === 0) return "none";
  if (ax === largest) return dix >= 0 ? "+X" : "-X";
  if (ay === largest) return diy >= 0 ? "+Y" : "-Y";
  return diz >= 0 ? "+Z" : "-Z";
}

type WorldTile = {
  tile: PlacedTile;
  model: TileModel;
  variant: TileVariant;
  occupied: Set<number>;
  floor: Set<number>;
  passage: Set<number>;
  voidCells: Set<number>;
  vertical: Set<number>;
};

export function evaluateAssembly(models: TileModel[], placed: PlacedTile[]): { connections: ConnectionReport[]; parts: ScoreParts; components: number; score: number } {
  const cellFeet = models[0]?.cellFeet ?? 2;
  const byId = new Map(models.map((model, index) => [model.id, index]));
  const resolve = (tileId: string) => {
    const direct = byId.get(tileId);
    if (direct !== undefined) return models[direct];
    const source = byId.get(sourceIdOf(tileId));
    return source === undefined ? undefined : models[source];
  };
  const worlds: WorldTile[] = [];
  for (const tile of placed) {
    const model = resolve(tile.id);
    const variant = model?.variants[tile.variant];
    if (!model || !variant) continue;
    const [ox, oy, oz] = worldShift(tile.ix, tile.iy, tile.iz, cellFeet, tile.zLift ?? 0);
    worlds.push({
      tile: { ...tile, zLift: tile.zLift ?? 0 },
      model,
      variant,
      occupied: shiftedSet(variant.occupied, ox, oy, oz),
      floor: shiftedSet(variant.floor, ox, oy, oz),
      passage: shiftedSet(variant.passage, ox, oy, oz),
      voidCells: shiftedSet(variant.voidCells, ox, oy, oz),
      vertical: shiftedSet(variant.vertical, ox, oy, oz),
    });
  }
  const connections: ConnectionReport[] = [];
  let floorPass = 0;
  let voidPass = 0;
  let circPass = 0;
  let interlockPass = 0;
  let collisionPenalty = 0;
  const consider = (left: WorldTile, right: WorldTile) => {
    const dir = dominantDirection(
      right.tile.ix - left.tile.ix,
      right.tile.iy - left.tile.iy,
      (placementWorldZ(right.tile) - placementWorldZ(left.tile)) / LATTICE_FEET,
    );
    const edgeBoost = dir === "none" ? 0 : previewFaces(left.variant, right.variant, dir, 0, 0) * 0.04;
    const scored = scoreVoxelAdjacency(
      { occupied: left.occupied, floor: left.floor, passage: left.passage, voidCells: left.voidCells, vertical: left.vertical },
      { occupied: right.occupied, floor: right.floor, passage: right.passage, voidCells: right.voidCells, vertical: right.vertical },
      edgeBoost,
    );
    const floorPairs = countTouch(left.floor, right.floor);
    const voidPairs = countTouch(left.voidCells, right.voidCells);
    const passagePairs = countTouch(left.passage, right.passage);
    let overlap = 0;
    const smaller = Math.min(left.occupied.size, right.occupied.size);
    for (const cell of left.occupied) if (right.occupied.has(cell)) overlap += 1;
    const touch = countTouch(left.occupied, right.occupied);
    const floor = gradeContinuity(floorPairs, Math.min(left.floor.size, right.floor.size));
    const voidGrade = gradeContinuity(voidPairs, Math.min(left.voidCells.size, right.voidCells.size));
    const circulation = gradeContinuity(passagePairs, Math.min(left.passage.size, right.passage.size));
    const collision = gradeCollision(overlap, smaller);
    const interlock = gradeInterlock({ floor, void: voidGrade, circulation, collision }, touch);
    if (touch === 0 && overlap === 0 && scored.total <= 0) return;
    if (floor === "PASS") floorPass += 1;
    if (voidGrade === "PASS") voidPass += 1;
    if (circulation === "PASS") circPass += 1;
    if (interlock === "PASS") interlockPass += 1;
    if (collision === "FAIL") collisionPenalty += 3;
    else if (collision === "REVIEW") collisionPenalty += 1;
    connections.push({
      tileA: left.tile.id,
      tileB: right.tile.id,
      labelA: labelFor(left.model),
      labelB: labelFor(right.model),
      transformA: describeTransform(left.model, { ...left.variant, ix: left.tile.ix, iy: left.tile.iy, iz: left.tile.iz, zLift: left.tile.zLift }),
      transformB: describeTransform(right.model, { ...right.variant, ix: right.tile.ix, iy: right.tile.iy, iz: right.tile.iz, zLift: right.tile.zLift }),
      direction: dir,
      floor,
      void: voidGrade,
      circulation,
      collision,
      interlock,
      scores: {
        floor: scored.floor,
        void: scored.void,
        circulation: scored.circulation,
        complementary: scored.complementary,
        collision: scored.collision,
        total: scored.total,
      },
      reason: scored.reason,
    });
  };
  if (worlds.length > 24) {
    const byCell = new Map<string, number>();
    worlds.forEach((world, index) => byCell.set(`${world.tile.ix},${world.tile.iy},${world.tile.iz}`, index));
    for (const left of worlds) {
      for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
        const other = byCell.get(`${left.tile.ix + dx},${left.tile.iy + dy},${left.tile.iz + dz}`);
        if (other === undefined) continue;
        consider(left, worlds[other]);
      }
    }
  } else {
    for (let a = 0; a < worlds.length; a += 1) {
      for (let b = a + 1; b < worlds.length; b += 1) consider(worlds[a], worlds[b]);
    }
  }

  const parent = worlds.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const indexOf = new Map(worlds.map((world, index) => [world.tile.id, index]));
  for (const connection of connections) {
    if (connection.interlock === "FAIL") continue;
    const a = indexOf.get(connection.tileA);
    const b = indexOf.get(connection.tileB);
    if (a === undefined || b === undefined) continue;
    parent[find(a)] = find(b);
  }
  const components = new Set(parent.map((_, index) => find(index))).size || (worlds.length ? worlds.length : 0);
  const xs = placed.map((tile) => tile.ix);
  const ys = placed.map((tile) => tile.iy);
  const zs = placed.map((tile) => tile.iz);
  const spanX = placed.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const spanY = placed.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const spanZ = placed.length ? Math.max(...zs) - Math.min(...zs) : 0;
  const plan = Math.max(1, spanX + spanY + 1);
  const parts: ScoreParts = {
    interlock: interlockPass,
    circulation: circPass,
    floor: floorPass,
    void: voidPass,
    collision: collisionPenalty,
    connectivity: Math.max(0, placed.length - components),
    richness: new Set(zs).size + new Set(connections.map((connection) => connection.direction)).size,
    compact: 1 / plan,
    vertical: spanZ,
  };
  const score =
    parts.interlock * 5 +
    parts.circulation * 4 +
    parts.floor * 3 +
    parts.void * 3 +
    parts.connectivity * 3 +
    parts.richness +
    parts.compact * 2 +
    parts.vertical * 0.5 -
    parts.collision * 6;
  return { connections, parts, components, score };
}

function previewFaces(a: TileVariant, b: TileVariant, direction: Direction, shiftU: number, shiftV: number) {
  const left = a.faces[direction];
  const right = b.faces[oppositeDirection(direction)];
  let score = 0;
  for (const [key, sample] of left.cells) {
    const [u, v] = key.split(":").map(Number);
    const other = right.cells.get(`${u + shiftU}:${v + shiftV}`);
    if (!other) continue;
    score += Math.min(sample.floor, other.floor) * 8;
    score += Math.min(sample.passage, other.passage) * 8;
    score += Math.min(sample.void, other.void) * 6;
    score += sample.occupied * other.pocket * 7;
    score += sample.pocket * other.occupied * 7;
    if (sample.occupied && other.occupied && sample.passage === 0 && other.passage === 0 && sample.floor === 0 && other.floor === 0) score -= 4;
  }
  score += Math.min(left.projection, right.recess) * 0.35;
  score += Math.min(right.projection, left.recess) * 0.35;
  return score;
}

type VoxelWorld = {
  occupied: Set<number>;
  floor: Set<number>;
  passage: Set<number>;
  voidCells: Set<number>;
  vertical: Set<number>;
};

type AdjacencyScore = {
  floor: number;
  void: number;
  circulation: number;
  complementary: number;
  collision: number;
  edge: number;
  total: number;
  reason: string;
};

const WEIGHTS = {
  floor: 8,
  circulation: 8,
  complementary: 7,
  void: 6,
  collision: 20,
  edge: 3,
  variety: 1.5,
};

function countTouch(source: Set<number>, target: Set<number>) {
  let count = 0;
  for (const packed of source) {
    const [x, y, z] = unpackCell(packed);
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (target.has(packCell(x + dx, y + dy, z + dz))) count += 1;
    }
  }
  return count;
}

function worldOf(model: TileModel, variantIndex: number, ix: number, iy: number, iz: number, cellFeet: number): VoxelWorld {
  const variant = model.variants[variantIndex];
  const [ox, oy, oz] = worldShift(ix, iy, iz, cellFeet);
  return {
    occupied: shiftedSet(variant.occupied, ox, oy, oz),
    floor: shiftedSet(variant.floor, ox, oy, oz),
    passage: shiftedSet(variant.passage, ox, oy, oz),
    voidCells: shiftedSet(variant.voidCells, ox, oy, oz),
    vertical: shiftedSet(variant.vertical, ox, oy, oz),
  };
}

function scoreVoxelAdjacency(host: VoxelWorld, guest: VoxelWorld, edgeBoost = 0): AdjacencyScore {
  let overlap = 0;
  const smaller = Math.min(host.occupied.size, guest.occupied.size);
  for (const cell of guest.occupied) if (host.occupied.has(cell)) overlap += 1;
  const floorPairs = countTouch(host.floor, guest.floor);
  const voidPairs = countTouch(host.voidCells, guest.voidCells);
  const circPairs = countTouch(host.passage, guest.passage);
  const massVoid = countTouch(host.occupied, guest.voidCells) + countTouch(guest.occupied, host.voidCells);
  const enclosure = countTouch(host.vertical, guest.voidCells) + countTouch(guest.vertical, host.voidCells) + countTouch(host.vertical, guest.passage) + countTouch(guest.vertical, host.passage);
  const collisionRatio = overlap / Math.max(1, smaller);
  const floor = floorPairs * WEIGHTS.floor;
  const voidScore = voidPairs * WEIGHTS.void;
  const circulation = circPairs * WEIGHTS.circulation;
  const complementary = massVoid * 0.35 * WEIGHTS.complementary + enclosure * 0.15 * WEIGHTS.complementary;
  const collision = collisionRatio > 0.18 ? -collisionRatio * WEIGHTS.collision * 10 : collisionRatio > 0.08 ? -collisionRatio * 6 : collisionRatio > 0.03 ? -collisionRatio * 2 : 0;
  const edge = edgeBoost * WEIGHTS.edge;
  const total = floor + voidScore + circulation + complementary + collision + edge;
  const parts = [
    { label: "floor continuity", value: floor },
    { label: "circulation continuity", value: circulation },
    { label: "void continuity", value: voidScore },
    { label: "complementary mass/void", value: complementary },
    { label: "edge compatibility", value: edge },
    { label: "collision penalty", value: collision },
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const reason = parts
    .filter((part) => Math.abs(part.value) > 0.01)
    .slice(0, 3)
    .map((part) => `${part.label} ${part.value >= 0 ? "+" : ""}${part.value.toFixed(1)}`)
    .join("; ") || "weak interface";
  return { floor, void: voidScore, circulation, complementary, collision, edge, total, reason };
}

function axisDelta(aOuter: number, bOuter: number, step: number) {
  const raw = (aOuter + 1 - bOuter) / step;
  let best = Math.round(raw);
  let bestScore = Infinity;
  for (const delta of [Math.floor(raw) - 1, Math.round(raw), Math.ceil(raw) + 1]) {
    const gap = delta * step + bOuter - aOuter;
    const score = gap < 0 ? 2 + Math.abs(gap) : Math.abs(gap - 1);
    if (score < bestScore) {
      bestScore = score;
      best = delta;
    }
  }
  return best;
}

function snappedDelta(a: TileVariant, b: TileVariant, direction: Direction, extraU: number, extraV: number, step: number) {
  if (direction === "+X") return { dix: axisDelta(a.bounds.maxX, b.bounds.minX, step), diy: extraU, diz: extraV };
  if (direction === "-X") return { dix: -axisDelta(-a.bounds.minX, -b.bounds.maxX, step), diy: extraU, diz: extraV };
  if (direction === "+Y") return { diy: axisDelta(a.bounds.maxY, b.bounds.minY, step), dix: extraU, diz: extraV };
  if (direction === "-Y") return { diy: -axisDelta(-a.bounds.minY, -b.bounds.maxY, step), dix: extraU, diz: extraV };
  if (direction === "+Z") return { diz: axisDelta(a.bounds.maxZ, b.bounds.minZ, step), dix: extraU, diy: extraV };
  return { diz: -axisDelta(-a.bounds.minZ, -b.bounds.maxZ, step), dix: extraU, diy: extraV };
}

function faceShift(direction: Direction, delta: { dix: number; diy: number; diz: number }, step: number): [number, number] {
  if (direction.endsWith("X")) return [-delta.diy * step, -delta.diz * step];
  if (direction.endsWith("Y")) return [-delta.dix * step, -delta.diz * step];
  return [-delta.dix * step, -delta.diy * step];
}

function preferredShift(direction: Direction, a: TileVariant, b: TileVariant, step: number): [number, number] {
  const left = a.faces[direction];
  const right = b.faces[oppositeDirection(direction)];
  let lu = 0;
  let lv = 0;
  let ru = 0;
  let rv = 0;
  let ln = 0;
  let rn = 0;
  for (const [key, sample] of left.cells) {
    if (sample.floor + sample.passage + sample.void <= 0) continue;
    const [u, v] = key.split(":").map(Number);
    lu += u;
    lv += v;
    ln += 1;
  }
  for (const [key, sample] of right.cells) {
    if (sample.floor + sample.passage + sample.void <= 0) continue;
    const [u, v] = key.split(":").map(Number);
    ru += u;
    rv += v;
    rn += 1;
  }
  if (!ln || !rn) return [0, 0];
  const clamp = (value: number) => Math.max(-1, Math.min(1, Math.round(value / step)));
  return [clamp(lu / ln - ru / rn), clamp(lv / ln - rv / rn)];
}

async function rankAttachments(models: TileModel[], hooks: Hooks) {
  const step = latticeStep(models[0]?.cellFeet ?? 2);
  const attachments: Attachment[] = [];
  let comparisons = 0;
  for (let from = 0; from < models.length; from += 1) {
    for (let to = 0; to < models.length; to += 1) {
      if (from === to) continue;
      const pools = new Map<number, Attachment[]>();
      for (let fromVariant = 0; fromVariant < models[from].variants.length; fromVariant += 1) {
        const fromPose = models[from].variants[fromVariant];
        for (let toVariant = 0; toVariant < models[to].variants.length; toVariant += 1) {
          const toPose = models[to].variants[toVariant];
          for (const direction of DIRECTIONS) {
            if (fromPose.faces[direction].cells.size === 0 || toPose.faces[oppositeDirection(direction)].cells.size === 0) continue;
            comparisons += 1;
            const [extraU, extraV] = preferredShift(direction, fromPose, toPose, step);
            const delta = snappedDelta(fromPose, toPose, direction, extraU, extraV, step);
            const [shiftU, shiftV] = faceShift(direction, delta, step);
            const preview = previewFaces(fromPose, toPose, direction, shiftU, shiftV);
            if (preview <= 0) continue;
            const pool = pools.get(fromVariant) ?? [];
            pool.push({ from, to, fromVariant, toVariant, direction, ...delta, preview });
            pools.set(fromVariant, pool);
          }
        }
        const pool = pools.get(fromVariant) ?? [];
        pool.sort((left, right) => right.preview - left.preview);
        const viable: Attachment[] = [];
        for (const item of pool.slice(0, 12)) {
          const host: PlacedTile = { id: models[from].id, variant: item.fromVariant, ix: 0, iy: 0, iz: 0 };
          const next: PlacedTile = { id: models[to].id, variant: item.toVariant, ix: item.dix, iy: item.diy, iz: item.diz };
          const check = occupancyOverlap(models, [host], next);
          comparisons += 1;
          if (check.overlap / Math.max(1, check.count) > 0.12 || check.gap > 1) continue;
          viable.push(item);
          if (viable.length === 2) break;
        }
        attachments.push(...viable);
      }
    }
    hooks.onProgress(`Pairwise interfaces ${from + 1} / ${models.length}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (hooks.cancelled()) throw new Error("cancelled");
  }
  attachments.sort((left, right) => right.preview - left.preview);
  return { attachments, comparisons };
}

type BeamState = { tiles: PlacedTile[]; score: number };

function worldBounds(variant: TileVariant, ix: number, iy: number, iz: number, cellFeet: number, zLift = 0) {
  const [ox, oy, oz] = worldShift(ix, iy, iz, cellFeet, zLift);
  return {
    minX: ox + variant.bounds.minX, maxX: ox + variant.bounds.maxX,
    minY: oy + variant.bounds.minY, maxY: oy + variant.bounds.maxY,
    minZ: oz + variant.bounds.minZ, maxZ: oz + variant.bounds.maxZ,
  };
}

function occupancySpan(models: TileModel[], tiles: PlacedTile[]) {
  const cellFeet = models[0]?.cellFeet ?? 2;
  const byId = new Map(models.map((model) => [model.id, model]));
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    const variant = byId.get(tile.id)?.variants[tile.variant];
    if (!variant) continue;
    const bounds = worldBounds(variant, tile.ix, tile.iy, tile.iz, cellFeet);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    minZ = Math.min(minZ, bounds.minZ);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ, cellFeet };
}

function fieldOverflow(models: TileModel[], tiles: PlacedTile[], field: LatticeField) {
  const span = occupancySpan(models, tiles);
  if (!span) return 0;
  const step = latticeStep(span.cellFeet);
  const extra = (min: number, max: number, cells: number) => Math.max(0, Math.ceil((max - min + 1) / step) - cells);
  return extra(span.minX, span.maxX, field.cellsX) + extra(span.minY, span.maxY, field.cellsY) + extra(span.minZ, span.maxZ, field.cellsZ);
}

function seatInField(models: TileModel[], tiles: PlacedTile[], lockedIds: Set<string>) {
  if (!tiles.length || tiles.some((tile) => lockedIds.has(tile.id))) return tiles;
  const span = occupancySpan(models, tiles);
  if (!span) return tiles;
  const step = latticeStep(span.cellFeet);
  const shift = (min: number) => -Math.floor(min / step);
  const dx = shift(span.minX);
  const dy = shift(span.minY);
  const dz = shift(span.minZ);
  return tiles.map((tile) => ({ ...tile, ix: tile.ix + dx, iy: tile.iy + dy, iz: tile.iz + dz }));
}

function separatedGap(left: ReturnType<typeof worldBounds>, right: ReturnType<typeof worldBounds>) {
  const gx = left.minX > right.maxX + 1 ? left.minX - right.maxX : right.minX > left.maxX + 1 ? right.minX - left.maxX : 0;
  const gy = left.minY > right.maxY + 1 ? left.minY - right.maxY : right.minY > left.maxY + 1 ? right.minY - left.maxY : 0;
  const gz = left.minZ > right.maxZ + 1 ? left.minZ - right.maxZ : right.minZ > left.maxZ + 1 ? right.minZ - left.maxZ : 0;
  return Math.max(gx, gy, gz);
}

function occupancyOverlap(models: TileModel[], tiles: PlacedTile[], next: PlacedTile) {
  const cellFeet = models[0].cellFeet;
  const byId = new Map(models.map((model) => [model.id, model]));
  const occupied = new Set<number>();
  let gap = Infinity;
  const nextVariant = byId.get(next.id)!.variants[next.variant];
  const nextBounds = worldBounds(nextVariant, next.ix, next.iy, next.iz, cellFeet, next.zLift ?? 0);
  for (const tile of tiles) {
    const variant = byId.get(tile.id)!.variants[tile.variant];
    gap = Math.min(gap, separatedGap(worldBounds(variant, tile.ix, tile.iy, tile.iz, cellFeet, tile.zLift ?? 0), nextBounds));
    const [ox, oy, oz] = worldShift(tile.ix, tile.iy, tile.iz, cellFeet, tile.zLift ?? 0);
    for (const cell of variant.occupied) occupied.add(shiftPacked(cell, ox, oy, oz));
  }
  const [ox, oy, oz] = worldShift(next.ix, next.iy, next.iz, cellFeet, next.zLift ?? 0);
  let overlap = 0;
  for (const cell of nextVariant.occupied) if (occupied.has(shiftPacked(cell, ox, oy, oz))) overlap += 1;
  return { overlap, gap: Number.isFinite(gap) ? gap : 99, count: nextVariant.occupied.length };
}

async function beamSearch(models: TileModel[], attachments: Attachment[], mode: Assembly["id"], locked: PlacedTile[], field: LatticeField, hooks: Hooks) {
  const lockedIds = new Set(locked.map((tile) => tile.id));
  const free = models.map((model) => model.id).filter((id) => !lockedIds.has(id));
  let tested = 0;
  const seeds: BeamState[] = [];
  if (locked.length) seeds.push({ tiles: locked.map((tile) => ({ ...tile })), score: 0 });
  const pairSeeds = attachments.filter((attachment) => !lockedIds.has(models[attachment.from].id) && !lockedIds.has(models[attachment.to].id));
  const sortedSeeds = [...pairSeeds].sort((a, b) => {
    if (mode === "C") return Number(b.direction.endsWith("Z")) - Number(a.direction.endsWith("Z")) || b.preview - a.preview;
    if (mode === "B") return Math.abs(a.dix) + Math.abs(a.diy) + Math.abs(a.diz) - (Math.abs(b.dix) + Math.abs(b.diy) + Math.abs(b.diz)) || b.preview - a.preview;
    return b.preview - a.preview;
  });
  let scannedSeeds = 0;
  for (const attachment of sortedSeeds) {
    if (seeds.length >= 4 || scannedSeeds >= 48) break;
    scannedSeeds += 1;
    const from = models[attachment.from];
    const to = models[attachment.to];
    const tiles: PlacedTile[] = [
      ...locked,
      { id: from.id, variant: attachment.fromVariant, ix: 0, iy: 0, iz: 0 },
      { id: to.id, variant: attachment.toVariant, ix: attachment.dix, iy: attachment.diy, iz: attachment.diz },
    ];
    const check = occupancyOverlap(models, tiles.slice(0, -1), tiles[tiles.length - 1]);
    tested += 1;
    if (check.overlap / Math.max(1, check.count) > 0.12 || check.gap > 1) continue;
    const vertical = Math.abs(attachment.diz);
    const compact = 1 / Math.max(1, Math.abs(attachment.dix) + Math.abs(attachment.diy) + 1);
    const modeBonus = mode === "C" ? vertical * 4 : mode === "B" ? compact * 8 : compact * 2 + vertical * 0.5;
    seeds.push({ tiles, score: attachment.preview + modeBonus - check.overlap * 4 - fieldOverflow(models, tiles, field) * 40 });
  }
  if (!seeds.length && models.length) {
    seeds.push({ tiles: [...locked, { id: models[0].id, variant: 0, ix: 0, iy: 0, iz: 0 }], score: 0 });
  }
  let beam = seeds.slice(0, 4);
  const remainingStart = free.filter((id) => !beam[0]?.tiles.some((tile) => tile.id === id));
  for (let step = 0; step < remainingStart.length; step += 1) {
    const nextBeam: BeamState[] = [];
    for (const state of beam) {
      const used = new Set(state.tiles.map((tile) => tile.id));
      const unused = models.map((model, index) => ({ model, index })).filter(({ model }) => !used.has(model.id) && !lockedIds.has(model.id));
      for (const candidate of unused) {
        const options = attachments.filter((attachment) => attachment.to === candidate.index && used.has(models[attachment.from].id) && state.tiles.some((tile) => tile.id === models[attachment.from].id && tile.variant === attachment.fromVariant));
        for (const attachment of options.slice(0, 8)) {
          const host = state.tiles.find((tile) => tile.id === models[attachment.from].id && tile.variant === attachment.fromVariant);
          if (!host) continue;
          const next: PlacedTile = {
            id: candidate.model.id,
            variant: attachment.toVariant,
            ix: host.ix + attachment.dix,
            iy: host.iy + attachment.diy,
            iz: host.iz + attachment.diz,
          };
          if (state.tiles.some((tile) => tile.ix === next.ix && tile.iy === next.iy && tile.iz === next.iz)) continue;
          const check = occupancyOverlap(models, state.tiles, next);
          tested += 1;
          if (check.overlap / Math.max(1, check.count) > 0.12 || check.gap > 1) continue;
          const placed = [...state.tiles, next];
          const vertical = Math.abs(next.iz - host.iz);
          const compact = 1 / Math.max(1, Math.abs(next.ix - host.ix) + Math.abs(next.iy - host.iy) + 1);
          const modeBonus = mode === "C" ? vertical * 4 : mode === "B" ? compact * 8 : compact * 2 + vertical * 0.5;
          nextBeam.push({ tiles: placed, score: state.score + attachment.preview + modeBonus - check.overlap * 4 - fieldOverflow(models, placed, field) * 40 });
        }
        const hosts = [state.tiles[0], state.tiles[state.tiles.length - 1]].filter((tile, index, list) => tile && list.indexOf(tile) === index);
        for (const host of hosts) {
          for (const variant of [0, 3, 6, 9]) {
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as Array<[number, number, number]>) {
              const next: PlacedTile = { id: candidate.model.id, variant, ix: host.ix + dx, iy: host.iy + dy, iz: host.iz + dz };
              if (state.tiles.some((tile) => tile.ix === next.ix && tile.iy === next.iy && tile.iz === next.iz)) continue;
              const check = occupancyOverlap(models, state.tiles, next);
              tested += 1;
              if (check.overlap / Math.max(1, check.count) > 0.12 || check.gap > 1) continue;
              const placed = [...state.tiles, next];
              const vertical = Math.abs(dz);
              const modeBonus = mode === "C" ? vertical * 4 : mode === "B" ? 2 : 1;
              nextBeam.push({ tiles: placed, score: state.score + modeBonus - check.overlap * 4 - fieldOverflow(models, placed, field) * 40 });
            }
          }
        }
      }
    }
    if (!nextBeam.length) break;
    nextBeam.sort((a, b) => b.score - a.score || b.tiles.length - a.tiles.length);
    const unique: BeamState[] = [];
    const seen = new Set<string>();
    for (const state of nextBeam) {
      const key = state.tiles.map((tile) => `${tile.id}:${tile.variant}:${tile.ix}:${tile.iy}:${tile.iz}`).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(state);
      if (unique.length === 6) break;
    }
    beam = unique;
    hooks.onProgress(`${mode}: placed ${beam[0]?.tiles.length ?? 0} / ${models.length}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (hooks.cancelled()) throw new Error("cancelled");
  }
  beam.sort((a, b) => b.score - a.score);
  const best = beam[0] ?? { tiles: locked, score: 0 };
  return { state: { tiles: seatInField(models, best.tiles, lockedIds), score: best.score }, tested };
}

function toAssembly(id: Assembly["id"], title: string, models: TileModel[], tiles: PlacedTile[], tested: number, notes: PlacementNote[] = [], field: LatticeField = DEFAULT_LATTICE_FIELD): Assembly {
  const evaluated = evaluateAssembly(models, tiles);
  const distribution = computeDistributionReport(models, tiles, field);
  return {
    id,
    title,
    tiles,
    score: evaluated.score,
    distributionScore: distribution.score,
    parts: evaluated.parts,
    connections: evaluated.connections,
    components: evaluated.components,
    candidatesTested: tested,
    placementNotes: notes,
    distribution,
  };
}

type FillOrder = "xyz" | "yxz" | "zxy";

function variantSpan(variant: TileVariant, cellFeet: number) {
  const step = Math.max(1, latticeStep(cellFeet));
  const span = (min: number, max: number) => Math.max(1, Math.ceil((max - min + 1) / step));
  return {
    x: span(variant.bounds.minX, variant.bounds.maxX),
    y: span(variant.bounds.minY, variant.bounds.maxY),
    z: span(variant.bounds.minZ, variant.bounds.maxZ),
  };
}

function anchorAt(variant: TileVariant, cellFeet: number, minIx: number, minIy: number, minIz: number) {
  const step = Math.max(1, latticeStep(cellFeet));
  return {
    ix: minIx - Math.floor(variant.bounds.minX / step),
    iy: minIy - Math.floor(variant.bounds.minY / step),
    iz: minIz - Math.floor(variant.bounds.minZ / step),
  };
}

function spanFits(minIx: number, minIy: number, minIz: number, span: { x: number; y: number; z: number }, field: LatticeField) {
  return minIx >= 0 && minIy >= 0 && minIz >= 0 && minIx + span.x <= field.cellsX && minIy + span.y <= field.cellsY && minIz + span.z <= field.cellsZ;
}

function fieldOrigins(field: LatticeField, order: FillOrder) {
  const origins: Array<[number, number, number]> = [];
  const push = (ix: number, iy: number, iz: number) => origins.push([ix, iy, iz]);
  if (order === "zxy") {
    for (let iy = 0; iy < field.cellsY; iy += 1) {
      for (let ix = 0; ix < field.cellsX; ix += 1) {
        for (let iz = 0; iz < field.cellsZ; iz += 1) push(ix, iy, iz);
      }
    }
  } else if (order === "yxz") {
    for (let iz = 0; iz < field.cellsZ; iz += 1) {
      for (let ix = 0; ix < field.cellsX; ix += 1) {
        for (let iy = 0; iy < field.cellsY; iy += 1) push(ix, iy, iz);
      }
    }
  } else {
    for (let iz = 0; iz < field.cellsZ; iz += 1) {
      for (let iy = 0; iy < field.cellsY; iy += 1) {
        for (let ix = 0; ix < field.cellsX; ix += 1) push(ix, iy, iz);
      }
    }
  }
  return origins.length ? origins : [[0, 0, 0] as [number, number, number]];
}

function outgoingDirection(order: FillOrder): Direction {
  if (order === "yxz") return "+Y";
  if (order === "zxy") return "+Z";
  return "+X";
}

function complementScore(models: TileModel[], placed: PlacedTile[], next: PlacedTile, cellFeet: number) {
  const step = Math.max(1, latticeStep(cellFeet));
  const byId = new Map(models.map((model) => [model.id, model]));
  const guest = byId.get(next.id)?.variants[next.variant];
  if (!guest) return 0;
  let score = 0;
  for (const tile of placed) {
    const host = byId.get(tile.id)?.variants[tile.variant];
    if (!host) continue;
    const dix = next.ix - tile.ix;
    const diy = next.iy - tile.iy;
    const diz = next.iz - tile.iz;
    const reach = Math.abs(dix) + Math.abs(diy) + Math.abs(diz);
    if (reach === 0 || reach > 4) continue;
    const direction = dominantDirection(dix, diy, diz);
    if (direction === "none") continue;
    const [shiftU, shiftV] = faceShift(direction, { dix, diy, diz }, step);
    score += previewFaces(host, guest, direction, shiftU, shiftV);
  }
  return score;
}

async function fillField(models: TileModel[], locked: PlacedTile[], field: LatticeField, order: FillOrder, hooks: Hooks) {
  const cellFeet = models[0]?.cellFeet ?? 2;
  const lockedIds = new Set(locked.map((tile) => tile.id));
  const placed: PlacedTile[] = locked.map((tile) => ({ ...tile }));
  const free = models.filter((model) => !lockedIds.has(model.id));
  const spots = fieldOrigins(field, order);
  const lead = outgoingDirection(order);
  let tested = 0;
  let cursor = 0;
  for (const model of free) {
    if (hooks.cancelled()) throw new Error("cancelled");
    let chosen: PlacedTile | null = null;
    for (let index = cursor; index < spots.length && !chosen; index += 1) {
      const [minIx, minIy, minIz] = spots[index];
      let best: PlacedTile | null = null;
      let bestScore = -Infinity;
      for (let variant = 0; variant < model.variants.length; variant += 1) {
        const pose = model.variants[variant];
        const span = variantSpan(pose, cellFeet);
        if (!spanFits(minIx, minIy, minIz, span, field)) continue;
        const anchor = anchorAt(pose, cellFeet, minIx, minIy, minIz);
        const next: PlacedTile = { id: model.id, variant, ...anchor };
        tested += 1;
        const check = occupancyOverlap(models, placed, next);
        if (placed.length && check.overlap / Math.max(1, check.count) > 0.12) continue;
        const previous = placed[placed.length - 1];
        const toward = previous ? dominantDirection(next.ix - previous.ix, next.iy - previous.iy, next.iz - previous.iz) : lead;
        const face = pose.faces[toward === "none" ? lead : toward];
        const score = complementScore(models, placed, next, cellFeet) + face.projection + face.recess + face.cells.size * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = next;
        }
      }
      if (best) {
        chosen = best;
        cursor = index + 1;
      }
    }
    if (!chosen) {
      const [minIx, minIy, minIz] = spots[Math.min(cursor, spots.length - 1)];
      let bestVariant = 0;
      let bestScore = -Infinity;
      for (let variant = 0; variant < model.variants.length; variant += 1) {
        const pose = model.variants[variant];
        const anchor = anchorAt(pose, cellFeet, minIx, minIy, minIz);
        const next: PlacedTile = { id: model.id, variant, ...anchor };
        tested += 1;
        const score = complementScore(models, placed, next, cellFeet);
        if (score > bestScore) {
          bestScore = score;
          bestVariant = variant;
        }
      }
      const anchor = anchorAt(model.variants[bestVariant], cellFeet, minIx, minIy, minIz);
      chosen = { id: model.id, variant: bestVariant, ...anchor };
      cursor += 1;
    }
    placed.push(chosen);
    const fillPct = Math.round((placed.length / Math.max(1, models.length)) * 100);
    hooks.onProgress(`Filling lattice ${placed.length} / ${models.length}`, fillPct);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { tiles: placed, tested, notes: [] as PlacementNote[] };
}

const ORTHO_NEIGHBORS: Array<[number, number, number, Direction]> = [
  [1, 0, 0, "+X"],
  [-1, 0, 0, "-X"],
  [0, 1, 0, "+Y"],
  [0, -1, 0, "-Y"],
  [0, 0, 1, "+Z"],
  [0, 0, -1, "-Z"],
];

function neighborAdjacencyScore(
  at: Map<string, { model: TileModel; variant: number; world: VoxelWorld }>,
  model: TileModel,
  variantIndex: number,
  ix: number,
  iy: number,
  iz: number,
  cellFeet: number,
) {
  const guest = worldOf(model, variantIndex, ix, iy, iz, cellFeet);
  const pose = model.variants[variantIndex];
  let floor = 0;
  let voidScore = 0;
  let circulation = 0;
  let complementary = 0;
  let collision = 0;
  let edge = 0;
  let neighbors = 0;
  const neighborLinks: Array<{ id: string; direction: Direction; score: number }> = [];
  const reasons: string[] = [];
  for (const [dx, dy, dz, direction] of ORTHO_NEIGHBORS) {
    const host = at.get(`${ix + dx},${iy + dy},${iz + dz}`);
    if (!host) continue;
    neighbors += 1;
    const fromHost = oppositeDirection(direction);
    const edgeBoost = previewFaces(host.model.variants[host.variant], pose, fromHost, 0, 0) * 0.05;
    const scored = scoreVoxelAdjacency(host.world, guest, edgeBoost);
    floor += scored.floor;
    voidScore += scored.void;
    circulation += scored.circulation;
    complementary += scored.complementary;
    collision += scored.collision;
    edge += scored.edge;
    neighborLinks.push({ id: `${host.model.id}::${ix + dx}_${iy + dy}_${iz + dz}`, direction: fromHost, score: scored.total });
    if (scored.reason) reasons.push(`${fromHost}: ${scored.reason}`);
  }
  const total = floor + voidScore + circulation + complementary + collision + edge;
  return {
    total,
    floor,
    void: voidScore,
    circulation,
    complementary,
    collision,
    neighbors,
    neighborLinks,
    reason: reasons.slice(0, 2).join(" | ") || "seed placement by open interface",
    world: guest,
  };
}

async function populateField(
  models: TileModel[],
  locked: PlacedTile[],
  field: LatticeField,
  order: FillOrder,
  hooks: Hooks,
  prefs: DistributionPrefs = DEFAULT_DISTRIBUTION_PREFS,
) {
  const cellFeet = models[0]?.cellFeet ?? 2;
  const cellCount = field.cellsX * field.cellsY * field.cellsZ;
  const spots = fieldOrigins(field, order);
  const placed: PlacedTile[] = [];
  const notes: PlacementNote[] = [];
  const at = new Map<string, { model: TileModel; variant: number; world: VoxelWorld }>();
  const used = new Map<string, number>();
  const reserved = new Set<string>();
  const bySource = new Map(models.map((model) => [model.id, model]));
  const placedIndex = new Map<string, number>();
  const noteIndex = new Map<string, number>();
  let tested = 0;

  const commit = (
    model: TileModel,
    variantIndexValue: number,
    ix: number,
    iy: number,
    iz: number,
    detail: ReturnType<typeof neighborAdjacencyScore>,
    score: number,
    distribution: number,
    reason: string,
    lockedCell: boolean,
  ) => {
    const key = `${ix},${iy},${iz}`;
    const instanceId = `${model.id}::${ix}_${iy}_${iz}`;
    const variant = model.variants[variantIndexValue];
    placedIndex.set(key, placed.length);
    placed.push({ id: instanceId, variant: variantIndexValue, ix, iy, iz });
    at.set(key, { model, variant: variantIndexValue, world: detail.world });
    used.set(model.id, (used.get(model.id) ?? 0) + 1);
    noteIndex.set(key, notes.length);
    notes.push({
      tileId: instanceId,
      sourceId: model.id,
      filename: model.filename,
      rotation: variant.rotation,
      mirror: variant.mirror,
      ix,
      iy,
      iz,
      score,
      floor: detail.floor,
      void: detail.void,
      circulation: detail.circulation,
      complementary: detail.complementary,
      collision: detail.collision,
      distribution,
      reason,
      neighbors: detail.neighborLinks,
    });
    if (lockedCell) reserved.add(key);
  };

  for (const tile of locked) {
    const key = `${tile.ix},${tile.iy},${tile.iz}`;
    if (tile.ix < 0 || tile.iy < 0 || tile.iz < 0 || tile.ix >= field.cellsX || tile.iy >= field.cellsY || tile.iz >= field.cellsZ || reserved.has(key)) continue;
    const model = bySource.get(sourceIdOf(tile.id));
    if (!model) continue;
    const detail = neighborAdjacencyScore(at, model, tile.variant, tile.ix, tile.iy, tile.iz, cellFeet);
    commit(model, tile.variant, tile.ix, tile.iy, tile.iz, detail, 0, 0, "locked placement", true);
  }

  // STAGE A — global farthest-point seeding of typologies
  hooks.onProgress("Seeding typologies across the lattice", 2);
  const seedCells = farthestPointSeeds(field, Math.max(models.length, Math.min(cellCount, models.length * 2)));
  let seedCursor = 0;
  const seedOrder = [...models].sort((a, b) => (a.slotId ?? a.id).localeCompare(b.slotId ?? b.id));
  for (let seedIndex = 0; seedIndex < seedOrder.length; seedIndex += 1) {
    const model = seedOrder[seedIndex];
    if (hooks.cancelled()) throw new Error("cancelled");
    if ((used.get(model.id) ?? 0) > 0) continue;
    let placedSeed = false;
    while (seedCursor < seedCells.length && !placedSeed) {
      const [ix, iy, iz] = seedCells[seedCursor];
      seedCursor += 1;
      const key = `${ix},${iy},${iz}`;
      if (at.has(key) || reserved.has(key)) continue;
      let bestVariant = 0;
      let bestDetail = neighborAdjacencyScore(at, model, 0, ix, iy, iz, cellFeet);
      let bestScore = bestDetail.total;
      for (let variant = 1; variant < model.variants.length; variant += 1) {
        tested += 1;
        const detail = neighborAdjacencyScore(at, model, variant, ix, iy, iz, cellFeet);
        if (detail.total > bestScore) {
          bestScore = detail.total;
          bestVariant = variant;
          bestDetail = detail;
        }
      }
      const occupancy = occupancyFromAt(at);
      const dist = scorePlacementDistribution(occupancy, model, ix, iy, iz, field, used, prefs, cellCount, models.length);
      commit(model, bestVariant, ix, iy, iz, bestDetail, bestScore + dist.total, dist.total, `global seed · ${dist.reason || "farthest-point dispersion"}`, false);
      placedSeed = true;
    }
    hooks.onProgress(`Seeded ${seedIndex + 1} / ${seedOrder.length} typologies`, 2 + Math.round(((seedIndex + 1) / Math.max(1, seedOrder.length)) * 6));
  }

  // STAGE B — interlocking infill with distribution
  const lead = outgoingDirection(order);
  const remaining = spots.filter(([ix, iy, iz]) => !at.has(`${ix},${iy},${iz}`));
  for (let index = 0; index < remaining.length; index += 1) {
    const [ix, iy, iz] = remaining[index];
    const key = `${ix},${iy},${iz}`;
    if (at.has(key) || reserved.has(key)) continue;
    if (hooks.cancelled()) throw new Error("cancelled");
    const occupancy = occupancyFromAt(at);
    const clusterPolicy = resolveClusterPolicy(prefs);
    const targetUses = Math.ceil((placed.length + 1) / Math.max(1, models.length));
    const unusedRemain = models.some((model) => (used.get(model.id) ?? 0) === 0);
    let best: { id: string; variant: number; score: number; interlock: number; distribution: number; exceeds: boolean; detail: ReturnType<typeof neighborAdjacencyScore>; reason: string } | null = null;

    // Limited look-ahead: rank top candidates then pick best combined score
    const candidates: Array<{ id: string; variant: number; score: number; interlock: number; distribution: number; exceeds: boolean; detail: ReturnType<typeof neighborAdjacencyScore>; reason: string }> = [];
    for (const model of models) {
      const prior = used.get(model.id) ?? 0;
      const varietyPenalty = Math.max(0, prior - targetUses + 1) * WEIGHTS.variety * 6;
      const unusedBonus = unusedRemain && prior === 0 ? 36 : 0;
      for (let variant = 0; variant < model.variants.length; variant += 1) {
        tested += 1;
        const detail = neighborAdjacencyScore(at, model, variant, ix, iy, iz, cellFeet);
        let interlock = detail.total - varietyPenalty + unusedBonus;
        if (detail.neighbors === 0) {
          const pose = model.variants[variant];
          const leadFace = pose.faces[lead];
          interlock = leadFace.projection + leadFace.recess + pose.passage.length * 0.2 + pose.voidCells.length * 0.1 + pose.floor.length * 0.05 + unusedBonus;
          detail.reason = `seed by open ${lead} interface`;
        }
        const dist = scorePlacementDistribution(occupancy, model, ix, iy, iz, field, used, prefs, cellCount, models.length);
        let adjustedDist = dist.total;
        if (clusterPolicy.runScale > 0.2 && dist.reason.includes("run") && detail.neighbors > 0 && detail.total < 18) {
          adjustedDist -= 8 * clusterPolicy.runScale;
        }
        if (dist.exceeds && clusterPolicy.hardGate) {
          adjustedDist -= 120 * clusterPolicy.anti;
        }
        const score = interlock + adjustedDist;
        candidates.push({
          id: model.id,
          variant,
          score,
          interlock,
          distribution: adjustedDist,
          exceeds: dist.exceeds,
          detail,
          reason: [detail.reason, dist.reason].filter(Boolean).join(" · "),
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score || Number(a.exceeds) - Number(b.exceeds));
    // Prefer candidates that stay under cluster/run caps when prevention is active.
    const compliant = clusterPolicy.hardGate ? candidates.filter((item) => !item.exceeds) : candidates;
    const pool = compliant.length ? compliant : candidates;
    const beam = pool.slice(0, Math.max(6, Math.min(12, Math.round(6 + clusterPolicy.anti * 6))));
    best = beam[0] ?? null;
    if (beam.length > 1) {
      const interlockSlack = 8 + (clusterPolicy.hardGate ? clusterPolicy.anti * 22 : 0);
      const topInterlock = Math.max(...beam.map((item) => item.interlock));
      const peers = beam.filter((item) => item.interlock >= topInterlock - interlockSlack);
      peers.sort((a, b) => {
        if (a.exceeds !== b.exceeds) return Number(a.exceeds) - Number(b.exceeds);
        return b.score - a.score || b.distribution - a.distribution;
      });
      best = peers[0];
    }
    const chosen = best ?? {
      id: models[index % models.length].id,
      variant: 0,
      score: 0,
      interlock: 0,
      distribution: 0,
      exceeds: false,
      detail: neighborAdjacencyScore(at, models[0], 0, ix, iy, iz, cellFeet),
      reason: "fallback",
    };
    const model = bySource.get(chosen.id) ?? models[0];
    commit(model, chosen.variant, ix, iy, iz, chosen.detail, chosen.score, chosen.distribution, chosen.reason, false);
    if (index % 4 === 0 || index === remaining.length - 1) {
      const fillPct = remaining.length ? (index + 1) / remaining.length : 1;
      hooks.onProgress(`Filling cells ${placed.length} / ${cellCount}`, 8 + Math.round(fillPct * 67));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Orientation refine (preserve type, improve local interlock)
  for (let pass = 0; pass < 2; pass += 1) {
    hooks.onProgress(`Refining orientations pass ${pass + 1} / 2`, 75 + pass * 7);
    for (let spotIndex = 0; spotIndex < spots.length; spotIndex += 1) {
      const [ix, iy, iz] = spots[spotIndex];
      const key = `${ix},${iy},${iz}`;
      if (reserved.has(key)) continue;
      if (hooks.cancelled()) throw new Error("cancelled");
      const current = at.get(key);
      if (!current) continue;
      let bestVariant = current.variant;
      let bestDetail = neighborAdjacencyScore(at, current.model, current.variant, ix, iy, iz, cellFeet);
      let bestScore = bestDetail.total;
      for (let variant = 0; variant < current.model.variants.length; variant += 1) {
        if (variant === current.variant) continue;
        tested += 1;
        const detail = neighborAdjacencyScore(at, current.model, variant, ix, iy, iz, cellFeet);
        if (detail.total > bestScore) {
          bestScore = detail.total;
          bestVariant = variant;
          bestDetail = detail;
        }
      }
      if (bestVariant !== current.variant) {
        at.set(key, { model: current.model, variant: bestVariant, world: bestDetail.world });
        const tileIndex = placedIndex.get(key);
        if (tileIndex !== undefined) placed[tileIndex].variant = bestVariant;
        const noteAt = noteIndex.get(key);
        if (noteAt !== undefined) {
          const variant = current.model.variants[bestVariant];
          notes[noteAt] = {
            ...notes[noteAt],
            rotation: variant.rotation,
            mirror: variant.mirror,
            score: bestScore,
            floor: bestDetail.floor,
            void: bestDetail.void,
            circulation: bestDetail.circulation,
            complementary: bestDetail.complementary,
            collision: bestDetail.collision,
            reason: `refined orientation · ${bestDetail.reason}`,
            neighbors: bestDetail.neighborLinks,
          };
        }
      }
      if (spotIndex % 16 === 0) {
        const refineBase = 75 + pass * 7;
        hooks.onProgress(`Refining orientations pass ${pass + 1} / 2`, refineBase + Math.round((spotIndex / Math.max(1, spots.length)) * 7));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // DISTRIBUTION REBALANCING PASS — break oversized same-type clusters
  const clusterPolicy = resolveClusterPolicy(prefs);
  if (prefs.weight > 0.05 && clusterPolicy.rebalanceStrength > 0.08) {
    const passes = clusterPolicy.hardGate ? 3 : 1;
    const swapBudget = Math.max(4, Math.floor(cellCount * clusterPolicy.rebalanceBudgetRatio * Math.max(0.35, clusterPolicy.rebalanceStrength)));
    let swaps = 0;
    for (let pass = 0; pass < passes; pass += 1) {
      if (hooks.cancelled()) throw new Error("cancelled");
      hooks.onProgress(`Rebalancing typology distribution pass ${pass + 1} / ${passes}`, 90 + Math.round((pass / passes) * 8));
      const report = computeDistributionReport(models, placed, field);
      if (report.maxCluster <= clusterPolicy.maxClusterSoft && pass > 0) break;
      const over = report.typologyRows
        .filter((row) => row.largestCluster > clusterPolicy.maxClusterSoft || row.difference > 1.5)
        .sort((a, b) => b.largestCluster - a.largestCluster || b.difference - a.difference)
        .map((row) => row.sourceId);
      const under = report.typologyRows
        .filter((row) => row.difference < -0.5 || row.count < Math.max(1, Math.floor(cellCount / Math.max(1, models.length))))
        .sort((a, b) => a.difference - b.difference || a.count - b.count);
      if (!over.length || !under.length) break;
      const interlockSlack = 10 + clusterPolicy.anti * 40;
      const gainNeeded = clusterPolicy.hardGate ? -18 * clusterPolicy.anti : 2 + clusterPolicy.rebalanceStrength * 3;
      for (let spotIndex = 0; spotIndex < spots.length; spotIndex += 1) {
        const [ix, iy, iz] = spots[spotIndex];
        if (swaps >= swapBudget) break;
        if (hooks.cancelled()) throw new Error("cancelled");
        if (spotIndex % 24 === 0) {
          hooks.onProgress(`Rebalancing typology distribution (${swaps} swaps)`, 90 + Math.round(((pass + spotIndex / Math.max(1, spots.length)) / passes) * 9));
        }
        const key = `${ix},${iy},${iz}`;
        if (reserved.has(key)) continue;
        const current = at.get(key);
        if (!current || !over.includes(current.model.id)) continue;
        const occupancy = occupancyFromAt(at);
        occupancy.delete(key);
        const currentDetail = neighborAdjacencyScore(at, current.model, current.variant, ix, iy, iz, cellFeet);
        const currentDist = scorePlacementDistribution(occupancy, current.model, ix, iy, iz, field, used, prefs, cellCount, models.length);
        const currentScore = currentDetail.total + currentDist.total;
        let improved: { model: TileModel; variant: number; detail: ReturnType<typeof neighborAdjacencyScore>; score: number; distribution: number; reason: string } | null = null;
        const candidates = under.slice(0, clusterPolicy.hardGate ? 10 : 6);
        for (const row of candidates) {
          const model = bySource.get(row.sourceId);
          if (!model || model.id === current.model.id) continue;
          for (let variant = 0; variant < model.variants.length; variant += 1) {
            tested += 1;
            const detail = neighborAdjacencyScore(at, model, variant, ix, iy, iz, cellFeet);
            if (detail.total < currentDetail.total - interlockSlack) continue;
            const trialUsed = new Map(used);
            trialUsed.set(current.model.id, Math.max(0, (trialUsed.get(current.model.id) ?? 1) - 1));
            trialUsed.set(model.id, (trialUsed.get(model.id) ?? 0) + 1);
            const dist = scorePlacementDistribution(occupancy, model, ix, iy, iz, field, trialUsed, prefs, cellCount, models.length);
            if (dist.exceeds && clusterPolicy.hardGate && !currentDist.exceeds) continue;
            const clusterRelief = Math.max(0, currentDist.cluster - dist.cluster) * 6 * clusterPolicy.anti;
            const score = detail.total + dist.total + clusterRelief;
            if (score > currentScore + gainNeeded && (!improved || score > improved.score)) {
              improved = { model, variant, detail, score, distribution: dist.total, reason: `rebalance · ${dist.reason || "dispersion"}` };
            }
          }
        }
        if (!improved) continue;
        used.set(current.model.id, Math.max(0, (used.get(current.model.id) ?? 1) - 1));
        used.set(improved.model.id, (used.get(improved.model.id) ?? 0) + 1);
        at.set(key, { model: improved.model, variant: improved.variant, world: improved.detail.world });
        const tileIndex = placedIndex.get(key);
        if (tileIndex !== undefined) {
          placed[tileIndex] = { id: `${improved.model.id}::${ix}_${iy}_${iz}`, variant: improved.variant, ix, iy, iz };
        }
        const noteAt = noteIndex.get(key);
        if (noteAt !== undefined) {
          const variant = improved.model.variants[improved.variant];
          notes[noteAt] = {
            tileId: `${improved.model.id}::${ix}_${iy}_${iz}`,
            sourceId: improved.model.id,
            filename: improved.model.filename,
            rotation: variant.rotation,
            mirror: variant.mirror,
            ix,
            iy,
            iz,
            score: improved.score,
            floor: improved.detail.floor,
            void: improved.detail.void,
            circulation: improved.detail.circulation,
            complementary: improved.detail.complementary,
            collision: improved.detail.collision,
            distribution: improved.distribution,
            reason: improved.reason,
            neighbors: improved.detail.neighborLinks,
          };
        }
        swaps += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (swaps >= swapBudget) break;
    }
  }

  hooks.onProgress("Lattice pass complete", 100);
  return { tiles: placed, tested, notes };
}

export async function searchAssemblies(
  models: TileModel[],
  lockedPlacements: Placement[],
  hooks: Hooks,
  field: LatticeField = DEFAULT_LATTICE_FIELD,
  mode: { populate?: boolean; distribution?: DistributionPrefs } = {},
) {
  const started = performance.now();
  const bySource = new Set(models.map((model) => model.id));
  const locked: PlacedTile[] = lockedPlacements.filter((placement) => placement.locked && bySource.has(sourceIdOf(placement.meshId))).map((placement) => ({
    id: sourceIdOf(placement.meshId),
    variant: variantIndex(placement.rotation, placement.mirror),
    ix: placement.ix,
    iy: placement.iy,
    iz: placement.iz,
    zLift: placement.zLift ?? 0,
  }));
  const basePrefs = { ...DEFAULT_DISTRIBUTION_PREFS, ...(mode.distribution ?? {}) };
  let tested = 0;
  if (!mode.populate) {
    hooks.onProgress("Option A · complementary fill", 0);
    const a = await fillField(models, locked, field, "xyz", optionHooks(hooks, 0, "Option A"));
    tested += a.tested;
    hooks.onProgress("Option B · cross-field fill", 33);
    const b = await fillField(models, locked, field, "yxz", optionHooks(hooks, 1, "Option B"));
    tested += b.tested;
    hooks.onProgress("Option C · stacked fill", 66);
    const c = await fillField(models, locked, field, "zxy", optionHooks(hooks, 2, "Option C"));
    tested += c.tested;
    hooks.onProgress("Assembly complete", 100);
    const options = [
      toAssembly("A", "Complementary fill across the lattice", models, a.tiles, a.tested, [], field),
      toAssembly("B", "Cross-field fill", models, b.tiles, b.tested, [], field),
      toAssembly("C", "Stacked fill", models, c.tiles, c.tested, [], field),
    ];
    const stats: SearchStats = {
      pairwiseComparisons: tested,
      candidatesTested: tested,
      milliseconds: performance.now() - started,
      analysisMilliseconds: 0,
    };
    return { options, stats, attachments: [] as Attachment[] };
  }

  const prefsA: DistributionPrefs = {
    ...basePrefs,
    weight: Math.max(0.55, Math.min(0.85, basePrefs.weight)),
    clustering: basePrefs.clustering ?? 0.4,
  };
  const prefsB: DistributionPrefs = {
    ...basePrefs,
    weight: 0.12,
    clustering: 1,
    balanceTypologies: false,
    balanceCategories: false,
    preventLargeClusters: false,
  };
  const prefsC: DistributionPrefs = {
    ...basePrefs,
    weight: 0.95,
    clustering: 0,
    balanceTypologies: true,
    balanceCategories: true,
    preventLargeClusters: true,
    maxSameTypeRun: 2,
    maxClusterSoft: 2,
  };

  hooks.onProgress("Option A · balanced interlock + distribution", 0);
  const a = await populateField(models, locked, field, "xyz", optionHooks(hooks, 0, "Option A"), prefsA);
  tested += a.tested;
  hooks.onProgress("Option B · maximum interlock", 33);
  const b = await populateField(models, locked, field, "yxz", optionHooks(hooks, 1, "Option B"), prefsB);
  tested += b.tested;
  hooks.onProgress("Option C · maximum spatial diversity", 66);
  const c = await populateField(models, locked, field, "zxy", optionHooks(hooks, 2, "Option C"), prefsC);
  tested += c.tested;
  hooks.onProgress("Assembly complete", 100);

  const options = [
    toAssembly("A", "Balanced interlock + distribution", models, a.tiles, a.tested, a.notes, field),
    toAssembly("B", "Maximum interlock", models, b.tiles, b.tested, b.notes, field),
    toAssembly("C", "Maximum spatial diversity", models, c.tiles, c.tested, c.notes, field),
  ];
  const stats: SearchStats = {
    pairwiseComparisons: tested,
    candidatesTested: tested,
    milliseconds: performance.now() - started,
    analysisMilliseconds: 0,
  };
  return { options, stats, attachments: [] as Attachment[] };
}

export function placementsFromAssembly(option: Assembly, previous: Record<string, Placement>, models: TileModel[]) {
  const next: Record<string, Placement> = { ...previous };
  for (const tile of option.tiles) {
    if (previous[tile.id]?.locked) continue;
    const model = models.find((item) => item.id === tile.id);
    const variant = model?.variants[tile.variant];
    if (!variant) continue;
    next[tile.id] = {
      meshId: tile.id,
      slotId: model?.slotId ?? previous[tile.id]?.slotId ?? null,
      rotation: variant.rotation,
      mirror: variant.mirror,
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
      zLift: tile.zLift ?? 0,
      locked: false,
    };
  }
  return next;
}

export function placedFromRecord(models: TileModel[], placements: Record<string, Placement>): PlacedTile[] {
  return models.map((model) => {
    const placement = placements[model.id];
    return {
      id: model.id,
      variant: variantIndex(placement?.rotation ?? 0, placement?.mirror ?? "none"),
      ix: placement?.ix ?? 0,
      iy: placement?.iy ?? 0,
      iz: placement?.iz ?? 0,
      zLift: placement?.zLift ?? 0,
    };
  });
}
