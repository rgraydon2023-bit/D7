/**
 * Descriptor calibration V2.
 * Each descriptor reads a different geometric signal. Scores are absolute, not dataset percentiles.
 */
import type { Voxel } from "./openVolume";

export const DESCRIPTOR_ALGORITHM_VERSION = "v3.3";

export type MeshTri = {
  normal: [number, number, number];
  area: number;
  centroid: [number, number, number];
  corners?: [[number, number, number], [number, number, number], [number, number, number]];
};

export type Draft = {
  name: string;
  /** Unscaled measurement, in rawUnit. */
  raw: number;
  rawUnit: string;
  /** Rounded 0–100 term used for display. */
  value: number;
  /** Unrounded 0–100 term. Ranking uses this, not the rounded value. */
  precise?: number;
  weight: number;
};

export type SpatialInput = {
  cells: Voxel[];
  cellFeet?: number;
  /** Outer dimensions in feet. Defaults to the voxel span. */
  bboxFeet?: [number, number, number];
  /** Occupied volume in cubic feet. Defaults to cell count × cellFeet³. */
  occupiedVolumeFeet?: number;
  triangles?: MeshTri[];
};

type Cell = { x: number; y: number; z: number };

const clamp100 = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function metric(name: string, raw: number, rawUnit: string, precise: number, weight: number): Draft {
  const bounded = Math.max(0, Math.min(100, precise));
  return { name, raw, rawUnit, value: clamp100(bounded), precise: bounded, weight };
}

export function scoreDrafts(drafts: Draft[]) {
  const weightSum = drafts.reduce((sum, item) => sum + item.weight, 0) || 1;
  return clamp100(drafts.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum);
}
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

function boundsOf(cells: Voxel[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of cells) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function walkableCells(occupied: Set<string>, bounds: ReturnType<typeof boundsOf>) {
  const list: Cell[] = [];
  const set = new Set<string>();
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let z = bounds.minZ; z <= bounds.maxZ + 1; z += 1) {
        if (occupied.has(keyOf(x, y, z))) continue;
        if (!occupied.has(keyOf(x, y, z - 1))) continue;
        const cell = { x, y, z };
        list.push(cell);
        set.add(keyOf(x, y, z));
      }
    }
  }
  return { list, set };
}

const PLAN = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function networkLinks(walk: Set<string>, occupied: Set<string>, list: Cell[]) {
  const links = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const row = links.get(a);
    if (row) {
      if (!row.includes(b)) row.push(b);
    } else links.set(a, [b]);
  };
  const both = (a: string, b: string) => {
    add(a, b);
    add(b, a);
  };
  for (const cell of list) {
    const here = keyOf(cell.x, cell.y, cell.z);
    for (const [dx, dy] of PLAN) {
      const next = keyOf(cell.x + dx, cell.y + dy, cell.z);
      if (walk.has(next)) both(here, next);
    }
    for (const dz of [-1, 1]) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const next = keyOf(cell.x + dx, cell.y + dy, cell.z + dz);
          if (walk.has(next)) both(here, next);
        }
      }
    }
  }
  // Walled vertical passages. Open gaps between slabs have no lateral solid, so they do not connect.
  const columns = new Map<string, number[]>();
  for (const cell of list) {
    const column = `${cell.x},${cell.y}`;
    const zs = columns.get(column) ?? [];
    zs.push(cell.z);
    columns.set(column, zs);
  }
  for (const [column, zs] of columns) {
    zs.sort((a, b) => a - b);
    const [x, y] = column.split(",").map(Number);
    for (let index = 0; index < zs.length - 1; index += 1) {
      const lower = zs[index];
      const upper = zs[index + 1];
      if (upper - lower < 2) continue;
      const mid = Math.floor((lower + upper) / 2);
      let enclosed = 0;
      for (const [dx, dy] of PLAN) {
        if (occupied.has(keyOf(x + dx, y + dy, mid))) enclosed += 1;
      }
      if (enclosed >= 2) both(keyOf(x, y, lower), keyOf(x, y, upper));
    }
  }
  return links;
}

function reachableFrom(start: string[], links: Map<string, string[]>) {
  const seen = new Set<string>();
  const queue = [...start];
  for (const item of queue) seen.add(item);
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of links.get(queue[index]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function parseKey(value: string): Cell {
  const [x, y, z] = value.split(",").map(Number);
  return { x, y, z };
}

function levelsOf(list: Cell[]) {
  const counts = new Map<number, Cell[]>();
  for (const cell of list) {
    const row = counts.get(cell.z) ?? [];
    row.push(cell);
    counts.set(cell.z, row);
  }
  const rows = [...counts.entries()].filter(([, cells]) => cells.length >= 4).sort((a, b) => a[0] - b[0]);
  const largest = rows.reduce((max, [, cells]) => Math.max(max, cells.length), 0);
  // Stair treads are not floors. A level has to be a substantial plate.
  return rows.filter(([, cells]) => cells.length >= Math.max(6, largest * 0.3));
}

function atriumShafts(occupied: Set<string>, bounds: ReturnType<typeof boundsOf>) {
  const plates: number[] = [];
  for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
    let count = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      for (let y = bounds.minY; y <= bounds.maxY; y += 1) if (occupied.has(keyOf(x, y, z))) count += 1;
    }
    if (count >= 6) plates.push(z);
  }
  const columns: Array<{ x: number; y: number; z0: number; z1: number }> = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const openPlates = plates.filter((z) => !occupied.has(keyOf(x, y, z)));
      if (openPlates.length < 2) continue;
      const z0 = openPlates[0];
      const z1 = openPlates[openPlates.length - 1];
      if (z1 - z0 < 3) continue;
      let blocked = false;
      for (let z = z0; z <= z1; z += 1) if (occupied.has(keyOf(x, y, z))) blocked = true;
      if (blocked) continue;
      columns.push({ x, y, z0, z1 });
    }
  }
  const plan = Math.max(1, (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1));
  const used = new Set<number>();
  const shafts: Array<{ z0: number; z1: number; area: number }> = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (used.has(index)) continue;
    const queue = [index];
    used.add(index);
    let z0 = columns[index].z0;
    let z1 = columns[index].z1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = columns[queue[cursor]];
      z0 = Math.min(z0, current.z0);
      z1 = Math.max(z1, current.z1);
      for (let other = 0; other < columns.length; other += 1) {
        if (used.has(other)) continue;
        const next = columns[other];
        if (Math.max(Math.abs(next.x - current.x), Math.abs(next.y - current.y)) > 1) continue;
        if (next.z1 < current.z0 || next.z0 > current.z1) continue;
        used.add(other);
        queue.push(other);
      }
    }
    if (queue.length < 4 || queue.length / plan > 0.75) continue;
    let besideMass = 0;
    for (const columnIndex of queue) {
      const column = columns[columnIndex];
      let walls = 0;
      for (const [dx, dy] of PLAN) if (occupied.has(keyOf(column.x + dx, column.y + dy, column.z0))) walls += 1;
      if (walls >= 1) besideMass += 1;
    }
    if (besideMass / queue.length < 0.35) continue;
    shafts.push({ z0, z1, area: queue.length });
  }
  return shafts;
}

