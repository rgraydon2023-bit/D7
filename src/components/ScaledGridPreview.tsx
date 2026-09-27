"use client";

import { useLayoutEffect, useRef, useState } from "react";
import GridPreview from "./GridPreview";
import type { Cell, LetterAssets } from "./letterTypes";

type Props = {
  cells: Cell[];
  cols: number;
  rows: number;
  spacing: number;
  fontSize: number;
  assets: LetterAssets;
  useAssets: boolean;
  showGuides: boolean;
};

/** Fits a letter grid inside its parent by uniformly scaling it. */
export default function ScaledGridPreview(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const gridW = props.cols * props.spacing;
  const gridH = props.rows * props.spacing;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0 || gridW <= 0 || gridH <= 0) return;
      const next = Math.min(width / gridW, height / gridH) * 0.92;
      setScale(Number.isFinite(next) ? next : 1);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridW, gridH]);

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        style={{
          width: gridW,
          height: gridH,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <GridPreview {...props} />
      </div>
    </div>
  );
}
