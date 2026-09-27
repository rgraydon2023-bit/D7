"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AppNav from "./AppNav";
import type { ClipPositions } from "./CropIsoVoidView";
import type { CropEvaluation } from "./cropEvaluation";
import { useGridStore } from "./GridStore";
import type { Cell } from "./letterTypes";

const CropVolumeAxoView = dynamic(() => import("./CropVolumeAxoView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full items-center justify-center text-[11px]"
      style={{ background: "#050505", color: "var(--muted)" }}
    >
      Loading 3D view…
    </div>
  ),
});

const CropIsoVoidView = dynamic(() => import("./CropIsoVoidView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[11px]" style={{ background: "#050505", color: "var(--muted)" }}>
      Loading iso mesh…
    </div>
  ),
});

function sourceLabel(evaluation: CropEvaluation): string {
  const { source, originCol, originRow } = evaluation.crop;
  const origin = `(${originCol + 1},${originRow + 1})`;
  return source.kind === "primary" ? `Primary ${origin}` : `Permutation ${source.index + 1} ${origin}`;
}

function matchingDepthCrop(evaluation: CropEvaluation, layer: Cell[], cols: number): Cell[] {
  const { originCol, originRow } = evaluation.crop;
  const start = originRow * cols + originCol;
  const cells = [layer[start], layer[start + 1], layer[start + cols], layer[start + cols + 1]];
  return cells.every(Boolean) ? cells : evaluation.crop.cells;
}

export default function ThreeDCropsPage() {
  const {
    spacing,
    fontSize,
    cols,
    layerCells,
    yRotationEnabled,
    yRotationRange,
    cropEvaluations,
    showFailedCrops,
    regenerate,
  } = useGridStore();
  const [viewMode, setViewMode] = useState<"letters" | "iso">("letters");
  const [clipPositions, setClipPositions] = useState<ClipPositions>({ x: 0, y: 0, z: 0 });

  const visible = (showFailedCrops
    ? cropEvaluations
    : cropEvaluations.filter((evaluation) => evaluation.passes)).slice(0, 6);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 py-1" style={{ background: "var(--page-bg, #0b0f14)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              3D Crop Views
            </h1>
            <span
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              2×3
            </span>
          </div>
          <AppNav />
        </div>
        <button
          type="button"
          onClick={regenerate}
          className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Regenerate source
        </button>
        <div className="flex overflow-hidden rounded border" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={() => setViewMode("letters")}
            className="px-2.5 py-1 text-[11px]"
            style={{ background: viewMode === "letters" ? "var(--accent)" : "transparent", color: viewMode === "letters" ? "#000" : "var(--muted)" }}
          >
            Letters
          </button>
          <button
            type="button"
            onClick={() => setViewMode("iso")}
            className="border-l px-2.5 py-1 text-[11px]"
            style={{ borderColor: "var(--line)", background: viewMode === "iso" ? "var(--accent)" : "transparent", color: viewMode === "iso" ? "#000" : "var(--muted)" }}
          >
            Iso void
          </button>
        </div>
        {viewMode === "iso" && ([
          { key: "x", label: "YZ / X", color: "#f49aa6" },
          { key: "y", label: "XZ / Y", color: "#b7ea9c" },
          { key: "z", label: "XY / Z", color: "#9fc7ff" },
        ] as const).map(({ key, label, color }) => (
          <label key={key} className="flex min-w-[150px] items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
            <span className="whitespace-nowrap" style={{ color }}>{label}</span>
            <input
              type="range"
              min={-80}
              max={80}
              value={clipPositions[key]}
              onChange={(event) => setClipPositions((current) => ({ ...current, [key]: Number(event.target.value) }))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <span className="w-9 tabular-nums">{clipPositions[key]}%</span>
          </label>
        ))}
      </header>

      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        {viewMode === "letters"
          ? "Six 2×2×2 crops shown as two stacked layers of 3D letter solids. Drag within a view to orbit its letters."
          : "Each 2×2×2 crop is subtracted from a bounding solid to create a shaded, depth-buffered iso mesh."}
      </p>

      {visible.length === 0 ? (
        <p
          className="rounded-lg border px-3 py-8 text-center text-[12px]"
          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        >
          No crops are available. Adjust the crop criteria or enable failed crops on the Crops tab.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((evaluation) => (
            <article
              key={evaluation.crop.id}
              className="flex min-h-[240px] flex-col overflow-hidden rounded-xl border"
              style={{
                borderColor: evaluation.passes ? "rgba(61, 214, 219, 0.4)" : "var(--line)",
                background: "#050505",
              }}
              title={sourceLabel(evaluation)}
            >
              <div className="min-h-0 flex-1">
                {viewMode === "letters" ? (
                  <CropVolumeAxoView
                    evaluation={evaluation}
                    depthCells={matchingDepthCrop(evaluation, layerCells[0] ?? [], cols)}
                    spacing={spacing}
                    fontSize={fontSize}
                    clipPositions={clipPositions}
                    yRotationEnabled={yRotationEnabled}
                    yRotationRange={yRotationRange}
                  />
                ) : (
                  <CropIsoVoidView
                    evaluation={evaluation}
                    depthCells={matchingDepthCrop(evaluation, layerCells[0] ?? [], cols)}
                    spacing={spacing}
                    fontSize={fontSize}
                    clipPositions={clipPositions}
                    yRotationEnabled={yRotationEnabled}
                    yRotationRange={yRotationRange}
                  />
                )}
              </div>
              <footer
                className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px]"
                style={{ borderColor: "var(--line)", color: "var(--muted)" }}
              >
                <span>{sourceLabel(evaluation)}</span>
                <span style={{ color: evaluation.passes ? "var(--accent)" : "var(--muted)" }}>
                  {viewMode === "iso" ? "bounded void" : `${Math.round(evaluation.scores.total * 100)}%`}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