function verticallyIntegrated(occupied: Set<string>, list: Cell[], links: Map<string, string[]>): Draft[] {
  if (!occupied.size && !list.length) {
    return [
      metric("Traversable Vertical Connectivity", 0, "linked level pairs / pairs", 0, 0.35),
      metric("Cross-Level Spatial Connection", 0, "shared vertical pairs / level pairs", 0, 0.3),
      metric("Vertical Void Continuity", 0, "bounded void levels / height", 0, 0.25),
      metric("Reachable Level Diversity", 0, "reached plates / plates", 0, 0.1),
    ];
  }
  const bounds = list.length
    ? boundsOf(list.map((cell) => [cell.x, cell.y, cell.z]))
    : boundsOf([...occupied].map((packed) => packed.split(",").map(Number) as Voxel));
  const levels = levelsOf(list);
  let traversable = 0;
  let diversity = 0;
  if (levels.length >= 2) {
    const lowest = levels[0][1].map((cell) => keyOf(cell.x, cell.y, cell.z));
    const reached = reachableFrom(lowest, links);
    let reachedLevels = 0;
    let linked = 0;
    for (const [, cells] of levels) {
      if (cells.some((cell) => reached.has(keyOf(cell.x, cell.y, cell.z)))) reachedLevels += 1;
    }
    for (let index = 0; index < levels.length - 1; index += 1) {
      const below = levels[index][1].map((cell) => keyOf(cell.x, cell.y, cell.z));
      const seen = reachableFrom(below, links);
      if (levels[index + 1][1].some((cell) => seen.has(keyOf(cell.x, cell.y, cell.z)))) linked += 1;
    }
    traversable = linked / (levels.length - 1);
    diversity = reachedLevels / levels.length;
  }
  const massBounds = occupied.size
    ? boundsOf([...occupied].map((packed) => packed.split(",").map(Number) as Voxel))
    : bounds;
  const shafts = occupied.size ? atriumShafts(occupied, massBounds) : [];
  const height = Math.max(1, massBounds.maxZ - massBounds.minZ + 1);
  const bestShaft = shafts.reduce<typeof shafts[number] | null>((best, shaft) => (!best || shaft.area > best.area ? shaft : best), null);
  const opening = bestShaft ? Math.min(1, bestShaft.area / 8) : 0;
  const span = bestShaft ? Math.min(1, (bestShaft.z1 - bestShaft.z0 + 1) / height) : 0;
  let spatial = 0;
  let spatialArea = 0;
  if (levels.length >= 2) {
    for (let index = 0; index < levels.length - 1; index += 1) {
      const low = levels[index][0];
      const high = levels[index + 1][0];
      const shaft = shafts.find((item) => item.z0 <= low + 1 && item.z1 >= high - 1);
      if (!shaft) continue;
      spatial += Math.min(1, shaft.area / 8);
      spatialArea += shaft.area;
    }
    spatial /= levels.length - 1;
    spatialArea /= levels.length - 1;
  } else if (bestShaft) {
    spatial = opening * span;
    spatialArea = bestShaft.area;
  }
  return [
    metric("Traversable Vertical Connectivity", traversable, "linked level pairs / pairs", traversable * 100, 0.35),
    metric("Cross-Level Spatial Connection", spatialArea, "mean atrium cells shared by level pairs", spatial * 100, 0.3),
    metric("Vertical Void Continuity", bestShaft?.area ?? 0, "atrium cells in plan", span * opening * 100, 0.25),
    metric("Reachable Level Diversity", diversity, "reached plates / plates", diversity * 100, 0.1),
  ];
}

function sameLevelNeighbors(id: string, links: Map<string, string[]>) {
  const cell = parseKey(id);
  return (links.get(id) ?? []).filter((next) => parseKey(next).z === cell.z);
}

