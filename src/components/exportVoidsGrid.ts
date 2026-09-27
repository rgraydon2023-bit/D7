import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import type { CropEvaluation } from "./cropEvaluation";
import { buildVoidMesh } from "./voidGeometry3d";

function sourceName(ev: CropEvaluation): string {
  const { source, originCol, originRow } = ev.crop;
  if (source.kind === "primary") {
    return `Void_Primary_${originCol}_${originRow}`;
  }
  return `Void_Perm${source.index + 1}_${originCol}_${originRow}`;
}

export function buildVoidsGridScene(
  evaluations: CropEvaluation[],
  spacing: number,
  fontSize: number,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "VUL_Voids_8x2_Grid";

  const cols = 8;
  const cellPitch = 3.2;
  const items = evaluations.slice(0, 16);

  items.forEach((ev, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const mesh = buildVoidMesh(ev, spacing, fontSize, sourceName(ev));
    mesh.position.set(
      (col - (cols - 1) / 2) * cellPitch,
      0,
      (row - 0.5) * cellPitch,
    );
    root.add(mesh);
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

export async function exportVoidsGridObj(
  evaluations: CropEvaluation[],
  spacing: number,
  fontSize: number,
): Promise<void> {
  if (evaluations.length === 0) {
    throw new Error("No voids to export");
  }

  const root = buildVoidsGridScene(evaluations, spacing, fontSize);
  root.updateMatrixWorld(true);

  const exporter = new OBJExporter();
  const objText = exporter.parse(root);
  const blob = new Blob([objText], { type: "text/plain" });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadBlob(blob, `lci-voids-8x2-${stamp}.obj`);
}
