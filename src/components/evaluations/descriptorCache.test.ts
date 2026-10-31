import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packCell, type TileModel, type TileVariant } from "../lattice/types.ts";
import { assignRelativeRanks, descriptorAnalysisCacheHits, evaluateTileModel } from "./objDescriptorAnalysis.ts";

function plate(id: string, width: number, height: number, solid = false): TileModel {
  const occupied: number[] = [];
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < width; y += 1) {
      for (let z = 0; z < height; z += solid ? 1 : 4) occupied.push(packCell(x, y, z));
    }
  }
  const variant = {
    rotation: 0,
    mirror: "none",
    occupied,
    floor: [],
    passage: [],
    voidCells: [],
    vertical: [],
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: width - 1, maxY: width - 1, maxZ: Math.max(0, height - 1) },
    faces: Object.fromEntries(["+X", "-X", "+Y", "-Y", "+Z", "-Z"].map((direction) => [direction, { cells: new Map(), projection: 0, recess: 0 }])) as TileVariant["faces"],
  } as TileVariant;
  return {
    id,
    filename: `${id}.obj`,
    slotId: id,
    anchor: [0, 0, 0],
    bboxMin: [0, 0, 0],
    bboxMax: [width * 2, width * 2, Math.max(2, height * 2)],
    center: [width, width, height],
    minZ: 0,
    maxZ: Math.max(2, height * 2),
    vertexCount: 8,
    faceCount: 12,
    occupiedVolume: occupied.length * 8,
    horizontalArea: width * width * 4,
    verticalArea: 0,
    openBoundary: 0,
    projection: 0,
    recess: 0,
    cellFeet: 2,
    variants: [variant],
  };
}

describe("descriptor geometry cache", () => {
  it("moves other ranks when one form is replaced without recomputing them", () => {
    const beforeHits = descriptorAnalysisCacheHits();
    const first = [plate("G1", 6, 1), plate("O1", 8, 8), plate("L1", 4, 12)];
    const original = first.map((model) => ({ slotId: model.id, ...evaluateTileModel(model) }));
    assignRelativeRanks(original);
    const openBefore = original.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.absoluteScore);
    const rankBefore = original.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.comparativeRank);
    const leaderIndex = openBefore.indexOf(Math.max(...openBefore));
    const replacedModel = plate(first[leaderIndex].id, 6, 6, true);
    const replaced = first.map((model, index) => ({
      slotId: model.id,
      ...evaluateTileModel(index === leaderIndex ? replacedModel : model),
    }));
    assignRelativeRanks(replaced);
    const openAfter = replaced.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.absoluteScore);
    const rankAfter = replaced.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.comparativeRank);
    replaced.forEach((_, index) => {
      if (index === leaderIndex) assert.notEqual(openAfter[index], openBefore[index]);
      else assert.equal(openAfter[index], openBefore[index]);
    });
    assert.ok(rankAfter.some((rank, index) => index !== leaderIndex && rank !== rankBefore[index]));
    assert.ok(descriptorAnalysisCacheHits() >= beforeHits + 2);
    const restored = first.map((model) => ({ slotId: model.id, ...evaluateTileModel(model) }));
    assignRelativeRanks(restored);
    const openRestored = restored.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.absoluteScore);
    const rankRestored = restored.map((form) => form.descriptors.find((descriptor) => descriptor.id === "openVolume")!.comparativeRank);
    assert.deepEqual(openRestored, openBefore);
    assert.deepEqual(rankRestored, rankBefore);
  });
});