function corridorScore(list: Cell[], links: Map<string, string[]>, bounds: ReturnType<typeof boundsOf>): Draft[] {
  const empty = [
    { name: "Destination Agreement", raw: 0, rawUnit: "entries reaching dominant end", value: 0, weight: 0.45 },
    { name: "Approach Direction Diversity", raw: 0, rawUnit: "unique directions / 8", value: 0, weight: 0.35 },
    { name: "Path Continuity Into Destination", raw: 0, rawUnit: "mean straightness", value: 0, weight: 0.2 },
  ];
  const openRoom = new Set<string>();
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    if (sameLevelNeighbors(id, links).length >= 3) openRoom.add(id);
  }
  const roomSize = new Map<string, number>();
  const roomSeen = new Set<string>();
  for (const start of openRoom) {
    if (roomSeen.has(start)) continue;
    const queue = [start];
    roomSeen.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      for (const next of sameLevelNeighbors(queue[index], links)) {
        if (!openRoom.has(next) || roomSeen.has(next)) continue;
        roomSeen.add(next);
        queue.push(next);
      }
    }
    for (const id of queue) roomSize.set(id, queue.length);
  }
  const pathLike = new Set<string>();
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    const neighbors = sameLevelNeighbors(id, links);
    if (neighbors.length > 2) continue;
    const skirtsRoom = neighbors.some((next) => (roomSize.get(next) ?? 0) >= 6);
    if (skirtsRoom) continue;
    pathLike.add(id);
  }
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    if (pathLike.has(id)) continue;
    const corridorTouches = sameLevelNeighbors(id, links).filter((next) => pathLike.has(next));
    if (corridorTouches.length >= 2) pathLike.add(id);
  }
  if (pathLike.size < 4) return empty;
  const filtered = new Map([...links].map(([id, next]) => [id, next.filter((item) => pathLike.has(item))]));
  const entries = [...pathLike].filter((id) => {
    const cell = parseKey(id);
    const onEdge = cell.x === bounds.minX || cell.x === bounds.maxX || cell.y === bounds.minY || cell.y === bounds.maxY;
    const pathDegree = (filtered.get(id) ?? []).length;
    return onEdge || pathDegree <= 1;
  });
  if (entries.length < 2) return empty;
  const junctions = [...pathLike].filter((id) => (filtered.get(id) ?? []).length >= 3);
  const targets = junctions.length ? junctions : [...pathLike].filter((id) => !entries.includes(id)).slice(0, 1);
  if (!targets.length) return empty;
  let best = targets[0];
  let bestCount = -1;
  for (const target of targets) {
    const seen = reachableFrom([target], filtered);
    let count = 0;
    for (const entry of entries) if (seen.has(entry)) count += 1;
    if (count > bestCount) {
      bestCount = count;
      best = target;
    }
  }
  const destination = parseKey(best);
  let agreement = 0;
  const directions = new Set<number>();
  let straightness = 0;
  let straightCount = 0;
  for (const entry of entries) {
    const path = shortestPath(entry, best, filtered);
    if (!path) continue;
    agreement += 1;
    const from = parseKey(entry);
    const angle = Math.atan2(from.y - destination.y, from.x - destination.x);
    directions.add(Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8);
    const crow = Math.hypot(from.x - destination.x, from.y - destination.y, from.z - destination.z) || 1;
    straightness += Math.min(1, crow / Math.max(1, path.length - 1));
    straightCount += 1;
  }
  const agreementRaw = agreement / entries.length;
  const diversityRaw = directions.size / 8;
  const continuityRaw = straightCount ? straightness / straightCount : 0;
  return [
    { name: "Destination Agreement", raw: agreementRaw, rawUnit: "entries reaching dominant end", value: clamp100(agreementRaw * 100), weight: 0.45 },
    { name: "Approach Direction Diversity", raw: diversityRaw, rawUnit: "unique directions / 8", value: clamp100(diversityRaw * 100), weight: 0.35 },
    { name: "Path Continuity Into Destination", raw: continuityRaw, rawUnit: "mean straightness", value: clamp100(continuityRaw * 100), weight: 0.2 },
  ];
}

function shortestPath(start: string, goal: string, links: Map<string, string[]>) {
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === goal) break;
    for (const next of links.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(goal)) return null;
  const path = [goal];
  let cursor: string | null = goal;
  while (cursor && cursor !== start) {
    cursor = previous.get(cursor) ?? null;
    if (cursor) path.push(cursor);
  }
  return path.reverse();
}

function farthestPath(edges: Map<string, Set<string>>, members: Map<string, Cell[]>) {
  const ids = [...members.keys()];
  if (ids.length < 2) return [] as string[];
  const walk = (start: string) => {
    const previous = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    let far = start;
    for (let index = 0; index < queue.length; index += 1) {
      far = queue[index];
      for (const next of edges.get(queue[index]) ?? []) {
        if (previous.has(next)) continue;
        previous.set(next, queue[index]);
        queue.push(next);
      }
    }
    const path = [far];
    let cursor: string | null = far;
    while (cursor && cursor !== start) {
      cursor = previous.get(cursor) ?? null;
      if (cursor) path.push(cursor);
    }
    return path.reverse();
  };
  const first = walk(ids[0]);
  return walk(first[0]);
}

function longestSignificantPath(edges: Map<string, Set<string>>, members: Map<string, Cell[]>) {
  const seen = new Set<string>();
  let best: string[] = [];
  for (const id of members.keys()) {
    if (seen.has(id)) continue;
    const component = new Map<string, Cell[]>();
    const queue = [id];
    seen.add(id);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      component.set(current, members.get(current)!);
      for (const next of edges.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    const path = farthestPath(edges, component);
    if (path.length > best.length) best = path;
  }
  return best;
}

function centroid(cells: Cell[]) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const cell of cells) {
    x += cell.x;
    y += cell.y;
    z += cell.z;
  }
  const n = cells.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

function significantZones(list: Cell[], links: Map<string, string[]>) {
  const bin = 5;
  const zoneOf = (cell: Cell) => `${Math.floor(cell.x / bin)},${Math.floor(cell.y / bin)},${Math.floor(cell.z / 2)}`;
  const members = new Map<string, Cell[]>();
  for (const cell of list) {
    const id = zoneOf(cell);
    const row = members.get(id) ?? [];
    row.push(cell);
    members.set(id, row);
  }
  for (const [id, cells] of [...members.entries()]) {
    if (cells.length >= 4) continue;
    members.delete(id);
  }
  const edges = new Map<string, Set<string>>();
  for (const id of members.keys()) edges.set(id, new Set());
  for (const cell of list) {
    const from = zoneOf(cell);
    if (!members.has(from)) continue;
    for (const next of links.get(keyOf(cell.x, cell.y, cell.z)) ?? []) {
      const to = zoneOf(parseKey(next));
      if (to !== from && members.has(to)) {
        edges.get(from)!.add(to);
        edges.get(to)!.add(from);
      }
    }
  }
  return { members, edges };
}

