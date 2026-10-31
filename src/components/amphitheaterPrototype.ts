import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import type { CompositionPlacement, DescriptorSettings } from "./compositionEngine";
import { getLetterShape, getLetterVolumeGeometry } from "./letterGeometry3d";

export type PrototypeGeometryMode = "letters" | "voids" | "combined";
export type PrototypeCategory = "gathering" | "office" | "lobby";
export type PrototypeTypologyId =
  | "stepped-amphitheater" | "void-field-gathering" | "inserted-horizontal-plate" | "contained-room-within-volume" | "linear-edge-gallery"
  | "open-hall-workspace" | "cascaded-terraced-plates" | "flat-deep-plan-plate" | "void-edge-workspace" | "folded-undulating-work-surface"
  | "vertical-void-lobby" | "compressed-sequential-lobby" | "continuous-hall-lobby" | "topographic-ground-field-lobby" | "linear-gallery-lobby";
export type SpatialOperation = "PLATE" | "VOID" | "EDGE" | "FOLD" | "TERRACE" | "ENCLOSE" | "LINEARIZE" | "BRIDGE" | "FIELD" | "VERTICALIZE" | "TOPOGRAPH" | "CONVERGE" | "SEQUENCE" | "OVERLOOK" | "PROJECT" | "CONTAIN" | "OPENNESS" | "CONTINUITY" | "DEPTH";
export type TypologyOperationRecipe = { primary: SpatialOperation[]; secondary: SpatialOperation[]; optional: SpatialOperation[]; disabled: SpatialOperation[] };
export type TypologyBehaviors = {
  horizontalPlateDominance: number; verticalVoidDominance: number; enclosure: number; openness: number;
  linearity: number; convergence: number; sequence: number; terracing: number; edgeOccupation: number;
  centralization: number; verticalConnectivity: number; surfaceContinuity: number; topographicDeformation: number;
  plateProjection: number; containment: number; voidPreservation: number;
};
export type TypologyRuleSet = {
  id: PrototypeTypologyId; category: PrototypeCategory; name: string; description: string; behaviors: TypologyBehaviors; operations: TypologyOperationRecipe;
};
export const CATEGORY_DEFINITIONS: Record<PrototypeCategory, { name: string; description: string; purpose: string }> = {
  gathering: { name: "Gathering", description: "Rooms and sectional conditions for meeting, presentation, and informal encounter.", purpose: "Collective occupation, meeting, presentation, informal interaction, visibility, and relationships between participants." },
  office: { name: "Office", description: "Desk-scale and plate-scale workplaces for focused and collaborative work.", purpose: "Individual and collaborative work, workspace organization, occupied floor plates, and relationships between work areas." },
  lobby: { name: "Lobby", description: "Arrival and vertical connection as one spatial problem. The threshold from city to workplace and the rise through the building are studied together.", purpose: "Arrival, transition, movement, and vertical connection are developed as one spatial sequence." },
};
const behavior = (values: Partial<TypologyBehaviors>): TypologyBehaviors => ({
  horizontalPlateDominance: .5, verticalVoidDominance: 0, enclosure: .2, openness: .5, linearity: 0,
  convergence: 0, sequence: .3, terracing: 0, edgeOccupation: 0, centralization: .3, verticalConnectivity: .4,
  surfaceContinuity: .7, topographicDeformation: 0, plateProjection: .2, containment: 0, voidPreservation: .4, ...values,
});
export const SPATIAL_OPERATIONS: SpatialOperation[] = ["PLATE", "VOID", "EDGE", "FOLD", "TERRACE", "ENCLOSE", "LINEARIZE", "BRIDGE", "FIELD", "VERTICALIZE", "TOPOGRAPH", "CONVERGE", "SEQUENCE", "OVERLOOK", "PROJECT", "CONTAIN", "OPENNESS", "CONTINUITY", "DEPTH"];
const recipe = (primary: SpatialOperation[], secondary: SpatialOperation[], optional: SpatialOperation[] = []): TypologyOperationRecipe => {
  const active = new Set([...primary, ...secondary, ...optional]);
  return { primary, secondary, optional, disabled: SPATIAL_OPERATIONS.filter((operation) => !active.has(operation)) };
};
export const TYPOLOGY_RULES: TypologyRuleSet[] = [
  { id: "stepped-amphitheater", category: "gathering", name: "Stepped Amphitheater", description: "Multiple occupied levels form a recognizable gathering focus with connected terraced circulation.", behaviors: behavior({ terracing: 1, convergence: .9, centralization: .9, verticalConnectivity: .85, openness: .65, sequence: .65 }), operations: recipe(["TERRACE", "CONVERGE"], ["SEQUENCE", "OVERLOOK", "BRIDGE"], ["PLATE", "VOID"]) },
  { id: "void-field-gathering", category: "gathering", name: "Void-Field Gathering", description: "Distributed gathering surfaces and bridges are organized by a field of related open volumes.", behaviors: behavior({ verticalVoidDominance: .65, openness: .9, voidPreservation: 1, edgeOccupation: .65, plateProjection: .55, centralization: .1 }), operations: recipe(["VOID", "FIELD"], ["BRIDGE", "EDGE", "OVERLOOK"], ["PLATE", "SEQUENCE"]) },
  { id: "inserted-horizontal-plate", category: "gathering", name: "Inserted Horizontal Plate", description: "Projecting and overlapping occupied plates extend into a larger open volume.", behaviors: behavior({ horizontalPlateDominance: 1, plateProjection: 1, openness: .65, surfaceContinuity: .9, verticalConnectivity: .55 }), operations: recipe(["PLATE", "PROJECT"], ["VOID", "BRIDGE", "OVERLOOK"], ["FOLD"]) },
  { id: "contained-room-within-volume", category: "gathering", name: "Contained Room-Within-Volume", description: "A legible occupied enclosure sits within a larger surrounding spatial volume.", behaviors: behavior({ enclosure: 1, containment: 1, centralization: .8, openness: .35, voidPreservation: .65 }), operations: recipe(["CONTAIN", "ENCLOSE"], ["VOID", "OVERLOOK", "BRIDGE"], ["PLATE"]) },
  { id: "linear-edge-gallery", category: "gathering", name: "Linear Edge Gallery", description: "Gathering and circulation follow an elongated edge beside a larger adjoining open space.", behaviors: behavior({ linearity: 1, edgeOccupation: 1, sequence: .85, openness: .7, convergence: 0 }), operations: recipe(["LINEARIZE", "EDGE"], ["SEQUENCE", "OVERLOOK", "BRIDGE"], ["VOID", "PLATE"]) },
  { id: "open-hall-workspace", category: "office", name: "Open Hall Workspace", description: "A large continuous workplace provides flexible organization and broad visual connection.", behaviors: behavior({ horizontalPlateDominance: .95, openness: .8, surfaceContinuity: 1, enclosure: .05, centralization: .2 }), operations: recipe(["PLATE"], ["OPENNESS", "CONTINUITY"], ["VOID", "EDGE", "BRIDGE"]) },
  { id: "cascaded-terraced-plates", category: "office", name: "Cascaded / Terraced Plates", description: "Vertically offset workplace plates support differentiated but connected work areas.", behaviors: behavior({ horizontalPlateDominance: .85, terracing: .75, verticalConnectivity: .85, plateProjection: .65, convergence: .15 }), operations: recipe(["TERRACE", "PLATE"], ["OVERLOOK", "BRIDGE", "SEQUENCE"], ["VOID", "PROJECT"]) },
  { id: "flat-deep-plan-plate", category: "office", name: "Flat Deep-Plan Plate", description: "A broad, substantially deep and predominantly horizontal workplace plate remains continuous.", behaviors: behavior({ horizontalPlateDominance: 1, surfaceContinuity: 1, openness: .45, verticalConnectivity: .1, terracing: 0, plateProjection: .35 }), operations: recipe(["PLATE", "DEPTH"], ["CONTINUITY"], ["VOID", "EDGE"]) },
  { id: "void-edge-workspace", category: "office", name: "Void-Edge Workspace", description: "Occupied workplace edges surround and bridge significant atria and openings.", behaviors: behavior({ horizontalPlateDominance: .8, verticalVoidDominance: .65, voidPreservation: .95, edgeOccupation: 1, openness: .7 }), operations: recipe(["VOID", "EDGE"], ["PLATE", "BRIDGE", "OVERLOOK"], ["PROJECT", "VERTICALIZE"]) },
  { id: "folded-undulating-work-surface", category: "office", name: "Folded / Undulating Work Surface", description: "Continuous occupiable work surfaces change elevation through controlled folds and transitions.", behaviors: behavior({ horizontalPlateDominance: .75, topographicDeformation: 1, surfaceContinuity: 1, verticalConnectivity: .75, terracing: .2 }), operations: recipe(["FOLD", "TOPOGRAPH", "PLATE"], ["CONTINUITY"], ["BRIDGE", "SEQUENCE"] ) },
  { id: "vertical-void-lobby", category: "lobby", name: "Vertical Void Lobby", description: "Arrival, overlooks, and vertical circulation organize around one strong multilevel opening.", behaviors: behavior({ verticalVoidDominance: 1, verticalConnectivity: 1, voidPreservation: 1, centralization: .85, edgeOccupation: .75, openness: .8 }), operations: recipe(["VOID", "VERTICALIZE"], ["OVERLOOK", "BRIDGE", "SEQUENCE"], ["PLATE", "EDGE"]) },
  { id: "compressed-sequential-lobby", category: "lobby", name: "Compressed Sequential Lobby", description: "Arrival progresses through thresholds, compression, expansion, and changing proportions.", behaviors: behavior({ sequence: 1, linearity: .8, enclosure: .65, openness: .45, surfaceContinuity: .8 }), operations: recipe(["SEQUENCE"], ["LINEARIZE", "ENCLOSE", "OPENNESS"], ["VOID", "FOLD"]) },
  { id: "continuous-hall-lobby", category: "lobby", name: "Continuous Hall Lobby", description: "An uninterrupted arrival hall establishes clear movement from entrance to internal destinations.", behaviors: behavior({ horizontalPlateDominance: .85, linearity: .75, sequence: .75, surfaceContinuity: 1, enclosure: .25 }), operations: recipe(["LINEARIZE", "CONTINUITY"], ["PLATE", "SEQUENCE"], ["VOID", "EDGE"]) },
  { id: "topographic-ground-field-lobby", category: "lobby", name: "Topographic / Ground-Field Lobby", description: "Ramps, terraces, and gradual ground changes distribute arrival through a continuous field.", behaviors: behavior({ topographicDeformation: 1, surfaceContinuity: 1, verticalConnectivity: .9, terracing: .45, openness: .7 }), operations: recipe(["TOPOGRAPH", "FIELD"], ["SEQUENCE", "BRIDGE", "PLATE"], ["VOID", "FOLD"]) },
  { id: "linear-gallery-lobby", category: "lobby", name: "Linear Gallery Lobby", description: "Arrival follows one elongated axis through successive events and connections to adjacent spaces.", behaviors: behavior({ linearity: 1, sequence: 1, edgeOccupation: .75, surfaceContinuity: .9, convergence: 0 }), operations: recipe(["LINEARIZE", "SEQUENCE"], ["EDGE", "OVERLOOK"], ["VOID", "BRIDGE"]) },
];
export const SteppedAmphitheaterRuleSet = TYPOLOGY_RULES[0];
export const DEFAULT_TYPOLOGY_BY_CATEGORY: Record<PrototypeCategory, PrototypeTypologyId> = { gathering: "stepped-amphitheater", office: "flat-deep-plan-plate", lobby: "vertical-void-lobby" };
export const getTypologyRule = (typology: PrototypeTypologyId) => TYPOLOGY_RULES.find((item) => item.id === typology) ?? SteppedAmphitheaterRuleSet;
export type PrototypeView = "isometric" | "plan" | "section";
export type TileEdge = "north" | "east" | "south" | "west";
export type ArchitecturalElementKind = "stage" | "platform" | "circulation" | "enclosure" | "connector" | "void";
export type ArchitecturalSurfaceClass = "horizontal" | "circulation" | "vertical" | "void";
export type Point2 = [number, number];
export type ArchitecturalElement = {
  id: string; kind: ArchitecturalElementKind; x: number; y: number; z: number;
  width: number; depth: number; height: number; rotation: number;
  footprint?: Point2[]; innerFootprint?: Point2[]; rise?: number; transparent?: boolean;
  slopeFrom?: Point2; slopeTo?: Point2;
  /** Complete transformed letter. Spaces use this solid instead of a horizontal cut. */
  letterSolid?: {
    letter: CompositionPlacement["cell"]["letter"];
    rx: number; ry: number; rz: number;
    scaleX: number; scaleY: number; scaleZ: number;
    minY: number;
  };
  provenance?: SourceAssignment;
};
export type SourceAssignment = {
  architecturalElementId: string; sourceMode: PrototypeGeometryMode;
  sourceLetterIds: string[]; sourceRegionIds: string[]; sourceVoidIds: string[]; sourceRelationshipIds: string[];
  typologyOperation: string; descriptorInfluences: string[];
  role: "local" | "envelope" | "fallback"; explanation: string;
  envelopeRegionIds?: string[];
};
export type TileConnector = { edge: TileEdge; interface: "male" | "female"; elevation: number; width: number; openingWidth: number };
export type PrototypeMeasurements = {
  occupiedHorizontalArea: number; interconnectedVoidVolume: number; circulationConnectivity: number;
  platformVisibility: number; usablePlatformCount: number; elevationCount: number;
  principalOrientation: number; boundaryComplexity: number; circulationPathLength: number; connectedComponents: number;
};
export type SurfaceAreaDiagnostic = {
  horizontalArea: number; verticalArea: number; circulationArea: number; voidVolume: number;
  verticalToHorizontalRatio: number; warning?: string;
};
export type PrototypeValidation = { valid: boolean; floorContinuity: boolean; circulationContinuous: boolean; voidsAligned: boolean; unintendedIntersections: number; failures: string[] };
export type SourceBoundary = { id: string; memberIds?: string[]; kind: "letter" | "void"; points: Point2[]; center: Point2; z: number; zMin: number; zMax: number; area: number };
export type SourceRelationship = { id?: string; fromId?: string; toId?: string; from: Point2; to: Point2; fromZ: number; toZ: number; kind: "adjacency" | "void-link" | "solid-void" };
export type ArchitecturalConnection = SourceRelationship & {
  id: string; fromId: string; toId: string; planDistance: number; elevationDifference: number;
  visibility: number; score: number; connectorKind: "terrace" | "bridge" | "ramp";
};
export type ConnectivityDiagnostic = {
  componentsBefore: number; componentsAfter: number; proposedConnections: number; generatedConnectors: number;
};
export type ArchitecturalValidationResult = {
  gatheringSpace: { passed: boolean; area: number };
  steppedPlatforms: { passed: boolean; levels: number };
  circulation: { passed: boolean; coverage: number };
  usableHorizontalSurfaces: { passed: boolean; area: number };
  preservedOpenSpaces: { passed: boolean; area: number };
  typologyCriterion: { label: string; passed: boolean; value: number; unit: string };
  score: number; valid: boolean; failures: string[];
};
export type VerticalExtent = { minZ: number; maxZ: number; extent: number };
export type ContinuityControls = {
  smoothness: number; blendingStrength: number; connectionDistance: number; curvatureIntensity: number;
  preservation: number; minimumOpening: number; verticalIntegration: number;
  interlevelContinuity: number; elevationPreservation: number;
  organicInfluence: number; boundaryCurvature: number; blendRadius: number;
  surfaceRelaxation: number; branchingInfluence: number; sourcePreservation: number;
};
export type TypologyDebug = {
  recipe: TypologyOperationRecipe; terraceActive: boolean; principalOccupiedRegions: number;
  principalVoids: number; discreteFloorPlates: number; continuousSurfaces: number;
  primaryCirculationPaths: number; connectedComponents: number;
  rawTopology: {
    occupiedRegions: number; discretePlates: number; continuousSurfaces: number;
    principalVoids: number; typologySpecificElements: string[]; terraceActive: boolean;
  };
};
export type ContinuousMeshData = {
  positions: number[]; indices: number[]; componentCount: number; degenerateTriangles: number;
  componentBounds: Array<{ triangles: number; horizontalArea: number; min: [number, number, number]; max: [number, number, number] }>;
};
export const DEFAULT_CONTINUITY_CONTROLS: ContinuityControls = {
  smoothness: 58, blendingStrength: 58, connectionDistance: 8, curvatureIntensity: 42,
  preservation: 62, minimumOpening: 2.2, verticalIntegration: 70,
  interlevelContinuity: 75, elevationPreservation: 85,
  organicInfluence: 45, boundaryCurvature: 55, blendRadius: 50,
  surfaceRelaxation: 45, branchingInfluence: 35, sourcePreservation: 62,
};
export type AmphitheaterVariation = {
  quality: "preview" | "final";
  sourceGraph?: { regions: SourceBoundary[]; relationships: SourceRelationship[] };
  unifiedSourceElements?: ArchitecturalElement[];
  fullFormDiagnostic?: {
    sourceComponentsBeforeUnion: number; sourceComponentsAfterUnion: number; disconnectedSourceGroups: number;
    sourceExtent: [number, number, number]; architectureExtent: [number, number, number];
    volumetricRepresentation: string; relationshipGraphEdges: number; architecturalConnectors: number;
    finalMeshComponents: number; continuousCirculation: boolean; fullVolumetricSourceUsed: boolean;
    graphUsedAsSecondaryOrganizer: boolean; pipelineStages: string[];
  };
  domainDiagnostic?: { componentsAvailable: number; componentsUsed: number; relationshipsAvailable: number; relationshipsUsed: number; detailSamples: number; source: number[]; raw: number[]; final: number[]; organization: string; lettersAvailable?: number; lettersAssigned?: number; voidsAvailable?: number; voidsAssigned?: number; provenanceElements?: number; fallbackElements?: number };
  mode: PrototypeGeometryMode; category: PrototypeCategory; typology: PrototypeTypologyId; typologyName: string; behaviors: TypologyBehaviors; name: string; seed: number; elements: ArchitecturalElement[];
  connectors: TileConnector[]; voidSeeds: Array<{ x: number; y: number; z: number; size: number }>;
  measurements: PrototypeMeasurements; validation: PrototypeValidation; sourceCount: number;
  descriptorSnapshot: DescriptorSettings; method: string; initialElements: ArchitecturalElement[];
  sourceBoundaries: SourceBoundary[]; sourceRelationships: SourceRelationship[];
  disconnectedElements: ArchitecturalElement[]; connectorElements: ArchitecturalElement[];
  proposedConnections: ArchitecturalConnection[]; connectivity: ConnectivityDiagnostic;
  architecturalValidation: ArchitecturalValidationResult;
  continuousMesh: ContinuousMeshData; presentationMesh: ContinuousMeshData; continuityControls: ContinuityControls;
  verticalExtents: { source: VerticalExtent; extracted: VerticalExtent; initial: VerticalExtent; final: VerticalExtent };
  surfaceDiagnostics: { initial: SurfaceAreaDiagnostic; classified: SurfaceAreaDiagnostic; final: SurfaceAreaDiagnostic };
  typologyDebug: TypologyDebug;
};
// Generic name for new code. The legacy export remains so existing saved
// configurations and UI imports continue to load without migration.
export type ProtoArchitectureVariation = AmphitheaterVariation;
export type AggregatedElement = ArchitecturalElement & { tileIndex: number };
export type AggregationResult = { count: 2 | 4 | 8; elements: AggregatedElement[]; tileCenters: Array<{ x: number; y: number; rotation: number }>; validation: PrototypeValidation };
export const TILE_SIZE_FEET = 20;
export const VERTICAL_INCREMENT_FEET = 20;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const descriptor = (s: DescriptorSettings, key: keyof DescriptorSettings) => s[key].intensity / 100;

type CirculationFamily = "radial" | "field" | "atrium" | "layered" | "fold" | "comb" | "edge" | "spine" | "sequence" | "terrace" | "ring" | "room" | "plate" | "flat" | "hall";

/** How circulation branches for each typology. Branching strength still scales the count. */
function circulationFamily(typology: PrototypeTypologyId): CirculationFamily {
  switch (typology) {
    case "stepped-amphitheater": return "radial";
    case "void-field-gathering": return "field";
    case "vertical-void-lobby": return "atrium";
    case "topographic-ground-field-lobby": return "layered";
    case "folded-undulating-work-surface": return "fold";
    case "linear-gallery-lobby": return "comb";
    case "linear-edge-gallery": return "edge";
    case "continuous-hall-lobby": return "spine";
    case "compressed-sequential-lobby": return "sequence";
    case "cascaded-terraced-plates": return "terrace";
    case "void-edge-workspace": return "ring";
    case "contained-room-within-volume": return "room";
    case "inserted-horizontal-plate": return "plate";
    case "flat-deep-plan-plate": return "flat";
    case "open-hall-workspace": return "hall";
    default: return "field";
  }
}

function branchBudget(family: CirculationFamily, branching: number) {
  const base = family === "comb" || family === "field" || family === "layered" ? 4
    : family === "sequence" || family === "flat" || family === "plate" ? 1
      : 2;
  const gain = family === "comb" || family === "field" ? 8 : family === "layered" || family === "ring" || family === "spine" ? 6 : 3;
  return Math.round(base + branching * gain);
}

function placementIdentity(item: CompositionPlacement) { return `${item.cell.id}@${item.sourceIndex ?? "member"}:${item.layerIndex ?? 0}`; }
function lineageKey(ids: string[]) {
  let hash = 2166136261;
  for (const c of [...new Set(ids)].sort().join("|") ) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
/** Letters keep the positions, rotations, and sizes coming from the selected source. */
export function recenteredPlacements(source: CompositionPlacement[]) {
  return source.map((item) => ({ ...item }));
}

function letterQuaternion(rx: number, y: number, z: number) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), "XYZ"));
}

let cachedLetterHalfThickness = 0;
function letterLocalHalfThickness() {
  if (cachedLetterHalfThickness) return cachedLetterHalfThickness;
  const geometry = getLetterVolumeGeometry("L", 14);
  geometry.computeBoundingBox();
  cachedLetterHalfThickness = Math.max(.02, ((geometry.boundingBox?.max.z ?? .08) - (geometry.boundingBox?.min.z ?? -.08)) / 2);
  return cachedLetterHalfThickness;
}

const letterOutlineCache = new Map<string, Point2[]>();
function centeredLetterOutline(letter: CompositionPlacement["cell"]["letter"]): Point2[] {
  const cached = letterOutlineCache.get(letter);
  if (cached) return cached;
  const raw = getLetterShape(letter).getPoints(8);
  const unique = raw.length > 1 && raw[0].distanceTo(raw[raw.length - 1]) < 1e-4 ? raw.slice(0, -1) : raw;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of unique) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const outline = unique.map((point) => [point.x - centerX, point.y - centerY] as Point2);
  letterOutlineCache.set(letter, outline);
  return outline;
}

/** Full transformed letter: plan footprint of the entire solid and its true vertical span. */
function analyzeLetterPlacement(item: CompositionPlacement) {
  const scaleX = item.scale * (item.scaleX ?? 1), scaleY = item.scale * (item.scaleY ?? 1), scaleZ = item.scale * (item.scaleZ ?? 1);
  const geometry = getLetterVolumeGeometry(item.cell.letter, 14).clone();
  geometry.scale(scaleX, scaleY, scaleZ);
  geometry.applyQuaternion(letterQuaternion(item.rx, item.rz, item.ry));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const positions = geometry.getAttribute("position");
  const plan: Point2[] = [];
  const stride = Math.max(1, Math.floor(positions.count / 64));
  for (let index = 0; index < positions.count; index += stride) plan.push([positions.getX(index), positions.getZ(index)]);
  geometry.dispose();
  const relativePlan = convexHull(plan);
  const points = (relativePlan.length >= 3 ? relativePlan : [[-.2, -.2], [.2, -.2], [0, .2]] as Point2[]).map(([x, y]) => [item.x + x, item.y + y] as Point2);
  const memberId = placementIdentity(item);
  const zMin = item.z + box.min.y, zMax = item.z + box.max.y;
  const boundary: SourceBoundary = {
    id: `letter-whole-${lineageKey([memberId])}`, memberIds: [memberId], kind: "letter", points,
    center: boundaryCenter(points), z: (zMin + zMax) / 2, zMin, zMax, area: polygonArea(points),
  };
  return { boundary, minY: box.min.y, maxY: box.max.y, scaleX, scaleY, scaleZ, plan: relativePlan.length >= 3 ? relativePlan : [[-.2, -.2], [.2, -.2], [0, .2]] as Point2[] };
}

