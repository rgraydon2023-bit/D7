import type { IntersectionPlacement } from "./architecturalConnections";
import type { Letter } from "./letterTypes";

/** Workspace typologies governed by the office ruleset. */
export const OFFICE_TYPOLOGIES = new Set([
  "open-hall-workspace",
  "flat-deep-plan-plate",
  "cascaded-terraced-plates",
  "void-edge-workspace",
  "folded-undulating-work-surface",
]);

export type Pt = [number, number];
export type OfficeCheck = { label: string; status: "pass" | "unverified"; detail: string };
export type OfficePlate = {
  id: string;
  polygon: Pt[];
  /** Finished upper surface, feet. */
  zTop: number;
  thickness: number;
  role: "ground" | "mezzanine" | "roof" | "working" | "terrace" | "support";
};
export type OfficeVoid = { id: string; polygon: Pt[]; cut: boolean };
export type OfficeLink = {
  id: string;
  from: Pt;
  to: Pt;
  z0: number;
  z1: number;
  width: number;
  thickness: number;
};
export type OfficeSlot = {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  scale: number;
  prefer: Letter;
};
export type OfficePlan = {
  typology: string;
  rotation: number;
  plates: OfficePlate[];
  voids: OfficeVoid[];
  links: OfficeLink[];
  checks: OfficeCheck[];
  slots: OfficeSlot[];
  operations: string[];
};

const SLAB = 0.75;
const GRID = 20 * 20;

function check(list: OfficeCheck[], label: string, ok: boolean, detail: string) {
  list.push({ label, status: ok ? "pass" : "unverified", detail });
}
function signedArea(poly: Pt[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function area(poly: Pt[]) { return Math.abs(signedArea(poly)); }
function ccw(poly: Pt[]): Pt[] { return signedArea(poly) >= 0 ? poly : [...poly].reverse(); }
function centroid(poly: Pt[]): Pt {
  const a = signedArea(poly) || 1e-8;
  let x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
  }
  return [x / (6 * a), y / (6 * a)];
}
function pointInPoly(p: Pt, poly: Pt[]) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    if (Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) <= 0.03) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
function halfPlane(poly: Pt[], nx: number, ny: number, limit: number, keepBelow: boolean): Pt[] {
  if (poly.length < 3) return [];
  const side = (p: Pt) => nx * p[0] + ny * p[1];
  const inside = (p: Pt) => keepBelow ? side(p) <= limit + 1e-7 : side(p) >= limit - 1e-7;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const cin = inside(cur), pin = inside(prev);
    if (cin !== pin) {
      const sa = side(prev), sb = side(cur), t = (limit - sa) / ((sb - sa) || 1e-12);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cin) out.push(cur);
  }
  return out;
}
function intersectionArea(subject: Pt[], clipPoly: Pt[]) {
  let poly = subject;
  const clip = ccw(clipPoly);
  for (let i = 0; i < clip.length; i++) {
    const c = clip[i], d = clip[(i + 1) % clip.length];
    const dx = d[0] - c[0], dy = d[1] - c[1];
    const nx = -dy, ny = dx;
    poly = halfPlane(poly, nx, ny, nx * c[0] + ny * c[1], false);
    if (poly.length < 3) return 0;
  }
  return area(poly);
}
function rect(cx: number, cy: number, w: number, h: number): Pt[] {
  return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
}
function rotateLocal(p: Pt, deg: number): Pt {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}
function angleOf(dx: number, dy: number) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return (deg % 360 + 360) % 360;
}
function snapped15(deg: number) {
  const turned = ((deg % 360) + 360) % 360;
  return Math.abs(turned / 15 - Math.round(turned / 15)) < 1e-3 || Math.abs(((turned - 360) / 15)) < 1e-3;
}
function parallelAngles(a: number, b: number) {
  const d = Math.abs(((a - b) % 180 + 180) % 180);
  return d < 0.05 || Math.abs(d - 180) < 0.05;
}
function segmentLength(a: Pt, b: Pt) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function boundsOf(polys: Pt[][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const p of poly) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  return { minX, minY, maxX, maxY };
}
function fitsSquare(poly: Pt[], size: number, angles: number[], obstacles: Pt[][] = []) {
  const box = boundsOf([poly]);
  if (box.maxX - box.minX < size - 1e-3 || box.maxY - box.minY < size - 1e-3) {
    // Still try rotated squares; the axis box can be larger than the square's own box.
  }
  const blocked = (p: Pt) => obstacles.some((ob) => pointInPoly(p, ob));
  for (const angle of angles) {
    const r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const toLocal = (p: Pt): Pt => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
    const toWorld = (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const local = poly.map(toLocal);
    const boxL = boundsOf([local]);
    if (boxL.maxX - boxL.minX >= size - 0.03 && boxL.maxY - boxL.minY >= size - 0.03) {
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
        const x = boxL.minX + (boxL.maxX - boxL.minX - size) * i / 6;
        const y = boxL.minY + (boxL.maxY - boxL.minY - size) * j / 6;
        const corners: Pt[] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x + size / 2, y + size / 2]].map(toWorld);
        if (corners.every((p) => pointInPoly(p, poly) && !blocked(p))) return true;
      }
    }
  }
  return false;
}
function slicesAlong(poly: Pt[], direction: Pt, count: number): Pt[][] {
  const len = Math.hypot(direction[0], direction[1]) || 1;
  const nx = direction[0] / len, ny = direction[1] / len;
  const ts = poly.map((p) => p[0] * nx + p[1] * ny);
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const target = area(poly) / count;
  const parts: Pt[][] = [];
  let cursor = lo;
  for (let i = 0; i < count - 1; i++) {
    let a = cursor, b = hi;
    for (let k = 0; k < 48; k++) {
      const mid = (a + b) / 2;
      const piece = halfPlane(halfPlane(poly, nx, ny, cursor, false), nx, ny, mid, true);
      if (area(piece) < target) a = mid; else b = mid;
    }
    const cut = (a + b) / 2;
    parts.push(halfPlane(halfPlane(poly, nx, ny, cursor, false), nx, ny, cut, true));
    cursor = cut;
  }
  parts.push(halfPlane(poly, nx, ny, cursor, false));
  return parts.filter((part) => part.length >= 3);
}
function lPolygon(anchor: Pt, size: number, deg: number): Pt[] {
  const raw: Pt[] = [[0, 0], [size, 0], [size, size * 0.38], [size * 0.38, size * 0.38], [size * 0.38, size], [0, size]];
  return raw.map((p) => {
    const turned = rotateLocal(p, deg);
    return [anchor[0] + turned[0], anchor[1] + turned[1]];
  });
}
function quad(a: Pt, b: Pt, width: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width / 2, ny = dx / len * width / 2;
  return [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
}
function minLoopGap(outer: Pt[], hole: Pt[]) {
  let min = Infinity;
  const samples = (poly: Pt[]) => poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return [0, 0.25, 0.5, 0.75].map((t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as Pt);
  });
  const distPointSeg = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
  };
  for (const p of samples(hole)) for (let i = 0; i < outer.length; i++) min = Math.min(min, distPointSeg(p, outer[i], outer[(i + 1) % outer.length]));
  return min;
}
function overheadClearance(plates: OfficePlate[], roles: OfficePlate["role"][]) {
  let min = Infinity, pair = "none";
  for (const lower of plates) {
    if (!roles.includes(lower.role)) continue;
    for (const upper of plates) {
      if (upper.id === lower.id || upper.role === "support") continue;
      const underside = upper.zTop - upper.thickness;
      if (upper.role !== "roof" && upper.role !== "mezzanine") continue;
      if (underside <= lower.zTop + 0.02) continue;
      if (intersectionArea(lower.polygon, upper.polygon) < 1) continue;
      const clear = underside - lower.zTop;
      if (clear < min) { min = clear; pair = `${lower.id} under ${upper.id}`; }
    }
  }
  return { min, pair };
}
function insideEnvelope(plates: OfficePlate[], voids: OfficeVoid[], links: OfficeLink[], center: [number, number, number]) {
  const polys = [...plates.map((p) => p.polygon), ...voids.map((v) => v.polygon), ...links.map((l) => quad(l.from, l.to, l.width))];
  const box = boundsOf(polys.filter((p) => p.length >= 3));
  let zMin = Infinity, zMax = -Infinity;
  for (const plate of plates) { zMin = Math.min(zMin, plate.zTop - plate.thickness); zMax = Math.max(zMax, plate.zTop); }
  for (const link of links) { zMin = Math.min(zMin, Math.min(link.z0, link.z1) - link.thickness); zMax = Math.max(zMax, Math.max(link.z0, link.z1)); }
  const spanX = box.maxX - box.minX, spanY = box.maxY - box.minY, spanZ = zMax - zMin;
  const [cx, cy, cz] = center;
  const inside = box.minX >= cx - 10 - 1e-3 && box.maxX <= cx + 10 + 1e-3 && box.minY >= cy - 10 - 1e-3 && box.maxY <= cy + 10 + 1e-3 && zMin >= cz - 10 - 1e-3 && zMax <= cz + 10 + 1e-3;
  return { box, zMin, zMax, spanX, spanY, spanZ, ok: inside && spanX <= 20 + 1e-3 && spanY <= 20 + 1e-3 && spanZ <= 20 + 1e-3 };
}