function routeCells(list: Cell[], links: Map<string, string[]>) {
  const openRoom = new Set<string>();
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    if (sameLevelNeighbors(id, links).length >= 3) openRoom.add(id);
  }
  const roomSize = new Map<string, number>();
  const seen = new Set<string>();
  for (const start of openRoom) {
    if (seen.has(start)) continue;
    const queue = [start];
    seen.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      for (const next of sameLevelNeighbors(queue[index], links)) {
        if (!openRoom.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    for (const id of queue) roomSize.set(id, queue.length);
  }
  const route = new Set<string>();
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    const neighbors = sameLevelNeighbors(id, links);
    if (neighbors.length > 2) continue;
    if (neighbors.some((next) => (roomSize.get(next) ?? 0) >= 6)) continue;
    route.add(id);
  }
  for (const cell of list) {
    const id = keyOf(cell.x, cell.y, cell.z);
    if (route.has(id)) continue;
    if (sameLevelNeighbors(id, links).filter((next) => route.has(next)).length >= 2) route.add(id);
  }
  return route;
}

function sequentialAndCirculation(list: Cell[], links: Map<string, string[]>): { sequential: Draft[]; circulation: Draft[] } {
  const { members, edges } = significantZones(list, links);
  const path = longestSignificantPath(edges, members);
  const depth = Math.max(0, path.length - 1);
  const depthPrecise = path.length > 1 ? depth / (depth + 4) * 100 : 0;
  const orderedPrecise = Math.min(1, path.length / 6) * 100;
  const changeTypes = new Set<string>();
  for (let index = 1; index < path.length; index += 1) {
    const beforeCells = members.get(path[index - 1])!;
    const afterCells = members.get(path[index])!;
    const before = centroid(beforeCells);
    const after = centroid(afterCells);
    if (Math.abs(after.z - before.z) >= 2) changeTypes.add("elevation");
    const ratio = beforeCells.length ? afterCells.length / beforeCells.length : 1;
    if (ratio >= 1.4 || ratio <= 0.7) changeTypes.add("scale");
    const beforeSpan = Math.hypot(
      Math.max(...beforeCells.map((cell) => cell.x)) - Math.min(...beforeCells.map((cell) => cell.x)),
      Math.max(...beforeCells.map((cell) => cell.y)) - Math.min(...beforeCells.map((cell) => cell.y)),
    );
    const afterSpan = Math.hypot(
      Math.max(...afterCells.map((cell) => cell.x)) - Math.min(...afterCells.map((cell) => cell.x)),
      Math.max(...afterCells.map((cell) => cell.y)) - Math.min(...afterCells.map((cell) => cell.y)),
    );
    if (beforeSpan > 0 && (afterSpan / beforeSpan >= 1.4 || afterSpan / beforeSpan <= 0.7)) changeTypes.add("width");
    if (index >= 2) {
      const earlier = centroid(members.get(path[index - 2])!);
      const incoming = { x: before.x - earlier.x, y: before.y - earlier.y };
      const outgoing = { x: after.x - before.x, y: after.y - before.y };
      const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
      const scale = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
      if (scale > 0 && dot / scale < 0.5) changeTypes.add("direction");
    }
    const enclosure = (cells: Cell[]) => {
      let walls = 0;
      for (const cell of cells) {
        for (const [dx, dy] of PLAN) {
          const beside = keyOf(cell.x + dx, cell.y + dy, cell.z);
          if (!cells.some((item) => keyOf(item.x, item.y, item.z) === beside) && !list.some((item) => keyOf(item.x, item.y, item.z) === beside)) walls += 1;
        }
      }
      return walls / Math.max(1, cells.length * 4);
    };
    if (Math.abs(enclosure(afterCells) - enclosure(beforeCells)) >= 0.15) changeTypes.add("enclosure");
  }
  const diversity = changeTypes.size / 5;
  const nodeCount = members.size;
  let edgeCount = 0;
  for (const linksOf of edges.values()) edgeCount += linksOf.size;
  edgeCount /= 2;
  const extra = Math.max(0, edgeCount - Math.max(0, nodeCount - 1));
  const legibility = nodeCount > 1 ? 1 - Math.min(1, extra / nodeCount) : 0;
  const sequential: Draft[] = [
    metric("Meaningful Graph Depth", depth, "significant zone hops", depthPrecise, 0.35),
    metric("Ordered Zones on Primary Path", path.length, "significant zones", orderedPrecise, 0.3),
    metric("Spatial Transition Diversity", diversity, "change types / 5", diversity * 100, 0.25),
    metric("Path Legibility", legibility, "1 - extra branches / zones", legibility * 100, 0.1),
  ];

  const route = routeCells(list, links);
  const zoneIds = [...members.keys()];
  const touchRatio = (cells: Cell[], network: Set<string>) => {
    if (!cells.length || !network.size) return 0;
    let touched = 0;
    for (const cell of cells) {
      const key = keyOf(cell.x, cell.y, cell.z);
      if (network.has(key) || (links.get(key) ?? []).some((next) => network.has(next))) touched += 1;
    }
    return touched / cells.length;
  };
  let largest = 0;
  let largestRoute = new Set<string>();
  const componentSeen = new Set<string>();
  for (const start of route) {
    if (componentSeen.has(start)) continue;
    const queue = [start];
    componentSeen.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      for (const next of links.get(queue[index]) ?? []) {
        if (!route.has(next) || componentSeen.has(next)) continue;
        componentSeen.add(next);
        queue.push(next);
      }
    }
    if (queue.length > largest) {
      largest = queue.length;
      largestRoute = new Set(queue);
    }
  }
  const continuity = route.size ? largest / route.size : 0;
  const interfaceRaw = zoneIds.length
    ? zoneIds.reduce((sum, id) => sum + touchRatio(members.get(id)!, route), 0) / zoneIds.length
    : 0;
  const servedRaw = zoneIds.length
    ? zoneIds.reduce((sum, id) => sum + touchRatio(members.get(id)!, largestRoute), 0) / zoneIds.length
    : 0;
  const junctionCells: Cell[] = [];
  for (const id of route) {
    const branches = (links.get(id) ?? []).filter((next) => route.has(next));
    if (branches.length >= 3) junctionCells.push(parseKey(id));
  }
  const clustered = new Set<number>();
  let intersections = 0;
  for (let index = 0; index < junctionCells.length; index += 1) {
    if (clustered.has(index)) continue;
    intersections += 1;
    clustered.add(index);
    for (let other = 0; other < junctionCells.length; other += 1) {
      if (clustered.has(other)) continue;
      const left = junctionCells[index];
      const right = junctionCells[other];
      if (Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y), Math.abs(left.z - right.z)) <= 2) clustered.add(other);
    }
  }
  const intersectionRaw = intersections === 0 ? 0 : intersections / (intersections + 3);
  let deadEnds = 0;
  for (const id of route) {
    const branches = (links.get(id) ?? []).filter((next) => route.has(next));
    if (branches.length <= 1) deadEnds += 1;
  }
  const deadRaw = route.size ? deadEnds / route.size : 0;
  const circulation: Draft[] = [
    metric("Reachable Meaningful Space", servedRaw, "mean share of zone cells on the largest route", servedRaw * 100, 0.3),
    metric("Route Network Continuity", continuity, "largest route / route cells", continuity * 100, 0.25),
    metric("Useful Intersection Density", intersectionRaw, "clustered junctions / (junctions + 3)", intersectionRaw * 100, 0.2),
    metric("Space-to-Route Interface", interfaceRaw, "mean share of zone cells touching any route", interfaceRaw * 100, 0.15),
    metric("Dead-End Quality", deadRaw, "dead-end route cells / route cells", (1 - deadRaw) * 100, 0.1),
  ];
  return { sequential, circulation };
}

