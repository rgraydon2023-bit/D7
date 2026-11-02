import type { Manifold, ManifoldToplevel } from "manifold-3d/manifold";
import type { OfficePlan, Pt } from "./officeWorkspaceRules";

/** Extrudes a validated office plan. Voids are cut from plates only, so ramps and supports stay intact. */
export function buildOfficeWorkspace(wasm: ManifoldToplevel, plan: OfficePlan, own: (solid: Manifold) => Manifold) {
  const { Manifold } = wasm;
  const roofs = plan.plates.filter((plate) => plate.role === "roof");
  const plates: Manifold[] = [];
  const connectors: Manifold[] = [];
  let roofTied = false;

  const extrude = (polygon: Pt[], zTop: number, thickness: number) => {
    const loop = ccw(polygon);
    if (loop.length < 3 || Math.abs(signedArea(loop)) < 1e-4) return null;
    const height = Math.max(thickness, 0.05);
    const solid = Manifold.extrude([loop], height).translate([0, 0, zTop - height]);
    if (solid.status() !== "NoError" || solid.isEmpty()) { try { solid.delete(); } catch { /* already released */ } return null; }
    return own(solid);
  };

  for (const plate of plan.plates) {
    if (plate.role === "support") continue;
    const polygon = plate.id.startsWith("sill-") ? extendSill(plate) : plate.polygon;
    const solid = extrude(polygon, plate.zTop, plate.thickness);
    if (solid) plates.push(solid);
  }

  let field = union(Manifold, plates, own);
  const cuts = plan.voids.filter((hole) => hole.cut && hole.polygon.length >= 3);
  if (field && cuts.length) {
    const low = Math.min(...plan.plates.map((plate) => plate.zTop - plate.thickness)) - 1;
    const high = Math.max(...plan.plates.map((plate) => plate.zTop)) + 1;
    const shafts = cuts.flatMap((hole) => {
      const shaft = extrude(hole.polygon, high, high - low);
      return shaft ? [shaft] : [];
    });
    const cutter = union(Manifold, shafts, own);
    if (cutter) field = subtract(field, cutter, own);
  }

  for (const plate of plan.plates) {
    if (plate.role !== "support") continue;
    const bottom = plate.zTop - plate.thickness;
    let zTop = plate.zTop;
    if (plate.polygon.some((point) => roofs.some((roof) => pointInPoly(point, roof.polygon)))) {
      zTop = Math.max(zTop, ...roofs.map((roof) => roof.zTop));
      roofTied = true;
    }
    const solid = extrude(plate.polygon, zTop, zTop - bottom);
    if (solid) connectors.push(solid);
  }

  if (!roofTied && roofs.length) {
    const hosts = plan.plates.filter((plate) => plate.role !== "roof" && plate.role !== "support");
    const host = [...hosts].sort((a, b) => b.zTop - a.zTop).find((plate) => {
      const center = centroid(plate.polygon);
      return roofs.some((roof) => pointInPoly(center, roof.polygon)) && !plan.voids.some((hole) => hole.cut && pointInPoly(center, hole.polygon));
    });
    if (host) {
      const center = centroid(host.polygon);
      const top = Math.max(...roofs.map((roof) => roof.zTop));
      const column = extrude(square(center, 0.7), top, top - (host.zTop - host.thickness));
      if (column) connectors.push(column);
    }
  }

  for (const link of plan.links) {
    const ramp = extrudeLink(Manifold, link, own);
    if (ramp) connectors.push(ramp);
  }
  const sillJoin = joinSills(Manifold, plan, own);
  if (sillJoin) connectors.push(sillJoin);

  return union(Manifold, [field, ...connectors].filter((solid): solid is Manifold => Boolean(solid)), own);
}

function extrudeLink(Manifold: ManifoldToplevel["Manifold"], link: OfficePlan["links"][number], own: (solid: Manifold) => Manifold) {
  const dx = link.to[0] - link.from[0], dy = link.to[1] - link.from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  const extra = 0.3, half = link.width / 2, height = Math.max(link.thickness, 0.05);
  const loop: Pt[] = [[-extra, -half], [len + extra, -half], [len + extra, half], [-extra, half]];
  const base = Manifold.extrude([loop], height);
  if (base.status() !== "NoError") { try { base.delete(); } catch { /* already released */ } return null; }
  const warped = base.warp((point) => {
    const t = Math.max(0, Math.min(1, point[0] / len));
    point[2] += link.z0 + (link.z1 - link.z0) * t - height;
  });
  const turned = warped.rotate([0, 0, Math.atan2(dy, dx) * 180 / Math.PI]).translate([link.from[0], link.from[1], 0]);
  if (turned.status() !== "NoError" || turned.isEmpty()) { try { turned.delete(); } catch { /* already released */ } return null; }
  return own(turned);
}

function union(Manifold: ManifoldToplevel["Manifold"], solids: Manifold[], own: (solid: Manifold) => Manifold) {
  const items = solids.filter((solid) => solid && !solid.isEmpty());
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  const merged = Manifold.union(items);
  if (merged.status() !== "NoError" || merged.isEmpty()) { try { merged.delete(); } catch { /* already released */ } return items[0]; }
  return own(merged);
}

function subtract(body: Manifold, cutter: Manifold, own: (solid: Manifold) => Manifold) {
  const cut = body.subtract(cutter);
  if (cut.status() !== "NoError" || cut.isEmpty()) { try { cut.delete(); } catch { /* already released */ } return body; }
  return own(cut);
}

function signedArea(poly: Pt[]) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}
function ccw(poly: Pt[]) { return signedArea(poly) >= 0 ? poly : [...poly].reverse(); }
function centroid(poly: Pt[]): Pt {
  const area = signedArea(poly) || 1e-8;
  let x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], cross = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * cross; y += (p[1] + q[1]) * cross;
  }
  return [x / (6 * area), y / (6 * area)];
}
function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
function joinSills(Manifold: ManifoldToplevel["Manifold"], plan: OfficePlan, own: (solid: Manifold) => Manifold) {
  const sillA = plan.plates.find((plate) => plate.id === "sill-a");
  const sillB = plan.plates.find((plate) => plate.id === "sill-b");
  if (!sillA || !sillB) return null;
  const low = sillA.zTop <= sillB.zTop ? sillA : sillB;
  const high = low === sillA ? sillB : sillA;
  const ys = low.polygon.map((point) => point[1]);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return extrudeLink(Manifold, {
    id: "sill-join",
    from: [-0.8, midY],
    to: [0.8, midY],
    z0: low.zTop,
    z1: high.zTop,
    width: 3,
    thickness: Math.min(low.thickness, high.thickness, 0.4),
  }, own);
}
function extendSill(plate: OfficePlan["plates"][number]): Pt[] {
  const maxY = Math.max(...plate.polygon.map((point) => point[1]));
  const towardNeighbor = plate.id.endsWith("-b") ? -1 : 1;
  return plate.polygon.map(([x, y]) => {
    const ny = Math.abs(y - maxY) < 0.25 ? y + 0.45 : y;
    const nx = Math.abs(x) < 0.25 ? x + towardNeighbor * 0.45 : x;
    return [nx, ny] as Pt;
  });
}
function square(center: Pt, size: number): Pt[] {
  const half = size / 2;
  return [[center[0] - half, center[1] - half], [center[0] + half, center[1] - half], [center[0] + half, center[1] + half], [center[0] - half, center[1] + half]];
}
