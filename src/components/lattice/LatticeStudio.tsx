"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import AppNav from "../AppNav";
import { analyzeMesh } from "./analyze";
import { assembledObj, assemblyManifest, voxelUnionObj } from "./exportAssembly";
import type { LatticeViewportHandle } from "./LatticeViewport";

const LatticeViewport = dynamic(() => import("./LatticeViewport"), { ssr: false });
const ObjFidelityViewport = dynamic(() => import("./ObjFidelityViewport"), { ssr: false });
import { evaluateAssembly, placedFromRecord, searchAssemblies } from "./search";
import {
  ASSEMBLY_TEST_LABELS,
  assignmentToAssembly,
  buildAssignedSourcePool,
  describeTransformsUsed,
  mappingStatus,
  registrationLabel,
  runCatalogTest,
  searchAssignmentCopies,
  type AssemblyTestMode,
  type AssignmentResult,
  type CatalogRow,
} from "./assignmentSearch";
import {
  compareFidelity,
  fidelityMetricsRaw,
  fidelityMetricsRegistered,
  IDENTITY_PLACEMENT,
} from "./objFidelity";
import type { GeneratedConnector } from "./connectionSynthesis";
import { synthesizeConnectors } from "./connectionSynthesis";
import { matchAssemblyPorts } from "./portMatching";
import { DEFAULT_DISTRIBUTION_PREFS } from "./distribution";
import { LATTICE_SLOTS, slotById } from "./slots";
import { LATTICE_SESSION_KEY, readJson, writeJson } from "../browserSession";
import { DESCRIPTOR_RANK_STORAGE_KEY, type DescriptorRankSnapshot } from "../evaluations/descriptorRank";
import { useLatticeSource } from "./latticeSource";
import {
  clampLatticeCells,
  DEFAULT_LATTICE_FIELD,
  latticePerformanceWarning,
  MAX_LATTICE_CELLS_PER_AXIS,
  REQUIRED_TILES,
  resolvedUp,
  UNIT_TO_FEET,
  type Assembly,
  type CameraMode,
  type ColorMode,
  type ContinuityOverlay,
  type DiagnosticMode,
  type DistributionPrefs,
  type ImportedObj,
  type LatticeField,
  type Placement,
  type PlacementNote,
  type SearchStats,
  type TileModel,
  type UnitName,
  type UpAxisMode,
} from "./types";

const buttonClass = "rounded border px-2 py-1 text-[10px] disabled:opacity-40";
const buttonStyle = { borderColor: "var(--line)" } as const;
const actionStyle = { ...buttonStyle, background: "var(--accent-primary)", color: "var(--app-background)" } as const;

function download(name: string, content: BlobPart, type: string) {
  const url = typeof content === "string" && content.startsWith("data:") ? content : URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  if (!url.startsWith("data:")) URL.revokeObjectURL(url);
}

function emptyPlacement(meshId: string, slotId: string | null): Placement {
  return { meshId, slotId, rotation: 0, mirror: "none", ix: 0, iy: 0, iz: 0, zLift: 0, locked: false };
}

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function boardFromTiles(
  tiles: Assembly["tiles"],
  sourceModels: TileModel[],
  sourceMeshes: ImportedObj[],
  previous: { placements: Record<string, Placement> } | null = null,
) {
  const modelById = new Map(sourceModels.map((model) => [model.id, model]));
  const meshById = new Map(sourceMeshes.map((mesh) => [mesh.id, mesh]));
  const lockedCells = new Set(
    Object.values(previous?.placements ?? {})
      .filter((placement) => placement.locked)
      .map((placement) => `${placement.ix},${placement.iy},${placement.iz}`),
  );
  const instanceMeshes: ImportedObj[] = [];
  const instanceModels: TileModel[] = [];
  const instancePlacements: Record<string, Placement> = {};
  for (const tile of tiles) {
    const sourceId = sourceIdOf(tile.id);
    const sourceModel = modelById.get(tile.id) ?? modelById.get(sourceId);
    const sourceMesh = meshById.get(tile.id) ?? meshById.get(sourceId);
    const variant = sourceModel?.variants[tile.variant];
    if (!sourceModel || !sourceMesh || !variant) continue;
    instanceMeshes.push({ ...sourceMesh, id: tile.id });
    instanceModels.push({ ...sourceModel, id: tile.id });
    instancePlacements[tile.id] = {
      meshId: tile.id,
      slotId: sourceModel.slotId,
      rotation: variant.rotation,
      mirror: variant.mirror,
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
      zLift: tile.zLift ?? 0,
      locked: lockedCells.has(`${tile.ix},${tile.iy},${tile.iz}`),
    };
  }
  return { meshes: instanceMeshes, models: instanceModels, placements: instancePlacements };
}

type PackedMesh = Omit<ImportedObj, "positions" | "normals"> & {
  positions: number[];
  normals: number[];
};

type LatticeSession = {
  version: 1;
  meshes: PackedMesh[];
  assignments: Record<string, string | null>;
  unit: UnitName;
  upAxisMode: UpAxisMode;
  field: LatticeField;
  placements: Record<string, Placement>;
  options: Assembly[] | null;
  activeOption: "A" | "B" | "C" | "manual";
  selectedId: string | null;
  colorMode: ColorMode;
  showLattice: boolean;
  showConnections: boolean;
  cameraMode: CameraMode;
  diagnostic: DiagnosticMode;
  continuityOverlay: ContinuityOverlay;
  presentation: boolean;
  status: string;
  distributionWeight: number;
  clusteringPercent: number;
  balanceTypologies: boolean;
  balanceCategories: boolean;
  preventLargeClusters: boolean;
  stats: SearchStats | null;
  copyCount: 1 | 2 | 3 | 4 | 8;
  assemblyMode?: AssemblyTestMode;
};

function packMesh(mesh: ImportedObj): PackedMesh {
  return {
    ...mesh,
    positions: Array.from(mesh.positions),
    normals: Array.from(mesh.normals),
  };
}

