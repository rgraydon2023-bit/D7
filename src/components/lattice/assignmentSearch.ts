import { matchAssemblyPorts } from "./portMatching";
import { synthesizeConnectors, type SynthesisResult } from "./connectionSynthesis";
import { evaluateAssembly } from "./search";
import { LATTICE_SLOTS, slotById, type LatticeSlot } from "./slots";
import type {
  Assembly,
  ImportedObj,
  ConnectionReport,
  LatticeField,
  Mirror,
  Placement,
  PlacementNote,
  PlacedTile,
  Rotation,
  ScoreParts,
  TileModel,
} from "./types";
import { clampLatticeCells, LATTICE_FEET, MIRRORS, ROTATIONS, placementWorldZ, variantIndex } from "./types";

export type AssemblyTestMode = "catalog" | "copies-2" | "copies-3" | "copies-4" | "copies-8" | "global-field";

export const ASSEMBLY_TEST_LABELS: Record<AssemblyTestMode, string> = {
  catalog: "CATALOG TEST",
  "copies-2": "2 FORMS",
  "copies-3": "3 FORMS",
  "copies-4": "4 FORMS",
  "copies-8": "8 FORMS",
  "global-field": "GLOBAL FIELD — EXPERIMENTAL",
};

export type AssignmentObjective = "balanced" | "continuity" | "variation";

export type AssignmentResult = {
  mode: AssemblyTestMode;
  copyCount: number;
  field: LatticeField;
  tiles: PlacedTile[];
  models: TileModel[];
  placements: Record<string, Placement>;
  connections: ConnectionReport[];
  synthesis: SynthesisResult;
  score: number;
  parts: ScoreParts;
  components: number;
  objectiveScores: Record<AssignmentObjective, number>;
  placementNotes: PlacementNote[];
  candidatesTested: number;
  milliseconds: number;
  typologyRetention: number;
  primaryPreserved: number;
  status: "PASS" | "REVIEW" | "FAIL";
  summary: string;
  formIds: string[];
};

export type CatalogRow = {
  slotId: string;
  code: string;
  name: string;
  category: string;
  mapped: boolean;
  bestCopies: number;
  score: number;
  status: "PASS" | "REVIEW" | "FAIL" | "UNMAPPED";
  warning: string | null;
  result: AssignmentResult | null;
};

/** Registration field sized for multi-form tests — not a 400-cell global board. */
export function assignmentFieldForCopies(copyCount: number): LatticeField {
  if (copyCount <= 2) return { cellsX: 3, cellsY: 3, cellsZ: 2 };
  if (copyCount <= 4) return { cellsX: 4, cellsY: 4, cellsZ: 3 };
  return { cellsX: 5, cellsY: 5, cellsZ: 3 };
}

export function registrationLabel(cellsZ?: number) {
  return `${LATTICE_FEET}' × ${LATTICE_FEET}' plan bays · ${cellsZ === 1 ? "single lattice level · no stacking or zLift" : "in-bay vertical stacking with gaps allowed"}`;
}

export function mappingStatus(models: TileModel[]) {
  const bySlot = new Map(models.filter((model) => model.slotId).map((model) => [model.slotId!, model]));
  const required = ["G1", "G2", "G3", "G4", "G5", "O1", "O2", "O3", "O4", "O5", "L1", "L2", "L3", "L4", "L5"];
  const missing = required.filter((id) => !bySlot.has(id));
  const mapped = required.length - missing.length;
  return { mapped, total: required.length, missing, complete: missing.length === 0, bySlot };
}

type Hooks = { cancelled: () => boolean; onProgress: (message: string, percent?: number) => void };

function categoryOf(model: TileModel): LatticeSlot["category"] | "Unknown" {
  return slotById(model.slotId)?.category ?? "Unknown";
}

function instanceId(model: TileModel, index: number) {
  return `${model.id}::${index}`;
}

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

