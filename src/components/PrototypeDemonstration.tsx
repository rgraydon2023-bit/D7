"use client";

import { OrbitControls, OrthographicCamera as FitOrthographicCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { BoardOrthographicCamera as OrthographicCamera } from "./BoardOrthographicCamera";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { DESCRIPTORS, type CompositionPlacement, type DescriptorSettings } from "./compositionEngine";
import { PROTOTYPE_SESSION_KEY, readJson, writeJson } from "./browserSession";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import { buildFaceBridges, typologyBridgeSettings, DEFAULT_FACE_BRIDGES, type FaceBridgeDirection, type FaceBridgeMesh, type FaceBridgeMode, type FaceBridgeSettings } from "./faceBridges";
import type { IntersectionSpaceMesh } from "./letterIntersectionSpaces";
import {
  DEFAULT_CONTINUITY_CONTROLS,
  CATEGORY_DEFINITIONS,
  TYPOLOGY_RULES,
  VERTICAL_INCREMENT_FEET,
  architecturalObj,
  analyzeSourceGeometry,
  buildAggregation,
  generateProtoArchitecture,
  recenteredPlacements,
  type AggregationResult,
  type AmphitheaterVariation,
  type ArchitecturalElement,
  type ArchitecturalSurfaceClass,
  type ContinuityControls,
  type PrototypeGeometryMode,
  type PrototypeCategory,
  type PrototypeTypologyId,
  type PrototypeView,
} from "./amphitheaterPrototype";

export type Props = {
  selectionOnly?: boolean;
  sourcePlacements: CompositionPlacement[];
  completeSourcePlacements: CompositionPlacement[];
  sourceLabel: string;
  sourceBounds: { width: number; height: number; depth: number };
  sourceThickness: number;
  sourceOptions: Array<{ index: number; label: string }>;
  selectedSourceIndex: number;
  onSourceIndexChange: (index: number) => void;
  descriptors: DescriptorSettings;
  selectedMode: PrototypeGeometryMode;
  onSelectedModeChange: (mode: PrototypeGeometryMode) => void;
  selectedCategory: PrototypeCategory;
  selectedTypology: PrototypeTypologyId;
  onSelectedCategoryChange: (category: PrototypeCategory) => void;
  onSelectedTypologyChange: (typology: PrototypeTypologyId) => void;
};

type Criterion = { id: string; name: string; value: number; notes: string };
type VariationMap = Record<PrototypeGeometryMode, AmphitheaterVariation>;
type SurfaceFilter = ArchitecturalSurfaceClass | "combined";
type PrototypeSession = {
  seed: number;
  continuityControls: ContinuityControls;
  view: PrototypeView;
  stage: number;
  sourceScope: "selection" | "complete";
  showAnalysis: boolean;
  showGrid: boolean;
  finishedOnly: boolean;
  surfaceFilter: SurfaceFilter;
  aggregationCount: 2 | 4 | 8;
  criteria: Criterion[];
  preferred: PrototypeGeometryMode;
  rationale: string;
  finalized: boolean;
  stageSchema?: number;
  faceBridges?: FaceBridgeSettings;
};

const modes: PrototypeGeometryMode[] = ["letters", "voids", "combined"];
const modeLabels: Record<PrototypeGeometryMode, string> = { letters: "Letters", voids: "Voids", combined: "Letters + Voids" };
const STAGE_SCHEMA = 4;
const stages = [
  "Original source",
  "Connections",
  "Intersecting components",
  "Connections + intersecting components",
  "Unified source volumes",
  "Components + full source field",
  "Typology interpretation + primary geometry",
  "Final architectural geometry",
  "Interlocking tile",
  "Aggregations",
  "Surface classification diagnostic",
  "Connection graph diagnostic",
  "Elevation response comparison",
  "Three-mode comparison",
  "Evaluation + selection",
];

const panelStyle = { borderColor: "var(--line)", background: "var(--panel)" } as const;
const inputStyle = { borderColor: "var(--line)", background: "var(--panel-soft)" } as const;
const EXPORT_BACKGROUND = "#000000";
const EXPORT_GOLD = "#D6AD4F";
const EXPORT_REFERENCE_BLUE = "#9BD5E4";

const analysisCache = new WeakMap<CompositionPlacement[], Map<boolean, ReturnType<typeof analyzeSourceGeometry>>>();
function cachedAnalysis(source: CompositionPlacement[], full: boolean) {
  const cache = analysisCache.get(source) ?? new Map();
  if (!cache.has(full)) cache.set(full, analyzeSourceGeometry(source, full));
  analysisCache.set(source, cache);
  return cache.get(full)!;
}
type GeneratedRequest = {
  faceBridges: FaceBridgeSettings;
  source: CompositionPlacement[];
  thickness: number;
  descriptors: DescriptorSettings;
  category: PrototypeCategory;
  typology: PrototypeTypologyId;
  seed: number;
  continuityControls: ContinuityControls;
  key: string;
};

function transformedFootprint(element: ArchitecturalElement) {
  const footprint = element.footprint ?? [[-element.width / 2, -element.depth / 2], [element.width / 2, -element.depth / 2], [element.width / 2, element.depth / 2], [-element.width / 2, element.depth / 2]];
  const angle = THREE.MathUtils.degToRad(element.rotation), cosine = Math.cos(angle), sine = Math.sin(angle);
  return footprint.map(([x, y]) => [element.x + x * cosine + y * sine, element.y - x * sine + y * cosine] as [number, number]);
}

function pointInPolygon(point: [number, number], polygon: Array<[number, number]>) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [xi, yi] = polygon[current], [xj, yj] = polygon[previous];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function surfaceOverlap(first: AmphitheaterVariation, second: AmphitheaterVariation) {
  const eligible = (variation: AmphitheaterVariation) => variation.elements
    .filter((element) => element.kind !== "void" && element.kind !== "connector")
    .map(transformedFootprint);
  const firstPolygons = eligible(first), secondPolygons = eligible(second);
  let intersection = 0, union = 0;
  const divisions = 56;
  for (let yIndex = 0; yIndex < divisions; yIndex++) for (let xIndex = 0; xIndex < divisions; xIndex++) {
    const point: [number, number] = [-10 + (xIndex + .5) * 20 / divisions, -10 + (yIndex + .5) * 20 / divisions];
    const inFirst = firstPolygons.some((polygon) => pointInPolygon(point, polygon));
    const inSecond = secondPolygons.some((polygon) => pointInPolygon(point, polygon));
    if (inFirst || inSecond) union++;
    if (inFirst && inSecond) intersection++;
  }
  return union ? intersection / union * 100 : 0;
}

function intersectionSpacesObj(mesh: IntersectionSpaceMesh) {
  const lines = ["# One architectural mesh built from the letter arrangement", "# Coordinates match the source letter positions", "o architectural_space"];
  for (let index = 0; index < mesh.positions.length; index += 3) lines.push(`v ${mesh.positions[index]} ${mesh.positions[index + 1]} ${mesh.positions[index + 2]}`);
  for (let index = 0; index < mesh.indices.length; index += 3) lines.push(`f ${mesh.indices[index] + 1} ${mesh.indices[index + 1] + 1} ${mesh.indices[index + 2] + 1}`);
  return `${lines.join("\n")}\n`;
}

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function IntersectionSpaceMesh({ positions, normals, indices }: { positions: number[]; normals?: number[]; indices: number[] }) {
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (normals && normals.length === positions.length) result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    else result.computeVertexNormals();
    result.setIndex(indices);
    return result;
  }, [positions, normals, indices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}>
    <meshStandardMaterial color="#f4f1ea" roughness={0.52} metalness={0.02} />
  </mesh>;
}

function LetterFrameCamera({ center, span, view }: { center: [number, number, number]; span: number; view: PrototypeView }) {
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const zoom = Math.max(36, Math.min(size.width, size.height) / Math.max(span, 0.25) / 1.05);
  const position: [number, number, number] = view === "plan"
    ? [center[0], center[1], center[2] + span * 2.8]
    : view === "section"
      ? [center[0], center[1] + span * 2.8, center[2] + 0.01]
      : [center[0] + span * 1.15, center[1] + span * 0.82, center[2] + span * 1.25];
  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    set({ camera });
  }, [center, set, zoom, position[0], position[1], position[2]]);
  return <FitOrthographicCamera ref={cameraRef} makeDefault position={position} zoom={zoom} near={0.01} far={Math.max(80, span * 40)} />;
}

function ClayCamera({ center, span, view }: { center: [number, number, number]; span: number; view: PrototypeView }) {
  const size = useThree((state) => state.size);
  const zoom = Math.max(48, Math.min(size.width, size.height) / Math.max(span, 0.2) / 1.15);
  const position: [number, number, number] = view === "plan"
    ? [center[0], center[1] + span * 2.6, center[2]]
    : view === "section"
      ? [center[0], center[1], center[2] + span * 2.6]
      : [center[0] + span * 0.95, center[1] + span * 0.72, center[2] + span * 1.25];
  return <FitOrthographicCamera makeDefault zoom={zoom} near={0.01} far={Math.max(80, span * 48)} position={position} up={view === "plan" ? [0, 0, 1] : [0, 1, 0]} />;
}

function ArchitecturalMesh({ positions, indices, wireframe = false }: { positions: number[]; indices: number[]; wireframe?: boolean }) {
  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (indices.length) geometry.setIndex(indices);
    if (wireframe) {
      const edges = new THREE.EdgesGeometry(geometry, 24);
      geometry.dispose();
      return edges;
    }
    geometry.computeVertexNormals();
    return geometry;
  }, [positions, indices, wireframe]);
  if (wireframe) return <lineSegments geometry={geometry}><lineBasicMaterial color="#f4f1ea" transparent opacity={0.9} depthTest={false} /></lineSegments>;
  return <mesh geometry={geometry}><meshStandardMaterial color="#f4f1ea" roughness={0.52} metalness={0.02} side={THREE.DoubleSide} /></mesh>;
}

function RecenteredLetter({ item }: { item: CompositionPlacement }) {
  const geometry = useMemo(() => {
    const geometry = getLetterVolumeGeometry(item.cell.letter, 14).clone();
    geometry.scale(item.scale * (item.scaleX ?? 1), item.scale * (item.scaleY ?? 1), item.scale * (item.scaleZ ?? 1));
    geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(item.rx),
      THREE.MathUtils.degToRad(item.rz),
      THREE.MathUtils.degToRad(item.ry),
      "XYZ",
    )));
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      position.setXYZ(index, item.x + position.getX(index), item.z + position.getY(index), item.y + position.getZ(index));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [item]);
  return <mesh geometry={geometry}><meshStandardMaterial color={EXPORT_REFERENCE_BLUE} roughness={0.55} metalness={0.02} side={THREE.DoubleSide} /></mesh>;
}

