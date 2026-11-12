import { slotById } from "./slots";
import type { DistributionPrefs, DistributionReport, LatticeField, PlacedTile, TileModel, TypologyDistributionRow } from "./types";

export type { DistributionPrefs, DistributionReport, TypologyDistributionRow };

export const DEFAULT_DISTRIBUTION_PREFS: DistributionPrefs = {
  weight: 0.7,
  clustering: 0.4,
  balanceTypologies: true,
  balanceCategories: true,
  preventLargeClusters: true,
  maxSameTypeRun: 2,
  maxClusterSoft: 4,
};

/** Continuous clustering policy. 0% = disperse; 100% = no cluster-size penalty. */
export function resolveClusterPolicy(prefs: DistributionPrefs) {
  const clustering = prefs.preventLargeClusters ? Math.max(0, Math.min(1, prefs.clustering ?? 0.4)) : 1;
  const anti = 1 - clustering;
  // Keep soft caps tight at low clustering so 20% cannot grow into large monoculture blobs.
  const maxSameTypeRun = prefs.preventLargeClusters
    ? Math.max(2, Math.round(2 + clustering * 6))
    : Math.round(2 + clustering * 14);
  const maxClusterSoft = prefs.preventLargeClusters
    ? Math.max(2, Math.round(2 + clustering * 10))
    : Math.round(2 + clustering * 22);
  return {
    clustering,
    anti,
    maxSameTypeRun,
    maxClusterSoft,
    adjacencyScale: anti,
    runScale: anti,
    clusterScale: anti,
    monocultureScale: anti,
    spacingScale: 0.35 + anti * 0.65,
    rebalanceStrength: anti,
    rebalanceBudgetRatio: 0.06 + anti * 0.28,
    hardGate: prefs.preventLargeClusters && anti > 0.25,
  };
}

type CellRef = { modelId: string; slotId: string | null; category: string | null; ix: number; iy: number; iz: number };

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function cellKey(ix: number, iy: number, iz: number) {
  return `${ix},${iy},${iz}`;
}

function categoryOf(model: TileModel) {
  return slotById(model.slotId)?.category ?? null;
}

function collectCells(models: TileModel[], tiles: PlacedTile[]): CellRef[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  const cells: CellRef[] = [];
  for (const tile of tiles) {
    const model = byId.get(sourceIdOf(tile.id)) ?? byId.get(tile.id);
    if (!model) continue;
    cells.push({
      modelId: model.id,
      slotId: model.slotId,
      category: categoryOf(model),
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
    });
  }
  return cells;
}

function sameTypeClusterSizes(cells: CellRef[], field: LatticeField) {
  const byCell = new Map(cells.map((cell) => [cellKey(cell.ix, cell.iy, cell.iz), cell]));
  const seen = new Set<string>();
  const largestByType = new Map<string, number>();
  let globalMax = 0;
  for (const cell of cells) {
    const start = cellKey(cell.ix, cell.iy, cell.iz);
    if (seen.has(start)) continue;
    const queue = [cell];
    seen.add(start);
    let size = 0;
    while (queue.length) {
      const current = queue.pop()!;
      size += 1;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const nx = current.ix + dx;
        const ny = current.iy + dy;
        const nz = current.iz + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= field.cellsX || ny >= field.cellsY || nz >= field.cellsZ) continue;
        const key = cellKey(nx, ny, nz);
        if (seen.has(key)) continue;
        const next = byCell.get(key);
        if (!next || next.modelId !== cell.modelId) continue;
        seen.add(key);
        queue.push(next);
      }
    }
    largestByType.set(cell.modelId, Math.max(largestByType.get(cell.modelId) ?? 0, size));
    globalMax = Math.max(globalMax, size);
  }
  return { largestByType, globalMax };
}

function maxRunForType(cells: CellRef[], modelId: string, field: LatticeField) {
  const set = new Set(cells.filter((cell) => cell.modelId === modelId).map((cell) => cellKey(cell.ix, cell.iy, cell.iz)));
  let maxRun = 0;
  for (let iz = 0; iz < field.cellsZ; iz += 1) {
    for (let iy = 0; iy < field.cellsY; iy += 1) {
      let run = 0;
      for (let ix = 0; ix < field.cellsX; ix += 1) {
        if (set.has(cellKey(ix, iy, iz))) {
          run += 1;
          maxRun = Math.max(maxRun, run);
        } else run = 0;
      }
    }
    for (let ix = 0; ix < field.cellsX; ix += 1) {
      let run = 0;
      for (let iy = 0; iy < field.cellsY; iy += 1) {
        if (set.has(cellKey(ix, iy, iz))) {
          run += 1;
          maxRun = Math.max(maxRun, run);
        } else run = 0;
      }
    }
  }
  return maxRun;
}