function rayClear(occupied: Set<string>, from: Cell, to: Cell) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (steps <= 1) return { clear: true, distance: Math.hypot(dx, dy, dz) };
  let previous = "";
  for (let step = 1; step < steps; step += 1) {
    const x = Math.round(from.x + dx * step / steps);
    const y = Math.round(from.y + dy * step / steps);
    const z = Math.round(from.z + dz * step / steps);
    const id = keyOf(x, y, z);
    if (id === previous) continue;
    previous = id;
    if (occupied.has(id)) return { clear: false, distance: Math.hypot(dx, dy, dz) * step / steps };
  }
  return { clear: true, distance: Math.hypot(dx, dy, dz) };
}

function visualZones(list: Cell[], occupied: Set<string>) {
  const bin = 3;
  const groups = new Map<string, Cell[]>();
  for (const cell of list) {
    const id = `${Math.floor(cell.x / bin)},${Math.floor(cell.y / bin)},${Math.floor(cell.z / bin)}`;
    const row = groups.get(id) ?? [];
    row.push(cell);
    groups.set(id, row);
  }
  return [...groups.values()].filter((cells) => cells.length >= 3).map((cells) => {
    const point = centroid(cells);
    let sample = cells[0];
    let best = Infinity;
    for (const cell of cells) {
      const distance = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2 + (cell.z - point.z) ** 2;
      if (distance < best) {
        sample = cell;
        best = distance;
      }
    }
    let enclosed = 0;
    for (const cell of cells) {
      let walls = 0;
      for (const [dx, dy] of PLAN) if (occupied.has(keyOf(cell.x + dx, cell.y + dy, cell.z))) walls += 1;
      if (walls >= 1) enclosed += 1;
    }
    const picks = new Map<string, Cell>();
    const remember = (cell: Cell) => picks.set(keyOf(cell.x, cell.y, cell.z), cell);
    remember(sample);
    remember(cells.reduce((best, cell) => (cell.x < best.x ? cell : best)));
    remember(cells.reduce((best, cell) => (cell.x > best.x ? cell : best)));
    return { samples: [...picks.values()], enclosure: enclosed / cells.length };
  });
}

function visuallyConnected(occupied: Set<string>, list: Cell[], bounds: ReturnType<typeof boundsOf>): Draft[] {
  const zones = visualZones(list, occupied);
  if (zones.length < 2) {
    return [
      metric("Zone-to-Zone Visibility", 0, "architectural sightlines / relevant pairs", 0, 0.45),
      metric("Mean Clear Sightline Length", 0, "clear length / plan diagonal", 0, 0.3),
      metric("Visible Zone-Pair Fraction", 0, "visible relevant pairs / relevant pairs", 0, 0.25),
    ];
  }
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  const walkable = new Set(list.map((cell) => keyOf(cell.x, cell.y, cell.z)));
  const underCover = (from: Cell, to: Cell) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps <= 1) return 0;
    let covered = 0;
    let samples = 0;
    for (let step = 1; step < steps; step += 1) {
      const x = Math.round(from.x + dx * step / steps);
      const y = Math.round(from.y + dy * step / steps);
      const z = Math.round(from.z + dz * step / steps);
      samples += 1;
      for (let rise = 1; rise <= 3; rise += 1) {
        if (occupied.has(keyOf(x, y, z + rise))) {
          covered += 1;
          break;
        }
      }
    }
    return samples ? covered / samples : 0;
  };
  let relevant = 0;
  let visiblePairs = 0;
  let rays = 0;
  let clearRays = 0;
  let length = 0;
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const anchorDistance = Math.hypot(
        zones[j].samples[0].x - zones[i].samples[0].x,
        zones[j].samples[0].y - zones[i].samples[0].y,
        zones[j].samples[0].z - zones[i].samples[0].z,
      );
      if (anchorDistance < 2) continue;
      relevant += 1;
      let pairLength = 0;
      let pairVisible = false;
      for (const from of zones[i].samples) {
        for (const to of zones[j].samples) {
          rays += 1;
          const hit = rayClear(occupied, from, to);
          if (!hit.clear) continue;
          const mid = {
            x: Math.round((from.x + to.x) / 2),
            y: Math.round((from.y + to.y) / 2),
            z: Math.round((from.z + to.z) / 2),
          };
          const crossesOpenSpace = !walkable.has(keyOf(mid.x, mid.y, mid.z)) && !occupied.has(keyOf(mid.x, mid.y, mid.z));
          const touchesRoom = zones[i].enclosure >= 0.15 || zones[j].enclosure >= 0.15;
          const interior = underCover(from, to) >= 0.35;
          if (!crossesOpenSpace && !touchesRoom && !interior) continue;
          clearRays += 1;
          pairVisible = true;
          pairLength = Math.max(pairLength, hit.distance);
        }
      }
      if (pairVisible) {
        visiblePairs += 1;
        length += pairLength;
      }
    }
  }
  const visibility = rays ? clearRays / rays : 0;
  const pairFraction = relevant ? visiblePairs / relevant : 0;
  const mean = visiblePairs ? Math.min(1, (length / visiblePairs) / diagonal) : 0;
  return [
    metric("Zone-to-Zone Visibility", visibility, "architectural sightlines / rays", visibility * 100, 0.45),
    metric("Mean Clear Sightline Length", mean, "clear length / plan diagonal", mean * 100, 0.3),
    metric("Visible Zone-Pair Fraction", pairFraction, "visible relevant pairs / relevant pairs", pairFraction * 100, 0.25),
  ];
}

