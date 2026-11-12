import type { ConnectionReport, Direction, Mirror, PlacedTile, PortCandidate, PortPair, PortRejection, Rotation, TileModel } from "./types";
import { portRouteClear, portPairClearanceValidated } from "./portMatching";
import { transitionMeshes, pathLength, transitionPath } from "./transitionGeometry";
import { transitionSurfaceClear } from "./connectionClearance";
import { LATTICE_FEET, oppositeDirection, placementWorldZ, unpackCell } from "./types";

export type ConnectorKind = "bridge" | "plate" | "ramp" | "stair" | "landing" | "vertical-link";

export type GeneratedConnector = {
  id: string;
  kind: ConnectorKind;
  fromTile: string;
  toTile: string;
  direction: Direction | "none";
  /** Thin walkable slab vertices (feet, Z-up). */
  positions: Float32Array;
  indices: number[];
  reason: string;
  cost: number;
  portPair?:PortPair;
};

export type SynthesisResult = {
  connectors: GeneratedConnector[];
  directInterlocks: number;
  bridges: number;
  ramps: number;
  stairs: number;
  landings: number;
  verticalLinks: number;
  connectorCost: number;
  /** Assignment-mode accepted architectural relationships (also includes near-touch pairs). */
  portPairs?: PortPair[];
  fallbackConnections?: number;
  portCandidates?: PortCandidate[];
  connectionDiagnostics?: {candidateCount:number;acceptedCount:number;rejectedCount:number;rejectionCounts:Partial<Record<PortRejection,number>>;componentsBefore:number;componentsAfter:number};
};

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function rotateMirrorOffset(x: number, y: number, z: number, rotation: Rotation, mirror: Mirror): [number, number, number] {
  let px = mirror === "x" ? -x : x;
  let py = mirror === "y" ? -y : y;
  const pz = z;
  if (rotation === 90) {
    const nextX = -py;
    py = px;
    px = nextX;
  } else if (rotation === 180) {
    px = -px;
    py = -py;
  } else if (rotation === 270) {
    const nextX = py;
    py = -px;
    px = nextX;
  }
  return [px, py, pz];
}

/** World point for a registered tile: lattice root + offset from registration anchor. */
function tileWorldPoint(tile: PlacedTile, model: TileModel, localFromAnchor: [number, number, number]): [number, number, number] {
  const variant = model.variants[tile.variant] ?? model.variants[0];
  const [lx, ly, lz] = rotateMirrorOffset(localFromAnchor[0], localFromAnchor[1], localFromAnchor[2], variant.rotation, variant.mirror);
  return [tile.ix * LATTICE_FEET + lx, tile.iy * LATTICE_FEET + ly, placementWorldZ(tile) + lz];
}

function tileFacePoint(tile: PlacedTile, model: TileModel, direction: Direction | "none"): [number, number, number] {
  const [ax, ay, az] = model.anchor;
  const [minX, minY, minZ] = model.bboxMin;
  const [maxX, maxY, maxZ] = model.bboxMax;
  void minZ;
  const midZ = az + Math.max(1.0, (maxZ - minZ) * 0.2);
  let local: [number, number, number] = [model.center[0] - ax, model.center[1] - ay, midZ - az];
  if (direction === "+X") local = [maxX - ax, model.center[1] - ay, midZ - az];
  if (direction === "-X") local = [minX - ax, model.center[1] - ay, midZ - az];
  if (direction === "+Y") local = [model.center[0] - ax, maxY - ay, midZ - az];
  if (direction === "-Y") local = [model.center[0] - ax, minY - ay, midZ - az];
  if (direction === "+Z") local = [model.center[0] - ax, model.center[1] - ay, maxZ - az];
  if (direction === "-Z") local = [model.center[0] - ax, model.center[1] - ay, Math.max(0.5, midZ - az)];
  return tileWorldPoint(tile, model, local);
}