function avgNearestSameType(cells: CellRef[], modelId: string) {
  const points = cells.filter((cell) => cell.modelId === modelId);
  if (points.length < 2) return fieldSpanHint(points);
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const dx = points[i].ix - points[j].ix;
      const dy = points[i].iy - points[j].iy;
      const dz = points[i].iz - points[j].iz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < best) best = dist;
    }
    sum += best === Infinity ? 0 : best;
  }
  return sum / points.length;
}

function fieldSpanHint(points: CellRef[]) {
  return points.length ? 0 : 0;
}

function neighborhoodDiversity(cells: CellRef[], field: LatticeField) {
  if (!cells.length) return 0;
  const byCell = new Map(cells.map((cell) => [cellKey(cell.ix, cell.iy, cell.iz), cell]));
  let total = 0;
  let count = 0;
  for (const cell of cells) {
    const types = new Set<string>();
    const categories = new Set<string>();
    let same = 0;
    let neighbors = 0;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const nx = cell.ix + dx;
          const ny = cell.iy + dy;
          const nz = cell.iz + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= field.cellsX || ny >= field.cellsY || nz >= field.cellsZ) continue;
          const other = byCell.get(cellKey(nx, ny, nz));
          if (!other) continue;
          neighbors += 1;
          types.add(other.modelId);
          if (other.category) categories.add(other.category);
          if (other.modelId === cell.modelId) same += 1;
        }
      }
    }
    if (!neighbors) continue;
    const typeRatio = types.size / Math.max(1, neighbors);
    const categoryRatio = categories.size / 3;
    const dominance = same / neighbors;
    total += typeRatio * 0.55 + categoryRatio * 0.3 + (1 - dominance) * 0.15;
    count += 1;
  }
  return count ? total / count : 0;
}

export function computeDistributionReport(models: TileModel[], tiles: PlacedTile[], field: LatticeField): DistributionReport {
  const cells = collectCells(models, tiles);
  const total = Math.max(1, field.cellsX * field.cellsY * field.cellsZ);
  const target = models.length ? total / models.length : 0;
  const { largestByType, globalMax } = sameTypeClusterSizes(cells, field);
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.modelId, (counts.get(cell.modelId) ?? 0) + 1);
  const categoryCounts: Record<string, number> = { Gathering: 0, Office: 0, Lobby: 0 };
  for (const cell of cells) {
    if (cell.category) categoryCounts[cell.category] = (categoryCounts[cell.category] ?? 0) + 1;
  }
  const typologyRows: TypologyDistributionRow[] = models.map((model) => {
    const count = counts.get(model.id) ?? 0;
    const maxRun = maxRunForType(cells, model.id, field);
    return {
      sourceId: model.id,
      slotId: model.slotId,
      filename: model.filename,
      category: categoryOf(model),
      count,
      target,
      difference: count - target,
      percent: (count / total) * 100,
      largestCluster: largestByType.get(model.id) ?? 0,
      maxRun,
      avgSameTypeDistance: avgNearestSameType(cells, model.id),
    };
  });
  typologyRows.sort((a, b) => (slotById(a.slotId)?.code ?? a.filename).localeCompare(slotById(b.slotId)?.code ?? b.filename));
  const maxRun = typologyRows.reduce((max, row) => Math.max(max, row.maxRun), 0);
  const diversity = neighborhoodDiversity(cells, field);
  const balance = typologyRows.length
    ? 1 - typologyRows.reduce((sum, row) => sum + Math.abs(row.difference), 0) / (typologyRows.length * Math.max(1, target))
    : 0;
  const categoryBalance = (() => {
    const values = Object.values(categoryCounts);
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    if (!mean) return 0;
    return 1 - values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / (values.length * mean);
  })();
  const clusterFactor = 1 / (1 + Math.max(0, globalMax - 2));
  const runFactor = 1 / (1 + Math.max(0, maxRun - 2));
  const dispersion = typologyRows.length
    ? typologyRows.reduce((sum, row) => sum + Math.min(6, row.avgSameTypeDistance), 0) / (typologyRows.length * 6)
    : 0;
  const score =
    Math.max(0, balance) * 28 +
    Math.max(0, categoryBalance) * 18 +
    diversity * 24 +
    clusterFactor * 16 +
    runFactor * 14 +
    dispersion * 20;
  return {
    score,
    typologyRows,
    categoryCounts,
    maxCluster: globalMax,
    maxRun,
    neighborhoodDiversity: diversity,
    targetPerType: target,
  };
}