function centralized(cells: Voxel[]): Draft[] {
  const center = centroid(cells.map(([x, y, z]) => ({ x, y, z })));
  const bounds = boundsOf(cells);
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  const offset = Math.hypot(center.x - midX, center.y - midY) / diagonal;
  const concentration = 1 - Math.min(1, offset * 2);
  let maxRadius = 0;
  const radii: number[] = [];
  for (const [x, y] of cells) {
    const radius = Math.hypot(x - center.x, y - center.y);
    radii.push(radius);
    maxRadius = Math.max(maxRadius, radius);
  }
  const limit = maxRadius || 1;
  let inner = 0;
  let outer = 0;
  for (const radius of radii) {
    const t = radius / limit;
    if (t < 0.33) inner += 1;
    else if (t >= 0.66) outer += 1;
  }
  const innerExpected = 0.33 * 0.33;
  const outerExpected = 1 - 0.66 * 0.66;
  const innerRatio = cells.length ? (inner / cells.length) / innerExpected : 0;
  const outerRatio = cells.length ? (outer / cells.length) / outerExpected : 0;
  const falloff = innerRatio + outerRatio > 0 ? Math.max(0, (innerRatio - outerRatio) / (innerRatio + outerRatio)) : 0;
  const half = radii.filter((radius) => radius <= limit * 0.5).length / cells.length;
  const dominance = Math.max(0, (half - 0.25) / 0.35);
  return [
    { name: "Center Concentration", raw: concentration, rawUnit: "1 - centroid offset", value: clamp100(concentration * 100), weight: 0.4 },
    { name: "Radial Occupancy Falloff", raw: falloff, rawUnit: "inner density ratio vs outer", value: clamp100(falloff * 100), weight: 0.35 },
    { name: "Inner-Zone Dominance", raw: dominance, rawUnit: "extra share inside half radius", value: clamp100(Math.min(1, dominance) * 100), weight: 0.25 },
  ];
}

function plates(cells: Voxel[]) {
  const byLevel = new Map<number, Voxel[]>();
  for (const cell of cells) {
    const row = byLevel.get(cell[2]) ?? [];
    row.push(cell);
    byLevel.set(cell[2], row);
  }
  const areas: number[] = [];
  for (const level of byLevel.values()) {
    const remaining = new Set(level.map(([x, y]) => `${x},${y}`));
    for (const start of remaining) {
      if (!remaining.has(start)) continue;
      const queue = [start];
      remaining.delete(start);
      let area = 0;
      for (let index = 0; index < queue.length; index += 1) {
        area += 1;
        const [x, y] = queue[index].split(",").map(Number);
        for (const [dx, dy] of PLAN) {
          const next = `${x + dx},${y + dy}`;
          if (!remaining.has(next)) continue;
          remaining.delete(next);
          queue.push(next);
        }
      }
      if (area >= 2) areas.push(area);
    }
  }
  return areas.sort((a, b) => b - a);
}

function hierarchical(cells: Voxel[]): Draft[] {
  const areas = plates(cells);
  const primary = areas[0] ?? 0;
  const secondary = areas[1] ?? 0;
  const tertiary = areas[2] ?? 0;
  const total = areas.reduce((sum, area) => sum + area, 0) || 1;
  const primaryGap = primary > 0 && secondary > 0 ? (primary - secondary) / primary : 0;
  const secondaryGap = secondary > 0 && tertiary > 0 ? (secondary - tertiary) / secondary : 0;
  const dominance = primary / total;
  return [
    { name: "Primary / Secondary Difference", raw: primaryGap, rawUnit: "(primary - secondary) / primary", value: clamp100(primaryGap * 100), weight: 0.4 },
    { name: "Secondary / Tertiary Difference", raw: secondaryGap, rawUnit: "(secondary - tertiary) / secondary", value: clamp100(secondaryGap * 100), weight: 0.35 },
    { name: "Largest-Region Dominance", raw: dominance, rawUnit: "primary / all plate area", value: clamp100(areas.length < 2 ? 0 : dominance * 100), weight: 0.25 },
  ];
}

function sectionalVariation(cells: Voxel[]) {
  const counts = new Map<number, number>();
  for (const cell of cells) counts.set(cell[2], (counts.get(cell[2]) ?? 0) + 1);
  const values = [...counts.values()];
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return mean ? Math.sqrt(variance) / mean : 0;
}

function asymmetry(cells: Voxel[]) {
  const bounds = boundsOf(cells);
  const occupied = new Set(cells.map(([x, y, z]) => keyOf(x, y, z)));
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  let missed = 0;
  for (const [x, y, z] of cells) {
    const mirrorX = Math.round(midX + (midX - x));
    const mirrorY = Math.round(midY + (midY - y));
    if (!occupied.has(keyOf(mirrorX, y, z))) missed += 1;
    if (!occupied.has(keyOf(x, mirrorY, z))) missed += 1;
  }
  return cells.length ? missed / (cells.length * 2) : 0;
}

function angleBetween(a: [number, number, number], b: [number, number, number]) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) * 180 / Math.PI;
}

function pointKey(point: [number, number, number]) {
  return point.map((value) => Math.round(value * 1000)).join(",");
}

