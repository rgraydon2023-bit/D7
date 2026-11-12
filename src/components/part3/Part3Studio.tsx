"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import AppNav from "../AppNav";
import { PART3_REPO_KEY, readJson, writeJson } from "../browserSession";
import { parseObj } from "../lattice/parseObj";
import type { ImportedObj, UnitName, UpAxisMode } from "../lattice/types";
import type { CutAxis, ObjOrientation } from "./Part3Viewport";

const Part3Viewport = dynamic(() => import("./Part3Viewport"), { ssr: false });

const buttonClass = "rounded border px-2 py-1 text-[10px] disabled:opacity-40";
const buttonStyle = { borderColor: "var(--line)" } as const;
const MAX_REPO_ENTRIES = 24;

type RepoEntry = {
  id: string;
  filename: string;
  savedAt: string;
  text: string;
  faceCount: number;
  vertexCount: number;
};

function entryId() {
  return `repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ZERO_ORIENTATION: ObjOrientation = { x: 0, y: 0, z: 0 };

function wrapDegrees(value: number) {
  return ((Math.round(value) % 360) + 360) % 360;
}

export default function Part3Studio() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [meshes, setMeshes] = useState<ImportedObj[]>([]);
  const [unit, setUnit] = useState<UnitName>("feet");
  const [upAxisMode, setUpAxisMode] = useState<UpAxisMode>("auto");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orientations, setOrientations] = useState<Record<string, ObjOrientation>>({});
  const [status, setStatus] = useState("Choose an OBJ file to preview it here.");
  const [cutAxis, setCutAxis] = useState<CutAxis>("off");
  const [cutPosition, setCutPosition] = useState(0.5);
  const [repository, setRepository] = useState<RepoEntry[]>([]);
  const [repoReady, setRepoReady] = useState(false);

  const selected = useMemo(() => meshes.find((mesh) => mesh.id === selectedId) ?? meshes[0] ?? null, [meshes, selectedId]);
  const selectedOrientation = selected ? (orientations[selected.id] ?? ZERO_ORIENTATION) : ZERO_ORIENTATION;

  function updateSelectedOrientation(patch: Partial<ObjOrientation>) {
    if (!selected) return;
    const id = selected.id;
    setOrientations((current) => {
      const previous = current[id] ?? ZERO_ORIENTATION;
      return {
        ...current,
        [id]: {
          x: wrapDegrees(patch.x ?? previous.x),
          y: wrapDegrees(patch.y ?? previous.y),
          z: wrapDegrees(patch.z ?? previous.z),
        },
      };
    });
  }

  useEffect(() => {
    const saved = readJson<RepoEntry[]>(PART3_REPO_KEY);
    if (Array.isArray(saved)) {
      setRepository(saved.filter((entry) => entry && typeof entry.text === "string" && typeof entry.filename === "string"));
    }
    setRepoReady(true);
  }, []);

  useEffect(() => {
    if (!repoReady) return;
    if (!writeJson(PART3_REPO_KEY, repository)) {
      setStatus("Repository could not be saved. Browser storage may be full.");
    }
  }, [repository, repoReady]);

  function saveToRepository(filename: string, text: string, mesh: ImportedObj) {
    const savedAt = new Date().toLocaleString();
    setRepository((current) => {
      const next: RepoEntry = {
        id: entryId(),
        filename,
        savedAt,
        text,
        faceCount: mesh.faces.length,
        vertexCount: mesh.positions.length / 3,
      };
      const withoutSameName = current.filter((entry) => entry.filename.toLowerCase() !== filename.toLowerCase());
      return [next, ...withoutSameName].slice(0, MAX_REPO_ENTRIES);
    });
  }

  async function importFiles(files: File[]) {
    const accepted = files.filter((file) => file.name.toLowerCase().endsWith(".obj"));
    if (!accepted.length) {
      setStatus("Choose an .obj file.");
      return;
    }
    const parsed: ImportedObj[] = [];
    const errors: string[] = [];
    for (const file of accepted) {
      try {
        const text = await file.text();
        const mesh = parseObj(text, file.name);
        parsed.push(mesh);
        saveToRepository(file.name, text, mesh);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name} could not be read.`);
      }
    }
    if (!parsed.length) {
      setStatus(errors[0] ?? "No OBJ meshes were imported.");
      return;
    }
    setMeshes((current) => [...current, ...parsed]);
    setSelectedId(parsed[0].id);
    setStatus(`Loaded and saved ${parsed.map((mesh) => mesh.filename).join(", ")}.${errors.length ? ` ${errors[0]}` : ""}`);
  }

  function loadFromRepository(entry: RepoEntry) {
    try {
      const mesh = parseObj(entry.text, entry.filename);
      setMeshes((current) => {
        const withoutSame = current.filter((item) => item.filename.toLowerCase() !== entry.filename.toLowerCase());
        return [...withoutSame, mesh];
      });
      setSelectedId(mesh.id);
      setStatus(`Loaded ${entry.filename} from the repository.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${entry.filename} could not be loaded.`);
    }
  }

  function removeFromRepository(id: string) {
    const removed = repository.find((entry) => entry.id === id);
    setRepository((current) => current.filter((entry) => entry.id !== id));
    if (removed) setStatus(`Removed ${removed.filename} from the repository.`);
  }

  return (
    <div
      className="flex h-screen flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void importFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-sm">Part 3 OBJ input</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>Upload an OBJ mesh and inspect it in 3D. Imported files are kept in a local repository.</div>
        </div>
        <AppNav />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-auto border-r p-3" style={{ borderColor: "var(--line)" }}>
          <button type="button" className={buttonClass} style={buttonStyle} onClick={() => fileRef.current?.click()}>
            Input OBJ file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".obj,model/obj"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void importFiles([...event.target.files]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className={`${buttonClass} ml-2`}
            style={buttonStyle}
            disabled={!meshes.length}
            onClick={() => {
              setMeshes([]);
              setSelectedId(null);
              setOrientations({});
              setStatus("Cleared the viewer. Repository files are still saved.");
            }}
          >
            Clear viewer
          </button>
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
          <div className="mt-3 text-[10px]" style={{ color: "var(--muted)" }}>
            Cut plane
            <div className="mt-1 flex flex-wrap gap-1">
              {([
                ["off", "Off"],
                ["x", "X"],
                ["y", "Y"],
                ["z", "Z"],
              ] as const).map(([axis, label]) => (
                <button
                  key={axis}
                  type="button"
                  className={buttonClass}
                  style={{
                    ...buttonStyle,
                    borderColor: cutAxis === axis ? "var(--accent)" : "var(--line)",
                    color: cutAxis === axis ? "#000" : undefined,
                    background: cutAxis === axis ? "var(--accent)" : "transparent",
                    fontWeight: cutAxis === axis ? 600 : 400,
                  }}
                  onClick={() => setCutAxis((current) => (current === axis && axis !== "off" ? "off" : axis))}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-2 block">
              Position {Math.round(cutPosition * 100)}%
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={Math.round(cutPosition * 100)}
                disabled={cutAxis === "off"}
                onChange={(event) => setCutPosition(Number(event.target.value) / 100)}
              />
            </label>
          </div>
          <p className="mt-3 text-[12px]">{status}</p>
          {meshes.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>In viewer</div>
              <ul className="mt-1 space-y-1">
                {meshes.map((mesh) => (
                  <li key={mesh.id}>
                    <button
                      type="button"
                      className="w-full rounded border px-2 py-1 text-left text-[10px]"
                      style={{
                        borderColor: selected?.id === mesh.id ? "var(--accent)" : "var(--line)",
                        background: selected?.id === mesh.id ? "var(--panel-soft)" : "transparent",
                      }}
                      onClick={() => setSelectedId(mesh.id)}
                    >
                      {mesh.filename}
                      <div style={{ color: "var(--muted)" }}>
                        {mesh.faces.length} faces · {mesh.positions.length / 3} vertices
                        {" · "}
                        {(orientations[mesh.id] ?? ZERO_ORIENTATION).x}° / {(orientations[mesh.id] ?? ZERO_ORIENTATION).y}° / {(orientations[mesh.id] ?? ZERO_ORIENTATION).z}°
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selected && (
            <div className="mt-3">
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>Orientation · {selected.filename}</div>
              <p className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>X, Y, and Z rotation for the selected OBJ. Each file keeps its own orientation.</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(["x", "y", "z"] as const).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    className={buttonClass}
                    style={buttonStyle}
                    onClick={() => updateSelectedOrientation({ [axis]: selectedOrientation[axis] + 45 })}
                  >
                    {axis.toUpperCase()} +45°
                  </button>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  style={buttonStyle}
                  onClick={() => updateSelectedOrientation({ x: 0, y: 0, z: 0 })}
                >
                  Reset
                </button>
              </div>
              {(["x", "y", "z"] as const).map((axis) => (
                <label key={axis} className="mt-2 block text-[10px]" style={{ color: "var(--muted)" }}>
                  {axis.toUpperCase()} {selectedOrientation[axis]}°
                  <input
                    className="mt-1 w-full"
                    type="range"
                    min={0}
                    max={359}
                    value={selectedOrientation[axis]}
                    onChange={(event) => updateSelectedOrientation({ [axis]: Number(event.target.value) })}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium">OBJ repository</div>
              <button
                type="button"
                className={buttonClass}
                style={buttonStyle}
                disabled={!repository.length}
                onClick={() => {
                  setRepository([]);
                  setStatus("Cleared the OBJ repository.");
                }}
              >
                Clear repo
              </button>
            </div>
            <p className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>
              Uploaded OBJs are saved in this browser ({repository.length}/{MAX_REPO_ENTRIES}).
            </p>
            {repository.length === 0 ? (
              <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>No saved OBJ files yet.</p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
                {repository.map((entry) => (
                  <li key={entry.id} className="rounded border p-2" style={{ borderColor: "var(--line)", background: "#0b0d0e" }}>
                    <div className="text-[10px] font-medium">{entry.filename}</div>
                    <div className="text-[8px]" style={{ color: "var(--muted)" }}>
                      {entry.savedAt} · {entry.faceCount} faces · {entry.vertexCount} vertices
                    </div>
                    <div className="mt-1 flex gap-1">
                      <button type="button" className={buttonClass} style={buttonStyle} onClick={() => loadFromRepository(entry)}>
                        Load
                      </button>
                      <button type="button" className={buttonClass} style={buttonStyle} onClick={() => removeFromRepository(entry.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <div className="relative min-h-0 h-full bg-black">
          {meshes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[12px]" style={{ color: "var(--muted)" }}>
              Drop an .obj file here
            </div>
          ) : (
            <div className="absolute inset-0">
              <Part3Viewport meshes={meshes} unit={unit} upAxisMode={upAxisMode} selectedId={selected?.id ?? null} orientations={orientations} onSelect={setSelectedId} cutAxis={cutAxis} cutPosition={cutPosition} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