function meshFrameOf(positions: number[]) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) box.expandByPoint(point.set(positions[index], positions[index + 1], positions[index + 2]));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { center, span: Math.max(size.x, size.y, size.z, 0.2) };
}

function FaceBridgeMeshView({ mesh }: { mesh: FaceBridgeMesh }) {
  const surface = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setIndex(mesh.indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [mesh]);
  const points = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.points, 3));
    return geometry;
  }, [mesh]);
  const lines = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.lines, 3));
    return geometry;
  }, [mesh]);
  useEffect(() => () => {
    surface.dispose();
    points.dispose();
    lines.dispose();
  }, [surface, points, lines]);
  return <>
    <mesh geometry={surface}>
      <meshStandardMaterial color={EXPORT_REFERENCE_BLUE} roughness={0.7} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
    <lineSegments geometry={lines} renderOrder={2}>
      <lineBasicMaterial color="#34404a" transparent opacity={0.5} />
    </lineSegments>
    <points geometry={points} renderOrder={3}>
      <pointsMaterial color="#f3e7bd" size={4} sizeAttenuation={false} />
    </points>
  </>;
}

function PrototypeViewport({
  variation,
  source,
  stage,
  view,
  captureRef,
  showAnalysis = true,
  showGrid = true,
  sourceBounds,
  sourceThickness = 12,
  intersectionSpaces = null,
  showSourceLetters = true,
  faceBridges = null,
}: {
  variation?: AmphitheaterVariation;
  source: CompositionPlacement[];
  stage: number;
  view: PrototypeView;
  aggregation?: AggregationResult;
  captureRef?: MutableRefObject<(() => string) | null>;
  showAnalysis?: boolean;
  showGrid?: boolean;
  sourceBounds?: { width: number; height: number; depth: number };
  sourceThickness?: number;
  finishedOnly?: boolean;
  presentationOnly?: boolean;
  surfaceFilter?: SurfaceFilter;
  connectionDiagnostic?: "components" | "graph" | "connectors" | "final";
  intersectionSpaces?: IntersectionSpaceMesh | null;
  showSourceLetters?: boolean;
  faceBridges?: FaceBridgeMesh | null;
}) {
  const bounds = sourceBounds ?? {
    width: Math.max(1, Math.max(...source.map((item) => item.x)) - Math.min(...source.map((item) => item.x))),
    height: Math.max(1, Math.max(...source.map((item) => item.y)) - Math.min(...source.map((item) => item.y))),
    depth: Math.max(1, Math.max(...source.map((item) => item.z)) - Math.min(...source.map((item) => item.z))),
  };
  const maximumDimension = Math.max(bounds.width, bounds.height, bounds.depth, 1);
  const showCombined = stage === 3;
  const showConnections = stage === 1 || showCombined;
  const combinedWire = useMemo(() => {
    if (!showCombined || !variation?.continuousMesh.positions.length) return null;
    const sourcePositions = variation.continuousMesh.positions;
    const swapped = new Array<number>(sourcePositions.length);
    for (let index = 0; index < sourcePositions.length; index += 3) {
      swapped[index] = sourcePositions[index];
      swapped[index + 1] = sourcePositions[index + 2];
      swapped[index + 2] = sourcePositions[index + 1];
    }
    return swapped;
  }, [showCombined, variation]);
  const letterFrame = useMemo(() => {
    if (!showConnections || !source.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const include = (x: number, y: number, z: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    };
    for (const item of source) {
      const reach = Math.max(0.35, item.scale);
      include(item.x - reach, item.y - reach, item.z - reach);
      include(item.x + reach, item.y + reach, item.z + reach);
    }
    if (combinedWire) {
      for (let index = 0; index < combinedWire.length; index += 3) include(combinedWire[index], combinedWire[index + 1], combinedWire[index + 2]);
    }
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [number, number, number],
      span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.4),
    };
  }, [showConnections, source, combinedWire]);
  const frameCenter = letterFrame?.center ?? [0, 0, 0];
  const frameSpan = letterFrame?.span ?? maximumDimension;
  const sourceCamera: [number, number, number] = view === "plan"
    ? [frameCenter[0], frameCenter[1], frameCenter[2] + frameSpan * 2.5]
    : view === "section"
      ? [frameCenter[0], frameCenter[1] + frameSpan * 2.5, frameCenter[2] + 0.01]
      : [frameCenter[0] + frameSpan, frameCenter[1] + frameSpan * 0.8, frameCenter[2] + frameSpan * 1.2];
  const showFormation = stage === 2;
  const recentered = useMemo(() => showFormation ? recenteredPlacements(source) : [], [showFormation, source]);
  const connectionFinal = stage === 7;
  const connectionPositions = useMemo(() => {
    const result: number[] = [];
    if (intersectionSpaces) for (let i=0;i<intersectionSpaces.positions.length;i+=3) result.push(intersectionSpaces.positions[i],intersectionSpaces.positions[i+2],-intersectionSpaces.positions[i+1]);
    return result;
  }, [intersectionSpaces]);
  const architecture = !connectionFinal && stage > 3 && variation?.continuousMesh.positions.length ? variation.continuousMesh : null;
  const formationMesh = showFormation && variation?.continuousMesh.positions.length ? variation.continuousMesh : null;
  const showUnifiedMesh = !connectionFinal && !architecture && !showFormation && !showConnections && stage > 3 && Boolean(intersectionSpaces && intersectionSpaces.indices.length > 0);
  const framed = useMemo(() => {
    if (connectionFinal && connectionPositions.length) return meshFrameOf(connectionPositions);
    if (formationMesh) return meshFrameOf(formationMesh.positions);
    if (showFormation && recentered.length) return meshFrameOf(recentered.flatMap((item) => [item.x, item.z, item.y]));
    return architecture ? meshFrameOf(architecture.positions) : showUnifiedMesh && intersectionSpaces ? meshFrameOf(intersectionSpaces.positions) : null;
  }, [connectionFinal, connectionPositions, formationMesh, showFormation, recentered, architecture, showUnifiedMesh, intersectionSpaces]);
  const fusedLetters = new Set(intersectionSpaces?.included ?? []);
  const showSeparateLetters = !connectionFinal && showSourceLetters && !showUnifiedMesh && !showFormation;
  const showUntouchedLetters = showUnifiedMesh && fusedLetters.size > 0;
  const cameraTarget: [number, number, number] = framed ? [framed.center.x, framed.center.y, framed.center.z] : frameCenter;
  const perspectivePosition: [number, number, number] | null = framed
    ? [framed.center.x + framed.span * 1.25, framed.center.y + framed.span * 0.72, framed.center.z + framed.span * 1.45]
    : null;
  return <Canvas
    dpr={[1, 1.5]}
    gl={{ antialias: true, preserveDrawingBuffer: true }}
    onCreated={({ gl }) => { if (captureRef) captureRef.current = () => gl.domElement.toDataURL("image/png"); }}
  >
    <color attach="background" args={[EXPORT_BACKGROUND]} />
    <ambientLight intensity={framed ? 0.92 : 0.72} />
    <directionalLight position={[8, 14, 10]} intensity={framed ? 1.45 : 1.15} />
    {framed && <directionalLight position={[-9, 4, -7]} intensity={0.42} />}
    {perspectivePosition ? <ClayCamera center={cameraTarget} span={framed?.span ?? 1} view={view} /> : letterFrame ? <LetterFrameCamera center={frameCenter} span={frameSpan} view={view} /> : <OrthographicCamera makeDefault position={sourceCamera} zoom={Math.min(150, 380 / maximumDimension)} near={0.01} far={300} />}
    {showGrid && !connectionFinal && !architecture && !showFormation && <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(bounds.width, bounds.height, bounds.depth)]} />
      <lineBasicMaterial color={EXPORT_GOLD} />
    </lineSegments>}
    {(showSeparateLetters || showUntouchedLetters) && source.map((placement, index) => showUntouchedLetters && fusedLetters.has(index) ? null : <mesh
      key={`exact-source-${index}-${placement.cell.id}`}
      geometry={getLetterVolumeGeometry(placement.cell.letter, sourceThickness)}
      position={[placement.x, placement.y, placement.z]}
      rotation={[THREE.MathUtils.degToRad(placement.rx), THREE.MathUtils.degToRad(placement.ry), THREE.MathUtils.degToRad(placement.rz)]}
      scale={[
        placement.scale * (placement.scaleX ?? 1),
        placement.scale * (placement.scaleY ?? 1),
        placement.scale * (placement.scaleZ ?? 1),
      ]}
    >
      <meshStandardMaterial color={EXPORT_REFERENCE_BLUE} roughness={0.7} side={THREE.DoubleSide} />
    </mesh>)}
    {combinedWire && variation && <ArchitecturalMesh positions={combinedWire} indices={variation.continuousMesh.indices} wireframe />}
    {showFormation && recentered.map((item, index) => <RecenteredLetter key={`recentered-${index}-${item.cell.id}`} item={item} />)}
    {formationMesh && <ArchitecturalMesh positions={formationMesh.positions} indices={formationMesh.indices} wireframe />}
    {showConnections && faceBridges && faceBridges.lines.length > 0 && <FaceBridgeMeshView mesh={faceBridges} />}
    {connectionFinal && intersectionSpaces?.indices.length ? <ArchitecturalMesh positions={connectionPositions} indices={intersectionSpaces.indices} /> : null}
    {architecture && <ArchitecturalMesh positions={architecture.positions} indices={architecture.indices} />}
    {showUnifiedMesh && intersectionSpaces && <IntersectionSpaceMesh positions={intersectionSpaces.positions} normals={intersectionSpaces.normals} indices={intersectionSpaces.indices} />}
    {showAnalysis && !connectionFinal && !showFormation && <axesHelper args={[Math.max(0.3, maximumDimension * 0.16)]} />}
    <OrbitControls enablePan enableZoom enableRotate target={cameraTarget} />
  </Canvas>;
}

function Status({ valid, children }: { valid: boolean; children: React.ReactNode }) {
  return <span className="rounded border px-1.5 py-0.5 text-[9px]" style={{ borderColor: valid ? "#397a63" : "#955142", color: valid ? "#83e4bd" : "#ff9d87", background: valid ? "#10251e" : "#291612" }}>{children}</span>;
}