function adjacentDihedral(triangles: MeshTri[]) {
  const edges = new Map<string, number[]>();
  triangles.forEach((triangle, index) => {
    if (!triangle.corners) return;
    const [a, b, c] = triangle.corners;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = [pointKey(p), pointKey(q)].sort().join("|");
      const row = edges.get(key) ?? [];
      row.push(index);
      edges.set(key, row);
    }
  });
  let weight = 0;
  let sum = 0;
  let paired = false;
  for (const indices of edges.values()) {
    if (indices.length < 2) continue;
    paired = true;
    const left = triangles[indices[0]];
    const right = triangles[indices[1]];
    const degrees = angleBetween(left.normal, right.normal);
    const pair = Math.min(left.area, right.area);
    sum += degrees * pair;
    weight += pair;
  }
  if (!paired) return null;
  return weight ? Math.min(1, (sum / weight) / 90) : 0;
}

function sculptural(cells: Voxel[], triangles: MeshTri[] | undefined): Draft[] {
  let dihedral = 0;
  let entropy = 0;
  if (triangles && triangles.length > 1) {
    let weight = 0;
    const bins = new Map<string, number>();
    for (const triangle of triangles) {
      const [nx, ny, nz] = triangle.normal;
      const id = [Math.round(nx * 2), Math.round(ny * 2), Math.round(nz * 2)].join(",");
      bins.set(id, (bins.get(id) ?? 0) + triangle.area);
      weight += triangle.area;
    }
    const adjacent = adjacentDihedral(triangles);
    if (adjacent !== null) dihedral = adjacent;
    let entropySum = 0;
    for (const area of bins.values()) {
      const p = area / (weight || 1);
      if (p > 0) entropySum -= p * Math.log(p);
    }
    entropy = weight ? Math.min(1, entropySum / Math.log(26)) : 0;
  }
  const section = Math.min(1, sectionalVariation(cells) / 0.75);
  const mirror = asymmetry(cells);
  return [
    { name: "Adjacent Normal Variation", raw: dihedral, rawUnit: "mean dihedral / 60°", value: clamp100(dihedral * 100), weight: 0.3 },
    { name: "Normal Orientation Entropy", raw: entropy, rawUnit: "Shannon / log(26)", value: clamp100(entropy * 100), weight: 0.25 },
    { name: "Sectional Area Variation", raw: section, rawUnit: "cv of Z sections / 0.75", value: clamp100(section * 100), weight: 0.25 },
    { name: "Plan Asymmetry", raw: mirror, rawUnit: "unmatched mirror cells", value: clamp100(mirror * 100), weight: 0.2 },
  ];
}

function surreal(cells: Voxel[], triangles: MeshTri[] | undefined, cellFeet: number): Draft[] {
  let nonAxis = 0;
  if (triangles?.length) {
    let total = 0;
    let unusual = 0;
    for (const triangle of triangles) {
      total += triangle.area;
      const aligned = Math.max(Math.abs(triangle.normal[0]), Math.abs(triangle.normal[1]), Math.abs(triangle.normal[2]));
      if (aligned < 0.85) unusual += triangle.area;
    }
    nonAxis = total ? unusual / total : 0;
  }
  const zs = cells.map((cell) => cell[2]);
  const mid = zs.sort((a, b) => a - b)[Math.floor(zs.length / 2)] ?? 0;
  const lower = cells.filter((cell) => cell[2] <= mid);
  const upper = cells.filter((cell) => cell[2] > mid);
  const shift = lower.length && upper.length
    ? Math.hypot(centroid(lower.map(([x, y, z]) => ({ x, y, z }))).x - centroid(upper.map(([x, y, z]) => ({ x, y, z }))).x, centroid(lower.map(([x, y, z]) => ({ x, y, z }))).y - centroid(upper.map(([x, y, z]) => ({ x, y, z }))).y)
    : 0;
  const bounds = boundsOf(cells);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  const shiftRaw = Math.min(1, shift / diagonal);
  const areas = plates(cells);
  const mean = areas.length ? areas.reduce((sum, area) => sum + area, 0) / areas.length : 0;
  const cv = mean ? Math.sqrt(areas.reduce((sum, area) => sum + (area - mean) ** 2, 0) / areas.length) / mean : 0;
  const scaleRaw = Math.min(1, cv / 1.2);
  const occupied = new Set(cells.map(([x, y, z]) => keyOf(x, y, z)));
  let upperCells = 0;
  let unsupported = 0;
  for (const [x, y, z] of cells) {
    if (z <= bounds.minZ) continue;
    upperCells += 1;
    let supported = false;
    for (let dx = -1; dx <= 1 && !supported; dx += 1) {
      for (let dy = -1; dy <= 1 && !supported; dy += 1) {
        for (let below = bounds.minZ; below < z; below += 1) {
          if (occupied.has(keyOf(x + dx, y + dy, below))) {
            supported = true;
            break;
          }
        }
      }
    }
    if (!supported) unsupported += 1;
  }
  const cantilever = upperCells ? unsupported / upperCells : 0;
  return [
    { name: "Non-Axis-Aligned Surface", raw: nonAxis, rawUnit: "area share off the axes", value: clamp100(nonAxis * 100), weight: 0.3 },
    { name: "Upper / Lower Centroid Shift", raw: shiftRaw, rawUnit: "plan shift / diagonal", value: clamp100(shiftRaw * 100), weight: 0.25 },
    { name: "Component Scale Variance", raw: scaleRaw, rawUnit: "plate-area cv / 1.2", value: clamp100(scaleRaw * 100), weight: 0.25 },
    { name: "Cantilevered Offset", raw: cantilever, rawUnit: `unsupported upper cells on a ${cellFeet} ft grid`, value: clamp100(cantilever * 100), weight: 0.2 },
  ];
}