function walkableWorldPoints(tile: PlacedTile, model: TileModel): Array<[number, number, number]> {
  const variant = model.variants[tile.variant] ?? model.variants[0];
  const packed = variant.floor.length ? variant.floor : variant.passage.length ? variant.passage : variant.occupied;
  if (!packed.length) return [];
  const cell = model.cellFeet;
  const step = packed.length > 160 ? Math.ceil(packed.length / 160) : 1;
  const out: Array<[number, number, number]> = [];
  const z0 = placementWorldZ(tile);
  for (let index = 0; index < packed.length; index += step) {
    const [x, y, z] = unpackCell(packed[index]);
    out.push([
      tile.ix * LATTICE_FEET + (x + 0.5) * cell,
      tile.iy * LATTICE_FEET + (y + 0.5) * cell,
      z0 + (z + 0.5) * cell,
    ]);
  }
  return out;
}

export type BranchPair = {
  from: [number, number, number];
  to: [number, number, number];
  distance: number;
  plan: number;
  rise: number;
};

export function closestBranchPair(a: PlacedTile, modelA: TileModel, b: PlacedTile, modelB: TileModel): BranchPair | null {
  const pa = walkableWorldPoints(a, modelA);
  const pb = walkableWorldPoints(b, modelB);
  if (!pa.length || !pb.length) return null;
  let best: BranchPair | null = null;
  for (const from of pa) {
    for (const to of pb) {
      const plan = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const rise = to[2] - from[2];
      const distance = Math.hypot(plan, rise);
      if (!best || distance < best.distance) best = { from, to, distance, plan, rise };
    }
  }
  return best;
}

/** Higher is better. Rewards orientations where branch tips nearly meet. */
export function branchProximityBonus(models: TileModel[], tiles: PlacedTile[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const resolve = (id: string) => byId.get(id) ?? byId.get(sourceIdOf(id));
  let bonus = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const a = tiles[i];
      const b = tiles[j];
      if (Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy) > 1) continue;
      const modelA = resolve(a.id);
      const modelB = resolve(b.id);
      if (!modelA || !modelB) continue;
      const pair = closestBranchPair(a, modelA, b, modelB);
      if (!pair) continue;
      bonus += Math.max(0, 16 - pair.distance) * 1.8;
      if (pair.distance < 6) bonus += 8;
      if (pair.distance < 3) bonus += 10;
    }
  }
  return bonus;
}

function landingPad(center: [number, number, number], size: number) {
  return orientedSlab(
    [center[0] - size / 2, center[1], center[2]],
    [center[0] + size / 2, center[1], center[2]],
    size,
    0.38,
  );
}

/** Thin walkable slab that follows from→to. Not an AABB (those became gold blocks). */
function orientedSlab(
  from: [number, number, number],
  to: [number, number, number],
  width: number,
  thickness: number,
): { positions: Float32Array; indices: number[] } | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.35) return null;
  const ux = dx / len;
  const uy = dy / len;
  let px = -uy;
  let py = ux;
  let plen = Math.hypot(px, py);
  if (plen < 1e-6) {
    px = 1;
    py = 0;
    plen = 1;
  }
  px /= plen;
  py /= plen;
  const hw = width / 2;
  const ht = thickness / 2;
  const corners: Array<[number, number, number]> = [];
  for (const end of [from, to] as const) {
    for (const side of [-1, 1] as const) {
      for (const up of [-1, 1] as const) {
        corners.push([
          end[0] + px * hw * side,
          end[1] + py * hw * side,
          end[2] + ht * up,
        ]);
      }
    }
  }
  // 0 from-s-dn, 1 from-s-up, 2 from+s-dn, 3 from+s-up, 4 to-s-dn, 5 to-s-up, 6 to+s-dn, 7 to+s-up
  const positions = new Float32Array(corners.flat());
  const indices = [
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
    1, 3, 7, 1, 7, 5,
    0, 4, 6, 0, 6, 2,
  ];
  return { positions, indices };
}