/** Resolve slot assignments by stable source ID; suggested slots never confer eligibility. */
export function buildAssignedSourcePool(
  models: TileModel[],
  sources: Pick<ImportedObj, "id" | "filename">[],
  assignments: Record<string, string | null>,
): TileModel[] {
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const modelById = new Map(models.filter(model => !model.id.includes("::")).map(model => [model.id, model]));
  const eligible: TileModel[] = [];
  const seen = new Set<string>();
  for (const slot of LATTICE_SLOTS) {
    const sourceId = assignments[slot.id];
    if (!sourceId) continue;
    const source = sourceById.get(sourceId);
    const model = modelById.get(sourceId);
    if (!source || !model) throw new Error(
      `Assigned source unavailable for ${slot.id}: ${sourceId}. Wait for analysis or reassign the slot.`,
    );
    if (seen.has(sourceId)) throw new Error(`Source ${sourceId} is assigned to multiple slots.`);
    seen.add(sourceId);
    eligible.push({ ...model, id: sourceId, slotId: slot.id, filename: source.filename });
  }
  return eligible;
}

/** Reject any placement whose stable source is outside this run's authority boundary. */
export function assertEligibleAssignmentSources(
  tiles: PlacedTile[],
  models: TileModel[],
  eligibleAssignedSourceIds: ReadonlySet<string>,
) {
  const modelById = new Map(models.map(model => [model.id, model]));
  for (const model of models) {
    if (!eligibleAssignedSourceIds.has(sourceIdOf(model.id))) {
      throw new Error(`Assignment source eligibility violation: ${model.id}`);
    }
  }
  for (const tile of tiles) {
    if (!modelById.has(tile.id) || !eligibleAssignedSourceIds.has(sourceIdOf(tile.id))) {
      throw new Error(`Assignment tile source eligibility violation: ${tile.id}`);
    }
  }
}

/** Prefer eligible seed identities, then assigned slots by category; never import seed records. */
export function selectDistinctForms(
  pool: TileModel[],
  count: number,
  seeds: TileModel[] = [],
): TileModel[] {
  const canonical = new Map<string, TileModel>();
  for (const model of pool) {
    if (model.id.includes("::") || canonical.has(model.id)) continue;
    canonical.set(model.id, model);
  }
  const slotOrder = new Map(LATTICE_SLOTS.map((slot, index) => [slot.id, index]));
  const uniquePool = [...canonical.values()].sort((a, b) =>
    (slotOrder.get(a.slotId ?? "") ?? 99) - (slotOrder.get(b.slotId ?? "") ?? 99) || a.id.localeCompare(b.id),
  );
  if (!uniquePool.length) return [];
  const byCategory: Record<string, TileModel[]> = { Gathering: [], Office: [], Lobby: [], Unknown: [] };
  for (const model of uniquePool) byCategory[categoryOf(model)].push(model);

  const picked: TileModel[] = [];
  const used = new Set<string>();
  const take = (model: TileModel | undefined) => {
    if (!model || used.has(model.id) || picked.length >= count) return;
    used.add(model.id);
    picked.push(model);
  };

  for (const seed of seeds) take(canonical.get(sourceIdOf(seed.id)));

  const order: Array<LatticeSlot["category"] | "Unknown"> = ["Gathering", "Office", "Lobby", "Unknown"];
  let guard = 0;
  while (picked.length < count && picked.length < uniquePool.length && guard < count * 8) {
    for (const category of order) {
      const next = byCategory[category].find((model) => !used.has(model.id));
      take(next);
      if (picked.length >= count) break;
    }
    guard += 1;
  }

  // Last resort: repeat forms only if the catalog is smaller than the requested count.
  let repeat = 0;
  while (picked.length < count) {
    const model = uniquePool[repeat % uniquePool.length];
    picked.push(model);
    repeat += 1;
  }
  return picked.slice(0, count);
}

function materializeInstances(forms: TileModel[]): TileModel[] {
  return forms.map((model, index) => ({
    ...model,
    id: instanceId(model, index),
    filename: `${slotById(model.slotId)?.code ?? model.filename} · ${model.filename}`,
  }));
}

/** Extend only assignment connectivity with accepted, collision-checked port routes. */
function evaluateAssignment(instances: TileModel[], tiles: PlacedTile[], collectDiagnostics=false) {
  const evaled = evaluateAssembly(instances, tiles);
  const portMatches = matchAssemblyPorts(instances, tiles, evaled.connections, {}, collectDiagnostics);
  const parent = new Map(tiles.map(tile => [tile.id, tile.id]));
  const find = (id: string): string => parent.get(id) === id ? id : find(parent.get(id)!);
  for (const edge of [...evaled.connections.filter(c => c.interlock === "PASS" && c.collision !== "FAIL" && (c.floor === "PASS" || c.circulation === "PASS")), ...portMatches.pairs]) {
    parent.set(find(edge.tileA), find(edge.tileB));
  }
  evaled.components = new Set(tiles.map(tile => find(tile.id))).size;
  evaled.parts = {...evaled.parts, connectivity: Math.max(0, tiles.length-evaled.components)};
  return {evaled, portMatches};
}

