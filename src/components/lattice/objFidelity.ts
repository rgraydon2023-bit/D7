import type { ImportedObj, Mirror, Placement, Rotation, UpAxis, UpAxisMode } from "./types";
import { fileToSpec, LATTICE_FEET, resolvedUp, UNIT_TO_FEET, type UnitName } from "./types";
import * as THREE from "three";

/** File XYZ → Z-up feet (spec), as a single root matrix. No per-vertex bake. */
export function fileToSpecMatrix(unitScale: number, up: UpAxis) {
  const scale = new THREE.Matrix4().makeScale(unitScale, unitScale, unitScale);
  if (up === "z") return scale;
  // Y-up file (x,y,z) → (x, -z, y)
  const axis = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
  return scale.premultiply(axis);
}

/** Spec Z-up → Three.js Y-up display: (x,y,z) → (x,z,y) */
export function specToDisplayMatrix() {
  return new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
}

export function combinedBoundsFile(mesh: ImportedObj) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return {
    min: [minX, minY, minZ] as [number, number, number],
    max: [maxX, maxY, maxZ] as [number, number, number],
    size: [maxX - minX, maxY - minY, maxZ - minZ] as [number, number, number],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [number, number, number],
  };
}

export function combinedBoundsSpec(mesh: ImportedObj, unitScale: number, up: UpAxis) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = fileToSpec(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2], up);
    const sx = x * unitScale, sy = y * unitScale, sz = z * unitScale;
    minX = Math.min(minX, sx); minY = Math.min(minY, sy); minZ = Math.min(minZ, sz);
    maxX = Math.max(maxX, sx); maxY = Math.max(maxY, sy); maxZ = Math.max(maxZ, sz);
  }
  return {
    min: [minX, minY, minZ] as [number, number, number],
    max: [maxX, maxY, maxZ] as [number, number, number],
    size: [maxX - minX, maxY - minY, maxZ - minZ] as [number, number, number],
    /** Registration anchor: plan center, base at min Z — applied once at tile root. */
    anchor: [(minX + maxX) / 2, (minY + maxY) / 2, minZ] as [number, number, number],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [number, number, number],
  };
}

export function triangleCount(mesh: ImportedObj) {
  let count = 0;
  for (const face of mesh.faces) count += Math.max(0, face.vertices.length - 2);
  return count;
}

export type ChildTransformReport = {
  name: string;
  faceCount: number;
  vertexRefs: number;
  localPosition: [number, number, number];
  localRotation: [number, number, number];
  localScale: [number, number, number];
};

export type FidelityMetrics = {
  label: string;
  childMeshCount: number;
  totalObjectCount: number;
  vertexCount: number;
  triangleCount: number;
  bboxSize: [number, number, number];
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  aspect: [number, number, number];
  centroid: [number, number, number];
  unitScale: number;
  units: UnitName;
  upAxis: UpAxis;
  rootTranslation: [number, number, number];
  rootRotationDeg: Rotation;
  rootMirror: Mirror;
  rootScale: [number, number, number];
  children: ChildTransformReport[];
};

function aspects(size: [number, number, number]): [number, number, number] {
  const m = Math.max(size[0], size[1], size[2], 1e-9);
  return [size[0] / m, size[1] / m, size[2] / m];
}

export function fidelityMetricsRaw(mesh: ImportedObj, units: UnitName, upAxisMode: UpAxisMode): FidelityMetrics {
  const bounds = combinedBoundsFile(mesh);
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  const children: ChildTransformReport[] = mesh.groups.map((group) => ({
    name: group.name,
    faceCount: group.faceCount,
    vertexRefs: mesh.faces.slice(group.faceStart, group.faceStart + group.faceCount).reduce((sum, face) => sum + face.vertices.length, 0),
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0],
    localScale: [1, 1, 1],
  }));
  return {
    label: "RAW IMPORT",
    childMeshCount: Math.max(1, mesh.groups.length),
    totalObjectCount: 1 + Math.max(1, mesh.groups.length),
    vertexCount: mesh.positions.length / 3,
    triangleCount: triangleCount(mesh),
    bboxSize: bounds.size,
    bboxMin: bounds.min,
    bboxMax: bounds.max,
    aspect: aspects(bounds.size),
    centroid: bounds.center,
    unitScale: 1,
    units,
    upAxis: up,
    rootTranslation: [0, 0, 0],
    rootRotationDeg: 0,
    rootMirror: "none",
    rootScale: [1, 1, 1],
    children,
  };
}

export function fidelityMetricsRegistered(
  mesh: ImportedObj,
  units: UnitName,
  upAxisMode: UpAxisMode,
  placement: Placement,
  label = "REGISTERED TILE",
): FidelityMetrics {
  const unitScale = UNIT_TO_FEET[units];
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  const bounds = combinedBoundsSpec(mesh, unitScale, up);
  const children: ChildTransformReport[] = mesh.groups.map((group) => ({
    name: group.name,
    faceCount: group.faceCount,
    vertexRefs: mesh.faces.slice(group.faceStart, group.faceStart + group.faceCount).reduce((sum, face) => sum + face.vertices.length, 0),
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0],
    localScale: [1, 1, 1],
  }));
  return {
    label,
    childMeshCount: Math.max(1, mesh.groups.length),
    totalObjectCount: 1 + Math.max(1, mesh.groups.length),
    vertexCount: mesh.positions.length / 3,
    triangleCount: triangleCount(mesh),
    bboxSize: bounds.size,
    bboxMin: bounds.min,
    bboxMax: bounds.max,
    aspect: aspects(bounds.size),
    centroid: bounds.center,
    unitScale,
    units,
    upAxis: up,
    rootTranslation: [placement.ix * LATTICE_FEET, placement.iy * LATTICE_FEET, placement.iz * LATTICE_FEET + (placement.zLift ?? 0)],
    rootRotationDeg: placement.rotation,
    rootMirror: placement.mirror,
    rootScale: [unitScale, unitScale, unitScale],
    children,
  };
}

