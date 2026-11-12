"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import AppNav from "../AppNav";
import { analyzeMesh } from "../lattice/analyze";
import { useLatticeSource } from "../lattice/latticeSource";
import { buildCompleteFileGeometry, combinedBoundsSpec, IDENTITY_PLACEMENT, tileRootMatrix, triangleCount } from "../lattice/objFidelity";
import { LATTICE_SLOTS, slotById } from "../lattice/slots";
import type { ImportedObj, TileModel, UpAxisMode, UnitName } from "../lattice/types";
import { resolvedUp, UNIT_TO_FEET } from "../lattice/types";
import {
  ARCH_DESCRIPTORS,
  assignRelativeRanks,
  evaluateTileModel,
  publishDescriptorRanks,
  type ArchDescriptorId,
  type DescriptorResult,
  type FormDescriptorEvaluation,
} from "./objDescriptorAnalysis";

const buttonStyle = { borderColor: "var(--line)", background: "var(--panel-soft)", color: "var(--ink)" } as const;

function rankPhrase(descriptor: DescriptorResult) {
  const count = descriptor.cohortSize ?? 0;
  const rank = descriptor.comparativeRank;
  if (!rank || !count) return "Analyze the full set to place this form among the others.";
  if (rank === count) return `Strongest of the ${count} evaluated forms`;
  if (rank === 1) return `Weakest of the ${count} evaluated forms`;
  return `Rank ${rank} of ${count}. A higher rank is a stronger expression of this descriptor.`;
}

function PreviewMesh({ mesh, unit, upAxisMode }: { mesh: ImportedObj; unit: UnitName; upAxisMode: UpAxisMode }) {
  const group = useRef<import("three").Group>(null);
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), UNIT_TO_FEET[unit], upAxisMode, {
      register: true,
      applyUnitAndUp: true,
    });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, unit, upAxisMode]);

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#e8e4dc" roughness={0.72} metalness={0.02} />
      </mesh>
    </group>
  );
}

function FormPreview({ mesh, unit, upAxisMode }: { mesh: ImportedObj | null; unit: UnitName; upAxisMode: UpAxisMode }) {
  if (!mesh) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center text-[12px]" style={{ color: "var(--muted)" }}>
        This slot has no Lattice source OBJ. Assign one in Lattice, or use Load Sample OBJs for empty slots only.
      </div>
    );
  }
  return (
    <Canvas
      data-board-geometry
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [48, 36, 48], fov: 40, near: 0.1, far: 4000 }}
      style={{ width: "100%", height: "100%", minHeight: 240, background: "#0a0a0a" }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[40, 80, 30]} intensity={1.15} />
      <PreviewMesh mesh={mesh} unit={unit} upAxisMode={upAxisMode} />
      <OrbitControls makeDefault target={[0, 8, 0]} enableDamping={false} />
    </Canvas>
  );
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a), Math.abs(b));
}

function sourceStats(mesh: ImportedObj, unit: UnitName, upAxisMode: UpAxisMode) {
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  const bounds = combinedBoundsSpec(mesh, UNIT_TO_FEET[unit], up);
  return {
    vertices: mesh.positions.length / 3,
    triangles: triangleCount(mesh),
    faces: mesh.faces.length,
    bounds,
  };
}

/** Counts taken from the BufferGeometry the preview actually draws. */
function previewStats(mesh: ImportedObj, unit: UnitName, upAxisMode: UpAxisMode) {
  const geometry = buildCompleteFileGeometry(mesh);
  const position = geometry.getAttribute("position");
  const vertices = position.count;
  const triangles = geometry.getIndex() ? geometry.getIndex()!.count / 3 : 0;
  const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), UNIT_TO_FEET[unit], upAxisMode, {
    register: true,
    applyUnitAndUp: true,
  });
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size: [number, number, number] = [
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  ];
  geometry.dispose();
  return { vertices, triangles, size };
}

