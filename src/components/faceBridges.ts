import { architecturalLetterGeometry, type LetterPlacementRules } from "./architecturalLetterGeometry";
import * as THREE from "three";
import type { Letter } from "./letterTypes";

export type FaceBridgeDirection = "x" | "y" | "z" | "all";
export type FaceBridgeMode = "same" | "different" | "all";

export type FaceBridgeSettings = {
  enabled: boolean;
  /** Restricts all bridges, including required-gap bridges, to layout neighbors. */
  adjacentPairs?: number[][];
  /** Additional eligible pairs, measured by actual surface gap in feet. */
  nearbyDistance?: number;
  filletPercent?: number;
  /** Required connection distance in model feet; optional budgets cannot suppress it. */
  requiredGap?: number;
  gridDivisions: number;
  allowedPlanes?: Array<"xy" | "xz" | "yz">;
  consolidate?: boolean;
  typologyCoverage?: number;
  typologyShape?: { terracing: number; topography: number; vertical: number; linearity: number };
  /** Longest gap, in source units, between two letter faces that can still be bridged. */
  maxDistance: number;
  /** Width of the bridge interior; perimeter attachments remain fixed, 0–100. */
  width: number;
  /** Thickness of the bridge interior; perimeter attachments remain fixed, 0–100. */
  thickness: number;
  /** Waist contraction of the loft between the two faces, 0–100. */
  curvature: number;
  /** How softly the shoulder leaves its attachment plane, 0–100. */
  smoothness: number;
  maxConnections: number;
  direction: FaceBridgeDirection;
  mode: FaceBridgeMode;
};

export const DEFAULT_FACE_BRIDGES: FaceBridgeSettings = {
  enabled: true,
  gridDivisions: 4,
  filletPercent: 20,
  maxDistance: 1.5,
  width: 70,
  thickness: 80,
  curvature: 35,
  smoothness: 62,
  maxConnections: 4,
  direction: "all",
  mode: "all",
};

export type FaceBridgeInstance = {
  letterRules?: LetterPlacementRules;
  letter: Letter;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type FaceBridgeMesh = {
  links?: Array<{ from: number; to: number; start: number[]; end: number[]; plane?: "xy" | "xz" | "yz"; required?: boolean; gapFeet?: number }>;
  requiredUnconnected?: number;
  positions: number[];
  indices: number[];
  /** Attachment samples on the two matching faces, where each bridge starts. */
  points: number[];
  /** Segments of the curves that run from one face's points to the other's. */
  lines: number[];
  count: number;
};

const EMPTY: FaceBridgeMesh = { positions: [], indices: [], points: [], lines: [], count: 0 };

type Tri = {
  a: number;
  b: number;
  c: number;
  normal: THREE.Vector3;
  /** Normal in the letter's unrotated geometry. XY faces point along local Z. */
  localNormal: THREE.Vector3;
  centroid: THREE.Vector3;
  area: number;
};

type Patch = {
  faceId?: number;
  perimeter?: THREE.Vector3[];
  id: number;
  triangles: number[];
  normal: THREE.Vector3;
  localNormal: THREE.Vector3;
  anchor: THREE.Vector3;
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  radiusU: number;
  radiusV: number;
  area: number;
};

/** The letter profile is drawn in XY and extruded along Z, so an XY face points along local Z. */
function facePlane(patch: Patch): "xy" | "xz" | "yz" {
  const n = patch.localNormal;
  return Math.abs(n.z) >= Math.max(Math.abs(n.x), Math.abs(n.y)) ? "xy" : Math.abs(n.y) >= Math.abs(n.x) ? "xz" : "yz";
}


type Surface = {
  letter: Letter;
  positions: Float32Array;
  triangles: Tri[];
  patches: Patch[];
  box: THREE.Box3;
};

function instanceMatrix(item: FaceBridgeInstance) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(item.x, item.y, item.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(item.rx),
      THREE.MathUtils.degToRad(item.ry),
      THREE.MathUtils.degToRad(item.rz),
      "XYZ",
    )),
    new THREE.Vector3(item.scale * item.scaleX, item.scale * item.scaleY, item.scale * item.scaleZ),
  );
}

