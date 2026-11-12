"use client";
import { FeetScaleNote } from "./FeetScaleNote";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import AppNav from "./AppNav";
import type { CropEvaluation } from "./cropEvaluation";
import { exportVoidsGridObj } from "./exportVoidsGrid";
import { useGridStore } from "./GridStore";

const VoidsAxoGrid = dynamic(() => import("./VoidsAxoGrid"), {
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

export default function VoidsPage() {
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
      await exportVoidsGridObj(visible, spacing, fontSize);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [visible, spacing, fontSize, exporting]);

  return (
    <div data-board-page="voids" className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1
              className="text-lg font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              3D Voids
            </h1>
            <span
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
            >
              Negative · 8×2
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
        Plate with V / U / L footprints cut out (void), axonometric 8×2 grid.
        Drag to orbit · scroll to zoom.
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
          No crops to invert. Adjust criteria on the Crops page or enable failed.
        </p>
      ) : (
        <>
          <section
            className="overflow-hidden rounded-xl border"
            style={{
              borderColor: "var(--line)",
              background: "var(--input-background)",
              height: "min(56vh, 560px)",
              minHeight: 420,
            }}
          >
            <VoidsAxoGrid
              evaluations={visible}
              spacing={spacing}
              fontSize={fontSize}
            />
          </section>

          <div className="grid grid-cols-8 gap-1.5">
            {visible.map((ev, i) => (
              <div
                key={ev.crop.id}
                className="rounded border px-1.5 py-1 text-center"
                style={{ borderColor: "var(--line)", background: "var(--panel)" }}
              >
                <div
                  className="truncate text-[10px] tabular-nums"
                  style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
                >
                  {i + 1}. {sourceLabel(ev)}
                </div>
                <div
                  className="text-[9px] uppercase"
                  style={{ color: ev.passes ? "var(--accent)" : "var(--muted)" }}
                >
                  {pct(ev.scores.total)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