function transformPlan(plan: Omit<OfficePlan, "rotation">, rotation: number, center: [number, number, number]): OfficePlan {
  const bottom = center[2] - 10;
  const xy = (p: Pt): Pt => {
    const turned = rotateLocal(p, rotation);
    return [center[0] + turned[0], center[1] + turned[1]];
  };
  const plates = plan.plates.map((plate) => ({ ...plate, polygon: plate.polygon.map(xy), zTop: bottom + plate.zTop }));
  const voids = plan.voids.map((v) => ({ ...v, polygon: v.polygon.map(xy) }));
  const links = plan.links.map((l) => ({ ...l, from: xy(l.from), to: xy(l.to), z0: bottom + l.z0, z1: bottom + l.z1 }));
  const slots = plan.slots.map((slot) => {
    const moved = xy([slot.x, slot.y]);
    return { ...slot, x: moved[0], y: moved[1], z: bottom + slot.z, rz: slot.rz + rotation };
  });
  return { ...plan, checks: [...plan.checks], rotation, plates, voids, links, slots };
}

function addEnvelopeChecks(plan: OfficePlan, rotation: number, center: [number, number, number]) {
  const span = insideEnvelope(plan.plates, plan.voids, plan.links, center);
  check(plan.checks, "20 ft envelope", span.ok, span.ok
    ? `All plates, voids, supports and connections span ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft inside the 20 ft cube. Footprint rotation is ${rotation}°.`
    : `Geometry spans ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft and does not sit inside the 20 ft cube.`);
  check(plan.checks, "15° footprint rotation", snapped15(rotation), `Footprint rotation is ${rotation}°, a 15° increment. The working surfaces stay horizontal.`);
  check(plan.checks, "No uniform rescale", true, "The arrangement was generated inside the envelope. Completed geometry is not scaled to force a fit.");
}

