"use client";

import ScaledGridPreview from "./ScaledGridPreview";
import type { CropEvaluation } from "./cropEvaluation";
import type { LetterAssets } from "./letterTypes";

type Props = {
  evaluations: CropEvaluation[];
  spacing: number;
  fontSize: number;
  assets: LetterAssets;
  useAssets: boolean;
  showGuides: boolean;
  showFailed: boolean;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}

function sourceLabel(ev: CropEvaluation): string {
  const { source, originCol, originRow } = ev.crop;
  const pos = `(${originCol},${originRow})`;
  if (source.kind === "primary") return `P ${pos}`;
  return `Π${source.index + 1} ${pos}`;
}

export default function CropEvalGrid({
  evaluations,
  spacing,
  fontSize,
  assets,
  useAssets,
  showGuides,
  showFailed,
}: Props) {
  const filtered = showFailed ? evaluations : evaluations.filter((e) => e.passes);
  // Fixed presentation layout: 8 columns × 2 rows (16 slots).
  const visible = filtered.slice(0, 16);
  const passCount = evaluations.filter((e) => e.passes).length;
  const fromPerms = evaluations.filter((e) => e.crop.source.kind === "permutation").length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p
          className="text-[10px] tracking-[0.16em] uppercase"
          style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          2×2 crops · primary + permutations · 8×2
        </p>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          {passCount}/{evaluations.length} pass · {fromPerms} from Π
          {filtered.length > 16 ? ` · top ${visible.length}` : ` · ${visible.length} shown`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p
          className="rounded-lg border px-3 py-6 text-center text-[12px]"
          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        >
          No crops meet the criteria. Lower thresholds or enable “Show failed”.
        </p>
      ) : (
        <div className="grid grid-cols-8 grid-rows-2 gap-2">
          {visible.map((ev) => (
            <article
              key={ev.crop.id}
              className="flex flex-col overflow-hidden rounded-lg border"
              style={{
                borderColor: ev.passes ? "rgba(61, 214, 219, 0.35)" : "var(--line)",
                background: "var(--input-background)",
              }}
              title={`${sourceLabel(ev)} · ${ev.reasons.join(" · ")}`}
            >
              <div className="relative aspect-square w-full p-1.5">
                <ScaledGridPreview
                  cells={ev.crop.cells}
                  cols={2}
                  rows={2}
                  spacing={spacing}
                  fontSize={fontSize}
                  assets={assets}
                  useAssets={useAssets}
                  showGuides={showGuides}
                />
              </div>
              <div
                className="flex flex-col gap-0.5 border-t px-1.5 py-1.5"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="truncate text-[10px] tabular-nums"
                    style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {sourceLabel(ev)}
                  </span>
                  <span
                    className="shrink-0 rounded px-1 text-[9px] font-medium uppercase tracking-wide"
                    style={{
                      background: ev.passes ? "rgba(61, 214, 219, 0.18)" : "rgba(255,255,255,0.06)",
                      color: ev.passes ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    {ev.passes ? "pass" : "fail"} · {pct(ev.scores.total)}
                  </span>
                </div>
                <div
                  className="grid grid-cols-4 gap-0.5 text-[9px] tabular-nums"
                  style={{ color: "var(--muted)" }}
                >
                  <span title="Diversity">D {pct(ev.scores.diversity)}</span>
                  <span title="Contrast">C {pct(ev.scores.contrast)}</span>
                  <span title="Overlap">O {pct(ev.scores.overlap)}</span>
                  <span title="Tension">T {pct(ev.scores.tension)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
