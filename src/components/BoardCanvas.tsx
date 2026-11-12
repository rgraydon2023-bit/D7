"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useBoardMode } from "./BoardMode";

/** Measure logical CSS pixels, rather than the transformed preview rectangle. */
export function BoardCanvas(props: CanvasProps) {
  const board = useBoardMode();
  return <Canvas {...props} dpr={board ? 1 : props.dpr}
    resize={board ? { ...props.resize, offsetSize: true } : props.resize} />;
}