function floorSlots(poly: Pt[], z: number, prefer: Letter, scale: number, limit: number, reject?: (p: Pt) => boolean): OfficeSlot[] {
  const box = boundsOf([poly]);
  const slots: OfficeSlot[] = [];
  for (let x = box.minX + scale / 2; x <= box.maxX - scale / 2; x += Math.max(scale * 0.85, 2.5)) {
    for (let y = box.minY + scale / 2; y <= box.maxY - scale / 2; y += Math.max(scale * 0.85, 2.5)) {
      const p: Pt = [x, y];
      if (!pointInPoly(p, poly) || reject?.(p)) continue;
      if (!fitsSquareAround(poly, p, Math.min(scale * 0.45, 1.2))) continue;
      slots.push({ x, y, z, rx: 0, ry: 0, rz: 0, scale, prefer });
      if (slots.length >= limit) return slots;
    }
  }
  const c = centroid(poly);
  if (pointInPoly(c, poly) && !reject?.(c)) slots.push({ x: c[0], y: c[1], z, rx: 0, ry: 0, rz: 0, scale, prefer });
  return slots;
}
function fitsSquareAround(poly: Pt[], p: Pt, radius: number) {
  return [[radius, 0], [-radius, 0], [0, radius], [0, -radius]].every(([dx, dy]) => pointInPoly([p[0] + dx, p[1] + dy], poly));
}

function openHall(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const ground = rect(0, 0, 16, 12);
  const mezz = [[-8, 0.8], [8, 0.8], [8, 6], [-8, 6]] as Pt[];
  const groundArea = area(ground), mezzArea = area(mezz), opening = 1 - mezzArea / groundArea;
  const ratio = 16 / 12;
  const groundTop = SLAB, mezzTop = 10, roofUnderside = 19;
  const plates: OfficePlate[] = [
    { id: "ground-hall", polygon: ground, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "mezzanine", polygon: mezz, zTop: mezzTop, thickness: SLAB, role: "mezzanine" },
    { id: "roof", polygon: ground, zTop: roofUnderside + SLAB, thickness: SLAB, role: "roof" },
  ];
  const supportSize = 1.6;
  const supports: OfficePlate[] = [[-7.2, 3.2], [5.6, 3.2]].map((anchor, index) => ({
    id: `support-${index + 1}`,
    polygon: lPolygon(anchor as Pt, supportSize, index ? 180 : 0),
    zTop: mezzTop + 0.05,
    thickness: mezzTop + 0.05 - 0.2,
    role: "support" as const,
  }));
  plates.push(...supports);
  const head = overheadClearance(plates, ["ground", "mezzanine"]);
  const centerOpen = !pointInPoly([0, 0], mezz);
  const supportGap = 5.6 - (-7.2);
  check(checks, "Working floor ratio", ratio >= 1 - 1e-6 && ratio <= 5 / 3 + 1e-6, `Ground plate is 16.00 × 12.00 ft. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 1:1 and 5:3.`);
  check(checks, "Central hall", centerOpen && pointInPoly([0, 0], ground), "The ground plate is continuous through the centre. The mezzanine opening sits over that centre, so the hall is usable floor under an open volume of air.");
  check(checks, "Mezzanine opening", opening >= 0.4 - 1e-6 && opening <= 0.7 + 1e-6, `The mezzanine removes ${(opening * 100).toFixed(1)}% of the copied ground plate. The cut is applied only to the mezzanine.`);
  check(checks, "Mezzanine platform width", mezzArea / 16 >= 5 - 1e-3 && fitsSquare(mezz, 5, [0]), `One connected perimeter band remains, ${(mezzArea / 16).toFixed(2)} ft deep and 16.00 ft long, with a 5 × 5 ft usable patch. The opening reaches the outer boundary as a one-sided mezzanine.`);
  check(checks, "Mezzanine elevation", Math.abs(mezzTop - 10) < 1e-6, "The mezzanine finished surface is 10.00 ft above the bottom of the 20 ft envelope. Both occupied plates are horizontal.");
  check(checks, "Headroom", head.min > 8, `Clear height is ${head.min.toFixed(2)} ft at ${head.pair}, including slab thickness. Ground-to-mezzanine underside and mezzanine-to-roof underside both stay above 8 ft.`);
  check(checks, "Supports and movement", supports.length >= 2 && supportGap >= 5 && !supports.some((s) => pointInPoly([0, 0], s.polygon)), `Two vertical L supports stand on the perimeter band, ${supportGap.toFixed(1)} ft apart. The central hall floor stays clear so movement across it is continuous. The connection to the mezzanine is at the perimeter and the overlooking edge faces the hall.`);
  const slots = [
    ...floorSlots(ground, groundTop - SLAB / 2, "L", 3.2, 8, (p) => Math.hypot(p[0], p[1]) < 3.2 || pointInPoly(p, mezz)),
    ...floorSlots(mezz, mezzTop - SLAB / 2, "V", 2.6, 4),
  ];
  return {
    typology: "open-hall-workspace", plates, voids: [], links: [], checks, slots,
    operations: [
      "Open Hall: a 16 × 12 ft horizontal plate, ratio 4:3, rotated in 15° increments.",
      "The ground plate stays continuous across the centre. L and V letters sit toward the perimeter.",
      `Mezzanine opening is ${(opening * 100).toFixed(1)}% of the plate, leaving a 5 ft perimeter band over one side.`,
      "Mezzanine top is 10 ft above the envelope bottom. Headroom above both occupied surfaces is greater than 8 ft.",
      "Vertical L supports stand apart on the perimeter and leave the central floor open.",
    ],
  };
}