function letterSpaceElement(item: CompositionPlacement, id: string): ArchitecturalElement {
  const record = analyzeLetterPlacement(item);
  return {
    id, kind: "platform", x: item.x, y: item.y, z: item.z + record.minY, width: 1, depth: 1,
    height: Math.max(.05, record.maxY - record.minY), rotation: 0, footprint: record.plan,
    letterSolid: { letter: item.cell.letter, rx: item.rx, ry: item.ry, rz: item.rz, scaleX: record.scaleX, scaleY: record.scaleY, scaleZ: record.scaleZ, minY: record.minY },
  };
}

function letterSolidMesh(element: ArchitecturalElement) {
  const solid = element.letterSolid!;
  const geometry = getLetterVolumeGeometry(solid.letter, 14).clone();
  geometry.scale(solid.scaleX, solid.scaleY, solid.scaleZ);
  geometry.applyQuaternion(letterQuaternion(solid.rx, solid.rz, solid.ry));
  geometry.translate(0, -solid.minY, 0);
  geometry.computeVertexNormals();
  return geometry;
}

type LetterObstacle = {
  memberIds: string[]; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  distance: (x: number, y: number, z: number) => number;
};

/** Distance to the complete letter solid, so openings are formed by the whole letter rather than one cut. */
function letterObstacles(source: CompositionPlacement[]): LetterObstacle[] {
  const halfThickness = letterLocalHalfThickness();
  return recenteredPlacements(source).map((item) => {
    const record = analyzeLetterPlacement(item);
    const inverse = letterQuaternion(item.rx, item.rz, item.ry).invert();
    const outline = centeredLetterOutline(item.cell.letter);
    const scale = Math.cbrt(Math.abs(record.scaleX * record.scaleY * record.scaleZ)) || 1;
    const xs = record.plan.map((point) => item.x + point[0]), ys = record.plan.map((point) => item.y + point[1]);
    return {
      memberIds: record.boundary.memberIds ?? [],
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), minZ: record.boundary.zMin, maxZ: record.boundary.zMax,
      distance: (x: number, y: number, z: number) => {
        const local = new THREE.Vector3(x - item.x, z - item.z, y - item.y).applyQuaternion(inverse);
        local.x /= record.scaleX || 1; local.y /= record.scaleY || 1; local.z /= record.scaleZ || 1;
        const planar = signedPolygonDistance([local.x, local.y], outline);
        const thickness = Math.abs(local.z) - halfThickness;
        return (Math.hypot(Math.max(planar, 0), Math.max(thickness, 0)) + Math.min(Math.max(planar, thickness), 0)) * scale;
      },
    };
  });
}

/** One source volume per letter. The footprint is the whole solid's plan, and the vertical span is the whole solid. */
function fullLetterVolumes(source: CompositionPlacement[]): SourceBoundary[] {
  return recenteredPlacements(source).map((item) => {
    const boundary = analyzeLetterPlacement(item).boundary;
    const members = boundary.memberIds ?? [];
    return { ...boundary, id: `letter-volume-${lineageKey(members)}` };
  }).filter((boundary) => boundary.points.length >= 3 && boundary.area > .01).sort((a, b) => b.area * (b.zMax - b.zMin) - a.area * (a.zMax - a.zMin));
}

type VoidCell = { id: string; xi: number; yi: number; zi: number; x: number; y: number; z: number; clearance: number; memberIds: string[] };

/** Dense bounded-negative-space cells used only by the O3 proof of concept.
 * Connected cells become shaped void volumes; the graph is created later and
 * does not define these volumes. */
function fullVoidVolumes(source: CompositionPlacement[]): SourceBoundary[] {
  const obstacles = letterObstacles(source);
  if (!obstacles.length) return [];
  const minZ = Math.min(...obstacles.map((obstacle) => obstacle.minZ)), maxZ = Math.max(...obstacles.map((obstacle) => obstacle.maxZ));
  const zSlices = Math.max(5, Math.min(14, Math.ceil((maxZ - minZ) / 1.8) + 1));
  const zStep = Math.max(.5, (maxZ - minZ) / zSlices), xyStep = 1.25;
  const cells: VoidCell[] = [];
  for (let zi = 0; zi < zSlices; zi++) for (let yi = 0; yi < 13; yi++) for (let xi = 0; xi < 13; xi++) {
    const point = { x: -7.5 + xi * xyStep, y: -7.5 + yi * xyStep, z: minZ + (zi + .5) * zStep };
    const clearance = Math.min(...obstacles.map((obstacle) => obstacle.distance(point.x, point.y, point.z)));
    const band = obstacles.filter((obstacle) => point.z >= obstacle.minZ - .3 && point.z <= obstacle.maxZ + .3);
    const boundedX = band.some((obstacle) => obstacle.maxX < point.x - .55) && band.some((obstacle) => obstacle.minX > point.x + .55);
    const boundedY = band.some((obstacle) => obstacle.maxY < point.y - .55) && band.some((obstacle) => obstacle.minY > point.y + .55);
    if (clearance < .78 || !boundedX || !boundedY) continue;
    const neighbors = [...band].sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - point.x, (a.minY + a.maxY) / 2 - point.y, (a.minZ + a.maxZ) / 2 - point.z) - Math.hypot((b.minX + b.maxX) / 2 - point.x, (b.minY + b.maxY) / 2 - point.y, (b.minZ + b.maxZ) / 2 - point.z)).slice(0, 10);
    cells.push({ ...point, xi, yi, zi, clearance, id: `void-cell-${xi}-${yi}-${zi}`, memberIds: neighbors.flatMap((obstacle) => obstacle.memberIds) });
  }
  const byIndex = new Map(cells.map((cell) => [`${cell.xi}:${cell.yi}:${cell.zi}`, cell]));
  const unseen = new Set(cells.map((cell) => cell.id)), groups: VoidCell[][] = [];
  for (const start of cells) {
    if (!unseen.delete(start.id)) continue;
    const group = [start], queue = [start];
    while (queue.length) {
      const cell = queue.shift()!;
      for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const next = byIndex.get(`${cell.xi+dx}:${cell.yi+dy}:${cell.zi+dz}`);
        if (next && unseen.delete(next.id)) { group.push(next); queue.push(next); }
      }
    }
    if (group.length >= 2) groups.push(group);
  }
  return groups.map((group) => {
    const memberIds = [...new Set(group.flatMap((cell) => cell.memberIds))].sort();
    const half = xyStep * .52;
    const points = smoothClosedBoundary(convexHull(group.flatMap((cell) => [[cell.x-half,cell.y-half],[cell.x+half,cell.y-half],[cell.x+half,cell.y+half],[cell.x-half,cell.y+half]] as Point2[])), 2);
    const zMin = Math.min(...group.map((cell) => cell.z-zStep*.55)), zMax = Math.max(...group.map((cell) => cell.z+zStep*.55));
    return { id: `void-volume-${lineageKey(group.map((cell) => cell.id))}`, memberIds, kind: "void" as const, points, center: boundaryCenter(points), z: (zMin+zMax)/2, zMin, zMax, area: polygonArea(points) };
  }).filter((volume) => volume.area > .6).sort((a,b)=>b.area*(b.zMax-b.zMin)-a.area*(a.zMax-a.zMin));
}

/** Samples bounded low-density volumes outside the complete letter solids. */
export function extractInterLetterVoids(source: CompositionPlacement[], fullDomain = false) {
  const obstacles = letterObstacles(source);
  if (!obstacles.length) return [];
  const candidates: Array<{ id: string; memberIds: string[]; x: number; y: number; z: number; clearance: number }> = [];
  const minZ = Math.min(...obstacles.map((obstacle) => obstacle.minZ)), maxZ = Math.max(...obstacles.map((obstacle) => obstacle.maxZ));
  const zSlices = Math.max(4, Math.min(12, Math.ceil((maxZ - minZ) / 2.5) + 1));
  for (let zi = 0; zi < zSlices; zi++) for (let yi = 0; yi < 9; yi++) for (let xi = 0; xi < 9; xi++) {
    const point = { x: -7.5 + xi * 1.875, y: -7.5 + yi * 1.875, z: minZ + (zi + .5) * Math.max(.5, (maxZ - minZ) / zSlices) };
    const clearance = Math.min(...obstacles.map((obstacle) => obstacle.distance(point.x, point.y, point.z)));
    const band = obstacles.filter((obstacle) => point.z >= obstacle.minZ - .3 && point.z <= obstacle.maxZ + .3);
    const boundedX = band.some((obstacle) => obstacle.maxX < point.x - .7) && band.some((obstacle) => obstacle.minX > point.x + .7);
    const boundedY = band.some((obstacle) => obstacle.maxY < point.y - .7) && band.some((obstacle) => obstacle.minY > point.y + .7);
    if (clearance > .85 && boundedX && boundedY) {
      const neighbors = [...band].sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - point.x, (a.minY + a.maxY) / 2 - point.y) - Math.hypot((b.minX + b.maxX) / 2 - point.x, (b.minY + b.maxY) / 2 - point.y)).slice(0, 8);
      candidates.push({ ...point, clearance, id: `void-grid-${xi}-${yi}-${zi}`, memberIds: neighbors.flatMap((obstacle) => obstacle.memberIds) });
    }
  }
  const selected: typeof candidates = [];
  for (const c of candidates.sort((a, b) => b.clearance - a.clearance)) {
    if (selected.every(i => Math.hypot(i.x - c.x, i.y - c.y, i.z - c.z) > 2.3)) selected.push(c);
    if (!fullDomain && selected.length === 16) break;
  }
  return selected.map(i => ({ id: i.id, memberIds: i.memberIds, x: i.x, y: i.y, z: i.z, size: clamp(i.clearance * .7, .75, 2.5) }));
}

function polygonArea(points: Point2[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) { const n = points[(i + 1) % points.length]; area += points[i][0] * n[1] - n[0] * points[i][1]; }
  return Math.abs(area) / 2;
}
function polygonPerimeter(points: Point2[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
}
function defaultFootprint(e: ArchitecturalElement): Point2[] { return [[-e.width / 2, -e.depth / 2], [e.width / 2, -e.depth / 2], [e.width / 2, e.depth / 2], [-e.width / 2, e.depth / 2]]; }

export function architecturalSurfaceClass(element: ArchitecturalElement): ArchitecturalSurfaceClass {
  if (element.kind === "void") return "void";
  if (element.kind === "circulation") return "circulation";
  if (element.kind === "enclosure") return "vertical";
  return "horizontal";
}

function elementSurfaceDiagnostic(elements: ArchitecturalElement[]): SurfaceAreaDiagnostic {
  let horizontalArea = 0, verticalArea = 0, circulationArea = 0, voidVolume = 0;
  for (const element of elements) {
    const footprint = element.footprint ?? defaultFootprint(element);
    const inner = element.innerFootprint;
    const area = Math.max(0, polygonArea(footprint) - (inner ? polygonArea(inner) : 0));
    const averageHeight = element.height + Math.abs(element.rise ?? 0) * .5;
    const sideArea = polygonPerimeter(footprint) * averageHeight + (inner ? polygonPerimeter(inner) * averageHeight : 0);
    const surfaceClass = architecturalSurfaceClass(element);
    if (surfaceClass === "horizontal") horizontalArea += area;
    else if (surfaceClass === "circulation") circulationArea += area;
    else if (surfaceClass === "vertical") verticalArea += sideArea;
    else voidVolume += area * Math.max(element.height, 0);
  }
  const verticalToHorizontalRatio = verticalArea / Math.max(1, horizontalArea + circulationArea);
  return {
    horizontalArea, verticalArea, circulationArea, voidVolume, verticalToHorizontalRatio,
    warning: verticalToHorizontalRatio > 1.15 ? "Vertical surface area exceeds the occupied horizontal and circulation area; review enclosure purpose." : undefined,
  };
}

function meshSurfaceDiagnostic(mesh: ContinuousMeshData, circulationArea: number, voidVolume: number): SurfaceAreaDiagnostic {
  let horizontalArea = 0, verticalArea = 0;
  const first = new THREE.Vector3(), second = new THREE.Vector3(), third = new THREE.Vector3();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] * 3, b = mesh.indices[index + 1] * 3, c = mesh.indices[index + 2] * 3;
    first.set(mesh.positions[a], mesh.positions[a + 1], mesh.positions[a + 2]);
    second.set(mesh.positions[b], mesh.positions[b + 1], mesh.positions[b + 2]);
    third.set(mesh.positions[c], mesh.positions[c + 1], mesh.positions[c + 2]);
    const cross = second.clone().sub(first).cross(third.clone().sub(first));
    const area = cross.length() * .5;
    if (!area) continue;
    const verticalNormal = Math.abs(cross.y) / Math.max(cross.length(), 1e-9);
    if (verticalNormal >= .68) horizontalArea += area; else verticalArea += area;
  }
  const verticalToHorizontalRatio = verticalArea / Math.max(1, horizontalArea);
  return {
    horizontalArea, verticalArea, circulationArea, voidVolume, verticalToHorizontalRatio,
    warning: verticalToHorizontalRatio > 1.15 ? "The reconstructed mesh contains unexpectedly high vertical area; inspect the classified enclosure stage." : undefined,
  };
}

function convexHull(points: Point2[]): Point2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 3) return sorted;
  const cross = (o: Point2, a: Point2, b: Point2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [];
  for (const point of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop(); lower.push(point); }
  const upper: Point2[] = [];
  for (const point of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop(); upper.push(point); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function smoothClosedBoundary(points: Point2[], iterations = 1): Point2[] {
  let current = points;
  for (let iteration = 0; iteration < iterations; iteration++) current = current.flatMap((point, index) => {
    const next = current[(index + 1) % current.length];
    return [[point[0] * .75 + next[0] * .25, point[1] * .75 + next[1] * .25] as Point2, [point[0] * .25 + next[0] * .75, point[1] * .25 + next[1] * .75] as Point2];
  });
  return current;
}

function boundaryCenter(points: Point2[]): Point2 {
  if (!points.length) return [0, 0];
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function principalOrientation(points: Point2[]) {
  if (points.length < 2) return 0;
  let longest = { length: 0, angle: 0 };
  for (let index = 0; index < points.length; index++) {
    const first = points[index], second = points[(index + 1) % points.length];
    const dx = second[0] - first[0], dy = second[1] - first[1];
    const length = Math.hypot(dx, dy);
    if (length > longest.length) longest = { length, angle: (Math.atan2(dy, dx) * 180 / Math.PI + 180) % 180 };
  }
  return longest.angle;
}

function scaleBoundary(points: Point2[], factor: number): Point2[] {
  const center = boundaryCenter(points);
  return points.map(([x, y]) => [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor]);
}

function fitBoundary(points: Point2[], limit = 9.15): Point2[] {
  const maximum = Math.max(1, ...points.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  const factor = Math.min(1, limit / maximum);
  return points.map(([x, y]) => [x * factor, y * factor]);
}

/** Keep distant source clusters in place instead of scaling them toward the origin. */
function fitBoundaryPreserveCenter(points: Point2[], limit = 9.15): Point2[] {
  if (points.length < 1) return points;
  const center = boundaryCenter(points);
  const maxRadius = Math.max(.001, ...points.map(([x, y]) => Math.hypot(x - center[0], y - center[1])));
  const centerLimit = Math.max(.5, limit - .4);
  const shiftedCenter: Point2 = [clamp(center[0], -centerLimit, centerLimit), clamp(center[1], -centerLimit, centerLimit)];
  const radiusBudget = Math.max(.35, limit - Math.max(Math.abs(shiftedCenter[0]), Math.abs(shiftedCenter[1])));
  const factor = Math.min(1, radiusBudget / maxRadius);
  return points.map(([x, y]) => [shiftedCenter[0] + (x - center[0]) * factor, shiftedCenter[1] + (y - center[1]) * factor]);
}

function ensureBoundaryArea(points: Point2[], minimumArea: number, limit = 8): Point2[] {
  if (points.length < 3) return points;
  const enlarged = scaleBoundary(points, Math.max(1, Math.sqrt(minimumArea / Math.max(.01, polygonArea(points)))));
  const minX = Math.min(...enlarged.map((point) => point[0])), maxX = Math.max(...enlarged.map((point) => point[0]));
  const minY = Math.min(...enlarged.map((point) => point[1])), maxY = Math.max(...enlarged.map((point) => point[1]));
  const shiftX = minX < -limit ? -limit - minX : maxX > limit ? limit - maxX : 0;
  const shiftY = minY < -limit ? -limit - minY : maxY > limit ? limit - maxY : 0;
  return enlarged.map(([x, y]) => [x + shiftX, y + shiftY]);
}

function orientedEllipseBoundary(center: Point2, radiusX: number, radiusY: number, rotation: number, segments = 40, modulation?: (angle: number, index: number) => number): Point2[] {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    const influence = 1 + (modulation?.(angle, index) ?? 0);
    const localX = Math.cos(angle) * radiusX * influence, localY = Math.sin(angle) * radiusY * influence;
    return [center[0] + localX * cosine - localY * sine, center[1] + localX * sine + localY * cosine] as Point2;
  });
}

function orientedEllipsePoint(center: Point2, radiusX: number, radiusY: number, rotation: number, angle: number): Point2 {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const localX = Math.cos(angle) * radiusX, localY = Math.sin(angle) * radiusY;
  return [center[0] + localX * cosine - localY * sine, center[1] + localX * sine + localY * cosine];
}

function orientedRectangleBoundary(center: Point2, halfWidth: number, halfDepth: number, rotation: number, chamfer = .35): Point2[] {
  const c = Math.min(chamfer, halfWidth * .35, halfDepth * .35);
  const local: Point2[] = [[-halfWidth + c, -halfDepth], [halfWidth - c, -halfDepth], [halfWidth, -halfDepth + c], [halfWidth, halfDepth - c], [halfWidth - c, halfDepth], [-halfWidth + c, halfDepth], [-halfWidth, halfDepth - c], [-halfWidth, -halfDepth + c]];
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  return local.map(([x, y]) => [center[0] + x * cosine - y * sine, center[1] + x * sine + y * cosine]);
}

/** A continuous C-shaped terrace band with an open circulation approach. */
function amphitheaterBand(center: Point2, innerX: number, innerY: number, outerX: number, outerY: number, rotation: number, openingCenter: number, openingAngle: number, modulation?: (angle: number, index: number) => number): Point2[] {
  const segments = 38;
  const start = openingCenter + openingAngle / 2, sweep = Math.PI * 2 - openingAngle;
  const arc = (radiusX: number, radiusY: number, reverse = false) => Array.from({ length: segments + 1 }, (_, index) => {
    const amount = (reverse ? segments - index : index) / segments;
    const angle = start + amount * sweep;
    const influence = 1 + (modulation?.(angle, index) ?? 0);
    return orientedEllipsePoint(center, radiusX * influence, radiusY * influence, rotation, angle);
  });
  return [...arc(outerX, outerY), ...arc(innerX, innerY, true)];
}

function curvedRibbon(from: Point2, to: Point2, width: number, curvature: number, phase: number): Point2[] {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.max(.001, Math.hypot(dx, dy));
  const normal: Point2 = [-dy / length, dx / length];
  const bend = Math.min(length * .28, 1.8) * curvature * (phase % 2 ? -1 : 1);
  const control: Point2 = [(from[0] + to[0]) / 2 + normal[0] * bend, (from[1] + to[1]) / 2 + normal[1] * bend];
  const left: Point2[] = [], right: Point2[] = [];
  for (let index = 0; index <= 8; index++) {
    const t = index / 8, inverse = 1 - t;
    const point: Point2 = [inverse * inverse * from[0] + 2 * inverse * t * control[0] + t * t * to[0], inverse * inverse * from[1] + 2 * inverse * t * control[1] + t * t * to[1]];
    const tangent: Point2 = [2 * inverse * (control[0] - from[0]) + 2 * t * (to[0] - control[0]), 2 * inverse * (control[1] - from[1]) + 2 * t * (to[1] - control[1])];
    const tangentLength = Math.max(.001, Math.hypot(tangent[0], tangent[1]));
    const nx = -tangent[1] / tangentLength * width / 2, ny = tangent[0] / tangentLength * width / 2;
    left.push([point[0] + nx, point[1] + ny]); right.push([point[0] - nx, point[1] - ny]);
  }
  return [...left, ...right.reverse()];
}

function boundaryStrip(points: Point2[], edgeIndex: number, inner: number, outer: number): Point2[] {
  const first = points[edgeIndex], second = points[(edgeIndex + 1) % points.length];
  const center = boundaryCenter(points), midpoint: Point2 = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
  const dx = second[0] - first[0], dy = second[1] - first[1], length = Math.max(.001, Math.hypot(dx, dy));
  let nx = dy / length, ny = -dx / length;
  if ((midpoint[0] + nx - center[0]) * nx + (midpoint[1] + ny - center[1]) * ny < 0) { nx *= -1; ny *= -1; }
  return fitBoundary([
    [first[0] + nx * inner, first[1] + ny * inner],
    [second[0] + nx * inner, second[1] + ny * inner],
    [second[0] + nx * outer, second[1] + ny * outer],
    [first[0] + nx * outer, first[1] + ny * outer],
  ]);
}

function connectCenters(boundaries: SourceBoundary[], kind: SourceRelationship["kind"]): SourceRelationship[] {
  if (boundaries.length < 2) return [];
  const connected = new Set([0]); const relationships: SourceRelationship[] = [];
  while (connected.size < boundaries.length) {
    let best: { from: number; to: number; distance: number } | null = null;
    for (const from of connected) for (let to = 0; to < boundaries.length; to++) if (!connected.has(to)) {
      const distance = Math.hypot(boundaries[from].center[0] - boundaries[to].center[0], boundaries[from].center[1] - boundaries[to].center[1], boundaries[from].z - boundaries[to].z);
      if (!best || distance < best.distance) best = { from, to, distance };
    }
    if (!best) break;
    connected.add(best.to);
    const a = boundaries[best.from], b = boundaries[best.to];
    relationships.push({ id: `${kind}:${[a.id,b.id].sort().join("~")}`, fromId: a.id, toId: b.id, from: a.center, to: b.center, fromZ: a.z, toZ: b.z, kind });
  }
  return relationships;
}

function letterBoundaries(source: CompositionPlacement[]): SourceBoundary[] {
  return recenteredPlacements(source).map((item) => {
    const boundary = analyzeLetterPlacement(item).boundary;
    const memberIds = boundary.memberIds ?? [];
    return { ...boundary, id: `letter-component-${lineageKey(memberIds)}` };
  }).filter((boundary) => boundary.points.length >= 3 && boundary.area > .01).sort((a, b) => b.area - a.area);
}

function voidBoundaries(source: CompositionPlacement[], fullDomain = false): SourceBoundary[] {
  const seeds = extractInterLetterVoids(source, fullDomain);
  return seeds.map((seed, index) => {
    const points = Array.from({ length: 24 }, (_, pointIndex) => { const angle = pointIndex / 24 * Math.PI * 2; return [seed.x + Math.cos(angle) * seed.size / 2, seed.y + Math.sin(angle) * seed.size / 2] as Point2; });
    return { id: seed.id, memberIds: seed.memberIds, kind: "void" as const, points, center: [seed.x, seed.y] as Point2, z: seed.z, zMin: seed.z - seed.size / 2, zMax: seed.z + seed.size / 2, area: polygonArea(points) };
  }).sort((a, b) => b.area - a.area);
}

export function analyzeSourceGeometry(source: CompositionPlacement[], fullDomain = false) {
  const letters = letterBoundaries(source); const voids = voidBoundaries(source, fullDomain);
  const relationships = [
    ...connectCenters(letters, "adjacency"),
    ...connectCenters(voids, "void-link"),
    ...(fullDomain ? voids : voids.slice(0, 6)).flatMap((space) => {
      const solid = [...letters].sort((a, b) => Math.hypot(a.center[0] - space.center[0], a.center[1] - space.center[1]) - Math.hypot(b.center[0] - space.center[0], b.center[1] - space.center[1]))[0];
      return solid ? [{ id: `solid-void:${solid.id}~${space.id}`, fromId: solid.id, toId: space.id, from: solid.center, to: space.center, fromZ: solid.z, toZ: space.z, kind: "solid-void" as const }] : [];
    }),
  ];
  if (fullDomain) for (let i=0;i<voids.length;i++) for(let j=i+1;j<voids.length;j++) {
    const a=voids[i],b=voids[j], dz=Math.abs(a.z-b.z), distance=Math.hypot(a.center[0]-b.center[0],a.center[1]-b.center[1]);
    if(dz>.5 && dz<4.5 && distance<3.4 && !relationships.some(r=>(r.fromId===a.id&&r.toId===b.id)||(r.fromId===b.id&&r.toId===a.id)))
      relationships.push({id:`void-link:${[a.id,b.id].sort().join("~")}`,fromId:a.id,toId:b.id,from:a.center,to:b.center,fromZ:a.z,toZ:b.z,kind:"void-link"});
  }
  return { letters, voids, relationships };
}

function extentFromValues(values: number[]): VerticalExtent {
  if (!values.length) return { minZ: 0, maxZ: 0, extent: 0 };
  let minZ = Infinity, maxZ = -Infinity;
  for (const value of values) {
    if (value < minZ) minZ = value;
    if (value > maxZ) maxZ = value;
  }
  return { minZ, maxZ, extent: maxZ - minZ };
}

function extentFromBoundaries(boundaries: SourceBoundary[]) {
  return extentFromValues(boundaries.flatMap((boundary) => [boundary.zMin, boundary.zMax]));
}

function extentFromElements(elements: ArchitecturalElement[]) {
  return extentFromValues(elements.flatMap((element) => [element.z + Math.min(0, element.rise ?? 0), element.z + element.height + Math.max(0, element.rise ?? 0)]));
}

function distributedBoundaries(boundaries: SourceBoundary[], limit: number) {
  if (boundaries.length <= limit) return boundaries;
  const sorted = [...boundaries].sort((first, second) => first.z - second.z || second.area - first.area);
  return Array.from({ length: limit }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / Math.max(1, limit - 1))]);
}