function scoreObjective(evaled: ReturnType<typeof evaluateAssembly>, synthesis: SynthesisResult, objective: AssignmentObjective, variationBoost: number, portScore = 0) {
  const baseContinuity =
    evaled.parts.floor * 6 +
    evaled.parts.circulation * 6 +
    evaled.parts.void * 3 +
    evaled.parts.connectivity * 5;
  const continuity = baseContinuity + portScore - synthesis.connectorCost * 0.9 - evaled.parts.collision * 5;
  const balanced =
    evaled.parts.interlock * 8 +
    baseContinuity * 0.7 +
    portScore +
    evaled.parts.richness * 1.2 -
    synthesis.connectorCost * 1.2 -
    evaled.parts.collision * 5;
  const variation = balanced + variationBoost * 1.2 + evaled.parts.vertical * 0.8;
  if (objective === "continuity") return continuity;
  if (objective === "variation") return variation;
  return balanced;
}

function typologyRetentionScore(forms: TileModel[], evaled: ReturnType<typeof evaluateAssembly>, synthesis: SynthesisResult) {
  const unique = new Set(forms.map((model) => sourceIdOf(model.id))).size;
  let score = 55 + Math.min(25, unique * 4);
  const categories = new Set(forms.map((model) => categoryOf(model)));
  score += categories.size * 5;
  if (evaled.parts.floor + evaled.parts.circulation > 0) score += 8;
  score -= Math.min(20, synthesis.connectorCost * 1.1);
  return Math.max(0, Math.min(100, score));
}

function tileHeight(model: TileModel) {
  return Math.max(2, model.maxZ - model.minZ);
}

function toPlacements(instances: TileModel[], tiles: PlacedTile[]): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  for (const tile of tiles) {
    const model = instances.find((item) => item.id === tile.id);
    const variant = model?.variants[tile.variant];
    out[tile.id] = {
      meshId: tile.id,
      slotId: model?.slotId ?? null,
      rotation: variant?.rotation ?? 0,
      mirror: variant?.mirror ?? "none",
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
      zLift: tile.zLift ?? 0,
      locked: false,
    };
  }
  return out;
}

function formLabel(forms: TileModel[]) {
  return forms.map((model) => slotById(model.slotId)?.code ?? model.filename.replace(/\.[^.]+$/, "")).join(" · ");
}

