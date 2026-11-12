import { faceTriangles } from "./parseObj";
import { extractConnectionPorts, extractSourceEdgePorts } from "./connectionPorts";
import type { Direction, FaceLayer, FaceSample, ImportedObj, Mirror, Rotation, TileModel, TileVariant, UpAxis, Vec3 } from "./types";
import { CELL_FEET, DIRECTIONS, fileToSpec, MIRRORS, packCell, ROTATIONS, unpackCell } from "./types";
import { combinedBoundsSpec } from "./objFidelity";

type MutableCell = { occupied: boolean; floor: boolean; vertical: boolean };

function rotateMirror(x: number, y: number, z: number, rotation: Rotation, mirror: Mirror): [number, number, number] {
  let px = mirror === "x" ? -x : x;
  let py = mirror === "y" ? -y : y;
  const pz = z;
  if (rotation === 90) {
    const nextX = -py;
    py = px;
    px = nextX;
  } else if (rotation === 180) {
    px = -px;
    py = -py;
  } else if (rotation === 270) {
    const nextX = py;
    py = -px;
    px = nextX;
  }
  return [px, py, pz];
}

export function transformSpecPoint(
  point: [number, number, number],
  anchor: [number, number, number],
  rotation: Rotation,
  mirror: Mirror,
  lattice: [number, number, number],
): [number, number, number] {
  const moved = rotateMirror(point[0] - anchor[0], point[1] - anchor[1], point[2] - anchor[2], rotation, mirror);
  return [moved[0] + lattice[0], moved[1] + lattice[1], moved[2] + lattice[2]];
}

export function transformSpecNormal(normal: [number, number, number], rotation: Rotation, mirror: Mirror): [number, number, number] {
  return rotateMirror(normal[0], normal[1], normal[2], rotation, mirror);
}

function emptyFace(): FaceLayer {
  return { cells: new Map(), projection: 0, recess: 0 };
}

