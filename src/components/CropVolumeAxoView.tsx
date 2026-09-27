"use client";

import { ContactShadows, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import { getLetterVolumeGeometry, LETTER_COLORS } from "./letterGeometry3d";
import type { Cell } from "./letterTypes";
import { letterVolumeLayout } from "./letterVolumeLayout";

type Props = {
  evaluation: CropEvaluation;
  depthCells: Cell[];
  spacing: number;
  fontSize: number;
  yRotationEnabled?: boolean;
  yRotationRange?: number;
};

function SolidLetter({ cell, size }: { cell: Cell; size: number }) {
  const geometry = useMemo(() => getLetterVolumeGeometry(cell.letter, 150), [cell.letter]);

  return (
    <mesh
      geometry={geometry}
      scale={size}
      rotation={[0, 0, THREE.MathUtils.degToRad(cell.rotation)]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={LETTER_COLORS[cell.letter]} metalness={0.15} roughness={0.45} />
    </mesh>
  );
}

function AxoCamera() {
  const ref = useRef<THREE.OrthographicCamera>(null);

  useLayoutEffect(() => {
    ref.current?.lookAt(0, 0, 0);
    ref.current?.updateProjectionMatrix();
  }, []);

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={[6.4, 5.6, 6.4]}
      zoom={38}
      near={0.1}
      far={80}
    />
  );
}

function CropVolumeScene({ evaluation, depthCells, spacing, fontSize, yRotationEnabled = false, yRotationRange = 0 }: Props) {
  const { placements, worldLetterSize, height } = useMemo(() => letterVolumeLayout({
    cells: evaluation.crop.cells,
    layerCells: [depthCells],
    cols: 2,
    rows: 2,
    spacing,
    zSpacing: spacing,
    letterSize: fontSize,
    thickness: 150,
    yRotationEnabled,
    yRotationRange,
  }), [evaluation.crop.cells, depthCells, spacing, fontSize, yRotationEnabled, yRotationRange]);

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 3]} intensity={1.15} castShadow />
      <directionalLight position={[-3, 2, -4]} intensity={0.35} />
      <AxoCamera />

      {placements.map(({ cell, x, y, z, layerIndex, yRotation }) => (
        <group key={`${layerIndex}-${cell.id}`} position={[x, y, z]} rotation={[0, THREE.MathUtils.degToRad(yRotation), 0]}>
          <SolidLetter cell={cell} size={worldLetterSize} />
        </group>
      ))}

      <ContactShadows
        position={[0, -height / 2 - worldLetterSize * 0.28, 0]}
        opacity={0.42}
        scale={6}
        blur={2.2}
        far={4}
      />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function CropVolumeAxoView(props: Props) {
  return (
    <div className="h-full w-full">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} shadows>
        <CropVolumeScene {...props} />
      </Canvas>
    </div>
  );
}
