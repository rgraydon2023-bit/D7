"use client";

import { OrthographicCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { forwardRef, type ComponentProps } from "react";
import type * as THREE from "three";
import { useBoardMode } from "./BoardMode";

type Props = ComponentProps<typeof OrthographicCamera> & { boardReferenceSize?: number };

/** Fixed-zoom diagrams keep their apparent scale in the larger board panels. */
export const BoardOrthographicCamera = forwardRef<THREE.OrthographicCamera, Props>(function BoardOrthographicCamera(
  { boardReferenceSize = 360, ...props }, ref,
) {
  const board = useBoardMode();
  const size = useThree((state) => state.size);
  const factor = board ? Math.min(size.width, size.height) / boardReferenceSize : 1;
  return <OrthographicCamera {...props} ref={ref} zoom={(props.zoom ?? 1) * factor} />;
});
