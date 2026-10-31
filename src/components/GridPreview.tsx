"use client";

import { letterPlanLayout } from "./letterVolumeLayout";
import type { Cell, LetterAssets } from "./letterTypes";

type GridPreviewProps = {
  cells: Cell[];
  cols: number;
  rows: number;
  spacing: number;
  fontSize: number;
  assets: LetterAssets;
  useAssets: boolean;
  showGuides: boolean;
  className?: string;
};

export default function GridPreview({
  cells,
  cols,
  rows,
  spacing,
  fontSize,
  assets,
  useAssets,
  showGuides,
  className = "",
}: GridPreviewProps) {
  const { pitch, width, height } = letterPlanLayout(cols, rows, spacing, fontSize);
  return (
    <div
      data-board-geometry
      className={`mx-auto w-fit ${className}`}
      style={{
        display: "grid",
        width, height,
        gridTemplateColumns: `repeat(${cols}, ${pitch}px)`,
        gridTemplateRows: `repeat(${rows}, ${pitch}px)`,
        justifyContent: "center",
        alignContent: "center",
      }}
    >
      {cells.map((cell) => {
        const asset = useAssets ? assets[cell.letter] : null;
        const imageSrc = asset?.kind === "image" ? asset.url : null;
        const circleSize = Math.min(fontSize * 0.85, pitch);

        return (
          <div
            key={cell.id}
            className="relative flex items-center justify-center"
            style={{ width: pitch, height: pitch }}
          >
            {showGuides && (
              <span
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  width: circleSize,
                  height: circleSize,
                  border: "0.75px dashed rgba(61, 214, 219, 0.5)",
                  background: "transparent",
                }}
              />
            )}
            {imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt={cell.letter}
                className="pointer-events-none select-none object-contain"
                style={{
                  flexShrink: 0,
                  width: fontSize,
                  height: fontSize,
                  transform: `rotate(${cell.rotation}deg)`,
                  zIndex: 1,
                }}
              />
            ) : (
              <span
                className="select-none font-medium leading-none"
                style={{
                  fontSize,
                  fontFamily: "var(--font-mono)",
                  transform: `rotate(${cell.rotation}deg)`,
                  color: "var(--ink)",
                  zIndex: 1,
                }}
              >
                {cell.letter}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
