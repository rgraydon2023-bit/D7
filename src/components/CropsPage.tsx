"use client";
import { FeetScaleNote } from "./FeetScaleNote";

import AppNav from "./AppNav";
import CropEvalGrid from "./CropEvalGrid";
import { useGridStore } from "./GridStore";

const selectStyle = {
  borderColor: "var(--line)",
  background: "var(--panel-soft)",
} as const;

export default function CropsPage({ evaluationsOnly = false }: { evaluationsOnly?: boolean }) {
  const {
    spacing,
    fontSize,
    showGuides,
    assets,
    useAssets,
    cropCriteria,
    setCropCriteria,
    showFailedCrops,
    setShowFailedCrops,
    cropEvaluations,
    regenerate,
  } = useGridStore();

  return (
    <div data-board-page="crops" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              {evaluationsOnly ? "Crop Evaluations" : "2×2 Crops"}
            </h1>
            <span
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              {evaluationsOnly ? "Permutation PASS" : "Evaluate"}
            </span>
          </div>
          <AppNav />
        </div>
        <button
          type="button"
          onClick={regenerate}
          className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
          style={{ background: "var(--accent-primary)" }}
        >
          Regenerate source
        </button>
      </header><FeetScaleNote/>

      <section
        className="flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-2"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>
          Criteria
        </span>
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
          Unique ≥
          <select
            value={cropCriteria.minUniqueLetters}
            onChange={(e) =>
              setCropCriteria((c) => ({
                ...c,
                minUniqueLetters: Number(e.target.value),
              }))
            }
            className="rounded border px-1 py-0.5 text-[11px]"
            style={selectStyle}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
          Span ≥
          <select
            value={cropCriteria.minRotationSpan}
            onChange={(e) =>
              setCropCriteria((c) => ({
                ...c,
                minRotationSpan: Number(e.target.value),
              }))
            }
            className="rounded border px-1 py-0.5 text-[11px]"
            style={selectStyle}
          >
            <option value={0}>0°</option>
            <option value={30}>30°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
            <option value={135}>135°</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
          Edges ≥
          <select
            value={cropCriteria.minLetterChanges}
            onChange={(e) =>
              setCropCriteria((c) => ({
                ...c,
                minLetterChanges: Number(e.target.value),
              }))
            }
            className="rounded border px-1 py-0.5 text-[11px]"
            style={selectStyle}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={cropCriteria.requireOverlap}
            onChange={(e) =>
              setCropCriteria((c) => ({
                ...c,
                requireOverlap: e.target.checked,
              }))
            }
            className="accent-[var(--accent)]"
          />
          Overlap
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={showFailedCrops}
            onChange={(e) => setShowFailedCrops(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Show failed
        </label>
      </section>

      <CropEvalGrid
        evaluations={cropEvaluations}
        spacing={spacing}
        fontSize={fontSize}
        assets={assets}
        useAssets={useAssets}
        showGuides={showGuides}
        showFailed={showFailedCrops}
      />
    </div>
  );
}
