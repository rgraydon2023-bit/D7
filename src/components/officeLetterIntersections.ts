import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import { arrangeOfficeLetters, type OfficeCheck, type OfficePlan } from './officeWorkspaceRules';
import { letterOverlapFractions } from './letterOverlapRule';
import * as THREE from 'three';
import { arrangeOpenHallLs } from './openHallLetterLayout';

type Point = [number, number, number];
const centerOf = (solid: Manifold): Point => {
  const box = solid.boundingBox();
  return box.min.map((value, axis) => (value + box.max[axis]) / 2) as Point;
};
const contactVolume = (a: Manifold, b: Manifold) => {
  const intersection = a.intersect(b);
  try { return intersection.volume(); } finally { intersection.delete(); }
};
const touches = (a: Manifold, b: Manifold) => contactVolume(a, b) > Math.min(a.volume(), b.volume()) * 1e-6;

/** A point just inside a broad face remains in material even for concave letters. */
function interiorPoint(solid: Manifold): Point {
  const mesh = solid.getMesh(), stride = mesh.numProp;
  let largest = 0, point: Point = centerOf(solid);
  const box = solid.boundingBox(), inset = Math.max(1e-8, Math.min(...box.max.map((v, i) => v - box.min[i])) * .01);
  for (let i = 0; i < mesh.triVerts.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => Array.from(mesh.vertProperties.slice(mesh.triVerts[i + k] * stride, mesh.triVerts[i + k] * stride + 3)));
    const u = b.map((v, k) => v - a[k]), v = c.map((value, k) => value - a[k]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (length > largest) { largest = length; point = a.map((value, k) => (value + b[k] + c[k]) / 3 - normal[k] / length * inset) as Point; }
  }
  return point;
}

/** Office reference layouts supply initial poses only; every generated solid is a selected letter. */
export function arrangeIntersectingOfficeLetters(source: IntersectionPlacement[], typology: string, thickness: number, makeSolid: (p: IntersectionPlacement) => Manifold) {
  const initial = arrangeOfficeLetters(source, typology, thickness);
  if (typology === 'open-hall-workspace') return arrangeOpenHallLs(source, initial, makeSolid);
  const placements: IntersectionPlacement[] = initial.placements.map(p => ({ ...p, letterRules: p.letterRules ? { ...p.letterRules, architectural: false } : undefined }));
  const solids = placements.map(makeSolid), connected: number[] = [];
  let tightenedLevels = 0, moved = 0;
  for (const id of initial.sequence) {
    if (!connected.length || connected.some(other => touches(solids[id], solids[other]))) { connected.push(id); continue; }
    const start = placements[id], ownAnchor = interiorPoint(solids[id]);
    const nearby = [...connected].sort((a, b) => {
      const distance = (i: number) => Math.hypot(...centerOf(solids[i]).map((v, axis) => v - centerOf(solids[id])[axis]));
      return distance(a) - distance(b);
    });
    let choice: IntersectionPlacement | undefined;
    // Prefer the requested level. Only tighten elevation if horizontal motion cannot connect it.
    for (const lockZ of [true, false]) {
      for (const neighbor of nearby.slice(0, 4)) {
        const anchor = interiorPoint(solids[neighbor]), delta = anchor.map((v, axis) => axis === 2 && lockZ ? 0 : v - ownAnchor[axis]);
        for (let step = 1; step <= 32; step++) {
          const t = step / 32, z = start.z + delta[2] * t;
          const pose = { ...start, x: start.x + delta[0] * t, y: start.y + delta[1] * t, z,
            letterRules: start.letterRules ? { ...start.letterRules, supportZ: z } : undefined };
          const candidate = makeSolid(pose);
          if (touches(candidate, solids[neighbor])) { choice = pose; break; }
        }
        if (choice) break;
      }
      if (choice) break;
    }
    if (choice) {
      if (Math.abs(choice.z - start.z) > 1e-5) tightenedLevels++;
      placements[id] = choice; solids[id] = makeSolid(choice); moved++; connected.push(id);
    }
  }
  const operations = [
    'Office reference rules guide the initial letter positions, orientations and levels. The selected L, U and V profiles retain their original axis proportions.',
    'The space is the solid union of intersecting letters. Preset slabs, roofs, support solids, stairs, ramps, bridges and seam fillers are not added.',
    `${moved} letters moved into direct solid contact with the connected letter network. No fixed overlap percentage is required.`,
    ...(tightenedLevels ? [`Constraint note: ${tightenedLevels} letter elevations tightened to obtain direct intersections. Reference level and headroom targets need review.`] : []),
    ...(connected.length < placements.length ? [`Constraint note: ${placements.length - connected.length} letters could not join the connected network and were retained without bridges.`] : []),
    'Working areas, openings, clearances and circulation are checked on the generated letters; reference-layout checks are not inherited as passes.',
  ];
  return { ...initial, placements, operations, supported: connected.length === placements.length,
    overlapFractions: letterOverlapFractions(solids), riseFractions: [] as number[] };
}

