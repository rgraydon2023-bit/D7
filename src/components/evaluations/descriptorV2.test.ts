import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureSpatialDescriptors, scoreDrafts, type MeshTri } from "./descriptorV2.ts";
import type { Voxel } from "./openVolume.ts";

function fill(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Voxel[] {
  const cells: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) cells.push([x, y, z]);
    }
  }
  return cells;
}

function unique(cells: Voxel[]) {
  const seen = new Set<string>();
  return cells.filter(([x, y, z]) => {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function solidCube(size: number) {
  return fill(0, size - 1, 0, size - 1, 0, size - 1);
}

function measure(cells: Voxel[], triangles?: MeshTri[]) {
  return measureSpatialDescriptors({ cells: unique(cells), cellFeet: 2, triangles });
}

function value(drafts: { name: string; value: number }[], name: string) {
  const found = drafts.find((item) => item.name === name);
  assert.ok(found, name);
  return found.value;
}

function tri(a: [number, number, number], b: [number, number, number], c: [number, number, number]): MeshTri {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(cross[0], cross[1], cross[2]) || 1;
  return {
    normal: [cross[0] / length, cross[1] / length, cross[2] / length],
    area: length / 2,
    centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    corners: [a, b, c],
  };
}

function cubeMesh(size: number): MeshTri[] {
  const s = size;
  const face = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) => [tri(a, b, c), tri(a, c, d)];
  return [
    ...face([0, 0, s], [s, 0, s], [s, s, s], [0, s, s]),
    ...face([0, 0, 0], [0, s, 0], [s, s, 0], [s, 0, 0]),
    ...face([s, 0, 0], [s, s, 0], [s, s, s], [s, 0, s]),
    ...face([0, 0, 0], [0, 0, s], [0, s, s], [0, s, 0]),
    ...face([0, s, 0], [0, s, s], [s, s, s], [s, s, 0]),
    ...face([0, 0, 0], [s, 0, 0], [s, 0, s], [0, 0, s]),
  ];
}

function foldedMesh(): MeshTri[] {
  const triangles: MeshTri[] = [];
  for (let step = 0; step < 8; step += 1) {
    const x0 = step;
    const x1 = step + 1;
    const z0 = step % 2 === 0 ? 0 : 2;
    const z1 = step % 2 === 0 ? 2 : 0;
    triangles.push(tri([x0, 0, z0], [x1, 0, z1], [x1, 2, z1]));
    triangles.push(tri([x0, 0, z0], [x1, 2, z1], [x0, 2, z0]));
  }
  return triangles;
}

function stair(lowWalkZ: number, highWalkZ: number, x: number, y: number): Voxel[] {
  const cells: Voxel[] = [];
  for (let z = lowWalkZ; z < highWalkZ; z += 1) {
    const side = (z - lowWalkZ) % 2;
    cells.push([x, y + side, z]);
  }
  return cells;
}

describe("descriptor calibration V2", () => {
  it("scores connected levels above disconnected slabs", () => {
    const slabs = [0, 4, 8].flatMap((z) => fill(0, 7, 0, 7, z, z));
    const disconnected = measure(slabs);
    const connected = measure([
      ...slabs,
      ...stair(1, 5, 8, 0),
      ...stair(5, 9, 8, 2),
    ]);
    const low = scoreDrafts(disconnected.verticallyIntegrated);
    const high = scoreDrafts(connected.verticallyIntegrated);
    assert.ok(high > low + 25, `connected ${high} should clear disconnected ${low}`);
  });

  it("lets an atrium score without a stair and keeps a dense object visually closed", () => {
    const slabs = [0, 6].flatMap((z) => fill(0, 7, 0, 7, z, z));
    const atrium = unique([
      ...slabs.filter(([x, y]) => x < 3 || x > 4 || y < 3 || y > 4),
      ...fill(2, 2, 2, 5, 1, 5),
      ...fill(5, 5, 2, 5, 1, 5),
      ...fill(3, 4, 2, 2, 1, 5),
      ...fill(3, 4, 5, 5, 1, 5),
    ]);
    const open = scoreDrafts(measure(atrium).verticallyIntegrated);
    const closed = scoreDrafts(measure(slabs).verticallyIntegrated);
    assert.ok(open > closed + 15, `atrium ${open} vs stacked slabs ${closed}`);

    const frame = unique([
      ...fill(0, 11, 0, 0, 0, 0),
      ...fill(0, 11, 11, 11, 0, 0),
      ...fill(0, 0, 0, 11, 0, 0),
      ...fill(11, 11, 0, 11, 0, 0),
    ]);
    const frameSight = scoreDrafts(measure(frame).visuallyConnected);
    const cubeSight = scoreDrafts(measure(solidCube(8)).visuallyConnected);
    assert.ok(frameSight > cubeSight + 25, `frame ${frameSight} vs cube ${cubeSight}`);
  });

  it("scores a multi-approach destination above a compact box", () => {
    const plus: Voxel[] = [];
    for (let i = 0; i <= 12; i += 1) {
      plus.push([i, 6, 0], [6, i, 0]);
    }
    const box = fill(0, 8, 0, 8, 0, 0);
    const convergent = scoreDrafts(measure(plus).convergent);
    const compact = scoreDrafts(measure(box).convergent);
    assert.ok(compact < 25, `compact box convergent ${compact}`);
    assert.ok(convergent > compact + 20, `multi-approach ${convergent} vs box ${compact}`);
  });

  it("scores a dominant hierarchy above equal modules", () => {
    const dominant = [
      ...fill(0, 9, 0, 5, 0, 0),
      ...fill(0, 4, 0, 2, 3, 3),
      ...fill(0, 1, 0, 1, 6, 6),
    ];
    const equal = [0, 2, 4, 6, 8].flatMap((z) => fill(0, 3, 0, 1, z, z));
    const high = scoreDrafts(measure(dominant).hierarchical);
    const low = scoreDrafts(measure(equal).hierarchical);
    assert.ok(high > low + 20, `hierarchy ${high} vs equal ${low}`);
  });

  it("scores a folded form above an orthogonal cube", () => {
    const cube = measure(solidCube(6), cubeMesh(6));
    const foldedCells: Voxel[] = [];
    for (let x = 0; x < 8; x += 1) foldedCells.push([x, x, 0], [x, x, 1], [x, x + 1, 0]);
    const folded = measure(foldedCells, foldedMesh());
    const sculpted = scoreDrafts(folded.sculptural);
    const plain = scoreDrafts(cube.sculptural);
    assert.ok(sculpted > plain, `folded ${sculpted} vs cube ${plain}`);
  });

  it("keeps a radial mass more centralized than a hollow ring", () => {
    const pyramid: Voxel[] = [];
    for (let layer = 0; layer < 5; layer += 1) {
      const inset = layer;
      pyramid.push(...fill(inset, 8 - inset, inset, 8 - inset, layer, layer));
    }
    const ring: Voxel[] = [];
    for (let x = 0; x <= 10; x += 1) {
      for (let y = 0; y <= 10; y += 1) {
        const radius = Math.hypot(x - 5, y - 5);
        if (radius >= 3.5 && radius <= 5.2) ring.push([x, y, 0]);
      }
    }
    const radial = scoreDrafts(measure(pyramid).centralized);
    const hollow = scoreDrafts(measure(ring).centralized);
    assert.ok(radial > hollow + 15, `radial ${radial} vs ring ${hollow}`);
  });

  it("gives a linear run more sequence depth than a single room", () => {
    const line = fill(0, 19, 0, 0, 0, 0);
    const room = fill(0, 7, 0, 7, 0, 0);
    const lineDepth = value(measure(line).sequential, "Meaningful Graph Depth");
    const roomDepth = value(measure(room).sequential, "Meaningful Graph Depth");
    assert.ok(lineDepth > roomDepth, `line ${lineDepth} vs room ${roomDepth}`);
  });

  it("finds more intersections in a branched network than in a line", () => {
    const branched: Voxel[] = [];
    for (let i = 0; i <= 16; i += 1) branched.push([i, 8, 0], [8, i, 0]);
    const line = fill(0, 16, 0, 0, 0, 0);
    const branchJunctions = value(measure(branched).circulationActivated, "Useful Intersection Density");
    const lineJunctions = value(measure(line).circulationActivated, "Useful Intersection Density");
    assert.ok(branchJunctions > lineJunctions, `branch ${branchJunctions} vs line ${lineJunctions}`);
  });

  it("reads a cantilever as more surreal than a supported cube", () => {
    const cube = measure(solidCube(6), cubeMesh(6));
    const cantilever = [
      ...fill(0, 3, 0, 3, 0, 0),
      ...fill(3, 9, 0, 2, 4, 4),
    ];
    const tilted = foldedMesh();
    assert.ok(scoreDrafts(measure(cantilever, tilted).surreal) > scoreDrafts(cube.surreal));
  });

  it("lets daylight reach an open floor more than a roofed floor", () => {
    const cube = measure(solidCube(6), cubeMesh(6));
    const frame = unique([
      ...fill(0, 5, 0, 0, 0, 0),
      ...fill(0, 5, 5, 5, 0, 0),
      ...fill(0, 0, 0, 5, 0, 0),
      ...fill(5, 5, 0, 5, 0, 0),
    ]);
    const openFloor = measure(fill(0, 6, 0, 6, 0, 0));
    const roofed = measure([...fill(0, 6, 0, 6, 0, 0), ...fill(0, 6, 0, 6, 4, 4)]);
    assert.ok(scoreDrafts(measure(frame).luminous) >= 0);
    assert.ok(scoreDrafts(cube.luminous) >= 0);
    assert.ok(scoreDrafts(openFloor.luminous) > scoreDrafts(roofed.luminous) + 20);
  });

  it("is deterministic", () => {
    const cells = [...fill(0, 6, 0, 2, 0, 0), ...fill(0, 2, 0, 6, 3, 3)];
    const first = measure(cells, cubeMesh(4));
    const second = measure(cells, cubeMesh(4));
    assert.deepEqual(scoreDrafts(first.sculptural), scoreDrafts(second.sculptural));
    assert.deepEqual(scoreDrafts(first.visuallyConnected), scoreDrafts(second.visuallyConnected));
    assert.deepEqual(scoreDrafts(first.luminous), scoreDrafts(second.luminous));
  });

  it("uses a fixed monumental scale", () => {
    const low = measureSpatialDescriptors({
      cells: fill(0, 4, 0, 4, 0, 1),
      cellFeet: 2,
      bboxFeet: [20, 20, 8],
      occupiedVolumeFeet: 400,
    });
    const high = measureSpatialDescriptors({
      cells: fill(0, 4, 0, 4, 0, 1),
      cellFeet: 2,
      bboxFeet: [20, 20, 40],
      occupiedVolumeFeet: 12000,
    });
    assert.equal(value(low.monumental, "Calibrated Height"), 0);
    assert.equal(value(high.monumental, "Calibrated Height"), 100);
    assert.equal(value(low.monumental, "Calibrated Volume"), 0);
    assert.equal(value(high.monumental, "Calibrated Volume"), 100);
  });
});
