"use client";

import { OrbitControls } from "@react-three/drei";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { useMemo } from "react";
import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import { buildVoidGeometry, VOID_COLOR } from "./voidGeometry3d";

type Props = {
  evaluations: CropEvaluation[];
  spacing: number;
  fontSize: number;
};

function VoidCell({
  evaluation,
  spacing,
  fontSize,
  position,
}: {
  evaluation: CropEvaluation;
  spacing: number;
  fontSize: number;
  position: [number, number, number];
}) {
  const geometry = useMemo(() => {
    try {
      return buildVoidGeometry(evaluation, spacing, fontSize);
    } catch {
      return new THREE.BoxGeometry(1.4, 0.35, 1.4);
    }
  }, [evaluation, spacing, fontSize]);

  return (
    <mesh geometry={geometry} position={position}>
      <meshStandardMaterial
        color={VOID_COLOR}
        metalness={0.1}
        roughness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function VoidsScene({ evaluations, spacing, fontSize }: Props) {
  const cols = 8;
  const pitch = 3.2;
  const items = useMemo(
    () =>
      evaluations.slice(0, 16).map((ev, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          ev,
          position: [
            (col - (cols - 1) / 2) * pitch,
            0,
            (row - 0.5) * pitch,
          ] as [number, number, number],
        };
      }),
    [evaluations],
  );

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[8, 14, 6]} intensity={1.45} />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} />
      <OrbitControls makeDefault target={[0, 0, 0]} />
      {items.map(({ ev, position }) => (
        <VoidCell
          key={ev.crop.id}
          evaluation={ev}
          spacing={spacing}
          fontSize={fontSize}
          position={position}
        />
      ))}
    </>
  );
}

export default function VoidsAxoGrid(props: Props) {
  return (
    <div className="h-full w-full" style={{ minHeight: 420 }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [14, 11, 14], fov: 40, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <VoidsScene {...props} />
      </Canvas>
    </div>
  );
}