/** Measures the final letter solid rather than validating an unused preset workspace. */
export function validateIntersectingOffice(solid: Manifold, letterUnion: Manifold, letters: Manifold[], source: IntersectionPlacement[], arranged: IntersectionPlacement[], plan: OfficePlan, noAdditions: boolean): OfficeCheck[] {
  const checks: OfficeCheck[] = [];
  const add = (label: string, ok: boolean, detail: string) => checks.push({ label, status: ok ? 'pass' : 'unverified', detail });
  const pieces = solid.decompose();
  const components = pieces.filter(piece => piece.volume() > 0).length;
  for (const piece of pieces) if (piece !== solid) piece.delete();
  const retained = letters.every(letter => { const missing = letter.subtract(solid); try { return missing.volume() <= letter.volume() * 1e-6; } finally { missing.delete(); } });
  const proportions = arranged.every((p, i) => p.letter === source[plan.letterSources?.[i] ?? i]?.letter && p.scaleX === source[plan.letterSources?.[i] ?? i]?.scaleX && p.scaleY === source[plan.letterSources?.[i] ?? i]?.scaleY && p.scaleZ === source[plan.letterSources?.[i] ?? i]?.scaleZ && p.letterRules?.architectural === false);
  const reached = new Set<number>(letters.length ? [0] : []);
  for (let pass = 0; pass < letters.length; pass++) for (let i = 0; i < letters.length; i++) if (!reached.has(i) && [...reached].some(j => touches(letters[i], letters[j]))) reached.add(i);
  add('Selected letter geometry', retained && proportions, `${letters.length} letter instances retained. Original source profiles and axis proportions ${proportions ? 'are preserved' : 'could not be verified'}.`);
  add('Direct letter connectivity', components === 1 && reached.size === letters.length, `${reached.size} of ${letters.length} letters belong to the direct-intersection network; the final solid has ${components} component${components === 1 ? '' : 's'}.`);
  const extra = solid.subtract(letterUnion);
  try {
    const pureLetters = noAdditions && extra.volume() <= Math.max(1e-12, letterUnion.volume() * 1e-6);
    if(plan.typology !== 'open-hall-workspace') add('No added bridges or plates', pureLetters, pureLetters ? 'The final office form contains only the placed letter solids; no preset office slabs, bridges, ramps or filler solids are included.' : 'Additional material was detected outside the selected letter union or in the bridge/plate outputs.');
  } finally { extra.delete(); }
  const box = solid.boundingBox(), spans = box.max.map((v, i) => v - box.min[i]);
  add('20 ft envelope', spans.every(v => v <= 20 + 1e-4), `Actual letter bounds span ${spans.map(v => v.toFixed(2)).join(' × ')} ft in the enclosing 20 ft cube.`);
  add('15° footprint rotation', arranged.every(p => Math.abs(p.rz / 15 - Math.round(p.rz / 15)) < 1e-5), 'Yaw is measured from every generated letter, in 15° increments.');
  if (plan.typology === 'open-hall-workspace') {
    const q = (p: IntersectionPlacement) => new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx * Math.PI / 180, p.ry * Math.PI / 180, p.rz * Math.PI / 180));
    const normal = (p: IntersectionPlacement) => new THREE.Vector3(0, 0, 1).applyQuaternion(q(p));
    const planes = arranged.every(p => Math.abs(Math.abs(normal(p).z) - 1) < 1e-6);
    const quarterMirror = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    const selectedL = source.map((p, i) => p.letter === 'L' ? i : -1).filter(i => i >= 0), mapped = new Set(plan.letterSources);
    const lOnly = arranged.every(p => p.letter === 'L') && selectedL.every(i => mapped.has(i)) && [...mapped].every(i => source[i]?.letter === 'L');
    add('L-only vocabulary', lOnly, selectedL.length + ' selected L(s) supply ' + arranged.length + ' L instances; all U/V source letters are excluded.');
    const elevations = [...new Set(arranged.map(p => p.z.toFixed(5)))];
    add('Two horizontal L levels', planes && (elevations.length === 2 || arranged.length === 1), 'Selected L letters lie on XY at alternating elevations.');
    const originals=arranged.slice(0,selectedL.length);
    const aligned = originals.every((p,i)=>i%2===0||Math.abs(p.x-originals[i-1].x)<1e-5&&Math.abs(p.y-originals[i-1].y)<1e-5);
    const axes = originals.filter((_,i)=>i%2===0).map(p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`);
    add('Pair Z-axis alignment', aligned && new Set(axes).size===axes.length, 'Each original two-letter pair has matching X/Y centers and its own distinct Z-axis. Mirrored copies use the corresponding axis across a quadrant divider.');
    const cx=selectedL.reduce((sum,i)=>sum+source[i].x/selectedL.length,0),cy=selectedL.reduce((sum,i)=>sum+source[i].y/selectedL.length,0),quadrants=[0,0,0,0];
    originals.filter((_,i)=>i%2===0).forEach(p=>quadrants[p.y>=cy?(p.x>=cx?0:1):(p.x<cx?2:3)]++);
    add('Balanced XY quadrants', Math.max(...quadrants)-Math.min(...quadrants)<=1, `Original pair counts in quadrants I–IV: ${quadrants.join(', ')}. All four quadrants are populated when at least four pairs are selected.`);
    add('All selected Ls retained', retained && arranged.length>=selectedL.length && mapped.size===selectedL.length, `All ${selectedL.length} selected L sources and ${arranged.length-selectedL.length} added copies are retained in Final architecture, including any unpaired last L.`);
  }

  const mesh = solid.getMesh(), levels = new Map<string, number>();
  for (let i = 0; i < mesh.triVerts.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => Array.from(mesh.vertProperties.slice(mesh.triVerts[i + k] * mesh.numProp, mesh.triVerts[i + k] * mesh.numProp + 3)));
    if (Math.max(a[2], b[2], c[2]) - Math.min(a[2], b[2], c[2]) > 1e-5) continue;
    const area = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area <= 1e-8) continue;
    const level = ((a[2] + b[2] + c[2]) / 3).toFixed(4);
    levels.set(level, (levels.get(level) ?? 0) + area);
  }
  const surfaces = [...levels.values()].filter(area => area > .01), largestSurface = Math.max(0, ...surfaces);
  add('Horizontal letter surfaces', largestSurface > 0, `${surfaces.length} exposed upward horizontal surface level(s); largest level has ${largestSurface.toFixed(2)} ft² of letter material. This is gross surface area, not verified usable floor area or access.`);

  const projection = solid.project();
  try {
    const loops = projection.toPolygons();
    const signedArea = (loop: number[][]) => loop.reduce((sum, p, i) => { const q = loop[(i + 1) % loop.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
    const holes = loops.map(loop => signedArea(loop)).filter(a => a < -1e-5), holeArea = -holes.reduce((a, b) => a + b, 0);
    const fraction = holeArea / Math.max(projection.area() + holeArea, 1e-8);
    const target = plan.typology === 'void-edge-workspace' ? [1, .1, .25] : plan.typology === 'folded-undulating-work-surface' ? [2, .1, .2] : plan.typology === 'cascaded-terraced-plates' ? [1, .2, .4] : null;
    if (target) add('Enclosed plan openings', holes.length === target[0] && fraction >= target[1] && fraction <= target[2], `${holes.length} enclosed plan openings occupy ${(fraction * 100).toFixed(1)}% of the outlined footprint. Target: ${target[0]} opening(s), ${target[1] * 100}–${target[2] * 100}%. Opening shape, working depth and access are checked separately.`);
  } finally { projection.delete(); }

  // Keep the office requirements visible, but never copy preset-layout passes to different geometry.
  const replaced = new Set(['20 ft envelope', '15° footprint rotation', 'No uniform rescale', 'Letter variations']);
  for (const reference of plan.checks) if (!replaced.has(reference.label)) checks.push({ label: reference.label, status: 'unverified', detail: `Reference-layout target (not a measurement of this result): ${reference.detail} This requirement has not been verified on the intersecting letter form.` });
  add('Circulation and usable workspace', false, 'Geometric intersection is checked. A continuous occupiable route, usable working patches, ramp slope and headroom have not been established; bridges are not inserted to satisfy them.');
  return checks;
}