function buildSurface(item: FaceBridgeInstance, thickness: number): Surface | null {
  const geometry = architecturalLetterGeometry(item.letter, thickness, item.letterRules);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || position.count < 3) return null;
  const matrix = instanceMatrix(item);
  const positions = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
    positions[vertex * 3] = point.x;
    positions[vertex * 3 + 1] = point.y;
    positions[vertex * 3 + 2] = point.z;
  }
  const read = (vertex: number) => new THREE.Vector3(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
  const localPoint = (vertex: number) => new THREE.Vector3().fromBufferAttribute(position, vertex);
  const triangles: Tri[] = [];
  const count = index ? index.count : position.count;
  const corner = (offset: number) => index ? index.getX(offset) : offset;
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = corner(offset);
    const b = corner(offset + 1);
    const c = corner(offset + 2);
    const pa = read(a);
    const pb = read(b);
    const pc = read(c);
    const normal = new THREE.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa));
    const area = normal.length() * 0.5;
    if (area < 1e-8) continue;
    normal.multiplyScalar(1 / (area * 2));
    if (normal.lengthSq() < 1e-8) continue;
    normal.normalize();
    const la = localPoint(a);
    const lb = localPoint(b);
    const lc = localPoint(c);
    const localNormal = new THREE.Vector3().crossVectors(lb.sub(la), lc.sub(localPoint(a)));
    if (localNormal.lengthSq() < 1e-10) continue;
    localNormal.normalize();
    triangles.push({
      a, b, c, normal, localNormal, area,
      centroid: pa.add(pb).add(pc).multiplyScalar(1 / 3),
    });
  }
  if (!triangles.length) return null;
  const adjacency: number[][] = triangles.map(() => []);
  const edgeMap = new Map<string, number[]>();
  const keyOf = (vertex: number) => {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    return `${Math.round(x * 5000)}:${Math.round(y * 5000)}:${Math.round(z * 5000)}`;
  };
  const addEdge = (start: number, end: number, triangle: number) => {
    const left = keyOf(start);
    const right = keyOf(end);
    const key = left < right ? `${left}|${right}` : `${right}|${left}`;
    const list = edgeMap.get(key);
    if (list) list.push(triangle);
    else edgeMap.set(key, [triangle]);
  };
  triangles.forEach((triangle, triangleIndex) => {
    addEdge(triangle.a, triangle.b, triangleIndex);
    addEdge(triangle.b, triangle.c, triangleIndex);
    addEdge(triangle.c, triangle.a, triangleIndex);
  });
  for (const list of edgeMap.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        adjacency[list[i]].push(list[j]);
        adjacency[list[j]].push(list[i]);
      }
    }
  }
  const seen = new Uint8Array(triangles.length);
  const patches: Patch[] = [];
  for (let seed = 0; seed < triangles.length; seed++) {
    if (seen[seed]) continue;
    const seedNormal = triangles[seed].normal;
    const members: number[] = [];
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const neighbor of adjacency[current]) {
        if (seen[neighbor]) continue;
        if (triangles[neighbor].normal.dot(seedNormal) < 0.99999) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    let area = 0;
    const normal = new THREE.Vector3();
    const localNormal = new THREE.Vector3();
    let anchor = triangles[members[0]].centroid;
    let anchorArea = triangles[members[0]].area;
    for (const member of members) {
      const triangle = triangles[member];
      area += triangle.area;
      normal.addScaledVector(triangle.normal, triangle.area);
      localNormal.addScaledVector(triangle.localNormal, triangle.area);
      if (triangle.area > anchorArea) {
        anchorArea = triangle.area;
        anchor = triangle.centroid;
      }
    }
    if (normal.lengthSq() < 1e-8 || localNormal.lengthSq() < 1e-8 || area < 1e-6) continue;
    normal.normalize();
    localNormal.normalize();
    const anchorTriangle = triangles[members.reduce((best, member) => triangles[member].area > triangles[best].area ? member : best, members[0])];
    const corners = [anchorTriangle.a, anchorTriangle.b, anchorTriangle.c].map(read);
    const longEdge = corners.map((p, i) => corners[(i + 1) % 3].clone().sub(p)).sort((a, b) => b.lengthSq() - a.lengthSq())[0];
    const tangent = longEdge.addScaledVector(normal, -longEdge.dot(normal)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    let radiusU = 0;
    let radiusV = 0;
    const scratch = new THREE.Vector3();
    for (const member of members) {
      const triangle = triangles[member];
      for (const vertex of [triangle.a, triangle.b, triangle.c]) {
        scratch.set(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]).sub(anchor);
        radiusU = Math.max(radiusU, Math.abs(scratch.dot(tangent)));
        radiusV = Math.max(radiusV, Math.abs(scratch.dot(bitangent)));
      }
    }
    patches.push({
      id: patches.length,
      triangles: members,
      normal,
      localNormal,
      anchor: anchor.clone(),
      tangent,
      bitangent,
      radiusU: Math.max(radiusU, 1e-4),
      radiusV: Math.max(radiusV, 1e-4),
      area,
    });
  }

  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(positions, 3));
  return {
    letter: item.letter,
    positions,
    triangles,
    patches: patches.filter((patch) => patch.area > 1e-6),
    box,
  };
}

