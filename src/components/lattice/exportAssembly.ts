import { transformSpecNormal, transformSpecPoint } from "./analyze";
import type { GeneratedConnector } from "./connectionSynthesis";
import { connectorsToObj } from "./connectionSynthesis";
import { slotById } from "./slots";
import type { ImportedObj, LatticeField, Placement, TileModel, UpAxisMode } from "./types";
import { DEFAULT_LATTICE_FIELD, fileToSpec, LATTICE_FEET, resolvedUp, unpackCell } from "./types";

function latticeOf(placement: Placement): [number, number, number] {
  return [placement.ix * LATTICE_FEET, placement.iy * LATTICE_FEET, placement.iz * LATTICE_FEET + (placement.zLift ?? 0)];
}

export function assembledObj(
  meshes: ImportedObj[],
  placements: Record<string, Placement>,
  models: TileModel[],
  unitScale: number,
  upAxisMode: UpAxisMode = "auto",
  connectors: GeneratedConnector[] = [],
) {
  const lines = ["# LUV Part 2 assembled aggregation", "# Units: feet; Z-up for Rhino", "# Source meshes are transformed only. Vertices are not remeshed.", "o assembly"];
  let vertexOffset = 1;
  let normalOffset = 1;
  for (const mesh of meshes) {
    const placement = placements[mesh.id];
    const model = models.find((item) => item.id === mesh.id) ?? models.find((item) => item.id === mesh.id.split("::")[0]);
    if (!placement || !model) continue;
    const lattice = latticeOf(placement);
    const anchor = model.anchor;
    const up = resolvedUp(mesh.upAxis, upAxisMode);
    lines.push(`g ${slotById(placement.slotId)?.code ?? "tile"}_${mesh.filename.replace(/\.obj$/i, "").replace(/\s+/g, "_")}_${placement.ix}_${placement.iy}_${placement.iz}`);
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const [sx, sy, sz] = fileToSpec(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2], up);
      const world = transformSpecPoint([sx * unitScale, sy * unitScale, sz * unitScale], anchor, placement.rotation, placement.mirror, lattice);
      lines.push(`v ${world[0].toFixed(5)} ${world[1].toFixed(5)} ${world[2].toFixed(5)}`);
    }
    const hasNormals = mesh.normals.length > 0;
    if (hasNormals) {
      for (let index = 0; index < mesh.normals.length; index += 3) {
        const specNormal = fileToSpec(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2], up);
        const normal = transformSpecNormal(specNormal, placement.rotation, placement.mirror);
        lines.push(`vn ${normal[0].toFixed(5)} ${normal[1].toFixed(5)} ${normal[2].toFixed(5)}`);
      }
    }
    for (const group of mesh.groups) {
      if (mesh.groups.length > 1) lines.push(`g ${group.name.replace(/\s+/g, "_")}`);
      for (let faceIndex = group.faceStart; faceIndex < group.faceStart + group.faceCount; faceIndex += 1) {
        const face = mesh.faces[faceIndex];
        const tokens = face.vertices.map((vertex, corner) => {
          const vertexIndex = vertex + vertexOffset;
          if (!hasNormals || !face.normals) return `${vertexIndex}`;
          return `${vertexIndex}//${face.normals[corner] + normalOffset}`;
        });
        lines.push(`f ${tokens.join(" ")}`);
      }
    }
    vertexOffset += mesh.positions.length / 3;
    if (hasNormals) normalOffset += mesh.normals.length / 3;
  }
  if (connectors.length) {
    lines.push("# --- generated connection synthesis ---");
    for (const connector of connectors) {
      lines.push(`g connector_${connector.kind}_${connector.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`);
      for (let index = 0; index < connector.positions.length; index += 3) {
        lines.push(`v ${connector.positions[index].toFixed(5)} ${connector.positions[index + 1].toFixed(5)} ${connector.positions[index + 2].toFixed(5)}`);
      }
      for (let index = 0; index < connector.indices.length; index += 3) {
        lines.push(`f ${connector.indices[index] + vertexOffset} ${connector.indices[index + 1] + vertexOffset} ${connector.indices[index + 2] + vertexOffset}`);
      }
      vertexOffset += connector.positions.length / 3;
    }
  }
  return `${lines.join("\n")}\n`;
}

export { connectorsToObj };