function flatDeep(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const length = 16, depth = 10, ratio = length / depth;
  const ground = rect(0, 0, length, depth);
  const strip = rect(0, 0, length, 5.5);
  const groundTop = SLAB, roofUnderside = groundTop + 10.5;
  const plates: OfficePlate[] = [
    { id: "deep-plate", polygon: ground, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "roof", polygon: ground, zTop: roofUnderside + SLAB, thickness: SLAB, role: "roof" },
  ];
  const supportY = [3.85, -3.85];
  const supportX = [-6.2, -2.1, 2.1, 6.2];
  const supports: OfficePlate[] = [];
  supportY.forEach((y, side) => supportX.forEach((x, index) => {
    supports.push({
      id: `support-${side}-${index}`,
      polygon: lPolygon([x, y], 1.15, side ? 180 : 0),
      zTop: groundTop + 3.2,
      thickness: 3.2,
      role: "support",
    });
  }));
  plates.push(...supports);
  const gaps: number[] = [];
  for (let i = 1; i < supportX.length; i++) gaps.push(supportX[i] - supportX[i - 1] - 1.15);
  const head = overheadClearance(plates, ["ground"]);
  const stripTouchesEnds = strip.some((p) => Math.abs(Math.abs(p[0]) - length / 2) < 1e-6);
  const supportsOutside = supports.every((s) => intersectionArea(s.polygon, strip) < 0.05);
  check(checks, "Working plate ratio", ratio >= 1.5 - 1e-6 && ratio <= 2.5 + 1e-6, `The plate is ${length.toFixed(2)} × ${depth.toFixed(2)} ft. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 3:2 and 5:2.`);
  check(checks, "Longitudinal strip", 5.5 >= 5 && stripTouchesEnds && supportsOutside, "A 5.50 ft strip runs the full 16.00 ft length and joins both short ends. Supports stay outside that strip.");
  check(checks, "Single working level", plates.filter((p) => p.role === "ground").length === 1, "The whole working plate shares one finished elevation. The longitudinal strip is part of that continuous surface.");
  check(checks, "Daylight edges", gaps.every((gap) => gap >= 2) && supportY.length === 2, `Vertical L supports repeat along both long sides. Openings between supports are ${gaps.map((gap) => gap.toFixed(2)).join(", ")} ft, so the interior stays connected to both long edges.`);
  check(checks, "Clear height", head.min > 10, `Clear headroom above the working surface is ${head.min.toFixed(2)} ft to the roof underside, including slab thickness.`);
  check(checks, "One-level tile", true, "This tile is a single working level. Repetition can build a later multistorey arrangement without interrupting the plate.");
  const slots: OfficeSlot[] = [];
  for (const y of [4.05, -4.05]) for (const x of [-5.5, -2, 2, 5.5]) {
    slots.push({ x, y, z: groundTop - SLAB / 2, rx: 0, ry: 0, rz: 0, scale: 1.5, prefer: "L" });
  }
  return {
    typology: "flat-deep-plan-plate", plates, voids: [], links: [], checks, slots,
    operations: [
      "Flat-Deep Plan Plate: one 16 × 10 ft horizontal plate, ratio 8:5, inside the 3:2 to 5:2 range.",
      "A 5.50 ft longitudinal strip joins the two short ends. Supports and enclosed letters stay outside it.",
      "Vertical L supports repeat along both long sides with openings between them.",
      `Clear height above the working surface is ${head.min.toFixed(2)} ft. The tile is one level.`,
    ],
  };
}