function hermite(p0: THREE.Vector3, p1: THREE.Vector3, m0: THREE.Vector3, m1: THREE.Vector3, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return new THREE.Vector3()
    .addScaledVector(p0, 2 * t3 - 3 * t2 + 1)
    .addScaledVector(m0, t3 - 2 * t2 + t)
    .addScaledVector(p1, -2 * t3 + 3 * t2)
    .addScaledVector(m1, t3 - t2);
}

type Attachment = {
  starts: THREE.Vector3[];
  ends: THREE.Vector3[];
  gap: number;
};

const RING_SAMPLES = 32;
const loopCache = new WeakMap<Patch, Map<string, THREE.Vector3[]>>();

/** Trace actual clipped cell boundaries, splitting collinear edges at T junctions. */
function patchPerimeters(surface: Surface, patch: Patch): THREE.Vector3[][] {
  const vertices = new Map<string, THREE.Vector3>();
  const key = (p: THREE.Vector3) => p.toArray().map(v => Math.round(v * 1e6)).join(":");
  const raw: Array<[THREE.Vector3, THREE.Vector3]> = [];
  for (const index of patch.triangles) {
    const t = surface.triangles[index];
    const ps = [t.a,t.b,t.c].map(v => new THREE.Vector3().fromArray(surface.positions,v*3));
    for (let i=0;i<3;i++) { vertices.set(key(ps[i]),ps[i]); raw.push([ps[i],ps[(i+1)%3]]); }
  }
  const edges = new Map<string,{a:string;b:string;count:number}>();
  for (const [a,b] of raw) {
    const d=b.clone().sub(a), length=d.lengthSq();
    if(length<1e-12) continue;
    const cuts=[...vertices.entries()].map(([id,p])=>({id,p,t:p.clone().sub(a).dot(d)/length}))
      .filter(v=>v.t>=-1e-6&&v.t<=1+1e-6&&a.clone().addScaledVector(d,v.t).distanceToSquared(v.p)<1e-12)
      .sort((a,b)=>a.t-b.t);
    for(let i=0;i+1<cuts.length;i++) {
      const a=cuts[i].id,b=cuts[i+1].id;if(a===b)continue;
      const id=a<b?a+"|"+b:b+"|"+a;const edge=edges.get(id);
      if(edge)edge.count++;else edges.set(id,{a,b,count:1});
    }
  }
  const adjacent=new Map<string,string[]>();
  for(const e of edges.values()) if(e.count===1) for(const [a,b] of [[e.a,e.b],[e.b,e.a]]) adjacent.set(a,[...(adjacent.get(a)??[]),b]);
  const visited=new Set<string>(), loops:THREE.Vector3[][]=[];
  for(const start of adjacent.keys()) {
    if(visited.has(start))continue;
    let current=start,previous="";const loop:THREE.Vector3[]=[];
    do {
      if(visited.has(current)||adjacent.get(current)?.length!==2)break;
      visited.add(current);loop.push(vertices.get(current)!.clone());
      const next=adjacent.get(current)!.find(v=>v!==previous)!;previous=current;current=next;
    }while(current!==start);
    if(current===start&&loop.length>=3)loops.push(loop);
  }
  return loops;
}

/** Use the cell perimeter itself: width/thickness never inset these anchors. */
function attachmentLoop(surface: Surface, patch: Patch, tangent: THREE.Vector3, bitangent: THREE.Vector3) {
  const cacheKey=[...tangent.toArray(),...bitangent.toArray()].map(v=>v.toFixed(6)).join("|");
  const cached=loopCache.get(patch)?.get(cacheKey);if(cached)return cached;
  const loops=patch.perimeter ? [patch.perimeter] : patchPerimeters(surface,patch);
  if(!loops.length)return null;
  const loop=loops[0].map(p=>p.clone());
  const center=loop.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(loop.length);
  const xy=(p:THREE.Vector3)=>{const d=p.clone().sub(center);return new THREE.Vector2(d.dot(tangent),d.dot(bitangent));};
  if(THREE.ShapeUtils.area(loop.map(xy))<0)loop.reverse();
  // Match the same side of each perimeter before interpolating between them.
  let first=0;
  for(let i=1;i<loop.length;i++)if(xy(loop[i]).x>xy(loop[first]).x+1e-6 || (Math.abs(xy(loop[i]).x-xy(loop[first]).x)<1e-6&&xy(loop[i]).y<xy(loop[first]).y))first=i;
  const ordered=[...loop.slice(first),...loop.slice(0,first)];
  const cache=loopCache.get(patch)??new Map<string,THREE.Vector3[]>();
  if(cache.size>64)cache.clear();cache.set(cacheKey,ordered);loopCache.set(patch,cache);
  return ordered;
}