function stairFlight(
  from: [number, number, number],
  to: [number, number, number],
  steps: number,
): GeneratedConnector[] {
  const out: GeneratedConnector[] = [];
  for (let index = 0; index < steps; index += 1) {
    const t0 = index / steps;
    const t1 = (index + 1) / steps;
    const a: [number, number, number] = [
      from[0] + (to[0] - from[0]) * t0,
      from[1] + (to[1] - from[1]) * t0,
      from[2] + (to[2] - from[2]) * t0,
    ];
    const b: [number, number, number] = [
      from[0] + (to[0] - from[0]) * t1,
      from[1] + (to[1] - from[1]) * t1,
      from[2] + (to[2] - from[2]) * t1,
    ];
    const mesh = orientedSlab(a, b, 3.2, 0.45);
    if (!mesh) continue;
    out.push({
      id: `stair-step-${index}`,
      kind: index === 0 || index === steps - 1 ? "landing" : "stair",
      fromTile: "",
      toTile: "",
      direction: "none",
      positions: mesh.positions,
      indices: mesh.indices,
      reason: "Stair riser / tread for vertical registration difference",
      cost: 1.2,
    });
  }
  return out;
}

/**
 * Priority hierarchy:
 * 1 direct interlock (voxel touch) → no mesh
 * 2 landings at both branch tips
 * 3 short plate / bridge between tips
 * 4 ramp
 * 5 stair flight
 */
