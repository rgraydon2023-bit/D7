import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignComparativeRanks, type RankDescriptor } from "./descriptorRank.ts";

function form(formId: string, scores: number[], raws: number[][] = []) {
  const descriptors: RankDescriptor[] = scores.map((absoluteScore, index) => ({
    id: `d${index}`,
    absoluteScore,
    components: (raws[index] ?? [absoluteScore]).map((raw, componentIndex) => ({
      name: `c${componentIndex}`,
      raw,
      weight: 1 - componentIndex * 0.1,
    })),
  }));
  return { formId, descriptors };
}

describe("comparative ranks", () => {
  it("assigns 1 through 15 once, with 15 as the strongest", () => {
    const forms = Array.from({ length: 15 }, (_, index) => form(`F${String(index).padStart(2, "0")}`, [index + 0.1]));
    assignComparativeRanks(forms);
    const ranks = forms.map((item) => item.descriptors[0].comparativeRank);
    assert.deepEqual([...ranks].sort((a, b) => a! - b!), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const strongest = forms.find((item) => item.descriptors[0].absoluteScore === 14.1);
    const weakest = forms.find((item) => item.descriptors[0].absoluteScore === 0.1);
    assert.equal(strongest?.descriptors[0].comparativeRank, 15);
    assert.equal(weakest?.descriptors[0].comparativeRank, 1);
    assert.equal(strongest?.descriptors[0].tieBreakUsed, false);
  });

  it("ranks full-precision scores above their rounded twins", () => {
    const forms = [
      form("A", [67.4821]),
      form("B", [67.1937]),
    ];
    assignComparativeRanks(forms);
    assert.equal(forms[0].descriptors[0].comparativeRank, 2);
    assert.equal(forms[1].descriptors[0].comparativeRank, 1);
  });

  it("breaks exact ties with raw components, then form id", () => {
    const tied = [
      form("B", [40], [[40, 2]]),
      form("A", [40], [[40, 2]]),
      form("C", [40], [[40, 9]]),
    ];
    assignComparativeRanks(tied);
    const byId = Object.fromEntries(tied.map((item) => [item.formId, item.descriptors[0]]));
    assert.equal(byId.C.comparativeRank, 3);
    assert.equal(byId.A.comparativeRank, 1);
    assert.equal(byId.B.comparativeRank, 2);
    assert.equal(byId.C.tieBreakUsed, false);
    assert.equal(byId.A.tieBreakUsed, true);
    assert.equal(byId.B.tieBreakUsed, true);
    assert.equal(byId.A.absoluteScore, 40);
    assert.equal(byId.B.absoluteScore, 40);
  });

  it("re-ranks a replaced form from cached absolute scores", () => {
    const geometry = new Map<string, number>();
    let computes = 0;
    const analyze = (id: string, score: number) => {
      if (!geometry.has(id)) {
        computes += 1;
        geometry.set(id, score);
      }
      return form(id, [geometry.get(id)!]);
    };
    const original = ["G1", "O1", "L1"].map((id, index) => analyze(id, 10 + index));
    assignComparativeRanks(original);
    const before = original.map((item) => item.descriptors[0].comparativeRank);
    const replaced = [
      analyze("G1", 10),
      analyze("O1", 11),
      form("L1", [5]),
    ];
    assignComparativeRanks(replaced);
    assert.equal(computes, 3);
    assert.equal(replaced[0].descriptors[0].absoluteScore, 10);
    assert.equal(replaced[1].descriptors[0].absoluteScore, 11);
    assert.equal(replaced[0].descriptors[0].comparativeRank, 2);
    assert.equal(replaced[1].descriptors[0].comparativeRank, 3);
    assert.equal(replaced[2].descriptors[0].comparativeRank, 1);
    assert.notDeepEqual(replaced.map((item) => item.descriptors[0].comparativeRank), before);
    const restored = ["G1", "O1", "L1"].map((id, index) => analyze(id, 10 + index));
    assignComparativeRanks(restored);
    assert.deepEqual(restored.map((item) => item.descriptors[0].comparativeRank), before);
    assert.equal(computes, 3);
  });

  it("is deterministic", () => {
    const once = [form("L1", [3.2, 8]), form("G1", [9.1, 1]), form("O3", [9.1, 4])];
    const twice = [form("O3", [9.1, 4]), form("L1", [3.2, 8]), form("G1", [9.1, 1])];
    assignComparativeRanks(once);
    assignComparativeRanks(twice);
    const read = (forms: typeof once) => forms
      .slice()
      .sort((left, right) => left.formId.localeCompare(right.formId))
      .map((item) => item.descriptors.map((descriptor) => [descriptor.absoluteScore, descriptor.comparativeRank]));
    assert.deepEqual(read(once), read(twice));
  });
});
