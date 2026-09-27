"use client";

import { ContactShadows, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import { getLetterGeometry, LETTER_COLORS } from "./letterGeometry3d";
import type { Cell } from "./letterTypes";

type CropAxoViewProps = {
  evaluation: CropEvaluation;
  spacing: number;
  fontSize: number;
};

function LetterSolid({ cell, size }: { cell: Cell; size: number }) {
  const geometry = useMemo(() => getLetterGeometry(cell.letter), [cell.letter]);
  const color = LETTER_COLORS[cell.letter];

  return (
    <mesh
      geometry={geometry}
      scale={size}
      rotation={[0, THREE.MathUtils.degToRad(cell.rotation), 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} metalness={0.15} roughness={0.45} />
    </mesh>
  );
}

function AxoCamera() {
  const ref = useRef<THREE.OrthographicCamera>(null);

  useLayoutEffect(() => {
    ref.current?.lookAt(0, 0.05, 0);
    ref.current?.updateProjectionMatrix();
  }, []);

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={[5.5, 4.8, 5.5]}
      zoom={42}
      near={0.1}
      far={80}
    />
  );
}

function CropScene({ evaluation, spacing, fontSize }: CropAxoViewProps) {
  const worldGap = Math.max(0.35, spacing / 55);
  const letterSize = Math.max(0.45, fontSize / 55);
  const positions: [number, number, number][] = [
    [-worldGap / 2, 0, -worldGap / 2],
    [worldGap / 2, 0, -worldGap / 2],
    [-worldGap / 2, 0, worldGap / 2],
    [worldGap / 2, 0, worldGap / 2],
  ];

  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 3]} intensity={1.15} castShadow />
      <directionalLight position={[-3, 2, -4]} intensity={0.35} />
      <AxoCamera />

      <group>
        {evaluation.crop.cells.map((cell, i) => (
          <group key={cell.id} position={positions[i]}>
            <LetterSolid cell={cell} size={letterSize} />
          </group>
        ))}
      </group>

      <ContactShadows
        position={[0, -0.35, 0]}
        opacity={0.45}
        scale={6}
        blur={2.2}
        far={4}
      />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.35}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

export default function CropAxoView(props: CropAxoViewProps) {
  return (
    <div className="h-full w-full">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} shadows>
        <CropScene {...props} />
      </Canvas>
    </div>
  );
}
