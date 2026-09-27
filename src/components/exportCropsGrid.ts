import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import type { CropEvaluation } from "./cropEvaluation";
import { getLetterGeometry, LETTER_COLORS } from "./letterGeometry3d";

function sourceName(ev: CropEvaluation): string {
  const { source, originCol, originRow } = ev.crop;
  if (source.kind === "primary") {
    return `Primary_${originCol}_${originRow}`;
  }
  return `Perm${source.index + 1}_${originCol}_${originRow}`;
}

function buildCropGroup(
  evaluation: CropEvaluation,
  spacing: number,
  fontSize: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = sourceName(evaluation);

  const worldGap = Math.max(0.35, spacing / 55);
  const letterSize = Math.max(0.45, fontSize / 55);
  const positions: [number, number, number][] = [
    [-worldGap / 2, 0, -worldGap / 2],
    [worldGap / 2, 0, -worldGap / 2],
    [-worldGap / 2, 0, worldGap / 2],
    [worldGap / 2, 0, worldGap / 2],
  ];

  evaluation.crop.cells.forEach((cell, i) => {
    const geometry = getLetterGeometry(cell.letter).clone();
    const material = new THREE.MeshStandardMaterial({
      color: LETTER_COLORS[cell.letter],
      metalness: 0.15,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${cell.letter}_${i}_${cell.rotation}deg`;
    mesh.scale.setScalar(letterSize);
    mesh.rotation.y = THREE.MathUtils.degToRad(cell.rotation);
    mesh.position.set(...positions[i]);
    group.add(mesh);
  });

  return group;
}

/** Build one scene graph: all crops laid out as an 8×2 grid of 3D objects. */
export function buildCropsGridScene(
  evaluations: CropEvaluation[],
  spacing: number,
  fontSize: number,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "VUL_Crops_8x2_Grid";

  const cols = 8;
  const cellPitch = 3.6;
  const items = evaluations.slice(0, 16);

  items.forEach((ev, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cropGroup = buildCropGroup(ev, spacing, fontSize);
    cropGroup.position.set(
      (col - (cols - 1) / 2) * cellPitch,
      0,
      (row - 0.5) * cellPitch,
    );
    root.add(cropGroup);
  });

  return root;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

/**
 * One-click export: all visible crop geometries as a single OBJ,
 * arranged in an 8×2 grid of 3D objects.
 */
export async function exportCropsGridObj(
  evaluations: CropEvaluation[],
  spacing: number,
  fontSize: number,
): Promise<void> {
  if (evaluations.length === 0) {
    throw new Error("No crops to export");
  }

  const root = buildCropsGridScene(evaluations, spacing, fontSize);
  root.updateMatrixWorld(true);

  try {
    const exporter = new OBJExporter();
    const objText = exporter.parse(root);
    const blob = new Blob([objText], { type: "text/plain" });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadBlob(blob, `lci-crops-8x2-${stamp}.obj`);
  } finally {
    disposeObject(root);
  }
}