export default function LatticeStudio() {
  const {
    hydrated: sourceHydrated,
    meshes,
    setMeshes,
    assignments,
    setAssignments,
    unit,
    setUnit,
    upAxisMode,
    setUpAxisMode,
    importObjFiles,
  } = useLatticeSource();
  const [field, setField] = useState<LatticeField>(DEFAULT_LATTICE_FIELD);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [models, setModels] = useState<TileModel[]>([]);
  const [options, setOptions] = useState<Assembly[] | null>(null);
  const [activeOption, setActiveOption] = useState<"A" | "B" | "C" | "manual">("manual");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("category");
  const [showLattice, setShowLattice] = useState(false);
  const [showConnections, setShowConnections] = useState(true);
  const [showConnectionPorts, setShowConnectionPorts] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("iso");
  const [diagnostic, setDiagnostic] = useState<DiagnosticMode>("originals");
  const [continuityOverlay, setContinuityOverlay] = useState<ContinuityOverlay>("all");
  const [presentation, setPresentation] = useState(false);
  const [status, setStatus] = useState("Upload OBJ meshes. Fifteen typology slots are ready.");
  const [distributionWeight, setDistributionWeight] = useState(70);
  const [clusteringPercent, setClusteringPercent] = useState(40);
  const [balanceTypologies, setBalanceTypologies] = useState(true);
  const [balanceCategories, setBalanceCategories] = useState(true);
  const [preventLargeClusters, setPreventLargeClusters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [copyCount, setCopyCount] = useState<1 | 2 | 3 | 4 | 8>(4);
  const [copyWarning, setCopyWarning] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogRow[]>([]);
  const [assemblyMode, setAssemblyMode] = useState<AssemblyTestMode>("copies-4");
  const [assignmentResult, setAssignmentResult] = useState<AssignmentResult | null>(null);
  const [generatedConnectors, setGeneratedConnectors] = useState<GeneratedConnector[]>([]);
  const [showGeneratedConnectors, setShowGeneratedConnectors] = useState(true);
  const [showOriginalTiles, setShowOriginalTiles] = useState(true);
  const [connectionStage, setConnectionStage] = useState<"before" | "after">("after");
  const [gatheringSlot, setGatheringSlot] = useState("G1");
  const [officeSlot, setOfficeSlot] = useState("O3");
  const [lobbySlot, setLobbySlot] = useState("L1");
  const [fidelityMeshId, setFidelityMeshId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ meshes: ImportedObj[]; models: TileModel[]; placements: Record<string, Placement> } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [descriptorRanks, setDescriptorRanks] = useState<DescriptorRankSnapshot | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DESCRIPTOR_RANK_STORAGE_KEY);
      setDescriptorRanks(stored ? JSON.parse(stored) as DescriptorRankSnapshot : null);
    } catch {
      setDescriptorRanks(null);
    }
  }, []);
  const cache = useRef(new Map<string, TileModel>());
  const cancelRef = useRef(0);
  const viewRef = useRef<LatticeViewportHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingAssembly = useRef<{ options: Assembly[]; active: "A" | "B" | "C" | "manual"; placements: Record<string, Placement> } | null>(null);

  const assigned = useMemo(() => LATTICE_SLOTS.flatMap((slot) => {
    const mesh = meshes.find((item) => item.id === assignments[slot.id]);
    return mesh ? [{ slot, mesh }] : [];
  }), [assignments, meshes]);
  const missing = LATTICE_SLOTS.filter((slot) => !assignments[slot.id]);
  const report = useMemo(() => models.length >= 2 ? evaluateAssembly(models, placedFromRecord(models, placements)) : null, [models, placements]);
  const selected = (preview?.meshes ?? meshes).find((mesh) => mesh.id === selectedId) ?? null;
  const selectedPlacement = selected ? (preview?.placements[selected.id] ?? placements[selected.id] ?? null) : null;
  const selectedModel = (preview?.models.find((model) => model.id === selectedId) ?? models.find((model) => model.id === (selected ? sourceIdOf(selected.id) : ""))) ?? null;
  const fidelityMesh = meshes.find((mesh) => mesh.id === (fidelityMeshId ?? selectedId)) ?? meshes[0] ?? null;
  const fidelityReport = useMemo(() => {
    if (!fidelityMesh || diagnostic !== "obj-fidelity") return null;
    const raw = fidelityMetricsRaw(fidelityMesh, unit, upAxisMode);
    const registered = fidelityMetricsRegistered(fidelityMesh, unit, upAxisMode, IDENTITY_PLACEMENT(fidelityMesh.id));
    const copy2 = fidelityMetricsRegistered(fidelityMesh, unit, upAxisMode, { ...IDENTITY_PLACEMENT(fidelityMesh.id), ix: 1 }, "COPY 2");
    return { raw, registered, copy2, compare: compareFidelity(raw, registered, copy2) };
  }, [fidelityMesh, unit, upAxisMode, diagnostic]);

  function enterObjFidelityTest(meshId?: string) {
    const target = meshId ?? selectedId ?? meshes[0]?.id ?? null;
    if (!target) {
      setStatus("Upload an OBJ before running OBJ Fidelity Test.");
      return;
    }
    setFidelityMeshId(target);
    setDiagnostic("obj-fidelity");
    // Hard isolate: clear all aggregation / synthesis state from the active view.
    setPreview(null);
    setGeneratedConnectors([]);
    setShowGeneratedConnectors(false);
    setShowConnections(false);
    setShowLattice(false);
    setShowOriginalTiles(true);
    setConnectionStage("before");
    setPresentation(false);
    setColorMode("white");
    setCameraMode("iso");
    setContinuityOverlay("all");
    setStatus(`OBJ FIDELITY TEST · ${meshes.find((mesh) => mesh.id === target)?.filename ?? target} · isolated RAW | REGISTERED | COPY 2 only. Aggregation / connectors disabled.`);
  }

  const fidelityActive = diagnostic === "obj-fidelity";

  useEffect(() => {
    const saved = readJson<LatticeSession>(LATTICE_SESSION_KEY);
    if (saved?.version === 1 && Array.isArray(saved.meshes)) {
      if (saved.field) {
        setField({
          cellsX: clampLatticeCells(saved.field.cellsX),
          cellsY: clampLatticeCells(saved.field.cellsY),
          cellsZ: clampLatticeCells(saved.field.cellsZ),
        });
      }
      if (saved.placements) setPlacements(saved.placements);
      const restoredMode = saved.assemblyMode && saved.assemblyMode in ASSEMBLY_TEST_LABELS
        ? saved.assemblyMode
        : saved.copyCount === 2 ? "copies-2" : saved.copyCount === 3 ? "copies-3" : saved.copyCount === 8 ? "copies-8" : "copies-4";
      setAssemblyMode(restoredMode);
      const requestedCount = restoredMode === "copies-2" ? 2 : restoredMode === "copies-3" ? 3 : restoredMode === "copies-8" ? 8 : 4;
      const restoredOptions = restoredMode === "global-field" || restoredMode === "catalog"
        ? saved.options
        : saved.options?.filter(option => option.tiles.length === requestedCount) ?? null;
      if (restoredOptions) setOptions(restoredOptions);
      if (saved.activeOption) setActiveOption(saved.activeOption);
      if (saved.selectedId !== undefined) setSelectedId(saved.selectedId);
      if (saved.colorMode) setColorMode(saved.colorMode);
      if (saved.cameraMode) setCameraMode(saved.cameraMode);
      if (saved.diagnostic) setDiagnostic(saved.diagnostic);
      if (saved.continuityOverlay) setContinuityOverlay(saved.continuityOverlay);
      if (typeof saved.presentation === "boolean") setPresentation(saved.presentation);
      // Fidelity sessions must never restore aggregation overlays.
      if (saved.diagnostic === "obj-fidelity") {
        setShowLattice(false);
        setShowConnections(false);
        setShowGeneratedConnectors(false);
        setGeneratedConnectors([]);
        setPreview(null);
        setPresentation(false);
        if (saved.selectedId) setFidelityMeshId(saved.selectedId);
      } else {
        if (typeof saved.showLattice === "boolean") setShowLattice(saved.showLattice);
        if (typeof saved.showConnections === "boolean") setShowConnections(saved.showConnections);
      }
      if (typeof saved.status === "string") setStatus(saved.status);
      if (typeof saved.distributionWeight === "number") setDistributionWeight(saved.distributionWeight);
      if (typeof saved.clusteringPercent === "number") setClusteringPercent(saved.clusteringPercent);
      if (typeof saved.balanceTypologies === "boolean") setBalanceTypologies(saved.balanceTypologies);
      if (typeof saved.balanceCategories === "boolean") setBalanceCategories(saved.balanceCategories);
      if (typeof saved.preventLargeClusters === "boolean") setPreventLargeClusters(saved.preventLargeClusters);
      if (saved.stats) setStats(saved.stats);
      if (saved.copyCount === 1 || saved.copyCount === 2 || saved.copyCount === 3 || saved.copyCount === 4 || saved.copyCount === 8) setCopyCount(saved.copyCount);
      if (restoredOptions?.length) {
        pendingAssembly.current = {
          options: restoredOptions,
          active: saved.activeOption ?? "A",
          placements: saved.placements ?? {},
        };
      }
      setStatus(saved.status || `Restored Part 2 session · ${saved.meshes.length} OBJ${saved.meshes.length === 1 ? "" : "s"}.`);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    const pending = pendingAssembly.current;
    if (!sessionReady || !pending || models.length < 1 || meshes.length < 1) return;
    pendingAssembly.current = null;
    const option = pending.options.find((item) => item.id === pending.active) ?? pending.options[0];
    if (!option) return;
    setPreview(boardFromTiles(option.tiles, models, meshes, { placements: pending.placements }));
    setActiveOption(option.id);
    setDiagnostic("distribution");
    setColorMode("typology");
  }, [sessionReady, models, meshes]);

  useEffect(() => {
    if (!sessionReady || !sourceHydrated) return;
    const payload: LatticeSession = {
      version: 1,
      meshes: meshes.map(packMesh),
      assignments,
      unit,
      upAxisMode,
      field,
      placements,
      options,
      activeOption,
      selectedId,
      colorMode,
      showLattice,
      showConnections,
      cameraMode,
      diagnostic,
      continuityOverlay,
      presentation,
      status,
      distributionWeight,
      clusteringPercent,
      balanceTypologies,
      balanceCategories,
      preventLargeClusters,
      stats,
      copyCount,
      assemblyMode,
    };
    const handle = window.setTimeout(() => {
      if (!writeJson(LATTICE_SESSION_KEY, payload)) {
        // Retry without bulky diagnostic notes if quota is tight.
        const slim = {
          ...payload,
          options: payload.options?.map((option) => ({ ...option, placementNotes: undefined, connections: option.connections.slice(0, 80) })) ?? null,
        };
        writeJson(LATTICE_SESSION_KEY, slim);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [
    sessionReady, sourceHydrated, meshes, assignments, unit, upAxisMode, field, placements, options, activeOption, selectedId,
    colorMode, showLattice, showConnections, cameraMode, diagnostic, continuityOverlay, presentation, status,
    distributionWeight, clusteringPercent, balanceTypologies, balanceCategories, preventLargeClusters, stats, copyCount, assemblyMode,
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const scale = UNIT_TO_FEET[unit];
      const sources = meshes.map((mesh) => {
        const slot = LATTICE_SLOTS.find((item) => assignments[item.id] === mesh.id);
        return { mesh, slotId: slot?.id ?? mesh.suggestedSlotId };
      });
      const built: TileModel[] = [];
      for (const item of sources) {
        const up = resolvedUp(item.mesh.upAxis, upAxisMode);
        const key = `${item.mesh.id}:${unit}:${up}`;
        let model = cache.current.get(key);
        if (!model) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (cancelled) return;
          model = analyzeMesh(item.mesh, item.slotId, scale, up);
          cache.current.set(key, model);
        }
        built.push({ ...model, slotId: item.slotId });
      }
      const cell = built.reduce((largest, model) => Math.max(largest, model.cellFeet), 2);
      const aligned = built.map((model) => {
        if (model.cellFeet === cell) return model;
        const source = sources.find((item) => item.mesh.id === model.id);
        if (!source) return model;
        const up = resolvedUp(source.mesh.upAxis, upAxisMode);
        const key = `${model.id}:${unit}:${up}:${cell}`;
        const cached = cache.current.get(key) ?? analyzeMesh(source.mesh, source.slotId, scale, up, cell);
        cache.current.set(key, cached);
        return { ...cached, slotId: source.slotId };
      });
      if (cancelled) return;
      setModels(aligned);
      setPlacements((current) => {
        const next = { ...current };
        for (const model of aligned) next[model.id] = { ...(next[model.id] ?? emptyPlacement(model.id, model.slotId)), slotId: model.slotId };
        return next;
      });
    };
    void run();
    return () => { cancelled = true; };
  }, [meshes, assignments, unit, upAxisMode]);

  function clearSavedSession() {
    cancelRef.current += 1;
    pendingAssembly.current = null;
    window.localStorage.removeItem(LATTICE_SESSION_KEY);
    setMeshes([]);
    setAssignments({});
    setUnit("feet");
    setUpAxisMode("auto");
    setField(DEFAULT_LATTICE_FIELD);
    setPlacements({});
    setModels([]);
    setOptions(null);
    setActiveOption("manual");
    setSelectedId(null);
    setColorMode("category");
    setShowLattice(false);
    setShowConnections(true);
    setCameraMode("iso");
    setDiagnostic("originals");
    setContinuityOverlay("all");
    setPresentation(false);
    setStatus("Part 2 session cleared. Upload OBJ meshes to begin again.");
    setDistributionWeight(70);
    setClusteringPercent(40);
    setBalanceTypologies(true);
    setBalanceCategories(true);
    setPreventLargeClusters(true);
    setBusy(false);
    setProgressPercent(null);
    setStats(null);
    setCopyCount(4);
    setCopyWarning(null);
    setCatalogue([]);
    setPreview(null);
    cache.current.clear();
  }

  async function importFiles(files: File[]) {
    setStatus(`Importing ${files.length} OBJ file${files.length === 1 ? "" : "s"}…`);
    const result = await importObjFiles(files);
    setPreview(null);
    if (!result.imported) {
      setStatus(result.error ?? "Choose OBJ files.");
      return;
    }
    setStatus(`Imported ${result.imported} OBJ file${result.imported === 1 ? "" : "s"}.${result.error ? ` ${result.error}` : ""}`);
  }

  function removeMesh(meshId: string) {
    const mesh = meshes.find((item) => item.id === meshId);
    cancelRef.current += 1;
    setBusy(false);
    setMeshes((current) => current.filter((item) => item.id !== meshId));
    setAssignments((current) => {
      const next = { ...current };
      for (const slot of LATTICE_SLOTS) if (next[slot.id] === meshId) next[slot.id] = null;
      return next;
    });
    setPlacements((current) => {
      const next = { ...current };
      delete next[meshId];
      return next;
    });
    setModels((current) => current.filter((model) => model.id !== meshId));
    setOptions(null);
    setStats(null);
    setActiveOption("manual");
    setPresentation(false);
    setPreview(null);
    if (selectedId === meshId) setSelectedId(null);
    for (const key of [...cache.current.keys()]) if (key.startsWith(`${meshId}:`)) cache.current.delete(key);
    setStatus(mesh ? `Removed ${mesh.filename}.` : "Removed OBJ.");
  }

  async function runSearch() {
    if (assemblyMode !== "global-field") return;
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    setStatus("Starting assembly…");
    const started = performance.now();
    const currentModels = models;
    const cells = field.cellsX * field.cellsY * field.cellsZ;
    if (currentModels.length < 1) {
      setBusy(false);
      setProgressPercent(null);
      setStatus("Upload at least one OBJ before filling the lattice.");
      return;
    }
    const distribution: DistributionPrefs = {
      ...DEFAULT_DISTRIBUTION_PREFS,
      weight: distributionWeight / 100,
      clustering: clusteringPercent / 100,
      balanceTypologies,
      balanceCategories,
      preventLargeClusters,
    };
    try {
      const lockedPlacements = Object.values(preview?.placements ?? placements);
      const result = await searchAssemblies(currentModels, lockedPlacements, {
        cancelled: () => token !== cancelRef.current,
        onProgress: (message, percent) => {
          setStatus(message);
          if (percent !== undefined) setProgressPercent(percent);
        },
      }, field, { populate: true, distribution });
      if (token !== cancelRef.current) return;
      result.stats.analysisMilliseconds = performance.now() - started - result.stats.milliseconds;
      const board = boardFromTiles(result.options[0].tiles, currentModels, meshes, preview);
      setOptions(result.options);
      setStats(result.stats);
      setPreview(board);
      setActiveOption("A");
      setAssignmentResult(null);
      setGeneratedConnectors([]);
      setShowGeneratedConnectors(false);
      setDiagnostic("distribution");
      setColorMode("typology");
      setPresentation(false);
      setProgressPercent(100);
      const unique = new Set(board.models.map((model) => sourceIdOf(model.id))).size;
      const dist = result.options[0].distributionScore;
      const maxCluster = result.options[0].distribution?.maxCluster ?? 0;
      setStatus(`Option A assembles ${board.meshes.length} / ${cells} cells with ${unique} OBJ types. Interlock ${result.options[0].score.toFixed(1)} · Distribution ${dist.toFixed(1)} · Largest same-type cluster ${maxCluster}.`);
    } catch (error) {
      if (error instanceof Error && error.message === "cancelled") setStatus((current) => current.startsWith("Removed ") ? current : "Aggregation cancelled.");
      else setStatus(error instanceof Error ? error.message : "Aggregation failed.");
    } finally {
      if (token === cancelRef.current) {
        setBusy(false);
        setProgressPercent(null);
      }
    }
  }

  function chooseOption(option: Assembly) {
    const board = boardFromTiles(option.tiles, models, meshes, preview);
    setPreview(board);
    setActiveOption(option.id);
    setDiagnostic("distribution");
    setColorMode("typology");
    setPresentation(false);
    const cells = field.cellsX * field.cellsY * field.cellsZ;
    setStatus(`Option ${option.id} assembles ${board.meshes.length} / ${cells} cells. Interlock ${option.score.toFixed(1)} · Distribution ${option.distributionScore.toFixed(1)} · Largest same-type cluster ${option.distribution?.maxCluster ?? 0}.`);
  }

  function updateSelected(change: Partial<Placement>) {
    if (!selected || selectedPlacement?.locked) return;
    setActiveOption("manual");
    const apply = (current: Record<string, Placement>) => {
      const previous = current[selected.id];
      if (!previous) return current;
      const next = { ...previous, ...change };
      next.ix = Math.max(0, Math.min(field.cellsX - 1, next.ix));
      next.iy = Math.max(0, Math.min(field.cellsY - 1, next.iy));
      next.iz = Math.max(0, Math.min(field.cellsZ - 1, next.iz));
      if (assignmentResult && assemblyMode !== "global-field" && assignmentResult.field.cellsZ === 1) {
        next.iz = 0;
        next.zLift = 0;
      }
      return { ...current, [selected.id]: next };
    };
    if (preview) setPreview({ ...preview, placements: apply(preview.placements) });
    else {
      setPresentation(false);
      setPlacements((current) => apply(current));
    }
  }

  function setLatticeCells(axis: keyof LatticeField, value: number) {
    const cells = clampLatticeCells(value);
    if (field[axis] === cells) return;
    setField({ ...field, [axis]: cells });
  }

  async function runCopies(count: 1 | 2 | 3 | 4 | 8, seedModels?: TileModel[]) {
    let eligibleModels: TileModel[];
    try {
      eligibleModels = buildAssignedSourcePool(models, meshes, assignments);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assigned sources unavailable.");
      return;
    }
    if (!eligibleModels.length) {
      setStatus("Load / map OBJ tiles before running an aggregation test.");
      return;
    }
    if (count > 1 && eligibleModels.length < 2) {
      setStatus("Need at least 2 distinct mapped forms to aggregate different typologies.");
      return;
    }
    const seeds = seedModels?.length
      ? seedModels
      : selectedModel
        ? [selectedModel]
        : [];
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    setCopyCount(count);
    const mode: AssemblyTestMode = count === 1 ? "catalog" : count === 2 ? "copies-2" : count === 3 ? "copies-3" : count === 4 ? "copies-4" : "copies-8";
    setAssemblyMode(mode);
    try {
      const result = await searchAssignmentCopies(eligibleModels, count, {
        cancelled: () => token !== cancelRef.current,
        onProgress: (message, percent) => {
          setStatus(message);
          if (percent !== undefined) setProgressPercent(percent);
        },
      }, mode, field, seeds, new Set(eligibleModels.map(model => model.id)));
      if (token !== cancelRef.current) return;
      const meshById = new Map(meshes.map((mesh) => [mesh.id, mesh]));
      const copyMeshes = result.models.flatMap((instance, index) => {
        const sourceMesh = meshById.get(sourceIdOf(instance.id));
        if (!sourceMesh) return [];
        return [{
          ...sourceMesh,
          id: instance.id,
          filename: instance.filename || `${sourceMesh.filename} · form ${index + 1}`,
          suggestedSlotId: instance.slotId ?? sourceMesh.suggestedSlotId,
        }];
      });
      setAssignmentResult(result);
      setGeneratedConnectors(result.synthesis.connectors);
      setConnectionStage("after");
      setShowGeneratedConnectors(true);
      setShowOriginalTiles(true);
      setShowConnections(true);
      setShowLattice(true);
      setColorMode("typology");
      const uniqueForms = new Set(result.formIds).size;
      setCopyWarning(
        result.status === "FAIL"
          ? result.summary
          : uniqueForms < count && eligibleModels.length >= count
            ? `Only ${uniqueForms} unique forms available for a ${count}-form test.`
            : null,
      );
      setPreview({ meshes: copyMeshes, models: result.models, placements: result.placements });
      setOptions([
        assignmentToAssembly(result, "A", "Balanced interlock"),
        { ...assignmentToAssembly(result, "B", "Architectural continuity"), score: result.objectiveScores.continuity },
        { ...assignmentToAssembly(result, "C", "Spatial variation"), score: result.objectiveScores.variation },
      ]);
      setActiveOption("A");
      setDiagnostic("copies");
      setPresentation(false);
      setProgressPercent(100);
      setStatus(`${result.summary} · direct ${result.synthesis.directInterlocks} · connectors ${result.synthesis.connectors.length}`);
    } catch (error) {
      if (!(error instanceof Error && error.message === "cancelled")) setStatus(error instanceof Error ? error.message : "Aggregation test failed.");
    } finally {
      if (token === cancelRef.current) {
        setBusy(false);
        setProgressPercent(null);
      }
    }
  }

  async function runAssemblyTest(mode: AssemblyTestMode = assemblyMode) {
    setAssemblyMode(mode);
    if (mode === "catalog") {
      await runCatalogue();
      return;
    }
    if (mode === "global-field") {
      await runSearch();
      return;
    }
    const count: 1 | 2 | 3 | 4 | 8 = mode === "copies-2" ? 2 : mode === "copies-3" ? 3 : mode === "copies-4" ? 4 : 8;
    await runCopies(count);
  }

  function selectAssemblyMode(next: AssemblyTestMode) {
    cancelRef.current += 1;
    setBusy(false);
    setProgressPercent(null);
    if ((next === "global-field") !== (assemblyMode === "global-field")) {
      pendingAssembly.current = null;
      setPreview(null);
      setOptions(null);
      setActiveOption("manual");
      setAssignmentResult(null);
      setGeneratedConnectors([]);
      setStats(null);
      setDiagnostic("originals");
    }
    setAssemblyMode(next);
    if (next !== "catalog" && next !== "global-field") {
      setCopyCount(next === "copies-2" ? 2 : next === "copies-3" ? 3 : next === "copies-4" ? 4 : 8);
    }
    setStatus(`${ASSEMBLY_TEST_LABELS[next]} selected. Edit settings, then press RUN ORIENTATION + ASSEMBLY.`);
  }

  async function runCatalogue() {
    let eligibleModels: TileModel[];
    try {
      eligibleModels = buildAssignedSourcePool(models, meshes, assignments);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assigned sources unavailable.");
      return;
    }
    const map = mappingStatus(eligibleModels);
    if (!map.complete) {
      setStatus(`Catalog blocked — missing mappings: ${map.missing.join(", ")}`);
      return;
    }
    if (!models.length) return;
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    setAssemblyMode("catalog");
    try {
      const rows = await runCatalogTest(eligibleModels, {
        cancelled: () => token !== cancelRef.current,
        onProgress: (message, percent) => {
          setStatus(message);
          if (percent !== undefined) setProgressPercent(percent);
        },
      });
      if (token !== cancelRef.current) return;
      setCatalogue(rows);
      const best = rows.find((row) => row.result)?.result ?? null;
      if (best) {
        const meshById = new Map(meshes.map((mesh) => [mesh.id, mesh]));
        setAssignmentResult(best);
        setGeneratedConnectors(best.synthesis.connectors);
        setConnectionStage("after");
        setShowGeneratedConnectors(true);
        setShowOriginalTiles(true);
        setShowConnections(true);
        setShowLattice(true);
        setColorMode("typology");
        setPreview({
          meshes: best.models.flatMap((instance, index) => {
            const sourceMesh = meshById.get(sourceIdOf(instance.id));
            if (!sourceMesh) return [];
            return [{ ...sourceMesh, id: instance.id, filename: instance.filename || `${sourceMesh.filename} · form ${index + 1}` }];
          }),
          models: best.models,
          placements: best.placements,
        });
        setOptions([
          assignmentToAssembly(best, "A", "Balanced interlock"),
          { ...assignmentToAssembly(best, "B", "Architectural continuity"), score: best.objectiveScores.continuity },
          { ...assignmentToAssembly(best, "C", "Spatial variation"), score: best.objectiveScores.variation },
        ]);
        setActiveOption("A");
      }
      setDiagnostic("copies");
      setPresentation(false);
      setProgressPercent(100);
      setStatus(`Catalog test finished · ${rows.filter((row) => row.status !== "UNMAPPED").length} mapped typologies.`);
    } catch (error) {
      if (!(error instanceof Error && error.message === "cancelled")) setStatus(error instanceof Error ? error.message : "Catalog test failed.");
    } finally {
      if (token === cancelRef.current) {
        setBusy(false);
        setProgressPercent(null);
      }
    }
  }

  async function runSelectedCategoryTests() {
    let eligibleModels: TileModel[];
    try {
      eligibleModels = buildAssignedSourcePool(models, meshes, assignments);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assigned sources unavailable.");
      return;
    }
    const assignedBySlot = new Map(eligibleModels.map(model => [model.slotId, model]));
    const picks = [gatheringSlot, officeSlot, lobbySlot]
      .map((slotId) => assignedBySlot.get(slotId))
      .filter((model): model is TileModel => !!model);
    if (picks.length < 3) {
      setStatus("Select mapped Gathering, Office, and Lobby typologies before the mixed-form presentation test.");
      return;
    }
    if (assemblyMode === "catalog" || assemblyMode === "global-field") {
      setStatus("Select 2/3/4/8 FORMS before assembling presentation picks.");
      return;
    }
    const count = assemblyMode === "copies-2" ? 2 : assemblyMode === "copies-3" ? 3 : assemblyMode === "copies-4" ? 4 : 8;
    await runCopies(count, picks);
  }

  function exportPng(name: string, overlay: "clean" | "lattice" = "clean", nextCamera?: CameraMode) {
    const previousLattice = showLattice;
    const previousConnections = showConnections;
    if (nextCamera) setCameraMode(nextCamera);
    setShowLattice(overlay === "lattice");
    setShowConnections(false);
    const finish = () => {
      try {
        const url = viewRef.current?.capture();
        if (url) download(name, url, "image/png");
      } finally {
        setShowLattice(previousLattice);
        setShowConnections(previousConnections);
      }
    };
    // Wait for React state + R3F to paint without the grid before capturing.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(finish, 180);
      });
    });
  }

  const shown = preview ?? { meshes: assigned.map((item) => item.mesh), models, placements };
  // Keep endpoints and exported connectors attached to the currently displayed transforms.
  const liveAssignmentSynthesis = useMemo(() => {
    if (!assignmentResult || !preview || assemblyMode === "global-field") return null;
    const tiles = placedFromRecord(preview.models, preview.placements);
    const evaluated = evaluateAssembly(preview.models, tiles);
    const matched = matchAssemblyPorts(preview.models, tiles, evaluated.connections);
    return synthesizeConnectors(preview.models, tiles, evaluated.connections, {portPairs: matched.pairs, ...matched});
  }, [assignmentResult, preview, assemblyMode]);
  const displayedConnectors = liveAssignmentSynthesis?.connectors ?? generatedConnectors;
  const activeAssembly = options?.find((option) => option.id === activeOption) ?? null;
  const shownReport = preview && activeAssembly ? activeAssembly : report;
  const cellCount = field.cellsX * field.cellsY * field.cellsZ;
  const listedConnections = shownReport?.connections.slice(0, 24) ?? [];
  const selectedNote: PlacementNote | null = activeAssembly?.placementNotes?.find((note) => note.tileId === selectedId)
    ?? activeAssembly?.placementNotes?.find((note) => note.ix === selectedPlacement?.ix && note.iy === selectedPlacement?.iy && note.iz === selectedPlacement?.iz)
    ?? null;
  const selectedLinks = shownReport?.connections.filter((connection) => connection.tileA === selectedId || connection.tileB === selectedId) ?? [];

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD STOP — OBJ FIDELITY MODE
  // Entire aggregation UI is not mounted. No connectors, no assembly viewport.
  // ═══════════════════════════════════════════════════════════════════════════
  if (fidelityActive && fidelityMesh) {
    const fReport = fidelityReport;
    return (
      <div data-board-page="lattice" className="flex h-screen flex-col" data-fidelity-isolated="true" data-descriptor-ranks={descriptorRanks?.forms.length ?? 0}>
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
          <div>
            <div className="text-sm">OBJ FIDELITY TEST — isolated import pipeline</div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              RAW (white) · REGISTERED (gray) · COPY 2 (gold, +20&apos; X). Aggregation / connectors unmounted.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              style={buttonStyle}
              onClick={() => {
                setDiagnostic("originals");
                setStatus("Exited OBJ Fidelity Test. Aggregation available again.");
              }}
            >
              EXIT FIDELITY TEST
            </button>
            <AppNav />
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="overflow-auto border-r p-3 text-[10px]" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
            <div className="text-[11px]">Source OBJ</div>
            <p className="mt-1" style={{ color: "var(--muted)" }}>Select one file. Only that complete OBJ is shown three times.</p>
            <div className="mt-2 flex flex-col gap-1">
              {meshes.map((mesh) => (
                <button
                  key={mesh.id}
                  type="button"
                  className={`${buttonClass} text-left`}
                  style={{ ...buttonStyle, borderColor: fidelityMesh.id === mesh.id ? "var(--accent)" : "var(--line)" }}
                  onClick={() => enterObjFidelityTest(mesh.id)}
                >
                  {mesh.filename}
                </button>
              ))}
            </div>
            <label className="mt-4 block" style={{ color: "var(--muted)" }}>
              Global units
              <select className="mt-1 w-full rounded border bg-transparent px-2 py-1" style={buttonStyle} value={unit} onChange={(event) => setUnit(event.target.value as UnitName)}>
                <option value="feet">Feet</option>
                <option value="inches">Inches</option>
                <option value="meters">Meters</option>
                <option value="millimeters">Millimeters</option>
              </select>
            </label>
            <label className="mt-3 block" style={{ color: "var(--muted)" }}>
              Up axis
              <select className="mt-1 w-full rounded border bg-transparent px-2 py-1" style={buttonStyle} value={upAxisMode} onChange={(event) => setUpAxisMode(event.target.value as UpAxisMode)}>
                <option value="auto">Auto</option>
                <option value="y">Y up</option>
                <option value="z">Z up</option>
              </select>
            </label>
            <button type="button" className={`${buttonClass} mt-4 w-full`} style={{ ...buttonStyle, borderColor: showLattice ? "var(--accent)" : "var(--line)" }} onClick={() => setShowLattice((value) => !value)}>
              {showLattice ? "20' Grid On (optional)" : "20' Grid Off (optional)"}
            </button>
          </aside>
          <main className="relative min-h-0">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded border px-2 py-1" style={{ borderColor: "#fff", color: "#fff" }}>RAW IMPORT</span>
              <span className="rounded border px-2 py-1" style={{ borderColor: "#c8c8c8", color: "#c8c8c8" }}>REGISTERED TILE</span>
              <span className="rounded border px-2 py-1" style={{ borderColor: "#d4a84b", color: "#d4a84b" }}>COPY 2 (+20&apos; X)</span>
            </div>
            <ObjFidelityViewport
              mesh={fidelityMesh}
              unitScale={UNIT_TO_FEET[unit]}
              upAxisMode={upAxisMode}
              showLattice={showLattice}
            />
            <p className="absolute bottom-3 left-3 right-3 text-[10px]" style={{ color: "var(--muted)" }}>{status}</p>
          </main>
          <aside className="overflow-auto border-l p-3 text-[10px]" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
            {fReport ? (
              <div className="space-y-2 rounded border p-2" style={{ borderColor: fReport.compare.passed ? "#2f6b4f" : "var(--danger-text)" }}>
                <div className="text-[11px]">OBJ FIDELITY — {fReport.compare.passed ? "PASS" : "FAIL"}</div>
                <p style={{ color: "var(--muted)" }}>{fidelityMesh.filename}</p>
                <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                  <div className="font-medium">Gold object</div>
                  <p className="mt-1">COPY 2 = exact clone of the complete source OBJ after registration, translated +20&apos; X. Not a connector, proxy, or reconstruction.</p>
                </div>
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr style={{ color: "var(--muted)" }}>
                      <th className="border-b py-1 text-left" style={{ borderColor: "var(--line)" }} />
                      <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>RAW</th>
                      <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>REG</th>
                      <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>COPY2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Child meshes", fReport.raw.childMeshCount, fReport.registered.childMeshCount, fReport.copy2.childMeshCount],
                      ["Vertices", fReport.raw.vertexCount, fReport.registered.vertexCount, fReport.copy2.vertexCount],
                      ["Triangles", fReport.raw.triangleCount, fReport.registered.triangleCount, fReport.copy2.triangleCount],
                      ["Bound X", fReport.raw.bboxSize[0].toFixed(2), fReport.registered.bboxSize[0].toFixed(2), fReport.copy2.bboxSize[0].toFixed(2)],
                      ["Bound Y", fReport.raw.bboxSize[1].toFixed(2), fReport.registered.bboxSize[1].toFixed(2), fReport.copy2.bboxSize[1].toFixed(2)],
                      ["Bound Z", fReport.raw.bboxSize[2].toFixed(2), fReport.registered.bboxSize[2].toFixed(2), fReport.copy2.bboxSize[2].toFixed(2)],
                      ["Aspect", fReport.raw.aspect.map((v) => v.toFixed(2)).join(":"), fReport.registered.aspect.map((v) => v.toFixed(2)).join(":"), fReport.copy2.aspect.map((v) => v.toFixed(2)).join(":")],
                    ] as const).map(([label, a, b, c]) => (
                      <tr key={label}>
                        <td className="py-0.5 pr-1">{label}</td>
                        <td className="py-0.5 text-right">{a}</td>
                        <td className="py-0.5 text-right">{b}</td>
                        <td className="py-0.5 text-right">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>Counts: {fReport.compare.countsOk ? "PASS" : "FAIL"}</div>
                <div>REG = COPY2 size: {fReport.compare.sizeOk ? "PASS" : "FAIL"}</div>
                <div>RAW ↔ REG aspect: {fReport.compare.aspectOk ? "PASS" : "FAIL"}</div>
                <div>Child locals identity: {fReport.compare.childrenOk ? "PASS" : "FAIL"}</div>
                {fReport.raw.children.map((child) => (
                  <div key={child.name}>{child.name}: scale {child.localScale.join(",")} · faces {child.faceCount}</div>
                ))}
                {fReport.compare.failures.map((failure) => <div key={failure} style={{ color: "var(--danger-text)" }}>{failure}</div>)}
                <p className="mt-2" style={{ color: "var(--muted)" }}>HARD STOP — aggregation unmounted until EXIT FIDELITY TEST.</p>
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Computing fidelity metrics…</p>
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div
      data-board-page="lattice" className="flex h-screen flex-col" data-descriptor-ranks={descriptorRanks?.forms.length ?? 0}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); void importFiles([...event.dataTransfer.files]); }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-sm">Part 2 assignment aggregation · 15 proto-form tiles</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>{registrationLabel(assemblyMode === "global-field" ? undefined : field.cellsZ)}. {assemblyMode === "global-field" ? "GLOBAL FIELD — EXPERIMENTAL" : `ASSIGNMENT MODE — ${ASSEMBLY_TEST_LABELS[assemblyMode]}`}.</div>
        </div>
        <AppNav />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="overflow-auto border-r p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <button type="button" className={buttonClass} style={buttonStyle} onClick={() => fileRef.current?.click()}>Upload OBJ files</button>
          <input ref={fileRef} type="file" accept=".obj" multiple hidden onChange={(event) => { if (event.target.files) void importFiles([...event.target.files]); event.target.value = ""; }} />
            <button type="button" className={`${buttonClass} ml-2`} style={buttonStyle} onClick={() => void loadSamples(importFiles).catch((error) => setStatus(error instanceof Error ? error.message : "Sample load failed."))}>Load 15 samples</button>
          <label className="mt-3 block text-[10px]" style={{ color: "var(--muted)" }}>
            Global units
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]" style={buttonStyle} value={unit} onChange={(event) => setUnit(event.target.value as UnitName)}>
              <option value="feet">Feet</option>
              <option value="inches">Inches</option>
              <option value="meters">Meters</option>
              <option value="millimeters">Millimeters</option>
            </select>
          </label>
          <label className="mt-3 block text-[10px]" style={{ color: "var(--muted)" }}>
            Up axis
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]" style={buttonStyle} value={upAxisMode} onChange={(event) => setUpAxisMode(event.target.value as UpAxisMode)}>
              <option value="auto">Auto</option>
              <option value="y">Y up</option>
              <option value="z">Z up</option>
            </select>
          </label>
          <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>Auto stands a standard OBJ upright. Choose Z up when the file was saved with Z vertical.</p>
          <label className="mt-3 block text-[10px]" style={{ color: "var(--muted)" }}>
            Assembly Test
            <select
              className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]"
              style={buttonStyle}
              value={assemblyMode}
              onChange={(event) => selectAssemblyMode(event.target.value as AssemblyTestMode)}
            >
              {(Object.keys(ASSEMBLY_TEST_LABELS) as AssemblyTestMode[]).map((mode) => (
                <option key={mode} value={mode}>{ASSEMBLY_TEST_LABELS[mode]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${buttonClass} mt-2 w-full`}
            style={actionStyle}
            disabled={busy || models.length < 1}
            onClick={() => void runAssemblyTest()}
          >
            {assemblyMode === "global-field" ? "ASSEMBLE GLOBAL FIELD (EXPERIMENTAL)" : "RUN ORIENTATION + ASSEMBLY"}
          </button>
          <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>Registration increment is always 20 ft. Choose a mode, adjust X/Y/Z if needed, then press RUN ORIENTATION + ASSEMBLY. Settings do not run the solver.</p>
          <div className="mt-3 text-[10px]" style={{ color: "var(--muted)" }}>
            Lattice cell counts (registration slots)
            <div className="mt-1 grid grid-cols-3 gap-1">
              {([["cellsX", "X"], ["cellsY", "Y"], ["cellsZ", "Z"]] as const).map(([axis, label]) => (
                <label key={axis}>
                  {label}
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]"
                    style={buttonStyle}
                    type="number"
                    min={1}
                    max={Math.min(MAX_LATTICE_CELLS_PER_AXIS, 200)}
                    value={field[axis]}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next) || next > 200) return;
                      setLatticeCells(axis, next);
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="mt-1">Board: {field.cellsX} × {field.cellsY} × {field.cellsZ} slots ({field.cellsX * 20} × {field.cellsY * 20} × {field.cellsZ * 20} ft).</p>
            {assemblyMode === "global-field" && (
              <p className="mt-1">GLOBAL FIELD — EXPERIMENTAL uses these counts as the full search board.</p>
            )}
            {latticePerformanceWarning(field) && (
              <p className="mt-1" style={{ color: "var(--danger-text)" }}>{latticePerformanceWarning(field)}</p>
            )}
          </div>
          <p className="mt-3 text-[12px]">Uploaded: {meshes.length} / {REQUIRED_TILES}</p>
          {meshes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {meshes.map((mesh) => (
                <li key={mesh.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate">{mesh.filename}</span>
                  <button type="button" className={buttonClass} style={buttonStyle} onClick={() => removeMesh(mesh.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px]" style={{ color: missing.length ? "var(--danger-text)" : "var(--muted)" }}>SOURCE SLOT MAPPING</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>Assign each uploaded OBJ to its catalog identity. The solver determines lattice position and orientation automatically.</p>
          <p className="mt-1 text-[11px]" style={{ color: missing.length ? "var(--danger-text)" : "var(--muted)" }}>Mapped sources: {assigned.length} / {REQUIRED_TILES}. {missing.length ? `Missing ${missing.map((slot) => slot.code).join(", ")}` : "Every typology slot has a mesh."}</p>
          <div className="mt-3 space-y-1">
            {LATTICE_SLOTS.map((slot) => (
              <label key={slot.id} className="grid grid-cols-[42px_1fr] items-center gap-1 text-[10px]">
                <span>{slot.code}</span>
                <select className="rounded border bg-transparent px-1 py-1" style={buttonStyle} value={assignments[slot.id] ?? ""} onChange={(event) => {
                  const meshId = event.target.value || null;
                  setAssignments((current) => {
                    const next = { ...current, [slot.id]: meshId };
                    if (meshId) for (const other of LATTICE_SLOTS) if (other.id !== slot.id && next[other.id] === meshId) next[other.id] = null;
                    return next;
                  });
                }}>
                  <option value="">Unassigned</option>
                  {meshes.map((mesh) => <option key={mesh.id} value={mesh.id}>{mesh.filename}{mesh.suggestedSlotId === slot.id ? " · suggested" : ""}</option>)}
                </select>
              </label>
            ))}
          </div>
          {selected && selectedPlacement && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">{selected.filename}</div>
              <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>{selectedModel ? `${selectedModel.vertexCount} vertices · ${selectedModel.faceCount} faces · ${selectedModel.minZ.toFixed(1)} to ${selectedModel.maxZ.toFixed(1)} ft` : "Analysis pending"}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ rotation: ((selectedPlacement.rotation + 90) % 360) as Placement["rotation"] })}>Rotate 90°</button>
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ mirror: selectedPlacement.mirror === "x" ? "none" : "x" })}>Mirror X</button>
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ mirror: selectedPlacement.mirror === "y" ? "none" : "y" })}>Mirror Y</button>
                {(["ix", "iy", "iz"] as const).flatMap((axis) => [1, -1].map((step) => (
                  <button type="button" key={`${axis}${step}`} className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ [axis]: selectedPlacement[axis] + step })}>
                    Move {step > 0 ? "+" : "-"}{axis.slice(1).toUpperCase()}
                  </button>
                )))}
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ rotation: 0, mirror: "none", ix: 0, iy: 0, iz: 0 })}>Reset</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => {
                  if (!selected || !selectedPlacement) return;
                  const nextLocked = !selectedPlacement.locked;
                  if (preview) {
                    setPreview({
                      ...preview,
                      placements: { ...preview.placements, [selected.id]: { ...selectedPlacement, locked: nextLocked } },
                    });
                  } else {
                    setPlacements((current) => ({ ...current, [selected.id]: { ...current[selected.id], locked: nextLocked } }));
                  }
                }}>{selectedPlacement.locked ? "Unlock" : "Lock Position"}</button>
              </div>
            </div>
          )}
        </aside>
        <main className="relative min-h-0">
          <div className="absolute left-3 top-3 z-10 flex max-w-[70%] flex-wrap gap-1">
            <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: fidelityActive ? "var(--accent)" : "var(--line)" }} onClick={() => enterObjFidelityTest()}>OBJ FIDELITY TEST</button>
            {fidelityActive ? (
              <>
                <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: showLattice ? "var(--accent)" : "var(--line)" }} onClick={() => setShowLattice((value) => !value)}>{showLattice ? "20' Grid On" : "20' Grid Off (optional)"}</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("iso")}>Isometric</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("plan")}>Plan</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("section")}>Section</button>
                <span className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>Isolated: RAW white · REGISTERED gray · COPY 2 gold · no connectors</span>
              </>
            ) : (
              <>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("white")}>White Model</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("category")}>Color by Category</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("typology")}>Color by Typology</button>
                <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: showLattice ? "var(--accent)" : "var(--line)" }} onClick={() => setShowLattice((value) => !value)}>{showLattice ? "20' Grid On" : "20' Grid Off"}</button>
                <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: showOriginalTiles ? "var(--accent)" : "var(--line)" }} onClick={() => setShowOriginalTiles((value) => !value)}>Original Tile Geometry</button>
                <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: showGeneratedConnectors ? "var(--accent)" : "var(--line)" }} onClick={() => setShowGeneratedConnectors((value) => !value)}>Generated Connectors</button>
                {assemblyMode !== "global-field" && <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setShowConnectionPorts(value => !value)}>Connection Ports {showConnectionPorts ? "On" : "Off"}</button>}
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setConnectionStage("before"); setShowGeneratedConnectors(false); setShowOriginalTiles(true); }}>Before Synthesis</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setConnectionStage("after"); setShowGeneratedConnectors(true); setShowOriginalTiles(true); }}>After Synthesis</button>
                <button type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: showConnections ? "var(--accent)" : "var(--line)" }} onClick={() => setShowConnections((value) => !value)}>
                  {showConnections ? "Connections On" : "Connections Off"}
                </button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("all"); setPresentation(false); }}>Interlock Graph</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("floor"); setPresentation(false); }}>Floor Paths</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("void"); setPresentation(false); }}>Void Paths</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("circulation"); setPresentation(false); }}>Circulation Paths</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("distribution"); setColorMode("typology"); setPresentation(false); }}>Distribution Map</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("iso")}>Isometric</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("plan")}>Plan</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("section")}>Section</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setPresentation((value) => !value)}>{presentation ? "Exit Presentation" : "Presentation Mode"}</button>
              </>
            )}
          </div>
          <LatticeViewport
            ref={viewRef}
            meshes={fidelityActive ? [] : shown.meshes}
            models={fidelityActive ? [] : shown.models}
            placements={fidelityActive ? {} : shown.placements}
            unitScale={UNIT_TO_FEET[unit]}
            upAxisMode={upAxisMode}
            field={assignmentResult?.field ?? field}
            colorMode={presentation ? "white" : colorMode}
            showLattice={showLattice}
            showConnections={fidelityActive ? false : showConnections}
            showConnectionPorts={!fidelityActive && assemblyMode !== "global-field" && showConnectionPorts}
            portPairs={!fidelityActive ? liveAssignmentSynthesis?.portPairs : undefined}
            portCandidates={!fidelityActive ? liveAssignmentSynthesis?.portCandidates : undefined}
            showGeneratedConnectors={fidelityActive ? false : connectionStage === "after" && showGeneratedConnectors}
            showOriginalTiles={fidelityActive ? false : showOriginalTiles}
            connectors={fidelityActive ? [] : displayedConnectors}
            cameraMode={cameraMode}
            diagnostic={diagnostic}
            continuityOverlay={continuityOverlay}
            presentation={fidelityActive ? false : presentation}
            selectedId={selectedId}
            connections={fidelityActive ? [] : shownReport?.connections ?? []}
            onSelect={setSelectedId}
            fidelityMesh={fidelityActive ? fidelityMesh : null}
          />
          <div className="absolute bottom-3 left-3 right-3 space-y-1">
            {busy && progressPercent !== null && (
              <div className="rounded border px-2 py-1.5" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                  <span style={{ color: "var(--muted)" }}>Assembly progress</span>
                  <span style={{ color: "var(--accent)" }}>{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded" style={{ background: "var(--input-background)" }}>
                  <div className="h-full transition-[width] duration-150 ease-out" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%`, background: "var(--accent)" }} />
                </div>
              </div>
            )}
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>{status}</p>
          </div>
        </main>
        <aside className="overflow-auto border-l p-3 text-[10px]" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <button type="button" className={buttonClass} style={actionStyle} disabled={fidelityActive || busy || models.length < 1} onClick={() => void runAssemblyTest()}>
            {fidelityActive ? "AGGREGATION PAUSED (FIDELITY)" : assemblyMode === "global-field" ? "ASSEMBLE GLOBAL FIELD (EXPERIMENTAL)" : "ASSEMBLE SELECTED FORMS"}
          </button>
          <button type="button" className={`${buttonClass} mt-2 block`} style={buttonStyle} disabled={busy || models.length < 1 || assemblyMode !== "global-field"} onClick={() => void runSearch()}>REASSEMBLE UNLOCKED CELLS</button>
          <button type="button" className={`${buttonClass} mt-2 block`} style={buttonStyle} onClick={clearSavedSession}>CLEAR SAVED SESSION</button>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Part 2 autosaves meshes, prefs, and the last assembly so switching tabs does not reset it.</p>
          {busy && progressPercent !== null && (
            <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>Progress</span>
                <span style={{ color: "var(--accent)" }}>{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded" style={{ background: "var(--input-background)" }}>
                <div className="h-full transition-[width] duration-150 ease-out" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%`, background: "var(--accent)" }} />
              </div>
            </div>
          )}
          <div className="mt-3 rounded border p-2 space-y-2" style={{ borderColor: "var(--line)" }}>
            <div className="text-[11px]">DISTRIBUTION</div>
            <p style={{ color: "var(--muted)" }}>Changing these controls updates settings. Press the run button to assemble.</p>
            <label className="block" style={{ color: "var(--muted)" }}>
              Dispersion {distributionWeight}% · 0% interlock bias · 100% maximum dispersion
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={distributionWeight}
                onChange={(event) => {
                  setDistributionWeight(Number(event.target.value));
                }}
              />
            </label>
            <label className="block" style={{ color: "var(--muted)" }}>
              Clustering {clusteringPercent}% · 0% disperse same types · 100% allow aggregation
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={clusteringPercent}
                onChange={(event) => {
                  setClusteringPercent(Number(event.target.value));
                }}
              />
            </label>
            <div>
              Largest same-type cluster: <span style={{ color: "var(--accent)" }}>{activeAssembly?.distribution?.maxCluster ?? "—"}</span>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={balanceTypologies}
                onChange={(event) => {
                  setBalanceTypologies(event.target.checked);
                }}
              />
              Balance Typologies
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={balanceCategories}
                onChange={(event) => {
                  setBalanceCategories(event.target.checked);
                }}
              />
              Balance Categories
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preventLargeClusters}
                onChange={(event) => {
                  setPreventLargeClusters(event.target.checked);
                }}
              />
              Prevent Large Clusters
            </label>
          </div>
          <div className="mt-2 space-y-2 rounded border p-2 text-[10px]" style={{ borderColor: "var(--line)" }}>
            <div className="text-[11px]">Assignment presentation picks</div>
            <label>Gathering
              <select className="mt-1 w-full rounded border bg-transparent px-1 py-1" style={buttonStyle} value={gatheringSlot} onChange={(event) => setGatheringSlot(event.target.value)}>
                {LATTICE_SLOTS.filter((slot) => slot.category === "Gathering").map((slot) => <option key={slot.id} value={slot.id}>{slot.code} {slot.name}</option>)}
              </select>
            </label>
            <label>Office
              <select className="mt-1 w-full rounded border bg-transparent px-1 py-1" style={buttonStyle} value={officeSlot} onChange={(event) => setOfficeSlot(event.target.value)}>
                {LATTICE_SLOTS.filter((slot) => slot.category === "Office").map((slot) => <option key={slot.id} value={slot.id}>{slot.code} {slot.name}</option>)}
              </select>
            </label>
            <label>Lobby
              <select className="mt-1 w-full rounded border bg-transparent px-1 py-1" style={buttonStyle} value={lobbySlot} onChange={(event) => setLobbySlot(event.target.value)}>
                {LATTICE_SLOTS.filter((slot) => slot.category === "Lobby").map((slot) => <option key={slot.id} value={slot.id}>{slot.code} {slot.name}</option>)}
              </select>
            </label>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || !models.length} onClick={() => void runSelectedCategoryTests()}>ASSEMBLE PRESENTATION PICKS</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {([2, 3, 4, 8] as const).map((count) => <button type="button" key={count} className={buttonClass} style={buttonStyle} disabled={busy || models.length < 2} onClick={() => selectAssemblyMode(`copies-${count}` as AssemblyTestMode)}>{count} FORMS</button>)}
          </div>
          <button type="button" className={`${buttonClass} mt-2`} style={buttonStyle} disabled={busy || !models.length} onClick={() => selectAssemblyMode("catalog")}>SELECT CATALOG TEST (ALL 15)</button>
          {busy && <button type="button" className={`${buttonClass} mt-2`} style={buttonStyle} onClick={() => { cancelRef.current += 1; }}>Cancel</button>}
          <p className="mt-3" style={{ color: "var(--muted)" }}>Assignment mode orients distinct forms toward compatible existing circulation edges on 20&apos; plan bays. Z Grid = 1 keeps every root at Z = 0; source geometry may extend above it. Z Grid &gt; 1 permits stacking. Connectors close remaining short gaps. Hover a Connection Ports label for its type, elevation, width, and confidence.</p>
          <div className="mt-2 space-y-1">
            {options?.map((option) => (
              <button type="button" key={option.id} className={`${buttonClass} block w-full text-left`} style={{ ...buttonStyle, outline: activeOption === option.id ? "1px solid var(--accent)" : undefined }} onClick={() => chooseOption(option)}>
                Option {option.id} — {option.title}. Score {option.score.toFixed(1)}
                {assignmentResult ? ` · connectors ${assignmentResult.synthesis.connectors.length}` : ` · Distribution ${option.distributionScore.toFixed(1)}`}.
              </button>
            ))}
          </div>
          {stats && <p className="mt-2" style={{ color: "var(--muted)" }}>{stats.candidatesTested} placements tested · {stats.pairwiseComparisons} interface comparisons · {Math.round(stats.milliseconds)} ms search · {Math.round(Math.max(0, stats.analysisMilliseconds))} ms with analysis</p>}
          {selectedNote && (
            <div className="mt-3 space-y-1 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">Selected tile diagnostics</div>
              <div>Type: {selectedNote.filename}</div>
              <div>Orientation: {selectedNote.rotation}° / {selectedNote.mirror === "none" ? "no mirror" : `mirror ${selectedNote.mirror}`}</div>
              <div>Cell: {selectedNote.ix}, {selectedNote.iy}, {selectedNote.iz}</div>
              <div>Interlock score: {selectedNote.score.toFixed(1)}</div>
              <div>Floor continuity: {selectedNote.floor.toFixed(1)}</div>
              <div>Void continuity: {selectedNote.void.toFixed(1)}</div>
              <div>Circulation continuity: {selectedNote.circulation.toFixed(1)}</div>
              <div>Complementary interlock: {selectedNote.complementary.toFixed(1)}</div>
              <div>Collision: {selectedNote.collision.toFixed(1)}</div>
              {selectedNote.distribution !== undefined && <div>Distribution delta: {selectedNote.distribution.toFixed(1)}</div>}
              <div>Reason: {selectedNote.reason}</div>
              {selectedNote.neighbors.length > 0 && <div>Neighbors scored: {selectedNote.neighbors.map((neighbor) => `${neighbor.direction} ${neighbor.score.toFixed(1)}`).join(" · ")}</div>}
              {selectedLinks.map((connection, index) => (
                <div key={`${connection.tileA}-${connection.tileB}-${index}`} className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                  <div>{connection.labelA} ↔ {connection.labelB}</div>
                  <div>Interlock {connection.interlock} · Floor {connection.floor} · Void {connection.void} · Circ {connection.circulation}</div>
                  {connection.reason && <div>{connection.reason}</div>}
                </div>
              ))}
            </div>
          )}
          {!fidelityActive && shownReport && (
            <div className="mt-3 space-y-1">
              <div>OBJ types loaded: {meshes.length}</div>
              <div>Cells assembled: {shown.models.length}{assemblyMode === "global-field" ? ` / ${cellCount}` : ""}</div>
              <div>OBJ types used: {new Set(shown.models.map((model) => sourceIdOf(model.id))).size}</div>
              <div>Connected components: {shownReport.components}</div>
              <div>Valid interlocks: {shownReport.connections.filter((connection) => connection.interlock === "PASS").length}</div>
              <div>Floor continuities: {shownReport.connections.filter((connection) => connection.floor === "PASS").length}</div>
              <div>Void continuities: {shownReport.connections.filter((connection) => connection.void === "PASS").length}</div>
              <div>Circulation continuities: {shownReport.connections.filter((connection) => connection.circulation === "PASS").length}</div>
              <div>Collision warnings: {shownReport.connections.filter((connection) => connection.collision !== "PASS").length}</div>
              {activeAssembly && <div>Distribution score: {activeAssembly.distributionScore.toFixed(1)}</div>}
              {activeAssembly?.distribution && (
                <>
                  <div>Target / type: {activeAssembly.distribution.targetPerType.toFixed(1)}</div>
                  <div>Largest same-type cluster: {activeAssembly.distribution.maxCluster}</div>
                  <div>Max same-type run: {activeAssembly.distribution.maxRun}</div>
                  <div>Neighborhood diversity: {(activeAssembly.distribution.neighborhoodDiversity * 100).toFixed(0)}%</div>
                  <div>Categories · G {activeAssembly.distribution.categoryCounts.Gathering ?? 0} · O {activeAssembly.distribution.categoryCounts.Office ?? 0} · L {activeAssembly.distribution.categoryCounts.Lobby ?? 0}</div>
                </>
              )}
            </div>
          )}
          {!fidelityActive && activeAssembly?.distribution && (
            <div className="mt-3 max-h-56 space-y-1 overflow-auto rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">Typology distribution</div>
              {activeAssembly.distribution.typologyRows.map((row) => (
                <div key={row.sourceId}>
                  {slotById(row.slotId)?.code ?? row.filename}: {row.count} ({row.percent.toFixed(1)}%) · target {row.target.toFixed(1)} · Δ {row.difference >= 0 ? "+" : ""}{row.difference.toFixed(1)} · cluster {row.largestCluster} · run {row.maxRun} · avg dist {row.avgSameTypeDistance.toFixed(1)}
                </div>
              ))}
            </div>
          )}
          {!fidelityActive && copyWarning && <p className="mt-3 rounded p-2" style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}>{copyWarning}</p>}
          {!fidelityActive && (
            <div className="mt-3 max-h-48 space-y-2 overflow-auto">
              {shownReport && shownReport.connections.length > listedConnections.length && <p style={{ color: "var(--muted)" }}>Showing {listedConnections.length} of {shownReport.connections.length} neighbor checks.</p>}
              {listedConnections.map((connection, index) => (
                <div key={`${connection.tileA}-${connection.tileB}-${index}`} className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                  <div>Tile A: {connection.labelA}</div>
                  <div>Tile B: {connection.labelB}</div>
                  <div>Transform A: {connection.transformA}</div>
                  <div>Transform B: {connection.transformB}</div>
                  <div>Connection direction: {connection.direction}</div>
                  <div>Floor continuity: {connection.floor}</div>
                  <div>Void continuity: {connection.void}</div>
                  <div>Circulation continuity: {connection.circulation}</div>
                  <div>Collision: {connection.collision}</div>
                  <div>Interlock: {connection.interlock}</div>
                </div>
              ))}
            </div>
          )}
          {fidelityActive && fidelityReport && (
            <div className="mt-3 space-y-2 rounded border p-2" style={{ borderColor: fidelityReport.compare.passed ? "#2f6b4f" : "var(--danger-text)" }}>
              <div className="text-[11px]">OBJ FIDELITY — {fidelityReport.compare.passed ? "PASS" : "FAIL"}</div>
              <p style={{ color: "var(--muted)" }}>{fidelityMesh?.filename}</p>
              <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                <div className="font-medium">Gold object identification</div>
                <p className="mt-1">The gold mesh is <strong>COPY 2</strong>: an exact clone of the complete source OBJ after registration, translated +20&apos; in X.</p>
                <p className="mt-1" style={{ color: "var(--muted)" }}>It is not a connector, bounding box, proxy, registration volume, collision mesh, or reconstructed form. Connectors are removed from this mode.</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {meshes.slice(0, 15).map((mesh) => (
                  <button key={mesh.id} type="button" className={buttonClass} style={{ ...buttonStyle, borderColor: fidelityMesh?.id === mesh.id ? "var(--accent)" : "var(--line)" }} onClick={() => enterObjFidelityTest(mesh.id)}>{mesh.filename.replace(/\.obj$/i, "").slice(0, 18)}</button>
                ))}
              </div>
              <table className="mt-2 w-full border-collapse text-[9px]">
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th className="border-b py-1 text-left" style={{ borderColor: "var(--line)" }} />
                    <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>RAW</th>
                    <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>REGISTERED</th>
                    <th className="border-b py-1 text-right" style={{ borderColor: "var(--line)" }}>COPY 2</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Child meshes", fidelityReport.raw.childMeshCount, fidelityReport.registered.childMeshCount, fidelityReport.copy2.childMeshCount],
                    ["Vertices", fidelityReport.raw.vertexCount, fidelityReport.registered.vertexCount, fidelityReport.copy2.vertexCount],
                    ["Triangles", fidelityReport.raw.triangleCount, fidelityReport.registered.triangleCount, fidelityReport.copy2.triangleCount],
                    ["Bounding X", fidelityReport.raw.bboxSize[0].toFixed(3), fidelityReport.registered.bboxSize[0].toFixed(3), fidelityReport.copy2.bboxSize[0].toFixed(3)],
                    ["Bounding Y", fidelityReport.raw.bboxSize[1].toFixed(3), fidelityReport.registered.bboxSize[1].toFixed(3), fidelityReport.copy2.bboxSize[1].toFixed(3)],
                    ["Bounding Z", fidelityReport.raw.bboxSize[2].toFixed(3), fidelityReport.registered.bboxSize[2].toFixed(3), fidelityReport.copy2.bboxSize[2].toFixed(3)],
                    ["Aspect X:Y:Z", fidelityReport.raw.aspect.map((v) => v.toFixed(3)).join(":"), fidelityReport.registered.aspect.map((v) => v.toFixed(3)).join(":"), fidelityReport.copy2.aspect.map((v) => v.toFixed(3)).join(":")],
                  ] as const).map(([label, a, b, c]) => (
                    <tr key={label}>
                      <td className="py-0.5 pr-2">{label}</td>
                      <td className="py-0.5 text-right">{a}</td>
                      <td className="py-0.5 text-right">{b}</td>
                      <td className="py-0.5 text-right">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                <div>Counts equal: {fidelityReport.compare.countsOk ? "PASS" : "FAIL"}</div>
                <div>REGISTERED = COPY 2 size: {fidelityReport.compare.sizeOk ? "PASS" : "FAIL"}</div>
                <div>RAW ↔ REGISTERED aspect: {fidelityReport.compare.aspectOk ? "PASS" : "FAIL"}</div>
                <div>Child locals identity only: {fidelityReport.compare.childrenOk ? "PASS" : "FAIL"}</div>
                <div>Root RAW T {fidelityReport.raw.rootTranslation.join(", ")} · unit×{fidelityReport.raw.unitScale}</div>
                <div>Root REG T {fidelityReport.registered.rootTranslation.map((v) => v.toFixed(1)).join(", ")} · unit×{fidelityReport.registered.unitScale.toFixed(4)} · up {fidelityReport.registered.upAxis}</div>
                <div>Root COPY2 T {fidelityReport.copy2.rootTranslation.map((v) => v.toFixed(1)).join(", ")} (+20&apos; X vs REG)</div>
              </div>
              <div className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                <div className="font-medium">Child transform check</div>
                {fidelityReport.raw.children.map((child) => (
                  <div key={child.name}>{child.name}: pos {child.localPosition.join(",")} · rot {child.localRotation.join(",")} · scale {child.localScale.join(",")} · faces {child.faceCount}</div>
                ))}
                <p className="mt-1" style={{ color: "var(--muted)" }}>Only the tile root may transform. Children stay at identity local transforms.</p>
              </div>
              {fidelityReport.compare.failures.map((failure) => <div key={failure} style={{ color: "var(--danger-text)" }}>{failure}</div>)}
              <p className="mt-2" style={{ color: "var(--muted)" }}>HARD STOP — aggregation / bridges / ramps / stairs disabled until this screen is approved.</p>
            </div>
          )}
          {!fidelityActive && catalogue.length > 0 && (
            <div className="mt-3">
              {catalogue.map((row) => (
                <div key={row.slotId} style={{ color: row.status === "UNMAPPED" ? "var(--danger-text)" : undefined }}>
                  {row.code} {row.name} · {row.status}
                  {row.mapped ? ` · best ${row.bestCopies}-form · score ${row.score.toFixed(1)}` : " · missing OBJ mapping"}
                  {row.warning ? ` · ${row.warning}` : ""}
                </div>
              ))}
            </div>
          )}
          {!fidelityActive && assignmentResult && (
            <div className="mt-3 space-y-1 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">Assignment result</div>
              <div>Mode: {ASSEMBLY_TEST_LABELS[assignmentResult.mode]}</div>
              <div>Copy count: {assignmentResult.copyCount}</div>
              <div>Registration: {registrationLabel(assignmentResult.field.cellsZ)}</div>
              {liveAssignmentSynthesis?.connectionDiagnostics && <div>Port candidates: {liveAssignmentSynthesis.connectionDiagnostics.candidateCount} · Accepted: {liveAssignmentSynthesis.connectionDiagnostics.acceptedCount} · Rejected: {liveAssignmentSynthesis.connectionDiagnostics.rejectedCount}<br />Circulation components: {liveAssignmentSynthesis.connectionDiagnostics.componentsBefore} → {liveAssignmentSynthesis.connectionDiagnostics.componentsAfter}<br />{Object.entries(liveAssignmentSynthesis.connectionDiagnostics.rejectionCounts).map(([reason,count])=>`${reason}: ${count}`).join(" · ")}</div>}
              <div>Accepted port relationships: {liveAssignmentSynthesis?.portPairs?.length ?? assignmentResult.synthesis.portPairs?.length ?? 0}</div>
              <div>Transforms: {describeTransformsUsed(assignmentResult).labels.join(" · ") || "identity"}</div>
              <div>Status: {assignmentResult.status}</div>
              <div>DIRECT transition joints: {assignmentResult.synthesis.directInterlocks}</div>
              <div>Generated bridges/plates: {assignmentResult.synthesis.bridges}</div>
              <div>Generated ramps: {assignmentResult.synthesis.ramps}</div>
              <div>Generated stairs: {assignmentResult.synthesis.stairs}</div>
              <div>Generated landings: {assignmentResult.synthesis.landings}</div>
              <div>Vertical links: {assignmentResult.synthesis.verticalLinks}</div>
              <div>Floor / void / circ pairs: {assignmentResult.parts.floor} / {assignmentResult.parts.void} / {assignmentResult.parts.circulation}</div>
              <div>Typology retention: {assignmentResult.typologyRetention.toFixed(0)}</div>
              <div>Original OBJ geometry: 100% retained</div>
              <div>Source prominence: {assignmentResult.primaryPreserved.toFixed(0)}%</div>
              <div>Connector cost: {assignmentResult.synthesis.connectorCost.toFixed(1)}</div>
              <div>Overall score: {assignmentResult.score.toFixed(1)}</div>
              <div>Stage: {connectionStage === "before" ? "Before synthesis" : "After synthesis"}</div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {(["originals", "obj-fidelity", "lattice", "interfaces", "pairwise", "transforms", "assembly", "validation", "continuity", "distribution", "copies"] as DiagnosticMode[]).map((mode) => (
              <button type="button" key={mode} className={buttonClass} style={buttonStyle} onClick={() => {
                if (mode === "obj-fidelity") {
                  enterObjFidelityTest();
                  return;
                }
                setDiagnostic(mode);
                setPresentation(false);
                if (mode === "continuity") setContinuityOverlay("all");
                if (mode === "distribution") setColorMode("typology");
                if (mode !== "copies" && mode !== "assembly" && mode !== "continuity" && mode !== "validation" && mode !== "distribution") setPreview(null);
              }}>{mode === "obj-fidelity" ? "OBJ FIDELITY" : mode}</button>
            ))}
          </div>
          {diagnostic === "interfaces" && selectedModel && <p className="mt-2">Open boundary cells {selectedModel.openBoundary}. Projection {selectedModel.projection.toFixed(1)} ft. Recess {selectedModel.recess.toFixed(1)} ft. Horizontal area {selectedModel.horizontalArea.toFixed(1)} ft². Vertical area {selectedModel.verticalArea.toFixed(1)} ft².</p>}
          {diagnostic === "transforms" && models.map((model) => {
            const placement = placements[model.id];
            return <div key={model.id}>{slotById(model.slotId)?.code} {placement ? `${placement.rotation}° ${placement.mirror} @ ${placement.ix},${placement.iy},${placement.iz}${placement.locked ? " locked" : ""}` : "unplaced"}</div>;
          })}
          <div className="mt-3 flex flex-wrap gap-1">
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly.obj", assembledObj(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], upAxisMode, connectionStage === "after" ? displayedConnectors : []), "text/plain")}>EXPORT ASSEMBLED OBJ</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly.json", JSON.stringify(assemblyManifest(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], unit, field), null, 2), "application/json")}>assembly.json</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly-union.obj", voxelUnionObj(shown.models, shown.placements), "text/plain")}>UNION FOR EXPORT</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-isometric.png", "clean", "iso")}>Isometric PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-plan.png", "clean", "plan")}>Plan PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-section.png", "clean", "section")}>Section PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-assembly.png", "lattice", "iso")}>Lattice + assembly PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!preview} onClick={() => download(`interlock-${copyCount}.obj`, assembledObj(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], upAxisMode, connectionStage === "after" ? displayedConnectors : []), "text/plain")}>{copyCount}-copy OBJ</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

async function loadSamples(importFiles: (files: File[]) => Promise<void>) {
  const files: File[] = [];
  for (const slot of LATTICE_SLOTS) {
    const filename = `${slot.id}-${slot.name.replace(/[ /]/g, "-")}.obj`;
    const response = await fetch(`/part2-samples/${filename}`);
    if (!response.ok) throw new Error(`Missing sample ${filename}`);
    files.push(new File([await response.text()], filename, { type: "text/plain" }));
  }
  await importFiles(files);
}