function finalize(
  mode: AssemblyTestMode,
  copyCount: number,
  field: LatticeField,
  forms: TileModel[],
  instances: TileModel[],
  tiles: PlacedTile[],
  tested: number,
  started: number,
  variationBoost: number,
): AssignmentResult {
  const {evaled, portMatches} = evaluateAssignment(instances, tiles, true);
  const synthesis = synthesizeConnectors(instances, tiles, evaled.connections, {portPairs: portMatches.pairs, ...portMatches});
  const typologyRetention = typologyRetentionScore(instances, evaled, synthesis);
  const primaryPreserved = Math.max(0, 100 - synthesis.connectorCost * 4);
  const uniqueForms = new Set(forms.map((model) => model.id)).size;
  const portScore = portMatches.score;
  const objectiveScores = {
    balanced: scoreObjective(evaled, synthesis, "balanced", variationBoost + uniqueForms, portScore),
    continuity: scoreObjective(evaled, synthesis, "continuity", variationBoost, portScore),
    variation: scoreObjective(evaled, synthesis, "variation", variationBoost + uniqueForms * 2, portScore),
  };
  const score = objectiveScores.balanced;
  const hardFail =
    tiles.length < copyCount ||
    evaled.parts.collision > copyCount ||
    (evaled.connections.length === 0 && portMatches.pairs.length === 0 && copyCount > 1) ||
    (uniqueForms < Math.min(copyCount, forms.length) && copyCount > 1 && forms.length >= copyCount && uniqueForms === 1);
  const status: AssignmentResult["status"] = hardFail ? "FAIL" : evaled.components > 1 || typologyRetention < 45 || synthesis.connectorCost > copyCount * 8 || (synthesis.fallbackConnections ?? 0) > 0 ? "REVIEW" : "PASS";
  const summary = `${copyCount} forms (${formLabel(forms)}) · score ${score.toFixed(1)} · direct ${synthesis.directInterlocks} · bridges ${synthesis.bridges} · ramps ${synthesis.ramps} · stairs ${synthesis.stairs}`;
  const placementNotes: PlacementNote[] = tiles.map((tile) => {
    const model = instances.find((item) => item.id === tile.id)!;
    const variant = model.variants[tile.variant];
    return {
      tileId: tile.id,
      sourceId: sourceIdOf(model.id),
      filename: model.filename,
      rotation: variant.rotation,
      mirror: variant.mirror,
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
      zLift: tile.zLift ?? 0,
      score,
      floor: evaled.parts.floor,
      void: evaled.parts.void,
      circulation: evaled.parts.circulation,
      complementary: evaled.parts.interlock,
      collision: evaled.parts.collision,
      reason: `assignment-mode · ${field.cellsZ === 1 ? "single lattice level" : "bay stack/gap aware"} · architectural ports`,
      neighbors: [],
    };
  });
  return {
    mode,
    copyCount,
    field,
    tiles,
    models: instances,
    placements: toPlacements(instances, tiles),
    connections: evaled.connections,
    synthesis,
    score,
    parts: evaled.parts,
    components: evaled.components,
    objectiveScores,
    placementNotes,
    candidatesTested: tested,
    milliseconds: performance.now() - started,
    typologyRetention,
    primaryPreserved,
    status,
    summary,
    formIds: forms.map((model) => model.id),
  };
}

function encodeZ(worldZ: number): { iz: number; zLift: number } {
  const clamped = Math.max(0, worldZ);
  const iz = Math.floor(clamped / LATTICE_FEET);
  return { iz, zLift: clamped - iz * LATTICE_FEET };
}

function maxFieldZ(field: LatticeField) {
  return field.cellsZ * LATTICE_FEET;
}

function sourceFormsInBay(tiles: PlacedTile[], ix: number, iy: number) {
  return new Set(tiles.filter((tile) => tile.ix === ix && tile.iy === iy).map((tile) => sourceIdOf(tile.id)));
}

/** Candidate world-Z values for aligning to neighbors or stacking with intentional gaps. */
function candidateWorldZs(
  host: PlacedTile,
  hostModel: TileModel,
  nextModel: TileModel,
  existing: PlacedTile[],
  instances: TileModel[],
  sameBay: boolean,
  field: LatticeField,
): number[] {
  if (field.cellsZ === 1) return sameBay ? [] : [0];
  const hostZ = placementWorldZ(host);
  const hostTop = hostZ + tileHeight(hostModel);
  const nextH = tileHeight(nextModel);
  const out = new Set<number>();
  if (!sameBay) {
    // Prefer same-level adjacency so faces can interlock before connectors are used.
    out.add(hostZ);
    const alignTop = hostTop - nextH;
    if (Math.abs(alignTop - hostZ) > 1 && alignTop >= 0) out.add(alignTop);
  } else {
    for (const gap of [2, 4, 6, 8]) {
      out.add(hostTop + gap);
    }
    for (const tile of existing) {
      if (tile.ix === host.ix && tile.iy === host.iy) continue;
      const model = instances.find((item) => item.id === tile.id);
      if (!model) continue;
      out.add(placementWorldZ(tile));
    }
  }
  return [...out].filter((z) => Number.isFinite(z) && z >= 0);
}

