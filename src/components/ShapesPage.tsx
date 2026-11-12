"use client";
import { FeetScaleNote } from "./FeetScaleNote";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AppNav from "./AppNav";
import type { CropEvaluation } from "./cropEvaluation";
import { exportCropsGridObj } from "./exportCropsGrid";
import { useGridStore } from "./GridStore";

const CropAxoView = dynamic(() => import("./CropAxoView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full items-center justify-center text-[10px]"
      style={{ background: "var(--input-background)", color: "var(--muted)" }}
    >
      …
    </div>
  ),
});

function sourceLabel(ev: CropEvaluation): string {
  const { source, originCol, originRow } = ev.crop;
  const pos = `(${originCol},${originRow})`;
  if (source.kind === "primary") return `P ${pos}`;
  return `Π${source.index + 1} ${pos}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}

export default function ShapesPage() {
  const {
    spacing,
    fontSize,
    cropEvaluations,
    showFailedCrops,
    regenerate,
  } = useGridStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filtered = showFailedCrops
    ? cropEvaluations
    : cropEvaluations.filter((e) => e.passes);
  const visible = filtered.slice(0, 16);

  const onExport = useCallback(async () => {
    if (visible.length === 0 || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportCropsGridObj(visible, spacing, fontSize);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [visible, spacing, fontSize, exporting]);

  return (
    <div data-board-page="shapes" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1
              className="text-lg font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              3D Shapes
            </h1>
            <span
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Axo · 8×2
            </span>
          </div>
          <AppNav />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onExport}
            disabled={visible.length === 0 || exporting}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--accent-primary)" }}
          >
            {exporting ? "Exporting…" : "Export all OBJ"}
          </button>
          <button
            type="button"
            onClick={regenerate}
            className="rounded border px-2.5 py-1 text-[11px] hover:bg-white/5"
            style={{ borderColor: "var(--line)" }}
          >
            Regenerate source
          </button>
        </div>
      </header><FeetScaleNote/>

      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        Top crops extruded to 3D letter solids. Press{" "}
        <span style={{ color: "var(--ink)" }}>Export all OBJ</span> once to
        download every crop as one 8×2 grid of 3D objects.
      </p>

      {exportError && (
        <p
          className="rounded px-2 py-1 text-[11px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}
        >
          {exportError}
        </p>
      )}

      {visible.length === 0 ? (
        <p
          className="rounded-lg border px-3 py-8 text-center text-[12px]"
          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        >
          No crops to translate. Adjust criteria on the Crops page or enable failed.
        </p>
      ) : (
        <div className="grid grid-cols-8 grid-rows-2 gap-2">
          {visible.map((ev) => (
            <article
              key={ev.crop.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-lg border"
              style={{
                borderColor: ev.passes
                  ? "rgba(61, 214, 219, 0.35)"
                  : "var(--line)",
                background: "var(--input-background)",
                aspectRatio: "1 / 1.05",
              }}
              title={sourceLabel(ev)}
            >
              <div className="min-h-0 flex-1">
                <CropAxoView
                  evaluation={ev}
                  spacing={spacing}
                  fontSize={fontSize}
                />
              </div>
              <div
                className="flex items-center justify-between gap-1 border-t px-1.5 py-1"
                style={{ borderColor: "var(--line)" }}
              >
                <span
                  className="truncate text-[10px] tabular-nums"
                  style={{
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {sourceLabel(ev)}
                </span>
                <span
                  className="shrink-0 text-[9px] uppercase"
                  style={{
                    color: ev.passes ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {pct(ev.scores.total)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
