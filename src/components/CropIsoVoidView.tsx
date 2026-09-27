"use client";

import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import type { Cell } from "./letterTypes";

type Props = {
  evaluation: CropEvaluation;
  depthCells: Cell[];
  spacing: number;
  fontSize: number;
  clipPositions: ClipPositions;
  yRotationEnabled: boolean;
  yRotationRange: number;
};

export type ClipPositions = { x: number; y: number; z: number };

function meshGeometry(vertices: number[], triangles: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function AxoCamera() {
  const ref = useRef<THREE.OrthographicCamera>(null);

  useLayoutEffect(() => {
    ref.current?.lookAt(0, 0, 0);
    ref.current?.updateProjectionMatrix();
  }, []);

  return <OrthographicCamera ref={ref} makeDefault position={[6.6, 6, 6.6]} zoom={42} near={0.05} far={100} />;
}

function IsoMaterial({ clipX, clipY, clipZ }: { clipX: number; clipY: number; clipZ: number }) {
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: {
        clipX: { value: clipX },
        clipY: { value: clipY },
        clipZ: { value: clipZ },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vLocalPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          vLocalPosition = position;
          gl_Position = projectionMatrix * vec4(vPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vLocalPosition;
        uniform float clipX;
        uniform float clipY;
        uniform float clipZ;
        void main() {
          if (vLocalPosition.x > clipX || vLocalPosition.y > clipY || vLocalPosition.z > clipZ) discard;
          vec3 normal = normalize(vNormal);
          vec3 light = normalize(vec3(0.45, 0.78, 0.65));
          float diffuse = max(dot(normal, light), 0.0);
          float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
          vec3 shadow = vec3(0.035, 0.10, 0.13);
          vec3 face = vec3(0.36, 0.80, 0.86);
          vec3 color = mix(shadow, face, 0.22 + diffuse * 0.72) + rim * vec3(0.12, 0.24, 0.28);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    }),
    [],
  );

  useEffect(() => {
    material.uniforms.clipX.value = clipX;
    material.uniforms.clipY.value = clipY;
    material.uniforms.clipZ.value = clipZ;
  }, [material, clipX, clipY, clipZ]);
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}

type CutAxis = "x" | "y" | "z";

function PlaneSectionCut({ geometry, axis, cutPosition }: { geometry: THREE.BufferGeometry; axis: CutAxis; cutPosition: number }) {
  const { lineGeometry, panelPosition, panelRotation, panelWidth, panelHeight, color } = useMemo(() => {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new THREE.Box3();
    const dimensions = new THREE.Vector3().subVectors(bounds.max, bounds.min);
    const section = (bounds.min[axis] + bounds.max[axis]) / 2 + dimensions[axis] * (cutPosition / 200);
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const points: number[] = [];
    const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
    const intersections = (a: THREE.Vector3, b: THREE.Vector3) => {
      const da = a[axis] - section;
      const db = b[axis] - section;
      if (Math.abs(da) < 1e-6 && Math.abs(db) < 1e-6) return [a.clone(), b.clone()];
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) return [a.clone().lerp(b, da / (da - db))];
      if (Math.abs(da) < 1e-6) return [a.clone()];
      if (Math.abs(db) < 1e-6) return [b.clone()];
      return [] as THREE.Vector3[];
    };

    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const a = vertex(i);
      const b = vertex(i + 1);
      const c = vertex(i + 2);
      const hits = [...intersections(a, b), ...intersections(b, c), ...intersections(c, a)]
        .filter((point, hitIndex, all) => all.findIndex((other) => other.distanceToSquared(point) < 1e-9) === hitIndex);
      if (hits.length < 2) continue;
      const first = hits[0];
      const last = hits.reduce((furthest, point) => point.distanceToSquared(first) > furthest.distanceToSquared(first) ? point : furthest, hits[1]);
      if (axis === "x") points.push(0, first.y, first.z, 0, last.y, last.z);
      // Each preview line is expressed directly in the same local axes as its panel:
      // YZ for X, XZ for Y, and XY for Z.
      if (axis === "y") points.push(first.x, 0, first.z, last.x, 0, last.z);
      if (axis === "z") points.push(first.x, first.y, 0, last.x, last.y, 0);
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const gap = Math.max(dimensions.length() * 0.14, 0.4);
    if (axis === "x") return { lineGeometry, panelPosition: new THREE.Vector3(bounds.max.x + dimensions.x / 2 + gap, 0, 0), panelRotation: [0, Math.PI / 2, 0] as [number, number, number], panelWidth: dimensions.z * 1.2, panelHeight: dimensions.y * 1.2, color: "#f49aa6" };
    if (axis === "y") return { lineGeometry, panelPosition: new THREE.Vector3(0, bounds.max.y + dimensions.y / 2 + gap, 0), panelRotation: [Math.PI / 2, 0, 0] as [number, number, number], panelWidth: dimensions.x * 1.2, panelHeight: dimensions.z * 1.2, color: "#b7ea9c" };
    return { lineGeometry, panelPosition: new THREE.Vector3(0, 0, bounds.max.z + dimensions.z / 2 + gap), panelRotation: [0, 0, 0] as [number, number, number], panelWidth: dimensions.x * 1.2, panelHeight: dimensions.y * 1.2, color: "#9fc7ff" };
  }, [geometry, axis, cutPosition]);

  useEffect(() => () => lineGeometry.dispose(), [lineGeometry]);

  return (
    <group position={panelPosition}>
      <mesh rotation={panelRotation}>
        <planeGeometry args={[panelWidth, panelHeight]} />
        <meshBasicMaterial color="#0b1720" transparent opacity={0.92} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={lineGeometry} renderOrder={3}>
        <lineBasicMaterial color="#e7fdff" transparent opacity={0.9} depthTest depthWrite={false} />
      </lineSegments>
      <lineSegments rotation={panelRotation}>
        <edgesGeometry args={[new THREE.PlaneGeometry(panelWidth, panelHeight)]} />
        <lineBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function ClipPlanes({ geometry, positions }: { geometry: THREE.BufferGeometry; positions: ClipPositions }) {
  const { clipX, clipY, clipZ, width, height, depth } = useMemo(() => {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new THREE.Box3();
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    const depth = bounds.max.z - bounds.min.z;
    const valueAt = (min: number, max: number, value: number) => (min + max) / 2 + (max - min) * (value / 200);
    return {
      clipX: valueAt(bounds.min.x, bounds.max.x, positions.x),
      clipY: valueAt(bounds.min.y, bounds.max.y, positions.y),
      clipZ: valueAt(bounds.min.z, bounds.max.z, positions.z),
      width,
      height,
      depth,
    };
  }, [geometry, positions]);

  return (
    <>
      <mesh position={[clipX, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshBasicMaterial color="#f49aa6" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, clipY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#b7ea9c" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, clipZ]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#9fc7ff" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}

function IsoMesh({ geometry, positions }: { geometry: THREE.BufferGeometry; positions: ClipPositions }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry]);
  const clipValues = useMemo(() => {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new THREE.Box3();
    const valueAt = (min: number, max: number, value: number) => (min + max) / 2 + (max - min) * (value / 200);
    return {
      x: valueAt(bounds.min.x, bounds.max.x, positions.x),
      y: valueAt(bounds.min.y, bounds.max.y, positions.y),
      z: valueAt(bounds.min.z, bounds.max.z, positions.z),
    };
  }, [geometry, positions]);

  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <IsoMaterial clipX={clipValues.x} clipY={clipValues.y} clipZ={clipValues.z} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={1}>
        <lineBasicMaterial color="#d2fbff" transparent opacity={0.5} depthTest depthWrite={false} />
      </lineSegments>
      <ClipPlanes geometry={geometry} positions={positions} />
      <PlaneSectionCut geometry={geometry} axis="x" cutPosition={positions.x} />
      <PlaneSectionCut geometry={geometry} axis="y" cutPosition={positions.y} />
      <PlaneSectionCut geometry={geometry} axis="z" cutPosition={positions.z} />
    </group>
  );
}

function IsoScene({ geometry, positions }: { geometry: THREE.BufferGeometry; positions: ClipPositions }) {
  return (
    <>
      <color attach="background" args={["#05080c"]} />
      <ambientLight intensity={0.38} />
      <directionalLight position={[5, 8, 4]} intensity={1.15} />
      <directionalLight position={[-4, 2, -5]} intensity={0.3} />
      <AxoCamera />
      <IsoMesh geometry={geometry} positions={positions} />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2.2} target={[0, 0, 0]} />
    </>
  );
}

export default function CropIsoVoidView({ evaluation, depthCells, spacing, fontSize, clipPositions, yRotationEnabled, yRotationRange }: Props) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Crop cells are represented as a flat list, while depth cells are layered rows.
  // Serializing their immutable data avoids rebuilding the mesh when a clip slider moves.
  const cropKey = JSON.stringify(evaluation.crop.cells);
  const depthKey = JSON.stringify(depthCells);

  useEffect(() => {
    let cancelled = false;
    setGeometry(null);
    setError(null);

    void fetch("/api/crop-iso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cells: evaluation.crop.cells,
        depthCells,
        spacing,
        fontSize,
        yRotationEnabled,
        yRotationRange,
      }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Iso mesh could not be generated");
        return result as { vertices: number[]; triangles: number[] };
      })
      .then((mesh) => {
        const next = meshGeometry(mesh.vertices, mesh.triangles);
        if (cancelled) {
          next.dispose();
          return;
        }
        setGeometry(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Iso mesh could not be generated");
      });

    return () => {
      cancelled = true;
    };
  }, [evaluation.crop.id, cropKey, depthKey, spacing, fontSize, yRotationEnabled, yRotationRange]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  return (
    <div className="relative h-full w-full">
      {geometry && (
        <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true }} shadows>
          <IsoScene geometry={geometry} positions={clipPositions} />
        </Canvas>
      )}
      {!geometry && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11px]" style={{ color: error ? "var(--danger-text)" : "var(--muted)" }}>
          {error ?? "Generating bounded iso mesh…"}
        </div>
      )}
    </div>
  );
}
