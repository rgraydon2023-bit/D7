"use client";

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
  return (
    <div
      className={`mx-auto w-fit ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${spacing}px)`,
        gridTemplateRows: `repeat(${rows}, ${spacing}px)`,
        justifyContent: "center",
        alignContent: "center",
      }}
    >
      {cells.map((cell) => {
        const asset = useAssets ? assets[cell.letter] : null;
        const imageSrc = asset?.kind === "image" ? asset.url : null;
        const circleSize = Math.min(fontSize * 0.85, spacing);

        return (
          <div
            key={cell.id}
            className="relative flex items-center justify-center"
            style={{ width: spacing, height: spacing }}
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