function boundsOf(cells: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const packed of cells) {
    const [x, y, z] = unpackCell(packed);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  if (!cells.length) return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function cellKey(y: number, z: number) {
  return `${y}:${z}`;
}

function buildFaces(
  occupied: number[],
  floor: Set<number>,
  passage: Set<number>,
  voidCells: Set<number>,
  cellFeet: number,
): Record<Direction, FaceLayer> {
  const faces = Object.fromEntries(DIRECTIONS.map((direction) => [direction, emptyFace()])) as Record<Direction, FaceLayer>;
  if (!occupied.length) return faces;
  const bounds = boundsOf(occupied);
  const occupiedSet = new Set(occupied);
  for (const packed of occupied) {
    const [x, y, z] = unpackCell(packed);
    for (const direction of DIRECTIONS) {
      const onLayer =
        (direction === "+X" && x === bounds.maxX) ||
        (direction === "-X" && x === bounds.minX) ||
        (direction === "+Y" && y === bounds.maxY) ||
        (direction === "-Y" && y === bounds.minY) ||
        (direction === "+Z" && z === bounds.maxZ) ||
        (direction === "-Z" && z === bounds.minZ);
      if (!onLayer) continue;
      const [u, v] = direction.endsWith("X") ? [y, z] : direction.endsWith("Y") ? [x, z] : [x, y];
      const sample: FaceSample = {
        occupied: 1,
        floor: floor.has(packed) ? 1 : 0,
        passage: passage.has(packed) ? 1 : 0,
        void: voidCells.has(packed) ? 1 : 0,
        pocket: 0,
      };
      faces[direction].cells.set(cellKey(u, v), sample);
    }
  }

  for (const direction of DIRECTIONS) {
    const layer = faces[direction];
    const home = direction === "+Z" || direction === "-Z" ? 20 : 10;
    const extent =
      direction === "+X" ? bounds.maxX * cellFeet :
      direction === "-X" ? -bounds.minX * cellFeet :
      direction === "+Y" ? bounds.maxY * cellFeet :
      direction === "-Y" ? -bounds.minY * cellFeet :
      direction === "+Z" ? bounds.maxZ * cellFeet :
      -bounds.minZ * cellFeet;
    layer.projection = Math.max(0, extent - home);
    let recessTotal = 0;
    let recessCount = 0;
    const span = direction.endsWith("Z") ? [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY] : direction.endsWith("X") ? [bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ] : [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
    for (let u = span[0]; u <= span[1]; u += 1) {
      for (let v = span[2]; v <= span[3]; v += 1) {
        const key = cellKey(u, v);
        if (layer.cells.has(key)) continue;
        let depth = 0;
        for (let step = 1; step <= 4; step += 1) {
          const x = direction === "+X" ? bounds.maxX - step : direction === "-X" ? bounds.minX + step : direction.endsWith("Y") ? u : u;
          const y = direction === "+Y" ? bounds.maxY - step : direction === "-Y" ? bounds.minY + step : direction.endsWith("X") ? u : direction.endsWith("Z") ? v : v;
          const z = direction === "+Z" ? bounds.maxZ - step : direction === "-Z" ? bounds.minZ + step : direction.endsWith("Z") ? v : v;
          if (occupiedSet.has(packCell(x, y, z))) {
            depth = step;
            break;
          }
        }
        if (depth > 0) {
          recessTotal += depth * cellFeet;
          recessCount += 1;
          layer.cells.set(key, { occupied: 0, floor: 0, passage: 0, void: 0, pocket: 1 });
        }
      }
    }
    layer.recess = recessCount ? recessTotal / recessCount : 0;
  }
  return faces;
}

function classifyVoids(occupied: Set<number>, floor: Set<number>, bounds: ReturnType<typeof boundsOf>) {
  const outside = new Set<number>();
  const flood: number[] = [];
  const minX = bounds.minX - 1;
  const minY = bounds.minY - 1;
  const minZ = bounds.minZ - 1;
  const maxX = bounds.maxX + 1;
  const maxY = bounds.maxY + 1;
  const maxZ = bounds.maxZ + 1;
  const inShell = (x: number, y: number, z: number) => x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const boundary = x === minX || x === maxX || y === minY || y === maxY || z === minZ || z === maxZ;
        if (!boundary) continue;
        const packed = packCell(x, y, z);
        if (occupied.has(packed) || outside.has(packed)) continue;
        outside.add(packed);
        flood.push(packed);
      }
    }
  }
  const neighbors = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let index = 0; index < flood.length; index += 1) {
    const [x, y, z] = unpackCell(flood[index]);
    for (const [dx, dy, dz] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inShell(nx, ny, nz)) continue;
      const packed = packCell(nx, ny, nz);
      if (occupied.has(packed) || outside.has(packed)) continue;
      outside.add(packed);
      flood.push(packed);
    }
  }

  const voidCells = new Set<number>();
  const passage = new Set<number>();
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
        const packed = packCell(x, y, z);
        if (occupied.has(packed)) continue;
        if (!outside.has(packed)) voidCells.add(packed);
        const onFloor = floor.has(packCell(x, y, z - 1)) || floor.has(packCell(x, y, z));
        if (onFloor && (outside.has(packed) || voidCells.has(packed))) passage.add(packed);
      }
    }
  }
  return { voidCells, passage };
}

function scaledSpec(mesh: ImportedObj, scale: number, up: UpAxis) {
  const out = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const [x, y, z] = fileToSpec(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2], up);
    out[index] = x * scale;
    out[index + 1] = y * scale;
    out[index + 2] = z * scale;
  }
  return out;
}

