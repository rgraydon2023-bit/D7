import { DEFAULT_DESCRIPTORS, type CompositionPlacement } from "../src/components/compositionEngine";
import { DEFAULT_CONTINUITY_CONTROLS, TYPOLOGY_RULES, buildAggregation, generateProtoArchitecture, type AmphitheaterVariation, type ArchitecturalElement, type PrototypeGeometryMode } from "../src/components/amphitheaterPrototype";

const letters = ["V", "U", "L", "V", "L", "U", "V", "U", "L", "V", "U", "L"] as const;
const source: CompositionPlacement[] = letters.map((letter, index) => {
  const layerIndex = Math.floor(index / 4);
  const position = index % 4;
  return {
    cell: { id: `matrix-${index}`, letter, rotation: (index * 23) % 90 },
    sourceIndex: index,
    layerIndex,
    x: (position % 2) * 1.3 - .65 + Math.sin(index * .8) * .18,
    y: Math.floor(position / 2) * 1.3 - .65 + Math.cos(index * .6) * .18,
    z: layerIndex * 1.05,
    rx: (index % 3) * 18,
    ry: (index % 2) * 22,
    rz: (index * 31) % 120,
    scale: .72,
  };
});

const descriptors = structuredClone(DEFAULT_DESCRIPTORS);
descriptors.openVolume.intensity = 58;
descriptors.convergent.intensity = 62;
descriptors.sculptural.intensity = 55;
descriptors.visuallyConnected.intensity = 64;
descriptors.sequential.intensity = 60;
descriptors.circulationActivated.intensity = 68;
descriptors.centralized.intensity = 52;
descriptors.verticallyIntegrated.intensity = 61;
descriptors.luminous.intensity = 57;

const requestedTypology = process.argv[2];
const requestedMode = (process.argv[3] ?? "combined") as PrototypeGeometryMode;
const contrastTypologies = new Set([
  "stepped-amphitheater", "void-field-gathering", "contained-room-within-volume", "linear-edge-gallery",
  "open-hall-workspace", "folded-undulating-work-surface", "void-edge-workspace",
]);
const testedRules = requestedTypology === "contrast"
  ? TYPOLOGY_RULES.filter((rule) => contrastTypologies.has(rule.id))
  : requestedTypology ? TYPOLOGY_RULES.filter((rule) => rule.id === requestedTypology) : TYPOLOGY_RULES;
const generated: AmphitheaterVariation[] = [];
const rows = testedRules.map((rule) => {
  const result = generateProtoArchitecture({
    source,
    descriptors,
    mode: requestedMode,
    category: rule.category,
    typology: rule.id,
    seed: 2041,
    continuityControls: DEFAULT_CONTINUITY_CONTROLS,
  });
  generated.push(result);
  return {
    category: rule.category,
    typology: rule.id,
    name: rule.name,
    primary: rule.operations.primary,
    secondary: rule.operations.secondary,
    terrace: result.typologyDebug.terraceActive,
    components: result.connectivity.componentsAfter,
    occupiedRegions: result.typologyDebug.principalOccupiedRegions,
    principalVoids: result.typologyDebug.principalVoids,
    plates: result.typologyDebug.discreteFloorPlates,
    continuousSurfaces: result.typologyDebug.continuousSurfaces,
    circulationPaths: result.typologyDebug.primaryCirculationPaths,
    rawTopology: result.typologyDebug.rawTopology,
    criterion: result.architecturalValidation.typologyCriterion.label,
    criterionValue: Number(result.architecturalValidation.typologyCriterion.value.toFixed(2)),
    criterionUnit: result.architecturalValidation.typologyCriterion.unit,
    criterionPassed: result.architecturalValidation.typologyCriterion.passed,
    validationScore: result.architecturalValidation.score,
    valid: result.architecturalValidation.valid,
    failures: result.architecturalValidation.failures,
    geometry: {
      vertices: result.presentationMesh.positions.length / 3,
      triangles: result.presentationMesh.indices.length / 3,
      components: result.presentationMesh.componentCount,
      horizontalArea: Number(result.surfaceDiagnostics.final.horizontalArea.toFixed(2)),
      verticalExtent: Number(result.verticalExtents.final.extent.toFixed(2)),
      componentBounds: result.continuousMesh.componentBounds,
    },
    interlocking: ([2, 4, 8] as const).map((count) => {
      const aggregation = buildAggregation(result, count);
      return { count, valid: aggregation.validation.valid, failures: aggregation.validation.failures };
    }),
  };
});

const footprint = (element: ArchitecturalElement) => element.footprint ?? [
  [element.x - element.width / 2, element.y - element.depth / 2], [element.x + element.width / 2, element.y - element.depth / 2],
  [element.x + element.width / 2, element.y + element.depth / 2], [element.x - element.width / 2, element.y + element.depth / 2],
] as Array<[number, number]>;
const pointInPolygon = (point: [number, number], polygon: Array<[number, number]>) => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [xi, yi] = polygon[current], [xj, yj] = polygon[previous];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const overlap = (first: ArchitecturalElement[], second: ArchitecturalElement[]) => {
  const polygons = (elements: ArchitecturalElement[]) => elements.filter((element) => element.kind !== "void" && element.kind !== "connector").map(footprint);
  const firstPolygons = polygons(first), secondPolygons = polygons(second);
  let intersection = 0, union = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const point: [number, number] = [-10 + (x + .5) * 20 / 64, -10 + (y + .5) * 20 / 64];
    const inFirst = firstPolygons.some((polygon) => pointInPolygon(point, polygon));
    const inSecond = secondPolygons.some((polygon) => pointInPolygon(point, polygon));
    if (inFirst || inSecond) union++;
    if (inFirst && inSecond) intersection++;
  }
  return union ? Number((intersection / union * 100).toFixed(1)) : 0;
};
const voidField = generated.find((result) => result.typology === "void-field-gathering");
const voidEdge = generated.find((result) => result.typology === "void-edge-workspace");
const voidModeComparison = voidField && voidEdge ? {
  rawPlanOverlapPercent: overlap(voidField.disconnectedElements, voidEdge.disconnectedElements),
  afterConnectorPlanOverlapPercent: overlap(voidField.elements, voidEdge.elements),
} : undefined;

process.stdout.write(JSON.stringify({
  setup: { mode: requestedMode, seed: 2041, sourceObjects: source.length, scale: .72, descriptorProfile: "shared matrix profile" },
  voidModeComparison,
  passed: rows.filter((row) => row.criterionPassed).length,
  failed: rows.filter((row) => !row.criterionPassed).map((row) => row.typology),
  rows,
}, null, 2));
