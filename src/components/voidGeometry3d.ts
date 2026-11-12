import * as THREE from "three";
import type { CropEvaluation } from "./cropEvaluation";
import type { Letter } from "./letterTypes";
import { getLetterShape } from "./letterGeometry3d";

const cache = new Map<string, THREE.BufferGeometry>();

/** Same layout as CropAxoView / shapes export. */
export function cropLayoutMetrics(spacing: number, fontSize: number) {
  const worldGap = Math.max(0.35, spacing / 55);
  const letterSize = Math.max(0.45, fontSize / 55);
  const positions: [number, number][] = [
    [-worldGap / 2, -worldGap / 2],
    [worldGap / 2, -worldGap / 2],
    [-worldGap / 2, worldGap / 2],
    [worldGap / 2, worldGap / 2],
  ];
  // Plate must fully contain letter footprints + margin
  const half = worldGap / 2 + letterSize * 0.55 + 0.08;
  const boxW = half * 2;
  const boxD = half * 2;
  const boxH = Math.max(0.28, letterSize * 0.48);
  return { worldGap, letterSize, boxW, boxD, boxH, positions };
}

function letterHolePath(
  letter: Letter,
  scale: number,
  rotationDeg: number,
  tx: number,
  ty: number,
): THREE.Path {
  const pts = getLetterShape(letter).getPoints(letter === "U" ? 48 : 24);
  const rad = THREE.MathUtils.degToRad(rotationDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const path = new THREE.Path();

  // Reverse winding so ExtrudeGeometry treats this as a hole
  for (let i = pts.length - 1; i >= 0; i--) {
    const px = pts[i].x * scale;
    const py = pts[i].y * scale;
    const x = px * cos - py * sin + tx;
    const y = px * sin + py * cos + ty;
    if (i === pts.length - 1) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function holeAabb(
  letter: Letter,
  scale: number,
  rotationDeg: number,
  tx: number,
  ty: number,
) {
  const pts = getLetterShape(letter).getPoints(16);
  const rad = THREE.MathUtils.degToRad(rotationDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    const px = p.x * scale;
    const py = p.y * scale;
    const x = px * cos - py * sin + tx;
    const y = px * sin + py * cos + ty;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function aabbsOverlap(
  a: ReturnType<typeof holeAabb>,
  b: ReturnType<typeof holeAabb>,
  pad = 0.02,
): boolean {
  return !(
    a.maxX + pad < b.minX ||
    b.maxX + pad < a.minX ||
    a.maxY + pad < b.minY ||
    b.maxY + pad < a.minY
  );
}

function pickHoleScale(
  evaluation: CropEvaluation,
  letterSize: number,
  positions: [number, number][],
): number {
  // Prefer full letter size; shrink until AABBs no longer overlap (holes must not intersect)
  let scale = letterSize;
  for (let guard = 0; guard < 12; guard++) {
    const boxes = evaluation.crop.cells.map((cell, i) => {
      const [tx, ty] = positions[i];
      return holeAabb(cell.letter, scale, cell.rotation, tx, ty);
    });
    let overlap = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (aabbsOverlap(boxes[i], boxes[j])) {
          overlap = true;
          break;
        }
      }
      if (overlap) break;
    }
    if (!overlap) return scale;
    scale *= 0.9;
  }
  return Math.max(scale, letterSize * 0.45);
}

function cacheKey(ev: CropEvaluation, spacing: number, fontSize: number): string {
  const letters = ev.crop.cells.map((c) => `${c.letter}:${c.rotation}`).join("|");
  return `void-holes-v1|${ev.crop.id}|${spacing}|${fontSize}|${letters}`;
}

/**
 * Plate with V / U / L silhouettes as ExtrudeGeometry holes (boolean void).
 * Avoids CSG; shrinks holes slightly when letters would overlap so triangulation succeeds.
 */
export function buildVoidGeometry(
  evaluation: CropEvaluation,
  spacing: number,
  fontSize: number,
): THREE.BufferGeometry {
  const key = cacheKey(evaluation, spacing, fontSize);
  const hit = cache.get(key);
  if (hit) return hit;

  const { letterSize, boxW, boxD, boxH, positions } = cropLayoutMetrics(
    spacing,
    fontSize,
  );

  const shape = new THREE.Shape();
  const hx = boxW / 2;
  const hy = boxD / 2;
  shape.moveTo(-hx, -hy);
  shape.lineTo(hx, -hy);
  shape.lineTo(hx, hy);
  shape.lineTo(-hx, hy);
  shape.closePath();

  const holeScale = pickHoleScale(evaluation, letterSize, positions);

  evaluation.crop.cells.forEach((cell, i) => {
    const [tx, ty] = positions[i];
    shape.holes.push(
      letterHolePath(cell.letter, holeScale, cell.rotation, tx, ty),
    );
  });

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: boxH,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  cache.set(key, geo);
  return geo;
}

export function buildVoidMesh(
  evaluation: CropEvaluation,
  spacing: number,
  fontSize: number,
  name?: string,
): THREE.Mesh {
  const geometry = buildVoidGeometry(evaluation, spacing, fontSize);
  const material = new THREE.MeshStandardMaterial({
    color: "#2a6f73",
    metalness: 0.08,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name ?? evaluation.crop.id;
  return mesh;
}

export const VOID_COLOR = "#2a6f73";