function monumental(input: SpatialInput, cells: Voxel[]): Draft[] {
  const feet = input.cellFeet ?? 2;
  const bounds = boundsOf(cells);
  const span = [
    (bounds.maxX - bounds.minX + 1) * feet,
    (bounds.maxY - bounds.minY + 1) * feet,
    (bounds.maxZ - bounds.minZ + 1) * feet,
  ];
  const bbox = input.bboxFeet ?? [span[0], span[1], span[2]];
  const height = bbox[2];
  // 8 ft reads as low. 40 ft reads as high. Fixed architectural scale, not this set.
  const heightRaw = (height - 8) / (40 - 8);
  const volume = input.occupiedVolumeFeet ?? cells.length * feet * feet * feet;
  // 400 cu ft is a small room. 12,000 cu ft is a large hall. Fixed scale.
  const volumeRaw = (volume - 400) / (12000 - 400);
  const dominance = height / Math.max(bbox[0], bbox[1], 0.01);
  // 0.4 is a flat slab. 2.5 is a tower. These cubes land in between.
  const dominanceRaw = (dominance - 0.4) / (2.5 - 0.4);
  return [
    { name: "Calibrated Height", raw: height, rawUnit: "feet", value: clamp100(heightRaw * 100), weight: 0.4 },
    { name: "Calibrated Volume", raw: volume, rawUnit: "cubic feet", value: clamp100(volumeRaw * 100), weight: 0.35 },
    { name: "Vertical Dominance", raw: dominance, rawUnit: "height / max plan side", value: clamp100(dominanceRaw * 100), weight: 0.25 },
  ];
}

const SKY: Array<[number, number, number]> = [
  [0, 0, 1],
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [-1, -1, 1],
];

function luminous(occupied: Set<string>, list: Cell[], bounds: ReturnType<typeof boundsOf>, triangles: MeshTri[] | undefined): Draft[] {
  const samples = list.filter((_, index) => index % Math.max(1, Math.floor(list.length / 36)) === 0).slice(0, 36);
  let exposure = 0;
  let penetration = 0;
  let penetrationCount = 0;
  const height = Math.max(1, bounds.maxZ - bounds.minZ + 1);
  for (const sample of samples) {
    let open = 0;
    for (const [dx, dy, dz] of SKY) {
      const reach = Math.max(height + 2, 8);
      const target = { x: sample.x + dx * reach, y: sample.y + dy * reach, z: sample.z + dz * reach };
      const hit = rayClear(occupied, sample, target);
      penetration += Math.min(1, hit.distance / height);
      penetrationCount += 1;
      if (hit.clear) open += 1;
    }
    exposure += open / SKY.length;
  }
  const exposureRaw = samples.length ? exposure / samples.length : 0;
  const penetrationRaw = penetrationCount ? penetration / penetrationCount : 0;
  let opening = 0;
  if (triangles?.length) {
    const upward = triangles.filter((triangle) => triangle.normal[2] >= 0.65);
    const step = Math.max(1, Math.floor(upward.length / 48));
    let sampled = 0;
    let clear = 0;
    for (let index = 0; index < upward.length; index += step) {
      const triangle = upward[index];
      sampled += triangle.area;
      const origin = {
        x: Math.round(triangle.centroid[0]),
        y: Math.round(triangle.centroid[1]),
        z: Math.round(triangle.centroid[2]) + 1,
      };
      const hit = rayClear(occupied, origin, { x: origin.x, y: origin.y, z: origin.z + height + 3 });
      if (hit.clear) clear += triangle.area;
    }
    opening = sampled ? clear / sampled : 0;
  } else {
    const plan = new Set(list.map((cell) => `${cell.x},${cell.y}`));
    let lit = 0;
    for (const column of plan) {
      const [x, y] = column.split(",").map(Number);
      const tops = list.filter((cell) => cell.x === x && cell.y === y);
      const top = tops[tops.length - 1];
      if (!top) continue;
      if (rayClear(occupied, top, { x, y, z: top.z + height + 3 }).clear) lit += 1;
    }
    opening = plan.size ? lit / plan.size : 0;
  }
  return [
    { name: "Upward Hemispherical Exposure", raw: exposureRaw, rawUnit: "open sky rays / rays", value: clamp100(exposureRaw * 100), weight: 0.4 },
    { name: "Sky-Facing Opening", raw: opening, rawUnit: "clear upward area share", value: clamp100(opening * 100), weight: 0.3 },
    { name: "Daylight Penetration", raw: penetrationRaw, rawUnit: "clear distance / height", value: clamp100(penetrationRaw * 100), weight: 0.3 },
  ];
}

export type SpatialDescriptors = {
  convergent: Draft[];
  centralized: Draft[];
  verticallyIntegrated: Draft[];
  sculptural: Draft[];
  visuallyConnected: Draft[];
  surreal: Draft[];
  hierarchical: Draft[];
  sequential: Draft[];
  circulationActivated: Draft[];
  monumental: Draft[];
  luminous: Draft[];
};

export function measureSpatialDescriptors(input: SpatialInput): SpatialDescriptors {
  const cells = input.cells;
  const empty: SpatialDescriptors = {
    convergent: corridorScore([], new Map(), { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }),
    centralized: centralized([[0, 0, 0]]),
    verticallyIntegrated: verticallyIntegrated(new Set(), [], new Map()),
    sculptural: sculptural([], input.triangles),
    visuallyConnected: visuallyConnected(new Set(), [], { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }),
    surreal: surreal([], input.triangles, input.cellFeet ?? 2),
    hierarchical: hierarchical([]),
    sequential: sequentialAndCirculation([], new Map()).sequential,
    circulationActivated: sequentialAndCirculation([], new Map()).circulation,
    monumental: monumental(input, cells.length ? cells : [[0, 0, 0]]),
    luminous: luminous(new Set(), [], { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }, input.triangles),
  };
  if (!cells.length) return empty;
  const occupied = new Set(cells.map(([x, y, z]) => keyOf(x, y, z)));
  const bounds = boundsOf(cells);
  const walk = walkableCells(occupied, bounds);
  const links = networkLinks(walk.set, occupied, walk.list);
  const routes = sequentialAndCirculation(walk.list, links);
  return {
    convergent: corridorScore(walk.list, links, bounds),
    centralized: centralized(cells),
    verticallyIntegrated: verticallyIntegrated(occupied, walk.list, links),
    sculptural: sculptural(cells, input.triangles),
    visuallyConnected: visuallyConnected(occupied, walk.list, bounds),
    surreal: surreal(cells, input.triangles, input.cellFeet ?? 2),
    hierarchical: hierarchical(cells),
    sequential: routes.sequential,
    circulationActivated: routes.circulation,
    monumental: monumental(input, cells),
    luminous: luminous(occupied, walk.list, bounds, input.triangles),
  };
}