export function synthesizeConnectors(
  models: TileModel[],
  placed: PlacedTile[],
  connections: ConnectionReport[],
  options?: { portPairs: PortPair[]; candidates?: PortCandidate[]; componentsBefore?:number; componentsAfter?:number; rejectionCounts?:Partial<Record<PortRejection,number>> },
): SynthesisResult {
  if (options) {
    const result=synthesizePortConnectors(models,placed,connections,options.portPairs);
    result.portCandidates=options.candidates;
    if(options.candidates)result.connectionDiagnostics={candidateCount:options.candidates.length,acceptedCount:result.portPairs!.length,rejectedCount:options.candidates.length-result.portPairs!.length,rejectionCounts:options.rejectionCounts??{},componentsBefore:options.componentsBefore??placed.length,componentsAfter:options.componentsAfter??placed.length};
    return result;
  }
  const byTile = new Map(placed.map((tile) => [tile.id, tile]));
  const byModel = new Map(models.map((model) => [model.id, model]));
  const resolveModel = (tileId: string) => byModel.get(tileId) ?? byModel.get(sourceIdOf(tileId));
  const connectors: GeneratedConnector[] = [];
  let directInterlocks = 0;
  let bridges = 0;
  let ramps = 0;
  let stairs = 0;
  let landings = 0;
  let verticalLinks = 0;
  let connectorCost = 0;
  const handled = new Set<string>();

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  function addMesh(
    id: string,
    kind: ConnectorKind,
    fromTile: string,
    toTile: string,
    direction: Direction | "none",
    mesh: { positions: Float32Array; indices: number[] },
    reason: string,
    cost: number,
  ) {
    connectors.push({ id, kind, fromTile, toTile, direction, positions: mesh.positions, indices: mesh.indices, reason, cost });
    if (kind === "bridge" || kind === "plate") bridges += 1;
    else if (kind === "ramp") ramps += 1;
    else if (kind === "stair") stairs += 1;
    else if (kind === "landing") landings += 1;
    else verticalLinks += 1;
    connectorCost += cost;
  }

  function joinBranches(
    a: PlacedTile,
    b: PlacedTile,
    modelA: TileModel,
    modelB: TileModel,
    direction: Direction | "none",
    force: boolean,
  ) {
    const key = pairKey(a.id, b.id);
    if (handled.has(key)) return;
    const pair = closestBranchPair(a, modelA, b, modelB);
    const fallbackFrom = tileFacePoint(a, modelA, direction);
    const fallbackTo = tileFacePoint(b, modelB, direction === "none" ? "none" : oppositeDirection(direction));
    const from = pair?.from ?? fallbackFrom;
    const to = pair?.to ?? fallbackTo;
    const plan = pair?.plan ?? Math.hypot(to[0] - from[0], to[1] - from[1]);
    const absRise = Math.abs(pair?.rise ?? (to[2] - from[2]));
    const distance = pair?.distance ?? Math.hypot(plan, absRise);
    if (distance < 1.15) {
      handled.add(key);
      directInterlocks += 1;
      return;
    }
    if (plan > 16 || absRise > LATTICE_FEET * 1.15) return;
    if (!force && distance > 14) return;
    handled.add(key);
    const idBase = `${a.id}__${b.id}`;

    const padA = landingPad(from, 3.6);
    const padB = landingPad(to, 3.6);
    if (padA) addMesh(`${idBase}-landing-a`, "landing", a.id, b.id, direction, padA, "Landing at branch tip", 0.8);
    if (padB) addMesh(`${idBase}-landing-b`, "landing", a.id, b.id, direction, padB, "Landing at branch tip", 0.8);

    if (absRise < 1.4) {
      const mesh = orientedSlab(from, to, plan < 7 ? 3.8 : 3.2, 0.36);
      if (mesh) addMesh(`${idBase}-bridge`, plan < 7 ? "plate" : "bridge", a.id, b.id, direction, mesh, "Plate / bridge between facing branches", plan < 7 ? 1 : 2);
      return;
    }
    if (plan >= absRise * 0.55 && absRise <= 12) {
      const mesh = orientedSlab(from, to, 3.2, 0.34);
      if (mesh) addMesh(`${idBase}-ramp`, "ramp", a.id, b.id, direction, mesh, "Ramp between offset branch levels", 2.5);
      return;
    }
    const steps = Math.max(3, Math.min(9, Math.round(absRise / 1.8)));
    for (const step of stairFlight(from, to, steps)) {
      addMesh(`${idBase}-${step.kind}-${step.id}`, step.kind, a.id, b.id, direction, { positions: step.positions, indices: step.indices }, "Stair between branch joints", step.cost);
    }
  }

  for (const connection of connections) {
    const a = byTile.get(connection.tileA);
    const b = byTile.get(connection.tileB);
    const modelA = a ? resolveModel(a.id) : undefined;
    const modelB = b ? resolveModel(b.id) : undefined;
    if (!a || !b || !modelA || !modelB) continue;
    const manhattan = Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy);
    if (manhattan > 1) continue;
    if (connection.interlock === "PASS" && connection.collision !== "FAIL" && connection.floor === "PASS") {
      handled.add(pairKey(a.id, b.id));
      directInterlocks += 1;
      continue;
    }
    joinBranches(a, b, modelA, modelB, connection.direction, true);
  }

  // Neighbor tiles with no voxel report still get branch joints if tips are close.
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      if (Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy) > 1) continue;
      const modelA = resolveModel(a.id);
      const modelB = resolveModel(b.id);
      if (!modelA || !modelB) continue;
      joinBranches(a, b, modelA, modelB, "none", false);
    }
  }

  return {
    connectors,
    directInterlocks,
    bridges,
    ramps,
    stairs,
    landings,
    verticalLinks,
    connectorCost,
  };
}

