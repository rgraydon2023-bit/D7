"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AppNav from "./AppNav";
import type { CropEvaluation } from "./cropEvaluation";
import { useGridStore } from "./GridStore";
import type { Cell } from "./letterTypes";
import ScaledGridPreview from "./ScaledGridPreview";

const CropAxoView = dynamic(() => import("./CropAxoView"), { ssr: false, loading: LoadingView });
const CropVolumeAxoView = dynamic(() => import("./CropVolumeAxoView"), { ssr: false, loading: LoadingView });
const CropVoidAxoView = dynamic(() => import("./CropVoidAxoView"), { ssr: false, loading: LoadingView });

function LoadingView() {
  return (
    <div className="flex h-full items-center justify-center text-[11px]" style={{ color: "var(--muted)" }}>
      Loading view…
    </div>
  );
}

function depthCrop(evaluation: CropEvaluation, layer: Cell[], cols: number): Cell[] {
  const { originCol, originRow } = evaluation.crop;
  const start = originRow * cols + originCol;
  const cells = [layer[start], layer[start + 1], layer[start + cols], layer[start + cols + 1]];
  return cells.every(Boolean) ? cells : evaluation.crop.cells;
}

type CropPicker = {
  options: CropEvaluation[];
  value: string;
  onChange: (id: string) => void;
};

function cropLabel(evaluation: CropEvaluation): string {
  const { source, originCol, originRow } = evaluation.crop;
  const sourceName = source.kind === "primary" ? "Primary" : `Π${source.index + 1}`;
  return `${sourceName} (${originCol + 1}, ${originRow + 1})`;
}

function Viewport({ title, detail, children, cropPicker }: { title: string; detail: string; children: React.ReactNode; cropPicker?: CropPicker }) {
  return (
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "#050505" }}>
      <header className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-[12px] font-medium">{title}</h2>
        <div className="flex items-center gap-2">
          {cropPicker && (
            <select
              aria-label={`${title} crop`}
              value={cropPicker.value}
              onChange={(event) => cropPicker.onChange(event.target.value)}
              className="max-w-[150px] rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: "var(--line)", background: "var(--panel-soft)", color: "var(--ink)" }}
            >
              {cropPicker.options.map((option) => <option key={option.crop.id} value={option.crop.id}>{cropLabel(option)}</option>)}
            </select>
          )}
          <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            {detail}
          </span>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export default function CompareViewsPage() {
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const {
    cells,
    cols,
    rows,
    spacing,
    fontSize,
    assets,
    useAssets,
    showGuides,
    layerCells,
    cropEvaluations,
    showFailedCrops,
    regenerate,
  } = useGridStore();

  const cropOptions = (showFailedCrops
    ? cropEvaluations
    : cropEvaluations.filter((item) => item.passes));
  const evaluation = cropOptions.find((item) => item.crop.id === selectedCropId) ?? cropOptions[0];
  const cropPicker = evaluation ? { options: cropOptions, value: evaluation.crop.id, onChange: setSelectedCropId } : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 py-1" style={{ background: "var(--page-bg, #0b0f14)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>
              Compare Views
            </h1>
            <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Current data
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
      </header>

      {!evaluation ? (
        <p className="rounded-lg border px-3 py-8 text-center text-[12px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          No crop is available to compare. Adjust crop criteria or enable failed crops on the Crops tab.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Viewport title="2D Grid" detail={`${cols}×${rows}`}>
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
          </Viewport>
          <Viewport title="2D Crop" detail="2×2" cropPicker={cropPicker}>
            <ScaledGridPreview
              cells={evaluation.crop.cells}
              cols={2}
              rows={2}
              spacing={spacing}
              fontSize={fontSize}
              assets={assets}
              useAssets={useAssets}
              showGuides={showGuides}
            />
          </Viewport>
          <Viewport title="3D Crop" detail="2×2" cropPicker={cropPicker}>
            <CropAxoView evaluation={evaluation} spacing={spacing} fontSize={fontSize} />
          </Viewport>
          <Viewport title="3D Crop Volume" detail="2×2×2" cropPicker={cropPicker}>
            <CropVolumeAxoView
              evaluation={evaluation}
              depthCells={depthCrop(evaluation, layerCells[0] ?? [], cols)}
              spacing={spacing}
              fontSize={fontSize}
            />
          </Viewport>
          <Viewport title="3D Void" detail="2×2" cropPicker={cropPicker}>
            <CropVoidAxoView evaluation={evaluation} spacing={spacing} fontSize={fontSize} />
          </Viewport>
        </div>
      )}
    </div>
  );
}
