import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { boundedVoidVolume, fusedLetterVolume, fusedVolumeObjText, fusedVolumePolysurface, type VolumeBounds, type VolumeExportFormat, type VolumeExportTarget } from "@/components/exportLetterVolume";
import type { Cell } from "@/components/letterTypes";
import type { VolumeOptions } from "@/components/letterVolumeLayout";
import type { CompositionPlacement } from "@/components/compositionEngine";

export const runtime = "nodejs";

function validCells(value: unknown, expected: number): value is Cell[] {
  return Array.isArray(value)
    && value.length === expected
    && value.every((cell) =>
      cell && typeof cell.id === "string"
      && ["V", "U", "L"].includes(cell.letter)
      && Number.isFinite(cell.rotation));
}

function validOptions(value: unknown): value is VolumeOptions {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<VolumeOptions>;
  const intWithin = (n: unknown, min: number, max: number) =>
    Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  const within = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

  return intWithin(v.cols, 2, 16)
    && intWithin(v.rows, 2, 12)
    && within(v.spacing, 8, 120)
    && within(v.zSpacing, 20, 120)
    && (v.attractorGap === undefined || within(v.attractorGap, 0, 120))
    && within(v.letterSize, 16, 96)
    && within(v.thickness, 4, 50)
    && typeof v.yRotationEnabled === "boolean"
    && within(v.yRotationRange, 0, 180)
    && validCells(v.cells, v.cols! * v.rows!)
    && Array.isArray(v.layerCells)
    && v.layerCells.length >= 1
    && v.layerCells.length <= 7
    && v.layerCells.every((layer) => validCells(layer, v.cols! * v.rows!));
}

function validCompositionPlacements(value: unknown): value is CompositionPlacement[] {
  const finiteWithin = (number: unknown, limit: number) => typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= limit;
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 4096
    && value.every((placement) => placement
      && validCells([placement.cell], 1)
      && Number.isInteger(placement.sourceIndex)
      && Number.isInteger(placement.layerIndex)
      && finiteWithin(placement.x, 100)
      && finiteWithin(placement.y, 100)
      && finiteWithin(placement.z, 100)
      && finiteWithin(placement.rx, 360)
      && finiteWithin(placement.ry, 360)
      && finiteWithin(placement.rz, 360)
      && typeof placement.scale === "number"
      && Number.isFinite(placement.scale)
      && placement.scale > 0
      && placement.scale <= 10
      && [placement.scaleX, placement.scaleY].every((scale) => scale === undefined || (typeof scale === "number" && Number.isFinite(scale) && scale > 0 && scale <= 5))
      && (placement.scaleZ === undefined || (typeof placement.scaleZ === "number" && Number.isFinite(placement.scaleZ) && placement.scaleZ > 0)));
}

function validBounds(value: unknown): value is VolumeBounds {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<VolumeBounds>;
  return [bounds.width, bounds.height, bounds.depth].every((dimension) => typeof dimension === "number" && Number.isFinite(dimension) && dimension > 0 && dimension <= 200);
}

export async function POST(request: Request) {
  try {
    const payload: { options?: unknown; format?: VolumeExportFormat; target?: VolumeExportTarget; compositionPlacements?: unknown; compositionBounds?: unknown } = await request.json();
    const { options, format, target, compositionPlacements, compositionBounds } = payload;
    if (!validOptions(options)
      || (format !== "mesh" && format !== "polysurface")
      || (target !== "letters" && target !== "void")
      || (compositionPlacements !== undefined
        && !validCompositionPlacements(compositionPlacements))
      || (compositionBounds !== undefined && !validBounds(compositionBounds))) {
      return NextResponse.json({ error: "Invalid letter volume" }, { status: 400 });
    }

    const activePlacements = compositionPlacements as CompositionPlacement[] | undefined;
    const activeBounds = compositionBounds as VolumeBounds | undefined;
    const fused = target === "void" ? await boundedVoidVolume(options, activePlacements, activeBounds) : await fusedLetterVolume(options, activePlacements);
    const folder = path.join(process.cwd(), "exports");
    await mkdir(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `vul-${compositionPlacements ? "composition-" : ""}${target}-${options.cols}x${options.rows}x${options.layerCells.length + 1}-${stamp}.${format === "mesh" ? "obj" : "3dm"}`;
    const filePath = path.join(folder, filename);
    if (format === "mesh") await writeFile(filePath, fusedVolumeObjText(fused, target), "utf8");
    else await writeFile(filePath, await fusedVolumePolysurface(fused));
    return NextResponse.json({ path: filePath, filename });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Volume export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