function subdividePerimeter(loop:THREE.Vector3[], count:number) {
  const result=loop.map(p=>p.clone());
  while(result.length<count) {
    let longest=0;
    for(let i=1;i<result.length;i++)if(result[i].distanceToSquared(result[(i+1)%result.length])>result[longest].distanceToSquared(result[(longest+1)%result.length]))longest=i;
    result.splice(longest+1,0,result[longest].clone().lerp(result[(longest+1)%result.length],.5));
  }
  return result;
}

function attachPatches(from: Surface, fromPatch: Patch, to: Surface, toPatch: Patch, settings: FaceBridgeSettings): Attachment | null {
  // Transport the source frame onto the inward-facing destination plane.
  // This preserves ring order instead of collapsing every ray onto one anchor.
  const transport = new THREE.Quaternion().setFromUnitVectors(fromPatch.normal, toPatch.normal.clone().negate());
  const startLoop = attachmentLoop(from, fromPatch, fromPatch.tangent, fromPatch.bitangent);
  const endLoop = attachmentLoop(to, toPatch, fromPatch.tangent.clone().applyQuaternion(transport), fromPatch.bitangent.clone().applyQuaternion(transport));
  if (!startLoop || !endLoop) return null;
  const samples = Math.max(RING_SAMPLES, startLoop.length, endLoop.length);
  const starts = subdividePerimeter(startLoop, samples);
  const ends = subdividePerimeter(endLoop, samples);
  let gap = 0;
  for (let i = 0; i < starts.length; i++) {
    const delta = ends[i].clone().sub(starts[i]);
    const distance = delta.length();
    if (distance < 1e-7 || distance > settings.maxDistance) return null;
    if (delta.dot(fromPatch.normal) < distance * .15 || delta.dot(toPatch.normal) > -distance * .15) return null;
    gap += distance;
  }
  return { starts, ends, gap: gap / starts.length };
}


function triangulatePerimeter(contour: THREE.Vector2[]) {
  const corners=contour.map((_,i)=>i);
  const onSegment=(p:THREE.Vector2,a:THREE.Vector2,b:THREE.Vector2)=>{
    const ab=b.clone().sub(a), t=p.clone().sub(a).dot(ab)/ab.lengthSq();
    return t>1e-7&&t<1-1e-7&&a.clone().addScaledVector(ab,t).distanceToSquared(p)<1e-12;
  };
  let changed=true;
  while(changed&&corners.length>3) {
    changed=false;
    for(let i=0;i<corners.length;i++)if(onSegment(contour[corners[i]],contour[corners[(i+corners.length-1)%corners.length]],contour[corners[(i+1)%corners.length]])) {
      corners.splice(i,1);changed=true;break;
    }
  }
  const pending=THREE.ShapeUtils.triangulateShape(corners.map(i=>contour[i]),[]).map(t=>t.map(i=>corners[i]));
  const result:number[][]=[];
  while(pending.length) {
    const tri=pending.pop()!;let split=false;
    for(let e=0;e<3&&!split;e++) {
      const a=tri[e],b=tri[(e+1)%3],c=tri[(e+2)%3];
      for(const direction of [1,-1]) {
        const between:number[]=[];
        for(let i=(a+direction+contour.length)%contour.length;i!==b;i=(i+direction+contour.length)%contour.length)between.push(i);
        if(!between.length||between.some(i=>corners.includes(i)||!onSegment(contour[i],contour[a],contour[b])))continue;
        const chain=[a,...between,b];
        for(let i=0;i+1<chain.length;i++)pending.push([chain[i],chain[i+1],c]);
        split=true;break;
      }
    }
    if(!split)result.push(tri);
  }
  return result;
}