/** Assignment-only synthesis. Existing GLOBAL FIELD callers keep the legacy path above. */
function synthesizePortConnectors(models: TileModel[], tiles: PlacedTile[], reports: ConnectionReport[], portPairs: PortPair[]): SynthesisResult {
  const result: SynthesisResult = {connectors:[],directInterlocks:0,bridges:0,ramps:0,stairs:0,landings:0,verticalLinks:0,connectorCost:0,portPairs,fallbackConnections:0};
  result.portPairs=[];
  const add = (original: PortPair, fallback=false) => {
    const pair:PortPair={...original,connectionClass:original.connectionClass??(Math.abs(original.rise)>.5?"VERTICAL":original.plan<=4?"DIRECT":"ADAPTIVE")};
    pair.path=pair.path??transitionPath(pair);
    if(!portPairClearanceValidated(original,models,tiles)&&!transitionSurfaceClear(pair,tiles,models,result.connectors))return false;
    const meshes=transitionMeshes(pair),run=pathLength(pair.path);
    const area=run*((pair.startWidth??pair.usableWidth)+(pair.endWidth??pair.usableWidth))/2;
    const cost=area*.025+area*.25*.015+Math.abs(pair.rise)*.4;
    for(const [index,mesh] of meshes.entries())result.connectors.push({id:`${pair.tileA}__${pair.tileB}-loft-${index}`,fromTile:pair.tileA,toTile:pair.tileB,direction:"none",...mesh,portPair:pair,cost:cost/meshes.length,reason:fallback?"Conservative edge-profile fallback":`${pair.connectionClass}: interpolated usable edges, widths and directions`});
    result.connectorCost+=cost;
    if(pair.connectionClass==="DIRECT")result.directInterlocks++;
    if(meshes[0]?.kind==="ramp")result.ramps++;
    else if(meshes[0]?.kind==="stair")result.stairs++;
    else result.bridges++;
    if(!fallback)result.portPairs!.push(pair);
    return true;
  };
  for(const pair of portPairs)add(pair);
  // A backwards or blocked pair must not be rescued by generic nearest points.
  // Fallback only when extraction is unavailable on at least one form, and only for short level gaps.
  for (let i=0;i<tiles.length;i++) for (let j=i+1;j<tiles.length;j++) {
    const a=tiles[i],b=tiles[j];
    if (Math.abs(a.ix-b.ix)+Math.abs(a.iy-b.iy)>1 || portPairs.some(p=>p.tileA===a.id&&p.tileB===b.id)) continue;
    const ma=models.find(m=>m.id===a.id),mb=models.find(m=>m.id===b.id);
    if (!ma || !mb) continue;
    if ((ma.variants[a.variant].ports?.length??0)>0 && (mb.variants[b.variant].ports?.length??0)>0) continue;
    if (!ma.variants[a.variant].floor.length || !mb.variants[b.variant].floor.length) continue;
    if (reports.some(r=>((r.tileA===a.id&&r.tileB===b.id)||(r.tileA===b.id&&r.tileB===a.id))&&r.collision==="FAIL")) continue;
    const pair=closestBranchPair(a,ma,b,mb);
    if (!pair || pair.plan>6 || Math.abs(pair.rise)>.5 || !portRouteClear(pair.from,pair.to,2.5,tiles,models,[a.id,b.id])) continue;
    if(add({...pair,tileA:a.id,tileB:b.id,portA:"fallback",portB:"fallback",usableWidth:2.5,facing:1,widthCompatibility:1,confidence:.55,score:0},true))result.fallbackConnections!++;
  }
  return result;
}

export function connectorsToObj(connectors: GeneratedConnector[]) {
  const lines = ["# Generated connection synthesis geometry", "o generated_connectors"];
  let offset = 1;
  for (const connector of connectors) {
    lines.push(`g ${connector.kind}_${connector.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`);
    for (let index = 0; index < connector.positions.length; index += 3) {
      lines.push(`v ${connector.positions[index].toFixed(5)} ${connector.positions[index + 1].toFixed(5)} ${connector.positions[index + 2].toFixed(5)}`);
    }
    for (let index = 0; index < connector.indices.length; index += 3) {
      lines.push(`f ${connector.indices[index] + offset} ${connector.indices[index + 1] + offset} ${connector.indices[index + 2] + offset}`);
    }
    offset += connector.positions.length / 3;
  }
  return `${lines.join("\n")}\n`;
}
