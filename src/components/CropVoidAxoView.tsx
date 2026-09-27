"use client";

import { ContactShadows, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import { buildVoidGeometry, VOID_COLOR } from "./voidGeometry3d";

type Props = {
  evaluation: CropEvaluation;
  spacing: number;
  fontSize: number;
};

function AxoCamera() {
  const ref = useRef<THREE.OrthographicCamera>(null);

  useLayoutEffect(() => {
    ref.current?.lookAt(0, 0.15, 0);
    ref.current?.updateProjectionMatrix();
  }, []);

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={[5.2, 4.6, 5.2]}
      zoom={44}
      near={0.1}
      far={80}
    />
  );
}

function VoidMesh({ evaluation, spacing, fontSize }: Props) {
  const geometry = useMemo(
    () => buildVoidGeometry(evaluation, spacing, fontSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluation.crop.id, spacing, fontSize, evaluation.crop.cells],
  );

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={VOID_COLOR}
        metalness={0.08}
        roughness={0.55}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function VoidScene(props: Props) {
  return (
    <>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 4]} intensity={1.25} castShadow />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} />
      <AxoCamera />
      <VoidMesh {...props} />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={5}
        blur={2}
        far={3}
      />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.3}
        target={[0, 0.15, 0]}
      />
    </>
  );
}

export default function CropVoidAxoView(props: Props) {
  return (
    <div className="h-full w-full" style={{ minHeight: 80 }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
        shadows
        style={{ width: "100%", height: "100%" }}
      >
        <VoidScene {...props} />
      </Canvas>
    </div>
  );
}
