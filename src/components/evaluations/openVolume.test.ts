import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureOpenVolume, type Voxel } from "./openVolume.ts";

function fill(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Voxel[] {
  const cells: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) cells.push([x, y, z]);
    }
  }
  return cells;
}

function solidCube(size: number) {
  return fill(0, size - 1, 0, size - 1, 0, size - 1);
}

function hollowBox(size: number) {
  const cells: Voxel[] = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) {
        const shell = x === 0 || y === 0 || z === 0 || x === size - 1 || y === size - 1 || z === size - 1;
        if (shell) cells.push([x, y, z]);
      }
    }
  }
  return cells;
}

function stackedSlabs(size: number, levels: number[]) {
  return levels.flatMap((z) => fill(0, size - 1, 0, size - 1, z, z));
}

function openFrame(size: number) {
  const last = size - 1;
  const cells: Voxel[] = [];
  const edge = (fixed: Array<[number, number, number]>, axis: 0 | 1 | 2) => {
    for (let i = 0; i < size; i += 1) {
      const cell: Voxel = [...fixed[0]];
      cell[axis] = i;
      cells.push(cell);
    }
  };
  for (const y of [0, last]) {
    for (const z of [0, last]) edge([[0, y, z]], 0);
  }
  for (const x of [0, last]) {
    for (const z of [0, last]) edge([[x, 0, z]], 1);
  }
  for (const x of [0, last]) {
    for (const y of [0, last]) edge([[x, y, 0]], 2);
  }
  return cells;
}

function denseWalls(size: number) {
  const cells: Voxel[] = [];
  for (let x = 0; x < size; x += 2) {
    cells.push(...fill(x, x, 0, size - 1, 0, size - 1));
  }
  for (let y = 0; y < size; y += 2) {
    cells.push(...fill(0, size - 1, y, y, 0, size - 1));
  }
  return cells;
}

describe("Open Volume", () => {
  it("scores a solid cube very low", () => {
    const result = measureOpenVolume(solidCube(8));
    assert.ok(result.score < 12, `cube score ${result.score}`);
    assert.ok(result.permeability < 5);
    assert.ok(result.architecturalOpenSpace < 5);
    assert.ok(result.enclosedVoidRatio < 5);
  });

  it("scores a closed hollow box above a solid, with low permeability and real enclosed void", () => {
    const solid = measureOpenVolume(solidCube(10));
    const hollow = measureOpenVolume(hollowBox(10));
    assert.ok(hollow.score > solid.score);
    assert.ok(hollow.permeability < 15, `permeability ${hollow.permeability}`);
    assert.ok(hollow.enclosedVoidRatio > 35, `enclosed ${hollow.enclosedVoidRatio}`);
    assert.ok(hollow.architecturalOpenSpace > 35);
    assert.ok(hollow.interstitialOpenSpace < 10, `interstitial ${hollow.interstitialOpenSpace}`);
  });

  it("scores an open frame very high", () => {
    const frame = measureOpenVolume(openFrame(10));
    const hollow = measureOpenVolume(hollowBox(10));
    assert.ok(frame.score > 70, `frame score ${frame.score}`);
    assert.ok(frame.score > hollow.score);
    assert.ok(frame.permeability > 60, `frame permeability ${frame.permeability}`);
    assert.ok(frame.enclosedVoidRatio < 10);
  });

  it("scores wall-less stacked slabs high, with horizontal permeability and little enclosed void", () => {
    const slabs = measureOpenVolume(stackedSlabs(10, [0, 5, 9]));
    assert.ok(slabs.score > 55, `slab score ${slabs.score}`);
    assert.ok(slabs.horizontalPermeability > 60, `horizontal ${slabs.horizontalPermeability}`);
    assert.ok(slabs.interstitialOpenSpace > 45, `interstitial ${slabs.interstitialOpenSpace}`);
    assert.ok(slabs.architecturalOpenSpace > 50);
    assert.ok(slabs.enclosedVoidRatio < 12, `enclosed ${slabs.enclosedVoidRatio}`);
  });

  it("gives a single thin plate high mass-reduction and permeability, but less openness than stacked plates", () => {
    const plate = measureOpenVolume(fill(0, 9, 0, 9, 0, 0));
    const slabs = measureOpenVolume(stackedSlabs(10, [0, 5, 9]));
    assert.ok(plate.lowMass > 55, `low mass ${plate.lowMass}`);
    assert.ok(plate.permeability > 40, `permeability ${plate.permeability}`);
    assert.ok(plate.architecturalOpenSpace < slabs.architecturalOpenSpace);
    assert.ok(plate.interstitialOpenSpace < slabs.interstitialOpenSpace);
  });

  it("scores a dense multi-wall field below an open frame and below stacked slabs", () => {
    const dense = measureOpenVolume(denseWalls(10));
    const frame = measureOpenVolume(openFrame(10));
    const slabs = measureOpenVolume(stackedSlabs(10, [0, 5, 9]));
    assert.ok(dense.score < frame.score, `dense ${dense.score} frame ${frame.score}`);
    assert.ok(dense.score < slabs.score, `dense ${dense.score} slabs ${slabs.score}`);
  });
});
