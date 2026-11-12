/**
 * Diagnostic only. Scores the 15 Lattice-session OBJs with the live descriptor
 * formulas and writes calibration tables. Does not change scores.
 *
 * Usage: npx tsx scripts/descriptor-calibration.ts [session.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzeMesh } from "../src/components/lattice/analyze";
import { LATTICE_SLOTS } from "../src/components/lattice/slots";
import { UNIT_TO_FEET, resolvedUp, unpackCell, type ImportedObj, type UpAxis } from "../src/components/lattice/types";
import { DESCRIPTOR_ALGORITHM_VERSION } from "../src/components/evaluations/descriptorV2";
import { assignRelativeRanks, evaluateTileModel, normalizedDescriptorTerms, type RawObjMetrics } from "../src/components/evaluations/objDescriptorAnalysis";
import { measureOpenVolume } from "../src/components/evaluations/openVolume";

type PackedMesh = Omit<ImportedObj, "positions" | "normals"> & {
  positions: number[];
  normals: number[];
};

type Session = {
  meshes: PackedMesh[];
  assignments: Record<string, string | null>;
  unit: keyof typeof UNIT_TO_FEET;
  upAxisMode: "auto" | UpAxis;
};

const sessionPath = process.argv[2] ?? path.join("checkpoints", "lattice-session.json");
const outDir = path.join("reports", "descriptor-calibration");

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const unique = new Set(values.map((value) => Math.round(value))).size;
  return {
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    mean: round(avg),
    median: round(median),
    standardDeviation: round(sd),
    range: round(sorted[n - 1] - sorted[0]),
    uniqueRounded: unique,
    coefficientOfVariation: round(avg === 0 ? 0 : sd / Math.abs(avg), 3),
  };
}

function ranks(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  for (let index = 0; index < indexed.length;) {
    let end = index;
    while (end < indexed.length && indexed[end].value === indexed[index].value) end += 1;
    const rank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) out[indexed[cursor].index] = rank;
    index = end;
  }
  return out;
}

function pearson(left: number[], right: number[]) {
  const n = left.length;
  const meanLeft = mean(left);
  const meanRight = mean(right);
  let numerator = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (let index = 0; index < n; index += 1) {
    const a = left[index] - meanLeft;
    const b = right[index] - meanRight;
    numerator += a * b;
    leftSq += a * a;
    rightSq += b * b;
  }
  if (leftSq === 0 || rightSq === 0) return null;
  return round(numerator / Math.sqrt(leftSq * rightSq), 3);
}

function spearman(left: number[], right: number[]) {
  return pearson(ranks(left), ranks(right));
}

function tightestBand(values: number[], width: number) {
  const sorted = [...values].sort((a, b) => a - b);
  let best = 0;
  let bestMin = sorted[0];
  let cursor = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    while (sorted[index] - sorted[cursor] > width) cursor += 1;
    const count = index - cursor + 1;
    if (count > best) {
      best = count;
      bestMin = sorted[cursor];
    }
  }
  return { count: best, share: round(best / values.length, 3), from: round(bestMin), to: round(bestMin + width) };
}

function saturationFlags(values: number[]) {
  const summary = stats(values);
  const band = tightestBand(values, 5);
  const above90 = values.filter((value) => value >= 90).length / values.length;
  const below10 = values.filter((value) => value <= 10).length / values.length;
  const flags: string[] = [];
  if (band.share >= 0.8) flags.push(`80%+ of forms sit in a 5-point band (${band.from}–${band.to})`);
  if (summary.standardDeviation < 5) flags.push(`standard deviation ${summary.standardDeviation} is very low`);
  if (above90 >= 0.8) flags.push(`${Math.round(above90 * 100)}% of forms score 90 or above`);
  if (below10 >= 0.8) flags.push(`${Math.round(below10 * 100)}% of forms score 10 or below`);
  if (summary.uniqueRounded < 5) flags.push(`only ${summary.uniqueRounded} distinct rounded scores`);
  return { ...summary, fivePointBand: band, above90: round(above90, 3), below10: round(below10, 3), flags };
}

const session = JSON.parse(readFileSync(sessionPath, "utf8")) as Session;
const byId = new Map(session.meshes.map((mesh) => [mesh.id, mesh]));
const scale = UNIT_TO_FEET[session.unit] ?? 1;

const forms = LATTICE_SLOTS.map((slot) => {
  const meshId = session.assignments[slot.id];
  const packed = meshId ? byId.get(meshId) : undefined;
  if (!packed) throw new Error(`Slot ${slot.id} has no assigned mesh`);
  const faces = (packed.faces as Array<{ vertices: number[]; normals: number[] | null } | number[]>).map((face) => (
    Array.isArray(face) ? { vertices: face, normals: null } : face
  ));
  const mesh: ImportedObj = {
    ...packed,
    positions: Float32Array.from(packed.positions),
    normals: Float32Array.from(packed.normals?.length ? packed.normals : packed.positions.map(() => 0)),
    faces,
    groups: packed.groups?.length ? packed.groups : [{ name: packed.filename, faceStart: 0, faceCount: faces.length }],
  };
  const up = resolvedUp(mesh.upAxis, session.upAxisMode);
  const model = analyzeMesh(mesh, slot.id, scale, up);
  const evaluation = evaluateTileModel(model, {
    positions: mesh.positions,
    faces: mesh.faces,
    up,
    unitScale: scale,
  });
  const raw = evaluation.raw as RawObjMetrics;
  const occupied = (model.variants[0]?.occupied ?? []).map((packedCell) => unpackCell(packedCell));
  const open = measureOpenVolume(occupied);
  return {
    slotId: slot.id,
    code: slot.code,
    category: slot.category,
    slotName: slot.name,
    filename: mesh.filename,
    meshId: mesh.id,
    upAxis: up,
    unit: session.unit,
    vertexCount: mesh.positions.length / 3,
    faceCount: mesh.faces.reduce((sum, face) => sum + Math.max(0, (face.vertices?.length ?? 0) - 2), 0),
    cellFeet: model.cellFeet,
    raw,
    normalized: normalizedDescriptorTerms(raw),
    openVolume: open,
    confidence: evaluation.confidence,
    descriptors: evaluation.descriptors.map((descriptor) => ({
      id: descriptor.id,
      name: descriptor.name,
      score: descriptor.score,
      absoluteScore: descriptor.absoluteScore,
      comparativeRank: descriptor.comparativeRank,
      relativePercentile: descriptor.relativePercentile,
      tieBreakUsed: descriptor.tieBreakUsed ?? false,
      components: descriptor.components.map((component) => ({
        name: component.name,
        raw: component.raw,
        rawUnit: component.rawUnit,
        value: component.value,
        precise: component.precise,
        weight: component.weight,
        contribution: component.contribution,
      })),
    })),
  };
});
assignRelativeRanks(forms);

const descriptorIds = forms[0].descriptors.map((descriptor) => descriptor.id);
for (const id of descriptorIds) {
  const ranks = forms.map((form) => form.descriptors.find((descriptor) => descriptor.id === id)!.comparativeRank);
  const expected = forms.map((_, index) => index + 1);
  const sorted = [...ranks].sort((left, right) => left! - right!);
  if (sorted.some((rank, index) => rank !== expected[index])) {
    throw new Error(`${id} ranks are not exactly 1 through ${forms.length}: ${sorted.join(",")}`);
  }
}
const scoreColumns = Object.fromEntries(descriptorIds.map((id) => {
  const rounded = forms.map((form) => form.descriptors.find((descriptor) => descriptor.id === id)!.score);
  const column = forms.map((form) => form.descriptors.find((descriptor) => descriptor.id === id)!.absoluteScore);
  const lowest = forms.reduce((best, form) => {
    const score = form.descriptors.find((descriptor) => descriptor.id === id)!.absoluteScore;
    return score < best.score ? { slotId: form.slotId, filename: form.filename, score } : best;
  }, { slotId: forms[0].slotId, filename: forms[0].filename, score: Infinity });
  const highest = forms.reduce((best, form) => {
    const score = form.descriptors.find((descriptor) => descriptor.id === id)!.absoluteScore;
    return score > best.score ? { slotId: form.slotId, filename: form.filename, score } : best;
  }, { slotId: forms[0].slotId, filename: forms[0].filename, score: -Infinity });
  return [id, { name: forms[0].descriptors.find((descriptor) => descriptor.id === id)!.name, scores: saturationFlags(rounded), lowest, highest, values: column }];
}));

const componentKeys: string[] = [];
const componentColumns = new Map<string, number[]>();
for (const form of forms) {
  for (const descriptor of form.descriptors) {
    for (const component of descriptor.components) {
      const key = `${descriptor.name}\t${component.name}`;
      if (!componentColumns.has(key)) {
        componentColumns.set(key, []);
        componentKeys.push(key);
      }
    }
  }
}
for (const form of forms) {
  for (const key of componentKeys) {
    const [descriptorName, componentName] = key.split("\t");
    const descriptor = form.descriptors.find((item) => item.name === descriptorName);
    const component = descriptor?.components.find((item) => item.name === componentName);
    componentColumns.get(key)!.push(component?.value ?? 0);
  }
}

const componentStats = componentKeys.map((key) => {
  const values = componentColumns.get(key)!;
  const summary = stats(values);
  const at0 = values.filter((value) => value === 0).length / values.length;
  const at100 = values.filter((value) => value === 100).length / values.length;
  const flags: string[] = [];
  if (at100 >= 0.5) flags.push(`${Math.round(at100 * 100)}% of forms are 100`);
  if (at0 >= 0.5) flags.push(`${Math.round(at0 * 100)}% of forms are 0`);
  if (summary.standardDeviation < 5) flags.push("variation is negligible");
  if (summary.uniqueRounded <= 4) flags.push(`only ${summary.uniqueRounded} discrete values`);
  return {
    component: key.replace("\t", " / "),
    ...summary,
    percentAt0: round(at0 * 100),
    percentAt100: round(at100 * 100),
    flags,
  };
});

function matrix(kind: "pearson" | "spearman") {
  const fn = kind === "pearson" ? pearson : spearman;
  const rows: Array<Record<string, number | string | null>> = [];
  const pairs: Array<{ left: string; right: string; correlation: number }> = [];
  for (let row = 0; row < descriptorIds.length; row += 1) {
    const record: Record<string, number | string | null> = { descriptor: scoreColumns[descriptorIds[row]].name };
    for (let column = 0; column < descriptorIds.length; column += 1) {
      const value = row === column ? 1 : fn(scoreColumns[descriptorIds[row]].values, scoreColumns[descriptorIds[column]].values);
      record[scoreColumns[descriptorIds[column]].name] = value;
      if (column > row && value !== null && Math.abs(value) >= 0.85) {
        pairs.push({ left: scoreColumns[descriptorIds[row]].name, right: scoreColumns[descriptorIds[column]].name, correlation: value });
      }
    }
    rows.push(record);
  }
  return { rows, pairs };
}

const rawKeys = Object.keys(forms[0].raw) as Array<keyof RawObjMetrics>;
const normalizedKeys = Object.keys(forms[0].normalized) as Array<keyof typeof forms[0]["normalized"]>;
const rawPairs: Array<{ left: string; right: string; pearson: number | null; spearman: number | null }> = [];
const series = [
  ...rawKeys.map((key) => ({ name: `raw.${key}`, values: forms.map((form) => Number(form.raw[key])) })),
  ...normalizedKeys.map((key) => ({ name: `norm.${key}`, values: forms.map((form) => Number(form.normalized[key])) })),
];
for (let left = 0; left < series.length; left += 1) {
  for (let right = left + 1; right < series.length; right += 1) {
    const pearsonValue = pearson(series[left].values, series[right].values);
    const spearmanValue = spearman(series[left].values, series[right].values);
    if ((pearsonValue !== null && Math.abs(pearsonValue) >= 0.85) || (spearmanValue !== null && Math.abs(spearmanValue) >= 0.85)) {
      rawPairs.push({ left: series[left].name, right: series[right].name, pearson: pearsonValue, spearman: spearmanValue });
    }
  }
}

const watched = [
  ["Open Volume", "Visually Connected"],
  ["Convergent", "Centralized"],
  ["Surreal", "Hierarchical"],
  ["Sequential", "Circulation Activated"],
];
const watchedPairs = watched.map(([left, right]) => {
  const leftValues = forms.map((form) => form.descriptors.find((descriptor) => descriptor.name === left)!.absoluteScore);
  const rightValues = forms.map((form) => form.descriptors.find((descriptor) => descriptor.name === right)!.absoluteScore);
  return { left, right, pearson: pearson(leftValues, rightValues), spearman: spearman(leftValues, rightValues) };
});

const exportBody = {
  generatedAt: new Date().toISOString(),
  source: "localhost Evaluations lattice session, identity analysis of assigned source meshes",
  unit: session.unit,
  upAxisMode: session.upAxisMode,
  formCount: forms.length,
  forms: forms.map((form) => ({
    ...form,
    raw: form.raw,
    normalized: Object.fromEntries(Object.entries(form.normalized).map(([key, value]) => [key, round(Number(value), 4)])),
    openVolume: Object.fromEntries(Object.entries(form.openVolume).map(([key, value]) => [key, round(Number(value), 2)])),
  })),
  descriptors: Object.fromEntries(Object.entries(scoreColumns).map(([id, column]) => [id, {
    name: column.name,
    ...column.scores,
    lowest: column.lowest,
    highest: column.highest,
    perForm: forms.map((form) => {
      const descriptor = form.descriptors.find((item) => item.id === id)!;
      return {
        slotId: form.slotId,
        filename: form.filename,
        program: form.category,
        absoluteScore: descriptor.absoluteScore,
        comparativeRank: descriptor.comparativeRank,
        percentile: descriptor.relativePercentile,
        score: descriptor.score,
        tieBreakUsed: descriptor.tieBreakUsed,
        confidence: form.confidence,
      };
    }),
  }])),
  components: componentStats,
  correlation: {
    pearson: matrix("pearson"),
    spearman: matrix("spearman"),
    watchedPairs,
  },
  rawMetricPairsAtOrAbove085: rawPairs,
  algorithm: DESCRIPTOR_ALGORITHM_VERSION,
  notes: [
    "Absolute scores stay continuous. comparativeRank 15 is the strongest expression among the current forms. Rank 1 is the weakest. Ranks are not architectural grades.",
    "Ranks use full-precision absolute scores, then raw components by descending weight, then stable slot id.",
    "Legacy normalized terms are still exported for comparison. They are not the V2 score inputs.",
    "Open Volume enclosed void is informational and has weight 0.",
    "Low mass is 1 minus mean 26-neighbor solidity. A convex hull was not used: on a thin plate the hull equals the plate, and on full-span slabs it equals the occupied bounds.",
  ],
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "descriptor-calibration.json"), JSON.stringify(exportBody, null, 2));

const scoreHeader = ["slotId", "filename", "category", "vertices", "cellFeet", ...forms[0].descriptors.map((descriptor) => descriptor.name)];
const scoreLines = [scoreHeader.join(",")];
for (const form of forms) {
  scoreLines.push([
    form.slotId,
    JSON.stringify(form.filename),
    form.category,
    form.vertexCount,
    form.cellFeet,
    ...form.descriptors.map((descriptor) => descriptor.score),
  ].join(","));
}
writeFileSync(path.join(outDir, "descriptor-calibration.csv"), scoreLines.join("\n"));

const componentHeader = ["slotId", "filename", ...componentKeys.map((key) => JSON.stringify(key.replace("\t", " / ")))];
const componentLines = [componentHeader.join(",")];
for (const form of forms) {
  componentLines.push([
    form.slotId,
    JSON.stringify(form.filename),
    ...componentKeys.map((key) => {
      const [descriptorName, componentName] = key.split("\t");
      return form.descriptors.find((descriptor) => descriptor.name === descriptorName)!.components.find((component) => component.name === componentName)!.value;
    }),
  ].join(","));
}
writeFileSync(path.join(outDir, "descriptor-calibration-components.csv"), componentLines.join("\n"));

const rankHeader = ["slotId", "filename", "program", "descriptor", "absoluteScore", "comparativeRank", "percentile", "confidence", "tieBreakUsed", "components"];
const rankLines = [rankHeader.join(",")];
for (const form of forms) {
  for (const descriptor of form.descriptors) {
    const components = descriptor.components.map((component) => `${component.name}=${component.raw}`).join(" | ");
    rankLines.push([
      form.slotId,
      JSON.stringify(form.filename),
      form.category,
      JSON.stringify(descriptor.name),
      descriptor.absoluteScore,
      descriptor.comparativeRank,
      descriptor.relativePercentile,
      form.confidence,
      descriptor.tieBreakUsed,
      JSON.stringify(components),
    ].join(","));
  }
}
writeFileSync(path.join(outDir, "descriptor-ranking.csv"), rankLines.join("\n"));

const rankReport: string[] = [
  "# Descriptor ranking",
  "",
  `Algorithm ${DESCRIPTOR_ALGORITHM_VERSION}. Rank 15 is the strongest expression among these ${forms.length} forms. Rank 1 is the weakest. Ranks are comparative, not architectural grades.`,
  "",
  "Absolute scores are the continuous geometric results. Ranks are assigned after those scores, using full precision.",
  "",
];
for (const id of descriptorIds) {
  const name = scoreColumns[id].name;
  const ordered = forms
    .map((form) => ({ form, descriptor: form.descriptors.find((item) => item.id === id)! }))
    .sort((left, right) => (right.descriptor.comparativeRank ?? 0) - (left.descriptor.comparativeRank ?? 0));
  rankReport.push(`## ${name.toUpperCase()}`, "");
  rankReport.push("| Form | Absolute score | Rank |", "| --- | ---: | ---: |");
  for (const row of ordered) {
    const mark = row.descriptor.tieBreakUsed ? " (id tie-break)" : "";
    rankReport.push(`| ${row.form.slotId} | ${row.descriptor.absoluteScore.toFixed(2)} | ${row.descriptor.comparativeRank}${mark} |`);
  }
  rankReport.push("");
}
const verticalId = "verticallyIntegrated";
const verticalRows = forms
  .map((form) => ({ form, descriptor: form.descriptors.find((item) => item.id === verticalId)! }))
  .sort((left, right) => right.descriptor.absoluteScore - left.descriptor.absoluteScore);
const l1 = verticalRows.find((row) => row.form.slotId === "L1");
const strongestVertical = [...verticalRows].sort((left, right) => (right.descriptor.comparativeRank ?? 0) - (left.descriptor.comparativeRank ?? 0))[0];
rankReport.push("## Vertically Integrated inspection", "");
for (const row of [l1, strongestVertical].filter((row): row is NonNullable<typeof row> => Boolean(row))) {
  rankReport.push(`### ${row.form.slotId} ${row.form.filename}`, "");
  rankReport.push(`Absolute score ${row.descriptor.absoluteScore.toFixed(2)}. Rank ${row.descriptor.comparativeRank}.`, "");
  for (const component of row.descriptor.components) {
    rankReport.push(`- ${component.name}: raw ${component.raw} (${component.rawUnit}), term ${component.precise?.toFixed(2) ?? component.value}, weight ${component.weight}`);
  }
  rankReport.push("");
}
const pearsonPairs = matrix("pearson").pairs;
rankReport.push("## Correlations at or above 0.85", "");
if (!pearsonPairs.length) rankReport.push("None.", "");
for (const pair of pearsonPairs) rankReport.push(`- ${pair.left} / ${pair.right}: ${pair.correlation.toFixed(3)}`);
rankReport.push("");
writeFileSync(path.join(outDir, "DESCRIPTOR_RANKING_REPORT.md"), rankReport.join("\n"));

console.log(JSON.stringify({
  forms: forms.map((form) => ({
    slotId: form.slotId,
    filename: form.filename,
    vertices: form.vertexCount,
    cellFeet: form.cellFeet,
    scores: Object.fromEntries(form.descriptors.map((descriptor) => [descriptor.id, descriptor.score])),
    open: form.openVolume,
    floorLevels: form.raw.floorLevels,
    spanZ: form.raw.spanCellsZ,
    verticalShare: round(form.normalized.verticalShare, 3),
    levelNorm: round(form.normalized.levelNorm, 3),
    recess: round(form.raw.recess, 2),
    projection: round(form.raw.projection, 2),
    centroid: round(form.raw.centroidOffsetPlan, 3),
    passageShare: round(form.normalized.passageShare, 3),
    voidShare: round(form.normalized.voidShare, 3),
  })),
  watchedPairs,
  saturated: Object.values(scoreColumns).filter((column) => column.scores.flags.length).map((column) => ({ name: column.name, ...column.scores })),
}, null, 2));