function renderFinalView(mesh: AmphitheaterVariation["continuousMesh"], view: PrototypeView, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setClearColor(EXPORT_BACKGROUND, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(EXPORT_BACKGROUND);
  scene.add(new THREE.AmbientLight("#ffffff", 0.72));
  const sun = new THREE.DirectionalLight("#ffffff", 1.25);
  sun.position.set(16, 24, 12);
  scene.add(sun);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  if (mesh.indices.length) geometry.setIndex(mesh.indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geometry, material));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, maxDimension * 24);
  const aspect = width / height;
  const margin = 1.22;
  const viewWidth = view === "plan" ? size.x : view === "section" ? size.x : maxDimension * 1.45;
  const viewHeight = view === "plan" ? size.z : view === "section" ? size.y : maxDimension * 1.2;
  let halfWidth = Math.max(viewWidth, 1) * margin / 2;
  let halfHeight = Math.max(viewHeight, 1) * margin / 2;
  if (halfWidth / halfHeight > aspect) halfHeight = halfWidth / aspect;
  else halfWidth = halfHeight * aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  if (view === "plan") {
    camera.up.set(0, 0, 1);
    camera.position.set(center.x, center.y + maxDimension * 4, center.z);
  } else if (view === "section") {
    camera.up.set(0, 1, 0);
    camera.position.set(center.x, center.y, center.z + maxDimension * 4);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(center.x + maxDimension, center.y + maxDimension * 0.72, center.z + maxDimension);
  }
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
  renderer.dispose();
  renderer.forceContextLoss();
  geometry.dispose();
  material.dispose();
  return snapshot;
}

const BOARD_SHEETS = {
  "11x22": { widthInches: 22, heightInches: 11, tag: "11x22", label: "11×22" },
  "12.5x33": { widthInches: 33, heightInches: 12.5, tag: "12.5x33", label: "12.5×33" },
} as const;

function exportBoard(variation: AmphitheaterVariation, descriptors: DescriptorSettings, sheet: (typeof BOARD_SHEETS)[keyof typeof BOARD_SHEETS]) {
  const pixelsPerInch = 100;
  const width = Math.round(sheet.widthInches * pixelsPerInch);
  const height = Math.round(sheet.heightInches * pixelsPerInch);
  const vertical = height / 1100;
  const textX = width * (70 / 2200);
  const gap = width / 40;
  const panelWidth = (width - gap * 4) / 3;
  const panelTop = 150 * vertical;
  const panelHeight = 760 * vertical;
  const panelStride = panelWidth + gap;
  const insetX = panelWidth * (20 / 660);
  const imageWidth = panelWidth - insetX * 2;
  const imageTop = panelTop + 70 * vertical;
  const imageHeight = panelHeight - 120 * vertical;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = EXPORT_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.fillStyle = EXPORT_GOLD;
  context.font = `bold ${44 * vertical}px Arial`;
  context.fillText(`${CATEGORY_DEFINITIONS[variation.category].name.toUpperCase()} / ${variation.typologyName.toUpperCase()} — ${modeLabels[variation.mode].toUpperCase()}`, textX, 70 * vertical);
  context.font = `${22 * vertical}px Arial`;
  context.fillStyle = EXPORT_REFERENCE_BLUE;
  context.fillText("Final architectural geometry · plan, isometric, and section · dimensions in feet", textX, 108 * vertical);
  const views: Array<[PrototypeView, string]> = [["plan", "Plan"], ["isometric", "Isometric"], ["section", "Section"]];
  const hasGeometry = variation.continuousMesh.positions.length > 0;
  views.forEach(([view, label], index) => {
    const left = gap + index * panelStride;
    context.strokeStyle = EXPORT_GOLD;
    context.lineWidth = 3 * vertical;
    context.strokeRect(left, panelTop, panelWidth, panelHeight);
    context.fillStyle = EXPORT_GOLD;
    context.font = `bold ${30 * vertical}px Arial`;
    context.fillText(label.toUpperCase(), left + panelWidth * (24 / 660), panelTop + 48 * vertical);
    if (hasGeometry) {
      const viewCanvas = renderFinalView(variation.continuousMesh, view, Math.max(1, Math.round(imageWidth)), Math.max(1, Math.round(imageHeight)));
      context.drawImage(viewCanvas, left + insetX, imageTop, imageWidth, imageHeight);
    } else {
      context.fillStyle = EXPORT_REFERENCE_BLUE;
      context.font = `${22 * vertical}px Arial`;
      context.fillText("No architectural geometry", left + panelWidth * (24 / 660), panelTop + 370 * vertical);
    }
  });
  const metrics = variation.measurements;
  context.fillStyle = EXPORT_REFERENCE_BLUE;
  context.font = `${22 * vertical}px Arial`;
  context.fillText(`Horizontal area: ${metrics.occupiedHorizontalArea.toFixed(1)} ft²    Interconnected void: ${metrics.interconnectedVoidVolume.toFixed(0)} ft³    Circulation: ${metrics.circulationConnectivity.toFixed(0)}%    Visibility: ${metrics.platformVisibility.toFixed(0)}%`, textX, 960 * vertical);
  context.fillStyle = variation.validation.valid ? "#7fe2b9" : "#ff947e";
  context.fillText(variation.validation.valid ? "TILE VALID" : "REVIEW REQUIRED", textX, 995 * vertical);
  context.fillStyle = EXPORT_REFERENCE_BLUE;
  context.font = `${18 * vertical}px Arial`;
  const priority = ["convergent", "sequential", "visuallyConnected", "circulationActivated", "verticallyIntegrated", "openVolume", "sculptural"] as const;
  context.fillText(`Descriptor targets: ${priority.map((key) => `${key} ${descriptors[key].intensity}`).join(" · ")}`, textX, 1040 * vertical);
  canvas.toBlob((blob) => { if (blob) download(`${variation.category}-${variation.typology}-${variation.mode}-${sheet.tag}-plan-iso-section.png`, blob, "image/png"); }, "image/png");
}

