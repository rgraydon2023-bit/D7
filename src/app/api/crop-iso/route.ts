import { NextResponse } from "next/server";
import { boundedVoidVolume } from "@/components/exportLetterVolume";
import type { Cell } from "@/components/letterTypes";

export const runtime = "nodejs";

function validCells(value: unknown): value is Cell[] {
  return Array.isArray(value)
    && value.length === 4
    && value.every((cell) => (
      cell
      && typeof cell.id === "string"
      && ["V", "U", "L"].includes(cell.letter)
      && typeof cell.rotation === "number"
    ));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!validCells(body.cells) || !validCells(body.depthCells)) {
      return NextResponse.json({ error: "A 2×2×2 crop requires two four-letter layers" }, { status: 400 });
    }
    if (!Number.isFinite(body.spacing) || !Number.isFinite(body.fontSize) || !Number.isFinite(body.yRotationRange)) {
      return NextResponse.json({ error: "Invalid crop dimensions" }, { status: 400 });
    }

    const mesh = await boundedVoidVolume({
      cells: body.cells,
      layerCells: [body.depthCells],
      cols: 2,
      rows: 2,
      spacing: body.spacing,
      zSpacing: body.spacing,
      letterSize: body.fontSize,
      thickness: 150,
      yRotationEnabled: body.yRotationEnabled === true,
      yRotationRange: body.yRotationRange,
      // Pull the bounding faces into the outer letters so their voids open outside.
      boxInset: (body.fontSize / 50) * 0.22,
    });
    return NextResponse.json(mesh);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Iso mesh could not be generated";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