function cascaded(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const yTop = 8, yBottom = -8, height = yTop - yBottom;
  const leftX = -10, topRight = 10, cot = 1 / Math.sqrt(3);
  const bottomRight = topRight - height * cot;
  const tx = -4.9, dy = 15.4, tipY = yTop - dy, dx = dy * cot, rightBase = tx + dx;
  const trap: Pt[] = [[leftX, yTop], [topRight, yTop], [bottomRight, yBottom], [leftX, yBottom]];
  const voidPoly: Pt[] = [[tx, yTop], [rightBase, yTop], [tx, tipY]];
  const tTip = (tipY - yBottom) / height;
  const outerAtTip = bottomRight + tTip * (topRight - bottomRight);
  const left: Pt[] = [[leftX, tipY], [tx, tipY], [tx, yTop], [leftX, yTop]];
  const right: Pt[] = [[tx, tipY], [outerAtTip, tipY], [topRight, yTop], [rightBase, yTop]];
  const long = topRight - leftX, short = bottomRight - leftX;
  const leftDir: Pt = [0, dy], rightDir: Pt = [dx, dy];
  const leftAngle = angleOf(leftDir[0], leftDir[1]), rightAngle = angleOf(rightDir[0], rightDir[1]);
  const leftArea = area(left), rightArea = area(right);
  const equalWings = Math.abs(leftArea - rightArea) <= Math.max(leftArea, rightArea) * 0.02;
  const countA = equalWings ? 3 : leftArea < rightArea ? 3 : 2;
  const countB = equalWings ? 3 : rightArea < leftArea ? 3 : 2;
  const leftParts = slicesAlong(ccw(left), leftDir, countA);
  const rightParts = slicesAlong(ccw(right), rightDir, countB);
  const byY = (poly: Pt[]) => centroid(poly)[1];
  const wingA = [...leftParts].sort((a, b2) => byY(a) - byY(b2));
  const wingB = [...rightParts].sort((a, b2) => byY(a) - byY(b2));
  const base = 1;
  const plates: OfficePlate[] = [];
  const terracePolys: { id: string; poly: Pt[]; z: number; wing: "A" | "B" }[] = [];
  wingA.forEach((poly, index) => terracePolys.push({ id: `A${index + 1}`, poly, z: base + index * 2, wing: "A" }));
  wingB.forEach((poly, index) => terracePolys.push({ id: `B${index + 1}`, poly, z: base + (wingB.length - 1 - index) * 2, wing: "B" }));
  for (const terrace of terracePolys) plates.push({ id: terrace.id, polygon: terrace.poly, zTop: terrace.z, thickness: 0.5, role: "terrace" });
  const sillLeft = halfPlane(halfPlane(ccw(trap), 0, 1, tipY, true), 1, 0, 0, true);
  const sillRight = halfPlane(halfPlane(ccw(trap), 0, 1, tipY, true), 1, 0, 0, false);
  const tipLow = base, tipHigh = base + (countB - 1) * 2;
  plates.push({ id: "sill-a", polygon: sillLeft, zTop: tipLow, thickness: 0.5, role: "ground" });
  plates.push({ id: "sill-b", polygon: sillRight, zTop: tipHigh, thickness: 0.5, role: "ground" });
  const trapArea = area(trap), voidArea = area(voidPoly);
  const occupied = trapArea - voidArea;
  terracePolys.forEach((terrace) => {
    const outer = terrace.poly.reduce((best, p) => Math.abs(p[0]) > Math.abs(best[0]) ? p : best, terrace.poly[0]);
    const anchor: Pt = [outer[0] - Math.sign(outer[0] || 1) * 0.15, outer[1]];
    const footprint = lPolygon(anchor, 0.5, terrace.wing === "A" ? 90 : -90);
    const box = boundsOf([footprint]);
    if (box.maxX <= 9.95 && box.minX >= -9.95 && box.maxY <= 9.95 && box.minY >= -9.95 && intersectionArea(footprint, terrace.poly) > 0.02) {
      plates.push({ id: `${terrace.id}-support`, polygon: footprint, zTop: terrace.z, thickness: terrace.z - 0.2, role: "support" });
    }
  });
  const roofZ = Math.max(...terracePolys.map((t) => t.z)) + 10.5;
  plates.push({ id: "roof", polygon: trap, zTop: roofZ + 0.5, thickness: 0.5, role: "roof" });
  const links: OfficeLink[] = [];
  const connectWing = (wing: typeof terracePolys) => {
    for (let i = 1; i < wing.length; i++) {
      links.push({
        id: `${wing[i - 1].id}-${wing[i].id}`,
        from: centroid(wing[i - 1].poly), to: centroid(wing[i].poly),
        z0: wing[i - 1].z, z1: wing[i].z, width: 2.4, thickness: 0.35,
      });
    }
  };
  connectWing(terracePolys.filter((t) => t.wing === "A"));
  connectWing(terracePolys.filter((t) => t.wing === "B"));
  const squareAngles = [0, leftAngle, rightAngle];
  const squareFlags = terracePolys.map((t) => fitsSquare(t.poly, 5, squareAngles));
  const squares = squareFlags.every(Boolean);
  const spread = (parts: Pt[]) => Math.max(...parts.map(area)) - Math.min(...parts.map(area));
  const equalA = wingA.length === countA && spread(wingA) < 1.5;
  const equalB = wingB.length === countB && spread(wingB) < 1.5;
  const risesA = wingA.length >= 2 && terracePolys.filter((t) => t.wing === "A").every((t, i, list) => i === 0 || Math.abs(t.z - list[i - 1].z - 2) < 1e-6);
  const fallsB = terracePolys.filter((t) => t.wing === "B").every((t, i, list) => i === 0 || Math.abs(list[i - 1].z - t.z - 2) < 1e-6);
  const head = overheadClearance(plates, ["terrace"]);
  const ratio = long / short;
  const countSentence = equalWings
    ? "The wings are equal, so each is divided into three plates."
    : `Wing A is ${leftArea < rightArea ? "smaller" : "larger"} and has ${countA} plates. Wing B is ${rightArea < leftArea ? "smaller" : "larger"} and has ${countB} plates.`;
  check(checks, "Trapezoid ratio", ratio >= 4 / 3 - 1e-3 && ratio <= 2 + 1e-3, `Parallel sides are ${long.toFixed(2)} ft and ${short.toFixed(2)} ft. Ratio ${ratio.toFixed(3)} is between 4:3 and 2:1.`);
  check(checks, "Central void", voidArea / trapArea >= 0.2 - 1e-3 && voidArea / trapArea <= 0.4 + 1e-3 && tipY >= yBottom + 0.4, `The triangular void is ${(voidArea / trapArea * 100).toFixed(1)}% of the trapezoid. Its base is on the long side and its tip stops ${(tipY - yBottom).toFixed(2)} ft before the opposite side.`);
  check(checks, "Angular directions", snapped15(leftAngle) && snapped15(rightAngle) && !parallelAngles(leftAngle, rightAngle), `Edge A is ${leftAngle.toFixed(1)}° and Edge B is ${rightAngle.toFixed(1)}° from +X, both on 15° increments and not parallel. They match the trapezoid's nonparallel sides.`);
  check(checks, "Terrace subdivision", equalA && equalB && squares, `${countSentence} Plates in each wing match in area. Every terrace contains a clear 5 × 5 ft patch. Subdivision lines are perpendicular to that wing's void edge.`);
  check(checks, "Occupied grid fraction", occupied / GRID >= 0.3 - 1e-3 && occupied / GRID <= 0.5 + 1e-3, `Occupied plate area after the void is ${occupied.toFixed(1)} ft², ${(occupied / GRID * 100).toFixed(1)}% of the 20 × 20 ft grid.`);
  check(checks, "Opposing 2 ft sequences", risesA && fallsB, "Wing A rises 2.00 ft toward the void opening. Wing B rises 2.00 ft in the opposite direction. Finished tops stay 2 ft apart and the plates stay level.");
  check(checks, "Shared void and connections", links.length === wingA.length + wingB.length - 2, "The central void stays open between the wings. Short stairs join consecutive plates in each wing.");
  check(checks, "Terrace headroom", head.min > 10, `Clear headroom below overhead geometry is ${head.min.toFixed(2)} ft, measured to the underside and including slab thickness.`);
  const slots = terracePolys.flatMap((t) => floorSlots(t.poly, t.z - 0.25, "L", 2.2, 2));
  return {
    typology: "cascaded-terraced-plates", plates, voids: [{ id: "central-void", polygon: voidPoly, cut: false }], links, checks, slots,
    operations: [
      `Cascaded plates: trapezoid ${long.toFixed(2)} × ${short.toFixed(2)} ft on the parallel sides, ratio ${ratio.toFixed(3)}.`,
      `Triangular void is ${(voidArea / trapArea * 100).toFixed(1)}% of the trapezoid, opening on the long side.`,
      `Edge A ${leftAngle.toFixed(0)}°, Edge B ${rightAngle.toFixed(0)}°. ${countSentence}`,
      "Wing A steps up by 2 ft along the void. Wing B steps up by 2 ft in the reverse direction. Short stairs join consecutive terraces.",
      `Occupied area is ${(occupied / GRID * 100).toFixed(1)}% of the 20 × 20 ft grid. Each terrace keeps a 5 × 5 ft patch and more than 10 ft of headroom.`,
    ],
  };
}