async function searchMixedPair(forms: TileModel[], field: LatticeField, hooks: Hooks) {
  const instances = materializeInstances(forms.slice(0, 2));
  const a = instances[0];
  const b = instances[1];
  const aSource = sourceIdOf(a.id);
  const bSource = sourceIdOf(b.id);
  let tested = 0;
  let best: { tiles: PlacedTile[]; score: number; variation: number; components:number; collisions:number } | null = null;
  const originIx = Math.min(1, Math.max(0, field.cellsX - 1));
  const originIy = Math.min(1, Math.max(0, field.cellsY - 1));
  const origin: PlacedTile = { id: a.id, variant: 0, ix: originIx, iy: originIy, iz: 0, zLift: 0 };
  const vaLimit = Math.min(a.variants.length, 12);
  const vbLimit = Math.min(b.variants.length, 12);
  const planOffsets: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let va = 0; va < vaLimit; va += 1) {
    // Adjacent-bay placements + same-bay stack (different form only).
    const targets: Array<{ ix: number; iy: number; sameBay: boolean }> = planOffsets.map(([dx, dy]) => ({
      ix: origin.ix + dx,
      iy: origin.iy + dy,
      sameBay: false,
    }));
    if (aSource !== bSource) targets.push({ ix: origin.ix, iy: origin.iy, sameBay: true });

    for (const target of targets) {
      if (target.ix < 0 || target.iy < 0 || target.ix >= field.cellsX || target.iy >= field.cellsY) continue;
      const zOptions = candidateWorldZs(origin, a, b, [{ ...origin, variant: va }], instances, target.sameBay, field);
      for (const worldZ of zOptions) {
        const { iz, zLift } = encodeZ(worldZ);
        if (iz >= field.cellsZ) continue;
        if (field.cellsZ > 1 && worldZ + tileHeight(b) > maxFieldZ(field) + LATTICE_FEET) continue;
        for (let vb = 0; vb < vbLimit; vb += 1) {
          if (hooks.cancelled()) throw new Error("cancelled");
          tested += 1;
          if(tested%2===0){hooks.onProgress(`2-form search · ${tested} candidates`,Math.min(90,Math.round(tested/800*90)));await new Promise(resolve=>setTimeout(resolve,0));}
          const tiles: PlacedTile[] = [
            { ...origin, variant: va },
            { id: b.id, variant: vb, ix: target.ix, iy: target.iy, iz, zLift },
          ];
          const {evaled, portMatches} = evaluateAssignment(instances, tiles);
          const synthesis = synthesizeConnectors(instances, tiles, evaled.connections, {portPairs: portMatches.pairs, ...portMatches});
          const differentCategory = categoryOf(forms[0]) !== categoryOf(forms[1]) ? 2 : 0;
          const stackBonus = target.sameBay ? 0.2 : 2;
          const variation = differentCategory + stackBonus + (va !== vb ? 0.3 : 0);
          const score = scoreObjective(evaled, synthesis, "balanced", variation, portMatches.score);
          if (!best || evaled.parts.collision < best.collisions || (evaled.parts.collision === best.collisions && (evaled.components < best.components || (evaled.components === best.components && score > best.score)))) best = { tiles, score, variation, components:evaled.components, collisions:evaled.parts.collision };
        }
      }
    }
    if (tested % 40 === 0) {
      hooks.onProgress(`2-form search · ${tested} candidates`, Math.min(90, Math.round((tested / 800) * 90)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { instances, best, tested };
}

async function growMixedAssembly(
  forms: TileModel[],
  field: LatticeField,
  hooks: Hooks,
) {
  const targetCount = forms.length;
  const instances = materializeInstances(forms);
  if (targetCount === 1) {
    return {
      instances,
      tiles: [{ id: instances[0].id, variant: 0, ix: Math.min(1, field.cellsX - 1), iy: Math.min(1, field.cellsY - 1), iz: 0, zLift: 0 }],
      tested: 1,
      variation: 0,
    };
  }

  const pair = await searchMixedPair(forms, field, hooks);
  if (!pair.best) {
    return {
      instances,
      tiles: [{ id: instances[0].id, variant: 0, ix: Math.min(1, field.cellsX - 1), iy: Math.min(1, field.cellsY - 1), iz: 0, zLift: 0 }],
      tested: pair.tested,
      variation: 0,
    };
  }

  let beam: Array<{ tiles: PlacedTile[]; score: number; variation: number; components:number; collisions:number }> = [pair.best];
  let tested = pair.tested;
  const planOffsets: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (beam[0] && beam[0].tiles.length < targetCount) {
    const nextBeam: typeof beam = [];
    const nextIndex = beam[0].tiles.length;
    const nextModel = instances[nextIndex];
    const nextSource = sourceIdOf(nextModel.id);
    if (!nextModel) break;
    for (const state of beam.slice(0, 6)) {
      for (const host of state.tiles) {
        const hostModel = instances.find((item) => item.id === host.id);
        if (!hostModel) continue;
        const targets: Array<{ ix: number; iy: number; sameBay: boolean }> = planOffsets.map(([dx, dy]) => ({
          ix: host.ix + dx,
          iy: host.iy + dy,
          sameBay: false,
        }));
        targets.push({ ix: host.ix, iy: host.iy, sameBay: true });

        for (const target of targets) {
          if (target.ix < 0 || target.iy < 0 || target.ix >= field.cellsX || target.iy >= field.cellsY) continue;
          // No same form stacked above the same form in one bay.
          if (target.sameBay && sourceFormsInBay(state.tiles, target.ix, target.iy).has(nextSource)) continue;
          const zOptions = candidateWorldZs(host, hostModel, nextModel, state.tiles, instances, target.sameBay, field).slice(0, 10);
          for (const worldZ of zOptions) {
            const { iz, zLift } = encodeZ(worldZ);
            if (iz < 0 || iz >= field.cellsZ) continue;
            if (field.cellsZ > 1 && worldZ + tileHeight(nextModel) > maxFieldZ(field) + LATTICE_FEET) continue;
            // Avoid near-identical vertical slots in the same bay.
            const tooClose = state.tiles.some((tile) => (
              tile.ix === target.ix
              && tile.iy === target.iy
              && Math.abs(placementWorldZ(tile) - worldZ) < 1.0
            ));
            if (tooClose) continue;
            for (let variant = 0; variant < Math.min(nextModel.variants.length, 12); variant += 1) {
              if (hooks.cancelled()) throw new Error("cancelled");
              tested += 1;
              if(tested%2===0){hooks.onProgress(`${targetCount}-form grow · ${tested} candidates`,Math.min(95,20+nextIndex*12));await new Promise(resolve=>setTimeout(resolve,0));}
              const tiles = [...state.tiles, { id: nextModel.id, variant, ix: target.ix, iy: target.iy, iz, zLift }];
              const active = instances.slice(0, tiles.length);
              const {evaled, portMatches} = evaluateAssignment(active, tiles);
              const synthesis = synthesizeConnectors(active, tiles, evaled.connections, {portPairs: portMatches.pairs, ...portMatches});
              const categories = new Set(forms.slice(0, tiles.length).map((model) => categoryOf(model))).size;
              const stackBonus = target.sameBay ? 0.2 : 2;
              const variation = state.variation + categories + stackBonus;
              const score = scoreObjective(evaled, synthesis, "balanced", variation, portMatches.score);
              nextBeam.push({ tiles, score, variation, components:evaled.components, collisions:evaled.parts.collision });
            }
          }
        }
      }
    }
    nextBeam.sort((a,b)=>a.collisions-b.collisions || a.components-b.components || b.score-a.score);
    const unique: typeof nextBeam = [];
    const seen = new Set<string>();
    for (const item of nextBeam) {
      const signature = item.tiles.map((tile) => `${tile.id}:${tile.ix},${tile.iy},${tile.iz},${(tile.zLift ?? 0).toFixed(1)},${tile.variant}`).sort().join("|");
      if (seen.has(signature)) continue;
      seen.add(signature);
      unique.push(item);
      if (unique.length >= 8) break;
    }
    // Preserve the last evaluated partial assembly if growth cannot continue.
    if (!unique.length) break;
    beam = unique;
    hooks.onProgress(`${targetCount}-form grow · ${beam[0]?.tiles.length ?? 0} tiles`, Math.min(95, 20 + (beam[0]?.tiles.length ?? 0) * 12));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!beam.length) break;
  }

  const bestTiles = (beam[0]?.tiles ?? []).slice(0, targetCount);
  return { instances, tiles: bestTiles, tested, variation: beam[0]?.variation ?? 0 };
}

export async function searchAssignmentCopies(
  pool: TileModel[],
  copyCount: 1 | 2 | 3 | 4 | 8,
  hooks: Hooks,
  mode: AssemblyTestMode = copyCount === 1 ? "catalog" : copyCount === 2 ? "copies-2" : copyCount === 3 ? "copies-3" : copyCount === 4 ? "copies-4" : "copies-8",
  fieldOverride?: LatticeField,
  seeds: TileModel[] = [],
  eligibleAssignedSourceIds: ReadonlySet<string> = new Set(pool.filter(model => !model.id.includes("::")).map(model => model.id)),
): Promise<AssignmentResult> {
  const started = performance.now();
  const defaults = assignmentFieldForCopies(Math.max(2, copyCount));
  const field: LatticeField = fieldOverride
    ? {
        cellsX: clampLatticeCells(fieldOverride.cellsX),
        cellsY: clampLatticeCells(fieldOverride.cellsY),
        cellsZ: clampLatticeCells(fieldOverride.cellsZ),
      }
    : defaults;

  const eligiblePool = pool.filter(model => !model.id.includes("::") && eligibleAssignedSourceIds.has(model.id));
  if (eligiblePool.length < 1) throw new Error("No eligible assigned sources available for aggregation.");
  if (copyCount > 1 && eligiblePool.length < 2) {
    hooks.onProgress("Need at least 2 distinct mapped forms", 100);
  }

  const forms = selectDistinctForms(eligiblePool, copyCount, seeds);
  hooks.onProgress(`Selecting ${copyCount} distinct forms · ${formLabel(forms)}`, 5);
  const grown = await growMixedAssembly(forms, field, hooks);
  assertEligibleAssignmentSources(grown.tiles, grown.instances, eligibleAssignedSourceIds);
  hooks.onProgress(`${copyCount}-form complete`, 100);
  return finalize(mode, copyCount, field, forms, grown.instances, grown.tiles, grown.tested, started, grown.variation);
}

export async function runCatalogTest(models: TileModel[], hooks: Hooks): Promise<CatalogRow[]> {
  const mapping = mappingStatus(models);
  const rows: CatalogRow[] = [];
  const slots = ["G1", "G2", "G3", "G4", "G5", "O1", "O2", "O3", "O4", "O5", "L1", "L2", "L3", "L4", "L5"];
  for (let index = 0; index < slots.length; index += 1) {
    const slotId = slots[index];
    const slot = slotById(slotId)!;
    const model = mapping.bySlot.get(slotId);
    hooks.onProgress(`Catalog ${slot.code}`, Math.round((index / slots.length) * 100));
    if (!model) {
      rows.push({
        slotId,
        code: slot.code,
        name: slot.name,
        category: slot.category,
        mapped: false,
        bestCopies: 0,
        score: 0,
        status: "UNMAPPED",
        warning: "Missing OBJ mapping — catalog entry blocked.",
        result: null,
      });
      continue;
    }
    let best: AssignmentResult | null = null;
    for (const count of [2, 3, 4] as const) {
      if (hooks.cancelled()) throw new Error("cancelled");
      const result = await searchAssignmentCopies(models, count, {
        cancelled: hooks.cancelled,
        onProgress: (message, percent) => hooks.onProgress(`${slot.code} · ${message}`, Math.round((index / slots.length) * 100 + ((percent ?? 0) / 100) * (100 / slots.length))),
      }, "catalog", undefined, [model]);
      if (!best || result.score > best.score) best = result;
    }
    rows.push({
      slotId,
      code: slot.code,
      name: slot.name,
      category: slot.category,
      mapped: true,
      bestCopies: best?.copyCount ?? 0,
      score: best?.score ?? 0,
      status: best?.status ?? "FAIL",
      warning: best?.status === "FAIL" ? "Needs review: mixed-form aggregation did not form a valid set." : null,
      result: best,
    });
  }
  hooks.onProgress("Catalog complete", 100);
  return rows;
}

export function assignmentToAssembly(result: AssignmentResult, id: Assembly["id"] = "A", title = "Assignment aggregation"): Assembly {
  return {
    id,
    title,
    tiles: result.tiles,
    score: result.score,
    distributionScore: 0,
    parts: result.parts,
    connections: result.connections,
    portPairs: result.synthesis.portPairs,
    components: result.components,
    candidatesTested: result.candidatesTested,
    placementNotes: result.placementNotes,
  };
}

export function describeTransformsUsed(result: AssignmentResult) {
  const rotations = new Set(result.placementNotes.map((note) => note.rotation));
  const mirrors = new Set(result.placementNotes.map((note) => note.mirror));
  return {
    rotations: [...rotations] as Rotation[],
    mirrors: [...mirrors] as Mirror[],
    labels: [
      ...[...rotations].map((value) => `${value}°`),
      ...[...mirrors].filter((value) => value !== "none").map((value) => `mirror ${value}`),
    ],
  };
}

export { variantIndex, ROTATIONS, MIRRORS };
