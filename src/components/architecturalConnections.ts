import type { LetterPlacementRules } from "./architecturalLetterGeometry";
import * as THREE from "three";
import { getLetterShape } from "./letterGeometry3d";
import type { Letter } from "./letterTypes";

export type IntersectionPlacement = {
  letterRules?: LetterPlacementRules;
  letter: Letter;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type ArchitecturalSpaceMode = "letters" | "voids" | "combined";

/** Typology weights that decide which letter gaps become bridges or voids. */
export type ArchitecturalSpaceBehaviors = {
  horizontalPlateDominance: number;
  verticalVoidDominance: number;
  openness: number;
  linearity: number;
  convergence: number;
  terracing: number;
  edgeOccupation: number;
  centralization: number;
  verticalConnectivity: number;
  surfaceContinuity: number;
  voidPreservation: number;
};

const BEHAVIOR_DEFAULTS: ArchitecturalSpaceBehaviors = {
  horizontalPlateDominance: 0.5,
  verticalVoidDominance: 0.4,
  openness: 0.5,
  linearity: 0.3,
  convergence: 0.3,
  terracing: 0.3,
  edgeOccupation: 0.3,
  centralization: 0.3,
  verticalConnectivity: 0.4,
  surfaceContinuity: 0.7,
  voidPreservation: 0.4,
};

export function behaviorValue(behaviors: Partial<ArchitecturalSpaceBehaviors> | undefined, key: keyof ArchitecturalSpaceBehaviors) {
  const value = behaviors?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1.5, Math.max(0, value)) : BEHAVIOR_DEFAULTS[key];
}

export function placementMatrix(item: IntersectionPlacement) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(item.x, item.y, item.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(item.rx),
      THREE.MathUtils.degToRad(item.ry),
      THREE.MathUtils.degToRad(item.rz),
      "XYZ",
    )),
    new THREE.Vector3(item.scale * item.scaleX, item.scale * item.scaleY, item.scale * item.scaleZ),
  );
}

function weldTransformedGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertices: number[] = [];
  const triangles: number[] = [];
  const seen = new Map<string, number>();
  const point = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let vertex = 0; vertex < count; vertex++) {
    point.fromBufferAttribute(position, index ? index.getX(vertex) : vertex).applyMatrix4(matrix);
    const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
    let welded = seen.get(key);
    if (welded === undefined) {
      welded = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      seen.set(key, welded);
    }
    triangles.push(welded);
  }
  geometry.dispose();
  return { vertices, triangles };
}

export function lowResolutionLetter(letter: IntersectionPlacement["letter"], thickness: number, matrix: THREE.Matrix4) {
  const geometry = new THREE.ExtrudeGeometry(getLetterShape(letter), {
    depth: Math.max(0.02, thickness / 100),
    bevelEnabled: false,
    curveSegments: 6,
  });
  geometry.center();
  return weldTransformedGeometry(geometry, matrix);
}

export type ArchitecturalConnectionLink = {
  i: number;
  j: number;
  length: number;
  spanning: boolean;
};

export type ArchitecturalConnectionGraph = {
  centers: Array<[number, number, number]>;
  links: ArchitecturalConnectionLink[];
  /** Neighbor distance used to keep the extra links that close local gaps. */
  reach: number;
};

function boundsCenter(vertices: number[]): [number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) return [0, 0, 0];
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

