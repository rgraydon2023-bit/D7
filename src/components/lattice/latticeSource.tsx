"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { LATTICE_SESSION_KEY, readJson, writeJson } from "../browserSession";
import { parseObj } from "./parseObj";
import { LATTICE_SLOTS } from "./slots";
import type { ImportedObj, UpAxisMode, UnitName } from "./types";
import { MAX_IMPORTS } from "./types";

/** Session packing matches LatticeStudio so existing localStorage sessions still restore. */
type PackedMesh = Omit<ImportedObj, "positions" | "normals"> & {
  positions: number[];
  normals: number[];
};

type LatticeSessionSlice = {
  version?: number;
  meshes?: PackedMesh[];
  assignments?: Record<string, string | null>;
  unit?: UnitName;
  upAxisMode?: UpAxisMode;
};

export type LatticeSourceOrigin = "empty" | "session" | "user" | "sample";

type LatticeSourceValue = {
  hydrated: boolean;
  origin: LatticeSourceOrigin;
  meshes: ImportedObj[];
  assignments: Record<string, string | null>;
  unit: UnitName;
  upAxisMode: UpAxisMode;
  setMeshes: Dispatch<SetStateAction<ImportedObj[]>>;
  setAssignments: Dispatch<SetStateAction<Record<string, string | null>>>;
  setUnit: Dispatch<SetStateAction<UnitName>>;
  setUpAxisMode: Dispatch<SetStateAction<UpAxisMode>>;
  importObjFiles: (files: File[]) => Promise<{ imported: number; error?: string }>;
  /** Explicit fallback. Fills only unassigned slots; never replaces an active Lattice assignment. */
  loadSampleObjs: () => Promise<{ loaded: number; error?: string }>;
};

const LatticeSourceContext = createContext<LatticeSourceValue | null>(null);

function packMesh(mesh: ImportedObj): PackedMesh {
  return { ...mesh, positions: Array.from(mesh.positions), normals: Array.from(mesh.normals) };
}

function unpackMesh(mesh: PackedMesh): ImportedObj {
  return { ...mesh, positions: new Float32Array(mesh.positions), normals: new Float32Array(mesh.normals) };
}

function sampleFilename(slot: (typeof LATTICE_SLOTS)[number]) {
  return `${slot.id}-${slot.name.replace(/[ /]/g, "-")}.obj`;
}

export function LatticeSourceProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [origin, setOrigin] = useState<LatticeSourceOrigin>("empty");
  const [meshes, setMeshes] = useState<ImportedObj[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [unit, setUnit] = useState<UnitName>("feet");
  const [upAxisMode, setUpAxisMode] = useState<UpAxisMode>("auto");

  useEffect(() => {
    try {
      const saved = readJson<LatticeSessionSlice>(LATTICE_SESSION_KEY);
      if (saved?.version === 1 && Array.isArray(saved.meshes)) {
        setMeshes(saved.meshes.map(unpackMesh));
        if (saved.assignments) setAssignments(saved.assignments);
        if (saved.unit) setUnit(saved.unit);
        if (saved.upAxisMode) setUpAxisMode(saved.upAxisMode);
        setOrigin(saved.meshes.length ? "session" : "empty");
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      const previous = readJson<Record<string, unknown>>(LATTICE_SESSION_KEY) ?? { version: 1 };
      writeJson(LATTICE_SESSION_KEY, {
        ...previous,
        version: 1,
        meshes: meshes.map(packMesh),
        assignments,
        unit,
        upAxisMode,
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [hydrated, meshes, assignments, unit, upAxisMode]);

  const importObjFiles = useCallback(async (files: File[]) => {
    const room = MAX_IMPORTS - meshes.length;
    const accepted = [...files].filter((file) => file.name.toLowerCase().endsWith(".obj")).slice(0, Math.max(0, room));
    if (!accepted.length) {
      return { imported: 0, error: room <= 0 ? `The upload limit is ${MAX_IMPORTS} OBJ files.` : "Choose OBJ files." };
    }
    const parsed: ImportedObj[] = [];
    const errors: string[] = [];
    for (const file of accepted) {
      try { parsed.push(parseObj(await file.text(), file.name)); }
      catch (error) { errors.push(error instanceof Error ? error.message : file.name); }
    }
    setMeshes((current) => [...current, ...parsed].slice(0, MAX_IMPORTS));
    setAssignments((current) => {
      const next = { ...current };
      for (const mesh of parsed) {
        if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) next[mesh.suggestedSlotId] = mesh.id;
      }
      return next;
    });
    setOrigin("user");
    return { imported: parsed.length, error: errors[0] };
  }, [meshes.length]);

  const loadSampleObjs = useCallback(async () => {
    const openSlots = LATTICE_SLOTS.filter((slot) => !assignments[slot.id]);
    if (!openSlots.length) return { loaded: 0, error: "Every Lattice slot already has a source OBJ." };
    const parsed: ImportedObj[] = [];
    for (const slot of openSlots) {
      const filename = sampleFilename(slot);
      const response = await fetch(`/part2-samples/${filename}`);
      if (!response.ok) return { loaded: parsed.length, error: `Missing sample ${filename}` };
      const mesh = parseObj(await response.text(), filename);
      mesh.suggestedSlotId = slot.id;
      parsed.push(mesh);
    }
    setMeshes((current) => [...current, ...parsed].slice(0, MAX_IMPORTS));
    setAssignments((current) => {
      const next = { ...current };
      for (const mesh of parsed) {
        if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) next[mesh.suggestedSlotId] = mesh.id;
      }
      return next;
    });
    setOrigin(assignments && Object.values(assignments).some(Boolean) ? "user" : "sample");
    return { loaded: parsed.length };
  }, [assignments]);

  const value = useMemo<LatticeSourceValue>(() => ({
    hydrated,
    origin,
    meshes,
    assignments,
    unit,
    upAxisMode,
    setMeshes,
    setAssignments,
    setUnit,
    setUpAxisMode,
    importObjFiles,
    loadSampleObjs,
  }), [hydrated, origin, meshes, assignments, unit, upAxisMode, importObjFiles, loadSampleObjs]);

  return <LatticeSourceContext.Provider value={value}>{children}</LatticeSourceContext.Provider>;
}

export function useLatticeSource() {
  const value = useContext(LatticeSourceContext);
  if (!value) throw new Error("useLatticeSource must be used inside LatticeSourceProvider");
  return value;
}
