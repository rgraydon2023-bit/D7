"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { fileToSpec, resolvedUp, type ImportedObj, type UnitName, type UpAxisMode, UNIT_TO_FEET } from "../lattice/types";

export type CutAxis = "off" | "x" | "y" | "z";

export type ObjOrientation = {
  x: number;
  y: number;
  z: number;
};

export type Props = {
  meshes: ImportedObj[];
  unit: UnitName;
  upAxisMode: UpAxisMode;
  selectedId: string | null;
  orientations: Record<string, ObjOrientation>;
  onSelect: (id: string) => void;
  cutAxis: CutAxis;
  cutPosition: number;
};

function displayGeometry(mesh: ImportedObj, unitScale: number, upAxisMode: UpAxisMode) {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = fileToSpec(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2], up);
    positions[index * 3] = x * unitScale;
    positions[index * 3 + 1] = z * unitScale;
    positions[index * 3 + 2] = y * unitScale;
  }
  const indices: number[] = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      indices.push(face.vertices[0], face.vertices[index], face.vertices[index + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function orientationOf(orientations: Record<string, ObjOrientation>, id: string): ObjOrientation {
  return orientations[id] ?? { x: 0, y: 0, z: 0 };
}

function rotatedBounds(item: { x: number; size: THREE.Vector3 }, orientation: ObjOrientation) {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(orientation.x),
    THREE.MathUtils.degToRad(orientation.y),
    THREE.MathUtils.degToRad(orientation.z),
  );
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corner.set(sx * item.size.x / 2, sy * item.size.y / 2, sz * item.size.z / 2).applyEuler(euler);
        corner.x += item.x;
        min.min(corner);
        max.max(corner);
      }
    }
  }
  return { min, max };
}

function Scene({ meshes, unit, upAxisMode, selectedId, orientations, onSelect, cutAxis, cutPosition }: Props) {
  const { camera, gl, invalidate } = useThree();
  const unitScale = UNIT_TO_FEET[unit];
  const items = useMemo(() => {
    let offsetX = 0;
    return meshes.map((mesh) => {
      const geometry = displayGeometry(mesh, unitScale, upAxisMode);
      const box = geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geometry.getAttribute("position") as THREE.BufferAttribute);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      const gap = Math.max(4, size.x * 0.35);
      const x = offsetX + size.x / 2;
      offsetX += size.x + gap;
      return { mesh, geometry, x, size };
    });
  }, [meshes, unitScale, upAxisMode]);

  useEffect(() => () => {
    for (const item of items) item.geometry.dispose();
  }, [items]);

  const span = items.reduce((max, item) => Math.max(max, item.size.x, item.size.y, item.size.z), 20);
  const totalWidth = items.length ? items[items.length - 1].x + items[items.length - 1].size.x / 2 : 0;
  const aimX = totalWidth / 2;
  const fit = Math.max(24, span * 1.6, totalWidth * 0.7);
  const bounds = useMemo(() => {
    if (!items.length) return { min: new THREE.Vector3(-10, -10, -10), max: new THREE.Vector3(10, 10, 10) };
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const item of items) {
      const oriented = rotatedBounds(item, orientationOf(orientations, item.mesh.id));
      min.min(oriented.min);
      max.max(oriented.max);
    }
    return { min, max };
  }, [items, orientations]);

  const clip = useMemo(() => {
    if (cutAxis === "off") return { planes: [] as THREE.Plane[], origin: new THREE.Vector3(aimX, 0, 0), rotation: [0, 0, 0] as [number, number, number] };
    const t = THREE.MathUtils.clamp(cutPosition, 0, 1);
    const point = new THREE.Vector3(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, t),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, t),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, t),
    );
    const origin = new THREE.Vector3(aimX, 0, 0);
    let rotation: [number, number, number] = [0, 0, 0];
    let normal = new THREE.Vector3(0, 0, 1);
    if (cutAxis === "x") {
      origin.setX(point.x);
      normal = new THREE.Vector3(1, 0, 0);
      rotation = [0, Math.PI / 2, 0];
    } else if (cutAxis === "y") {
      origin.setY(point.y);
      normal = new THREE.Vector3(0, 1, 0);
      rotation = [Math.PI / 2, 0, 0];
    } else {
      origin.setZ(point.z);
      normal = new THREE.Vector3(0, 0, 1);
      rotation = [0, 0, 0];
    }
    return { planes: [new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin)], origin, rotation };
  }, [aimX, bounds, cutAxis, cutPosition]);

  const helperSize = Math.max(span, totalWidth, 12) * 1.15;

  useEffect(() => {
    gl.localClippingEnabled = cutAxis !== "off";
  }, [cutAxis, gl]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      camera.near = Math.max(0.1, fit * 0.001);
      camera.far = Math.max(4000, fit * 10);
      camera.position.set(aimX + fit * 0.72, fit * 0.55, fit * 0.72);
      camera.lookAt(aimX, 0, 0);
      camera.updateProjectionMatrix();
      invalidate();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aimX, camera, fit, invalidate]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.1} />
      {items.map(({ mesh, geometry, x }) => {
        const orientation = orientationOf(orientations, mesh.id);
        return (
        <mesh
          key={mesh.id}
          geometry={geometry}
          position={[x, 0, 0]}
          rotation={[
            THREE.MathUtils.degToRad(orientation.x),
            THREE.MathUtils.degToRad(orientation.y),
            THREE.MathUtils.degToRad(orientation.z),
          ]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(mesh.id);
          }}
        >
          <meshStandardMaterial
            color="#f4f4f4"
            roughness={0.72}
            metalness={0.02}
            side={THREE.DoubleSide}
            clippingPlanes={clip.planes}
            clipShadows
            emissive={selectedId === mesh.id ? "#145c60" : "#000000"}
          />
        </mesh>
        );
      })}
      {cutAxis !== "off" && (
        <mesh position={clip.origin.toArray()} rotation={clip.rotation}>
          <planeGeometry args={[helperSize, helperSize]} />
          <meshBasicMaterial color="#45e1ef" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <OrbitControls makeDefault target={[aimX, 0, 0]} enableDamping={false} />
    </>
  );
}

export default function Part3Viewport(props: Props) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance", localClippingEnabled: true }}
      camera={{ position: [40, 28, 40], fov: 40, near: 0.1, far: 8000 }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