function rasterize(mesh: ImportedObj, scale: number, cellFeet: number, up: UpAxis) {
  const cells = new Map<number, MutableCell>();
  // Preserve sample bounds solely to locate ports on the original surfaces within each voxel.
  const surfaceBounds = new Map<number, { min: [number,number,number]; max: [number,number,number] }>();
  const positions = scaledSpec(mesh, scale, up);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const vertexCount = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    cx += x;
    cy += y;
    cz += z;
  }
  const anchor: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, minZ];
  let horizontalArea = 0;
  let verticalArea = 0;
  const mark = (x: number, y: number, z: number, floor: boolean, vertical: boolean) => {
    const packed = packCell(Math.floor((x - anchor[0]) / cellFeet), Math.floor((y - anchor[1]) / cellFeet), Math.floor((z - anchor[2]) / cellFeet));
    const current = cells.get(packed) ?? { occupied: false, floor: false, vertical: false };
    current.occupied = true;
    current.floor = current.floor || floor;
    current.vertical = current.vertical || vertical;
    cells.set(packed, current);
    if (!vertical) {
      const point: [number,number,number] = [x-anchor[0],y-anchor[1],z-anchor[2]];
      const bounds = surfaceBounds.get(packed) ?? {min:[...point],max:[...point]};
      for (let axis=0;axis<3;axis++) {
        bounds.min[axis]=Math.min(bounds.min[axis],point[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],point[axis]);
      }
      surfaceBounds.set(packed,bounds);
    }
  };

  for (const face of mesh.faces) {
    for (const [ia, ib, ic] of faceTriangles(face)) {
      const ax = positions[ia * 3];
      const ay = positions[ia * 3 + 1];
      const az = positions[ia * 3 + 2];
      const bx = positions[ib * 3];
      const by = positions[ib * 3 + 1];
      const bz = positions[ib * 3 + 2];
      const cx0 = positions[ic * 3];
      const cy0 = positions[ic * 3 + 1];
      const cz0 = positions[ic * 3 + 2];
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx0 - ax;
      const acy = cy0 - ay;
      const acz = cz0 - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const length = Math.hypot(nx, ny, nz);
      const area = length * 0.5;
      if (!area) continue;
      const upright = Math.abs(nz) / length;
      const horizontal = upright >= 0.68;
      const upward = nz / length >= 0.68;
      if (horizontal) horizontalArea += area;
      else verticalArea += area;
      const samples = Math.max(1, Math.min(24, Math.ceil(area / (cellFeet * cellFeet * 0.5))));
      const steps = Math.ceil(Math.sqrt(samples * 2));
      for (let iu = 0; iu <= steps; iu += 1) {
        for (let iv = 0; iv <= steps - iu; iv += 1) {
          const u = iu / steps;
          const v = iv / steps;
          const w = 1 - u - v;
          mark(ax * w + bx * u + cx0 * v, ay * w + by * u + cy0 * v, az * w + bz * u + cz0 * v, upward, !horizontal);
        }
      }
    }
  }

  return {
    anchor,
    bboxMin: [minX, minY, minZ] as [number, number, number],
    bboxMax: [maxX, maxY, maxZ] as [number, number, number],
    center: [cx / vertexCount, cy / vertexCount, cz / vertexCount] as [number, number, number],
    horizontalArea,
    verticalArea,
    cells,
    surfaceBounds,
  };
}

function variantFromBase(
  baseOccupied: number[],
  baseFloor: number[],
  baseVertical: number[],
  rotation: Rotation,
  mirror: Mirror,
  cellFeet: number,
): TileVariant {
  const occupiedSet = new Set<number>();
  const floor = new Set<number>();
  const vertical = new Set<number>();
  const mapCell = (packed: number) => {
    const [x, y, z] = unpackCell(packed);
    const center: [number, number, number] = [(x + 0.5) * cellFeet, (y + 0.5) * cellFeet, (z + 0.5) * cellFeet];
    const moved = rotateMirror(center[0], center[1], center[2], rotation, mirror);
    return packCell(Math.floor(moved[0] / cellFeet), Math.floor(moved[1] / cellFeet), Math.floor(moved[2] / cellFeet));
  };
  baseOccupied.forEach((packed) => occupiedSet.add(mapCell(packed)));
  baseFloor.forEach((packed) => floor.add(mapCell(packed)));
  baseVertical.forEach((packed) => vertical.add(mapCell(packed)));
  const occupied = [...occupiedSet];
  const bounds = boundsOf(occupied);
  const classified = classifyVoids(occupiedSet, floor, bounds);
  return {
    rotation,
    mirror,
    occupied,
    floor: [...floor],
    passage: [...classified.passage],
    voidCells: [...classified.voidCells],
    vertical: [...vertical],
    bounds,
    faces: buildFaces(occupied, floor, classified.passage, classified.voidCells, cellFeet),
  };
}