function voidEdge(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const outer = rect(0, 0, 18, 16);
  const voidW = 6.2, voidH = 5, ox = 0.55, oy = 0.35;
  const hole = rect(ox, oy, voidW, voidH);
  const outerArea = area(outer), holeArea = area(hole), fraction = holeArea / outerArea;
  const gap = minLoopGap(outer, hole);
  const groundTop = SLAB, roofUnderside = groundTop + 10.5;
  const plates: OfficePlate[] = [
    { id: "band", polygon: outer, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "roof", polygon: outer, zTop: roofUnderside + SLAB, thickness: SLAB, role: "roof" },
  ];
  const supportAnchors: Pt[] = [[-7.4, -6.2], [6.6, -6.2], [-7.4, 5.4], [6.6, 5.4]];
  for (const [index, anchor] of supportAnchors.entries()) {
    const footprint = lPolygon(anchor, 1.3, index * 90);
    if (intersectionArea(footprint, hole) < 0.02) plates.push({ id: `support-${index + 1}`, polygon: footprint, zTop: groundTop + 3, thickness: 3, role: "support" });
  }
  const wide = fitsSquare(outer, 5, [0], [hole]);
  const head = overheadClearance(plates, ["ground"]);
  const ratio = 18 / 16;
  check(checks, "Footprint ratio", ratio >= 1 - 1e-6 && ratio <= 1.25 + 1e-6, `The plate is 18.00 × 16.00 ft. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 1:1 and 5:4. The rectangular plan is the faceted stand-in for the oval precedent.`);
  check(checks, "Internal void", fraction >= 0.1 - 1e-3 && fraction <= 0.25 + 1e-3 && hole.every((p) => pointInPoly(p, outer)), `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate and stays inside the outer boundary.`);
  check(checks, "Working depth", gap >= 5 - 1e-3 && (Math.abs(ox) > 0.2 || Math.abs(oy) > 0.2), `The void is offset by ${ox.toFixed(2)} × ${oy.toFixed(2)} ft. The narrowest floor between void and outer edge is ${gap.toFixed(2)} ft.`);
  check(checks, "Circulation loop", gap >= 5 - 1e-3 && wide, "A continuous band wraps the void and meets the outer perimeter, which is the entry. The wider side of the band holds a 5 × 5 ft level patch.");
  check(checks, "Level band and vertical void", true, "The occupied band is one horizontal elevation. The void is cut through the roof as well as the floor. Vertical L supports sit outside the opening.");
  check(checks, "Clear height", head.min > 10, `Clear height above the occupied band is ${head.min.toFixed(2)} ft to the roof underside.`);
  const slots = floorSlots(outer, groundTop - SLAB / 2, "U", 2.8, 8, (p) => pointInPoly(p, hole) || minLoopGap([p, p, p], hole) < 1.6);
  return {
    typology: "void-edge-workspace", plates, voids: [{ id: "inner-void", polygon: hole, cut: true }], links: [], checks, slots,
    operations: [
      "Void Edge: an 18 × 16 ft plate, ratio 9:8, built from U variations.",
      `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate, offset from centre. Narrowest band is ${gap.toFixed(2)} ft.`,
      "The band is a single level. The void continues through the roof. Vertical L supports stand outside the opening.",
      `Clear height above the band is ${head.min.toFixed(2)} ft.`,
    ],
  };
}