/** Soft distribution delta for a candidate placement into an existing occupancy map. */
export function scorePlacementDistribution(
  occupancy: Map<string, { modelId: string; category: string | null }>,
  model: TileModel,
  ix: number,
  iy: number,
  iz: number,
  field: LatticeField,
  used: Map<string, number>,
  prefs: DistributionPrefs,
  cellCount: number,
  typeCount = Math.max(1, used.size),
): { total: number; reason: string; exceeds: boolean; cluster: number; maxRun: number } {
  if (prefs.weight <= 0.001) return { total: 0, reason: "", exceeds: false, cluster: 1, maxRun: 1 };
  const scale = prefs.weight * 40;
  const policy = resolveClusterPolicy(prefs);
  const category = categoryOf(model);
  const target = cellCount / Math.max(1, typeCount);
  const prior = used.get(model.id) ?? 0;
  let score = 0;
  const parts: string[] = [];

  if (prefs.balanceTypologies) {
    const unusedBonus = prior === 0 ? 18 : 0;
    const over = Math.max(0, prior + 1 - target);
    const under = Math.max(0, target - (prior + 1));
    score += unusedBonus + under * 2.2 - over * 4.5;
    if (unusedBonus) parts.push("unused type");
    if (over > 0.4) parts.push("usage over target");
  }

  let sameAdj = 0;
  let sameCategoryAdj = 0;
  let neighborCount = 0;
  const neighborTypes = new Set<string>();
  const neighborCategories = new Set<string>();
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    const other = occupancy.get(cellKey(ix + dx, iy + dy, iz + dz));
    if (!other) continue;
    neighborCount += 1;
    neighborTypes.add(other.modelId);
    if (other.category) neighborCategories.add(other.category);
    if (other.modelId === model.id) sameAdj += 1;
    if (category && other.category === category) sameCategoryAdj += 1;
  }
  score -= sameAdj * (14 + policy.anti * 18) * policy.adjacencyScale;
  if (sameAdj >= 2 && policy.adjacencyScale > 0.05) {
    score -= (sameAdj - 1) * (12 + policy.anti * 16) * policy.adjacencyScale;
    parts.push("same-type adjacency");
  }
  if (prefs.balanceCategories) {
    const categoryMix = policy.monocultureScale;
    score -= Math.max(0, sameCategoryAdj - 1) * 4 * categoryMix;
    if (neighborCategories.size >= 2) score += 5 * (0.4 + categoryMix * 0.6);
    if (neighborCategories.size >= 3) score += 4 * (0.4 + categoryMix * 0.6);
  }
  if (neighborTypes.size >= 2) score += 4 * (0.4 + policy.monocultureScale * 0.6);
  if (neighborTypes.size >= 3) score += 3 * (0.4 + policy.monocultureScale * 0.6);

  const runX = axisRun(occupancy, model.id, ix, iy, iz, 1, 0, 0) + axisRun(occupancy, model.id, ix, iy, iz, -1, 0, 0) + 1;
  const runY = axisRun(occupancy, model.id, ix, iy, iz, 0, 1, 0) + axisRun(occupancy, model.id, ix, iy, iz, 0, -1, 0) + 1;
  const runZ = axisRun(occupancy, model.id, ix, iy, iz, 0, 0, 1) + axisRun(occupancy, model.id, ix, iy, iz, 0, 0, -1) + 1;
  const maxRun = Math.max(runX, runY, runZ);
  if (policy.runScale > 0.02 && maxRun > policy.maxSameTypeRun) {
    const excess = maxRun - policy.maxSameTypeRun;
    score -= excess * (22 + policy.anti * 40) * policy.runScale;
    if (policy.hardGate) score -= 70 * policy.anti * Math.min(10, excess);
    parts.push(`run ${maxRun}>${policy.maxSameTypeRun}`);
  }

  const cluster = floodClusterSize(occupancy, model.id, ix, iy, iz, field) + 1;
  if (policy.clusterScale > 0.02 && cluster > policy.maxClusterSoft) {
    const excess = cluster - policy.maxClusterSoft;
    score -= excess * (30 + policy.anti * 55) * policy.clusterScale;
    if (policy.hardGate) score -= 90 * policy.anti * Math.min(12, excess);
    parts.push(`cluster ${cluster}`);
  }

  let nearest = Infinity;
  for (const [key, value] of occupancy) {
    if (value.modelId !== model.id) continue;
    const [ox, oy, oz] = key.split(",").map(Number);
    const dist = Math.sqrt((ox - ix) ** 2 + (oy - iy) ** 2 + (oz - iz) ** 2);
    if (dist < nearest) nearest = dist;
  }
  if (nearest === Infinity) {
    score += 8;
    parts.push("first instance");
  } else {
    const ideal = Math.sqrt(cellCount / Math.max(1, prior + 1));
    score += (Math.min(12, nearest * 2.5) - Math.max(0, ideal - nearest) * 1.5) * policy.spacingScale;
    if (nearest < 1.5 && policy.adjacencyScale > 0.05) {
      score -= (12 + policy.anti * 16) * policy.adjacencyScale;
      parts.push("too close to same type");
    } else if (nearest >= ideal * 0.75 && policy.spacingScale > 0.5) parts.push("dispersed");
  }

  // 3x3 neighborhood dominance / macro-region diversity
  let localSame = 0;
  let localTotal = 0;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = field.cellsZ > 1 ? -1 : 0; dz <= (field.cellsZ > 1 ? 1 : 0); dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const other = occupancy.get(cellKey(ix + dx, iy + dy, iz + dz));
        if (!other) continue;
        localTotal += 1;
        if (other.modelId === model.id) localSame += 1;
      }
    }
  }
  const dominanceLimit = 0.28 + policy.clustering * 0.4;
  if (policy.monocultureScale > 0.05 && localTotal >= 3 && localSame / localTotal > dominanceLimit) {
    score -= (16 + policy.anti * 20) * policy.monocultureScale;
    parts.push("neighborhood monoculture");
  }

  const exceeds = (policy.hardGate || policy.anti > 0.15)
    && (cluster > policy.maxClusterSoft || maxRun > policy.maxSameTypeRun);
  const total = (score * scale) / 40;
  return { total, reason: parts.slice(0, 2).join(" · "), exceeds, cluster, maxRun };
}