function loftAttachment(attachment: Attachment, fromPatch: Patch, toPatch: Patch, settings: FaceBridgeSettings) {
  const stations = 24;
  const curvature = THREE.MathUtils.clamp(settings.curvature / 100, 0, 1);
  const smoothness = THREE.MathUtils.clamp(settings.smoothness / 100, 0, 1);
  const handle = attachment.gap * (.04 + (1 - smoothness) * .6);
  const m0 = fromPatch.normal.clone().multiplyScalar(handle);
  const m1 = toPatch.normal.clone().negate().multiplyScalar(handle);
  const grid: THREE.Vector3[][] = [];
  for (let station = 0; station <= stations; station++) {
    const t = station / stations;
    const row = attachment.starts.map((start, index) => hermite(start, attachment.ends[index], m0, m1, t));
    const center = row.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / row.length);
    const waist = 1 - curvature * .72 * Math.sin(Math.PI * t);
    row.forEach((point) => {
      const delta=point.clone().sub(center).multiplyScalar(waist);
      const profile=Math.sin(Math.PI*t);
      const u=fromPatch.tangent.clone().lerp(toPatch.tangent,t).normalize();
      const v=fromPatch.bitangent.clone().lerp(toPatch.bitangent,t).normalize();
      delta.addScaledVector(u,-delta.dot(u)*(1-THREE.MathUtils.clamp(settings.width/100,.12,1))*profile);
      delta.addScaledVector(v,-delta.dot(v)*(1-THREE.MathUtils.clamp(settings.thickness/100,.12,1))*profile);
      point.copy(center).add(delta);
    });
    if(station===0) row.forEach((p,i)=>p.copy(attachment.starts[i]));
    if(station===stations) row.forEach((p,i)=>p.copy(attachment.ends[i]));
    if (settings.typologyShape && station>0 && station<stations) {
      const shape=settings.typologyShape, envelope=Math.sin(Math.PI*t)**2;
      const terrace=Math.round(center.z / Math.max(.04,attachment.gap/6))*Math.max(.04,attachment.gap/6)-center.z;
      const lift=envelope*(terrace*shape.terracing + Math.sin(2*Math.PI*t)*attachment.gap*.12*shape.topography);
      row.forEach(p=>{p.z+=lift;});
    }
    grid.push(row);
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const points: number[] = [];
  const lines: number[] = [];
  const stride = attachment.starts.length;
  for (const row of grid) for (const p of row) positions.push(p.x, p.y, p.z);
  for (let s = 0; s < stations; s++) {
    for (let v = 0; v < stride; v++) {
      const next = (v + 1) % stride;
      const a = s * stride + v, b = s * stride + next;
      const c = (s + 1) * stride + v, d = (s + 1) * stride + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Triangulate concave clipped outlines without a fan through their centers.
  for (const station of [0, stations]) {
    const normal = station===0 ? fromPatch.normal : toPatch.normal.clone().negate();
    const u = station===0 ? fromPatch.tangent : fromPatch.tangent.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(fromPatch.normal,normal));
    const v = new THREE.Vector3().crossVectors(normal,u).normalize();
    const ring=grid[station];
    const contour=ring.map(p=>new THREE.Vector2(p.dot(u),p.dot(v)));
    for(const [a,b,c] of triangulatePerimeter(contour)) {
      const offset=station*stride;
      if(station===0)indices.push(offset+c,offset+b,offset+a);
      else indices.push(offset+a,offset+b,offset+c);
    }
  }
  const segment = (a: THREE.Vector3, b: THREE.Vector3) => lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
  // Sparse isocurves show the multiple matched attachment points, as in a loft.
  for (let v = 0; v < stride; v += 4) {
    for (const s of [0, stations]) points.push(...grid[s][v].toArray());
    for (let s = 0; s < stations; s++) segment(grid[s][v], grid[s + 1][v]);
  }
  for (let s = 0; s <= stations; s += 6) {
    for (let v = 0; v < stride; v++) segment(grid[s][v], grid[s][(v + 1) % stride]);
  }
  return { positions, indices, points, lines };
}

function dominantAxis(direction: THREE.Vector3): FaceBridgeDirection {
  const ax = Math.abs(direction.x);
  const ay = Math.abs(direction.y);
  const az = Math.abs(direction.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}


/** Clip each face against its local XY, XZ, or YZ grid. */
function gridSurface(surface: Surface, item: FaceBridgeInstance, divisions: number): Surface {
  const matrix = instanceMatrix(item), inverse = matrix.clone().invert();
  const local = (p: THREE.Vector3) => p.clone().applyMatrix4(inverse);
  const points: number[] = [], triangles: Tri[] = [], patches: Patch[] = [];
  const capPatches = surface.patches.filter(p => Math.max(Math.abs(p.localNormal.x),Math.abs(p.localNormal.y),Math.abs(p.localNormal.z)) > (item.letterRules ? Math.cos(THREE.MathUtils.degToRad(10.01)) : .9999));

  const clip = (polygon: THREE.Vector3[], axis: "x" | "y" | "z", value: number, sign: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = sign * (a[axis] - value), db = sign * (b[axis] - value);
      if (da >= -1e-9) out.push(a);
      if ((da >= 0) !== (db >= 0)) out.push(a.clone().lerp(b, da / (da - db)));
    }
    return out;
  };
  const bounds = new THREE.Box3();
  for (const patch of capPatches) for (const id of patch.triangles) {
    const tri = surface.triangles[id];
    for (const v of [tri.a, tri.b, tri.c]) bounds.expandByPoint(local(new THREE.Vector3().fromArray(surface.positions, v * 3)));
  }
  for (const patch of capPatches) {
  const plane = facePlane(patch);
  const u = plane === "yz" ? "y" : "x", v = plane === "xy" ? "y" : "z";
  const tangent = new THREE.Vector3(u === "x" ? 1 : 0, u === "y" ? 1 : 0, 0).transformDirection(matrix);
  tangent.addScaledVector(patch.normal, -tangent.dot(patch.normal)).normalize();
  const dx = (bounds.max[u] - bounds.min[u]) / divisions, dy = (bounds.max[v] - bounds.min[v]) / divisions;
  for (let x = 0; x < divisions; x++) for (let y = 0; y < divisions; y++) {
    const members: number[] = [];
    for (const id of patch.triangles) {
      const tri = surface.triangles[id];
      let poly = [tri.a, tri.b, tri.c].map(v => local(new THREE.Vector3().fromArray(surface.positions, v * 3)));
      poly = clip(poly, u, bounds.min[u] + x * dx, 1);
      poly = clip(poly, u, bounds.min[u] + (x + 1) * dx, -1);
      poly = clip(poly, v, bounds.min[v] + y * dy, 1);
      poly = clip(poly, v, bounds.min[v] + (y + 1) * dy, -1);
      for (let k = 1; k + 1 < poly.length; k++) {
        const [a,b,c] = [poly[0],poly[k],poly[k+1]].map(p => p.clone().applyMatrix4(matrix));
        const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        if (area < 1e-9) continue;
        const offset = points.length / 3;
        points.push(...a.toArray(),...b.toArray(),...c.toArray());
        members.push(triangles.length);
        triangles.push({a:offset,b:offset+1,c:offset+2,area,normal:patch.normal,localNormal:patch.localNormal,centroid:a.clone().add(b).add(c).divideScalar(3)});
      }
    }
    if (!members.length) continue;
    const largest = members.reduce((a,b) => triangles[a].area > triangles[b].area ? a : b);
    patches.push({...patch,faceId:patch.id,id:patches.length,triangles:members,anchor:triangles[largest].centroid.clone(),area:members.reduce((sum,id)=>sum+triangles[id].area,0),tangent:tangent.clone(),bitangent:new THREE.Vector3().crossVectors(patch.normal,tangent).normalize()});
  }
  }
  const result={...surface, positions:new Float32Array(points),triangles,patches};
  const split:Patch[]=[];
  for(const patch of patches) for(const perimeter of patchPerimeters(result,patch)) {
    split.push({...patch,id:split.length,perimeter});
  }
  return {...result,patches:split};
}

function faceGridLines(surface: Surface) {
  const lines:number[]=[];
  for(const patch of surface.patches) for(const loop of patch.perimeter ? [patch.perimeter] : patchPerimeters(surface,patch)) {
    for(let i=0;i<loop.length;i++)for(const p of [loop[i],loop[(i+1)%loop.length]])lines.push(...p.clone().addScaledVector(patch.normal,.001).toArray());
  }
  return lines;
}

const surfaceCache = new Map<string, Surface | null>();

function cachedSurface(item: FaceBridgeInstance, thickness: number, divisions: number) {
  const key = [item.letter, thickness, divisions, item.x, item.y, item.z, item.rx, item.ry, item.rz, item.scale, item.scaleX, item.scaleY, item.scaleZ, item.letterRules?.footTilt ?? 0, item.letterRules?.armRoll ?? 0,item.letterRules?.architectural??false,item.letterRules?.mirrored??false,item.letterRules?.enclosed??false].map((value) => typeof value === "number" ? value.toFixed(4) : value).join("|");
  const cached = surfaceCache.get(key);
  if (cached !== undefined) return cached;
  const original = buildSurface(item, thickness);
  const surface = original ? gridSurface(original, item, divisions) : null;
  if (surfaceCache.size > 500) surfaceCache.clear();
  surfaceCache.set(key, surface);
  return surface;
}

/** Exact distance between two closed boundary segments. */
function segmentGap(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3) {
 const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
 if(aa<1e-20||cc<1e-20)return Math.min(a.distanceTo(c),a.distanceTo(d),b.distanceTo(c),b.distanceTo(d));
 let t=den>1e-20?THREE.MathUtils.clamp((bb*ee-cc*dd)/den,0,1):0;
 let q=(bb*t+ee)/cc;
 if(q<0){q=0;t=THREE.MathUtils.clamp(-dd/aa,0,1);}else if(q>1){q=1;t=THREE.MathUtils.clamp((bb-dd)/aa,0,1);}
 return w.addScaledVector(u,t).addScaledVector(v,-q).length();
}
function patchGap(left:Surface,from:Patch,right:Surface,to:Patch) {
 const a=from.perimeter?[from.perimeter]:patchPerimeters(left,from),b=to.perimeter?[to.perimeter]:patchPerimeters(right,to);
 let gap=Infinity;
 const point=new THREE.Vector3();
 for(const [loops,surface,patch] of [[a,right,to],[b,left,from]] as const)for(const loop of loops)for(const p of loop)for(const id of patch.triangles){
  const t=surface.triangles[id],tri=new THREE.Triangle(...[t.a,t.b,t.c].map(i=>new THREE.Vector3().fromArray(surface.positions,i*3)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);
  tri.closestPointToPoint(p,point);gap=Math.min(gap,p.distanceTo(point));
 }
 for(const x of a)for(const y of b)for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++)gap=Math.min(gap,segmentGap(x[i],x[(i+1)%x.length],y[j],y[(j+1)%y.length]));
 return gap;
}

export function buildFaceBridges(instances: FaceBridgeInstance[], thickness: number, settings: FaceBridgeSettings): FaceBridgeMesh {
  const requiredGap=settings.requiredGap??0;
  if ((!settings.enabled && requiredGap<=0) || instances.length < 2) return EMPTY;
  const surfaces = instances.map((instance) => cachedSurface(instance, thickness, Math.max(2, Math.min(8, Math.round(settings.gridDivisions ?? 4))))).filter((surface): surface is Surface => Boolean(surface));
  if (surfaces.length < 2) return EMPTY;
  const gridLines = surfaces.flatMap(faceGridLines);
  if (settings.consolidate !== false) for (const surface of surfaces) {
    // Merge cells belonging to one original planar face before lofting.
    const groups = new Map<number, Patch[]>();
    for (const patch of surface.patches) {
      const id = patch.faceId ?? patch.id;
      groups.set(id, [...(groups.get(id) ?? []), patch]);
    }
    const merged: Patch[] = [];
    for (const cells of groups.values()) {
      const triangles = [...new Set(cells.flatMap(p => p.triangles))];
      const area = triangles.reduce((sum,id) => sum + surface.triangles[id].area,0);
      const anchor = new THREE.Vector3();
      for (const id of triangles) anchor.addScaledVector(surface.triangles[id].centroid,surface.triangles[id].area/area);
      const patch = {...cells[0], perimeter:undefined, triangles, area, anchor};
      for (const perimeter of patchPerimeters(surface,patch)) merged.push({...patch,id:merged.length,perimeter});
    }
    // Never mutate the cached gridded surface.
    surfaces[surfaces.indexOf(surface)] = {...surface,patches:merged};
  }
  const reach = Math.max(0.02, settings.maxDistance,requiredGap,settings.nearbyDistance??0);
  type Candidate = { i: number; j: number; from: Patch; to: Patch; score: number; required:boolean; gap:number };
  const candidates: Candidate[] = [];
  const adjacent=settings.adjacentPairs?new Set(settings.adjacentPairs.map(([a,b])=>Math.min(a,b)+":"+Math.max(a,b))):null;
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const isAdjacent=!adjacent||adjacent.has(i+":"+j);
      if(!isAdjacent&&!settings.nearbyDistance)continue;
      const left = surfaces[i];
      const right = surfaces[j];
      const pairingAllowed=!((settings.mode === "same" && left.letter !== right.letter) || (settings.mode === "different" && left.letter === right.letter));
      const expanded = left.box.clone().expandByScalar(reach);
      if (!expanded.intersectsBox(right.box)) continue;
      for (const from of left.patches) {

        for (const to of right.patches) {
          if (facePlane(from) !== facePlane(to)) continue;
          if (settings.allowedPlanes && !settings.allowedPlanes.includes(facePlane(from))) continue;
          const delta = to.anchor.clone().sub(from.anchor);
          const distance = delta.length();
          if (distance < 1e-7) continue;
          delta.multiplyScalar(1 / distance);
          const facing = from.normal.dot(delta);
          const returning = to.normal.dot(delta.clone().negate());
          if (facing < 0.45 || returning < 0.45 || from.normal.dot(to.normal) > -0.05) continue;
          const gap=patchGap(left,from,right,to),required=gap>1e-7&&gap<requiredGap;
          if(!isAdjacent&&gap>(settings.nearbyDistance??0))continue;
          if(!required&&(!settings.enabled||!pairingAllowed||distance>reach*2.2||(settings.direction!=="all"&&dominantAxis(delta)!==settings.direction)))continue;
          candidates.push({ i, j, from, to, required,gap,score: (facing * returning * Math.min(from.area, to.area)) * (1 + (settings.typologyShape?.vertical ?? 0)*Math.abs(delta.z) + (settings.typologyShape?.linearity ?? 0)*Math.max(Math.abs(delta.x),Math.abs(delta.y))) / (distance + 0.05) });
        }
      }
    }
  }
  candidates.sort((a, b) => Number(b.required)-Number(a.required)||b.score-a.score);
  // Budget occupied grid patches per letter, so open typologies remove connections
  // while continuous typologies can add them back from the same candidate pool.
  const eligible = surfaces.map(() => new Set<number>());
  for (const c of candidates) { eligible[c.i].add(c.from.id); eligible[c.j].add(c.to.id); }
  const budgets = eligible.map(patches => Math.ceil(patches.size * THREE.MathUtils.clamp(settings.typologyCoverage ?? 1, 0, 1)));
  const occupied = surfaces.map(() => 0);
  const used = new Set<string>();
  const links: NonNullable<FaceBridgeMesh["links"]> = [];
  const neighbors = new Map<number, Set<number>>();
  const points: number[] = [];
  const lines: number[] = [];
  const positions: number[] = [];
  const indices: number[] = [];
  let count = 0;
  let attempts = 0;
  for (const line of gridLines) {
    lines.push(line);
  }
  const limit = Math.max(1, Math.round(settings.maxConnections));
  for (const candidate of candidates) {
    if (!candidate.required && ++attempts > 100000) break;
    if(candidate.required&&neighbors.get(candidate.i)?.has(candidate.j))continue;
    if (!candidate.required&&(occupied[candidate.i] >= budgets[candidate.i] || occupied[candidate.j] >= budgets[candidate.j])) continue;
    if (!candidate.required&&(neighbors.get(candidate.i)?.size ?? 0) >= limit && !neighbors.get(candidate.i)?.has(candidate.j)) continue;
    if (!candidate.required&&(neighbors.get(candidate.j)?.size ?? 0) >= limit && !neighbors.get(candidate.j)?.has(candidate.i)) continue;
    const fromKey = `${candidate.i}:${candidate.from.id}`;
    const toKey = `${candidate.j}:${candidate.to.id}`;
    if (!candidate.required&&(used.has(fromKey) || used.has(toKey))) continue;
    const attachment = attachPatches(surfaces[candidate.i], candidate.from, surfaces[candidate.j], candidate.to, candidate.required?{...settings,maxDistance:Number.MAX_VALUE}:settings);
    if (!attachment) continue;
    const loft = loftAttachment(attachment, candidate.from, candidate.to, settings);
    // Very thin side cells can collapse during lofting; omit that connection.
    let valid = true;
    for (let t = 0; t < loft.indices.length; t += 3) {
      const [a,b,c] = loft.indices.slice(t,t+3).map(id => new THREE.Vector3().fromArray(loft.positions,id*3));
      if (b.sub(a).cross(c.sub(a)).length() <= 1e-10) { valid = false; break; }
    }
    if (!valid) continue;
    const centroid=(ps:THREE.Vector3[])=>ps.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(ps.length).toArray();
    links.push({required:candidate.required,gapFeet:candidate.gap,plane:facePlane(candidate.from),from:candidate.i,to:candidate.j,start:centroid(attachment.starts),end:centroid(attachment.ends)});
    const offset = positions.length / 3;
    for (const value of loft.positions) positions.push(value);
    for (const index of loft.indices) indices.push(index + offset);
    for (const value of loft.points) points.push(value);
    for (const value of loft.lines) lines.push(value);
    used.add(fromKey);
    used.add(toKey);
    for (const [a,b] of [[candidate.i,candidate.j],[candidate.j,candidate.i]]) {
      const set = neighbors.get(a) ?? new Set<number>(); set.add(b); neighbors.set(a,set);
    }
    occupied[candidate.i]++; occupied[candidate.j]++;
    count += 1;

  }
  const unmet=new Set(candidates.filter(c=>c.required&&!neighbors.get(c.i)?.has(c.j)).map(c=>`${c.i}:${c.j}`));
  return { positions, indices, points, lines, count, links,requiredUnconnected:unmet.size };
}