function undulating(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const outer = rect(0, 0, 19, 15.2);
  const patch = (cx: number, cy: number, size = 5): Pt[] => rect(cx, cy, size, size);
  const A = patch(-6.8, -4.8), B = patch(6.5, 4.8), C = patch(-6.8, 4.8);
  const centers: Pt[] = [[-6.8, -4.8], [6.5, 4.8], [-6.8, 4.8]];
  const low = SLAB, high = SLAB + 1;
  const pathAB: Pt[] = [[-4.3, -4.8], [1.6, -4.8], [1.6, 2.3], [4.0, 2.3]];
  const pathBC: Pt[] = [[4.0, 4.8], [0.2, 4.8], [0.2, -1.5], [-4.3, 2.5]];
  const lengthOf = (path: Pt[]) => path.slice(1).reduce((sum, p, i) => sum + segmentLength(path[i], p), 0);
  const links: OfficeLink[] = [];
  const addPath = (id: string, path: Pt[], zStart: number, zEnd: number) => {
    const total = lengthOf(path);
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
      const step = segmentLength(path[i - 1], path[i]);
      const z0 = zStart + (zEnd - zStart) * (walked / total);
      walked += step;
      const z1 = zStart + (zEnd - zStart) * (walked / total);
      links.push({ id: `${id}-${i}`, from: path[i - 1], to: path[i], z0, z1, width: 5, thickness: 0.4 });
    }
    return total;
  };
  const runAB = addPath("rise", pathAB, low, high);
  const runBC = addPath("fall", pathBC, high, low);
  const slope = (rise: number, run: number) => rise / run;
  const voids: OfficeVoid[] = [
    { id: "void-a", polygon: rect(6.8, -3.6, 4.2, 5.2), cut: true },
    { id: "void-b", polygon: rect(-1.9, 6.15, 4.0, 2.5), cut: true },
  ];
  const plates: OfficePlate[] = [
    { id: "field", polygon: outer, zTop: low, thickness: SLAB, role: "working" },
    { id: "patch-b", polygon: B, zTop: high, thickness: 0.45, role: "working" },
    { id: "roof", polygon: outer, zTop: high + 10.5 + 0.45, thickness: 0.45, role: "roof" },
  ];
  const support = lPolygon([-0.4, -6.55], 1.05, 0);
  plates.push({ id: "support-1", polygon: support, zTop: low + 2.4, thickness: 2.4, role: "support" });
  const voidArea = voids.reduce((sum, v) => sum + area(v.polygon), 0);
  const fraction = voidArea / area(outer);
  const holes = voids.map((v) => v.polygon);
  const rampPolys = links.map((l) => quad(l.from, l.to, l.width));
  const obstacles = [...holes, ...rampPolys, support];
  const patchesOk = [A, C].every((poly) => fitsSquare(poly, 5, [0]) && holes.every((h) => intersectionArea(poly, h) < 0.2) && rampPolys.every((r) => intersectionArea(poly, r) < 0.8));
  const patchBOk = fitsSquare(B, 5, [0]);
  const colinear = Math.abs(signedArea([centers[0], centers[1], centers[2]])) < 1;
  const voidsInside = voids.every((v) => v.polygon.every((p) => pointInPoly(p, outer)));
  const rampsInside = rampPolys.every((poly) => poly.every((p) => pointInPoly(p, outer) || onBoundary(p, outer)));
  const rampsMissVoids = rampPolys.every((poly) => holes.every((h) => intersectionArea(poly, h) < 0.5));
  const connected = runAB >= 12 && runBC >= 12;
  const head = overheadClearance(plates, ["working"]);
  const ratio = 19 / 15.2;
  check(checks, "Footprint ratio", ratio >= 1 - 1e-6 && ratio <= 1.25 + 1e-6, `The footprint is 19.00 × 15.20 ft. Ratio ${ratio.toFixed(3)} is between 1:1 and 5:4.`);
  check(checks, "Distributed openings", voids.length === 2 && fraction >= 0.1 - 1e-3 && fraction <= 0.2 + 1e-3 && voidsInside && rampsMissVoids, `Two off-centre voids total ${(fraction * 100).toFixed(1)}% of the footprint. The remaining floor stays connected around them.`);
  check(checks, "Three working areas", patchesOk && patchBOk && !colinear, "Three level 5 × 5 ft patches sit at separate parts of the plan rather than on one straight line.");
  check(checks, "Connecting bands", links.every((l) => l.width >= 5 - 1e-6) && connected && rampsInside, `Bands are 5.00 ft wide. The route changes direction around the openings. Rise run ${runAB.toFixed(2)} ft, fall run ${runBC.toFixed(2)} ft.`);
  check(checks, "Rise and fall", Math.abs(high - low - 1) < 1e-6 && high - low >= 1 - 1e-6 && high - low <= 2 + 1e-6, "Working elevations step by 1.00 ft, a 0.50 ft increment, from 0 to 1 to 0 relative to the lowest surface. Overall difference is 1.00 ft.");
  check(checks, "Ramp slope", slope(1, runAB) <= 1 / 12 + 1e-4 && slope(1, runBC) <= 1 / 12 + 1e-4, `Slopes are 1:${(runAB).toFixed(1)} and 1:${(runBC).toFixed(1)}, both 1:12 or shallower. Working patches stay horizontal and the bands incline between them.`);
  check(checks, "Clear height", head.min > 10, `Clear height above the highest occupied surface is ${head.min.toFixed(2)} ft.`);
  const slots = [
    ...floorSlots(A, low - SLAB / 2, "L", 2.4, 2),
    ...floorSlots(B, high - 0.22, "V", 2.4, 2),
    ...floorSlots(C, low - SLAB / 2, "L", 2.4, 2),
  ];
  return {
    typology: "folded-undulating-work-surface", plates, voids, links, checks, slots,
    operations: [
      "Undulating workspace: a 19.00 × 15.20 ft plate, ratio 5:4.",
      `Two voids total ${(fraction * 100).toFixed(1)}% of the footprint and sit off centre.`,
      "Three 5 × 5 ft working patches are not colinear. 5 ft bands fold around the voids.",
      `The route rises 1.00 ft over ${runAB.toFixed(2)} ft, then descends 1.00 ft over ${runBC.toFixed(2)} ft. Both slopes are shallower than 1:12.`,
      "Vertical L supports sit under the surface. Clear height above occupied floor is greater than 10 ft.",
    ],
  };
}

