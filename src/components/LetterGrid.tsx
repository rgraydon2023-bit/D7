"use client";
import { feet } from "./feetUnits";
import { FeetScaleNote } from "./FeetScaleNote";

import dynamic from "next/dynamic";
import { useState } from "react";
import AppNav from "./AppNav";
import { GRADIENT_OPTIONS, useGridStore } from "./GridStore";
import { LETTERS } from "./letterTypes";
import { ROTATION_STEP, type GradientDirection, type GradientMode } from "./rotationGradient";
import ScaledGridPreview from "./ScaledGridPreview";
import { diagonalCenterGap, DIAGONAL_GAP_MAXIMUM, DIAGONAL_GAP_MINIMUM, UNIT_LETTER_SPAN, xyContactGap, zContactGap, Z_GAP_MINIMUM } from "./letterVolumeLayout";
import type { VolumeExportFormat, VolumeExportTarget } from "./exportLetterVolume";

const LetterGrid3D = dynamic(() => import("./LetterGrid3D"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full min-h-[120px] items-center justify-center text-sm"
      style={{ background: "#000000", color: "var(--muted)" }}
    >
      Loading 3D view…
    </div>
  ),
});

const SectionPlaneStudio = dynamic(() => import("./SectionPlaneStudio"), {
  ssr: false,
  loading: () => <div className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>Loading section workspace…</div>,
});

const selectStyle = {
  borderColor: "var(--line)",
  background: "var(--panel-soft)",
} as const;