/** Shared by preview and generation so typology changes the actual same bridges. */
export function typologyBridgeSettings(base:FaceBridgeSettings, b:{horizontalPlateDominance:number;surfaceContinuity:number;terracing:number;topographicDeformation:number;verticalConnectivity:number;linearity:number;openness:number;convergence:number}):FaceBridgeSettings {
  return {...base,
    typologyCoverage:THREE.MathUtils.clamp(.35 + b.surfaceContinuity*.55 + b.convergence*.25 + b.verticalConnectivity*.15 - b.openness*.25 - b.linearity*.15, .15, 1),
    width:THREE.MathUtils.clamp(base.width*(.65+b.horizontalPlateDominance*.7),15,100),
    thickness:THREE.MathUtils.clamp(base.thickness*(1.15-b.horizontalPlateDominance*.65),15,100),
    curvature:THREE.MathUtils.clamp(base.curvature*(.4+b.topographicDeformation+b.openness*.3),0,100),
    smoothness:THREE.MathUtils.clamp(base.smoothness*(.6+b.surfaceContinuity*.6),0,100),
    maxConnections:Math.max(1,Math.min(base.maxConnections,Math.round(1+b.convergence*3+b.surfaceContinuity*2))),
    typologyShape:{terracing:b.terracing,topography:b.topographicDeformation,vertical:b.verticalConnectivity,linearity:b.linearity}};
}