/** Letter centers and the links the space mesh uses to join them. */
export function architecturalConnectionGraph(
  placements: IntersectionPlacement[],
  thickness: number,
  behaviors?: Partial<ArchitecturalSpaceBehaviors>,
): ArchitecturalConnectionGraph {
  const plate = behaviorValue(behaviors, "horizontalPlateDominance");
  const verticalVoid = behaviorValue(behaviors, "verticalVoidDominance");
  const openness = behaviorValue(behaviors, "openness");
  const linearity = behaviorValue(behaviors, "linearity");
  const convergence = behaviorValue(behaviors, "convergence");
  const terracing = behaviorValue(behaviors, "terracing");
  const edgeOccupation = behaviorValue(behaviors, "edgeOccupation");
  const centralization = behaviorValue(behaviors, "centralization");
  const verticalConnectivity = behaviorValue(behaviors, "verticalConnectivity");
  const continuity = behaviorValue(behaviors, "surfaceContinuity");
  const voidPreservation = behaviorValue(behaviors, "voidPreservation");
  const centers = placements.map((placement) => boundsCenter(
    lowResolutionLetter(placement.letter, thickness, placementMatrix(placement)).vertices,
  ));
  if (centers.length < 2) return { centers, links: [], reach: 0 };
  const mean = centers.reduce((sum, center) => [sum[0] + center[0], sum[1] + center[1], sum[2] + center[2]] as [number, number, number], [0, 0, 0] as [number, number, number])
    .map((value) => value / centers.length) as [number, number, number];
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  centers.forEach((center) => {
    const dx = center[0] - mean[0];
    const dy = center[1] - mean[1];
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  });
  const axisAngle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const axis: [number, number] = [Math.cos(axisAngle), Math.sin(axisAngle)];
  const fieldReach = centers.reduce((value, center) => Math.max(value, Math.hypot(center[0] - mean[0], center[1] - mean[1], center[2] - mean[2])), 0.001);
  type Link = { i: number; j: number; weight: number; length: number };
  const links: Link[] = [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const dx = centers[j][0] - centers[i][0];
      const dy = centers[j][1] - centers[i][1];
      const dz = centers[j][2] - centers[i][2];
      const horizontal = Math.hypot(dx, dy);
      const vertical = Math.abs(dz);
      const along = Math.abs(dx * axis[0] + dy * axis[1]);
      const across = Math.sqrt(Math.max(0, horizontal * horizontal - along * along));
      const mid: [number, number, number] = [
        (centers[i][0] + centers[j][0]) / 2,
        (centers[i][1] + centers[j][1]) / 2,
        (centers[i][2] + centers[j][2]) / 2,
      ];
      const midDistance = Math.hypot(mid[0] - mean[0], mid[1] - mean[1], mid[2] - mean[2]);
      let weight = horizontal * (1.05 - linearity * 0.55)
        + vertical * (1.35 - verticalConnectivity * 0.85 - terracing * 0.45 - verticalVoid * 0.35 + plate * 0.75)
        + across * (0.3 + linearity * 1.15);
      if (convergence > 0.35 || centralization > 0.45) weight *= 0.72 + 0.55 * (midDistance / fieldReach);
      if (edgeOccupation > 0.55) weight *= 0.68 + 0.6 * (1 - midDistance / fieldReach);
      links.push({ i, j, weight: Math.max(0.02, weight), length: Math.hypot(horizontal, vertical) });
    }
  }
  const nearest = centers.map((_, index) => {
    const distances = links.filter((link) => link.i === index || link.j === index).map((link) => link.length);
    return distances.length ? distances.reduce((value, distance) => Math.min(value, distance), Infinity) : 0;
  }).filter((distance) => distance > 0);
  const orderedNearest = [...nearest].sort((a, b) => a - b);
  const pitch = orderedNearest.length ? orderedNearest[Math.floor((orderedNearest.length - 1) / 2)] : 1;
  const reach = pitch * (1.2 + openness * 0.5 + voidPreservation * 0.15);
  const parent = centers.map((_, index) => index);
  const find = (index: number) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const spanning: Link[] = [];
  const spanningKey = new Set<string>();
  for (const link of [...links].sort((a, b) => a.weight - b.weight)) {
    const left = find(link.i);
    const right = find(link.j);
    if (left === right) continue;
    parent[left] = right;
    spanning.push(link);
    spanningKey.add(`${link.i}:${link.j}`);
    if (spanning.length === centers.length - 1) break;
  }
  const extraBudget = Math.round(centers.length * (0.35 + continuity * 0.5 + voidPreservation * 0.35 + plate * 0.25 + verticalVoid * 0.15));
  const extra = [...links]
    .filter((link) => !spanningKey.has(`${link.i}:${link.j}`) && link.length <= reach)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, extraBudget);
  return {
    centers,
    links: [
      ...spanning.map((link) => ({ i: link.i, j: link.j, length: link.length, spanning: true })),
      ...extra.map((link) => ({ i: link.i, j: link.j, length: link.length, spanning: false })),
    ],
    reach,
  };
}

/** Links kept for the selected source. Letters keeps every bridge. Voids and combined keep the local gaps. */
export function linesForArchitecturalSpace(graph: ArchitecturalConnectionGraph, mode: ArchitecturalSpaceMode) {
  const limit = graph.reach * 1.75;
  return graph.links
    .filter((link) => mode === "letters" || link.length <= limit)
    .map((link) => ({
      from: graph.centers[link.i],
      to: graph.centers[link.j],
      spanning: link.spanning,
    }));
}