/**
 * Root-only transform for a complete tile.
 * Geometry stays in FILE coordinates on child meshes.
 *
 * RAW (applyUnitAndUp=false, register=false): identity — file XYZ as loaded (Three.js Y-up).
 * REGISTERED / COPY: displaySwap * lattice * rotZ * mirror * center(-anchor) * fileToSpec(unit, up)
 */
export function tileRootMatrix(
  mesh: ImportedObj,
  placement: Placement,
  unitScale: number,
  upAxisMode: UpAxisMode,
  options: { register: boolean; applyUnitAndUp: boolean; anchor?: [number, number, number] } = { register: true, applyUnitAndUp: true },
) {
  const matrix = new THREE.Matrix4();
  // True RAW import: no unit, no up-axis, no registration, no display remap.
  if (!options.applyUnitAndUp && !options.register) return matrix;

  const up = resolvedUp(mesh.upAxis, upAxisMode);
  if (options.applyUnitAndUp) matrix.multiply(fileToSpecMatrix(unitScale, up));
  if (options.register) {
    const bounds = combinedBoundsSpec(mesh, options.applyUnitAndUp ? unitScale : 1, options.applyUnitAndUp ? up : "z");
    const anchor = options.anchor ?? bounds.anchor;
    matrix.premultiply(new THREE.Matrix4().makeTranslation(-anchor[0], -anchor[1], -anchor[2]));
    const mirror = new THREE.Matrix4().makeScale(placement.mirror === "x" ? -1 : 1, placement.mirror === "y" ? -1 : 1, 1);
    matrix.premultiply(mirror);
    matrix.premultiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(placement.rotation)));
    matrix.premultiply(new THREE.Matrix4().makeTranslation(
      placement.ix * LATTICE_FEET,
      placement.iy * LATTICE_FEET,
      placement.iz * LATTICE_FEET + (placement.zLift ?? 0),
    ));
  }
  matrix.premultiply(specToDisplayMatrix());
  return matrix;
}

/** One complete OBJ as a single file-space geometry (fidelity isolation). */
export function buildCompleteFileGeometry(mesh: ImportedObj): THREE.BufferGeometry {
  const positions = mesh.positions.slice();
  const indices: number[] = [];
  for (const face of mesh.faces) {
    for (let i = 1; i < face.vertices.length - 1; i += 1) {
      indices.push(face.vertices[0], face.vertices[i], face.vertices[i + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (indices.length) geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Build child BufferGeometries in FILE coordinates — one mesh per OBJ group. */
export function buildFileSpaceGeometries(mesh: ImportedObj): Array<{ name: string; geometry: THREE.BufferGeometry }> {
  const groups = mesh.groups.length ? mesh.groups : [{ name: mesh.filename, faceStart: 0, faceCount: mesh.faces.length }];
  return groups.map((group) => {
    const positions = mesh.positions.slice();
    const indices: number[] = [];
    for (let faceIndex = group.faceStart; faceIndex < group.faceStart + group.faceCount; faceIndex += 1) {
      const face = mesh.faces[faceIndex];
      for (let i = 1; i < face.vertices.length - 1; i += 1) {
        indices.push(face.vertices[0], face.vertices[i], face.vertices[i + 1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (indices.length) geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return { name: group.name, geometry };
  });
}

export function compareFidelity(raw: FidelityMetrics, registered: FidelityMetrics, copy2: FidelityMetrics) {
  const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
  const aspectOk =
    near(raw.aspect[0], registered.aspect[0], 1e-3) &&
    near(raw.aspect[1], registered.aspect[1], 1e-3) &&
    near(raw.aspect[2], registered.aspect[2], 1e-3);
  const sizeOk =
    near(registered.bboxSize[0], copy2.bboxSize[0]) &&
    near(registered.bboxSize[1], copy2.bboxSize[1]) &&
    near(registered.bboxSize[2], copy2.bboxSize[2]);
  const countsOk =
    raw.vertexCount === registered.vertexCount &&
    raw.triangleCount === registered.triangleCount &&
    registered.vertexCount === copy2.vertexCount &&
    registered.triangleCount === copy2.triangleCount;
  const childrenOk = raw.children.every((child, index) => {
    const other = registered.children[index];
    return other &&
      child.localPosition.every((v, i) => v === other.localPosition[i]) &&
      child.localScale.every((v, i) => v === other.localScale[i]);
  });
  const passed = aspectOk && sizeOk && countsOk && childrenOk;
  return {
    passed,
    aspectOk,
    sizeOk,
    countsOk,
    childrenOk,
    failures: [
      !countsOk ? "Vertex/triangle counts diverge between RAW / REGISTERED / COPY 2." : null,
      !aspectOk ? "Aspect ratios changed after registration (non-uniform scale or axis error)." : null,
      !sizeOk ? "COPY 2 dimensions differ from REGISTERED." : null,
      !childrenOk ? "Child local transforms changed — children were modified independently." : null,
    ].filter(Boolean) as string[],
  };
}

export const IDENTITY_PLACEMENT = (meshId: string, slotId: string | null = null): Placement => ({
  meshId,
  slotId,
  rotation: 0,
  mirror: "none",
  ix: 0,
  iy: 0,
  iz: 0,
  zLift: 0,
  locked: false,
});