export default function PrototypeDemonstration({ selectionOnly = false, sourcePlacements, completeSourcePlacements, sourceLabel, sourceBounds, sourceThickness, sourceOptions, selectedSourceIndex, onSourceIndexChange, descriptors, selectedMode, onSelectedModeChange, selectedCategory, selectedTypology, onSelectedCategoryChange, onSelectedTypologyChange }: Props) {
  const [stage, setStage] = useState(0);
  const [view, setView] = useState<PrototypeView>("isometric");
  const [seed, setSeed] = useState(2041);
  const [continuityControls, setContinuityControls] = useState<ContinuityControls>({ ...DEFAULT_CONTINUITY_CONTROLS });
  const [variations, setVariations] = useState<VariationMap | null>(null);
  const [generatedRequest, setGeneratedRequest] = useState<GeneratedRequest | null>(null);
  const [aggregationCount, setAggregationCount] = useState<2 | 4 | 8>(2);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [preferred, setPreferred] = useState<PrototypeGeometryMode>(selectedMode);
  const [rationale, setRationale] = useState("");
  const [generationKey, setGenerationKey] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>("combined");
  const [requestedSourceScope, setSourceScope] = useState<"selection" | "complete">("selection");
  const [elevationComparison, setElevationComparison] = useState<AmphitheaterVariation | null>(null);
  const [prototypeReady, setPrototypeReady] = useState(false);
  const [faceBridges, setFaceBridges] = useState<FaceBridgeSettings>({ ...DEFAULT_FACE_BRIDGES });
  const pendingFinalRestore = useRef(false);
  const sourceScope = selectionOnly ? "selection" : requestedSourceScope;
  const activeSource = sourceScope === "complete" ? completeSourcePlacements : sourcePlacements;
  const activeSourceLabel = sourceScope === "complete" ? `Complete source arrangement · ${completeSourcePlacements.length} objects` : sourceLabel;
  const captureRef = useRef<(() => string) | null>(null);
  const currentKey = `${JSON.stringify(faceBridges)}:${selectedCategory}:${selectedTypology}:${activeSourceLabel}:${activeSource.length}:${activeSource.map((item) => `${item.cell.letter}:${item.x.toFixed(2)}:${item.y.toFixed(2)}:${item.z.toFixed(2)}:${item.rx.toFixed(1)}:${item.ry.toFixed(1)}:${item.rz.toFixed(1)}:${item.scale.toFixed(2)}`).join("|")}:${Object.values(descriptors).map((item) => `${item.intensity}:${item.importance}`).join("|")}:${Object.values(continuityControls).join(":")}`;
  const selected = variations ? variations[selectedMode] : null;
  const displaySource = generatedRequest?.source ?? activeSource;
  const displayThickness = generatedRequest?.thickness ?? sourceThickness;
  const faceBridgeMesh = useMemo(() => {
    if (stage !== 1 && stage !== 3 || !faceBridges.enabled || displaySource.length < 2) return null;
    return buildFaceBridges(displaySource.map((item) => ({
      letter: item.cell.letter,
      x: item.x,
      y: item.y,
      z: item.z,
      rx: item.rx,
      ry: item.ry,
      rz: item.rz,
      scale: item.scale,
      scaleX: item.scaleX ?? 1,
      scaleY: item.scaleY ?? 1,
      scaleZ: item.scaleZ ?? 1,
    })), displayThickness, typologyBridgeSettings(faceBridges, (TYPOLOGY_RULES.find(r=>r.id===selectedTypology)??TYPOLOGY_RULES[0]).behaviors));
  }, [stage, displaySource, displayThickness, faceBridges, selectedTypology]);
  const domainInventory = useMemo(() => {
    const summarize = (source: CompositionPlacement[]) => {
      const analysis = cachedAnalysis(source, true);
      const spans = (["x", "y", "z"] as const).map(axis => source.length ? Math.max(...source.map(p => p[axis])) - Math.min(...source.map(p => p[axis])) : 0);
      return { letters: source.length, voids: analysis.voids.length, relationships: analysis.relationships.length, spans };
    };
    return { complete: summarize(completeSourcePlacements), selected: summarize(sourcePlacements) };
  }, [completeSourcePlacements, sourcePlacements]);
  const aggregation = useMemo(() => selected ? buildAggregation(selected, aggregationCount) : undefined, [selected, aggregationCount]);
  const aggregateResults = useMemo(() => selected ? ([2, 4, 8] as const).map((count) => buildAggregation(selected, count)) : [], [selected]);
  const overlaps = useMemo(() => variations ? Object.fromEntries(modes.map((mode) => [mode, surfaceOverlap(variations.letters, variations[mode])])) as Record<PrototypeGeometryMode, number> : null, [variations]);
  const stale = generationKey !== "" && generationKey !== currentKey;
  const rawMinZ = displaySource.length ? Math.min(...displaySource.map((item) => item.z)) : 0;
  const rawMaxZ = displaySource.length ? Math.max(...displaySource.map((item) => item.z)) : 0;
  const elevationAdjustedSource = useMemo(() => {
    const shift = Math.max(1, (rawMaxZ - rawMinZ) * .3);
    return displaySource.map((placement, index) => index % 3 === 0 ? { ...placement, z: placement.z + shift } : placement);
  }, [displaySource, rawMinZ, rawMaxZ]);
  const [intersectionSpaces, setIntersectionSpaces] = useState<IntersectionSpaceMesh | null>(null);
  const [intersectionState, setIntersectionState] = useState<"idle" | "working" | "ready" | "empty" | "error">("idle");

  useEffect(() => {
    if (!generatedRequest) return;
    const controller = new AbortController();
    setIntersectionState("working");
    setIntersectionSpaces(null);
    const placements = generatedRequest.source.map((item) => ({
      letter: item.cell.letter,
      x: item.x,
      y: item.y,
      z: item.z,
      rx: item.rx,
      ry: item.ry,
      rz: item.rz,
      scale: item.scale,
      scaleX: item.scaleX ?? 1,
      scaleY: item.scaleY ?? 1,
      scaleZ: item.scaleZ ?? 1,
    }));
    fetch("/api/letter-intersections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceBridges: generatedRequest.faceBridges,
        typology: generatedRequest.typology,
        thickness: generatedRequest.thickness,
        placements,
        mode: selectedMode,
        behaviors: (TYPOLOGY_RULES.find((item) => item.id === generatedRequest.typology) ?? TYPOLOGY_RULES[0]).behaviors,
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<IntersectionSpaceMesh>;
    }).then((result) => {
      setIntersectionSpaces(result);
      setIntersectionState(result.indices.length ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setIntersectionSpaces(null);
      setIntersectionState("error");
    });
    return () => controller.abort();
  }, [generatedRequest, selectedMode]);

  useEffect(() => {
    const saved = readJson<PrototypeSession>(PROTOTYPE_SESSION_KEY);
    if (saved && Number.isFinite(saved.seed)) {
      setSeed(saved.seed);
      if (saved.continuityControls) setContinuityControls({ ...DEFAULT_CONTINUITY_CONTROLS, ...saved.continuityControls });
      if (saved.view === "plan" || saved.view === "section" || saved.view === "isometric") setView(saved.view);
      if (Number.isFinite(saved.stage)) {
        const schema = saved.stageSchema ?? 1;
        let migrated = saved.stage;
        if (schema < 2 && migrated >= 1) migrated += 1;
        if (schema < 3 && migrated >= 1) migrated += 1;
        if (schema < 4 && migrated >= 3) migrated += 1;
        setStage(Math.min(stages.length - 1, Math.max(0, migrated)));
      }
      if (saved.sourceScope === "complete" || saved.sourceScope === "selection") setSourceScope(saved.sourceScope);
      if (typeof saved.showAnalysis === "boolean") setShowAnalysis(saved.showAnalysis);
      if (typeof saved.showGrid === "boolean") setShowGrid(saved.showGrid);
      if (typeof saved.finishedOnly === "boolean") setFinishedOnly(saved.finishedOnly);
      if (saved.surfaceFilter) setSurfaceFilter(saved.surfaceFilter);
      if (saved.aggregationCount === 2 || saved.aggregationCount === 4 || saved.aggregationCount === 8) setAggregationCount(saved.aggregationCount);
      if (Array.isArray(saved.criteria)) setCriteria(saved.criteria);
      if (saved.preferred === "letters" || saved.preferred === "voids" || saved.preferred === "combined") setPreferred(saved.preferred);
      if (typeof saved.rationale === "string") setRationale(saved.rationale);
      if (saved.faceBridges) {
        const direction = saved.faceBridges.direction;
        const mode = saved.faceBridges.mode;
        setFaceBridges({
          ...DEFAULT_FACE_BRIDGES,
          ...saved.faceBridges,
          direction: direction === "x" || direction === "y" || direction === "z" || direction === "all" ? direction : "all",
          mode: mode === "same" || mode === "different" || mode === "all" ? mode : "all",
        });
      }
      pendingFinalRestore.current = saved.finalized === true;
    }
    setPrototypeReady(true);
  }, []);

  useEffect(() => {
    if (stage !== 12 || !generatedRequest) return;
    setElevationComparison(null);
    const timer = window.setTimeout(() => setElevationComparison(generateProtoArchitecture({ source: elevationAdjustedSource, descriptors: generatedRequest.descriptors, mode: selectedMode, category: generatedRequest.category, typology: generatedRequest.typology, seed: generatedRequest.seed, continuityControls: generatedRequest.continuityControls })), 30);
    return () => window.clearTimeout(timer);
  }, [stage, generatedRequest, elevationAdjustedSource, selectedMode]);

  const generateAll = useCallback(async () => {
    const request: GeneratedRequest = { faceBridges: {...faceBridges}, source: activeSource, thickness: sourceThickness, descriptors, category: selectedCategory, typology: selectedTypology, seed, continuityControls, key: currentKey };
    setGeneratedRequest(request);
    try {
      const built = {} as VariationMap;
      for (const mode of [selectedMode, ...modes.filter(mode => mode !== selectedMode)]) {
        setGenerating(modeLabels[mode]);
        await new Promise(resolve => window.setTimeout(resolve, 30));
        const sourceAnalysis = cachedAnalysis(request.source, ["contained-room-within-volume", "flat-deep-plan-plate", "vertical-void-lobby"].includes(request.typology));
        built[mode] = generateProtoArchitecture({ source: request.source, descriptors: request.descriptors, category: request.category, typology: request.typology, mode, seed: request.seed, continuityControls: request.continuityControls, sourceAnalysis });
      }
      setVariations(built);
      setGenerationKey(request.key);
      setStage(7);
    } finally { setGenerating(null); }
  }, [activeSource, sourceThickness, descriptors, selectedCategory, selectedTypology, selectedMode, seed, continuityControls, currentKey, faceBridges]);

  useEffect(() => {
    if (!prototypeReady) return;
    const payload: PrototypeSession = {
      seed, continuityControls, view, stage, stageSchema: STAGE_SCHEMA, sourceScope, showAnalysis, showGrid, finishedOnly,
      surfaceFilter, aggregationCount, criteria, preferred, rationale, faceBridges,
      finalized: pendingFinalRestore.current || selected?.quality === "final",
    };
    const timer = window.setTimeout(() => writeJson(PROTOTYPE_SESSION_KEY, payload), 300);
    return () => {
      window.clearTimeout(timer);
      writeJson(PROTOTYPE_SESSION_KEY, payload);
    };
  }, [prototypeReady, seed, continuityControls, view, stage, sourceScope, showAnalysis, showGrid, finishedOnly, surfaceFilter, aggregationCount, criteria, preferred, rationale, selected?.quality, faceBridges]);

  const regenerateMode = (mode: PrototypeGeometryMode) => {
    if (!generatedRequest || !variations) return;
    const nextSeed = generatedRequest.seed + modes.indexOf(mode) + 1;
    setVariations({ ...variations, [mode]: generateProtoArchitecture({ source: generatedRequest.source, descriptors: generatedRequest.descriptors, mode, category: generatedRequest.category, typology: generatedRequest.typology, seed: nextSeed, continuityControls: generatedRequest.continuityControls }) });
  };

  const exportCurrentPng = () => {
    const dataUrl = captureRef.current?.();
    if (!dataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${selectedCategory}-${selectedTypology}-${selectedMode}-${view}.png`;
    anchor.click();
  };

  const evaluationRecord = {
    sourceScope, activeSource, completeSource: completeSourcePlacements, sourceBounds, domainInventory,
    category: selectedCategory,
    typology: selectedTypology,
    typologyName: selected?.typologyName ?? TYPOLOGY_RULES.find((item) => item.id === selectedTypology)?.name ?? selectedTypology,
    source: selectedMode,
    units: "feet",
    lattice: { horizontal: [20, 20], verticalIncrement: VERTICAL_INCREMENT_FEET },
    seed,
    selectedMode,
    preferred,
    rationale,
    descriptors,
    criteria,
    variations,
    aggregations: Object.fromEntries(aggregateResults.map((result) => [result.count, result.validation])),
  };

  const addCriterion = () => setCriteria((current) => [...current, { id: `${Date.now()}`, name: "", value: 50, notes: "" }]);
  const updateCriterion = (id: string, update: Partial<Criterion>) => setCriteria((current) => current.map((criterion) => criterion.id === id ? { ...criterion, ...update } : criterion));
  const setContinuityValue = (key: keyof ContinuityControls, value: number) => setContinuityControls((current) => ({ ...current, [key]: value }));

  return <section id="prototype-demonstration" className="scroll-mt-4 rounded-xl border p-4" style={panelStyle}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">LUV — Proto-Architectural Generator</h2>
        <p className="text-[10px] uppercase tracking-[0.13em]" style={{ color: "var(--muted)" }}>Reusable 20′ × 20′ spatial tile · vertical registration every 20′</p>
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--accent-gold)" }}>{CATEGORY_DEFINITIONS[selectedCategory].name} / {TYPOLOGY_RULES.find((item) => item.id === selectedTypology)?.name} / {modeLabels[selectedMode]}</p>
        <p className="mt-1 text-[10px]" style={{ color: "var(--accent-pale)" }}><strong>Current prototype source:</strong> {activeSourceLabel}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted)" }}>Extent
          <select disabled={selectionOnly} aria-label="Prototype source extent" value={sourceScope} onChange={(event) => setSourceScope(event.target.value as "selection" | "complete")} className="rounded border px-2 py-1" style={inputStyle}><option value="selection">Selected 3D Region</option><option value="complete">Full Source Field</option></select>
        </label>
        {sourceScope === "selection" && sourceOptions.length > 0 && <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted)" }}>Source
          <select aria-label="Prototype source alternative" value={selectedSourceIndex} onChange={(event) => onSourceIndexChange(Number(event.target.value))} className="max-w-[280px] rounded border px-2 py-1" style={inputStyle}>
            {sourceOptions.map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
          </select>
        </label>}
        <button type="button" onClick={() => setShowAnalysis((value) => !value)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: showAnalysis ? "var(--accent)" : "var(--line)" }}>{showAnalysis ? "Analysis colors on" : "White model"}</button>
        <button type="button" onClick={() => setShowGrid((value) => !value)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: showGrid ? "var(--accent)" : "var(--line)" }}>{showGrid ? "Grid on" : "Grid hidden"}</button>
        <button type="button" onClick={() => setFinishedOnly((value) => !value)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: finishedOnly ? "var(--accent)" : "var(--line)" }}>{finishedOnly ? "Finished Geometry" : "Construction Geometry"}</button>
        <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted)" }}>Seed <input type="number" min={1} max={200} value={seed} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next <= 200) setSeed(next); }} className="w-20 rounded border px-2 py-1 text-right" style={inputStyle} /></label>
        <button type="button" disabled={Boolean(generating)} onClick={generateAll} className="rounded px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-60" style={{ background: "var(--accent-primary)" }}>{generating ? `Finalizing ${generating}…` : "Generate Architectural Space"}</button>
      </div>
    </div>
    <div className="mt-3 grid gap-2 rounded-lg border p-3 md:grid-cols-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <label className="text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Category<select aria-label="Architectural category" value={selectedCategory} onChange={(event) => onSelectedCategoryChange(event.target.value as PrototypeCategory)} className="mt-1 block w-full rounded border px-2 py-1.5 text-[11px] normal-case" style={inputStyle}>{(["gathering", "office", "lobby"] as PrototypeCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_DEFINITIONS[category].name}</option>)}</select></label>
      <label className="text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Typology<select aria-label="Architectural typology" value={selectedTypology} onChange={(event) => onSelectedTypologyChange(event.target.value as PrototypeTypologyId)} className="mt-1 block w-full rounded border px-2 py-1.5 text-[11px] normal-case" style={inputStyle}>{TYPOLOGY_RULES.filter((item) => item.category === selectedCategory).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Source<select aria-label="Architectural source" value={selectedMode} onChange={(event) => onSelectedModeChange(event.target.value as PrototypeGeometryMode)} className="mt-1 block w-full rounded border px-2 py-1.5 text-[11px] normal-case" style={inputStyle}>{modes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
    </div>
    {!selected && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "#9b7634", color: "#ffd38a", background: "#2b2415" }}>No architectural space is built yet. Numbers in the parametric spatial optimizer can change without rebuilding it. Press Generate Architectural Space when you want it built from <strong>{activeSourceLabel}</strong>.</p>}
    {selected && stale && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "#9b7634", color: "#ffd38a", background: "#2b2415" }}>The optimizer numbers have changed. This space stays as last generated until you press Generate Architectural Space.</p>}
    {selected?.quality === "preview" && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "#9b7634", color: "#ffd38a", background: "#2b2415" }}>Interactive boundary preview. Connectivity and export-quality reconstruction are pending. Click Generate Architectural Space to finalize <strong>{activeSourceLabel}</strong>.</p>}
    <div className="mt-3 rounded border p-3 text-[10px]" style={panelStyle}>
      <strong>Source domain utilization — {sourceScope === "complete" ? "Full Source Field" : "Selected 3D Region"}</strong>
      <p>Selected box: {sourceBounds.width.toFixed(2)} × {sourceBounds.height.toFixed(2)} × {sourceBounds.depth.toFixed(2)} source units. Extents below are letter-center spans; architectural extents are feet.</p>
      {Object.entries(domainInventory).map(([label, value]) => <p key={label}>{label}: {value.letters} letters · {value.voids} extracted negative-space regions · {value.relationships} relationships · XYZ {value.spans.map(v=>v.toFixed(2)).join(" × ")} source units</p>)}
      {selected?.domainDiagnostic && <><p>{selected.domainDiagnostic.organization}</p><p>Locally assigned regions {selected.domainDiagnostic.componentsUsed}/{selected.domainDiagnostic.componentsAvailable} · assigned relationships {selected.domainDiagnostic.relationshipsUsed}/{selected.domainDiagnostic.relationshipsAvailable} · assigned letters {selected.domainDiagnostic.lettersAssigned}/{selected.domainDiagnostic.lettersAvailable} · assigned voids {selected.domainDiagnostic.voidsAssigned}/{selected.domainDiagnostic.voidsAvailable}</p><p>Elements with source provenance {selected.domainDiagnostic.provenanceElements} · generic / tile fallback elements {selected.domainDiagnostic.fallbackElements}. Whole-field envelope influence is recorded separately and excluded from local coverage.</p><p>Normalized active XYZ {selected.domainDiagnostic.source.map(v=>v.toFixed(2)).join(" × ")} ft · raw XYZ {selected.domainDiagnostic.raw.map(v=>v.toFixed(2)).join(" × ")} ft · {selected.quality} XYZ {selected.domainDiagnostic.final.map(v=>v.toFixed(2)).join(" × ")} ft</p></>}
      <p>Void extraction is an approximate mesh-clearance analysis. Region counts are extracted components, not a count of all possible empty spaces. Geometric checks require separate visual review.</p>
      {selected?.validation.failures.filter(message=>message.includes("UNSUPPORTED SOURCE")).map(message=><p key={message} role="alert" className="text-[#ff9d87]">{message}</p>)}
    </div>
    <div className="mt-2 grid gap-2 rounded-lg border p-3 text-[9px] md:grid-cols-2 xl:grid-cols-4" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Category description</strong><p className="mt-1" style={{ color: "var(--muted)" }}>{CATEGORY_DEFINITIONS[selectedCategory].description}</p><p className="mt-1">{CATEGORY_DEFINITIONS[selectedCategory].purpose}</p></div>
      <div><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Typology description</strong><p className="mt-1">{TYPOLOGY_RULES.find((item) => item.id === selectedTypology)?.description}</p></div>
      <div><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Active descriptors</strong><p className="mt-1">{DESCRIPTORS.filter((item) => descriptors[item.id].importance > 0).map((item) => `${item.name} ${descriptors[item.id].intensity}`).join(" · ") || "None"}</p></div>
      <div><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Key generation behaviors</strong><p className="mt-1">{selected ? Object.entries(selected.behaviors).filter(([, value]) => value >= .65).map(([key, value]) => `${key.replace(/([A-Z])/g, " $1")} ${Math.round(value * 100)}%`).join(" · ") : "Available after Generate Architectural Space."}</p></div>
    </div>
    {selected && <div className="mt-2 rounded-lg border p-3 text-[9px]" style={{ borderColor: "var(--panel-border)", background: "var(--input-background)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Typology execution debug</strong><span>{CATEGORY_DEFINITIONS[selected.category].name} / {selected.typologyName} / {modeLabels[selected.mode]}</span></div>
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <p><strong>Primary organizer</strong><br />{selected.typologyDebug.recipe.primary.join(" + ") || "None"}</p>
        <p><strong>Secondary operations</strong><br />{selected.typologyDebug.recipe.secondary.join(" · ") || "None"}</p>
        <p><strong>Optional operations</strong><br />{selected.typologyDebug.recipe.optional.join(" · ") || "None"}</p>
        <p><strong>Disabled operations</strong><br />{selected.typologyDebug.recipe.disabled.join(" · ") || "None"}</p>
      </div>
      <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--panel-border)" }}><strong className="uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Raw topology before connectors and SDF</strong></div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <span>Terrace active<br /><strong style={{ color: selected.typologyDebug.terraceActive ? "var(--accent-gold)" : "#83e4bd" }}>{selected.typologyDebug.terraceActive ? "Yes" : "No"}</strong></span>
        <span>Occupied regions<br /><strong>{selected.typologyDebug.principalOccupiedRegions}</strong></span>
        <span>Principal voids<br /><strong>{selected.typologyDebug.principalVoids}</strong></span>
        <span>Discrete plates<br /><strong>{selected.typologyDebug.discreteFloorPlates}</strong></span>
        <span>Continuous surfaces<br /><strong>{selected.typologyDebug.continuousSurfaces}</strong></span>
        <span>Circulation paths<br /><strong>{selected.typologyDebug.primaryCirculationPaths}</strong></span>
        <span>Connected components<br /><strong>{selected.quality === "preview" ? "Pending final mesh" : selected.typologyDebug.connectedComponents}</strong></span>
      </div>
      <p className="mt-2 border-t pt-2" style={{ borderColor: "var(--panel-border)", color: "var(--muted)" }}><strong style={{ color: "var(--text-primary)" }}>Typology-specific elements</strong><br />{selected.typologyDebug.rawTopology.typologySpecificElements.join(" · ") || "None"}</p>
    </div>}
    {selected?.fullFormDiagnostic && <div className="mt-2 rounded-lg border p-3 text-[9px]" style={{ borderColor: "var(--accent-gold)", background: "var(--input-background)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="uppercase tracking-wide" style={{ color: "var(--accent-gold)" }}>O3 full-form source diagnostic</strong><span>{selected.fullFormDiagnostic.volumetricRepresentation}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <span>Components before union<br /><strong>{selected.fullFormDiagnostic.sourceComponentsBeforeUnion}</strong></span>
        <span>After overlap union<br /><strong>{selected.fullFormDiagnostic.sourceComponentsAfterUnion}</strong></span>
        <span>Disconnected source groups<br /><strong>{selected.fullFormDiagnostic.disconnectedSourceGroups}</strong></span>
        <span>Graph edges<br /><strong>{selected.fullFormDiagnostic.relationshipGraphEdges}</strong></span>
        <span>Architectural connectors<br /><strong>{selected.fullFormDiagnostic.architecturalConnectors}</strong></span>
        <span>Final mesh components<br /><strong>{selected.quality === "preview" ? "Pending" : selected.fullFormDiagnostic.finalMeshComponents}</strong></span>
        <span>Source XYZ<br /><strong>{selected.fullFormDiagnostic.sourceExtent.map(value=>value.toFixed(2)).join(" × ")} ft</strong></span>
        <span>Architecture XYZ<br /><strong>{selected.fullFormDiagnostic.architectureExtent.map(value=>value.toFixed(2)).join(" × ")} ft</strong></span>
        <span>Continuous circulation<br /><strong>{selected.fullFormDiagnostic.continuousCirculation ? "Yes" : "No"}</strong></span>
        <span>Full volumetric source<br /><strong>{selected.fullFormDiagnostic.fullVolumetricSourceUsed ? "Used" : "Missing"}</strong></span>
        <span>Graph role<br /><strong>{selected.fullFormDiagnostic.graphUsedAsSecondaryOrganizer ? "Secondary" : "Primary"}</strong></span>
      </div>
      <p className="mt-2 border-t pt-2" style={{ borderColor: "#51451f", color: "var(--muted)" }}><strong style={{ color: "#f3e7bd" }}>Pipeline comparison</strong><br />{selected.fullFormDiagnostic.pipelineStages.map((label,index)=>`${index+1}. ${label}`).join(" → ")}</p>
    </div>}

    <div className="mt-3 grid grid-cols-2 gap-1 md:grid-cols-4 xl:grid-cols-7">
      {stages.map((label, index) => <button key={label} type="button" onClick={() => setStage(index)} className="rounded border px-2 py-2 text-left text-[9px]" style={{ borderColor: stage === index ? "var(--accent)" : "var(--line)", background: stage === index ? "var(--accent-dark)" : "var(--input-background)", color: stage === index ? "var(--accent-pale)" : "var(--muted)" }}><span className="mr-1 tabular-nums">{index + 1}.</span>{label}</button>)}
    </div>

    <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[9px] uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Face-to-face bridges</strong>
        <span className="text-[9px]" style={{ color: "var(--muted)" }}>XY grid perimeter bridges</span>
        <button type="button" onClick={() => setFaceBridges((current) => ({ ...current, enabled: !current.enabled }))} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: faceBridges.enabled ? "var(--accent)" : "var(--line)", color: faceBridges.enabled ? "var(--accent-pale)" : "var(--muted)" }}>{faceBridges.enabled ? "Bridges on" : "Bridges off"}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="mr-1 self-center text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Direction</span>
        {(["all", "x", "y", "z"] as FaceBridgeDirection[]).map((direction) => <button key={direction} type="button" onClick={() => setFaceBridges((current) => ({ ...current, direction }))} className="rounded border px-2 py-1 text-[10px] uppercase" style={{ borderColor: faceBridges.direction === direction ? "var(--accent)" : "var(--line)", color: faceBridges.direction === direction ? "var(--accent-pale)" : "var(--muted)" }}>{direction}</button>)}
        <span className="ml-2 mr-1 self-center text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Letters</span>
        {([["all", "All"], ["same", "Same"], ["different", "Different"]] as Array<[FaceBridgeMode, string]>).map(([mode, label]) => <button key={mode} type="button" onClick={() => setFaceBridges((current) => ({ ...current, mode }))} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: faceBridges.mode === mode ? "var(--accent)" : "var(--line)", color: faceBridges.mode === mode ? "var(--accent-pale)" : "var(--muted)" }}>{label}</button>)}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {([
          ["gridDivisions", "Face grid divisions", 2, 8, 1, ""],
          ["maxDistance", "Maximum bridge distance", 0.05, 6, 0.05, ""],
          ["width", "Bridge middle width", 15, 100, 1, "%"],
          ["thickness", "Bridge middle thickness", 15, 100, 1, "%"],
          ["curvature", "Waist contraction", 0, 100, 1, "%"],
          ["smoothness", "Shoulder softness", 0, 100, 1, "%"],
          ["maxConnections", "Maximum neighboring letters", 1, 8, 1, ""],
        ] as const).map(([key, label, minimum, maximum, stepValue, suffix]) => <label key={key} className="grid grid-cols-[1fr_72px] items-center gap-2 text-[9px]" style={{ color: "var(--muted)" }}>
          <span>{label}<input aria-label={label} type="range" min={minimum} max={maximum} step={stepValue} value={faceBridges[key]} onChange={(event) => setFaceBridges((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1 block w-full" /></span>
          <span className="text-right tabular-nums" style={{ color: "var(--text-primary)" }}>{Number(faceBridges[key]).toFixed(stepValue < 1 ? 2 : 0)}{suffix}</span>
        </label>)}
      </div>
    </div>

    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1">
        {modes.map((mode) => <button key={mode} type="button" onClick={() => onSelectedModeChange(mode)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: selectedMode === mode ? "var(--accent)" : "var(--line)", color: selectedMode === mode ? "var(--accent-pale)" : "var(--muted)", background: selectedMode === mode ? "var(--accent-dark)" : "transparent" }}>{modeLabels[mode]}</button>)}
      </div>
      <div className="flex gap-1">{(["isometric", "plan", "section"] as PrototypeView[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className="rounded border px-2 py-1 text-[10px] capitalize" style={{ borderColor: view === item ? "var(--accent-gold)" : "var(--line)", color: view === item ? "var(--accent-gold)" : "var(--muted)" }}>{item}</button>)}</div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <strong className="mr-1 text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Surface display</strong>
      {(["horizontal", "circulation", "vertical", "void", "combined"] as SurfaceFilter[]).map((item) => <button key={item} type="button" onClick={() => setSurfaceFilter(item)} className="rounded border px-2 py-1 text-[9px] capitalize" style={{ borderColor: surfaceFilter === item ? "var(--accent)" : "var(--line)", color: surfaceFilter === item ? "var(--accent-pale)" : "var(--muted)" }}>{item === "horizontal" ? "Horizontal surfaces" : item === "circulation" ? "Circulation connections" : item === "vertical" ? "Vertical surfaces" : item === "void" ? "Preserved voids" : "Combined finished geometry"}</button>)}
    </div>

    <div className="mt-2 grid gap-2 rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      {([
        ["smoothness", "Surface smoothness", 0, 100, 1, "%"],
        ["blendingStrength", "Blending strength", 0, 100, 1, "%"],
        ["connectionDistance", "Connection distance", .5, 8, .1, " ft"],
        ["curvatureIntensity", "Curvature intensity", 0, 100, 1, "%"],
        ["preservation", "Flat platform retention", 0, 100, 1, "%"],
        ["minimumOpening", "Minimum opening", .5, 8, .1, " ft"],
        ["verticalIntegration", "Vertical Integration", 0, 100, 1, "%"],
        ["interlevelContinuity", "Interlevel Surface Continuity", 0, 100, 1, "%"],
        ["elevationPreservation", "Original Elevation Preservation", 0, 100, 1, "%"],
        ["organicInfluence", "Organic Influence", 0, 100, 1, "%"],
        ["boundaryCurvature", "Boundary Curvature", 0, 100, 1, "%"],
        ["blendRadius", "Blend Radius", 0, 100, 1, "%"],
        ["surfaceRelaxation", "Surface Relaxation", 0, 100, 1, "%"],
        ["branchingInfluence", "Branching Influence", 0, 100, 1, "%"],
        ["sourcePreservation", "Source Preservation", 0, 100, 1, "%"],
      ] as const).map(([key, label, minimum, maximum, stepValue, suffix]) => <label key={key} className="grid grid-cols-[1fr_80px] items-center gap-2 text-[9px]" style={{ color: "var(--muted)" }}>
        <span>{label}<input aria-label={label} type="range" min={minimum} max={maximum} step={stepValue} value={continuityControls[key]} onChange={(event) => setContinuityValue(key, Number(event.target.value))} className="mt-1 block w-full" /></span>
        <span className="text-right tabular-nums" style={{ color: "var(--text-primary)" }}>{continuityControls[key].toFixed(stepValue < 1 ? 1 : 0)}{suffix}</span>
      </label>)}
    </div>

    {stage !== 7 && <>
    <div className="mt-2 overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><strong className="text-[10px]">Vertical extent diagnostic</strong><span className="text-[9px]" style={{ color: "var(--muted)" }}>Selected input bbox Z {rawMinZ.toFixed(2)}–{rawMaxZ.toFixed(2)} · extent {(rawMaxZ - rawMinZ).toFixed(2)} source units</span></div>
      <table className="w-full min-w-[520px] text-[9px]"><thead><tr className="text-left" style={{ color: "var(--muted)" }}><th>Stage</th><th>Minimum Z</th><th>Maximum Z</th><th>Vertical extent</th></tr></thead><tbody>{selected && (["source", "extracted", "initial", "final"] as const).map((key) => <tr key={key} className="border-t" style={{ borderColor: "var(--panel-border)" }}><td className="py-1 capitalize">{key === "source" ? "Normalized 3D source" : key === "extracted" ? "Whole-letter solids" : key === "initial" ? "Initial surfaces" : "Final architectural mesh"}</td><td>{selected.verticalExtents[key].minZ.toFixed(2)} ft</td><td>{selected.verticalExtents[key].maxZ.toFixed(2)} ft</td><td>{selected.verticalExtents[key].extent.toFixed(2)} ft</td></tr>)}</tbody></table>
    </div>

    <div className="mt-2 overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div className="mb-1"><strong className="text-[10px]">Architectural surface diagnostic</strong><p className="text-[9px]" style={{ color: "var(--muted)" }}>Horizontal floors, circulation, enclosure surfaces and preserved voids are classified before reconstruction.</p></div>
      <table className="w-full min-w-[680px] text-[9px]"><thead><tr className="text-left" style={{ color: "var(--muted)" }}><th>Stage</th><th>Horizontal floor</th><th>Circulation</th><th>Vertical surface</th><th>Void volume</th><th>Vertical / horizontal</th><th>Status</th></tr></thead><tbody>{selected && (["initial", "classified", "final"] as const).map((key) => { const diagnostic = selected.surfaceDiagnostics[key]; return <tr key={key} className="border-t" style={{ borderColor: "var(--panel-border)" }}><td className="py-1 capitalize">{key === "classified" ? "Classified architectural elements" : key === "final" ? "Final reconstructed mesh" : "Initial surfaces"}</td><td>{diagnostic.horizontalArea.toFixed(1)} ft²</td><td>{diagnostic.circulationArea.toFixed(1)} ft²</td><td>{diagnostic.verticalArea.toFixed(1)} ft²</td><td>{diagnostic.voidVolume.toFixed(1)} ft³</td><td>{diagnostic.verticalToHorizontalRatio.toFixed(2)}</td><td style={{ color: diagnostic.warning ? "#ff9d87" : "#83e4bd" }}>{diagnostic.warning ?? "Balanced"}</td></tr>; })}</tbody></table>
    </div>

    {selected && <div className="mt-2 overflow-auto rounded-lg border p-2" style={{ borderColor: selected.connectivity.componentsAfter === 1 ? "#397a63" : "#955142", background: "var(--input-background)" }}>
      <div className="mb-1"><strong className="text-[10px]">Connection-generation diagnostic</strong><p className="text-[9px]" style={{ color: "var(--muted)" }}>A scored adjacency graph is converted to required ramps, bridges, landings and circulation bands before the final SDF reconstruction.</p></div>
      <div className="grid min-w-[560px] grid-cols-4 gap-2 text-[9px]">
        <span>Components before<br /><strong className="text-sm">{selected.connectivity.componentsBefore}</strong></span>
        <span>Proposed graph edges<br /><strong className="text-sm">{selected.connectivity.proposedConnections}</strong></span>
        <span>Connector elements<br /><strong className="text-sm">{selected.connectivity.generatedConnectors}</strong></span>
        <span>Components after<br /><strong className="text-sm" style={{ color: selected.connectivity.componentsAfter === 1 ? "#83e4bd" : "#ff9d87" }}>{selected.quality === "preview" ? "Pending" : selected.connectivity.componentsAfter}</strong></span>
      </div>
      {selected.continuousMesh.componentBounds.length > 1 && <p className="mt-2 text-[9px]" style={{ color: "var(--muted)" }}>Retained component bounds: {selected.continuousMesh.componentBounds.map((component, index) => `#${index + 1} ${component.triangles} tris · Z ${component.min[1].toFixed(1)}–${component.max[1].toFixed(1)} ft`).join("; ")}</p>}
    </div>}

    {selected && <div className="mt-2 overflow-auto rounded-lg border p-2" style={{ borderColor: selected.architecturalValidation.valid ? "#397a63" : "#955142", background: "var(--input-background)" }}>
      <div className="mb-1 flex items-center justify-between"><div><strong className="text-[10px]">Architectural geometry checks — visual review required</strong><p className="text-[9px]" style={{ color: "var(--muted)" }}>These are geometric proxies, not proof of architectural legibility, accessible circulation, headroom, or structural adequacy. Inspect plan, section and isometric views.</p></div><Status valid={selected.architecturalValidation.valid}>{selected.quality === "preview" ? "Pending final mesh" : `${selected.architecturalValidation.score}/100 proxies`}</Status></div>
      <table className="w-full min-w-[720px] text-[9px]"><thead><tr className="text-left" style={{ color: "var(--muted)" }}><th>Primary occupied space</th><th>Typology criterion</th><th>Interconnected circulation</th><th>Usable horizontal surfaces</th><th>Preserved open space</th></tr></thead><tbody><tr className="border-t" style={{ borderColor: "var(--panel-border)" }}>
        <td className="py-1" style={{ color: selected.architecturalValidation.gatheringSpace.passed ? "#83e4bd" : "#ff9d87" }}>{selected.architecturalValidation.gatheringSpace.area.toFixed(1)} ft² · {selected.architecturalValidation.gatheringSpace.passed ? "pass" : "review"}</td>
        <td style={{ color: selected.architecturalValidation.typologyCriterion.passed ? "#83e4bd" : "#ff9d87" }}>{selected.architecturalValidation.typologyCriterion.label}: {selected.architecturalValidation.typologyCriterion.value.toFixed(1)} {selected.architecturalValidation.typologyCriterion.unit} · {selected.architecturalValidation.typologyCriterion.passed ? "pass" : "review"}</td>
        <td style={{ color: selected.architecturalValidation.circulation.passed ? "#83e4bd" : "#ff9d87" }}>{selected.architecturalValidation.circulation.coverage.toFixed(0)}% · {selected.architecturalValidation.circulation.passed ? "pass" : "review"}</td>
        <td style={{ color: selected.architecturalValidation.usableHorizontalSurfaces.passed ? "#83e4bd" : "#ff9d87" }}>{selected.architecturalValidation.usableHorizontalSurfaces.area.toFixed(1)} ft² · {selected.architecturalValidation.usableHorizontalSurfaces.passed ? "pass" : "review"}</td>
        <td style={{ color: selected.architecturalValidation.preservedOpenSpaces.passed ? "#83e4bd" : "#ff9d87" }}>{selected.architecturalValidation.preservedOpenSpaces.area.toFixed(1)} ft² · {selected.architecturalValidation.preservedOpenSpaces.passed ? "pass" : "review"}</td>
      </tr></tbody></table>
      {selected.architecturalValidation.failures.map((failure) => <p key={failure} className="mt-1 text-[9px] text-[#ff9d87]">• {failure}</p>)}
    </div>}

    </>}
    {stage === 10 ? <div className="mt-3 grid gap-3 lg:grid-cols-3">{[
      { label: "1. Horizontal occupied surfaces", filter: "horizontal" as SurfaceFilter, note: "Usable floor plates and stepped terrace bands at source-derived elevations." },
      { label: "2. Interlevel circulation", filter: "circulation" as SurfaceFilter, note: "Localized ramps, bridges and landings connect compatible levels." },
      { label: "3. Necessary vertical surfaces", filter: "vertical" as SurfaceFilter, note: "Short enclosure segments are retained only where they serve a clear edge or structural role." },
      { label: "4. Preserved architectural voids", filter: "void" as SurfaceFilter, note: "Subtractive volumes remain open through the occupied platform system." },
      { label: "5. Combined architectural configuration", filter: "combined" as SurfaceFilter, note: "Finished reconstruction preserves multilevel floors, circulation and open gathering space." },
    ].map((item) => <article key={item.label} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div className="px-3 py-2"><strong className="text-xs">{item.label}</strong></div>
      <div className="h-64"><PrototypeViewport variation={selected ?? undefined} source={displaySource} sourceThickness={displayThickness} intersectionSpaces={intersectionSpaces} stage={4} view={view} showAnalysis showGrid finishedOnly surfaceFilter={item.filter} showSourceLetters={intersectionState === "empty" || intersectionState === "error"} /></div>
      <p className="border-t px-3 py-2 text-[9px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>{item.note}</p>
    </article>)}</div> : stage === 11 && selected ? <div className="mt-3 grid gap-3 lg:grid-cols-2">{[
      { label: "1. Disconnected source-derived components", diagnostic: "components" as const, finished: false, note: `${selected.connectivity.componentsBefore} source-derived components before global circulation is generated.` },
      { label: "2. Proposed connection graph", diagnostic: "graph" as const, finished: false, note: `${selected.connectivity.proposedConnections} scored edges selected from plan proximity, elevation difference, visibility and source circulation relationships.` },
      { label: "3. Generated architectural connectors", diagnostic: "connectors" as const, finished: false, note: `${selected.connectivity.generatedConnectors} ramps, bridges, landings and circulation bands generated before reconstruction.` },
      { label: "4. Final connected architectural mesh", diagnostic: "final" as const, finished: true, note: `${selected.connectivity.componentsBefore} components before connection generation; ${selected.connectivity.componentsAfter} after final reconstruction.` },
    ].map((item) => <article key={item.label} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <div className="px-3 py-2"><strong className="text-xs">{item.label}</strong></div>
      <div className="h-72"><PrototypeViewport variation={selected ?? undefined} source={displaySource} sourceThickness={displayThickness} intersectionSpaces={intersectionSpaces} stage={4} view={view} showAnalysis={item.finished ? false : showAnalysis} showGrid={showGrid} finishedOnly={item.finished} connectionDiagnostic={item.diagnostic} showSourceLetters={intersectionState === "empty" || intersectionState === "error"} /></div>
      <p className="border-t px-3 py-2 text-[9px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>{item.note}</p>
    </article>)}</div> : stage === 12 && selected ? <div className="mt-3 grid gap-3 lg:grid-cols-2">
      {[{ label: "Original source elevations", variation: selected, source: displaySource }, { label: "Modified source elevations", variation: elevationComparison, source: elevationAdjustedSource }].map((item) => <article key={item.label} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}><div className="px-3 py-2"><strong className="text-xs">{item.label}</strong></div><div className="h-80">{item.variation ? <PrototypeViewport variation={item.variation} source={item.source} sourceThickness={displayThickness} intersectionSpaces={item.source === displaySource ? intersectionSpaces : null} stage={4} view={view} showAnalysis showGrid finishedOnly /> : <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--muted)" }}>Computing elevation response…</div>}</div>{item.variation && <p className="border-t px-3 py-2 text-[9px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>Source {item.variation.verticalExtents.source.minZ.toFixed(2)}–{item.variation.verticalExtents.source.maxZ.toFixed(2)} ft · final {item.variation.verticalExtents.final.minZ.toFixed(2)}–{item.variation.verticalExtents.final.maxZ.toFixed(2)} ft · seed {generatedRequest?.seed ?? seed}</p>}</article>)}
      <p className="rounded border px-3 py-2 text-[10px] lg:col-span-2" style={{ borderColor: "var(--accent-secondary)", color: "var(--accent-pale)", background: "var(--panel-background)" }}>The comparison changes only every third source object’s Z position. Geometry mode, descriptors, controls, and random seed remain identical.</p>
    </div> : stage === 13 && variations ? <div className="mt-3 space-y-3">{modes.map((mode) => {
      const variation = variations[mode];
      return <article key={mode} className="overflow-hidden rounded-xl border" style={{ borderColor: preferred === mode ? "var(--accent-gold)" : "var(--line)", background: "var(--input-background)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><strong className="text-xs">{variation.name}</strong><div className="flex gap-1"><Status valid={variation.connectivity.componentsAfter === 1}>Geometry: {variation.connectivity.componentsBefore} → {variation.connectivity.componentsAfter}</Status><Status valid={variation.architecturalValidation.valid}>Architecture: {variation.architecturalValidation.score}/100</Status></div></div>
        <div className="grid lg:grid-cols-3">{(["isometric", "plan", "section"] as const).map((comparisonView) => <div key={comparisonView} className="border-t lg:border-r" style={{ borderColor: "var(--line)" }}><div className="px-2 py-1 text-[9px] font-medium capitalize">{comparisonView}</div><div className="h-56"><PrototypeViewport variation={variation} source={displaySource} sourceThickness={displayThickness} intersectionSpaces={intersectionSpaces} stage={4} view={comparisonView} showAnalysis={showAnalysis} showGrid={showGrid} finishedOnly presentationOnly /></div></div>)}</div>
        <p className="border-t px-3 py-2 text-[9px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>{variation.method}</p>
        <div className="grid grid-cols-2 gap-1 border-t p-2 text-[9px] md:grid-cols-5" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          <span>Primary space {variation.architecturalValidation.gatheringSpace.area.toFixed(1)} ft²</span><span>{variation.architecturalValidation.typologyCriterion.label} {variation.architecturalValidation.typologyCriterion.value.toFixed(1)} {variation.architecturalValidation.typologyCriterion.unit}</span>
          <span>Circulation {variation.architecturalValidation.circulation.coverage.toFixed(0)}%</span><span>Horizontal {variation.architecturalValidation.usableHorizontalSurfaces.area.toFixed(1)} ft²</span><span>Open {variation.architecturalValidation.preservedOpenSpaces.area.toFixed(1)} ft²</span>
        </div>
        <div className="flex gap-1 p-2 pt-0"><button type="button" onClick={() => regenerateMode(mode)} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)" }}>Regenerate</button><button type="button" onClick={() => { setPreferred(mode); onSelectedModeChange(mode); }} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: preferred === mode ? "var(--accent-gold)" : "var(--line)" }}>Select</button></div>
      </article>;
    })}</div> : stage <= 9 ? <div className="mt-3 h-[520px] overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: EXPORT_BACKGROUND }}>
      <PrototypeViewport variation={selected ?? undefined} source={stage === 0 ? activeSource : displaySource} sourceBounds={sourceScope === "selection" ? sourceBounds : undefined} sourceThickness={stage === 0 ? sourceThickness : displayThickness} intersectionSpaces={intersectionSpaces} stage={stage} view={view} aggregation={stage === 9 ? aggregation : undefined} captureRef={captureRef} showAnalysis={showAnalysis} showGrid={showGrid} finishedOnly={finishedOnly} surfaceFilter={surfaceFilter} showSourceLetters={stage === 0 || stage === 1 || stage === 3 || (stage !== 2 && (intersectionState === "empty" || intersectionState === "error"))} faceBridges={faceBridgeMesh} />
    </div> : null}

    {stage === 0 && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--input-background)" }}><strong style={{ color: "var(--text-primary)" }}>Exact source view:</strong> This stage preserves the selected alternative’s XYZ positions, rotations, scale, thickness, and selection-box proportions. Only the camera framing changes to center the result.</p>}
    {stage === 1 && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--input-background)" }}><strong style={{ color: "var(--text-primary)" }}>Face-to-face bridges:</strong> {!faceBridges.enabled ? "Bridges are off. The letters stay separate." : displaySource.length < 2 ? "Add at least two letters to bridge." : faceBridgeMesh && faceBridgeMesh.count > 0 ? `${faceBridgeMesh.count} ${faceBridgeMesh.count === 1 ? "bridge runs" : "bridges run"} from points on one letter’s XY face to points on a neighboring XY face. The perimeter of each grid patch connects to the perimeter of an available patch on another letter. Shaded lofts join the patches, with broad attachments and a tapered waist. The surface follows each letter’s position, rotation, scale, and extrusion.` : "No opposing faces are close enough. Increase the maximum bridge distance, or switch direction and letter mode to All."}</p>}
    {stage === 2 && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--input-background)" }}><strong style={{ color: "var(--text-primary)" }}>Intersecting components:</strong> {selected?.continuousMesh.positions.length ? `The letters stay in their original positions, including where they overlap. The wireframe is that intersecting geometry after it is altered into the ${selected.typologyName}.` : "The letters stay in their original positions, including where they overlap. Press Generate Architectural Space to draw the altered space over them."}</p>}
    {stage === 3 && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--input-background)" }}><strong style={{ color: "var(--text-primary)" }}>Connections + intersecting components:</strong> {selected?.continuousMesh.positions.length ? "The connection points and lines are drawn with the intersecting-component wireframe." : "The connection points and lines are shown. Press Generate Architectural Space to add the intersecting-component wireframe."}</p>}
    {stage === 7 && <p className="mt-2 text-xs">{intersectionState === "idle" ? "Generate Architectural Space to build the white model from these connections." : intersectionState === "working" ? "Building typology-shaped spaces from the grid-perimeter bridges…" : intersectionState === "error" ? "The perimeter bridges could not be fused. Adjust the bridge settings and generate again." : intersectionState === "empty" ? "No compatible face connections were found. Increase bridge distance or change the letter arrangement." : `${intersectionSpaces?.pairs ?? 0} perimeter bridges shape this white model. Architectural space OBJ exports this geometry in source units. Other stages show the typology studies.`}</p>}
    {stage > 3 && stage !== 7 && <p className="mt-2 rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--input-background)" }}><strong style={{ color: "var(--text-primary)" }}>One architectural mesh:</strong> {selected?.continuousMesh.positions.length ? `Circulation follows the ${selected.typologyName} branch pattern. Branching changes how many routes are kept, how wide they run, and how they rise.` : intersectionState === "idle" ? "Press Generate Architectural Space to build it from the category, typology, source, and letter arrangement." : intersectionState === "working" ? `Building one ${modeLabels[selectedMode].toLowerCase()} mesh from each letter.` : intersectionState === "error" ? "The architectural mesh could not be calculated. The separate letters stay in their source positions." : intersectionState === "empty" ? "No connected space could be formed from these letters, so they stay separate." : selectedMode === "voids" ? `The space between the letters is one mesh, using ${intersectionSpaces?.pairs ?? 0} gaps. The letter solids are left out.` : selectedMode === "combined" ? `The letter solids and the spaces between them form one mesh, with ${intersectionSpaces?.pairs ?? 0} gaps joined to the letters.` : `Each letter keeps its shape, and ${intersectionSpaces?.pairs ?? 0} bridges join those surfaces into one mesh.`}</p>}

    {stage === 9 && <div className="mt-3">
      <div className="flex flex-wrap gap-1">{([2, 4, 8] as const).map((count) => <button key={count} type="button" onClick={() => setAggregationCount(count)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: aggregationCount === count ? "var(--accent)" : "var(--line)" }}>{count} tiles</button>)}</div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">{aggregateResults.map((result) => <div key={result.count} className="rounded border p-2 text-[10px]" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}><div className="flex justify-between"><strong>{result.count}-tile assembly</strong><Status valid={result.validation.valid}>{result.validation.valid ? "Passed" : "Failed"}</Status></div><p className="mt-1" style={{ color: "var(--muted)" }}>Floor continuity: {result.validation.floorContinuity ? "pass" : "fail"} · circulation: {result.validation.circulationContinuous ? "pass" : "fail"} · void alignment: {result.validation.voidsAligned ? "pass" : "fail"} · unintended intersections: {result.validation.unintendedIntersections}</p>{result.validation.failures.map((failure) => <p key={failure} className="mt-1 text-[#ff9d87]">{failure}</p>)}</div>)}</div>
    </div>}

    {stage === 14 && variations && overlaps && <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Computed measurements</h3><p className="text-[9px]" style={{ color: "var(--muted)" }}>Geometric proxies calculated by the prototype.</p></div></div>
        <div className="mt-2 overflow-auto"><table className="w-full text-[9px]"><thead><tr className="text-left" style={{ color: "var(--muted)" }}><th className="p-1">Mode</th><th className="p-1">Components</th><th className="p-1">Area ft²</th><th className="p-1">Void ft³</th><th className="p-1">Orientation</th><th className="p-1">Boundary vertices</th><th className="p-1">Paths ft</th><th className="p-1">Overlap vs Letters</th><th className="p-1">Circulation</th><th className="p-1">Visibility</th></tr></thead><tbody>{modes.map((mode) => { const item = variations[mode]; return <tr key={mode} className="border-t" style={{ borderColor: "var(--panel-border)" }}><td className="p-1 font-medium">{modeLabels[mode]}</td><td className="p-1">{item.measurements.connectedComponents}</td><td className="p-1">{item.measurements.occupiedHorizontalArea.toFixed(1)}</td><td className="p-1">{item.measurements.interconnectedVoidVolume.toFixed(0)}</td><td className="p-1">{item.measurements.principalOrientation.toFixed(1)}°</td><td className="p-1">{item.measurements.boundaryComplexity}</td><td className="p-1">{item.measurements.circulationPathLength.toFixed(1)}</td><td className="p-1">{overlaps[mode].toFixed(1)}%</td><td className="p-1">{item.measurements.circulationConnectivity.toFixed(1)}%</td><td className="p-1">{item.measurements.platformVisibility.toFixed(1)}%</td></tr>; })}</tbody></table></div>
      </section>
      <section className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Assignment evaluation criteria</h3><p className="text-[9px]" style={{ color: "var(--muted)" }}>Enter criteria from your existing Assignment 1 Part 3 matrix.</p></div><button type="button" onClick={addCriterion} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)" }}>Add criterion</button></div>
        {criteria.length === 0 ? <p className="mt-3 text-[10px]" style={{ color: "var(--muted)" }}>No qualitative criteria have been entered.</p> : <div className="mt-2 space-y-2">{criteria.map((criterion) => <div key={criterion.id} className="grid grid-cols-[1fr_70px_auto] gap-1"><input aria-label="Criterion name" value={criterion.name} onChange={(event) => updateCriterion(criterion.id, { name: event.target.value })} placeholder="Criterion name" className="rounded border px-2 py-1 text-[10px]" style={inputStyle} /><input aria-label="Criterion score" type="number" min={0} max={100} value={criterion.value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next <= 200) updateCriterion(criterion.id, { value: next }); }} className="rounded border px-2 py-1 text-right text-[10px]" style={inputStyle} /><button type="button" onClick={() => setCriteria((current) => current.filter((item) => item.id !== criterion.id))} className="rounded border px-2 text-[9px]" style={{ borderColor: "var(--line)" }}>×</button><textarea aria-label="Criterion notes" value={criterion.notes} onChange={(event) => updateCriterion(criterion.id, { notes: event.target.value })} placeholder="Qualitative notes" className="col-span-3 min-h-12 rounded border px-2 py-1 text-[10px]" style={inputStyle} /></div>)}</div>}
      </section>
      <section className="rounded-xl border p-3 lg:col-span-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
        <div className="grid gap-2 md:grid-cols-[220px_1fr]"><label className="text-[10px]" style={{ color: "var(--muted)" }}>Preferred variation<select value={preferred} onChange={(event) => setPreferred(event.target.value as PrototypeGeometryMode)} className="mt-1 w-full rounded border px-2 py-1 text-[10px]" style={inputStyle}>{modes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label><label className="text-[10px]" style={{ color: "var(--muted)" }}>Selection rationale<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} className="mt-1 min-h-16 w-full rounded border px-2 py-1 text-[10px]" style={inputStyle} placeholder="Record why this variation is preferred." /></label></div>
      </section>
    </div>}

    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: "var(--line)" }}>
      <strong className="mr-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Export</strong>
      <Link href="/" className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)" }}>Original letter/void geometry</Link>
      <button type="button" disabled={stale || !intersectionSpaces?.indices.length} onClick={() => intersectionSpaces && download(`${selectedCategory}-${selectedTypology}-${selectedMode}-space.obj`, intersectionSpacesObj(intersectionSpaces), "text/plain")} className="rounded border px-2 py-1 text-[9px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Architectural space OBJ</button>
      <button type="button" disabled={!selected || selected.quality !== "final" || stale || selected.elements.length === 0} onClick={() => selected && download(`${selectedCategory}-${selectedTypology}-${selectedMode}.obj`, architecturalObj(selected), "text/plain")} className="rounded border px-2 py-1 text-[9px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Typology study OBJ (feet)</button>
      <button type="button" disabled={!selected || selected.quality !== "final" || stale || selected.elements.length === 0} onClick={() => selected && download(`${selectedCategory}-${selectedTypology}-${selectedMode}-${aggregationCount}-tiles.obj`, architecturalObj(selected, aggregationCount), "text/plain")} className="rounded border px-2 py-1 text-[9px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Typology aggregation OBJ</button>
      <button type="button" onClick={exportCurrentPng} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)" }}>Current {view} PNG</button>
      <button type="button" disabled={!selected} onClick={() => selected && exportBoard(selected, descriptors, BOARD_SHEETS["11x22"])} className="rounded border px-2 py-1 text-[9px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Typology study 11×22 PNG</button>
      <button type="button" disabled={!selected} onClick={() => selected && exportBoard(selected, descriptors, BOARD_SHEETS["12.5x33"])} className="rounded border px-2 py-1 text-[9px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Typology study 12.5×33 PNG</button>
      <button type="button" onClick={() => download(`${selectedCategory}-${selectedTypology}-${selectedMode}-record.json`, JSON.stringify(evaluationRecord, null, 2), "application/json")} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)" }}>Parameters + evaluation JSON</button>
    </div>
    <p className="mt-2 text-[9px]" style={{ color: "var(--muted)" }}>Architectural space OBJ uses the original source coordinates and units. Typology study and aggregation OBJ files use feet. The existing Slide page retains the adjustable cut plane and separate section result view.</p>
  </section>;
}