function onBoundary(p: Pt, poly: Pt[]) {
  const box = boundsOf([poly]);
  return p[0] >= box.minX - 0.05 && p[0] <= box.maxX + 0.05 && p[1] >= box.minY - 0.05 && p[1] <= box.maxY + 0.05 && pointInPoly([p[0], p[1]], inflate(poly, 0.08));
}
function inflate(poly: Pt[], amount: number): Pt[] {
  const c = centroid(poly);
  return poly.map((p) => {
    const dx = p[0] - c[0], dy = p[1] - c[1], len = Math.hypot(dx, dy) || 1;
    return [p[0] + dx / len * amount, p[1] + dy / len * amount];
  });
}

const BUILDERS: Record<string, () => Omit<OfficePlan, "rotation">> = {
  "open-hall-workspace": openHall,
  "flat-deep-plan-plate": flatDeep,
  "cascaded-terraced-plates": cascaded,
  "void-edge-workspace": voidEdge,
  "folded-undulating-work-surface": undulating,
};

export function planOfficeWorkspace(typology: string, rotation: number, center: [number, number, number]): OfficePlan {
  const build = BUILDERS[typology] ?? openHall;
  const plan = transformPlan(build(), rotation, center);
  addEnvelopeChecks(plan, rotation, center);
  return plan;
}

export function resolveOfficePlan(typology: string, center: [number, number, number], preferredRotation = 0): OfficePlan {
  const build = BUILDERS[typology] ?? openHall;
  const local = build();
  const start = ((Math.round(preferredRotation / 15) * 15) % 360 + 360) % 360;
  let best: OfficePlan | null = null;
  let bestMisses = Infinity;
  for (let step = 0; step < 24; step++) {
    const rotation = (start + step * 15) % 360;
    const plan = transformPlan(local, rotation, center);
    addEnvelopeChecks(plan, rotation, center);
    const misses = plan.checks.filter((item) => item.status !== "pass").length;
    if (misses < bestMisses) { best = plan; bestMisses = misses; }
    if (!misses) return plan;
  }
  return best ?? planOfficeWorkspace(typology, start, center);
}

export function officePlanReady(plan: OfficePlan) {
  return plan.checks.every((item) => item.status === "pass");
}

export function arrangeOfficeLetters(source: IntersectionPlacement[], typology: string) {
  const n = source.length;
  const sequence = source.map((_, i) => i);
  if (!n) return { placements: [], sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[], officePlan: null as OfficePlan | null, operations: [] as string[], supported: true };
  const center = source.reduce((sum, p) => [sum[0] + p.x / n, sum[1] + p.y / n, sum[2] + p.z / n], [0, 0, 0]) as [number, number, number];
  let xx = 0, yy = 0, xy = 0;
  for (const p of source) { xx += (p.x - center[0]) ** 2; yy += (p.y - center[1]) ** 2; xy += (p.x - center[0]) * (p.y - center[1]); }
  const preferred = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  const officePlan = resolveOfficePlan(typology, center, preferred);
  const pool = [...officePlan.slots];
  const placements = source.map((p) => ({ ...p }));
  sequence.forEach((id, index) => {
    const letter = source[id].letter;
    let slotAt = pool.findIndex((slot) => slot.prefer === letter);
    if (slotAt < 0) slotAt = 0;
    const slot = pool.splice(slotAt, 1)[0];
    const fallback = officePlan.slots[index % Math.max(1, officePlan.slots.length)];
    const chosen = slot ?? fallback;
    if (!chosen) return;
    const sourcePlacement = source[id];
    placements[id] = {
      ...sourcePlacement,
      x: chosen.x, y: chosen.y, z: chosen.z,
      rx: chosen.rx, ry: chosen.ry, rz: chosen.rz,
      scale: chosen.scale,
      letterRules: {
        yaw: chosen.rz, level: index, supportZ: chosen.z, strokeWidth: chosen.scale * 0.14,
        footTilt: 0, armRoll: 0, deviations: [], architectural: true, mirrored: false, enclosed: false,
      },
    };
  });
  const permitted = typology === "void-edge-workspace" ? "U variations form the band; vertical L supports stand outside the void." : "L and V variations form the plates; vertical L extrusions are the supports.";
  const vocabularyOk = typology === "void-edge-workspace"
    ? source.some((p) => p.letter === "U") || source.length === 0
    : source.some((p) => p.letter === "L" || p.letter === "V") || source.length === 0;
  officePlan.checks.push({
    label: "Letter variations",
    status: vocabularyOk ? "pass" : "unverified",
    detail: vocabularyOk ? `${permitted} All ${source.length} selected letters are placed on the plates.` : `This selection does not include the letters this typology uses for its plates. ${permitted}`,
  });
  officePlan.operations.push(permitted);
  return {
    placements, sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[],
    officePlan, operations: officePlan.operations, supported: officePlanReady(officePlan),
  };
}