/** Exact watertight polygon prism used by the viewer, measurements, and OBJ exporter. */
export function architecturalElementGeometry(element: ArchitecturalElement) {
  if (element.letterSolid) return letterSolidMesh(element);
  const footprint = element.footprint ?? defaultFootprint(element);
  if (element.innerFootprint?.length) {
    const shape = new THREE.Shape(footprint.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(new THREE.Path(element.innerFootprint.map(([x, y]) => new THREE.Vector2(x, y))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: element.height, bevelEnabled: false, curveSegments: 12, steps: 1 });
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const planY = positions.getY(index), elevation = positions.getZ(index);
      positions.setY(index, elevation); positions.setZ(index, planY);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals();
    return geometry;
  }
  const triangles = THREE.ShapeUtils.triangulateShape(footprint.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const vertices: number[] = []; const indices: number[] = [];
  const minY = Math.min(...footprint.map(p => p[1])); const spanY = Math.max(.001, Math.max(...footprint.map(p => p[1])) - minY);
  const slopeAmount = ([x, y]: Point2) => {
    if (!element.rise) return 0;
    if (element.slopeFrom && element.slopeTo) {
      const dx = element.slopeTo[0] - element.slopeFrom[0], dy = element.slopeTo[1] - element.slopeFrom[1];
      const denominator = Math.max(.001, dx * dx + dy * dy);
      return clamp(((element.x + x - element.slopeFrom[0]) * dx + (element.y + y - element.slopeFrom[1]) * dy) / denominator, 0, 1) * element.rise;
    }
    return ((y - minY) / spanY) * element.rise;
  };
  for (const point of footprint) { const [x, y] = point; vertices.push(x, slopeAmount(point), y); }
  for (const point of footprint) { const [x, y] = point; vertices.push(x, element.height + slopeAmount(point), y); }
  for (const t of triangles) { indices.push(t[2], t[1], t[0]); indices.push(t[0] + footprint.length, t[1] + footprint.length, t[2] + footprint.length); }
  for (let i = 0; i < footprint.length; i++) { const j = (i + 1) % footprint.length; indices.push(i, j, j + footprint.length, i, j + footprint.length, i + footprint.length); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function pointInPolygon(point: Point2, polygon: Point2[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [xi, yi] = polygon[current], [xj, yj] = polygon[previous];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(point: Point2, first: Point2, second: Point2) {
  const dx = second[0] - first[0], dy = second[1] - first[1];
  const denominator = dx * dx + dy * dy;
  const amount = denominator ? clamp(((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / denominator, 0, 1) : 0;
  return Math.hypot(point[0] - (first[0] + dx * amount), point[1] - (first[1] + dy * amount));
}

function signedPolygonDistance(point: Point2, polygon: Point2[]) {
  let distance = Infinity;
  polygon.forEach((first, index) => { distance = Math.min(distance, pointSegmentDistance(point, first, polygon[(index + 1) % polygon.length])); });
  return pointInPolygon(point, polygon) ? -distance : distance;
}

function elementFootprintAtWorld(element: ArchitecturalElement) {
  const polygon = element.footprint ?? defaultFootprint(element);
  const angle = THREE.MathUtils.degToRad(element.rotation), cosine = Math.cos(angle), sine = Math.sin(angle);
  return polygon.map(([x, y]) => [element.x + x * cosine + y * sine, element.y - x * sine + y * cosine] as Point2);
}

function elementInnerFootprintAtWorld(element: ArchitecturalElement) {
  if (!element.innerFootprint) return undefined;
  const angle = THREE.MathUtils.degToRad(element.rotation), cosine = Math.cos(angle), sine = Math.sin(angle);
  return element.innerFootprint.map(([x, y]) => [element.x + x * cosine + y * sine, element.y - x * sine + y * cosine] as Point2);
}

/** Continuous SDF union sampled by interpolated marching cubes. */
function continuousSurface(elements: ArchitecturalElement[], controls: ContinuityControls, minimumResolution = 40): ContinuousMeshData {
  const solids = elements.filter((element) => element.kind !== "void" && !element.letterSolid);
  const voids = elements.filter((element) => element.kind === "void");
  const worldPolygons = solids.map((element) => elementFootprintAtWorld(element));
  const sampleX = worldPolygons.flatMap((polygon) => polygon.map((point) => point[0]));
  const sampleY = worldPolygons.flatMap((polygon) => polygon.map((point) => point[1]));
  const bottoms = solids.map((element) => element.z + Math.min(0, element.rise ?? 0));
  const tops = solids.map((element) => element.z + element.height + Math.max(0, element.rise ?? 0));
  const occupiedSpan = sampleX.length ? Math.max(.2, Math.max(...sampleX) - Math.min(...sampleX), Math.max(...sampleY) - Math.min(...sampleY)) : 21.5;
  const feature = solids.length ? Math.min(...solids.map((element) => Math.max(.02, element.height))) : .4;
  const localField = occupiedSpan < 12;
  let minX = -10.75, maxX = 10.75, minY = -10.75, maxY = 10.75;
  let maxZ = Math.max(4, ...tops) + .6;
  let minZ = Math.min(-.45, ...bottoms) - .35;
  if (localField && sampleX.length) {
    const pad = Math.max(feature, occupiedSpan * .08);
    minX = Math.min(...sampleX) - pad;
    maxX = Math.max(...sampleX) + pad;
    minY = Math.min(...sampleY) - pad;
    maxY = Math.max(...sampleY) + pad;
    minZ = Math.min(...bottoms) - pad;
    maxZ = Math.max(...tops) + pad;
  }
  const spanMax = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const resolution = Math.min(localField ? 64 : 56, Math.max(minimumResolution, Math.ceil(spanMax / Math.max(.02, feature * .45)) + 1));
  const dx = (maxX - minX) / (resolution - 1), dy = (maxY - minY) / (resolution - 1), dz = (maxZ - minZ) / (resolution - 1);
  const retainedSource = (controls.preservation + controls.sourcePreservation) / 200;
  const canvasBlend = .06 + controls.blendingStrength / 100 * .3 + controls.blendRadius / 100 * .3 * (1 - retainedSource * .5);
  const blendRadius = localField ? Math.min(canvasBlend, feature * .65) : canvasBlend;
  const openingExpansion = localField ? Math.min(Math.max(0, controls.minimumOpening / 2 - .35), feature * .5) : Math.max(0, controls.minimumOpening / 2 - .35);
  const fieldFor = (element: ArchitecturalElement, opening = false) => {
    const polygon = elementFootprintAtWorld(element);
    return { polygon, innerPolygon: elementInnerFootprintAtWorld(element), minX: Math.min(...polygon.map((point) => point[0])), maxX: Math.max(...polygon.map((point) => point[0])), minY: Math.min(...polygon.map((point) => point[1])), maxY: Math.max(...polygon.map((point) => point[1])), top: element.z + element.height + Math.max(0, element.rise ?? 0), bottom: opening ? element.z - .2 : element.z + Math.min(0, element.rise ?? 0), element, opening };
  };
  const solidFields = solids.map((element) => ({ ...fieldFor(element), surfaceClass: architecturalSurfaceClass(element) }));
  const voidFields = voids.map((element) => fieldFor(element, true));
  const extrusionDistance = (point: Point2, z: number, field: ReturnType<typeof fieldFor>) => {
    const outerDistance = signedPolygonDistance(point, field.polygon);
    const planar = field.innerPolygon ? Math.max(outerDistance, -signedPolygonDistance(point, field.innerPolygon)) : outerDistance;
    let localBottom = field.bottom, localTop = field.top;
    const { element } = field;
    if (!field.opening && element.kind === "circulation" && element.rise && element.slopeFrom && element.slopeTo) {
      const sx = element.slopeTo[0] - element.slopeFrom[0], sy = element.slopeTo[1] - element.slopeFrom[1];
      const denominator = Math.max(.001, sx * sx + sy * sy);
      const amount = clamp(((point[0] - element.slopeFrom[0]) * sx + (point[1] - element.slopeFrom[1]) * sy) / denominator, 0, 1);
      localBottom = element.z + amount * element.rise;
      localTop = localBottom + element.height;
    }
    const vertical = Math.max(localBottom - z, z - localTop);
    return Math.hypot(Math.max(planar, 0), Math.max(vertical, 0)) + Math.min(Math.max(planar, vertical), 0);
  };
  const smoothMinimum = (first: number, second: number, radius: number) => {
    if (!Number.isFinite(first)) return second;
    if (radius <= .0001) return Math.min(first, second);
    const amount = clamp(.5 + .5 * (second - first) / radius, 0, 1);
    return THREE.MathUtils.lerp(second, first, amount) - radius * amount * (1 - amount);
  };
  const material = new THREE.MeshBasicMaterial();
  const surface = new MarchingCubes(resolution, material, false, false, 320000);
  surface.isolation = 0;
  for (let zIndex = 0; zIndex < resolution; zIndex++) for (let yIndex = 0; yIndex < resolution; yIndex++) for (let xIndex = 0; xIndex < resolution; xIndex++) {
    const x = minX + xIndex * dx, y = minY + yIndex * dy, z = minZ + zIndex * dz;
    let distance = Infinity;
    for (const field of solidFields) {
      const boundsDistance = Math.hypot(Math.max(field.minX - x, 0, x - field.maxX), Math.max(field.minY - y, 0, y - field.maxY), Math.max(field.bottom - z, 0, z - field.top));
      const localBlend = field.surfaceClass === "vertical" ? blendRadius * .18 : field.surfaceClass === "circulation" ? blendRadius : blendRadius * .62;
      if (Number.isFinite(distance) && boundsDistance > Math.max(0, distance) + localBlend) continue;
      distance = smoothMinimum(distance, extrusionDistance([x, y], z, field), localBlend);
    }
    for (const field of voidFields) {
      const openingDistance = extrusionDistance([x, y], z, field) - openingExpansion;
      distance = Math.max(distance, -openingDistance);
    }
    surface.field[xIndex + resolution * (yIndex + resolution * zIndex)] = Number.isFinite(distance) ? distance : 10;
  }
  surface.update();
  const rawPositions = surface.positionArray;
  const positions: number[] = [], indices: number[] = [], vertexMap = new Map<string, number>();
  const platformLevels = [...new Set(solids.filter((element) => element.kind === "platform" || element.kind === "stage").map((element) => Number((element.z + element.height + Math.max(0, element.rise ?? 0)).toFixed(4))))];
  for (let vertexIndex = 0; vertexIndex < surface.count; vertexIndex++) {
    const offset = vertexIndex * 3;
    const x = minX + (rawPositions[offset] + 1) * .5 * (maxX - minX);
    let y = minZ + (rawPositions[offset + 2] + 1) * .5 * (maxZ - minZ);
    const z = minY + (rawPositions[offset + 1] + 1) * .5 * (maxY - minY);
    const nearestLevel = platformLevels.reduce((nearest, level) => Math.abs(level - y) < Math.abs(nearest - y) ? level : nearest, platformLevels[0] ?? y);
    if (Math.abs(nearestLevel - y) < dz * (.32 + retainedSource * .2) && retainedSource >= .35) y = nearestLevel;
    const key = `${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
    let mapped = vertexMap.get(key);
    if (mapped === undefined) { mapped = positions.length / 3; positions.push(x, y, z); vertexMap.set(key, mapped); }
    indices.push(mapped);
  }
  surface.geometry.dispose(); material.dispose();
  let degenerateTriangles = 0;
  const cleanIndices: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3, b = indices[index + 1] * 3, c = indices[index + 2] * 3;
    const ab = new THREE.Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
    const ac = new THREE.Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
    if (ab.cross(ac).lengthSq() < 1e-10) degenerateTriangles++; else cleanIndices.push(indices[index], indices[index + 1], indices[index + 2]);
  }
  const parent = Array.from({ length: positions.length / 3 }, (_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const join = (first: number, second: number) => { const firstRoot = root(first), secondRoot = root(second); if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot; };
  cleanIndices.forEach((index, position) => { if (position % 3) join(cleanIndices[position - position % 3], index); });
  const componentSizes = new Map<number, number>();
  const componentHorizontalArea = new Map<number, number>();
  for (let index = 0; index < cleanIndices.length; index += 3) {
    const component = root(cleanIndices[index]);
    componentSizes.set(component, (componentSizes.get(component) ?? 0) + 1);
    const ia = cleanIndices[index] * 3, ib = cleanIndices[index + 1] * 3, ic = cleanIndices[index + 2] * 3;
    const first = new THREE.Vector3(positions[ia], positions[ia + 1], positions[ia + 2]);
    const second = new THREE.Vector3(positions[ib], positions[ib + 1], positions[ib + 2]);
    const third = new THREE.Vector3(positions[ic], positions[ic + 1], positions[ic + 2]);
    const cross = second.sub(first).cross(third.sub(first));
    const weightedHorizontalArea = cross.length() * .5 * Math.pow(Math.abs(cross.y) / Math.max(cross.length(), 1e-9), 2);
    componentHorizontalArea.set(component, (componentHorizontalArea.get(component) ?? 0) + weightedHorizontalArea);
  }
  // Retain every substantial occupiable component. The earlier largest-only
  // filter discarded legitimate terrace plates whenever the circulation spine
  // happened to contain more triangles. Tiny marching-cubes remnants are still
  // removed, while source-derived platforms remain visible and exportable.
  const maximumHorizontalArea = Math.max(0, ...componentHorizontalArea.values());
  const maximumTriangleCount = Math.max(0, ...componentSizes.values());
  const retainedComponents = new Set([...componentSizes.keys()].filter((component) =>
    (componentHorizontalArea.get(component) ?? 0) >= Math.max(.08, maximumHorizontalArea * .035)
    || (componentSizes.get(component) ?? 0) >= maximumTriangleCount * .22));
  const primaryIndices = cleanIndices.filter((_, index) => retainedComponents.has(root(cleanIndices[index - index % 3])));
  const componentBounds = [...retainedComponents].map((component) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const index of cleanIndices) {
      if (root(index) !== component) continue;
      const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    return {
      triangles: componentSizes.get(component) ?? 0,
      horizontalArea: componentHorizontalArea.get(component) ?? 0,
      min: [minX, minY, minZ] as [number, number, number],
      max: [maxX, maxY, maxZ] as [number, number, number],
    };
  }).sort((first, second) => second.triangles - first.triangles);
  const remap = new Map<number, number>(), compactPositions: number[] = [], compactIndices: number[] = [];
  primaryIndices.forEach((oldIndex) => {
    let nextIndex = remap.get(oldIndex);
    if (nextIndex === undefined) {
      nextIndex = compactPositions.length / 3; remap.set(oldIndex, nextIndex);
      compactPositions.push(positions[oldIndex * 3], positions[oldIndex * 3 + 1], positions[oldIndex * 3 + 2]);
    }
    compactIndices.push(nextIndex);
  });
  return { positions: compactPositions, indices: compactIndices, componentCount: retainedComponents.size, degenerateTriangles, componentBounds };
}

/** Architectural XYZ, as opposed to the renderer's X/elevation/plan-Y order. */
export function meshXYZExtent(mesh: ContinuousMeshData) {
  const axes = [0, 2, 1];
  return axes.map((axis) => {
    let min = Infinity, max = -Infinity;
    for (let i = axis; i < mesh.positions.length; i += 3) { min = Math.min(min, mesh.positions[i]); max = Math.max(max, mesh.positions[i]); }
    return Number.isFinite(min) ? max - min : 0;
  });
}
export function elementXYZExtent(elements: ArchitecturalElement[]) {
  const bounds = elements.filter(e => e.kind !== "void").map(elementBounds);
  if (!bounds.length) return [0, 0, 0];
  return [Math.max(...bounds.map(b => b.maxX)) - Math.min(...bounds.map(b => b.minX)), Math.max(...bounds.map(b => b.maxY)) - Math.min(...bounds.map(b => b.minY)), Math.max(...bounds.map(b => b.maxZ)) - Math.min(...bounds.map(b => b.minZ))];
}

// Fast boundary extrusion for interaction. This deliberately makes no welded
// connectivity claim; only final reconstruction can measure mesh components.
function previewElementMesh(elements: ArchitecturalElement[]): ContinuousMeshData {
  const positions: number[] = [], indices: number[] = [];
  elements.filter(e => e.kind !== "void").forEach(element => {
    const geometry = architecturalElementGeometry(element);
    geometry.rotateY(THREE.MathUtils.degToRad(element.rotation));
    geometry.translate(element.x, element.z, element.y);
    const offset = positions.length / 3, position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) positions.push(position.getX(i), position.getY(i), position.getZ(i));
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) indices.push(offset + geometry.index.getX(i));
    else for (let i = 0; i < position.count; i++) indices.push(offset + i);
    geometry.dispose();
  });
  return { positions, indices, componentCount: 0, degenerateTriangles: 0, componentBounds: [] };
}

/** Exact letter meshes are appended after reconstruction so thin strokes are not lost between cut samples. */
function appendLetterSolids(mesh: ContinuousMeshData, elements: ArchitecturalElement[]): ContinuousMeshData {
  const letters = elements.filter((element) => element.letterSolid && element.kind !== "void");
  if (!letters.length) return mesh;
  const positions = [...mesh.positions], indices = [...mesh.indices];
  for (const element of letters) {
    const geometry = letterSolidMesh(element);
    const position = geometry.getAttribute("position");
    const offset = positions.length / 3;
    for (let index = 0; index < position.count; index++) positions.push(element.x + position.getX(index), element.z + position.getY(index), element.y + position.getZ(index));
    if (geometry.index) for (let index = 0; index < geometry.index.count; index++) indices.push(offset + geometry.index.getX(index));
    geometry.dispose();
  }
  return { ...mesh, positions, indices };
}

/** Full graph synthesis for the first three validation typologies only.
 * No source region is directly promoted to an occupied floor. All regions and
 * relationship endpoints contribute to the envelope, directional field and
 * elevation distribution before local surface development is applied.
 */
function buildDomainOrganization(source: CompositionPlacement[], analysis: ReturnType<typeof analyzeSourceGeometry>, mode: PrototypeGeometryMode, typology: PrototypeTypologyId, descriptors: DescriptorSettings, controls: ContinuityControls, seed: number) {
  const regions = mode === "letters" ? analysis.letters : mode === "voids" ? analysis.voids : [...analysis.letters, ...analysis.voids];
  if (!regions.length) return undefined; // No substitution of solids for missing voids.
  const relationships = analysis.relationships.filter(r => mode === "combined" || r.kind === (mode === "letters" ? "adjacency" : "void-link"));
  const occupiedRegions = mode === "combined" ? analysis.letters : regions;
  const points = occupiedRegions.flatMap(r => r.points);
  const graphPoints = relationships.flatMap(r => [r.from, r.to]);
  const cloud = [...points, ...graphPoints];
  if (cloud.length < 3) return undefined;
  const d = (key: keyof DescriptorSettings) => descriptor(descriptors, key);
  const organic = controls.organicInfluence / 100;
  const center = boundaryCenter(cloud);
  const minZ = Math.min(...regions.map(r => r.zMin)), maxZ = Math.max(...regions.map(r => r.zMax));
  const sourceSpan = Math.max(.5, maxZ - minZ);
  // Directions integrate every source region and edge, including interior
  // regions that a convex hull alone would discard.
  const hull = convexHull(cloud);
  // Mesh-derived hull vertices accumulate around letter corners. Architectural
  // spans must be measured by length, not by the number of tessellation points.
  const resample = (boundary: Point2[], count = 64): Point2[] => {
    const lengths = boundary.map((p,i)=>Math.hypot(p[0]-boundary[(i+1)%boundary.length][0],p[1]-boundary[(i+1)%boundary.length][1]));
    const total = lengths.reduce((a,b)=>a+b,0);
    return Array.from({length:count},(_,i)=>{
      let distance = total*i/count, edge=0;
      while(edge<lengths.length-1 && distance>lengths[edge]) distance-=lengths[edge++];
      const a=boundary[edge],b=boundary[(edge+1)%boundary.length],t=distance/Math.max(.000001,lengths[edge]);
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    });
  };
  const outline = resample(smoothClosedBoundary(hull, 2));
  const outer = fitBoundary(outline.map(([x, y], i): Point2 => {
    const angle = Math.atan2(y - center[1], x - center[0]);
    const density = regions.reduce((sum, r) => sum + Math.cos(angle - Math.atan2(r.center[1] - center[1], r.center[0] - center[0])) * Math.sqrt(r.area), 0) / Math.max(1, regions.reduce((sum, r) => sum + Math.sqrt(r.area), 0));
    const factor = .96 + d("monumental") * .06 + d("sculptural") * .025 * Math.sin(angle * 3 + seed * .01) + density * (.025 + controls.sourcePreservation/1000) + d("surreal") * .025 * Math.sin(i * .7) + d("hierarchical")*.025*Math.cos(angle*2);
    return [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor];
  }), 8.8);
  const c = boundaryCenter(outer);
  const base = minZ + .3;
  const height = Math.max(typology === "contained-room-within-volume" ? 12.5 : 8.5, sourceSpan * (.78 + controls.elevationPreservation / 500 + d("monumental") * .08));
  const shrink = (amount: number, offset: Point2 = [0, 0]): Point2[] => outer.map(([x, y]) => [c[0] + (x - c[0]) * amount + offset[0], c[1] + (y - c[1]) * amount + offset[1]]);
  const primary: ArchitecturalElement[] = [], circulation: ArchitecturalElement[] = [], connections: ArchitecturalConnection[] = [];
  const allRegions = [...analysis.letters,...analysis.voids];
  const allEdges = analysis.relationships;
  const byId = new Map(allRegions.map(r=>[r.id,r]));
  const unique = (values: string[]) => [...new Set(values)].sort();
  const incident = (rs: SourceBoundary[]) => { const ids=new Set(rs.map(r=>r.id)); return allEdges.filter(e=>ids.has(e.fromId ?? "") && ids.has(e.toId ?? "")); };
  const assign = (e: ArchitecturalElement, rs: SourceBoundary[], edges: SourceRelationship[], operation: string, role: SourceAssignment["role"]="local", explanation="Geometry constructed from the assigned local source features.") => {
    const influences=operation.includes("CIRCULATION")?["circulationActivated","verticallyIntegrated"]:operation.includes("CONTAIN")?["hierarchical","openVolume","verticallyIntegrated","visuallyConnected","centralized","convergent"]:operation.includes("VOID")?["openVolume","luminous","centralized","verticallyIntegrated"]:["monumental","sculptural","surreal","hierarchical"];
    const envelopeRegionIds=e.provenance?.role==="envelope"?e.provenance.sourceRegionIds:e.provenance?.envelopeRegionIds;
    e.provenance={architecturalElementId:e.id,sourceMode:mode,sourceLetterIds:unique(rs.flatMap(r=>r.memberIds??[])),sourceRegionIds:unique(rs.map(r=>r.id)),sourceVoidIds:unique(rs.filter(r=>r.kind==="void").map(r=>r.id)),sourceRelationshipIds:unique(edges.flatMap(r=>r.id?[r.id]:[])),typologyOperation:operation,descriptorInfluences:unique([...influences,"sculptural"]),role,explanation,envelopeRegionIds};
    return e;
  };
  // Local groups preserve proxy coordinates; they never become a global hull.
  const voidGroups: SourceBoundary[][]=[];
  for(const v of [...analysis.voids].sort((a,b)=>a.id.localeCompare(b.id))) {
    const group=voidGroups.find(g=>g.every(w=>Math.hypot(v.center[0]-w.center[0],v.center[1]-w.center[1])<1.5));
    if(group) group.push(v); else voidGroups.push([v]);
  }
  const localOutline = (rs: SourceBoundary[], margin=0):Point2[] => {
    const outline=resample(smoothClosedBoundary(convexHull(rs.flatMap(r=>r.points)),1),32), center=boundaryCenter(outline);
    return outline.map(p=>{const length=Math.hypot(p[0]-center[0],p[1]-center[1]);return [p[0]+(p[0]-center[0])*margin/Math.max(.1,length),p[1]+(p[1]-center[1])*margin/Math.max(.1,length)];});
  };
  const pathBetween = (start:SourceBoundary, end:SourceBoundary):SourceRelationship[] => {
    const dist=new Map<string,number>([[start.id,0]]),previous=new Map<string,{id:string;edge:SourceRelationship}>(),visited=new Set<string>();
    while(true){const next=[...dist].filter(([id])=>!visited.has(id)).sort((a,b)=>a[1]-b[1])[0];if(!next)break;const [id,cost]=next;if(id===end.id)break;visited.add(id);
      for(const edge of allEdges){const to=edge.fromId===id?edge.toId:edge.toId===id?edge.fromId:undefined;if(!to)continue;const weight=Math.hypot(edge.to[0]-edge.from[0],edge.to[1]-edge.from[1],edge.toZ-edge.fromZ);if(cost+weight<(dist.get(to)??Infinity)){dist.set(to,cost+weight);previous.set(to,{id,edge});}}
    }
    const result:SourceRelationship[]=[];let id=end.id;while(id!==start.id){const p=previous.get(id);if(!p)return [];const e=p.edge;result.unshift(e.fromId===p.id?e:{...e,fromId:e.toId,toId:e.fromId,from:e.to,to:e.from,fromZ:e.toZ,toZ:e.fromZ});id=p.id;}return result;
  };
  const add = (id: string, kind: ArchitecturalElementKind, footprint: Point2[], z: number, h: number, innerFootprint?: Point2[]) => {
    const e: ArchitecturalElement = { id: `${mode}-${id}`, kind, x: 0, y: 0, z, width: 1, depth: 1, height: h, rotation: 0, footprint, innerFootprint };
    assign(e,occupiedRegions,[],"DOMAIN_ENVELOPE","envelope","Whole-field boundary influence only; excluded from local assignment coverage.");
    primary.push(e); return e;
  };
  const route = (from: Point2, to: Point2, fromZ: number, toZ: number, id: string, edges:SourceRelationship[]=[], rs:SourceBoundary[]=[], widthOverride?:number, straight=false) => {
    const begin=circulation.length;
    const width = widthOverride ?? 1.35 + d("circulationActivated") * .65 + controls.interlevelContinuity / 250 + d("verticallyIntegrated")*.2;
    const routeFootprint=straight?orientedRectangleBoundary([(from[0]+to[0])/2,(from[1]+to[1])/2],Math.hypot(to[0]-from[0],to[1]-from[1])/2+width*.35,width/2,Math.atan2(to[1]-from[1],to[0]-from[0]),Math.min(.35,width*.15)):curvedRibbon(from, to, width, 0, seed);
    circulation.push({ id: `${mode}-domain-route-${id}`, kind: "circulation", x: 0, y: 0, z: fromZ, width: 1, depth: 1, height: .8, rotation: 0, footprint: routeFootprint, rise: toZ - fromZ, slopeFrom: from, slopeTo: to });
    [from, to].forEach((p, i) => circulation.push({ id: `${mode}-domain-landing-${id}-${i}`, kind: "circulation", x: 0, y: 0, z: (i ? toZ : fromZ) - .05, width: 1, depth: 1, height: .9, rotation: 0, footprint: orientedEllipseBoundary(p, width*.54, width*.54, 0, 12) }));
    connections.push({ id, fromId: edges[0]?.fromId ?? `${id}-fallback-a`, toId: edges.at(-1)?.toId ?? `${id}-fallback-b`, from, to, fromZ, toZ, kind: mode === "voids" ? "void-link" : "adjacency", planDistance: Math.hypot(to[0]-from[0], to[1]-from[1]), elevationDifference: Math.abs(toZ-fromZ), visibility: 1, score: 0, connectorKind: Math.abs(toZ-fromZ) > .1 ? "ramp" : "bridge" });
    const used=rs.length?rs:edges.flatMap(edge=>[byId.get(edge.fromId??""),byId.get(edge.toId??"")].filter((r):r is SourceBoundary=>!!r));
    circulation.slice(begin).forEach(e=>assign(e,used,edges,"BRIDGE / CIRCULATION",edges.length?"local":"fallback",edges.length?"Route follows assigned source graph endpoints.":"Typology connection fallback; not counted as source-graph coverage."));
  };
  if (mode !== "voids") {
    for (const item of recenteredPlacements(source)) {
      const identity = placementIdentity(item);
      const solid = letterSpaceElement(item, `${mode}-letter-space-${lineageKey([identity])}`);
      const support = analysis.letters.filter((candidate) => candidate.memberIds?.includes(identity));
      assign(solid, support, incident(support), "FULL_LETTER_VOLUME", "local", "Occupied space is the complete transformed letter solid, including its full outline and thickness.");
      primary.push(solid);
    }
  }
  // Entry chooses an actual boundary direction using the complete relationship
  // field, with the sequential descriptor changing the arrival progression.
  const peripheral = [...regions].sort((a,b)=>Math.hypot(b.center[0]-c[0],b.center[1]-c[1])-Math.hypot(a.center[0]-c[0],a.center[1]-c[1]) || a.id.localeCompare(b.id))[0];
  const entryIndex = outer.reduce((best,p,i)=>Math.hypot(p[0]-peripheral.center[0],p[1]-peripheral.center[1])<Math.hypot(outer[best][0]-peripheral.center[0],outer[best][1]-peripheral.center[1])?i:best,0);
  const entry = peripheral.center;
  let inner: Point2[] | undefined;
  if (typology === "flat-deep-plan-plate") {
    // O3 proof of concept: each letter contributes its complete solid. Connected
    // negative-space cells become shaped void volumes. The graph is consulted
    // only after these occupied letters and openings exist.
    const letterVolumes = fullLetterVolumes(source);
    const voidVolumes = fullVoidVolumes(source);
    const synthesize=(input:SourceBoundary[],limit:number)=>{
      const groups=input.map(region=>[region]);
      while(groups.length>limit){let best:{a:number;b:number;score:number}|undefined;
        for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
          const first=boundaryCenter(groups[a].flatMap(region=>region.points)),second=boundaryCenter(groups[b].flatMap(region=>region.points));
          const firstZ=groups[a].reduce((sum,region)=>sum+region.z,0)/groups[a].length,secondZ=groups[b].reduce((sum,region)=>sum+region.z,0)/groups[b].length;
          const score=Math.hypot(first[0]-second[0],first[1]-second[1])+Math.abs(firstZ-secondZ)*.22;
          if(!best||score<best.score)best={a,b,score};
        }
        if(!best)break;groups[best.a].push(...groups[best.b]);groups.splice(best.b,1);
      }
      return groups.map(group=>{const points=smoothClosedBoundary(convexHull(group.flatMap(region=>region.points)),1),zMin=Math.min(...group.map(region=>region.zMin)),zMax=Math.max(...group.map(region=>region.zMax)),memberIds=unique(group.flatMap(region=>region.memberIds??[]));return{id:`source-zone-${lineageKey(group.map(region=>region.id))}`,memberIds,kind:group[0].kind,points,center:boundaryCenter(points),z:group.reduce((sum,region)=>sum+region.z*region.area,0)/Math.max(.001,group.reduce((sum,region)=>sum+region.area,0)),zMin,zMax,area:polygonArea(points)};});
    };
    const letterZones=synthesize(letterVolumes,Math.min(12,Math.max(4,Math.ceil(Math.sqrt(letterVolumes.length)))));
    const letterArchitectureZones=letterZones.map(volume=>({...volume,points:fitBoundary(volume.points,9.05),center:boundaryCenter(fitBoundary(volume.points,9.05)),area:polygonArea(fitBoundary(volume.points,9.05))}));
    const voidArchitectureZones=voidVolumes.map(volume=>{const points=fitBoundary(scaleBoundary(volume.points,1.24+d("openVolume")*.08),9.05);return{...volume,points,center:boundaryCenter(points),area:polygonArea(points)};});
    const datumRegions = mode === "voids" ? voidVolumes : letterVolumes;
    if (!datumRegions.length) return undefined;
    const datum = datumRegions.reduce((sum, r) => sum + r.z * r.area, 0) / Math.max(.001, datumRegions.reduce((sum, r) => sum + r.area, 0)) + (d("verticallyIntegrated")-.5)*sourceSpan*.04;
    const sourceElements: ArchitecturalElement[] = primary.filter((element) => element.letterSolid).map((element) => ({ ...element, id: `${mode}-unified-${element.id}` }));
    const sourceSupport=(region:SourceBoundary)=>region.kind==="letter"
      ? analysis.letters.filter(candidate=>(candidate.memberIds??[]).some(id=>region.memberIds?.includes(id)))
      : analysis.voids.filter(candidate=>Math.abs(candidate.z-region.z)<Math.max(2,region.zMax-region.zMin)&&signedPolygonDistance(candidate.center,region.points)<1.6);
    const sourceToElement = (region: SourceBoundary, kind: ArchitecturalElementKind, footprint: Point2[], elementId: string, opening?: Point2[]) => {
      const sourceHeight = Math.max(.24, region.zMax-region.zMin);
      const normalizedZ = (region.z-minZ)/Math.max(.001,sourceSpan);
      const sourceElement: ArchitecturalElement = { id: `${mode}-unified-source-${elementId}`, kind, x:0,y:0,z:region.zMin,width:1,depth:1,height:sourceHeight,rotation:0,footprint,innerFootprint:opening,transparent:kind==="void" };
      const support=sourceSupport(region);
      assign(sourceElement,support,incident(support),kind==="void"?"FULL_VOID_VOLUME":"FULL_LETTER_VOLUME");
      sourceElements.push(sourceElement);
      return { sourceHeight, normalizedZ };
    };
    if(mode!=="letters")for(const volume of voidVolumes)sourceToElement(volume,"void",fitBoundary(volume.points,8.5),volume.id);
    if (mode === "voids") {
      for (const volume of voidArchitectureZones) {
        const sourceVolume=voidVolumes.find(candidate=>candidate.id===volume.id)??volume;
        const opening = fitBoundary(sourceVolume.points,8.5);
        const occupied = volume.points;
        const normalizedZ = (volume.z-minZ)/Math.max(.001,sourceSpan);
        const ring = add(`full-form-void-edge-${volume.id}`,"platform",occupied,datum-.12+normalizedZ*.08,.58,opening);
        const support=sourceSupport(volume);
        assign(ring,support,incident(support),"PLATE / FULL_VOID_BOUNDARY","local","O3 occupied surface follows the boundary of a connected inter-letter void volume.");
        const cut = add(`full-form-void-${volume.id}`,"void",opening,datum-.9,2.5);
        assign(cut,support,incident(support),"VOID / FULL_VOID_VOLUME","local","Subtractive opening preserves the full connected void-volume footprint.");
        if(!inner)inner=opening;
      }
    } else if (mode === "combined") {
      // In Combined mode the same void volumes cut the letter-derived plate
      // field. They are not generated as a second, overlaid architecture.
      for (const volume of voidVolumes) {
        const opening=fitBoundary(scaleBoundary(volume.points,.58+d("openVolume")*.12+d("luminous")*.06),8.5);
        const cut=add(`full-form-void-${volume.id}`,"void",opening,datum+.36,1.45);
        const support=sourceSupport(volume);
        assign(cut,support,incident(support),"VOID / FULL_VOID_VOLUME","local","Connected negative-space volume forms a source-shaped opening while a continuous occupied substrate preserves O3 workplace continuity.");
        if(!inner)inner=opening;
      }
    }
    const occupiedComponents = mode === "voids" ? voidArchitectureZones : letterArchitectureZones;
    const componentSupport=sourceSupport;
    if(occupiedComponents.length>2){
      const west=[...occupiedComponents].sort((a,b)=>a.center[0]-b.center[0])[0],east=[...occupiedComponents].sort((a,b)=>b.center[0]-a.center[0])[0];
      const south=[...occupiedComponents].sort((a,b)=>a.center[1]-b.center[1])[0],north=[...occupiedComponents].sort((a,b)=>b.center[1]-a.center[1])[0];
      const supports=unique(occupiedComponents.flatMap(component=>componentSupport(component).map(region=>region.id))).map(id=>byId.get(id)).filter((region):region is SourceBoundary=>!!region);
      const longitudinal=add("full-form-longitudinal-plate","platform",fitBoundary(curvedRibbon(west.center,east.center,4.8,.04,seed),9.15),datum-.28,.72);
      const transverse=add("full-form-transverse-plate","platform",fitBoundary(curvedRibbon(south.center,north.center,4.25,.04,seed+1),9.15),datum-.27,.7);
      [longitudinal,transverse].forEach(element=>assign(element,supports,incident(supports),"PLATE / FULL_SOURCE_FIELD","local","Broad O3 plate band spans source-derived extrema after all source volumes are analyzed."));
    }
    const nearestPair=(a:SourceBoundary,b:SourceBoundary):[Point2,Point2]=>{
      let pair:[Point2,Point2]=[a.center,b.center],distance=Infinity;
      for(const first of a.points)for(const second of b.points){const next=Math.hypot(first[0]-second[0],first[1]-second[1]);if(next<distance){distance=next;pair=[first,second];}}
      return pair;
    };
    // A broad minimum spanning set joins full-form components. Relationship
    // paths annotate and prioritize links, but never generate the plate field.
    if(occupiedComponents.length>1){
      const connected=new Set([0]);
      while(connected.size<occupiedComponents.length){let best:{a:number;b:number;score:number}|undefined;
        for(const a of connected)for(let b=0;b<occupiedComponents.length;b++)if(!connected.has(b)){
          const first=occupiedComponents[a],second=occupiedComponents[b],plan=Math.hypot(first.center[0]-second.center[0],first.center[1]-second.center[1]),elevation=Math.abs(first.z-second.z);
          const graphPath=pathBetween(first,second),score=plan+elevation*.18-(graphPath.length?1.2:0);
          if(!best||score<best.score)best={a,b,score};
        }
        if(!best)break;connected.add(best.b);
        const first=occupiedComponents[best.a],second=occupiedComponents[best.b],firstSupport=componentSupport(first),secondSupport=componentSupport(second);
        let graphPath:SourceRelationship[]=[];
        for(const a of firstSupport)for(const b of secondSupport){const candidate=pathBetween(a,b);if(candidate.length&&(!graphPath.length||candidate.length<graphPath.length))graphPath=candidate;}
        route(first.center,second.center,datum-.3,datum-.3,`full-form-${lineageKey([first.id,second.id])}`,graphPath,[...firstSupport,...secondSupport],3.8+d("circulationActivated")*.8,true);
      }
    }
    // Keep the established reusable east/north tile interfaces connected to
    // the source-derived workplace without allowing those interfaces to shape
    // the primary plate organization.
    for(const [edgeName,target] of [["east",[9.2,0] as Point2],["north",[0,9.2] as Point2]] as const){
      const anchor=[...occupiedComponents].sort((a,b)=>Math.hypot(a.center[0]-target[0],a.center[1]-target[1])-Math.hypot(b.center[0]-target[0],b.center[1]-target[1]))[0];
      if(anchor)route(anchor.center,target,datum-.3,datum-.3,`tile-${edgeName}`,[],componentSupport(anchor),3.8+d("circulationActivated")*.8,true);
    }
    const diagnostic=domainStats();
    diagnostic.organization="Full source-volume O3 plate / volumetric openings / secondary component links";
    return { primary, circulation, connections, outer, inner, entry, base: datum, diagnostic, develop, sourceElements,
      sourceComponentsBeforeUnion: mode==="letters"?source.length:mode==="voids"?analysis.voids.length:source.length+analysis.voids.length,
      sourceComponentsAfterUnion: mode==="letters"?letterVolumes.length:mode==="voids"?voidVolumes.length:letterVolumes.length+voidVolumes.length,
      disconnectedSourceGroups: occupiedComponents.length,
      volumetricRepresentation:"Complete transformed letter solids + connected void volumes + SDF union" };
  }
  if (typology === "contained-room-within-volume") {
    // One enclosing field and a nested room, with an occupiable interstitial
    // floor. The upper ring is a canopy, not another independent room floor.
    add("primary-space-interstitial", "stage", outer, base, .8);
    const roomCandidates=mode === "voids" ? analysis.voids : analysis.letters;
    const candidates=roomCandidates.map(anchor=>{
      const neighbors=roomCandidates.filter(r=>Math.abs(r.z-anchor.z)<2.5&&Math.hypot(r.center[0]-anchor.center[0],r.center[1]-anchor.center[1])<4.2).sort((a,b)=>Math.hypot(a.center[0]-anchor.center[0],a.center[1]-anchor.center[1])-Math.hypot(b.center[0]-anchor.center[0],b.center[1]-anchor.center[1])).slice(0,mode==="voids"?3:7);
      const boundary=localOutline(neighbors,.4),center=boundaryCenter(boundary),coherence=neighbors.reduce((s,r)=>s+Math.hypot(r.center[0]-center[0],r.center[1]-center[1]),0)/neighbors.length;
      const adjacent=analysis.voids.filter(v=>Math.hypot(v.center[0]-center[0],v.center[1]-center[1])<5&&Math.abs(v.z-anchor.z)<3);
      const internal=-signedPolygonDistance(center,outer),adjacency=incident(neighbors).length;
      return{anchor,neighbors,boundary,score:internal*(1+d("centralized")+d("convergent"))+Math.min(5,adjacency)*.3+(mode==="letters"?0:Math.min(4,adjacent.length)*.25)-coherence*.4-Math.abs(polygonArea(boundary)-32)*.025};
    }).filter(g=>g.boundary.every(p=>signedPolygonDistance(p,outer)<-.6)).sort((a,b)=>b.score-a.score||a.anchor.id.localeCompare(b.anchor.id));
    const selected=candidates[0];
    if(!selected)return undefined;
    inner=localOutline(selected.neighbors,.45+d("hierarchical")*.25-d("openVolume")*.1);
    const roomSources=selected.neighbors,roomEdges=incident(roomSources);
    const roomHeight = Math.max(7.2, height * (.36 + d("hierarchical") * .1)) + d("verticallyIntegrated")*.3;
    add("contained-room", "platform", inner, base + .35, .8);
    // Partial enclosing walls leave a real entrance opening in the inner room.
    const roomInner = scaleBoundary(inner, .83);
    const roomEntranceIndex=inner.reduce((best,p,i)=>Math.hypot(p[0]-entry[0],p[1]-entry[1])<Math.hypot(inner![best][0]-entry[0],inner![best][1]-entry[1])?i:best,0);
    for (let i = 0; i < inner.length; i++) {
      if (Math.min(Math.abs(i-roomEntranceIndex),inner.length-Math.abs(i-roomEntranceIndex)) <= Math.max(1, Math.floor(inner.length*.07))) continue;
      const j = (i+1)%inner.length;
      add(`contained-enclosure-${i}`, "enclosure", [inner[i], inner[j], roomInner[j], roomInner[i]], base+.35, roomHeight);
    }
    // A roof slab makes room containment legible in section; an open side and
    // canopy aperture preserve sightlines into the hierarchy.
    add("contained-room-roof", "enclosure", inner, base+.35+roomHeight, .8);
    primary.filter(e=>e.id.includes("contained-room")||e.id.includes("contained-enclosure")).forEach(e=>assign(e,roomSources,roomEdges,"CONTAIN / ENCLOSE"));
    const adjacentVoids=voidGroups.filter(g=>Math.abs(g[0].z-selected.anchor.z)<3&&g.every(v=>signedPolygonDistance(v.center,inner!)>1.8&&signedPolygonDistance(v.center,outer)<-1.5)).sort((a,b)=>Math.hypot(a[0].center[0]-selected.anchor.center[0],a[0].center[1]-selected.anchor.center[1])-Math.hypot(b[0].center[0]-selected.anchor.center[0],b[0].center[1]-selected.anchor.center[1])).slice(0,mode==="letters"?1:2);
    for(const group of adjacentVoids)assign(add(`interstitial-opening-${lineageKey(group.map(r=>r.id))}`,"void",localOutline(group),base-.5,1.8),group,incident(group),"VOID / INTERSTITIAL");
    const outerInner = shrink(.88);
    for (let side = 0; side < 3; side++) {
      const start = (entryIndex + Math.floor(outer.length*(.22+side*.24)))%outer.length;
      const end = (start + Math.max(2, Math.floor(outer.length*(.1 - d("visuallyConnected")*.035))))%outer.length;
      const band: Point2[] = [];
      for (let k = start; k !== end; k = (k+1)%outer.length) band.push(outer[k]);
      band.push(outer[end], outerInner[end]);
      for (let k = (end-1+outer.length)%outer.length; k !== start; k = (k-1+outer.length)%outer.length) band.push(outerInner[k]);
      band.push(outerInner[start]);
      add(`outer-containing-shell-${side}`, "enclosure", band, base, height);
    }
    add("outer-containing-canopy", "enclosure", outer, base+height-.5, .8, shrink(.6+d("luminous")*.12));
    const roomEntry = inner.reduce((a,p)=>Math.hypot(p[0]-entry[0],p[1]-entry[1])<Math.hypot(a[0]-entry[0],a[1]-entry[1])?p:a,inner[0]);
    const approach=pathBetween(peripheral,selected.anchor);
    for(const [index,edge] of approach.entries()){
      const a=byId.get(edge.fromId??""),b=byId.get(edge.toId??"");if(!a||!b)continue;
      route(a.center,index===approach.length-1?roomEntry:b.center,base+.35*index/approach.length,base+.35*(index+1)/approach.length,`room-${lineageKey([edge.id??String(index)])}`,[edge],[a,b]);
    }
    if(!approach.length)route(entry,roomEntry,base,base+.35,"room-approach-fallback");
  } else {
    const ordered=analysis.voids.filter(v=>localOutline([v],.45+d("openVolume")*.45+d("luminous")*.25).every(p=>signedPolygonDistance(p,outer)<-1)).sort((a,b)=>a.z-b.z||a.id.localeCompare(b.id));
    const chains=new Map<string,SourceBoundary[]>();
    for(const v of ordered){let best=[v];for(const prior of ordered){if(prior.z>=v.z-.5)continue;
      const edge=allEdges.find(e=>e.kind==="void-link"&&((e.fromId===prior.id&&e.toId===v.id)||(e.fromId===v.id&&e.toId===prior.id)));
      if(!edge || Math.hypot(v.center[0]-prior.center[0],v.center[1]-prior.center[1])>3.4 || v.z-prior.z>4.5)continue;
      const candidate=[...(chains.get(prior.id)??[prior]),v];if(candidate.at(-1)!.z-candidate[0].z>best.at(-1)!.z-best[0].z)best=candidate;
    }chains.set(v.id,best);}
    const chainScore=(g:SourceBoundary[])=>{
      const center=boundaryCenter(g.flatMap(r=>r.points)),nearLetters=analysis.letters.filter(r=>Math.hypot(r.center[0]-center[0],r.center[1]-center[1])<3);
      return (g.at(-1)!.z-g[0].z)*10+g.length-Math.hypot(center[0]-c[0],center[1]-c[1])*(1+d("centralized"))+(mode==="letters"?nearLetters.reduce((s,r)=>s+r.area,0)*.1:g.reduce((s,r)=>s+r.area,0));
    };
    const chain=[...chains.values()].filter(g=>g.length>=2&&g.at(-1)!.z-g[0].z>=2.5).sort((a,b)=>chainScore(b)-chainScore(a)||a[0].id.localeCompare(b[0].id))[0];
    if(!chain)return undefined;
    const chainEdges=incident(chain).filter(e=>e.kind==="void-link");
    const verticalScale=Math.max(1,8.5/(chain.at(-1)!.z-chain[0].z));
    const sections=chain.map(v=>{
      const neighbors=analysis.voids.filter(w=>Math.abs(w.z-v.z)<.5&&Math.hypot(w.center[0]-v.center[0],w.center[1]-v.center[1])<2.8).sort((a,b)=>Math.hypot(a.center[0]-v.center[0],a.center[1]-v.center[1])-Math.hypot(b.center[0]-v.center[0],b.center[1]-v.center[1]));
      let outline=localOutline(neighbors,.45+d("openVolume")*.45+d("luminous")*.25);
      while(neighbors.length>1 && outline.some(p=>signedPolygonDistance(p,outer)>-1)){neighbors.pop();outline=localOutline(neighbors,.45+d("openVolume")*.45+d("luminous")*.25);}
      const z=base+(v.z-chain[0].z)*verticalScale;
      return {v,neighbors,outline,z};
    });
    inner=sections[0].outline;
    sections.forEach((section,i)=>{
      const localLetters=mode==="letters"?analysis.letters.filter(r=>Math.abs(r.z-section.v.z)<1.8&&Math.hypot(r.center[0]-section.v.center[0],r.center[1]-section.v.center[1])<5.8):[];
      const candidate=localLetters.length>=3?localOutline(localLetters,.8):outer;
      const floorBoundary=section.outline.every(p=>signedPolygonDistance(p,candidate)<-1)?candidate:outer;
      const e=add(i?`void-overlook-${section.v.id}`:"primary-space-arrival",i?"platform":"stage",floorBoundary,section.z,.85,section.outline);
      assign(e,[...section.neighbors,...localLetters], [...chainEdges.filter(edge=>edge.fromId===section.v.id||edge.toId===section.v.id),...incident(localLetters)],"VOID / VERTICALIZE / OVERLOOK");
    });
    for(let i=0;i<sections.length-1;i++){
      const a=sections[i],b=sections[i+1],edge=chainEdges.find(e=>(e.fromId===a.v.id&&e.toId===b.v.id)||(e.toId===a.v.id&&e.fromId===b.v.id));
      const anchor=(s:typeof a):Point2=>{
        const cc=boundaryCenter(s.outline);
        const candidates=s.outline.map(p=>{const dx=p[0]-cc[0],dy=p[1]-cc[1],l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*.9,p[1]+dy/l*.9] as Point2;}).filter(p=>signedPolygonDistance(p,outer)<-.3);
        return candidates.sort((p,q)=>Math.hypot(p[0]-entry[0],p[1]-entry[1])-Math.hypot(q[0]-entry[0],q[1]-entry[1]))[0]??outer[entryIndex];
      };
      const from=anchor(a),to=anchor(b),via:Point2=[(from[0]+entry[0])/2,(from[1]+entry[1])/2];
      route(from,via,a.z,(a.z+b.z)/2,`chain-${a.v.id}-${b.v.id}-a`,edge?[edge]:[],[a.v,b.v]);
      route(via,to,(a.z+b.z)/2,b.z,`chain-${a.v.id}-${b.v.id}-b`,edge?[edge]:[],[a.v,b.v]);
    }
  }
  return { primary, circulation, connections, outer, inner, entry, base, diagnostic: domainStats(), develop };
  function develop(element: ArchitecturalElement): ArchitecturalElement {
    // A single spatial displacement field deforms coincident boundaries
    // together AFTER occupied topology and circulation have been established.
    // Tile interfaces remain fixed; horizontal elevations remain flat.
    if (element.kind === "connector" || element.id.includes("primary-ramp")) return element;
    const amplitude = organic * controls.boundaryCurvature/100 * (.12 + d("sculptural")*.3) * (1-controls.sourcePreservation/250);
    const move = ([x,y]: Point2): Point2 => [x + amplitude*Math.sin((y-c[1])*.48 + seed*.01), y + amplitude*Math.sin((x-c[0])*.41 + seed*.017)];
    return { ...element, footprint: element.footprint?.map(move), innerFootprint: element.innerFootprint?.map(move), slopeFrom: element.slopeFrom ? move(element.slopeFrom) : undefined, slopeTo: element.slopeTo ? move(element.slopeTo) : undefined };
  }
  function domainStats() {
    const assignments=[...primary,...circulation].flatMap(e=>e.provenance?.role==="local"?[e.provenance]:[]);
    const regionIds=new Set(assignments.flatMap(p=>p.sourceRegionIds)),edgeIds=new Set(assignments.flatMap(p=>p.sourceRelationshipIds)),voidIds=new Set(assignments.flatMap(p=>p.sourceVoidIds)),memberIds=new Set(assignments.flatMap(p=>p.sourceLetterIds));
    return { componentsAvailable: allRegions.length, componentsUsed: regionIds.size, relationshipsAvailable: allEdges.length, relationshipsUsed: edgeIds.size, detailSamples: 0,
      lettersAvailable:unique(analysis.letters.flatMap(r=>r.memberIds??[])).length,lettersAssigned:memberIds.size,voidsAvailable:analysis.voids.length,voidsAssigned:voidIds.size,provenanceElements:[...primary,...circulation].filter(e=>e.provenance?.role!=="fallback").length,fallbackElements:[...primary,...circulation].filter(e=>e.provenance?.role==="fallback").length,
      source: [Math.max(...cloud.map(p=>p[0]))-Math.min(...cloud.map(p=>p[0])), Math.max(...cloud.map(p=>p[1]))-Math.min(...cloud.map(p=>p[1])), sourceSpan],
      organization: typology === "contained-room-within-volume" ? "Source-cluster room / full-domain enclosure / assigned interstitial voids" : typology === "flat-deep-plan-plate" ? "Full-domain plate / assigned source courtyards / graph routes" : "Source-assigned atrium chain / sectional occupied levels / graph-based ascent" };
  }
}

/** The occupied mass is the letters where they already sit. Typology then reshapes that mass. */
function intersectingFieldElements(source: CompositionPlacement[], mode: PrototypeGeometryMode, typology: PrototypeTypologyId, orientation: number, branching: number, seed: number): ArchitecturalElement[] {
  const elements: ArchitecturalElement[] = [];
  if (!source.length) return elements;
  const xs = source.map((item) => item.x), ys = source.map((item) => item.y), zs = source.map((item) => item.z);
  const records = source.map((item) => analyzeLetterPlacement(item));
  const center: Point2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const zMin = Math.min(...zs);
  const mean = source.reduce((sum, item) => sum + Math.max(.05, item.scale), 0) / source.length;
  const letterRise = Math.max(.05, ...records.map((record) => record.maxY - record.minY));
  const slab = Math.max(.02, letterRise * .18);
  const axisX = Math.cos(orientation), axisY = Math.sin(orientation);
  const shift = (point: Point2, along: number, across: number): Point2 => [point[0] + axisX * along - axisY * across, point[1] + axisY * along + axisX * across];
  if (mode !== "voids") source.forEach((item, index) => elements.push(letterSpaceElement(item, `${mode}-letter-space-${index}`)));
  const hullPoints = records.flatMap((record) => record.boundary.points);
  const hull = hullPoints.length >= 3 ? convexHull(hullPoints) : orientedEllipseBoundary(center, mean * .6, mean * .45, orientation, 24);
  const hullXs = hull.map((point) => point[0]), hullYs = hull.map((point) => point[1]);
  const span = Math.max(mean, Math.max(...hullXs) - Math.min(...hullXs), Math.max(...hullYs) - Math.min(...hullYs));
  const hullRadius = Math.max(mean * .45, ...hull.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])));
  const add = (id: string, kind: ArchitecturalElement["kind"], footprint: Point2[], z: number, height: number, extra: Partial<ArchitecturalElement> = {}) => {
    elements.push({ id: `${mode}-${id}`, kind, x: 0, y: 0, z, width: 1, depth: 1, height, rotation: 0, footprint, ...extra });
  };
  if (typology === "stepped-amphitheater") {
    const rows = 3 + Math.round(branching * 2);
    for (let row = 0; row < rows; row++) {
      const inner = hullRadius * (.24 + row * .16);
      const outer = inner + hullRadius * .13;
      add(`terraced-armature-${row}`, "platform", amphitheaterBand(center, inner, inner * .86, outer, outer * .86, orientation, -Math.PI / 2, .72), zMin + row * letterRise * .22, slab);
    }
    add("amphitheater-focus", "platform", orientedRectangleBoundary(center, hullRadius * .16, hullRadius * .16, orientation, slab * .25), zMin + slab * .15, slab);
    const aisles = 2 + Math.round(branching * 4);
    for (let aisle = 0; aisle < aisles; aisle++) {
      const side = aisle % 2 ? 1 : -1;
      const spread = (Math.floor(aisle / 2) + 1) / Math.max(1, Math.ceil(aisles / 2));
      const angle = -Math.PI / 2 + side * .72 * (.28 + spread * .62);
      const from = orientedEllipsePoint(center, hullRadius * .18, hullRadius * .16, orientation, angle);
      const to = orientedEllipsePoint(center, hullRadius * .92, hullRadius * .8, orientation, angle);
      add(`terrace-aisle-${aisle}`, "circulation", curvedRibbon(from, to, hullRadius * .08, .04, seed + aisle), zMin, slab, { rise: rows * letterRise * .2, slopeFrom: from, slopeTo: to });
    }
  } else if (typology === "topographic-ground-field-lobby") {
    const count = 4 + Math.round(branching * 2);
    for (let band = 0; band < count; band++) {
      const across = (band - (count - 1) / 2) * span * .045;
      const plate = scaleBoundary(hull, .9 + band * .04).map((point) => shift(point, 0, across));
      add(`topographic-band-${band}`, "circulation", plate, zMin + band * letterRise * .28, slab, { rise: letterRise * (.08 + band * .04), slopeFrom: shift(center, -span * .4, across), slopeTo: shift(center, span * .4, across) });
    }
  } else if (typology === "linear-gallery-lobby" || typology === "continuous-hall-lobby") {
    const from = shift(center, -span * .48, 0), to = shift(center, span * .48, 0);
    const width = typology === "continuous-hall-lobby" ? hullRadius * .55 : hullRadius * .22;
    add(typology === "continuous-hall-lobby" ? "continuous-arrival-hall" : "gallery-spine", "platform", curvedRibbon(from, to, width, .04, seed), zMin, slab);
    const teeth = (typology === "continuous-hall-lobby" ? 3 : 5) + Math.round(branching * (typology === "continuous-hall-lobby" ? 5 : 6));
    for (let tooth = 0; tooth < teeth; tooth++) {
      const amount = (tooth + 1) / (teeth + 1);
      const base: Point2 = [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
      const side = tooth % 2 ? 1 : -1;
      const reach = hullRadius * (.45 + (tooth % 3) * .08) + branching * hullRadius * .08;
      const tip = shift(base, 0, side * reach);
      add(`${typology === "continuous-hall-lobby" ? "hall-rib" : "gallery-tooth"}-${tooth}`, "circulation", curvedRibbon(base, tip, hullRadius * .08, .02, seed + tooth), zMin, slab, { slopeFrom: base, slopeTo: tip });
    }
  } else if (typology === "linear-edge-gallery") {
    source.forEach((item, index) => {
      for (let level = 0; level < 3; level++) {
        add(`edge-block-${index}-${level}`, "platform", orientedRectangleBoundary([item.x, item.y], mean * .42, mean * .28, orientation, slab * .2), item.z + level * slab * 1.5, slab);
      }
    });
  } else if (typology === "folded-undulating-work-surface") {
    for (let band = 0; band < 3; band++) {
      const across = (band - 1) * span * .14;
      const plate = scaleBoundary(hull, .92).map((point) => shift(point, 0, across));
      add(`folded-band-${band}`, "circulation", plate, zMin + band * slab * 1.3, slab, { rise: slab * (1.1 + band * .45), slopeFrom: shift(center, -span * .4, across), slopeTo: shift(center, span * .4, across) });
    }
  } else if (typology === "cascaded-terraced-plates") {
    const rows = 3 + Math.round(branching * 2);
    for (let row = 0; row < rows; row++) {
      const along = (row - (rows - 1) / 2) * span * .12;
      add(`cascaded-plate-${row}`, "platform", orientedEllipseBoundary(shift(center, along, 0), hullRadius * (.72 - row * .06), hullRadius * (.56 - row * .04), orientation, 28), zMin + row * slab * 1.7, slab);
    }
  } else if (typology === "open-hall-workspace") {
    add("open-hall-plate", "platform", orientedEllipseBoundary(center, hullRadius * .95, hullRadius * .72, orientation, 32), zMin, slab);
  } else if (typology === "flat-deep-plan-plate") {
    add("deep-plan-plate", "platform", scaleBoundary(hull, 1.04), zMin, slab * .55);
  } else if (typology === "inserted-horizontal-plate") {
    add("projecting-plate", "platform", curvedRibbon(shift(center, -span * .15, 0), shift(center, span * .55, 0), hullRadius * .7, .06, seed), zMin, slab * .7);
  } else if (typology === "compressed-sequential-lobby") {
    for (let station = 0; station < 5; station++) {
      const along = -span * .42 + station * span * .21;
      const wide = station % 2 === 0;
      add(`sequential-threshold-${station}`, wide ? "platform" : "enclosure", orientedRectangleBoundary(shift(center, along, 0), span * .16, wide ? hullRadius * .92 : hullRadius * .46, orientation, slab * .2), zMin, wide ? letterRise * .28 : letterRise * .92, wide ? {} : { innerFootprint: orientedRectangleBoundary(shift(center, along, 0), span * .1, hullRadius * .28, orientation, slab * .15) });
    }
  } else if (typology === "contained-room-within-volume") {
    const outer = scaleBoundary(hull, 1.22);
    const inner = scaleBoundary(hull, .58);
    add("contained-room", "platform", inner, zMin + slab * .2, slab);
    add("contained-enclosure", "enclosure", outer, zMin, slab * 3.2, { innerFootprint: scaleBoundary(outer, .9) });
  } else if (typology === "vertical-void-lobby") {
    for (let level = 0; level < 3; level++) {
      const plate = scaleBoundary(hull, .82 + level * .08);
      add(`void-overlook-${level}`, level ? "platform" : "stage", plate, zMin + level * Math.max(span * .08, slab * 2.6), slab, { innerFootprint: orientedEllipseBoundary(center, hullRadius * .24, hullRadius * .2, orientation, 24) });
    }
  } else if (typology === "void-field-gathering" || typology === "void-edge-workspace") {
    voidBoundaries(source, false).slice(0, typology === "void-field-gathering" ? 5 : 3).forEach((region, index) => {
      const radius = Math.max(slab, Math.sqrt(region.area / Math.PI));
      const outer = orientedEllipseBoundary(region.center, radius * (typology === "void-edge-workspace" ? 1.85 : 1.35), radius * 1.2, orientation + index * .17, 28);
      add(`void-organized-edge-${index}`, "platform", outer, region.z, slab, { innerFootprint: region.points });
      add(`preserved-field-void-${index}`, "void", region.points, region.zMin, Math.max(slab * 2, region.zMax - region.zMin), { transparent: true });
    });
  }
  if (mode !== "letters") {
    voidBoundaries(source, false).slice(0, 8).forEach((region, index) => {
      if (elements.some((element) => element.id === `${mode}-preserved-field-void-${index}`)) return;
      add(`source-void-${index}`, "void", region.points, region.zMin, Math.max(slab * 2, region.zMax - region.zMin), { transparent: true });
    });
  }
  return elements;
}

export function generateProtoArchitecture({ source, descriptors, mode, category = "gathering", typology = "stepped-amphitheater", seed, continuityControls = DEFAULT_CONTINUITY_CONTROLS, sourceAnalysis, quality = "final" }: { source: CompositionPlacement[]; descriptors: DescriptorSettings; mode: PrototypeGeometryMode; category?: PrototypeCategory; typology?: PrototypeTypologyId; seed: number; continuityControls?: ContinuityControls; sourceAnalysis?: ReturnType<typeof analyzeSourceGeometry>; quality?: "preview" | "final" }): AmphitheaterVariation {
  const rule = getTypologyRule(typology);
  if (rule.category !== category) category = rule.category;
  const behaviors = rule.behaviors;
  const activeOperations = new Set<SpatialOperation>([...rule.operations.primary, ...rule.operations.secondary]);
  const operationEnabled = (operation: SpatialOperation) => activeOperations.has(operation);
  type OrganizerBuilderId = "stepped" | "void-field" | "contained" | "sequential" | "continuous-hall" | "cascaded" | "vertical-void" | "linear-edge" | "gallery-comb" | "folded" | "topographic" | "projected" | "flat-cells" | "open-hall" | "linear" | "plate";
  const organizerDispatch: Array<{ id: OrganizerBuilderId; operations: SpatialOperation[]; matches: () => boolean }> = [
    { id: "stepped", operations: ["TERRACE", "CONVERGE"], matches: () => typology === "stepped-amphitheater" },
    { id: "void-field", operations: ["VOID", "FIELD", "EDGE"], matches: () => typology === "void-field-gathering" || typology === "void-edge-workspace" },
    { id: "contained", operations: ["CONTAIN", "ENCLOSE"], matches: () => typology === "contained-room-within-volume" },
    { id: "sequential", operations: ["SEQUENCE", "ENCLOSE"], matches: () => typology === "compressed-sequential-lobby" },
    { id: "continuous-hall", operations: ["LINEARIZE", "CONTINUITY"], matches: () => typology === "continuous-hall-lobby" },
    { id: "cascaded", operations: ["TERRACE", "PLATE"], matches: () => typology === "cascaded-terraced-plates" },
    { id: "vertical-void", operations: ["VOID", "VERTICALIZE"], matches: () => typology === "vertical-void-lobby" },
    { id: "folded", operations: ["FOLD"], matches: () => typology === "folded-undulating-work-surface" },
    { id: "topographic", operations: ["TOPOGRAPH", "FIELD"], matches: () => typology === "topographic-ground-field-lobby" },
    { id: "projected", operations: ["PROJECT", "PLATE"], matches: () => typology === "inserted-horizontal-plate" },
    { id: "linear-edge", operations: ["LINEARIZE", "EDGE"], matches: () => typology === "linear-edge-gallery" },
    { id: "gallery-comb", operations: ["LINEARIZE", "SEQUENCE"], matches: () => typology === "linear-gallery-lobby" },
    { id: "flat-cells", operations: ["PLATE", "DEPTH"], matches: () => typology === "flat-deep-plan-plate" },
    { id: "open-hall", operations: ["PLATE", "OPENNESS"], matches: () => typology === "open-hall-workspace" },
    { id: "linear", operations: ["LINEARIZE"], matches: () => operationEnabled("LINEARIZE") },
    { id: "plate", operations: ["PLATE"], matches: () => operationEnabled("PLATE") },
  ];
  const organizerBuilder = organizerDispatch.find((builder) => builder.matches())?.id ?? "plate";
  const analysis = sourceAnalysis ?? analyzeSourceGeometry(source, ["contained-room-within-volume", "flat-deep-plan-plate", "vertical-void-lobby"].includes(typology));
  const convergent = descriptor(descriptors, "convergent"), sequential = descriptor(descriptors, "sequential"), visual = descriptor(descriptors, "visuallyConnected");
  const circulation = descriptor(descriptors, "circulationActivated"), descriptorVertical = descriptor(descriptors, "verticallyIntegrated"), open = descriptor(descriptors, "openVolume"), sculptural = descriptor(descriptors, "sculptural");
  const organicInfluence = continuityControls.organicInfluence / 100;
  const organicSculptural = sculptural * (.15 + organicInfluence * .85);
  const sourcePreservation = continuityControls.sourcePreservation / 100;
  const boundaryCurvature = continuityControls.boundaryCurvature / 100;
  const branchingInfluence = continuityControls.branchingInfluence / 100;
  const vertical = clamp((descriptorVertical * (.3 + behaviors.verticalConnectivity * .7) + continuityControls.verticalIntegration / 100) / 2, 0, 1);
  const contextConvergence = convergent * behaviors.convergence;
  const contextOpen = clamp(open * .55 + behaviors.openness * .45, 0, 1);
  const levelContinuity = continuityControls.interlevelContinuity / 100;
  const elevationPreservation = continuityControls.elevationPreservation / 100;
  const fullDomain = ["contained-room-within-volume", "flat-deep-plan-plate", "vertical-void-lobby"].includes(typology);
  const letterRegions = fullDomain ? analysis.letters : distributedBoundaries(analysis.letters, 14), voidRegions = fullDomain ? analysis.voids : distributedBoundaries(analysis.voids, 12);
  const gatheringRegion = mode === "letters" ? letterRegions[0] : fullDomain && mode === "voids" ? voidRegions[0] : voidRegions[0] ?? letterRegions[0];
  const sourceBoundaries = mode === "letters" ? letterRegions : mode === "voids" ? voidRegions : [...letterRegions, ...voidRegions];
  const activeRelationships = analysis.relationships.filter((relationship) => mode === "combined"
    || (mode === "letters" && relationship.kind === "adjacency")
    || (mode === "voids" && relationship.kind === "void-link"));
  const elements: ArchitecturalElement[] = [];
  const initialElements: ArchitecturalElement[] = [];
  const failures: string[] = [];
  if (!gatheringRegion || gatheringRegion.points.length < 3) {
    failures.push(mode === "voids" ? "No bounded inter-letter void component was found for this source." : "The selected source does not contain a usable connected geometric boundary.");
  }

  const sourceSignature = source.reduce((hash, item, index) => (Math.imul(hash ^ Math.round((item.x * 31 + item.y * 37 + item.z * 41 + item.rz) * 100) ^ index, 16777619) >>> 0), 2166136261);
  const signature = (sourceSignature % 997) / 996;
  const influencePoints = sourceBoundaries.flatMap((boundary) => boundary.points);
  const influenceCenter = influencePoints.length ? boundaryCenter(influencePoints) : gatheringRegion?.center ?? [0, 0];
  // Anchor the primary organizer on the largest source cluster while typology
  // centralization still pulls toward the field influence center.
  const centerRetention = (.52 - behaviors.centralization * .38) * (.72 + sourcePreservation * .55);
  const gatheringPull = .58 + sourcePreservation * .3;
  let primaryCenter: Point2 = gatheringRegion
    ? [
        clamp(gatheringRegion.center[0] * gatheringPull + influenceCenter[0] * centerRetention * (1 - gatheringPull), -7.2, 7.2),
        clamp(gatheringRegion.center[1] * gatheringPull + influenceCenter[1] * centerRetention * (1 - gatheringPull), -7.2, 7.2),
      ]
    : [clamp(influenceCenter[0] * centerRetention, -2.4, 2.4), clamp(influenceCenter[1] * centerRetention, -2.4, 2.4)];
  const sourceOrientation = THREE.MathUtils.degToRad(principalOrientation(influencePoints.length >= 3 ? convexHull(influencePoints) : [[-1, 0], [1, 0], [0, 1]]));
  const maximumRegionArea = Math.max(.01, ...sourceBoundaries.map((boundary) => boundary.area));
  const sourceModulation = (angle: number, index: number) => {
    if (!sourceBoundaries.length) return 0;
    const direction: Point2 = [Math.cos(angle + sourceOrientation), Math.sin(angle + sourceOrientation)];
    const aligned = sourceBoundaries.reduce((best, boundary) => {
      const dx = boundary.center[0] - influenceCenter[0], dy = boundary.center[1] - influenceCenter[1], length = Math.max(.001, Math.hypot(dx, dy));
      const score = (dx / length) * direction[0] + (dy / length) * direction[1];
      return score > best.score ? { score, boundary } : best;
    }, { score: -Infinity, boundary: sourceBoundaries[0] });
    const areaInfluence = aligned.boundary.area / maximumRegionArea - .5;
    return clamp(areaInfluence * .075 + Math.sin(index * .71 + seed * .013) * organicSculptural * .025, -.065, .085);
  };
  const stageRadiusX = 2.35 + contextOpen * .45 + behaviors.linearity * 2.4;
  const stageRadiusY = 1.75 + contextOpen * .35 + behaviors.horizontalPlateDominance * .8 - behaviors.linearity * .45;
  let primaryFootprint = ensureBoundaryArea(
    behaviors.linearity > .62 || behaviors.horizontalPlateDominance > .88
      ? orientedRectangleBoundary(primaryCenter, Math.min(7.1, stageRadiusX + behaviors.horizontalPlateDominance * 1.25), Math.min(4.4, stageRadiusY + behaviors.horizontalPlateDominance * 1.15), sourceOrientation, .35 + behaviors.surfaceContinuity * .45)
      : orientedEllipseBoundary(primaryCenter, stageRadiusX, stageRadiusY, sourceOrientation, 44, sourceModulation),
    category === "office" ? 24 : 14, 8.1,
  );
  let primaryInnerFootprint = behaviors.verticalVoidDominance > .55
    ? orientedEllipseBoundary(primaryCenter, 1.05 + behaviors.verticalVoidDominance * .85, .9 + behaviors.verticalVoidDominance * .72, sourceOrientation, 34, sourceModulation)
    : behaviors.containment > .65
      ? orientedRectangleBoundary(primaryCenter, 2.05, 1.55, sourceOrientation, .4)
      : behaviors.plateProjection > .8
        ? orientedEllipseBoundary(primaryCenter, 1.45, 1.05, sourceOrientation, 34, sourceModulation)
      : undefined;
  const voidFirstTypology = organizerBuilder === "void-field";
  const extractedExtent = extentFromBoundaries(sourceBoundaries);
  const redistributedCenter = extractedExtent.minZ + extractedExtent.extent * .38;
  const flatPlateTypology = typology === "open-hall-workspace" || typology === "flat-deep-plan-plate";
  // Preserve vertical ordering while the active typology controls how strongly
  // source elevations become architectural level changes.
  const elevationTransfer = .12 + elevationPreservation * (.18 + behaviors.verticalConnectivity * .3 + behaviors.terracing * .12);
  const architecturalElevation = (region: SourceBoundary) => flatPlateTypology
    ? redistributedCenter
    : redistributedCenter + (region.z - redistributedCenter) * elevationTransfer;
  let primaryElevation = gatheringRegion ? architecturalElevation(gatheringRegion) : 0;
  const figureOwnsGround = ["flat-deep-plan-plate", "linear-gallery-lobby", "linear-edge-gallery", "folded-undulating-work-surface", "topographic-ground-field-lobby"].includes(typology);
  const fieldXs = source.map((item) => item.x), fieldYs = source.map((item) => item.y);
  const fieldSpan = source.length ? Math.max(.2, Math.max(...fieldXs) - Math.min(...fieldXs), Math.max(...fieldYs) - Math.min(...fieldYs)) : 1;
  const fieldCenter: Point2 = source.length ? [(Math.min(...fieldXs) + Math.max(...fieldXs)) / 2, (Math.min(...fieldYs) + Math.max(...fieldYs)) / 2] : [0, 0];
  const meanLetter = source.length ? source.reduce((sum, item) => sum + Math.max(.05, item.scale), 0) / source.length : .5;
  const detail = Math.max(.03, meanLetter * .22);
  const letterField = source.length > 0;
  if (primaryFootprint.length >= 3 && !voidFirstTypology && !figureOwnsGround && !letterField) {
    initialElements.push({ id: `${mode}-initial-primary-space`, kind: "stage", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .4, rotation: 0, footprint: primaryFootprint, innerFootprint: primaryInnerFootprint });
    elements.push({ id: `${mode}-primary-space`, kind: "stage", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .46 + contextOpen * .16, rotation: 0, footprint: primaryFootprint, innerFootprint: primaryInnerFootprint });
    if (behaviors.containment > .65 && primaryInnerFootprint) {
      const room = scaleBoundary(primaryInnerFootprint, .78);
      elements.push({ id: `${mode}-contained-room`, kind: "platform", x: 0, y: 0, z: primaryElevation + .12, width: 1, depth: 1, height: .56, rotation: 0, footprint: room });
      elements.push({ id: `${mode}-contained-enclosure`, kind: "enclosure", x: 0, y: 0, z: primaryElevation + .1, width: 1, depth: 1, height: 2.4, rotation: 0, footprint: room, innerFootprint: scaleBoundary(room, .88) });
    }
  }

  const rise = .28 + vertical * .66 + behaviors.terracing * .22;
  const primaryRows = behaviors.terracing > .55 ? clamp(3 + Math.round(vertical * 1.5 + signature), 4, 5)
    : behaviors.verticalVoidDominance > .7 ? 3
      : behaviors.topographicDeformation > .6 ? 3
        : behaviors.linearity > .65 && behaviors.sequence > .7 ? 2 : 1;

  const openingAngle = THREE.MathUtils.degToRad(48 + contextOpen * 16);
  const openingCenter = -Math.PI / 2 + signature * .18;
  const armatureRise = rise * (.38 + behaviors.terracing * .24 + behaviors.verticalVoidDominance * .2);
  if (letterField) {
    intersectingFieldElements(source, mode, typology, sourceOrientation, branchingInfluence, seed).forEach((element) => {
      initialElements.push({ ...element, id: `${element.id}-initial`, rise: 0 });
      elements.push(element);
    });
  } else if (organizerBuilder === "stepped") {
    // The radial/open C-shaped bands are exclusive to SteppedAmphitheaterRuleSet.
    // Descriptors tune their dimensions but cannot invoke them in another type.
    for (let row = 0; row < primaryRows; row++) {
      const innerX = stageRadiusX + .1 + row * .78, innerY = stageRadiusY + .08 + row * .62;
      const outerX = innerX + .78 + contextOpen * .12, outerY = innerY + .62 + contextOpen * .1;
      const footprint = fitBoundary(amphitheaterBand(primaryCenter, innerX, innerY, outerX, outerY, sourceOrientation, openingCenter, openingAngle, sourceModulation), 8.65);
      const terrace: ArchitecturalElement = { id: `${mode}-terraced-armature-${row}`, kind: "platform", x: 0, y: 0, z: primaryElevation + .18 + row * armatureRise, width: 1, depth: 1, height: .44, rotation: 0, footprint };
      initialElements.push({ ...terrace, id: `${mode}-initial-terraced-armature-${row}` }); elements.push(terrace);
    }
    const focus = orientedRectangleBoundary(primaryCenter, 1.05, 1.05, sourceOrientation, .08);
    elements.push({ id: `${mode}-amphitheater-focus`, kind: "platform", x: 0, y: 0, z: primaryElevation + .06, width: 1, depth: 1, height: .34, rotation: 0, footprint: focus });
  } else if (organizerBuilder === "void-field") {
    const fieldVoids = distributedBoundaries(voidRegions, typology === "void-field-gathering" ? 5 : 3);
    fieldVoids.forEach((region, index) => {
      const center = region.center;
      const radius = clamp(Math.sqrt(region.area / Math.PI), .65, 1.65);
      const outer = fitBoundary(orientedEllipseBoundary(center, radius + (typology === "void-edge-workspace" ? 1.3 : .95), radius + .72, sourceOrientation + index * .17, 34, sourceModulation), 8.7);
      const opening = fitBoundary(smoothClosedBoundary(scaleBoundary(region.points, .82 + behaviors.voidPreservation * .12), 1), 7.2);
      const edgePlate: ArchitecturalElement = { id: `${mode}-void-organized-edge-${index}`, kind: "platform", x: 0, y: 0, z: architecturalElevation(region) + index % 2 * behaviors.verticalConnectivity * .32, width: 1, depth: 1, height: .42, rotation: 0, footprint: outer, innerFootprint: opening };
      initialElements.push({ ...edgePlate, id: `${mode}-initial-void-organized-edge-${index}` });
      elements.push(edgePlate);
      elements.push({ id: `${mode}-preserved-field-void-${index}`, kind: "void", x: 0, y: 0, z: region.zMin, width: 1, depth: 1, height: Math.max(1.6, region.zMax - region.zMin + 1.2), rotation: 0, footprint: opening, transparent: true });
    });
  } else if (organizerBuilder === "sequential") {
    const stations = 5;
    for (let station = 0; station < stations; station++) {
      const amount = station / (stations - 1);
      const alternatingWidth = station % 2 ? 1.05 : 2.2;
      const center: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * (-5.2 + amount * 10.4), primaryCenter[1] + Math.sin(sourceOrientation) * (-5.2 + amount * 10.4)];
      const threshold = orientedRectangleBoundary(center, 1.25, alternatingWidth, sourceOrientation, .18 + boundaryCurvature * .45);
      const enclosure: ArchitecturalElement = { id: `${mode}-sequential-threshold-${station}`, kind: station % 2 ? "enclosure" : "platform", x: 0, y: 0, z: primaryElevation + amount * vertical * .5, width: 1, depth: 1, height: station % 2 ? 1.25 : .44, rotation: 0, footprint: threshold, innerFootprint: station % 2 ? scaleBoundary(threshold, .72) : undefined };
      initialElements.push({ ...enclosure, id: `${mode}-initial-sequential-threshold-${station}` }); elements.push(enclosure);
      if (station > 0) {
        const prior: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * (-5.2 + (station - 1) / (stations - 1) * 10.4), primaryCenter[1] + Math.sin(sourceOrientation) * (-5.2 + (station - 1) / (stations - 1) * 10.4)];
        elements.push({ id: `${mode}-sequential-path-${station}`, kind: "circulation", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .44, rotation: 0, footprint: curvedRibbon(prior, center, 1.05, organicInfluence * boundaryCurvature * .2, seed + station) });
      }
    }
  } else if (organizerBuilder === "continuous-hall") {
    const from: Point2 = [primaryCenter[0] - Math.cos(sourceOrientation) * 7.4, primaryCenter[1] - Math.sin(sourceOrientation) * 7.4];
    const to: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * 7.4, primaryCenter[1] + Math.sin(sourceOrientation) * 7.4];
    const hall: ArchitecturalElement = { id: `${mode}-continuous-arrival-hall`, kind: "platform", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .46, rotation: 0, footprint: fitBoundary(curvedRibbon(from, to, 3.25, organicInfluence * boundaryCurvature * .2, seed), 9.1) };
    initialElements.push({ ...hall, id: `${mode}-initial-continuous-arrival-hall` }); elements.push(hall);
    const ribs = 3 + Math.round(branchingInfluence * 5);
    for (let rib = 0; rib < ribs; rib++) {
      const amount = (rib + 1) / (ribs + 1);
      const base: Point2 = [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
      const side = rib % 2 ? 1 : -1;
      const reach = 1.7 + (rib % 3) * .45 + branchingInfluence * .4;
      const tip: Point2 = [base[0] - Math.sin(sourceOrientation) * side * reach, base[1] + Math.cos(sourceOrientation) * side * reach];
      elements.push({ id: `${mode}-hall-rib-${rib}`, kind: "circulation", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .32, rotation: 0, footprint: curvedRibbon(base, tip, .55 + branchingInfluence * .25, .04, seed + rib), slopeFrom: base, slopeTo: tip });
    }
  } else if (organizerBuilder === "cascaded") {
    for (let row = 0; row < primaryRows; row++) {
      const direction = row % 2 ? 1 : -1;
      const center: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * direction * row * 1.15, primaryCenter[1] + Math.sin(sourceOrientation) * direction * row * 1.15];
      const footprint = fitBoundary(orientedEllipseBoundary(center, 3.1 - row * .28, 2.35 - row * .18, sourceOrientation, 36), 8.55);
      const plate: ArchitecturalElement = { id: `${mode}-cascaded-plate-${row}`, kind: "platform", x: 0, y: 0, z: primaryElevation + .16 + row * armatureRise, width: 1, depth: 1, height: .42, rotation: 0, footprint };
      initialElements.push({ ...plate, id: `${mode}-initial-cascaded-plate-${row}` }); elements.push(plate);
    }
  } else if (organizerBuilder === "vertical-void") {
    for (let level = 1; level <= primaryRows; level++) {
      const footprint = fitBoundary(orientedEllipseBoundary(primaryCenter, stageRadiusX + level * .42, stageRadiusY + level * .32, sourceOrientation, 42, sourceModulation), 8.5);
      const innerFootprint = fitBoundary(orientedEllipseBoundary(primaryCenter, 1.2 + behaviors.verticalVoidDominance * .7, 1 + behaviors.verticalVoidDominance * .58, sourceOrientation, 34), 5);
      const plate: ArchitecturalElement = { id: `${mode}-void-overlook-${level}`, kind: "platform", x: 0, y: 0, z: primaryElevation + level * (.82 + vertical * .55), width: 1, depth: 1, height: .4, rotation: 0, footprint, innerFootprint };
      initialElements.push({ ...plate, id: `${mode}-initial-void-overlook-${level}` }); elements.push(plate);
    }
  } else if (organizerBuilder === "linear-edge") {
    for (let bay = 0; bay < 4; bay++) {
      for (let level = 0; level < 3; level++) {
        const along = -4.6 + bay * 3.05;
        const center: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * along, primaryCenter[1] + Math.sin(sourceOrientation) * along];
        const footprint = fitBoundary(orientedRectangleBoundary(center, 1.25, .85, sourceOrientation, .12), 8.4);
        const block: ArchitecturalElement = { id: `${mode}-edge-block-${bay}-${level}`, kind: "platform", x: 0, y: 0, z: primaryElevation + level * (.38 + behaviors.verticalConnectivity * .12), width: 1, depth: 1, height: .36, rotation: 0, footprint };
        initialElements.push({ ...block, id: `${mode}-initial-edge-block-${bay}-${level}` });
        elements.push(block);
      }
    }
  } else if (organizerBuilder === "gallery-comb") {
    const teeth = 5 + Math.round(branchingInfluence * 6);
    const from: Point2 = [primaryCenter[0] - Math.cos(sourceOrientation) * 6.2, primaryCenter[1] - Math.sin(sourceOrientation) * 6.2];
    const to: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * 6.2, primaryCenter[1] + Math.sin(sourceOrientation) * 6.2];
    const spine: ArchitecturalElement = { id: `${mode}-gallery-spine`, kind: "platform", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .32, rotation: 0, footprint: fitBoundary(curvedRibbon(from, to, 1.15, .04, seed), 8.8) };
    initialElements.push({ ...spine, id: `${mode}-initial-gallery-spine` });
    elements.push(spine);
    for (let tooth = 0; tooth < teeth; tooth++) {
      const amount = teeth === 1 ? .5 : tooth / (teeth - 1);
      const base: Point2 = [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
      const side = tooth % 2 ? 1 : -1;
      const reach = 2.15 + (tooth % 3) * .4 + branchingInfluence * .55;
      const tip: Point2 = [base[0] - Math.sin(sourceOrientation) * side * reach, base[1] + Math.cos(sourceOrientation) * side * reach];
      elements.push({ id: `${mode}-gallery-tooth-${tooth}`, kind: "circulation", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .28, rotation: 0, footprint: curvedRibbon(base, tip, .48 + branchingInfluence * .22, .02, seed + tooth), slopeFrom: base, slopeTo: tip });
    }
  } else if (organizerBuilder === "folded") {
    for (let band = 0; band < 3; band++) {
      const from: Point2 = [-6.2, -1.6 + band * 1.7], to: Point2 = [6.2, -.4 + band * 1.7];
      const ribbon: ArchitecturalElement = { id: `${mode}-folded-band-${band}`, kind: "circulation", x: 0, y: 0, z: primaryElevation + band * .22, width: 1, depth: 1, height: .4, rotation: 0, footprint: curvedRibbon(from, to, 1.35, .42 + organicSculptural * .35, seed + band * 3), rise: rise * (.8 + band * .55), slopeFrom: from, slopeTo: to };
      initialElements.push({ ...ribbon, id: `${mode}-initial-folded-band-${band}` });
      elements.push(ribbon);
    }
  } else if (organizerBuilder === "topographic") {
    const layers = 4 + Math.round(branchingInfluence * 2);
    for (let band = 0; band < layers; band++) {
      const from: Point2 = [-7.6, -4.4 + band * 2.15], to: Point2 = [7.6, -2.2 + band * 2.15];
      const ribbon: ArchitecturalElement = { id: `${mode}-topographic-band-${band}`, kind: "circulation", x: 0, y: 0, z: primaryElevation + band * (.16 + contextOpen * .08), width: 1, depth: 1, height: .34, rotation: 0, footprint: curvedRibbon(from, to, 2.15 + behaviors.openness * .8, .18 + organicSculptural * .28, seed + band), rise: rise * (.28 + band * .12), slopeFrom: from, slopeTo: to };
      initialElements.push({ ...ribbon, id: `${mode}-initial-topographic-band-${band}` });
      elements.push(ribbon);
    }
  } else if (organizerBuilder === "flat-cells") {
    const offsets: Point2[] = [[0, 0], [2.7, 0], [-2.7, 0], [1.35, 2.34], [-1.35, 2.34], [1.35, -2.34], [-1.35, -2.34], [4.05, 2.34], [-4.05, -2.34]];
    offsets.forEach((offset, index) => {
      const center: Point2 = [primaryCenter[0] + offset[0], primaryCenter[1] + offset[1]];
      const cell: ArchitecturalElement = { id: `${mode}-deep-plan-cell-${index}`, kind: "platform", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .22, rotation: 0, footprint: fitBoundary(orientedEllipseBoundary(center, 1.55, 1.55, 0, 24), 8.6) };
      initialElements.push({ ...cell, id: `${mode}-initial-deep-plan-cell-${index}` });
      elements.push(cell);
    });
  } else if (organizerBuilder === "open-hall") {
    const hall: ArchitecturalElement = { id: `${mode}-open-hall-plate`, kind: "platform", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .3, rotation: 0, footprint: fitBoundary(orientedEllipseBoundary(primaryCenter, 4.8 + contextOpen, 3.6 + contextOpen * .4, sourceOrientation, 36), 8.8) };
    initialElements.push({ ...hall, id: `${mode}-initial-open-hall-plate` });
    elements.push(hall);
  } else if (organizerBuilder === "linear") {
    for (let band = 0; band < primaryRows; band++) {
      const localOffset = (band - (primaryRows - 1) / 2) * 2.2;
      const center: Point2 = [primaryCenter[0] - Math.sin(sourceOrientation) * localOffset, primaryCenter[1] + Math.cos(sourceOrientation) * localOffset];
      const footprint = fitBoundary(orientedRectangleBoundary(center, Math.min(8.2, stageRadiusX + 1.2), .75 + behaviors.edgeOccupation * .45, sourceOrientation, .3), 8.85);
      const plate: ArchitecturalElement = { id: `${mode}-linear-band-${band}`, kind: "platform", x: 0, y: 0, z: primaryElevation + band * rise * behaviors.topographicDeformation, width: 1, depth: 1, height: .42, rotation: 0, footprint };
      initialElements.push({ ...plate, id: `${mode}-initial-linear-band-${band}` }); elements.push(plate);
    }
  } else if (organizerBuilder === "projected") {
    [-1, 1].forEach((side) => {
      const from: Point2 = [primaryCenter[0], primaryCenter[1] + side * stageRadiusY * .6];
      const to: Point2 = [primaryCenter[0] + Math.cos(sourceOrientation) * (4.2 + behaviors.plateProjection * 2), primaryCenter[1] + side * (2.1 + contextOpen)];
      const plate: ArchitecturalElement = { id: `${mode}-projecting-plate-${side}`, kind: "platform", x: 0, y: 0, z: primaryElevation + (side > 0 ? rise * .45 : 0), width: 1, depth: 1, height: .42, rotation: 0, footprint: fitBoundary(curvedRibbon(from, to, 2.3 + behaviors.horizontalPlateDominance, .1, seed + side), 8.9) };
      initialElements.push({ ...plate, id: `${mode}-initial-projecting-plate-${side}` }); elements.push(plate);
    });
  }
  const upperInnerX = stageRadiusX + .1 + (primaryRows - 1) * .78;
  const upperInnerY = stageRadiusY + .08 + (primaryRows - 1) * .62;
  const topElevation = primaryElevation + .18 + (primaryRows - 1) * armatureRise;
  if (!letterField && organizerBuilder === "stepped" && operationEnabled("TERRACE")) {
    const aisleCount = 2 + Math.round(branchingInfluence * 4);
    for (let aisle = 0; aisle < aisleCount; aisle++) {
      const side = aisle % 2 ? 1 : -1;
      const spread = (Math.floor(aisle / 2) + 1) / Math.max(1, Math.ceil(aisleCount / 2));
      const angle = openingCenter + side * openingAngle * (.28 + spread * .62);
      const from = orientedEllipsePoint(primaryCenter, stageRadiusX * .72, stageRadiusY * .72, sourceOrientation, angle);
      const to = orientedEllipsePoint(primaryCenter, upperInnerX + .55, upperInnerY + .45, sourceOrientation, angle);
      const route: ArchitecturalElement = {
        id: `${mode}-terrace-aisle-${aisle}`, kind: "circulation", x: 0, y: 0, z: primaryElevation + .08,
        width: 1, depth: 1, height: .5, rotation: 0,
        footprint: fitBoundary(curvedRibbon(from, to, .72 + branchingInfluence * .35 + circulation * .2, organicInfluence * boundaryCurvature * continuityControls.curvatureIntensity / 180, seed + aisle * 13), 8.9),
        rise: topElevation - primaryElevation, slopeFrom: from, slopeTo: to,
      };
      initialElements.push({ ...route, id: `${mode}-initial-terrace-aisle-${aisle}` });
      elements.push(route);
    }
  }
  // Secondary letter/void clusters receive typology-scaled occupied architecture
  // so distant source geometry is not left as analysis overlay only. Descriptors,
  // typology behaviors, and continuity controls still drive local form.
  if (!fullDomain && !letterField) {
    const regionCoverageRadius = 1.65 + behaviors.horizontalPlateDominance * .35;
    const coveredCenters = elements
      .filter((element) => element.kind === "stage" || element.kind === "platform")
      .map((element) => (element.footprint ? boundaryCenter(element.footprint) : [element.x, element.y] as Point2));
    const satelliteRegions = (mode === "voids" ? voidRegions : mode === "letters" ? letterRegions : [...letterRegions, ...voidRegions])
      .filter((region) => region.points.length >= 3 && region.area >= Math.max(.35, maximumRegionArea * .045));
    if (mode !== "voids") {
      const placementByIdentity = new Map(recenteredPlacements(source).map((item) => [placementIdentity(item), item]));
      analysis.letters.forEach((region, index) => {
        const item = placementByIdentity.get(region.memberIds?.[0] ?? "");
        if (!item) return;
        const solid = letterSpaceElement(item, `${mode}-letter-space-${index}`);
        initialElements.push({ ...solid, id: `${mode}-initial-${solid.id}` });
        elements.push(solid);
        coveredCenters.push([item.x, item.y]);
      });
    }
    satelliteRegions.forEach((region, index) => {
      if (region.kind === "letter") return;
      if (coveredCenters.some((center) => Math.hypot(center[0] - region.center[0], center[1] - region.center[1]) < regionCoverageRadius)) return;
      const relative = clamp(Math.sqrt(region.area / maximumRegionArea), .32, 1);
      const retain = .42 + sourcePreservation * .38 + continuityControls.preservation / 280;
      const localRadius = clamp(Math.sqrt(region.area / Math.PI) * (.7 + retain * .55), .55, 2.35) * relative;
      const footprint = sourcePreservation > .38
        ? fitBoundaryPreserveCenter(smoothClosedBoundary(scaleBoundary(region.points, .62 + retain * .28 + organicInfluence * boundaryCurvature * .08), 1), 9.45)
        : fitBoundaryPreserveCenter(
          behaviors.linearity > .62 || behaviors.horizontalPlateDominance > .82
            ? orientedRectangleBoundary(region.center, localRadius * (1.15 + behaviors.horizontalPlateDominance * .35), localRadius * (.72 + contextOpen * .18), sourceOrientation + index * .09, .28 + behaviors.surfaceContinuity * .3)
            : orientedEllipseBoundary(region.center, localRadius * (1.05 + contextOpen * .2), localRadius * (.85 + behaviors.horizontalPlateDominance * .15), sourceOrientation + index * .09, 30, sourceModulation),
          9.45,
        );
      const elevation = architecturalElevation(region);
      const inner = region.kind === "void" || behaviors.verticalVoidDominance > .55
        ? fitBoundaryPreserveCenter(orientedEllipseBoundary(region.center, localRadius * (.42 + behaviors.voidPreservation * .18), localRadius * (.36 + open * .12), sourceOrientation, 24), 9.2)
        : undefined;
      const plate: ArchitecturalElement = {
        id: `${mode}-source-cluster-${region.kind}-${index}`,
        kind: "platform",
        x: 0, y: 0, z: elevation, width: 1, depth: 1,
        height: .4 + contextOpen * .1 + continuityControls.verticalIntegration / 900,
        rotation: 0, footprint, innerFootprint: inner,
      };
      initialElements.push({ ...plate, id: `${mode}-initial-source-cluster-${region.kind}-${index}` });
      elements.push(plate);
      coveredCenters.push(boundaryCenter(footprint));
      if (region.kind === "void") {
        elements.push({
          id: `${mode}-source-cluster-void-${index}`,
          kind: "void", x: 0, y: 0, z: region.zMin - .1, width: 1, depth: 1,
          height: Math.max(1.4, region.zMax - region.zMin + 1.1 + continuityControls.minimumOpening * .08),
          rotation: 0, footprint: inner ?? fitBoundaryPreserveCenter(scaleBoundary(region.points, .78), 9.2), transparent: true,
        });
      }
    });
  }
  // The three validation organizers replace the legacy small organizer before
  // connections. They consume the full extracted graph, never a detail sample.
  const domain = letterField ? undefined : fullDomain ? buildDomainOrganization(source, analysis, mode, typology, descriptors, continuityControls, seed) : undefined;
  if (domain) {
    elements.splice(0, elements.length, ...domain.primary);
    initialElements.splice(0, initialElements.length, ...domain.primary.map(element => ({ ...element })));
    primaryFootprint = domain.outer;
    primaryInnerFootprint = domain.inner;
    primaryCenter = domain.entry;
    primaryElevation = domain.base;
  } else if (fullDomain && !letterField) {
    elements.length = 0;
    initialElements.length = 0;
    failures.push(typology === "vertical-void-lobby" ? "UNSUPPORTED SOURCE FOR VERTICAL VOID LOBBY — no adequate connected vertical void chain." : "No usable source-domain organizer is available. Choose a larger region or a source mode with extracted components.");
  }
  // Source clusters remain occupied architecture nodes and connection anchors.
  // The primary typology organizer still owns the focal form; secondary clusters
  // contribute satellite plates so every substantial letter/void participates.
  const sourceAnchorRegions = mode === "voids"
    ? distributedBoundaries(voidRegions, 10)
    : mode === "letters"
      ? distributedBoundaries(letterRegions, 12)
      : [...distributedBoundaries(letterRegions, 8), ...distributedBoundaries(voidRegions, 4)];
  const organizerTargetEntries = elements
    .filter((element) => element.kind !== "void" && element.kind !== "connector" && (!domain || element.kind === "stage" || element.kind === "platform"))
    .map((element, index) => {
      const footprint = element.footprint ?? defaultFootprint(element);
      const center = element.footprint ? boundaryCenter(footprint) : [element.x, element.y] as Point2;
      return { id: `organizer-${index}`, kind: element.kind === "stage" || element.kind === "platform" ? "letter" as const : "void" as const, center, z: element.z };
    })
    .filter((entry, index, entries) => entries.findIndex((candidate) => Math.hypot(candidate.center[0] - entry.center[0], candidate.center[1] - entry.center[1]) < .35 && Math.abs(candidate.z - entry.z) < .25) === index);
  const organizerOccupiedRegionCount = organizerTargetEntries.length;

  // Register every uncovered source cluster as a network node so Prim's spanning
  // tree and connectionDistance loops can reach distant letters and voids.
  sourceAnchorRegions.forEach((region) => {
    const entry = { id: `source-anchor-${region.id}`, kind: region.kind, center: region.center, z: architecturalElevation(region) };
    if (organizerTargetEntries.every((existing) => Math.hypot(existing.center[0] - entry.center[0], existing.center[1] - entry.center[1]) > .8 || Math.abs(existing.z - entry.z) > .5)) {
      organizerTargetEntries.push(entry);
    }
  });

  // Capture the source-derived islands before any global circulation is added.
  // This is retained for the connectivity diagnostic and makes the distinction
  // between faithful source reconstruction and architectural connection clear.
  const disconnectedElements = elements.map((element) => ({ ...element }));
  const targetNodes = organizerTargetEntries;
  const rawDiscretePlates = disconnectedElements.filter((element) => element.kind === "stage" || element.kind === "platform").length;
  const rawContinuousSurfaces = disconnectedElements.filter((element) => /topographic|fold|continuous-arrival-hall/.test(element.id)).length;
  const explicitRawVoids = disconnectedElements.filter((element) => element.kind === "void");
  const rawInnerVoidCenters = disconnectedElements.flatMap((element) => element.innerFootprint ? [boundaryCenter(element.innerFootprint)] : []);
  const rawPrincipalVoids = explicitRawVoids.length || rawInnerVoidCenters.filter((center, index, centers) => centers.findIndex((candidate) => Math.hypot(candidate[0] - center[0], candidate[1] - center[1]) < .5) === index).length;
  const rawTypologyElements = [...new Set(disconnectedElements.map((element) => element.id
    .replace(`${mode}-`, "")
    .replace(/-?\d+(?:\.\d+)?$/g, "-#")))]
    .sort();
  const rawTerraceActive = operationEnabled("TERRACE")
    && disconnectedElements.some((element) => /terraced-armature|terrace-aisle|cascaded-plate/.test(element.id));
  const rawTopology: TypologyDebug["rawTopology"] = {
    occupiedRegions: organizerOccupiedRegionCount,
    discretePlates: rawDiscretePlates,
    continuousSurfaces: rawContinuousSurfaces,
    principalVoids: rawPrincipalVoids,
    typologySpecificElements: rawTypologyElements,
    terraceActive: rawTerraceActive,
  };
  const connectorElements: ArchitecturalElement[] = [];
  const addConnector = (element: ArchitecturalElement, includeInInitial = false) => {
    connectorElements.push(element);
    elements.push(element);
    if (includeInInitial) initialElements.push({ ...element, id: `${element.id}-initial`, rise: 0 });
  };

  const maximumConnection = Math.max(.5, continuityControls.connectionDistance);
  const routeFamily = circulationFamily(typology);
  const verticalFamilies = new Set<CirculationFamily>(["radial", "field", "atrium", "room", "terrace"]);
  const networkTarget = targetNodes[0] ?? { center: primaryCenter, z: primaryElevation };
  const networkCenter = networkTarget.center;
  const targetElevations = targetNodes.map((target) => target.z);
  const networkMinZ = Math.min(primaryElevation, ...targetElevations), networkMaxZ = Math.max(primaryElevation, ...targetElevations);
  if (!domain && verticalFamilies.has(routeFamily) && networkMaxZ - networkMinZ > detail) {
    // Keep a narrow continuous vertical circulation datum through the full
    // occupied range. Sloped circulation bands provide the traversable route;
    // this core prevents source-derived upper and lower networks from becoming
    // separate reconstructed meshes when their ramp fields narrowly miss.
    const coreSize = (.58 + vertical * .38) * detail;
    const coreHeight = Math.max(detail, networkMaxZ - networkMinZ + detail);
    const verticalCore: ArchitecturalElement = { id: `${mode}-vertical-core`, kind: "circulation", x: networkCenter[0], y: networkCenter[1], z: networkMinZ, width: coreSize, depth: coreSize, height: coreHeight, rotation: 45 };
    initialElements.push({ ...verticalCore, id: `${mode}-initial-vertical-core` });
    addConnector(verticalCore);
  }
  const primaryLinkDistance = Math.hypot(networkCenter[0] - primaryCenter[0], networkCenter[1] - primaryCenter[1]);
  const primaryLinkRise = networkTarget.z - primaryElevation;
  const quietLink = ["layered", "fold", "comb", "flat", "sequence", "plate", "edge"].includes(routeFamily);
  if (!domain && !quietLink && (primaryLinkDistance > .05 || Math.abs(primaryLinkRise) > .05)) {
    const linkTarget: Point2 = primaryLinkDistance > .05
      ? networkCenter
      : [networkCenter[0] + Math.cos(sourceOrientation) * fieldSpan * .22, networkCenter[1] + Math.sin(sourceOrientation) * fieldSpan * .22];
    addConnector({ id: `${mode}-primary-floor-link`, kind: "circulation", x: 0, y: 0, z: primaryElevation - detail * .15, width: 1, depth: 1, height: detail, rotation: 0, footprint: curvedRibbon(primaryCenter, linkTarget, detail * 2.2, organicInfluence * .08, seed), rise: primaryLinkRise, slopeFrom: primaryCenter, slopeTo: linkTarget });
    if (primaryLinkDistance <= .05) {
      addConnector({ id: `${mode}-primary-floor-return`, kind: "circulation", x: 0, y: 0, z: networkTarget.z - detail * .15, width: 1, depth: 1, height: detail, rotation: 0, footprint: curvedRibbon(linkTarget, networkCenter, detail * 2.2, organicInfluence * .08, seed + 1), slopeFrom: linkTarget, slopeTo: networkCenter });
    }
  }
  const distanceToSegment = (point: Point2, from: Point2, to: Point2) => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const amount = clamp(((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / Math.max(.0001, dx * dx + dy * dy), 0, 1);
    return Math.hypot(point[0] - (from[0] + dx * amount), point[1] - (from[1] + dy * amount));
  };
  const sourcePairKeys = new Set(activeRelationships.map((relationship) => {
    const nearest = (point: Point2) => targetNodes.reduce((best, node) => Math.hypot(node.center[0] - point[0], node.center[1] - point[1]) < Math.hypot(best.center[0] - point[0], best.center[1] - point[1]) ? node : best, targetNodes[0]);
    if (!targetNodes.length) return "";
    const a = nearest(relationship.from).id, b = nearest(relationship.to).id;
    return [a, b].sort().join("|");
  }));
  const connectionCandidates: ArchitecturalConnection[] = [];
  targetNodes.forEach((from, fromIndex) => targetNodes.slice(fromIndex + 1).forEach((to) => {
    const dx = to.center[0] - from.center[0], dy = to.center[1] - from.center[1];
    const planDistance = Math.hypot(dx, dy);
    const elevationDifference = Math.abs(to.z - from.z);
    const across = Math.abs(-dx * Math.sin(sourceOrientation) + dy * Math.cos(sourceOrientation));
    const midDist = Math.hypot((from.center[0] + to.center[0]) / 2 - primaryCenter[0], (from.center[1] + to.center[1]) / 2 - primaryCenter[1]);
    const fromRadius = Math.hypot(from.center[0] - primaryCenter[0], from.center[1] - primaryCenter[1]);
    const radialAlign = planDistance < .05 || fromRadius < .05 ? 0 : Math.abs((from.center[0] - primaryCenter[0]) * dx + (from.center[1] - primaryCenter[1]) * dy) / (fromRadius * planDistance);
    const preference = routeFamily === "radial" ? 1.35 - radialAlign * .7
      : routeFamily === "comb" || routeFamily === "spine" || routeFamily === "sequence" || routeFamily === "edge" ? .45 + across / Math.max(planDistance, .2)
        : routeFamily === "layered" || routeFamily === "fold" ? .55 + elevationDifference * .35
          : routeFamily === "flat" || routeFamily === "hall" || routeFamily === "plate" ? .7 + elevationDifference * 3
            : routeFamily === "atrium" ? .7 + (midDist < 1.4 ? 2.2 : 0)
              : routeFamily === "ring" ? .65 + Math.abs(midDist - 2.4) * .35
                : routeFamily === "terrace" ? .6 + elevationDifference * .2
                  : .85;
    const riseWeight = routeFamily === "flat" || routeFamily === "hall" || routeFamily === "plate" ? 4.2 : routeFamily === "atrium" || routeFamily === "radial" || routeFamily === "terrace" ? .55 : 1.35;
    const obstructionCount = voidRegions.filter((region) => region.id !== from.id && region.id !== to.id
      && Math.abs(region.z - (from.z + to.z) / 2) < 3
      && distanceToSegment(region.center, from.center, to.center) < Math.max(.55, Math.sqrt(region.area / Math.PI) * .55)).length;
    const visibility = 1 / (1 + obstructionCount);
    const pairKey = [from.id, to.id].sort().join("|");
    const sourceAffinity = sourcePairKeys.has(pairKey) ? 2.2 : 0;
    const kind: SourceRelationship["kind"] = mode === "voids" ? "void-link" : from.kind !== to.kind ? "solid-void" : "adjacency";
    connectionCandidates.push({
      id: `${from.id}-${to.id}`, fromId: from.id, toId: to.id, from: from.center, to: to.center, fromZ: from.z, toZ: to.z,
      planDistance, elevationDifference, visibility, kind,
      connectorKind: elevationDifference > .55 ? "ramp" : planDistance > 3 ? "bridge" : "terrace",
      score: planDistance * preference + elevationDifference * riseWeight + obstructionCount * 1.8 - sourceAffinity - circulation * 1.2 * visibility,
    });
  }));
  // Prim's algorithm guarantees a spanning network. The old hub/distance pass
  // could reject the only viable edge and leave whole elevation clusters apart.
  const proposedConnections: ArchitecturalConnection[] = [];
  if (domain) {
    proposedConnections.push(...domain.connections);
    domain.circulation.forEach((element) => addConnector(element));
  }
  const connectedNodeIds = new Set<string>(targetNodes.length ? [targetNodes[0].id] : []);
  while (!domain && connectedNodeIds.size < targetNodes.length) {
    const next = connectionCandidates
      .filter((edge) => connectedNodeIds.has(edge.fromId) !== connectedNodeIds.has(edge.toId))
      .sort((a, b) => a.score - b.score)[0];
    if (!next) break;
    proposedConnections.push(next);
    connectedNodeIds.add(next.fromId); connectedNodeIds.add(next.toId);
  }
  // Add short source-supported loops for circulation choice without allowing
  // them to replace any edge in the required spanning network.
  const selectedKeys = new Set(proposedConnections.map((edge) => [edge.fromId, edge.toId].sort().join("|")));
  (domain ? [] : connectionCandidates)
    .filter((edge) => edge.planDistance <= maximumConnection && sourcePairKeys.has([edge.fromId, edge.toId].sort().join("|")))
    .sort((a, b) => a.score - b.score)
    .slice(0, branchBudget(routeFamily, branchingInfluence))
    .forEach((edge) => { const key = [edge.fromId, edge.toId].sort().join("|"); if (!selectedKeys.has(key)) { selectedKeys.add(key); proposedConnections.push(edge); } });

  const networkWidth = ((mode === "letters" ? 1.25 : 1.72) + circulation * .65 + continuityControls.blendRadius / 250) * (detail / 1.15);
  const widthGain = routeFamily === "hall" || routeFamily === "layered" ? 1.35 : routeFamily === "comb" ? .5 : routeFamily === "radial" ? .7 : routeFamily === "flat" ? .85 : 1;
  const routeWidth = networkWidth * widthGain * (.7 + branchingInfluence * .4);
  const riseScale = routeFamily === "flat" || routeFamily === "hall" || routeFamily === "plate" ? .04 : routeFamily === "layered" || routeFamily === "fold" ? .4 : 1;
  const switchbackGain = routeFamily === "atrium" || routeFamily === "terrace" || routeFamily === "radial" ? 1 : routeFamily === "comb" || routeFamily === "flat" || routeFamily === "sequence" || routeFamily === "spine" ? 0 : .3;
  const curveGain = routeFamily === "fold" ? 2.4 : routeFamily === "field" ? 1.4 : routeFamily === "comb" || routeFamily === "sequence" || routeFamily === "flat" ? .15 : 1;
  (domain ? [] : proposedConnections).forEach((relationship, connectionIndex) => {
    const dx = relationship.to[0] - relationship.from[0], dy = relationship.to[1] - relationship.from[1];
    const length = Math.max(.001, Math.hypot(dx, dy));
    const perpendicular: Point2 = [-dy / length, dx / length];
    const segmentCount = Math.max(1, Math.ceil(relationship.elevationDifference * riseScale / 1.6));
    const waypoints = Array.from({ length: segmentCount + 1 }, (_, waypointIndex) => {
      const amount = waypointIndex / segmentCount;
      const switchback = waypointIndex > 0 && waypointIndex < segmentCount ? (waypointIndex % 2 ? 1 : -1) * Math.min(fieldSpan * .16, relationship.elevationDifference * .16) * switchbackGain : 0;
      return {
        point: [relationship.from[0] + dx * amount + perpendicular[0] * switchback, relationship.from[1] + dy * amount + perpendicular[1] * switchback] as Point2,
        z: relationship.fromZ + (relationship.toZ - relationship.fromZ) * amount * riseScale,
      };
    });
    waypoints.slice(0, -1).forEach((fromWaypoint, segmentIndex) => {
      const toWaypoint = waypoints[segmentIndex + 1];
      const route: ArchitecturalElement = {
        id: `${mode}-network-${connectionIndex}-${segmentIndex}`, kind: "circulation", x: 0, y: 0, z: fromWaypoint.z,
        width: 1, depth: 1, height: detail * (mode === "letters" ? 1.15 : 1.45) + levelContinuity * detail * .25, rotation: 0,
        footprint: fitBoundary(curvedRibbon(fromWaypoint.point, toWaypoint.point, routeWidth, organicInfluence * boundaryCurvature * continuityControls.curvatureIntensity / 150 * curveGain, connectionIndex * 7 + segmentIndex + seed), 9.35),
        rise: toWaypoint.z - fromWaypoint.z, slopeFrom: fromWaypoint.point, slopeTo: toWaypoint.point,
      };
      addConnector(route, true);
      if (segmentIndex > 0 || segmentCount === 1) addConnector({
        id: `${mode}-network-landing-${connectionIndex}-${segmentIndex}`, kind: "circulation",
        x: fromWaypoint.point[0], y: fromWaypoint.point[1], z: fromWaypoint.z - .04,
        width: routeWidth * 1.45, depth: routeWidth * 1.45, height: detail * 1.2, rotation: 0,
      });
    });
    [waypoints[0], waypoints[waypoints.length - 1]].forEach((waypoint, endpointIndex) => addConnector({
      id: `${mode}-network-end-${connectionIndex}-${endpointIndex}`, kind: "circulation", x: waypoint.point[0], y: waypoint.point[1], z: waypoint.z - .08,
      width: routeWidth * 1.6, depth: routeWidth * 1.6, height: detail * 1.3, rotation: 0,
    }));
  });
  if (!domain && mode !== "letters" && verticalFamilies.has(routeFamily) && targetNodes.length > 1) {
    const orderedByElevation = [...targetNodes].sort((first, second) => first.z - second.z);
    const lowest = orderedByElevation[0], highest = orderedByElevation[orderedByElevation.length - 1];
    const highPoint: Point2 = Math.hypot(highest.center[0] - lowest.center[0], highest.center[1] - lowest.center[1]) < detail
      ? [highest.center[0] + fieldSpan * .12, highest.center[1]] : highest.center;
    addConnector({
      id: `${mode}-primary-interlevel-spine`, kind: "circulation", x: 0, y: 0, z: lowest.z - detail * .1,
      width: 1, depth: 1, height: detail * 1.4, rotation: 0,
      footprint: fitBoundary(curvedRibbon(lowest.center, highPoint, networkWidth * 1.3, continuityControls.curvatureIntensity / 220, seed + 97), 9.35),
      rise: highest.z - lowest.z, slopeFrom: lowest.center, slopeTo: highPoint,
    }, true);
    addConnector({ id: `${mode}-primary-interlevel-top`, kind: "circulation", x: highPoint[0], y: highPoint[1], z: highest.z - detail * .12, width: networkWidth * 1.9, depth: networkWidth * 1.9, height: detail * 1.3, rotation: 0 });
  }
  const circulationRelationships: SourceRelationship[] = proposedConnections;

  // Horizontal tile interfaces inherit the local gathering elevation. The
  // reusable assembly still registers vertically in 20 ft increments when a
  // tile is stacked, without forcing an internal ramp down to zero elevation.
  const registeredElevation = primaryElevation;
  if (gatheringRegion) {
    const center = domain?.entry ?? fieldCenter;
    const edgeReach = fieldSpan * .62;
    const registeredConnections: Point2[] = [[fieldCenter[0] + edgeReach, fieldCenter[1]], [fieldCenter[0], fieldCenter[1] + edgeReach]];
    registeredConnections.forEach((edge, index) => addConnector({ id: `${mode}-primary-ramp-${index}`, kind: "circulation", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: detail, rotation: 0, footprint: curvedRibbon(center, edge, detail * (1.4 + circulation), continuityControls.curvatureIntensity / 100 * .55, index + seed), rise: 0, slopeFrom: center, slopeTo: edge }));
    // Start enclosure walls at the edge of the primary floor so they remain
    // structurally joined instead of becoming detached perimeter ribbons.
    const enclosureBoundary = fitBoundary(scaleBoundary(primaryFootprint, 1.03), 8.8);
    (domain || letterField ? [] : enclosureBoundary).forEach((_, edgeIndex) => {
      // Enclosures occupy selected short perimeter segments only, preserving
      // the open gathering edge and visual connections between levels.
      if ((edgeIndex + Math.round(signature * 4)) % 4 !== 1) return;
      elements.push({ id: `${mode}-enclosure-${edgeIndex}`, kind: "enclosure", x: 0, y: 0, z: primaryElevation, width: 1, depth: 1, height: .9 + vertical * 1.25 + organicSculptural * .45, rotation: 0, footprint: boundaryStrip(enclosureBoundary, edgeIndex, -.18, .12) });
    });
  }

  const connectorWidth = detail * (1.6 + circulation);
  addConnector({ id: `${mode}-connector-east`, kind: "connector", x: fieldCenter[0] + fieldSpan * .7, y: fieldCenter[1], z: registeredElevation, width: detail * 2.4, depth: connectorWidth, height: detail, rotation: 0 });
  addConnector({ id: `${mode}-connector-north`, kind: "connector", x: fieldCenter[0], y: fieldCenter[1] + fieldSpan * .7, z: registeredElevation, width: connectorWidth, depth: detail * 2.4, height: detail, rotation: 0 });
  // In Void mode the bounded voids become occupiable source geometry. In
  // Combined mode, voids not promoted to platforms remain subtractive openings.
  if (!domain && mode === "combined") voidRegions.forEach((region, index) => {
    const alreadyPreserved = elements.some((element) => {
      if (element.kind !== "void" || !element.id.includes("source-cluster-void")) return false;
      const center = element.footprint ? boundaryCenter(element.footprint) : [element.x, element.y] as Point2;
      return Math.hypot(center[0] - region.center[0], center[1] - region.center[1]) < 1.2;
    });
    if (alreadyPreserved) return;
    const openingRadius = Math.max(detail, Math.sqrt(region.area / Math.PI));
    const intersectsRequiredConnection = proposedConnections.some((connection) => {
      const averageElevation = (connection.fromZ + connection.toZ) / 2;
      return Math.abs(architecturalElevation(region) - averageElevation) < 2.4
        && distanceToSegment(region.center, connection.from, connection.to) < openingRadius + networkWidth * .72;
    });
    // Required circulation has priority where a bounded void would sever the
    // spanning network. Other voids remain subtractive and fully open.
    if (!intersectsRequiredConnection) elements.push({ id: `${mode}-source-void-${index}`, kind: "void", x: 0, y: 0, z: architecturalElevation(region), width: 1, depth: 1, height: detail * 3 + Math.sqrt(region.area), rotation: 0, footprint: region.points, transparent: true });
  });
  const connectors: TileConnector[] = [
    { edge: "north", interface: "male", elevation: registeredElevation, width: connectorWidth, openingWidth: 3 + open * 2 }, { edge: "east", interface: "male", elevation: registeredElevation, width: connectorWidth, openingWidth: 3 + open * 2 },
    { edge: "south", interface: "female", elevation: registeredElevation, width: connectorWidth, openingWidth: 3 + open * 2 }, { edge: "west", interface: "female", elevation: registeredElevation, width: connectorWidth, openingWidth: 3 + open * 2 },
  ];
  if (domain) elements.splice(0, elements.length, ...elements.map(domain.develop));
  else if (fullDomain && !letterField) { elements.length = 0; connectorElements.length = 0; initialElements.length = 0; }
  if(domain) for(const element of elements) if(!element.provenance) element.provenance={architecturalElementId:element.id,sourceMode:mode,sourceLetterIds:[],sourceRegionIds:[],sourceVoidIds:[],sourceRelationshipIds:[],typologyOperation:"TILE_INTERFACE",descriptorInfluences:[],role:"fallback",explanation:"Preserved reusable tile interface geometry; not source-assigned architecture."};
  if(domain){domain.diagnostic.provenanceElements=elements.filter(e=>e.provenance?.role!=="fallback").length;domain.diagnostic.fallbackElements=elements.filter(e=>e.provenance?.role==="fallback").length;}
  const solids = elements.filter(e => e.kind !== "void");
  const elementArea = (element: ArchitecturalElement) => Math.max(0, polygonArea(element.footprint ?? defaultFootprint(element)) - (element.innerFootprint ? polygonArea(element.innerFootprint) : 0));
  const area = solids.reduce((sum, e) => sum + elementArea(e), 0);
  const volume = solids.reduce((sum, e) => sum + elementArea(e) * e.height, 0);
  const maxHeight = Math.max(...solids.map(e => e.z + e.height + Math.max(0, e.rise ?? 0)), 1);
  const circulationConnectivity = domain ? (proposedConnections.length ? 100 : 0) : clamp(42 + circulation * 28 + sequential * 12 + Math.min(18, circulationRelationships.length * 3), 0, 100);
  const platformVisibility = clamp(40 + visual * 28 + contextOpen * 12 + contextConvergence * 10 + Math.min(10, primaryFootprint.length), 0, 100);
  const boundaryComplexity = sourceBoundaries.reduce((sum, boundary) => sum + boundary.points.length, 0);
  const circulationPathLength = circulationRelationships.reduce((sum, relationship) => sum + Math.hypot(relationship.to[0] - relationship.from[0], relationship.to[1] - relationship.from[1]), 0);
  if (!targetNodes.length) failures.push("No occupied nodes could be generated by the active typology organizer.");
  if (circulationRelationships.length === 0) failures.push("The source does not contain enough related components to establish a circulation network.");
  const sourceMethod = mode === "letters" ? "Complete letter solids provide occupied boundaries and connection anchors"
    : mode === "voids" ? "actual inter-letter negative spaces provide openings, edges, and vertical anchors"
      : "letter solids and inter-letter openings are resolved together through one mixed source graph";
  const method = domain
    ? `${rule.name}: ${domain.diagnostic.organization}. ${domain.diagnostic.componentsUsed} source regions and ${domain.diagnostic.relationshipsUsed} relationships have explicit local assignments. Whole-field envelope influence is recorded separately and excluded from assignment coverage. Source-graph circulation precedes organic contour development and reconstruction. Geometric connectivity requires separate architectural review.`
    : `${rule.name}: ${sourceMethod}. Primary typology organization plus source-cluster plates are shaped by active descriptors and continuity controls before connection generation.`;
  const initialSurfaceDiagnostic = elementSurfaceDiagnostic(initialElements);
  const classifiedSurfaceDiagnostic = elementSurfaceDiagnostic(elements);
  const continuousMesh = quality === "preview" ? previewElementMesh(elements) : appendLetterSolids(continuousSurface(elements, continuityControls, domain ? 64 : 40), elements);
  // Presentation views omit only the reusable tile-interface arms. The full
  // connected mesh, OBJ export and aggregation continue to retain them.
  const presentationElements = elements.filter((element) => element.kind !== "connector" && !element.id.includes("primary-ramp"));
  const presentationMesh = quality === "preview" ? previewElementMesh(presentationElements) : appendLetterSolids(continuousSurface(presentationElements, continuityControls, domain ? 64 : 40), presentationElements);
  if (continuousMesh.componentCount > 1) failures.push(`${continuousMesh.componentCount} disconnected finished-geometry components remain after generating ${connectorElements.length} connector elements.`);
  const degenerateLimit = typology === "flat-deep-plan-plate" ? Math.max(50, continuousMesh.indices.length / 3 * .005) : 0;
  if (continuousMesh.degenerateTriangles > degenerateLimit) failures.push(`${continuousMesh.degenerateTriangles} degenerate finished-mesh triangles were detected.`);
  const sourceExtent = extentFromBoundaries(analysis.letters);
  const finalExtent = extentFromValues(Array.from({ length: continuousMesh.positions.length / 3 }, (_, index) => continuousMesh.positions[index * 3 + 1]));
  const finalSurfaceDiagnostic = meshSurfaceDiagnostic(continuousMesh, classifiedSurfaceDiagnostic.circulationArea, classifiedSurfaceDiagnostic.voidVolume);
  const primaryFootprintArea = Math.max(0, polygonArea(primaryFootprint) - (primaryInnerFootprint ? polygonArea(primaryInnerFootprint) : 0));
  const gatheringArea = typology === "flat-deep-plan-plate"
    ? elements.filter((element)=>element.id.includes("full-form-integrated-plate-field")).reduce((sum,element)=>sum+elementArea(element),0)
    : voidFirstTypology
    ? elements.filter((element) => element.id.includes("void-organized-edge")).reduce((sum, element) => sum + elementArea(element), 0)
    : typology === "contained-room-within-volume"
      ? primaryFootprintArea + elements.filter((element) => element.id.includes("contained-room")).reduce((sum, element) => sum + elementArea(element), 0)
    : primaryFootprintArea;
  const occupiedLevels = new Set(elements.filter((element) => element.kind === "stage" || element.kind === "platform").map((element) => Math.round(element.z * 2) / 2)).size;
  const explicitOpeningArea = elements.reduce((sum, element) => sum + (element.innerFootprint ? polygonArea(element.innerFootprint) : 0) + (element.kind === "void" ? polygonArea(element.footprint ?? defaultFootprint(element)) : 0), 0);
  // Estimate open lattice area from the dominant organizer footprint rather
  // than the sum of every overlapping floor, bridge, and connector. Summed
  // element areas can exceed the 20' registration field and incorrectly report
  // zero open space even when the architecture occupies only part of it.
  const dominantOrganizerArea = Math.max(0, polygonArea(primaryFootprint));
  const residualOpenArea = Math.max(0, TILE_SIZE_FEET * TILE_SIZE_FEET - Math.min(TILE_SIZE_FEET * TILE_SIZE_FEET, dominantOrganizerArea)) * .12;
  const approachOpeningArea = typology === SteppedAmphitheaterRuleSet.id
    ? openingAngle / (Math.PI * 2) * Math.PI * Math.max(0, upperInnerX * upperInnerY - stageRadiusX * stageRadiusY)
    : 0;
  const preservedOpenArea = explicitOpeningArea + residualOpenArea + approachOpeningArea;
  const architecturalFailures: string[] = [];
  const gatheringPassed = gatheringArea >= (category === "office" ? 18 : 8);
  const finalVerticalExtent = finalExtent.extent;
  const meaningfulVoidCount = elements.filter((element) => element.kind === "void" || Boolean(element.innerFootprint)).length;
  const continuousSurfaceCount = elements.filter((element) => /topographic|fold|continuous-arrival-hall/.test(element.id)).length;
  const linearRatio = stageRadiusX / Math.max(.1, stageRadiusY);
  const sequenceTransitions = elements.filter((element) => /sequential-threshold|sequential-path/.test(element.id)).length;
  const projectionCount = elements.filter((element) => /projecting-plate/.test(element.id)).length;
  const edgeOccupationCount = elements.filter((element) => /void-organized-edge|linear-band/.test(element.id)).length;
  const criteriaByTypology: Record<PrototypeTypologyId, { label: string; passed: boolean; value: number; unit: string }> = {
    "stepped-amphitheater": { label: "Terraced focus + connected levels", passed: occupiedLevels >= 3 && behaviors.convergence >= .5, value: occupiedLevels, unit: "levels" },
    "void-field-gathering": { label: "Distributed meaningful voids", passed: meaningfulVoidCount >= 3 && proposedConnections.length >= 2, value: meaningfulVoidCount, unit: "voids" },
    "inserted-horizontal-plate": { label: "Inserted plate projections", passed: projectionCount >= 2 && preservedOpenArea >= 6, value: projectionCount, unit: "plates" },
    "contained-room-within-volume": { label: "Contained room + surrounding volume", passed: Boolean(primaryInnerFootprint) && elements.some((element) => element.id.includes("contained-room")) && preservedOpenArea >= 6, value: primaryInnerFootprint ? polygonArea(primaryInnerFootprint) : 0, unit: "ft² room" },
    "linear-edge-gallery": { label: "Linear edge occupation", passed: linearRatio >= 1.8 && edgeOccupationCount >= 1, value: linearRatio, unit: "ratio" },
    "open-hall-workspace": { label: "Continuous low-fragmentation hall", passed: finalSurfaceDiagnostic.horizontalArea >= 60 && occupiedLevels <= 3, value: finalSurfaceDiagnostic.horizontalArea, unit: "ft²" },
    "cascaded-terraced-plates": { label: "Cascaded connected work levels", passed: occupiedLevels >= 3 && circulationConnectivity >= 65, value: occupiedLevels, unit: "levels" },
    "flat-deep-plan-plate": { label: "Deep horizontal plate", passed: finalSurfaceDiagnostic.horizontalArea >= 60 && occupiedLevels <= 3, value: finalSurfaceDiagnostic.horizontalArea, unit: "ft²" },
    "void-edge-workspace": { label: "Occupied void edges", passed: meaningfulVoidCount >= 2 && edgeOccupationCount >= 2, value: edgeOccupationCount, unit: "edges" },
    "folded-undulating-work-surface": { label: "Continuous folded surface", passed: continuousSurfaceCount >= 1 && finalVerticalExtent >= 1, value: finalVerticalExtent, unit: "ft rise" },
    "vertical-void-lobby": { label: "Vertically continuous void", passed: explicitOpeningArea >= 6 && finalVerticalExtent >= 2 && occupiedLevels >= 2, value: finalVerticalExtent, unit: "ft" },
    "compressed-sequential-lobby": { label: "Compression / expansion sequence", passed: sequenceTransitions >= 7, value: sequenceTransitions, unit: "transitions" },
    "continuous-hall-lobby": { label: "Continuous directional hall", passed: elements.some((element) => element.id.includes("continuous-arrival-hall")) && linearRatio >= 1.5, value: circulationPathLength, unit: "ft path" },
    "topographic-ground-field-lobby": { label: "Integrated topographic movement", passed: continuousSurfaceCount >= 1 && finalVerticalExtent >= 1, value: finalVerticalExtent, unit: "ft rise" },
    "linear-gallery-lobby": { label: "Longitudinal sequential continuity", passed: linearRatio >= 1.8 && circulationPathLength >= 4, value: linearRatio, unit: "ratio" },
  };
  const typologyCriterion = criteriaByTypology[typology];
  const steppedPassed = typologyCriterion.passed;
  const circulationPassed = quality === "final" && continuousMesh.componentCount === 1 && (domain ? proposedConnections.length > 0 : proposedConnections.length >= Math.max(0, targetNodes.length - 1)) && circulationConnectivity >= 65;
  const horizontalPassed = finalSurfaceDiagnostic.horizontalArea >= 45;
  const openPassed = preservedOpenArea >= 6;
  if (!gatheringPassed) architecturalFailures.push("The primary occupied space is below the category minimum area.");
  if (!steppedPassed) architecturalFailures.push(`${typologyCriterion.label} did not meet the active typology requirement.`);
  if (!circulationPassed) architecturalFailures.push("The occupied levels do not form one continuous circulation system.");
  if (!horizontalPassed) architecturalFailures.push("Usable reconstructed horizontal surface area is below 45 ft².");
  if (!openPassed) architecturalFailures.push("Significant open space was not preserved within the architectural field.");
  const architecturalScore = [gatheringPassed, steppedPassed, circulationPassed, horizontalPassed, openPassed].filter(Boolean).length * 20;
  const architecturalValidation: ArchitecturalValidationResult = {
    gatheringSpace: { passed: gatheringPassed, area: gatheringArea },
    steppedPlatforms: { passed: steppedPassed, levels: occupiedLevels },
    circulation: { passed: circulationPassed, coverage: circulationConnectivity },
    usableHorizontalSurfaces: { passed: horizontalPassed, area: finalSurfaceDiagnostic.horizontalArea },
    preservedOpenSpaces: { passed: openPassed, area: preservedOpenArea },
    typologyCriterion,
    score: architecturalScore, valid: quality === "final" && architecturalFailures.length === 0, failures: architecturalFailures,
  };
  const typologyDebug: TypologyDebug = {
    recipe: rule.operations,
    terraceActive: rawTopology.terraceActive,
    principalOccupiedRegions: rawTopology.occupiedRegions,
    principalVoids: rawTopology.principalVoids,
    discreteFloorPlates: rawTopology.discretePlates,
    continuousSurfaces: rawTopology.continuousSurfaces,
    primaryCirculationPaths: proposedConnections.length,
    connectedComponents: continuousMesh.componentCount,
    rawTopology,
  };
  const sourceXYZ = domain?.diagnostic.source ?? [0,0,0];
  const architectureXYZ = meshXYZExtent(presentationMesh);
  const fullFormDiagnostic = typology === "flat-deep-plan-plate" && domain ? {
    sourceComponentsBeforeUnion: domain.sourceComponentsBeforeUnion ?? source.length,
    sourceComponentsAfterUnion: domain.sourceComponentsAfterUnion ?? analysis.letters.length,
    disconnectedSourceGroups: domain.disconnectedSourceGroups ?? analysis.letters.length,
    sourceExtent: sourceXYZ as [number,number,number], architectureExtent: architectureXYZ as [number,number,number],
    volumetricRepresentation: domain.volumetricRepresentation ?? "Source boundary prisms + SDF union",
    relationshipGraphEdges: activeRelationships.length, architecturalConnectors: connectorElements.filter((element)=>element.kind==="circulation").length,
    finalMeshComponents: continuousMesh.componentCount, continuousCirculation: continuousMesh.componentCount===1 && proposedConnections.length>0,
    fullVolumetricSourceUsed: Boolean(domain.sourceElements?.length), graphUsedAsSecondaryOrganizer: true,
    pipelineStages: ["Original source","Unified source solids / void volumes","Connected-component analysis","Full volumetric source field","Secondary relationship graph","O3 typology interpretation","Primary architectural plate geometry","Secondary circulation and links","Architecture before organic development","Organic refinement","Final SDF reconstruction"],
  } : undefined;
  return { quality, unifiedSourceElements: domain?.sourceElements, fullFormDiagnostic, domainDiagnostic: domain ? { ...domain.diagnostic, raw: elementXYZExtent(disconnectedElements), final: architectureXYZ } : undefined, mode, category, typology, typologyName: rule.name, behaviors, name: mode === "letters" ? "Variation A — Letters" : mode === "voids" ? "Variation B — Voids" : "Variation C — Letters + Voids", seed, elements, connectors, voidSeeds: analysis.voids.map((boundary) => ({ x: boundary.center[0], y: boundary.center[1], z: boundary.z, size: Math.sqrt(boundary.area / Math.PI) * 2 })),
    measurements: { occupiedHorizontalArea: area, interconnectedVoidVolume: Math.max(0, TILE_SIZE_FEET * TILE_SIZE_FEET * Math.max(20, maxHeight) - volume), circulationConnectivity, platformVisibility, usablePlatformCount: elements.filter((element) => element.kind === "platform").length, elevationCount: primaryRows + 1, principalOrientation: principalOrientation(primaryFootprint), boundaryComplexity, circulationPathLength, connectedComponents: continuousMesh.componentCount },
    validation: { valid: quality === "final" && failures.length === 0, floorContinuity: targetNodes.length > 0, circulationContinuous: circulationConnectivity >= 65 && continuousMesh.componentCount === 1, voidsAligned: mode === "letters" || voidRegions.length > 0, unintendedIntersections: continuousMesh.degenerateTriangles, failures }, sourceCount: source.length, descriptorSnapshot: structuredClone(descriptors), method, initialElements, sourceBoundaries, sourceRelationships: fullDomain ? activeRelationships : circulationRelationships,
    disconnectedElements, connectorElements, proposedConnections, sourceGraph: fullDomain ? {regions:[...analysis.letters,...analysis.voids],relationships:analysis.relationships} : undefined,
    connectivity: { componentsBefore: domain ? (typology === "vertical-void-lobby" ? disconnectedElements.filter(e=>e.kind === "stage" || e.kind === "platform").length : 1) : targetNodes.length, componentsAfter: continuousMesh.componentCount, proposedConnections: proposedConnections.length, generatedConnectors: connectorElements.length },
    architecturalValidation,
    continuousMesh, presentationMesh, continuityControls,
    verticalExtents: { source: sourceExtent, extracted: extractedExtent, initial: extentFromElements(initialElements), final: finalExtent },
    surfaceDiagnostics: { initial: initialSurfaceDiagnostic, classified: classifiedSurfaceDiagnostic, final: finalSurfaceDiagnostic }, typologyDebug };
}

/** Backward-compatible entry point for saved records created before typology selection existed. */
export function generateSteppedAmphitheater(args: { source: CompositionPlacement[]; descriptors: DescriptorSettings; mode: PrototypeGeometryMode; seed: number; continuityControls?: ContinuityControls; sourceAnalysis?: ReturnType<typeof analyzeSourceGeometry> }): AmphitheaterVariation {
  return generateProtoArchitecture({ ...args, category: "gathering", typology: "stepped-amphitheater" });
}

function aggregationCenters(count: 2 | 4 | 8) { const columns = count === 2 ? 2 : count === 4 ? 2 : 4, rows = count / columns; return Array.from({ length: count }, (_, i) => ({ x: (i % columns - (columns - 1) / 2) * 20, y: (Math.floor(i / columns) - (rows - 1) / 2) * 20, rotation: 0 })); }
function elementBounds(e: ArchitecturalElement) { const p = e.footprint ?? defaultFootprint(e), a = THREE.MathUtils.degToRad(e.rotation); const t = p.map(([x, y]) => ({ x: e.x + x * Math.cos(a) + y * Math.sin(a), y: e.y - x * Math.sin(a) + y * Math.cos(a) })); return { minX: Math.min(...t.map(i => i.x)), maxX: Math.max(...t.map(i => i.x)), minY: Math.min(...t.map(i => i.y)), maxY: Math.max(...t.map(i => i.y)), minZ: e.z + Math.min(0, e.rise ?? 0), maxZ: e.z + e.height + Math.max(0, e.rise ?? 0) }; }

export function buildAggregation(variation: AmphitheaterVariation, count: 2 | 4 | 8): AggregationResult {
  const tileCenters = aggregationCenters(count); const elements = tileCenters.flatMap((c, tileIndex) => variation.elements.map(e => ({ ...e, id: `tile-${tileIndex}-${e.id}`, x: e.x + c.x, y: e.y + c.y, tileIndex })));
  const columns = count === 2 ? 2 : count === 4 ? 2 : 4, rows = count / columns, expected = (columns - 1) * rows + (rows - 1) * columns;
  const edge = (n: TileEdge) => variation.connectors.find(i => i.edge === n), compatible = (a?: TileConnector, b?: TileConnector) => Boolean(a && b && a.interface !== b.interface && Math.abs(a.elevation - b.elevation) < .01 && Math.abs(a.width - b.width) < .01 && Math.abs(a.openingWidth - b.openingWidth) < .01);
  const horizontal = compatible(edge("east"), edge("west")), vertical = compatible(edge("north"), edge("south")); const connected = (horizontal ? (columns - 1) * rows : 0) + (vertical ? (rows - 1) * columns : 0);
  const solids = elements.filter(e => e.kind !== "void" && e.kind !== "connector"); let intersections = 0; const collisionPairs: string[] = [];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) { const a = solids[i], b = solids[j]; if (a.tileIndex === b.tileIndex) continue; const ab = elementBounds(a), bb = elementBounds(b); if (ab.minX < bb.maxX - .02 && ab.maxX > bb.minX + .02 && ab.minY < bb.maxY - .02 && ab.maxY > bb.minY + .02 && ab.minZ < bb.maxZ - .02 && ab.maxZ > bb.minZ + .02) { intersections++; if (collisionPairs.length < 3) collisionPairs.push(`${a.id} ↔ ${b.id}`); } }
  const failures: string[] = []; if (connected !== expected) failures.push(`${expected - connected} boundary connections are incompatible.`); if (!variation.validation.circulationContinuous) failures.push("The source tile circulation is discontinuous."); if (intersections) failures.push(`${intersections} cross-tile mesh bounds overlap outside connector zones: ${collisionPairs.join(", ")}.`);
  return { count, elements, tileCenters, validation: { valid: !failures.length, floorContinuity: connected === expected, circulationContinuous: connected === expected && variation.validation.circulationContinuous, voidsAligned: horizontal && vertical, unintendedIntersections: intersections, failures } };
}

export function architecturalObj(variation: AmphitheaterVariation, aggregationCount?: 2 | 4 | 8) {
  const tileCenters = aggregationCount ? aggregationCenters(aggregationCount) : [{ x: 0, y: 0, rotation: 0 }];
  const mesh = variation.continuousMesh;
  if (mesh.positions.length && mesh.indices.length) {
    const lines = [`# LUV Proto-Architectural Generator`, `# Category: ${CATEGORY_DEFINITIONS[variation.category].name}`, `# Typology: ${variation.typologyName}`, `# Source: ${variation.mode}`, "# Units: feet; Z-up for Rhino", `# ${variation.method}`, `o ${variation.category}_${variation.typology}_${variation.mode}`];
    let offset = 1;
    tileCenters.forEach((center, tileIndex) => {
      lines.push(`g tile_${tileIndex}_finished_surface`);
      for (let index = 0; index < mesh.positions.length; index += 3) {
        const x = mesh.positions[index] + center.x, vertical = mesh.positions[index + 1], horizontalY = mesh.positions[index + 2] + center.y;
        lines.push(`v ${x.toFixed(5)} ${horizontalY.toFixed(5)} ${vertical.toFixed(5)}`);
      }
      for (let index = 0; index < mesh.indices.length; index += 3) lines.push(`f ${mesh.indices[index] + offset} ${mesh.indices[index + 1] + offset} ${mesh.indices[index + 2] + offset}`);
      offset += mesh.positions.length / 3;
    });
    return `${lines.join("\n")}\n`;
  }
  const elements: ArchitecturalElement[] = aggregationCount ? buildAggregation(variation, aggregationCount).elements : variation.elements;
  const lines = [`# LUV Proto-Architectural Generator`, `# Category: ${CATEGORY_DEFINITIONS[variation.category].name}`, `# Typology: ${variation.typologyName}`, `# Source: ${variation.mode}`, "# Units: feet; Z-up for Rhino", `# ${variation.method}`, `o ${variation.category}_${variation.typology}_${variation.mode}`]; let offset = 1; const point = new THREE.Vector3();
  for (const e of elements.filter(i => i.kind !== "void")) { const geometry = architecturalElementGeometry(e), pos = geometry.getAttribute("position"), index = geometry.getIndex(); const matrix = new THREE.Matrix4().compose(new THREE.Vector3(e.x, e.z, e.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(e.rotation)), new THREE.Vector3(1, 1, 1)); lines.push(`g ${e.id}`);
    for (let v = 0; v < pos.count; v++) { point.fromBufferAttribute(pos, v).applyMatrix4(matrix); lines.push(`v ${point.x.toFixed(5)} ${point.z.toFixed(5)} ${point.y.toFixed(5)}`); }
    const count = index ? index.count : pos.count; for (let f = 0; f + 2 < count; f += 3) lines.push(`f ${(index ? index.getX(f) : f) + offset} ${(index ? index.getX(f + 1) : f + 1) + offset} ${(index ? index.getX(f + 2) : f + 2) + offset}`); offset += pos.count; geometry.dispose();
  }
  return `${lines.join("\n")}\n`;
}
