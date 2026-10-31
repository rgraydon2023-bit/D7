import * as THREE from "three";
import ManifoldModule from "manifold-3d/manifold";
import rhino3dm from "rhino3dm";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import { letterVolumeLayout, type VolumeOptions } from "./letterVolumeLayout";
import type { CompositionPlacement } from "./compositionEngine";

export type VolumeExportFormat = "mesh" | "polysurface";
export type VolumeExportTarget = "letters" | "void";
type TriangleMesh = { vertices: number[]; triangles: number[] };
export type VolumeBounds = { width: number; height: number; depth: number };

function transformedLetter(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): TriangleMesh {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertices: number[] = [];
  const triangles: number[] = [];
  const seen = new Map<string, number>();
  const point = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
    const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
    let vertex = seen.get(key);
    if (vertex === undefined) {
      vertex = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      seen.set(key, vertex);
    }
    triangles.push(vertex);
  }
  return { vertices, triangles };
}

/** Boolean-union all letter solids, retaining separate closed shells where letters do not touch. */
export async function fusedLetterVolume(options: VolumeOptions, compositionPlacements?: CompositionPlacement[]): Promise<TriangleMesh> {
  const wasm = await ManifoldModule();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const solids: InstanceType<typeof Manifold>[] = [];
  const { placements, worldLetterSize } = letterVolumeLayout(options);
  const exportPlacements = compositionPlacements ?? placements;
  try {
    for (const placement of exportPlacements) {
      const { cell, x, y, z } = placement;
      let matrix: THREE.Matrix4;
      if (compositionPlacements) {
        const transformed = placement as CompositionPlacement;
        matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(transformed.rx),
            THREE.MathUtils.degToRad(transformed.ry),
            THREE.MathUtils.degToRad(transformed.rz),
            "XYZ",
          )),
          new THREE.Vector3(
            transformed.scale * (transformed.scaleX ?? 1),
            transformed.scale * (transformed.scaleY ?? 1),
            transformed.scale * (transformed.scaleZ ?? 1),
          ),
        );
      } else {
        const regular = placement as (typeof placements)[number];
        const pivot = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(regular.yRotation));
        pivot.setPosition(x, y, z);
        const local = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(cell.rotation));
        local.scale(new THREE.Vector3(worldLetterSize, worldLetterSize, worldLetterSize));
        matrix = pivot.multiply(local);
      }
      const { vertices, triangles } = transformedLetter(
        getLetterVolumeGeometry(cell.letter, options.thickness),
        matrix,
      );
      const solid = new Manifold(new Mesh({
        numProp: 3,
        vertProperties: new Float32Array(vertices),
        triVerts: new Uint32Array(triangles),
      }));
      if (solid.status() !== "NoError") {
        solid.delete();
        throw new Error(`Letter ${cell.letter} cannot be converted to a closed solid`);
      }
      solids.push(solid);
    }
    const union = Manifold.union(solids);
    try {
      if (union.status() !== "NoError" || union.isEmpty()) throw new Error(`Boolean union failed: ${union.status()}`);
      const mesh = union.getMesh();
      return { vertices: Array.from(mesh.vertProperties), triangles: Array.from(mesh.triVerts) };
    } finally {
      union.delete();
    }
  } finally {
    solids.forEach((solid) => solid.delete());
  }
}

/** Closed negative-space solid: containing box minus every letter volume. */
export async function boundedVoidVolume(options: VolumeOptions, compositionPlacements?: CompositionPlacement[], compositionBounds?: VolumeBounds): Promise<TriangleMesh> {
  const letterMesh = await fusedLetterVolume(options, compositionPlacements);
  const wasm = await ManifoldModule();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const letters = new Manifold(new Mesh({
    numProp: 3,
    vertProperties: new Float32Array(letterMesh.vertices),
    triVerts: new Uint32Array(letterMesh.triangles),
  }));
  const layout = letterVolumeLayout(options);
  const padding = layout.worldLetterSize * 0.06;
  const xs = letterMesh.vertices.filter((_, index) => index % 3 === 0);
  const ys = letterMesh.vertices.filter((_, index) => index % 3 === 1);
  const zs = letterMesh.vertices.filter((_, index) => index % 3 === 2);
  const symmetricSize = (values: number[], fallback: number) => Math.max(fallback / 2, ...values.map(Math.abs)) * 2 + padding * 2;
  const box = Manifold.cube([
    compositionBounds?.width ?? symmetricSize(xs, layout.width),
    compositionBounds?.height ?? symmetricSize(ys, layout.height),
    compositionBounds?.depth ?? symmetricSize(zs, layout.depth),
  ], true);
  try {
    const negative = Manifold.difference(box, letters);
    try {
      if (negative.status() !== "NoError" || negative.isEmpty()) {
        throw new Error(`Void Boolean subtraction failed: ${negative.status()}`);
      }
      const mesh = negative.getMesh();
      return { vertices: Array.from(mesh.vertProperties), triangles: Array.from(mesh.triVerts) };
    } finally {
      negative.delete();
    }
  } finally {
    box.delete();
    letters.delete();
  }
}

export function fusedVolumeObjText(mesh: TriangleMesh, target: VolumeExportTarget = "letters"): string {
  const name = target === "void" ? "VUL_Bounded_Void" : "VUL_Closed_Mesh";
  const lines = ["# Units: feet; 1 coordinate unit = 1 ft", `# ${target === "void" ? "Bounded void around" : "Boolean-fused"} VUL letter volume`, `o ${name}`];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    lines.push(`v ${mesh.vertices[i]} ${mesh.vertices[i + 1]} ${mesh.vertices[i + 2]}`);
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    lines.push(`f ${mesh.triangles[i] + 1} ${mesh.triangles[i + 1] + 1} ${mesh.triangles[i + 2] + 1}`);
  }
  return lines.join("\n") + "\n";
}

export async function fusedVolumePolysurface(mesh: TriangleMesh): Promise<Uint8Array> {
  // Rhino's Brep conversion requires one connected closed shell to be a solid.
  const vertexCount = mesh.vertices.length / 3;
  const parent = Array.from({ length: vertexCount }, (_, i) => i);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const root = find(mesh.triangles[i]);
    parent[find(mesh.triangles[i + 1])] = root;
    parent[find(mesh.triangles[i + 2])] = root;
  }
  if (new Set(parent.map((_, i) => find(i))).size !== 1) {
    throw new Error("A closed polysurface needs touching letters throughout the volume. Reduce Gap and Z gap or increase Size and Thickness, then export again.");
  }
  const rhino = await rhino3dm();
  const rhinoMesh = new rhino.Mesh();
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    rhinoMesh.vertices().add(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]);
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    rhinoMesh.faces().addTriFace(mesh.triangles[i], mesh.triangles[i + 1], mesh.triangles[i + 2]);
  }
  const createBrep = rhino.Brep.createFromMesh as unknown as (mesh: typeof rhinoMesh, trimmed: boolean) => ReturnType<typeof rhino.Brep.createFromMesh>;
  const brep = createBrep(rhinoMesh, true);
  if (!brep || !brep.isSolid) throw new Error("A closed polysurface needs touching letters throughout the volume. Reduce Gap and Z gap or increase Size and Thickness, then export again.");
  const doc = new rhino.File3dm();
  doc.settings().modelUnitSystem = rhino.UnitSystem.Feet;
  const attributes = new rhino.ObjectAttributes();
  attributes.name = "VUL_Closed_Polysurface";
  doc.objects().addBrep(brep, attributes);
  const bytes = doc.toByteArray();
  if (!bytes?.length) throw new Error("Rhino file could not be written");
  return bytes;
}
