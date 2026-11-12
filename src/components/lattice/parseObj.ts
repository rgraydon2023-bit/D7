import { suggestSlot, type LatticeSlot } from "./slots";
import type { ImportedObj, ObjFace, ObjGroup, UpAxis } from "./types";

let meshSequence = 0;

function nextId() {
  meshSequence += 1;
  return `mesh-${meshSequence}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseFaceToken(token: string, vertexCount: number, normalCount: number) {
  const [vertexText, , normalText] = token.split("/");
  const vertex = resolveIndex(Number(vertexText), vertexCount);
  const normal = normalText ? resolveIndex(Number(normalText), normalCount) : null;
  return { vertex, normal };
}

function resolveIndex(index: number, count: number) {
  if (!Number.isFinite(index) || index === 0) return null;
  const resolved = index > 0 ? index - 1 : count + index;
  return resolved >= 0 && resolved < count ? resolved : null;
}

export function parseObj(text: string, filename: string): ImportedObj {
  const positions: number[] = [];
  const normals: number[] = [];
  const faces: ObjFace[] = [];
  const groups: ObjGroup[] = [];
  let groupName = filename.replace(/\.obj$/i, "") || "mesh";
  let groupStart = 0;
  let upAxis: UpAxis = "y";

  const closeGroup = () => {
    const faceCount = faces.length - groupStart;
    if (faceCount <= 0) return;
    groups.push({ name: groupName, faceStart: groupStart, faceCount });
    groupStart = faces.length;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (/z-up/i.test(line)) upAxis = "z";
      if (/y-up/i.test(line)) upAxis = "y";
      continue;
    }
    const parts = line.split(/\s+/);
    const kind = parts[0];
    if (kind === "v" && parts.length >= 4) {
      positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (kind === "vn" && parts.length >= 4) {
      normals.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (kind === "o" || kind === "g") {
      closeGroup();
      groupName = parts.slice(1).join(" ") || groupName;
    } else if (kind === "f" && parts.length >= 4) {
      const vertices: number[] = [];
      const faceNormals: number[] = [];
      let hasNormals = true;
      for (const token of parts.slice(1)) {
        const parsed = parseFaceToken(token, positions.length / 3, normals.length / 3);
        if (parsed.vertex === null) continue;
        vertices.push(parsed.vertex);
        if (parsed.normal === null) hasNormals = false;
        else faceNormals.push(parsed.normal);
      }
      if (vertices.length >= 3) faces.push({ vertices, normals: hasNormals ? faceNormals : null });
    }
  }
  closeGroup();
  if (!groups.length && faces.length) groups.push({ name: groupName, faceStart: 0, faceCount: faces.length });
  if (positions.length < 9 || faces.length === 0) throw new Error(`${filename} has no mesh faces.`);

  return {
    id: nextId(),
    filename,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    faces,
    groups,
    suggestedSlotId: suggestSlot(filename),
    upAxis,
  };
}

export function faceTriangles(face: ObjFace) {
  const triangles: Array<[number, number, number]> = [];
  for (let index = 1; index < face.vertices.length - 1; index += 1) {
    triangles.push([face.vertices[0], face.vertices[index], face.vertices[index + 1]]);
  }
  return triangles;
}

export function slotLabel(slot: LatticeSlot | null, filename: string) {
  return slot ? `${slot.code} ${slot.name}` : filename;
}