function axisRun(
  occupancy: Map<string, { modelId: string; category: string | null }>,
  modelId: string,
  ix: number,
  iy: number,
  iz: number,
  dx: number,
  dy: number,
  dz: number,
) {
  let run = 0;
  let x = ix + dx;
  let y = iy + dy;
  let z = iz + dz;
  while (occupancy.get(cellKey(x, y, z))?.modelId === modelId) {
    run += 1;
    x += dx;
    y += dy;
    z += dz;
  }
  return run;
}

function floodClusterSize(
  occupancy: Map<string, { modelId: string; category: string | null }>,
  modelId: string,
  ix: number,
  iy: number,
  iz: number,
  field: LatticeField,
) {
  const seen = new Set<string>();
  const queue: Array<[number, number, number]> = [];
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    const key = cellKey(ix + dx, iy + dy, iz + dz);
    if (occupancy.get(key)?.modelId === modelId) {
      queue.push([ix + dx, iy + dy, iz + dz]);
      seen.add(key);
    }
  }
  let size = 0;
  while (queue.length) {
    const [x, y, z] = queue.pop()!;
    size += 1;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= field.cellsX || ny >= field.cellsY || nz >= field.cellsZ) continue;
      const key = cellKey(nx, ny, nz);
      if (seen.has(key)) continue;
      if (occupancy.get(key)?.modelId !== modelId) continue;
      seen.add(key);
      queue.push([nx, ny, nz]);
    }
  }
  return size;
}

/** Farthest-point seed cells across the lattice for global typology seeding. */
export function farthestPointSeeds(field: LatticeField, count: number): Array<[number, number, number]> {
  const all: Array<[number, number, number]> = [];
  for (let iz = 0; iz < field.cellsZ; iz += 1) {
    for (let iy = 0; iy < field.cellsY; iy += 1) {
      for (let ix = 0; ix < field.cellsX; ix += 1) all.push([ix, iy, iz]);
    }
  }
  if (!all.length || count <= 0) return [];
  const seeds: Array<[number, number, number]> = [];
  const start = all[Math.floor((all.length - 1) * 0.37)];
  seeds.push(start);
  const taken = new Set([cellKey(...start)]);
  while (seeds.length < Math.min(count, all.length)) {
    let best: [number, number, number] | null = null;
    let bestDist = -1;
    for (const candidate of all) {
      const key = cellKey(...candidate);
      if (taken.has(key)) continue;
      let nearest = Infinity;
      for (const seed of seeds) {
        const dx = candidate[0] - seed[0];
        const dy = candidate[1] - seed[1];
        const dz = candidate[2] - seed[2];
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < nearest) nearest = dist;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        best = candidate;
      }
    }
    if (!best) break;
    seeds.push(best);
    taken.add(cellKey(...best));
  }
  return seeds;
}

export function occupancyFromAt(at: Map<string, { model: TileModel; variant: number }>) {
  const occupancy = new Map<string, { modelId: string; category: string | null }>();
  for (const [key, value] of at) {
    occupancy.set(key, { modelId: value.model.id, category: categoryOf(value.model) });
  }
  return occupancy;
}
