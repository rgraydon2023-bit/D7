import * as THREE from "three";
import type { Letter } from "./letterTypes";

/** Unit letterforms in a ~1×1 box, origin at center, for extrusion. */
function shapeL(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.42, -0.45);
  s.lineTo(0.42, -0.45);
  s.lineTo(0.42, -0.18);
  s.lineTo(-0.12, -0.18);
  s.lineTo(-0.12, 0.45);
  s.lineTo(-0.42, 0.45);
  s.lineTo(-0.42, -0.45);
  return s;
}

function shapeU(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.42, 0.45);
  s.lineTo(-0.42, -0.08);
  s.bezierCurveTo(-0.42, -0.37, -0.24, -0.48, 0, -0.48);
  s.bezierCurveTo(0.24, -0.48, 0.42, -0.37, 0.42, -0.08);
  s.lineTo(0.42, 0.45);
  s.lineTo(0.14, 0.45);
  s.lineTo(0.14, -0.07);
  s.bezierCurveTo(0.14, -0.22, 0.08, -0.28, 0, -0.28);
  s.bezierCurveTo(-0.08, -0.28, -0.14, -0.22, -0.14, -0.07);
  s.lineTo(-0.14, 0.45);
  s.lineTo(-0.42, 0.45);
  s.closePath();
  return s;
}

function shapeV(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.46, 0.45);
  s.lineTo(-0.15, 0.45);
  s.lineTo(0, -0.16);
  s.lineTo(0.15, 0.45);
  s.lineTo(0.46, 0.45);
  s.lineTo(0.15, -0.45);
  s.lineTo(-0.15, -0.45);
  s.lineTo(-0.46, 0.45);
  return s;
}

const SHAPE_BUILDERS: Record<Letter, () => THREE.Shape> = {
  V: shapeV,
  U: shapeU,
  L: shapeL,
};

export function getLetterShape(letter: Letter): THREE.Shape {
  return SHAPE_BUILDERS[letter]();
}

const geometryCache = new Map<string, THREE.ExtrudeGeometry>();

/** Shared solid used by the letter-volume preview and OBJ export. */
export function getLetterVolumeGeometry(letter: Letter, thicknessPercent: number): THREE.ExtrudeGeometry {
  const key = `volume-${letter}-${thicknessPercent}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const geometry = new THREE.ExtrudeGeometry(getLetterShape(letter), {
    depth: thicknessPercent / 100,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
    bevelSegments: 1,
    curveSegments: 16,
  });
  geometry.center();
  geometryCache.set(key, geometry);
  return geometry;
}

export function getLetterGeometry(letter: Letter, depth = 0.28): THREE.ExtrudeGeometry {
  const key = `display-${letter}-${depth}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const shape = SHAPE_BUILDERS[letter]();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  geometryCache.set(key, geo);
  return geo;
}

/**
 * Letter silhouette as a vertical stamp (thick along Y) for CSG cutters.
 * Face lies in XZ; thickness along Y is `depth`.
 */
export function getLetterStampGeometry(
  letter: Letter,
  depth = 2,
): THREE.BufferGeometry {
  const key = `stamp-${letter}-${depth}`;
  const cached = geometryCache.get(key);
  if (cached) return cached.clone();

  const shape = SHAPE_BUILDERS[letter]();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 28,
  });
  // XY face, extrude +Z → rotate so thickness becomes Y (through a horizontal slab)
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geometryCache.set(key, geo);
  return geo.clone();
}

export const LETTER_COLORS: Record<Letter, string> = {
  V: "#e8e8e8",
  U: "#3dd6db",
  L: "#e8e8e8",
};