export function analyzeMesh(mesh: ImportedObj, slotId: string | null, unitScale: number, up: UpAxis, forcedCell?: number): TileModel {
  const spanEstimate = () => {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const positions = scaledSpec(mesh, unitScale, up);
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  };
  let cellFeet = forcedCell ?? CELL_FEET;
  if (!forcedCell && spanEstimate() / cellFeet > 80) cellFeet = 4;
  let raster = rasterize(mesh, unitScale, cellFeet, up);
  if (!forcedCell && raster.cells.size > 12000 && cellFeet < 4) {
    cellFeet = 4;
    raster = rasterize(mesh, unitScale, cellFeet, up);
  }
  const baseOccupied: number[] = [];
  const baseFloor: number[] = [];
  const baseVertical: number[] = [];
  for (const [packed, cell] of raster.cells) {
    if (!cell.occupied) continue;
    baseOccupied.push(packed);
    if (cell.floor) baseFloor.push(packed);
    if (cell.vertical) baseVertical.push(packed);
  }
  const variants = ROTATIONS.flatMap((rotation) => MIRRORS.map((mirror) => variantFromBase(baseOccupied, baseFloor, baseVertical, rotation, mirror, cellFeet)));
  const identity = variants[0];
  const rootBounds = combinedBoundsSpec(mesh, unitScale, up);
  const connectionPositions = scaledSpec(mesh, unitScale, up);
  for (let i=0;i<connectionPositions.length;i++) connectionPositions[i] -= rootBounds.anchor[i%3];
  const basePorts = extractSourceEdgePorts(mesh,connectionPositions,extractConnectionPorts(mesh.id, identity, cellFeet, raster.surfaceBounds));
  for (const variant of variants) {
    variant.ports = basePorts.map(port => {
      const localPosition = rotateMirror(...port.localPosition, variant.rotation, variant.mirror);
      return {
        ...port, localPosition, elevation: localPosition[2],
        profile:port.profile?[rotateMirror(...port.profile[0],variant.rotation,variant.mirror),rotateMirror(...port.profile[1],variant.rotation,variant.mirror)] as [Vec3,Vec3]:undefined,
        outwardDirection: rotateMirror(...port.outwardDirection, variant.rotation, variant.mirror),
        upDirection: rotateMirror(...port.upDirection, variant.rotation, variant.mirror),
        sourceCells: port.sourceCells.map(packed => {
          const [x,y,z] = unpackCell(packed);
          const moved = rotateMirror((x+.5)*cellFeet,(y+.5)*cellFeet,(z+.5)*cellFeet,variant.rotation,variant.mirror);
          return packCell(...moved.map(v=>Math.floor(v/cellFeet)) as [number,number,number]);
        }),
      };
    });
  }
  const projection = DIRECTIONS.reduce((sum, direction) => sum + identity.faces[direction].projection, 0);
  const recess = DIRECTIONS.reduce((sum, direction) => sum + identity.faces[direction].recess, 0);
  return {
    connectionSurface: {positions: connectionPositions, triangles: mesh.faces.flatMap(faceTriangles).flat()},
    id: mesh.id,
    filename: mesh.filename,
    slotId,
    anchor: rootBounds.anchor,
    bboxMin: rootBounds.min,
    bboxMax: rootBounds.max,
    center: rootBounds.center,
    minZ: rootBounds.min[2],
    maxZ: rootBounds.max[2],
    vertexCount: mesh.positions.length / 3,
    faceCount: mesh.faces.length,
    occupiedVolume: baseOccupied.length * cellFeet ** 3,
    horizontalArea: raster.horizontalArea,
    verticalArea: raster.verticalArea,
    openBoundary: identity.passage.length + identity.voidCells.length,
    projection,
    recess,
    cellFeet,
    variants,
  };
}