export default function ArchitecturalEvaluations() {
  const { hydrated, origin, meshes, assignments, unit, upAxisMode, loadSampleObjs } = useLatticeSource();
  const [models, setModels] = useState<Record<string, TileModel>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Waiting for the Lattice source registry…");
  const [selectedSlotId, setSelectedSlotId] = useState(LATTICE_SLOTS[0]?.id ?? "G1");
  const [explainId, setExplainId] = useState<ArchDescriptorId>("openVolume");
  const [results, setResults] = useState<Record<string, FormDescriptorEvaluation>>({});

  const rows = useMemo(() => LATTICE_SLOTS.map((slot) => {
    const mesh = meshes.find((item) => item.id === assignments[slot.id]) ?? null;
    const result = mesh ? results[mesh.id] : undefined;
    return { slot, mesh, result };
  }), [meshes, assignments, results]);

  const selected = rows.find((row) => row.slot.id === selectedSlotId) ?? rows[0];
  const explain = selected?.result?.descriptors.find((item) => item.id === explainId) ?? selected?.result?.descriptors[0];
  const stats = selected?.mesh ? sourceStats(selected.mesh, unit, upAxisMode) : null;
  const drawn = selected?.mesh ? previewStats(selected.mesh, unit, upAxisMode) : null;
  const assignedCount = rows.filter((row) => row.mesh).length;
  const fidelityRows = useMemo(() => rows.map((row) => {
    if (!row.mesh) return { slot: row.slot, mesh: null as ImportedObj | null, match: false };
    const source = sourceStats(row.mesh, unit, upAxisMode);
    const preview = previewStats(row.mesh, unit, upAxisMode);
    const [sx, sy, sz] = source.bounds.size;
    const [dx, dy, dz] = preview.size;
    const match = source.vertices === preview.vertices
      && source.triangles === preview.triangles
      && near(sx, dx) && near(sy, dz) && near(sz, dy);
    return { slot: row.slot, mesh: row.mesh, source, preview, match };
  }), [rows, unit, upAxisMode]);

  useEffect(() => {
    if (!hydrated) return;
    if (!assignedCount) {
      setStatus("No Lattice source OBJs are assigned. Assign forms in Lattice, or press Load Sample OBJs to fill empty slots from /part2-samples/.");
      return;
    }
    setStatus(`Using ${assignedCount} / ${LATTICE_SLOTS.length} forms from the Lattice source registry (${origin}).`);
  }, [hydrated, assignedCount, origin]);

  async function analyzeAll() {
    const targets = rows.filter((row) => row.mesh);
    if (!targets.length) {
      setStatus("Nothing to analyze. Assign Lattice sources first.");
      return;
    }
    setBusy(true);
    setStatus("Analyzing assigned Lattice source OBJs…");
    try {
      const nextModels: Record<string, TileModel> = {};
      const nextResults: Record<string, FormDescriptorEvaluation> = {};
      for (const row of targets) {
        const mesh = row.mesh!;
        const up = resolvedUp(mesh.upAxis, upAxisMode);
        const model = analyzeMesh(mesh, row.slot.id, UNIT_TO_FEET[unit], up);
        const evaluated = evaluateTileModel(model, {
          positions: mesh.positions,
          faces: mesh.faces,
          up,
          unitScale: UNIT_TO_FEET[unit],
        });
        nextModels[mesh.id] = model;
        nextResults[mesh.id] = {
          meshId: mesh.id,
          slotId: row.slot.id,
          filename: mesh.filename,
          category: row.slot.category,
          code: row.slot.code,
          name: row.slot.name,
          status: "ready",
          confidence: evaluated.confidence,
          raw: evaluated.raw,
          descriptors: evaluated.descriptors,
        };
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const ranked = Object.values(nextResults);
      assignRelativeRanks(ranked);
      publishDescriptorRanks(ranked);
      setModels(nextModels);
      setResults(nextResults);
      setStatus(`Analyzed ${targets.length} Lattice source OBJ${targets.length === 1 ? "" : "s"} · 12 descriptors each. Unassigned slots were skipped.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSamples() {
    setBusy(true);
    setStatus("Loading sample OBJs into empty Lattice slots…");
    const result = await loadSampleObjs();
    setBusy(false);
    setResults({});
    setModels({});
    setStatus(result.error ? result.error : `Loaded ${result.loaded} sample OBJ${result.loaded === 1 ? "" : "s"} into unassigned slots.`);
  }

  return (
    <div data-board-page="evaluations" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              Evaluations
            </h1>
            <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Architectural OBJ descriptors
            </span>
          </div>
          <AppNav />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !hydrated}
            onClick={() => void analyzeAll()}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
            style={{ background: "var(--accent-primary)" }}
          >
            {busy ? "Working…" : "Analyze All Forms"}
          </button>
          <button type="button" disabled={busy || !hydrated} className="rounded border px-2.5 py-1 text-[11px]" style={buttonStyle} onClick={() => void loadSamples()}>
            Load Sample OBJs
          </button>
        </div>
      </header>

      <p className="text-[12px]" style={{ color: "var(--muted)" }}>{status}</p>

      <div className="evaluations-layout grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 overflow-auto rounded border p-2" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Lattice source registry · {assignedCount}/15
          </div>
          <ul className="mt-2 space-y-1">
            {rows.map((row) => {
              const active = row.slot.id === selected?.slot.id;
              return (
                <li key={row.slot.id}>
                  <button
                    type="button"
                    className="w-full rounded border px-2 py-1.5 text-left text-[11px]"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--line)",
                      background: active ? "var(--accent-dark)" : "transparent",
                      color: "var(--ink)",
                    }}
                    onClick={() => setSelectedSlotId(row.slot.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{row.slot.code} · {row.slot.category}</span>
                      <span style={{ color: "var(--muted)" }}>
                        {row.result ? row.result.confidence : row.mesh ? "source" : "empty"}
                      </span>
                    </div>
                    <div className="truncate" data-slot-file={row.slot.id} style={{ color: "var(--muted)" }}>
                      {row.mesh ? row.mesh.filename : "Unassigned"}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="flex min-h-0 flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            {selected ? `${selected.slot.code} ${selected.slot.name}` : "No selection"}
            {selected?.mesh ? ` · ${selected.mesh.filename}` : " · no source assigned"}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded" style={{ border: "1px solid var(--line)" }}>
            <FormPreview mesh={selected?.mesh ?? null} unit={unit} upAxisMode={upAxisMode} />
          </div>
          {stats && drawn && selected?.mesh && (
            <div
              className="grid gap-2 text-[11px] sm:grid-cols-2"
              style={{ color: "var(--muted)" }}
              data-fidelity-slot={selected.slot.id}
              data-fidelity-file={selected.mesh.filename}
              data-source-vertices={stats.vertices}
              data-source-triangles={stats.triangles}
              data-source-bounds={`${stats.bounds.size[0].toFixed(2)} x ${stats.bounds.size[1].toFixed(2)} x ${stats.bounds.size[2].toFixed(2)}`}
              data-preview-vertices={drawn.vertices}
              data-preview-triangles={drawn.triangles}
              data-preview-bounds={`${drawn.size[0].toFixed(2)} x ${drawn.size[1].toFixed(2)} x ${drawn.size[2].toFixed(2)}`}
            >
              <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                <div className="uppercase tracking-wide">Lattice source OBJ</div>
                <div>{stats.vertices} vertices · {stats.triangles} triangles · {stats.faces} faces</div>
                <div>Bounds {stats.bounds.size[0].toFixed(2)} × {stats.bounds.size[1].toFixed(2)} × {stats.bounds.size[2].toFixed(2)} ft</div>
                <div>File buffer before placement</div>
              </div>
              <div className="rounded border p-2" style={{ borderColor: "var(--line)" }}>
                <div className="uppercase tracking-wide">Evaluations preview BufferGeometry</div>
                <div>{drawn.vertices} vertices · {drawn.triangles} triangles</div>
                <div>Drawn bounds {drawn.size[0].toFixed(2)} × {drawn.size[1].toFixed(2)} × {drawn.size[2].toFixed(2)} ft</div>
                <div>Unit {unit} · up {resolvedUp(selected.mesh.upAxis, upAxisMode)} · identity placement · display Y is spec Z</div>
              </div>
              <div className="sm:col-span-2 text-[11px]">
                {fidelityRows.filter((row) => row.mesh).every((row) => row.match)
                  ? `Fidelity match on ${fidelityRows.filter((row) => row.mesh).length} assigned source${fidelityRows.filter((row) => row.mesh).length === 1 ? "" : "s"}.`
                  : `Fidelity mismatch: ${fidelityRows.filter((row) => row.mesh && !row.match).map((row) => row.slot.id).join(", ") || "selected"}.`}
              </div>
            </div>
          )}
          {selected?.result?.status === "ready" && (
            <>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                Rank 15 is the strongest expression of that descriptor among the current forms. Rank 1 is the weakest. Neither rank is a grade of architectural quality.
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
                {selected.result.descriptors.map((descriptor) => (
                  <button
                    key={descriptor.id}
                    type="button"
                    className="rounded border px-2 py-1 text-left text-[11px]"
                    style={{
                      borderColor: explain?.id === descriptor.id ? "var(--accent)" : "var(--line)",
                      color: "var(--ink)",
                    }}
                    onClick={() => setExplainId(descriptor.id)}
                  >
                    <div style={{ color: "var(--muted)" }}>{descriptor.name}</div>
                    <div className="descriptor-rank text-base font-semibold">
                      {descriptor.comparativeRank ?? "—"}
                      {descriptor.cohortSize ? <span className="descriptor-rank-of"> / {descriptor.cohortSize}</span> : null}
                    </div>
                    <div className="descriptor-rank-label text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Rank</div>
                  </button>
                ))}
              </div>
              <div className="overflow-auto">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Comparative rank matrix</div>
                <table className="mt-1 w-full text-[10px]">
                  <thead>
                    <tr>
                      <th className="px-1 py-1 text-left">Form</th>
                      {ARCH_DESCRIPTORS.map((descriptor) => (
                        <th key={descriptor.id} className="px-1 py-1 text-right">{descriptor.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter((row) => row.result?.status === "ready").map((row) => (
                      <tr key={row.slot.id}>
                        <td className="px-1 py-1">{row.slot.id}</td>
                        {ARCH_DESCRIPTORS.map((descriptor) => {
                          const ranked = row.result?.descriptors.find((item) => item.id === descriptor.id);
                          return <td key={descriptor.id} className="px-1 py-1 text-right">{ranked?.comparativeRank ?? "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>

        <aside className="min-h-0 overflow-auto rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Explain Score
          </div>
          {!selected?.result || !explain ? (
            <p className="mt-3 text-[12px]" style={{ color: "var(--muted)" }}>
              {selected?.mesh ? "Press Analyze All Forms. Scoring uses a derived voxel model of this source, not the preview mesh." : "Assign a source OBJ in Lattice."}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide">{explain.name}</div>
                <div className="mt-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Comparative rank</div>
                <div className="descriptor-rank text-3xl font-semibold" style={{ color: "var(--accent)" }}>
                  {explain.comparativeRank ?? "—"} / {explain.cohortSize ?? "—"}
                </div>
                <div className="mt-1 text-[12px]">{rankPhrase(explain)}</div>
                <div className="mt-3 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Absolute geometric score</div>
                <div className="text-[18px] font-semibold">{explain.absoluteScore.toFixed(1)} / 100</div>
                <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  Confidence {selected.result.confidence}
                  {explain.relativePercentile !== undefined ? ` · percentile ${explain.relativePercentile}` : ""}
                  {" · "}{selected.slot.code} · {slotById(selected.slot.id)?.category}
                </div>
              </div>
              <ul className="space-y-2">
                {explain.components.map((component) => (
                  <li key={component.name} className="text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: "var(--muted)" }}>{component.name}</span>
                      <span className="font-medium">{component.value}</span>
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                      raw {component.raw ?? "—"} {component.rawUnit ?? ""} · weight {Math.round(component.weight * 100)}% · contribution {component.contribution ?? 0}
                    </div>
                  </li>
                ))}
              </ul>
              {selected.result.raw && models[selected.mesh?.id ?? ""] && (
                <div className="border-t pt-3 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                  <div>Analysis clone uses the same imported vertex buffer.</div>
                  <div>TileModel vertices {models[selected.mesh!.id].vertexCount} · faces {models[selected.mesh!.id].faceCount}</div>
                  <div>Occupied cells {selected.result.raw.occupiedCells} · void {selected.result.raw.voidCells}</div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
