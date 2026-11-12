"use client";

/**
 * HARD-ISOLATED OBJ fidelity viewport.
 * This module accepts NO connectors, NO aggregation meshes, NO connection reports.
 * It can only render one source OBJ as RAW / REGISTERED / COPY 2.
 */

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  buildCompleteFileGeometry,
  IDENTITY_PLACEMENT,
  tileRootMatrix,
} from "./objFidelity";
import type { ImportedObj, UpAxisMode } from "./types";
import { LATTICE_FEET } from "./types";

type Props = {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  showLattice: boolean;
};

const COLORS = {
  raw: "#ffffff",
  registered: "#c8c8c8",
  copy2: "#d4a84b",
} as const;

function Instance({
  mesh,
  unitScale,
  upAxisMode,
  color,
  register,
  applyUnitAndUp,
  placement,
  geometry,
}: {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  color: string;
  register: boolean;
  applyUnitAndUp: boolean;
  placement: ReturnType<typeof IDENTITY_PLACEMENT>;
  geometry: THREE.BufferGeometry;
}) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, placement, unitScale, upAxisMode, { register, applyUnitAndUp });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, placement, unitScale, upAxisMode, register, applyUnitAndUp]);

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
      </mesh>
    </group>
  );
}

function Scene({ mesh, unitScale, upAxisMode, showLattice }: Props) {
  const { camera, invalidate } = useThree();
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const latticeGeometry = useMemo(() => {
    const positions: number[] = [];
    const cells = 4;
    for (let iz = 0; iz <= 1; iz += 1) {
      for (let ix = 0; ix <= cells; ix += 1) {
        positions.push(ix * LATTICE_FEET, iz * LATTICE_FEET, 0, ix * LATTICE_FEET, iz * LATTICE_FEET, cells * LATTICE_FEET);
      }
      for (let iy = 0; iy <= cells; iy += 1) {
        positions.push(0, iz * LATTICE_FEET, iy * LATTICE_FEET, cells * LATTICE_FEET, iz * LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    for (let ix = 0; ix <= cells; ix += 1) {
      for (let iy = 0; iy <= cells; iy += 1) {
        positions.push(ix * LATTICE_FEET, 0, iy * LATTICE_FEET, ix * LATTICE_FEET, LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return geo;
  }, []);
  useEffect(() => () => latticeGeometry.dispose(), [latticeGeometry]);

  const layouts = useMemo(() => {
    const rawPlacement = IDENTITY_PLACEMENT(`${mesh.id}::raw`);
    const regPlacement = IDENTITY_PLACEMENT(`${mesh.id}::reg`);
    const copyPlacement = { ...IDENTITY_PLACEMENT(`${mesh.id}::copy2`), ix: 1 };
    return [
      { key: "raw", offset: new THREE.Vector3(-40, 0, 0), color: COLORS.raw, register: false, applyUnitAndUp: false, placement: rawPlacement, id: `${mesh.id}::raw` },
      { key: "reg", offset: new THREE.Vector3(0, 0, 0), color: COLORS.registered, register: true, applyUnitAndUp: true, placement: regPlacement, id: `${mesh.id}::reg` },
      { key: "copy2", offset: new THREE.Vector3(20, 0, 0), color: COLORS.copy2, register: true, applyUnitAndUp: true, placement: copyPlacement, id: `${mesh.id}::copy2` },
    ];
  }, [mesh.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      camera.position.set(30, 50, 90);
      camera.near = 0.1;
      camera.far = 4000;
      camera.lookAt(0, 10, 0);
      camera.updateProjectionMatrix();
      invalidate();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [camera, invalidate, mesh.id]);

  return (
    <>
      <color attach="background" args={["#0a0a0a"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[40, 80, 30]} intensity={1.2} />
      {layouts.map((item) => (
        <group key={item.key} position={item.offset}>
          <Instance
            mesh={{ ...mesh, id: item.id }}
            unitScale={unitScale}
            upAxisMode={upAxisMode}
            color={item.color}
            register={item.register}
            applyUnitAndUp={item.applyUnitAndUp}
            placement={item.placement}
            geometry={geometry}
          />
        </group>
      ))}
      <lineSegments visible={showLattice} geometry={latticeGeometry} renderOrder={2}>
        <lineBasicMaterial color="#666666" depthWrite={false} />
      </lineSegments>
      <OrbitControls makeDefault target={[0, 10, 0]} enableDamping={false} />
    </>
  );
}

export default function ObjFidelityViewport(props: Props) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [30, 50, 90], fov: 40, near: 0.1, far: 4000 }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
