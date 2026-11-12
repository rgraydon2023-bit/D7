import { repairToHardConstraints } from "./constraintValidation";
import { evaluateSpatialDesign } from "./descriptorEvaluation";
import { generateSpatialCandidate } from "./geometryGenerator";
import type { CandidateFocus, OptimizationInput, SpatialAlternative } from "./optimizerTypes";
import { selectBestSubvolume, selectionEvaluationGrid } from "./selectionSearch";
import type { Letter } from "./letterTypes";

function rankingValue(alternative: SpatialAlternative) {
  if (!alternative.evaluation.constraints.feasible) return -1000 - alternative.evaluation.constraints.violations.length;
  return alternative.evaluation.fit ?? 0;
}

function selectedLetterCount(alternative: SpatialAlternative, selectedLetters: readonly Letter[]) {
  const selected = new Set(selectedLetters);
  return alternative.placements.reduce((count, placement) => count + (selected.has(placement.cell.letter) ? 1 : 0), 0);
}

function topAlternatives(alternatives: SpatialAlternative[], count: number, selectedLetters: readonly Letter[]) {
  const unique = new Map<string, SpatialAlternative>();
  for (const alternative of alternatives) {
    const signature = alternative.placements.slice(0, 12).map((placement) => `${placement.x.toFixed(2)},${placement.y.toFixed(2)},${placement.z.toFixed(2)},${placement.rz}`).join("|");
    const current = unique.get(signature);
    if (!current || selectedLetterCount(alternative, selectedLetters) > selectedLetterCount(current, selectedLetters) || (selectedLetterCount(alternative, selectedLetters) === selectedLetterCount(current, selectedLetters) && rankingValue(alternative) > rankingValue(current))) unique.set(signature, alternative);
  }
  return [...unique.values()].sort((a, b) => selectedLetterCount(b, selectedLetters) - selectedLetterCount(a, selectedLetters) || rankingValue(b) - rankingValue(a)).slice(0, count);
}

function candidateFocus(input: OptimizationInput, index: number): CandidateFocus {
  if (input.focus !== "auto") return input.focus;
  return (["letter", "void", "combined"] as const)[index % 3];
}

function evaluateCandidate(input: OptimizationInput, focus: CandidateFocus, seed: number, generation: number, parent?: SpatialAlternative | null) {
  const generationParent = parent?.fullPlacements ? { ...parent, placements: parent.fullPlacements } : parent;
  const selectionMaximum = input.selection.enabled
    ? Math.max(input.rules.minimumLetterSize, Math.min(
        input.rules.maximumLetterSize,
        Math.max(0.05, (input.selection.width - input.rules.minimumClearance) / 2) * 0.92,
        input.selection.height * 0.72,
        input.selection.depth * 0.9,
      ))
    : input.rules.maximumLetterSize;
  const generationRules = { ...input.rules, maximumLetterSize: selectionMaximum };
  const generated = generateSpatialCandidate({
    sourceCells: input.sourceCells,
    grid: input.grid,
    rules: generationRules,
    descriptors: input.descriptors,
    focus,
    seed,
    intensity: input.controls.intensity,
    parent: generationParent,
    preservePercent: input.controls.preservePercent,
  });
  const placements = repairToHardConstraints(generated, input.grid, generationRules);
  const evaluationFocus = input.focus === "auto" ? focus : input.focus;
  const evaluation = evaluateSpatialDesign({
    placements,
    grid: input.grid,
    rules: input.rules,
    descriptors: input.descriptors,
    controls: input.controls,
    focus: evaluationFocus,
    sourceCount: input.sourceCells.length,
    ignoreCirculationClearance: true,
  });
  const fullAlternative = { id: `${focus}-${seed}-${generation}`, seed, focus, placements, evaluation, generation } satisfies SpatialAlternative;
  if (!input.selection.enabled) return fullAlternative;
  return selectBestSubvolume({
    fullPlacements: placements,
    overallGrid: input.grid,
    selection: input.selection,
    rules: input.rules,
    descriptors: input.descriptors,
    controls: input.controls,
    focus: evaluationFocus,
    seed,
    generation,
    selectedLetters: input.selectedLetters,
    ignoreCirculationClearance: true,
    maxPositions: 36,
  }) ?? fullAlternative;
}

export async function optimizeSpatial(
  input: OptimizationInput,
  onProgress?: (progress: number, strongest: SpatialAlternative[]) => void,
) {
  input = { ...input, controls: { ...input.controls, alternatives: Math.min(4, input.controls.alternatives) }, selection: { ...input.selection, enabled: true } };
  const activeWeights = Object.values(input.descriptors).reduce((sum, descriptor) => sum + descriptor.importance, 0);
  const pool: SpatialAlternative[] = [];
  let strongest: SpatialAlternative[] = [];
  const population = Math.max(input.controls.alternatives * 2, 6);
  for (let generation = 0; generation < input.controls.generations; generation++) {
    for (let index = 0; index < population; index++) {
      const focus = candidateFocus(input, generation * population + index);
      const seed = input.controls.seed + generation * 104729 + index * 7919;
      const parent = input.lockedParent ?? strongest[index % Math.max(strongest.length, 1)] ?? null;
      pool.push(evaluateCandidate(input, focus, seed, generation, parent));
    }
    strongest = topAlternatives(pool, input.controls.alternatives, input.selectedLetters);
    onProgress?.(Math.round((generation + 1) / input.controls.generations * 100), strongest);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  if (input.focus === "auto") {
    // Re-score every focus using one common combined objective before comparison.
    const common = pool.map((alternative) => ({
      ...alternative,
      evaluation: evaluateSpatialDesign({
        placements: alternative.placements,
        grid: alternative.selection ? selectionEvaluationGrid(alternative.selection, input.grid) : input.grid,
        rules: input.rules,
        descriptors: input.descriptors,
        controls: input.controls,
        focus: "combined",
        sourceCount: alternative.selection ? undefined : input.sourceCells.length,
        bounds: alternative.selection ? "center" : "body",
        ignoreCirculationClearance: true,
      }),
    }));
    const ranked = topAlternatives(common, common.length, input.selectedLetters);
    strongest = ranked.slice(0, input.controls.alternatives);
  }
  if (input.selection.enabled) {
    strongest = strongest.map((alternative) => {
      if (!alternative.fullPlacements) return alternative;
      const refined = selectBestSubvolume({
        fullPlacements: alternative.fullPlacements,
        overallGrid: input.grid,
        selection: input.selection,
        rules: input.rules,
        descriptors: input.descriptors,
        controls: input.controls,
        focus: input.focus === "auto" ? "combined" : alternative.focus,
        seed: alternative.seed,
        generation: alternative.generation,
        selectedLetters: input.selectedLetters,
        ignoreCirculationClearance: true,
        maxPositions: 1200,
      });
      return refined ? { ...refined, focus: alternative.focus } : alternative;
    });
    if (input.focus === "auto") {
      const ranked = [...strongest].sort((a, b) => selectedLetterCount(b, input.selectedLetters) - selectedLetterCount(a, input.selectedLetters) || rankingValue(b) - rankingValue(a));
      strongest = ranked.slice(0, input.controls.alternatives);
    } else strongest = topAlternatives(strongest, input.controls.alternatives, input.selectedLetters);
  }
  return { alternatives: strongest, rankingEnabled: input.selectedLetters.length > 0 || activeWeights > 0 };
}