export function assemblyManifest(meshes: ImportedObj[], placements: Record<string, Placement>, models: TileModel[], unitScale: number, sourceUnit: string, field: LatticeField = DEFAULT_LATTICE_FIELD) {
  return {
    units: "feet",
    latticeFeet: LATTICE_FEET,
    latticeCells: [field.cellsX, field.cellsY, field.cellsZ],
    sourceUnit,
    globalUnitScaleToFeet: unitScale,
    note: "Translation is the registration anchor on the 20 ft lattice. Rotation is about Z. Source vertices are not scaled individually.",
    tiles: meshes.flatMap((mesh) => {
      const placement = placements[mesh.id];
      const model = models.find((item) => item.id === mesh.id) ?? models.find((item) => item.id === mesh.id.split("::")[0]);
      if (!placement || !model) return [];
      const slot = slotById(placement.slotId);
      return [{
        sourceFilename: mesh.filename,
        typology: slot ? `${slot.code} ${slot.name}` : null,
        category: slot?.category ?? null,
        translation: latticeOf(placement),
        rotation: placement.rotation,
        mirror: placement.mirror,
        lattice: [placement.ix, placement.iy, placement.iz],
        zLift: placement.zLift ?? 0,
        anchor: model.anchor,
        locked: placement.locked,
      }];
    }),
  };
}

export function voxelUnionObj(models: TileModel[], placements: Record<string, Placement>) {
  const cell = models[0]?.cellFeet ?? 2;
  const step = Math.round(LATTICE_FEET / cell);
  const occupied = new Set<number>();
  for (const model of models) {
    const placement = placements[model.id];
    if (!placement) continue;
    const variant = model.variants.find((item) => item.rotation === placement.rotation && item.mirror === placement.mirror) ?? model.variants[0];
    const ox = placement.ix * step;
    const oy = placement.iy * step;
    const oz = placement.iz * step + Math.round((placement.zLift ?? 0) / cell);
    for (const packed of variant.occupied) {
      const [x, y, z] = unpackCell(packed);
      occupied.add((x + ox + 500) * 1_000_000 + (y + oy + 500) * 1_000 + (z + oz + 500));
    }
  }
  const lines = ["# LUV coarse voxel union. This is not the assembled source mesh.", "# Narrow voids can close at the voxel size.", "o voxel_union"];
  let offset = 1;
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const packed of occupied) {
    const z = (packed % 1000) - 500;
    const y = (Math.floor(packed / 1000) % 1000) - 500;
    const x = Math.floor(packed / 1_000_000) - 500;
    for (const [dx, dy, dz] of faces) {
      const neighbor = (x + dx + 500) * 1_000_000 + (y + dy + 500) * 1_000 + (z + dz + 500);
      if (occupied.has(neighbor)) continue;
      const corners = faceCorners(x, y, z, dx, dy, dz, cell);
      for (const corner of corners) lines.push(`v ${corner[0].toFixed(5)} ${corner[1].toFixed(5)} ${corner[2].toFixed(5)}`);
      lines.push(`f ${offset} ${offset + 1} ${offset + 2} ${offset + 3}`);
      offset += 4;
    }
  }
  return `${lines.join("\n")}\n`;
}

function faceCorners(x: number, y: number, z: number, dx: number, dy: number, dz: number, cell: number): Array<[number, number, number]> {
  const origin: [number, number, number] = [x * cell, y * cell, z * cell];
  const size = cell;
  if (dx > 0) return [[origin[0] + size, origin[1], origin[2]], [origin[0] + size, origin[1] + size, origin[2]], [origin[0] + size, origin[1] + size, origin[2] + size], [origin[0] + size, origin[1], origin[2] + size]];
  if (dx < 0) return [[origin[0], origin[1], origin[2]], [origin[0], origin[1], origin[2] + size], [origin[0], origin[1] + size, origin[2] + size], [origin[0], origin[1] + size, origin[2]]];
  if (dy > 0) return [[origin[0], origin[1] + size, origin[2]], [origin[0], origin[1] + size, origin[2] + size], [origin[0] + size, origin[1] + size, origin[2] + size], [origin[0] + size, origin[1] + size, origin[2]]];
  if (dy < 0) return [[origin[0], origin[1], origin[2]], [origin[0] + size, origin[1], origin[2]], [origin[0] + size, origin[1], origin[2] + size], [origin[0], origin[1], origin[2] + size]];
  if (dz > 0) return [[origin[0], origin[1], origin[2] + size], [origin[0] + size, origin[1], origin[2] + size], [origin[0] + size, origin[1] + size, origin[2] + size], [origin[0], origin[1] + size, origin[2] + size]];
  return [[origin[0], origin[1], origin[2]], [origin[0], origin[1] + size, origin[2]], [origin[0] + size, origin[1] + size, origin[2]], [origin[0] + size, origin[1], origin[2]]];
}