export default function LetterGrid() {
  const [exportingVolume, setExportingVolume] = useState(false);
  const [volumeExportFormat, setVolumeExportFormat] = useState<VolumeExportFormat>("mesh");
  const [volumeTarget, setVolumeTarget] = useState<VolumeExportTarget>("letters");
  const [volumeExportError, setVolumeExportError] = useState<string | null>(null);
  const [savedVolumePath, setSavedVolumePath] = useState<string | null>(null);
  const store = useGridStore();
  const {
    cols,
    rows,
    spacing,
    fontSize,
    setSpacing,
    setFontSize,
    gradientDirection,
    setGradientDirection,
    gradientMode,
    setGradientMode,
    lessDegrees,
    setLessDegrees,
    moreDegrees,
    setMoreDegrees,
    cells,
    layerCells,
    layerMode,
    setLayerMode,
    zLayers,
    setZLayers,
    zSpacing,
    setZSpacing,
    attractorGap,
    setAttractorGap,
    letterThickness,
    setLetterThickness,
    yRotationEnabled,
    setYRotationEnabled,
    yRotationRange,
    setYRotationRange,
    permutations,
    showGuides,
    setShowGuides,
    assets,
    useAssets,
    setUseAssets,
    uploadError,
    fileInputs,
    hasAnyAsset,
    show3D,
    gradientPreview,
    setAssetForLetter,
    clearAllAssets,
    onFileChosen,
    regenerate,
    randomizeLetters,
    applyRotationGradient,
    resizeGrid,
    appliedComposition,
    setAppliedComposition,
  } = store;

  const exportVolume = async (target: VolumeExportTarget, format: VolumeExportFormat) => {
    setExportingVolume(true);
    setVolumeTarget(target);
    setVolumeExportError(null);
    setSavedVolumePath(null);
    try {
      const response = await fetch("/api/export-volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, target, compositionPlacements: appliedComposition?.placements, compositionBounds: appliedComposition ? { width: appliedComposition.width, height: appliedComposition.height, depth: appliedComposition.depth } : undefined, options: {
          cells,
          layerCells: layerCells.slice(0, zLayers - 1),
          cols,
          rows,
          spacing,
          zSpacing,
          attractorGap: attractorGap ?? undefined,
          letterSize: fontSize,
          thickness: letterThickness,
          yRotationEnabled,
          yRotationRange,
        } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Volume export failed");
      setSavedVolumePath(result.path);
    } catch (error) {
      setVolumeExportError(error instanceof Error ? error.message : "Volume export failed");
    } finally {
      setExportingVolume(false);
    }
  };

  return (
    <div data-board-page="slide" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              Letter Grid
            </h1>
            <span
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              3:1
            </span>
          </div>
          <AppNav />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={regenerate}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
            style={{ background: "var(--accent-primary)" }}
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={randomizeLetters}
            className="rounded border px-2.5 py-1 text-[11px] hover:bg-white/5"
            style={{ borderColor: "var(--line)" }}
          >
            Shuffle
          </button>
          <button
            type="button"
            onClick={applyRotationGradient}
            className="rounded border px-2.5 py-1 text-[11px] hover:bg-white/5"
            style={{ borderColor: "var(--line)" }}
          >
            Rotate
          </button>
          <button
            type="button"
            onClick={() => setShowGuides((v) => !v)}
            className="rounded border px-2.5 py-1 text-[11px] hover:bg-white/5"
            style={{ borderColor: "var(--line)" }}
          >
            {showGuides ? "Circles" : "No circles"}
          </button>
        </div>
      </header><FeetScaleNote/>

      {layerMode && useAssets && hasAnyAsset && (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Turn off Assets to export the built-in V/U/L volume.
        </p>
      )}
      {volumeExportError && (
        <p className="text-[11px]" style={{ color: "var(--danger-text)" }}>
          Export failed: {volumeExportError}
        </p>
      )}
      {savedVolumePath && (
        <p className="break-all text-[11px]" style={{ color: "var(--accent)" }}>
          Saved for Rhino: {savedVolumePath}
        </p>
      )}
      {appliedComposition && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--accent-secondary)", background: "var(--panel-background)" }}>
          <p className="text-[11px]" style={{ color: "var(--accent-pale)" }}>
            Composition seed {appliedComposition.seed}, alternative {appliedComposition.alternativeIndex + 1}, is active. The Slide preview and letter/void exports use these transformed placements{appliedComposition.sourceCenter ? `, extracted from overall coordinates (${appliedComposition.sourceCenter.x.toFixed(1)}, ${appliedComposition.sourceCenter.y.toFixed(1)}, ${appliedComposition.sourceCenter.z.toFixed(1)})` : ""}.
          </p>
          <button type="button" onClick={() => setAppliedComposition(null)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--accent-intermediate)" }}>
            Use original grid
          </button>
        </div>
      )}

      <section
        className="flex flex-col gap-2 rounded-lg border px-2.5 py-2"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {LETTERS.map((letter) => {
            const asset = assets[letter];
            return (
              <label
                key={letter}
                className="flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] hover:bg-white/5"
                style={{ borderColor: "var(--line)", background: "var(--panel-soft)" }}
                title={asset?.name ?? `Upload ${letter}`}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center overflow-hidden rounded border text-[10px] font-medium"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--preview-bg)",
                    fontFamily: "var(--font-mono)",
                    color: asset ? "var(--accent)" : "var(--ink)",
                  }}
                >
                  {asset?.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={letter} className="h-full w-full object-contain" />
                  ) : asset?.kind === "model" ? (
                    "3D"
                  ) : (
                    letter
                  )}
                </span>
                <span style={{ color: "var(--muted)" }}>{letter}</span>
                <input
                  ref={(el) => {
                    fileInputs.current[letter] = el;
                  }}
                  type="file"
                  accept="image/*,.glb,.gltf,.obj,model/gltf-binary,model/gltf+json"
                  className="sr-only"
                  onChange={(e) => onFileChosen(letter, e.target.files?.[0] ?? null)}
                />
                {asset && (
                  <button
                    type="button"
                    className="text-[10px] leading-none hover:underline"
                    style={{ color: "var(--muted)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAssetForLetter(letter, null);
                    }}
                  >
                    ×
                  </button>
                )}
              </label>
            );
          })}
          <label className="ml-1 flex cursor-pointer items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={useAssets}
              onChange={(e) => setUseAssets(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Assets
          </label>
          {hasAnyAsset && (
            <button
              type="button"
              onClick={clearAllAssets}
              className="text-[11px] hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Clear
            </button>
          )}
          <span className="mx-1 hidden h-3 w-px bg-[var(--line)] sm:block" />
          <label className="flex min-w-[100px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }}>Cols</span>
            <input
              type="range"
              min={2}
              max={16}
              value={cols}
              onChange={(e) => resizeGrid(Number(e.target.value), rows)}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-4 tabular-nums">{cols}</span>
          </label>
          <label className="flex min-w-[100px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }}>Rows</span>
            <input
              type="range"
              min={2}
              max={12}
              value={rows}
              onChange={(e) => resizeGrid(cols, Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-4 tabular-nums">{rows}</span>
          </label>
          <label className="flex min-w-[100px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }} title={`Neighbors overlap at ${feet(xyContactGap(fontSize)/50)} and below`}>Gap</span>
            <input
              type="range"
              min={8}
              max={120}
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="min-w-14 tabular-nums">{feet(spacing/50)}</span>
          </label>
          <label className="flex min-w-[100px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }}>Size</span>
            <input
              type="range"
              min={16}
              max={96}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="min-w-14 tabular-nums">{feet(fontSize*.92/50)}</span>
          </label>
        </div>

        {uploadError && (
          <p className="rounded px-2 py-1 text-[11px]" style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}>
            {uploadError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: "var(--line)" }}>
          <div className="h-1 w-8 shrink-0 rounded-full" style={{ background: gradientPreview }} />
          <select
            value={gradientDirection}
            onChange={(e) => setGradientDirection(e.target.value as GradientDirection)}
            className="rounded border px-1.5 py-0.5 text-[11px]"
            style={selectStyle}
          >
            {GRADIENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={gradientMode}
            onChange={(e) => setGradientMode(e.target.value as GradientMode)}
            className="rounded border px-1.5 py-0.5 text-[11px]"
            style={selectStyle}
          >
            <option value="random">Random</option>
            <option value="exact">Exact</option>
          </select>
          <label className="flex min-w-[110px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }}>Less</span>
            <input
              type="range"
              min={0}
              max={345}
              step={ROTATION_STEP}
              value={lessDegrees}
              onChange={(e) => setLessDegrees(Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-7 tabular-nums">{lessDegrees}°</span>
          </label>
          <label className="flex min-w-[110px] flex-1 items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--muted)" }}>More</span>
            <input
              type="range"
              min={0}
              max={345}
              step={ROTATION_STEP}
              value={moreDegrees}
              onChange={(e) => setMoreDegrees(Number(e.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-7 tabular-nums">{moreDegrees}°</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={layerMode}
              onChange={(e) => setLayerMode(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            3D layers
          </label>
          {layerMode && (
            <>
              <label className="flex min-w-[150px] flex-1 items-center gap-1.5 text-[11px]">
                <span style={{ color: "var(--muted)" }}>Z layers</span>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={zLayers}
                  onChange={(e) => setZLayers(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="w-4 tabular-nums">{zLayers}</span>
              </label>
              <label className="flex min-w-[170px] flex-1 items-center gap-1.5 text-[11px]">
                <span style={{ color: "var(--muted)" }} title={`Layers overlap at ${feet(zContactGap(fontSize, letterThickness)/50)} and below`}>Z gap</span>
                <input
                  type="range"
                  min={Z_GAP_MINIMUM}
                  max={120}
                  step={2}
                  value={zSpacing}
                  onChange={(e) => setZSpacing(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="min-w-14 tabular-nums">{feet(zSpacing/50)}</span>
              </label>
              <label className="flex min-w-[190px] flex-1 items-center gap-1.5 text-[11px]" title="Distance from the center of each dashed box to its letters, along the 45° diagonal. Lower pulls the group into the center. Higher spreads it apart.">
                <span style={{ color: "var(--muted)" }}>45° gap</span>
                <input
                  type="range"
                  min={DIAGONAL_GAP_MINIMUM}
                  max={DIAGONAL_GAP_MAXIMUM}
                  value={attractorGap ?? Math.round(diagonalCenterGap(spacing, Math.max(fontSize, 0.1) / 50 * UNIT_LETTER_SPAN))}
                  onChange={(e) => setAttractorGap(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="min-w-14 tabular-nums">{feet((attractorGap ?? Math.round(diagonalCenterGap(spacing, Math.max(fontSize, 0.1) / 50 * UNIT_LETTER_SPAN)))/50)}</span>
              </label>
              <label className="flex min-w-[170px] flex-1 items-center gap-1.5 text-[11px]" title="Extrusion depth of built-in V, U, and L letters along Z. Any positive thickness is allowed.">
                <span style={{ color: "var(--muted)" }}>Thickness</span>
                <input
                  type="number"
                  min={0.01}
                  step={1}
                  value={letterThickness}
                  onChange={(e) => { const next = e.target.valueAsNumber; if (Number.isFinite(next) && next > 0) setLetterThickness(next); }}
                  className="w-16 rounded border px-1 py-0.5 text-right tabular-nums"
                  style={{ borderColor: "var(--line)", background: "var(--input-background)" }}
                />
                <span className="tabular-nums">%</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={yRotationEnabled}
                  onChange={(e) => setYRotationEnabled(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Y rotation
              </label>
              {yRotationEnabled && (
                <label className="flex min-w-[170px] flex-1 items-center gap-1.5 text-[11px]" title="Each letter gets a stable random Y angle within this range">
                  <span style={{ color: "var(--muted)" }}>Y range</span>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    step={15}
                    value={yRotationRange}
                    onChange={(e) => setYRotationRange(Number(e.target.value))}
                    className="min-w-0 flex-1 accent-[var(--accent)]"
                  />
                  <span className="w-9 tabular-nums">±{yRotationRange}°</span>
                </label>
              )}
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {cols} × {rows} × {zLayers} letters · drag to orbit
              </span>
              <span className="h-5 w-px bg-[var(--line)]" />
              <span className="text-[11px] font-medium">Export this Slide:</span>
              <select
                aria-label="Letter export format"
                value={volumeExportFormat}
                onChange={(e) => setVolumeExportFormat(e.target.value as VolumeExportFormat)}
                className="rounded border px-1.5 py-1 text-[11px]"
                style={selectStyle}
              >
                <option value="mesh">OBJ mesh</option>
                <option value="polysurface">3DM polysurface</option>
              </select>
              <button
                type="button"
                disabled={exportingVolume || (useAssets && hasAnyAsset)}
                onClick={() => exportVolume("letters", volumeExportFormat)}
                className="rounded border px-2.5 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                title="Export the letters exactly as arranged in this Slide"
              >
                {exportingVolume && volumeTarget === "letters" ? "Exporting letters…" : "Export letters"}
              </button>
              <button
                type="button"
                disabled={exportingVolume || (useAssets && hasAnyAsset)}
                onClick={() => exportVolume("void", "mesh")}
                className="rounded border px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--accent)", background: "var(--accent-primary)", color: "var(--app-background)" }}
                title="Export the void between these exact letters, bounded by their box"
              >
                {exportingVolume && volumeTarget === "void" ? "Exporting void…" : "Export void between letters (OBJ)"}
              </button>
            </>
          )}
        </div>
      </section>

      <section
        className="relative w-full overflow-hidden rounded-xl border"
        style={{
          aspectRatio: layerMode ? "2 / 1" : "3 / 1",
          background: "#000000",
          borderColor: "var(--line)",
          minHeight: layerMode ? 420 : 280,
        }}
      >
        <div className={`grid h-full w-full ${layerMode ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"}`}>
          <div
            className={`relative flex h-full min-h-0 flex-col p-2 md:p-3 ${layerMode ? "" : "border-r"}`}
            style={{ borderColor: "var(--line)" }}
          >
            <p
              className="mb-1 shrink-0 text-[10px] tracking-[0.16em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              {layerMode ? `Letter volume · ${cols} × ${rows} × ${zLayers}` : "Primary"}
            </p>
            <div className="min-h-0 flex-1">
              {show3D ? (
                <LetterGrid3D
                  cells={cells}
                  layerCells={layerMode ? layerCells.slice(0, zLayers - 1) : []}
                  zSpacing={zSpacing}
                  letterThickness={letterThickness}
                  yRotationEnabled={yRotationEnabled}
                  yRotationRange={yRotationRange}
                  layerMode={layerMode}
                  cols={cols}
                  rows={rows}
                  spacing={spacing}
                  attractorGap={attractorGap ?? undefined}
                  letterSize={fontSize}
                  assets={assets}
                  useAssets={useAssets}
                  showGuides={showGuides}
                  volumeTarget="letters"
                  compositionPlacements={appliedComposition?.placements}
                  compositionBounds={appliedComposition ? { width: appliedComposition.width, height: appliedComposition.height, depth: appliedComposition.depth } : undefined}
                />
              ) : (
                <ScaledGridPreview
                  cells={cells}
                  cols={cols}
                  rows={rows}
                  spacing={spacing}
                  fontSize={fontSize}
                  assets={assets}
                  useAssets={useAssets}
                  showGuides={showGuides}
                />
              )}
            </div>
          </div>

          {!layerMode && <div className="relative flex h-full min-h-0 flex-col p-2 md:p-3">
            <p
              className="mb-1 shrink-0 text-[10px] tracking-[0.16em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Permutations · 4×4
            </p>
            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-4 gap-1 md:gap-1.5">
              {permutations.map((perm, index) => (
                <div
                  key={perm.id}
                  className="relative min-h-0 min-w-0 overflow-hidden rounded border"
                  style={{ borderColor: "var(--line)", background: "#050505" }}
                  title={`Permutation ${index + 1}`}
                >
                  <ScaledGridPreview
                    cells={perm.cells}
                    cols={cols}
                    rows={rows}
                    spacing={spacing}
                    fontSize={fontSize}
                    assets={assets}
                    useAssets={useAssets}
                    showGuides={showGuides}
                  />
                </div>
              ))}
            </div>
          </div>}
        </div>
      </section>

      {layerMode && !(useAssets && hasAnyAsset) && (
        <SectionPlaneStudio
          cells={cells}
          layerCells={layerCells.slice(0, zLayers - 1)}
          cols={cols}
          rows={rows}
          spacing={spacing}
          zSpacing={zSpacing}
          attractorGap={attractorGap ?? undefined}
          letterSize={fontSize}
          thickness={letterThickness}
          yRotationEnabled={yRotationEnabled}
          yRotationRange={yRotationRange}
          compositionPlacements={appliedComposition?.placements}
          compositionBounds={appliedComposition ? { width: appliedComposition.width, height: appliedComposition.height, depth: appliedComposition.depth } : undefined}
        />
      )}
    </div>
  );
}
