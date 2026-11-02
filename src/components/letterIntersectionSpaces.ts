import { connectionFillet } from './connectionFillet';
import { adjacentLetterPairs } from './interlockAdjacentLetters';
import { buildTypologyContinuity } from "./typologyContinuity";
import { OFFICE_TYPOLOGIES } from "./officeWorkspaceRules";
import { buildOfficeWorkspace } from "./officeWorkspaceGeometry";
import { canyonStaggering } from "./canyonStaggering";
import { CANYON_TYPOLOGIES, GATHERING_TYPOLOGIES, DEFAULT_GATHERING_OPERATIONS, type GatheringOperations } from "./gatheringOperations";
import { acuteVoidCorners, acuteFilletProfile } from "./acuteVoidFillets";
import { architecturalLetterGeometry, type LetterPlacementRules } from "./architecturalLetterGeometry";
import { arrangeTypologyLetters, type GatheringAngleLimits } from "./typologyLetterArrangement";
import { buildFaceBridges, type FaceBridgeSettings } from "./faceBridges";
import * as THREE from "three";
import ManifoldModule from "manifold-3d/manifold";
import {
  architecturalConnectionGraph,
  behaviorValue,
  lowResolutionLetter,
  placementMatrix,
  type ArchitecturalSpaceBehaviors,
  type ArchitecturalSpaceMode,
  type IntersectionPlacement,
} from "./architecturalConnections";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import type { Letter } from "./letterTypes";

export type { ArchitecturalSpaceBehaviors, ArchitecturalSpaceMode, IntersectionPlacement } from "./architecturalConnections";

export type IntersectionSpaceMesh = {
  positions: number[];
  normals: number[];
  indices: number[];
  pairs: number;
  /** Placement indexes whose whole letter is part of the combined mesh. */
  included: number[];
};

const EMPTY: IntersectionSpaceMesh = { positions: [], normals: [], indices: [], pairs: 0, included: [] };

function transformedLetter(letter: Letter, thickness: number, matrix: THREE.Matrix4, rules?: LetterPlacementRules) {
  const geometry = architecturalLetterGeometry(letter, thickness, rules);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertices: number[] = [];
  const triangles: number[] = [];
  const seen = new Map<string, number>();
  const point = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
    const key = `${Math.round(point.x*1e5)},${Math.round(point.y*1e5)},${Math.round(point.z*1e5)}`;
    let vertex = seen.get(key);
    if (vertex === undefined) {
      vertex = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      seen.set(key, vertex);
    }
    triangles.push(vertex);
  }
  return { vertices, triangles };
}

/** The source letter mesh, moved by the same matrix as the original view. Vertices are not welded or rebuilt. */
function originalLetterMesh(letter: Letter, thickness: number, matrix: THREE.Matrix4) {
  const geometry = getLetterVolumeGeometry(letter, thickness);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const positions: number[] = [];
  const normals: number[] = [];
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
    positions.push(point.x, point.y, point.z);
    direction.fromBufferAttribute(normal, vertex).applyMatrix3(normalMatrix).normalize();
    normals.push(direction.x, direction.y, direction.z);
  }
  const indices: number[] = [];
  const count = index ? index.count : position.count;
  for (let vertex = 0; vertex < count; vertex++) indices.push(index ? index.getX(vertex) : vertex);
  return { positions, normals, indices };
}

function overlaps(a: { min: [number, number, number]; max: [number, number, number] }, b: { min: [number, number, number]; max: [number, number, number] }) {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0]
    && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
    && a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}

/** Letters that intersect, copied from the original meshes into one mesh in the source coordinates. */
export async function buildLetterIntersectionSpaces(placements: IntersectionPlacement[], thickness: number): Promise<IntersectionSpaceMesh> {
  if (placements.length < 2) return EMPTY;
  const wasm = await ManifoldModule();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const solids: Array<{ placementIndex: number; manifold: InstanceType<typeof Manifold>; box: { min: [number, number, number]; max: [number, number, number] } }> = [];
  try {
    placements.forEach((placement, placementIndex) => {
      const { vertices, triangles } = transformedLetter(placement.letter, thickness, placementMatrix(placement));
      const solid = new Manifold(new Mesh({
        numProp: 3,
        vertProperties: new Float32Array(vertices),
        triVerts: new Uint32Array(triangles),
      }));
      if (solid.status() !== "NoError" || solid.isEmpty()) {
        solid.delete();
        return;
      }
      const box = solid.boundingBox();
      solids.push({ placementIndex, manifold: solid, box: { min: box.min, max: box.max } });
    });
    const involved = new Set<number>();
    let pairs = 0;
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        if (!overlaps(solids[i].box, solids[j].box)) continue;
        const hit = Manifold.intersection(solids[i].manifold, solids[j].manifold);
        const counts = hit.status() === "NoError" && !hit.isEmpty() && hit.volume() > 1e-5;
        hit.delete();
        if (!counts) continue;
        involved.add(solids[i].placementIndex);
        involved.add(solids[j].placementIndex);
        pairs += 1;
      }
    }
    if (!involved.size) return EMPTY;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const placementIndex of [...involved].sort((a, b) => a - b)) {
      const placement = placements[placementIndex];
      const mesh = originalLetterMesh(placement.letter, thickness, placementMatrix(placement));
      const offset = positions.length / 3;
      for (const value of mesh.positions) positions.push(value);
      for (const value of mesh.normals) normals.push(value);
      for (const vertex of mesh.indices) indices.push(vertex + offset);
    }
    return { positions, normals, indices, pairs, included: [...involved] };
  } finally {
    solids.forEach((solid) => solid.manifold.delete());
  }
}

type SolidRecord = {
  placementIndex: number;
  manifold: InstanceType<Awaited<ReturnType<typeof ManifoldModule>>["Manifold"]>;
  center: [number, number, number];
};

function claySurface(
  Manifold: Awaited<ReturnType<typeof ManifoldModule>>["Manifold"],
  source: InstanceType<Awaited<ReturnType<typeof ManifoldModule>>["Manifold"]>,
  radius: number,
) {
  type Solid = InstanceType<typeof Manifold>;
  const grow = Math.max(0.04, radius);
  const shrink = grow * 0.62;
  const growBall = Manifold.sphere(grow, 8);
  const shrinkBall = Manifold.sphere(shrink, 8);
  const pending: Solid[] = [];
  const keep = (solid: Solid) => {
    pending.push(solid);
    return solid;
  };
  try {
    const compressed = keep(source.scale([1, 1, 0.42]));
    const dilated = keep(compressed.minkowskiSum(growBall));
    const closed = keep(dilated.minkowskiDifference(shrinkBall));
    const restored = keep(closed.scale([1, 1, 1 / 0.42]));
    const box = restored.boundingBox();
    const height = Math.max(grow * 2, box.max[2] - box.min[2]);
    const column = keep(Manifold.cylinder(height, grow * 0.42, grow * 0.42, 20, false).translate([
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      box.min[2],
    ]));
    const joined = keep(Manifold.union([restored, column]));
    const smoothed = keep(joined.smoothOut(180, 1));
    const curved = smoothed.refineToTolerance(Math.max(0.02, grow * 0.24));
    const stood = curved.rotate(-90, 0, 0);
    curved.delete();
    return stood;
  } finally {
    growBall.delete();
    shrinkBall.delete();
    pending.forEach((solid) => {
      try { solid.delete(); } catch { /* Released after the rounded surface was built. */ }
    });
  }
}

function meshFromManifold(manifold: { getMesh: () => { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }, pairs: number, included: number[]): IntersectionSpaceMesh {
  const raw = manifold.getMesh();
  const stride = Math.max(3, raw.numProp);
  const positions: number[] = [];
  for (let vertex = 0; vertex < raw.vertProperties.length; vertex += stride) {
    positions.push(raw.vertProperties[vertex], raw.vertProperties[vertex + 1], raw.vertProperties[vertex + 2]);
  }
  const indices = Array.from(raw.triVerts);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = Array.from(geometry.getAttribute("normal").array as ArrayLike<number>);
  geometry.dispose();
  return { positions, normals, indices, pairs, included };
}

/**
 * One mesh from the letter arrangement.
 * Letters joins each letter solid to its neighbors. Voids keeps the space between those letters.
 * Letters + voids unions both.
 */
export async function buildArchitecturalSpaceMesh(
  placements: IntersectionPlacement[],
  thickness: number,
  mode: ArchitecturalSpaceMode,
  behaviors?: Partial<ArchitecturalSpaceBehaviors>,
): Promise<IntersectionSpaceMesh> {
  if (!placements.length) return EMPTY;
  const plate = behaviorValue(behaviors, "horizontalPlateDominance");
  const continuity = behaviorValue(behaviors, "surfaceContinuity");
  const wasm = await ManifoldModule();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  type ManifoldSolid = InstanceType<typeof Manifold>;
  const solids: SolidRecord[] = [];
  const discard: ManifoldSolid[] = [];
  const own = (solid: ManifoldSolid | null) => {
    if (!solid) return null;
    try {
      if (solid.status() !== "NoError" || solid.isEmpty() || !(solid.volume() > 1e-5)) {
        solid.delete();
        return null;
      }
    } catch {
      try { solid.delete(); } catch { /* The boolean result was already released. */ }
      return null;
    }
    discard.push(solid);
    return solid;
  };
  try {
    placements.forEach((placement, placementIndex) => {
      const { vertices, triangles } = lowResolutionLetter(placement.letter, thickness, placementMatrix(placement));
      const created = own(new Manifold(new Mesh({
        numProp: 3,
        vertProperties: new Float32Array(vertices),
        triVerts: new Uint32Array(triangles),
      })));
      if (!created) return;
      const box = created.boundingBox();
      solids.push({
        placementIndex,
        manifold: created,
        center: [
          (box.min[0] + box.max[0]) / 2,
          (box.min[1] + box.max[1]) / 2,
          (box.min[2] + box.max[2]) / 2,
        ],
      });
    });
    if (!solids.length) return EMPTY;
    const graph = architecturalConnectionGraph(solids.map((solid) => placements[solid.placementIndex]), thickness, behaviors);
    solids.forEach((solid, index) => {
      solid.center = graph.centers[index] ?? solid.center;
    });
    const bridgeLinks = graph.links;
    const reach = graph.reach;
    const meanScale = placements.reduce((sum, placement) => sum + placement.scale, 0) / placements.length;
    const bridgeRadius = Math.max(0.025, meanScale * (0.1 + plate * 0.24 + continuity * 0.06));
    const tubeBetween = (from: [number, number, number], to: [number, number, number], radius: number) => {
      const direction = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const length = Math.max(direction.length(), 0.001);
      direction.multiplyScalar(1 / length);
      const helper = Math.abs(direction.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const xAxis = new THREE.Vector3().crossVectors(helper, direction).normalize();
      const yAxis = new THREE.Vector3().crossVectors(direction, xAxis).normalize();
      const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, direction);
      matrix.setPosition((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
      return Manifold.cylinder(length, radius, radius, 8, true).transform(matrix.elements as Parameters<ManifoldSolid["transform"]>[0]);
    };
    const pieces: ManifoldSolid[] = mode === "voids" ? [] : solids.map((solid) => solid.manifold);
    let connections = 0;
    bridgeLinks.forEach((link) => {
      const from = solids[link.i];
      const to = solids[link.j];
      const local = link.length <= reach * 1.75;
      let hull: ManifoldSolid | null = null;
      let removedFirst: ManifoldSolid | null = null;
      let gap: ManifoldSolid | null = null;
      try {
        hull = Manifold.hull([from.manifold, to.manifold]);
        removedFirst = hull.subtract(from.manifold);
        gap = own(removedFirst.subtract(to.manifold));
      } catch {
        gap = null;
      } finally {
        hull?.delete();
        removedFirst?.delete();
      }
      if (mode !== "letters" && gap && local) {
        pieces.push(gap);
        connections += 1;
      }
      if (mode === "letters") {
        const tubeRadius = local ? bridgeRadius : Math.max(bridgeRadius, Math.min(link.length * 0.22, meanScale * 0.45));
        let tube: ManifoldSolid | null = null;
        let bridge: ManifoldSolid | null = null;
        try {
          tube = tubeBetween(from.center, to.center, tubeRadius);
          bridge = gap ? own(gap.intersect(tube)) : null;
        } catch {
          bridge = null;
        } finally {
          tube?.delete();
        }
        if (bridge && gap && bridge.volume() >= gap.volume() * 0.08) {
          pieces.push(bridge);
          connections += 1;
        } else if (gap && local) {
          pieces.push(gap);
          connections += 1;
        } else if (own(tubeBetween(from.center, to.center, tubeRadius))) {
          pieces.push(discard[discard.length - 1]);
          connections += 1;
        }
      }
    });
    const uniquePieces = [...new Set(pieces)];
    if (!uniquePieces.length) return EMPTY;
    const merged = uniquePieces.length === 1 ? uniquePieces[0] : Manifold.union(uniquePieces);
    const blend = meanScale * (0.11 + continuity * 0.05 + plate * 0.04);
    let clay: ManifoldSolid | null = null;
    let smoothedOnly: ManifoldSolid | null = null;
    try {
      if (merged.numTri() > 8000) {
        smoothedOnly = merged.smoothOut(160, 0.9);
        clay = smoothedOnly.refineToTolerance(Math.max(0.03, blend * 0.35));
      } else {
        clay = claySurface(Manifold, merged, blend);
      }
    } catch {
      clay = null;
    } finally {
      smoothedOnly?.delete();
    }
    const surface = clay ?? merged;
    const included = solids.map((solid) => solid.placementIndex);
    const mesh = meshFromManifold(surface, connections, included);
    clay?.delete();
    if (merged !== uniquePieces[0] || uniquePieces.length !== 1) merged.delete();
    return mesh.indices.length ? mesh : EMPTY;
  } finally {
    discard.forEach((solid) => {
      try { solid.delete(); } catch { /* Released with the union. */ }
    });
  }
}

/** Final space uses the same perimeter lofts as Connections, with no replacement graph. */
export async function buildBridgeSpaceMesh(placements:IntersectionPlacement[], thickness:number, mode:ArchitecturalSpaceMode, settings:FaceBridgeSettings):Promise<IntersectionSpaceMesh> {
  const bridges=buildFaceBridges(placements,thickness,settings);
  if(!bridges.count)return EMPTY;
  const wasm=await ManifoldModule();wasm.setup();const {Manifold,Mesh}=wasm;
  const owned:InstanceType<typeof Manifold>[]=[];
  const own=(s:InstanceType<typeof Manifold>)=>{owned.push(s);if(s.status()!=="NoError")throw new Error("Bridge geometry could not be fused: "+s.status());return s;};
  try {
    const bridge=own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(bridges.positions),triVerts:new Uint32Array(bridges.indices)})));
    const parts=bridge.decompose();parts.forEach(p=>owned.push(p));
    const letters=placements.map(p=>{const m=transformedLetter(p.letter,thickness,placementMatrix(p),p.letterRules);return own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(m.vertices),triVerts:new Uint32Array(m.triangles)})));});
    const joined=own(Manifold.union(mode==="voids"?parts:[...parts,...letters]));
    const final=mode==="voids"?own(joined.subtract(own(Manifold.union(letters)))):joined;
    return meshFromManifold(final,bridges.count,mode==="voids"?[]:placements.map((_,i)=>i));
  } finally {for(const s of owned)s.delete();}
}


export type WorkflowMesh = IntersectionSpaceMesh & { volume:number; area:number; components:number };
export type ConnectionWorkflow = {
  variants: Record<ArchitecturalSpaceMode,WorkflowMesh>;
  source:WorkflowMesh; intersections:WorkflowMesh; bridges:WorkflowMesh; floors?:WorkflowMesh;
  links:NonNullable<ReturnType<typeof buildFaceBridges>["links"]>;
  settings:FaceBridgeSettings; boundaryDesignations?:{sourceIndex:number;letter:string;role:string;rotation:[number,number,number]}[]; gatheringOperations?:GatheringOperations; gatheringValidation?:{label:string;status:"pass"|"unverified";detail:string}[]; officeValidation?:{label:string;status:"pass"|"unverified";detail:string}[]; protectedVoid?:WorkflowMesh; enclosure?:WorkflowMesh; arrangedSource?:WorkflowMesh; arrangement?:{originalPlacements:IntersectionPlacement[];placements:IntersectionPlacement[];sequence:number[];preservedPairs:number[][];overlapFractions?:number[];riseFractions?:number[]}; formation?:{operations:string[];supported:boolean};
};

/** A, B and C share a single source, bridge graph and boolean construction. */
export async function buildConnectionWorkflow(placements:IntersectionPlacement[], thickness:number, settings:FaceBridgeSettings,typology?:string,onProgress?:(percent:number,label:string)=>Promise<void>,angleLimits?:GatheringAngleLimits,gatheringOperations:GatheringOperations=DEFAULT_GATHERING_OPERATIONS):Promise<ConnectionWorkflow> {
 const progress=onProgress??(async()=>{});
 await progress(2,"Preparing geometry");
 settings={...settings,allowedPlanes:/topographic|folded-undulating/.test(typology??'')?["xy"]:["xz","yz"],requiredGap:1};
 let bridgeMesh=buildFaceBridges([],thickness,settings);
 const wasm=await ManifoldModule();wasm.setup();const {Manifold,Mesh}=wasm;
 const owned:InstanceType<typeof Manifold>[]=[];
 const own=(s:InstanceType<typeof Manifold>)=>{owned.push(s);if(s.status()!=="NoError")throw new Error("Geometry construction failed: "+s.status());return s;};
 const release=(s:InstanceType<typeof Manifold>)=>{const index=owned.lastIndexOf(s);if(index<0)return;owned.splice(index,1);try{s.delete();}catch{/* A shared boolean result may already have dropped this wrapper. */}};
 const empty=():WorkflowMesh=>({...EMPTY,volume:0,area:0,components:0});
 // Large unions are evaluated in small groups. A single 100+ solid boolean
 // allocates a WASM heap big enough to abort with "memory access out of bounds".
 const union=(ss:InstanceType<typeof Manifold>[])=>{
  const items=ss.filter((s):s is InstanceType<typeof Manifold>=>s!=null);
  if(!items.length)return null;
  // A batch of 8 can leave one original solid in the next round. That solid is
  // still used after the union, so only intermediate results are released.
  const originals=new Set(items);
  let layer=items.slice();
  while(layer.length>1){
   const next:InstanceType<typeof Manifold>[]=[];
   for(let i=0;i<layer.length;i+=8){
    const group=layer.slice(i,i+8);
    if(group.length===1){next.push(group[0]);continue;}
    const merged=own(Manifold.union(group));
    const flat=merged.asOriginal();
    if(flat===merged)next.push(merged);
    else{next.push(own(flat));release(merged);}
   }
   for(const item of layer)if(!next.includes(item)&&!originals.has(item))release(item);
   layer=next;
  }
  return layer[0];
 };
 // A connected solid's decompose() result can be the solid itself. Deleting that
 // result frees the solid that later booleans still need.
 const componentCount=(solid:InstanceType<typeof Manifold>)=>{
  const pieces=solid.decompose();
  let count=0;
  for(const piece of pieces){
   if(piece.volume()>0)count++;
   if(piece!==solid)piece.delete();
  }
  return count;
 };
 const describe=(s:InstanceType<typeof Manifold>|null,included:number[]=[]):WorkflowMesh=>{
  if(!s||s.isEmpty())return empty();
  return {...meshFromManifold(s,bridgeMesh.count,included),volume:s.volume(),area:s.surfaceArea(),components:componentCount(s)};
 };
 try {
  const makeSolid=(p:IntersectionPlacement)=>{const m=transformedLetter(p.letter,thickness,placementMatrix(p),p.letterRules);return own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(m.vertices),triVerts:new Uint32Array(m.triangles)})));};
  const originals=placements.map(makeSolid);let originalSource=union(originals);
  await progress(8,"Arranging letters");
  const temporary:InstanceType<typeof Manifold>[]=[];
  const track=(p:IntersectionPlacement)=>{const s=makeSolid(p);temporary.push(s);return s;};
  const arrangement=typology?arrangeTypologyLetters(placements,originals,track,typology,angleLimits,gatheringOperations):undefined;
  while(temporary.length)release(temporary.pop()!);
  if(originalSource){const flat=own(originalSource.asOriginal());if(flat!==originalSource)release(originalSource);originalSource=flat;}
  originals.forEach(solid=>{if(owned.includes(solid))release(solid);});
  const formation:{operations:string[];supported:boolean}|undefined=arrangement?{operations:arrangement.operations,supported:arrangement.supported}:undefined;
  const gathering=GATHERING_TYPOLOGIES.has(typology??'');
  const office=OFFICE_TYPOLOGIES.has(typology??'');
  const arranged=arrangement?.placements??placements;
  const letters=arranged.map(makeSolid);
  const adjacentPairs=adjacentLetterPairs(arrangement?.sequence??letters.map((_,i)=>i));
  settings={...settings,adjacentPairs,nearbyDistance:2};
  if(office)settings={...settings,enabled:false,requiredGap:0,maxConnections:0};

  await progress(20,"Building face bridges");
  bridgeMesh=buildFaceBridges(arranged,thickness,settings);
  await progress(28,"Combining letters");
  if(formation)formation.operations.push(office?"Office plates, supports and ramps form the connected workplace. Letter-to-letter bridges stay off so they do not cross the voids.":gathering?"Gaps under 1 ft between eligible letters with compatible selected-plane faces require a bridge. Specified or detected openings are checked separately.":"Gaps under 1 ft between eligible letters with compatible selected-plane faces require a bridge, overriding optional connection budgets. Central openings remain protected.",office?"Void cuts are applied to the plates. Stairs and ramps are added after that cut.":`${bridgeMesh.requiredUnconnected??0} required face-pair connections could not be constructed. Void protection can trim or remove connections that cross the central opening.`);
  let source=union(letters);const included=placements.map((_,i)=>i);
  let bridges:InstanceType<typeof Manifold>|null=null;
  await progress(32,"Building bridge solids");
  if(bridgeMesh.count){try{bridges=own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(bridgeMesh.positions),triVerts:new Uint32Array(bridgeMesh.indices)})));}catch(error){throw new Error("Bridge mesh could not be built: "+(error instanceof Error?error.message:String(error)));}}
  if(bridgeMesh.links?.length){
   // Each bridge end is a revolved solid. Boolean-union of hundreds of them
   // with the letter field overruns the WASM heap and aborts generation.
   if(bridgeMesh.links.length>32){if(formation)formation.operations.push(`${bridgeMesh.links.length} bridge lofts are included. Separate end-cap fillets were skipped so the geometry would stay within the available memory.`);}
   else{
    const collars:InstanceType<typeof Manifold>[]=[];
    for(const link of bridgeMesh.links){
     const radius=Math.min(...[arranged[link.from],arranged[link.to]].map(p=>(thickness/100+.02)*p.scale*Math.min(p.scaleX,p.scaleY,p.scaleZ)))*Math.max(5,Math.min(50,settings.filletPercent??20))/100;
     try{for(const point of [link.start,link.end])collars.push(connectionFillet(wasm,point as [number,number,number],radius,own));}catch(error){throw new Error("Connection fillet failed: "+(error instanceof Error?error.message:String(error)));}
    }
    try{bridges=union([...(bridges?[bridges]:[]),...collars]);}catch(error){throw new Error("Connection fillets could not be combined: "+(error instanceof Error?error.message:String(error)));}
   }
  }
  // Rounded additive transitions at every actual letter intersection. Morphological
  // closing rounds concave seams; retaining the source union preserves the letters.
  const intersectionSolids:InstanceType<typeof Manifold>[]=[];
  const fillets:InstanceType<typeof Manifold>[]=[];
  let intersectionPairs=0,processedPairs=0,collarOnly=0;
  const totalPairs=Math.max(1,letters.length*(letters.length-1)/2);
  const boxes=letters.map(letter=>letter.boundingBox());
  await progress(36,"Rounding intersections");
  for(let i=0;i<letters.length;i++)for(let j=i+1;j<letters.length;j++){
   const pairIndex=processedPairs++;
   if(pairIndex%40===0)await progress(36+29*pairIndex/totalPairs,"Rounding intersections");
   if(!overlaps(boxes[i],boxes[j]))continue;
   const scratch:InstanceType<typeof Manifold>[]=[];
   const temp=(s:InstanceType<typeof Manifold>)=>{const solid=own(s);scratch.push(solid);return solid;};
   const keep=(s:InstanceType<typeof Manifold>)=>{const index=scratch.indexOf(s);if(index>=0)scratch.splice(index,1);return s;};
   try{
   const overlap=temp(letters[i].intersect(letters[j]));
   if(overlap.isEmpty()||overlap.volume()<=1e-10*Math.min(letters[i].volume(),letters[j].volume()))continue;
   intersectionSolids.push(keep(overlap));
   intersectionPairs++;
   if(letters.length>16)continue;
   const depth=(p:IntersectionPlacement)=>(thickness/100+.02)*p.scale*Math.min(p.scaleX,p.scaleY,p.scaleZ);
   const radius=Math.max(1e-5,Math.min(depth(arranged[i]),depth(arranged[j]))*Math.max(5,Math.min(50,settings.filletPercent??20))/100);
   const bounds=overlap.boundingBox();
   const region=(padding:number)=>{const cube=Manifold.cube(bounds.max.map((v,k)=>v-bounds.min[k]+2*padding) as [number,number,number]);try{return temp(cube.translate(bounds.min.map(v=>v-padding) as [number,number,number]));}finally{cube.delete();}};
   const pair=temp(letters[i].add(letters[j]));
   const local=temp(pair.intersect(region(radius*3)));
   const midpoint=(bounds.min[2]+bounds.max[2])/2;
   const center: [number,number,number]=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2,midpoint];
   let added:InstanceType<typeof Manifold>;
   // A dense seam makes the sphere-sum allocate past the WASM heap limit.
   if(letters.length<=16&&local.numTri()<=1200){
    const ball=temp(Manifold.sphere(radius,12));
    const expanded=temp(local.minkowskiSum(ball));
    const rounded=temp(expanded.minkowskiDifference(ball));
    const lowerCube=Manifold.cube([bounds.max[0]-bounds.min[0]+2*radius,bounds.max[1]-bounds.min[1]+2*radius,midpoint-bounds.min[2]+radius] as [number,number,number]);
    const lower=temp(lowerCube.translate([bounds.min[0]-radius,bounds.min[1]-radius,bounds.min[2]-radius]));
    lowerCube.delete();
    const collar=connectionFillet(wasm,center,radius,own);scratch.push(collar);
    added=temp(temp(rounded.intersect(lower)).add(collar));
   }else{collarOnly++;added=connectionFillet(wasm,center,radius,own);scratch.push(added);}
   if(!added.isEmpty())fillets.push(keep(added));
   }catch(error){throw new Error("Rounding letters "+(i+1)+" and "+(j+1)+" failed: "+(error instanceof Error?error.message:String(error)));}
   finally{for(const item of scratch)release(item);}
  }
  if(fillets.length){const previous=bridges;const merged=union([...(previous?[previous]:[]),...fillets]);if(previous&&previous!==merged&&!letters.includes(previous))release(previous);bridges=merged;}
  if(formation)formation.operations.push(`Rounded fillets applied to ${intersectionPairs} letter intersections (${fillets.length} exposed seams). Lower 50% is concave and upper 50% is convex. Radius uses the connection fillet setting; enclosed central voids remain protected.`);
  if(formation&&letters.length>16)formation.operations.push(`Intersection fillets were not folded into the solid for ${letters.length} letters, so generation stays within the geometry memory limit. Face-bridge lofts and the intersection solids are still included.`);
  if(formation&&collarOnly)formation.operations.push(`${collarOnly} dense seams used the connection fillet without a morphological close so the geometry would stay within the available memory.`);
  const keepSolid=(solid:InstanceType<typeof Manifold>)=>{if(solid.status()!=="NoError"){try{solid.delete();}catch{/* An invalid boolean result cannot be reused. */}return null;}return own(solid);};
  // Stacked, tilted letters can project to overlapping outlines. A bad contour must not abort the form.
  const projectedOpeningShaft=(solid:InstanceType<typeof Manifold>,zMin:number,height:number):{shaft:InstanceType<typeof Manifold>|null;invalid:boolean}=>{
   let footprint:ReturnType<InstanceType<typeof Manifold>["project"]>|null=null;
   try{
    footprint=solid.project();
    const rings=footprint.toPolygons().flatMap(ring=>{
     let area=0;for(let i=0;i<ring.length;i++){const next=ring[(i+1)%ring.length];area+=ring[i][0]*next[1]-next[0]*ring[i][1];}
     if(area>=-1e-5||ring.length<3)return [];
     const cleaned:[number,number][]=[];
     for(const point of ring){const last=cleaned[cleaned.length-1];if(!last||Math.hypot(point[0]-last[0],point[1]-last[1])>1e-6)cleaned.push([point[0],point[1]]);}
     if(cleaned.length>2&&Math.hypot(cleaned[0][0]-cleaned[cleaned.length-1][0],cleaned[0][1]-cleaned[cleaned.length-1][1])<=1e-6)cleaned.pop();
     return cleaned.length>=3?[cleaned]:[];
    });
    if(!rings.length)return {shaft:null,invalid:false};
    let opening=new wasm.CrossSection(rings.map(ring=>[...ring].reverse()),"NonZero");
    try{
     const simplified=opening.simplify(1e-6);
     if(simplified!==opening){opening.delete();opening=simplified;}
     if(opening.isEmpty())return {shaft:null,invalid:false};
     const extruded=opening.extrude(Math.max(height,1e-6));
     if(extruded.status()!=="NoError"){try{extruded.delete();}catch{/* */}return {shaft:null,invalid:true};}
     if(extruded.isEmpty()){extruded.delete();return {shaft:null,invalid:false};}
     const shaft=keepSolid(own(extruded).translate([0,0,zMin]));
     return {shaft,invalid:!shaft};
    }finally{opening.delete();}
   }catch{return {shaft:null,invalid:true};}
   finally{footprint?.delete();}
  };
  await progress(65,"Preserving central openings");
  // Protect enclosed plan openings before adding side-face bridges to the letters.
  // Only bridge material is cut; the original letter solids remain unchanged.
  if(source&&bridges){
   const bounds=bridges.boundingBox(),margin=Math.max(bounds.max[2]-bounds.min[2],1)*1e-5;
   const opened=projectedOpeningShaft(source,bounds.min[2]-margin,bounds.max[2]-bounds.min[2]+2*margin);
   if(opened.shaft){
    const before=bridges.volume(),cut=keepSolid(bridges.subtract(opened.shaft));
    if(cut){bridges=cut;if(formation&&before-bridges.volume()>Math.max(1e-9,before*1e-6))formation.operations.push("Bridge material crossed a protected central void and was removed. Some required short-gap connections may therefore remain interrupted by that void.");}
    else if(formation)formation.operations.push("Projected central openings overlapped into a non-manifold plan cut, so the bridge solids were left intact.");
   }else if(opened.invalid&&formation)formation.operations.push("Projected central openings overlapped into a non-manifold plan cut, so the bridge solids were left intact.");
  }
  // Small acute void tips can round inward after broad central-void protection.
  // The tangent arc occupies at most 20% of the adjacent-face depth, preserving the mouth.
  const beforeAcute=letters.length<=16?union([source,bridges].filter((x):x is InstanceType<typeof Manifold>=>Boolean(x))):null;
  let acuteCount=0;
  await progress(70,"Rounding acute voids");
  if(beforeAcute&&source){
   // Detect architectural void corners before bridge lofts and fillets introduce
   // triangulated seams that are not new spatial voids.
   const corners=acuteVoidCorners(meshFromManifold(source,0,[]),2),pieces:InstanceType<typeof Manifold>[]=[];
   const radius=arranged.reduce((r,p)=>Math.min(r,(thickness/100+.02)*p.scale*Math.min(p.scaleX,p.scaleY,p.scaleZ)*.2),Infinity);
   let processedCorners=0;
   for(const corner of corners){
    await progress(70+10*processedCorners++/Math.max(1,corners.length),"Rounding acute voids");
    const profile=acuteFilletProfile(corner,radius);if(profile.radius<=1e-7)continue;
    const section=new wasm.CrossSection([profile.points],"NonZero");
    try{
     const extrusion=own(section.extrude(corner.length));
     const {u,v,axis,origin}=corner;
     // The cross-section basis must be right handed for a valid transform.
     const flip=new THREE.Vector3().crossVectors(u,v).dot(axis)<0;
     const start=flip?origin.clone().addScaledVector(axis,corner.length):origin;
     const z=axis.clone().multiplyScalar(flip?-1:1);
     const matrix:[number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number]=[u.x,u.y,u.z,0,v.x,v.y,v.z,0,z.x,z.y,z.z,0,start.x,start.y,start.z,1];
     const placed=own(extrusion.transform(matrix));
     const added=own(placed.subtract(beforeAcute));
     if(!added.isEmpty()){pieces.push(added);acuteCount++;}
    }finally{section.delete();}
   }
   if(pieces.length)bridges=union([...(bridges?[bridges]:[]),...pieces]);
  }
  if(formation)formation.operations.push(letters.length>16?`Acute void fillets were not applied across ${letters.length} letters, so generation stays within the geometry memory limit.`:`Acute void fillets: ${acuteCount} edge segments with opening width under 2 ft rounded. Width is measured at the shorter adjacent face's mouth; each fillet occupies at most 20% of its depth so the main opening stays clear.`);
  const continuity=office?{solid:null,floors:null,connections:0}:buildTypologyContinuity(wasm,letters,arrangement?.sequence??letters.map((_,i)=>i),typology??'',own,settings.filletPercent??20,GATHERING_TYPOLOGIES.has(typology??'')?gatheringOperations.minimumClearance:0,gatheringOperations.requireConnectivity,arrangement?.atrium?{center:arrangement.atrium.center,radius:arrangement.atrium.radius}:undefined);
  if(continuity.solid)bridges=union([...(bridges?[bridges]:[]),continuity.solid]);
  if(formation)formation.operations.push(office?'Office connectivity comes from the plates, vertical L supports, and the stair or ramp links.':' '+continuity.connections+' adjacent solid connections were generated; axis-based layouts include intermediate floor plates.'.trim());
  const officeSolid=office&&arrangement?.officePlan?buildOfficeWorkspace(wasm,arrangement.officePlan,own):null;
  let explicitVoid:InstanceType<typeof Manifold>|null=null;
  const atrium=arrangement?.atrium;
  const voidRadius=atrium?.radius??gatheringOperations.protectedVoidRadius;
  if(gathering&&source&&voidRadius>0){
   const bounds=source.boundingBox(),margin=Math.max(bounds.max[2]-bounds.min[2],1)*1e-4,centerX=atrium?.center[0]??(bounds.min[0]+bounds.max[0])/2+gatheringOperations.protectedVoidOffsetX,centerY=atrium?.center[1]??(bounds.min[1]+bounds.max[1])/2+gatheringOperations.protectedVoidOffsetY;
   explicitVoid=own(own(Manifold.cylinder(bounds.max[2]-bounds.min[2]+margin*2,voidRadius,voidRadius,48)).translate([centerX,centerY,bounds.min[2]-margin]));
   if(own(source.intersect(explicitVoid)).volume()>Math.max(1e-12,source.volume()*1e-9))throw new Error('The selected protected void intersects a source letter. Adjust its position or radius, or choose a different arrangement.');
  }
  let protectedOpening=explicitVoid;
  const terraces=gathering?canyonStaggering(wasm,letters,arranged,arrangement?.sequence??letters.map((_,i)=>i),gatheringOperations,explicitVoid,own):null;
  if(terraces?.solid&&source){
   if(explicitVoid){terraces.solid=own(terraces.solid.subtract(explicitVoid));if(bridges)bridges=own(bridges.subtract(explicitVoid));if(continuity.solid)continuity.solid=own(continuity.solid.subtract(explicitVoid));if(continuity.floors)continuity.floors=own(continuity.floors.subtract(explicitVoid));for(let i=0;i<fillets.length;i++)fillets[i]=own(fillets[i].subtract(explicitVoid));if(formation)formation.operations.push(`${atrium&&gatheringOperations.protectedVoidRadius===0?'A source-derived':'An explicit'} protected void with radius ${voidRadius.toFixed(3)} ft is cut from the generated connections and plates.`);}

   const solids=[source,terraces.solid,bridges,continuity.solid].filter((solid):solid is InstanceType<typeof Manifold>=>Boolean(solid)),boxes=solids.map(solid=>solid.boundingBox());
   const low=Math.min(...boxes.map(box=>box.min[2])),high=Math.max(...boxes.map(box=>box.max[2])),margin=Math.max(high-low,1)*1e-5;
   const opened=projectedOpeningShaft(source,low-margin,high-low+2*margin);
   if(opened.shaft){
    const shaft=opened.shaft;
    protectedOpening=union([protectedOpening,shaft].filter((solid):solid is InstanceType<typeof Manifold>=>Boolean(solid)));
    const cutTerrace=keepSolid(terraces.solid.subtract(shaft));if(cutTerrace)terraces.solid=cutTerrace;
    if(bridges){const cut=keepSolid(bridges.subtract(shaft));if(cut)bridges=cut;}
    if(continuity.solid){const cut=keepSolid(continuity.solid.subtract(shaft));if(cut)continuity.solid=cut;}
    if(continuity.floors){const cut=keepSolid(continuity.floors.subtract(shaft));if(cut)continuity.floors=cut;}
    for(let i=0;i<fillets.length;i++){const cut=keepSolid(fillets[i].subtract(shaft));if(cut)fillets[i]=cut;}
    if(formation)formation.operations.push(cutTerrace?"Detected enclosed plan openings are protected through the terrace and connection geometry.":"Projected central openings overlapped into a non-manifold plan cut, so terrace and connection solids were left intact.");
   }else if(opened.invalid&&formation)formation.operations.push("Projected central openings overlapped into a non-manifold plan cut, so terrace and connection solids were left intact.");
   else if(!explicitVoid&&formation)formation.operations.push("No enclosed central opening was identified in the projected letters; a continuous central gathering void has not been verified.");
  }
  let floors=union([continuity.floors,terraces?.solid,officeSolid].filter((s):s is InstanceType<typeof Manifold>=>Boolean(s)));
  if(formation&&terraces&&typology==='stepped-amphitheater'){formation.operations.push('Floor audit: each eligible letter generates a projected plate with a 6% outline offset; continuity geometry can add floor plates. Dimensions below are geometry bounding boxes in the generator coordinate units.');for(const m of terraces.measurements){const d=m.max.map((v,i)=>v-m.min[i]);formation.operations.push(`Source letter ${m.sourceIndex+1} initial plate bounds before protected-void cuts: ${d.map(v=>v.toFixed(3)).join(' × ')} units; elevation ${m.min[2].toFixed(3)} to ${m.max[2].toFixed(3)}.`);}}
  if(formation&&terraces){formation.operations.push(`${CANYON_TYPOLOGIES.has(typology??'')?'Canyon staggering':'Letter-derived gathering plates'}: ${terraces.count} plate components, ${terraces.recesses} recesses at ${gatheringOperations.alcoveDepthPercent}% of bay depth and ${gatheringOperations.alcoveWidthPercent}% of bay width. ${terraces.skippedClearance} recesses were omitted so the remaining bay stays at least ${gatheringOperations.minimumClearance} ft clear. ${terraces.laps} floor and wall laps were added so neighboring plates and upright letters overlap.`);formation.operations.push('Adjacent connectors form the circulation chain. Floor plates stay horizontal. Connecting floor laps stay in a vertical plane perpendicular to the XY plane. Boundary rotation, when set, turns edge and enclosure plates by up to ±15° and leaves floor plates unrotated. Alcove pockets are cut from those plates only when the remaining bay meets the minimum clearance.');}
  // Fixed 20 ft cube, centered on the actual letter bounds.
  let enclosure:InstanceType<typeof Manifold>|null=null;
  if(source){const bounds=source.boundingBox();const side=20;const center:[number,number,number]=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2,(bounds.min[2]+bounds.max[2])/2];enclosure=own(Manifold.cube([side,side,side],true).translate(center));}
  await progress(82,"Building architectural variations");
  let a=union([source,bridges,terraces?.solid,officeSolid].filter((x):x is InstanceType<typeof Manifold>=>Boolean(x)));
  const continuous=(solid:InstanceType<typeof Manifold>)=>componentCount(solid)===1&&letters.every(letter=>{const leftover=own(letter.subtract(solid));try{return leftover.volume()<=letter.volume()*1e-6;}finally{release(leftover);}});
  // Keep required rounded bridges and apply seam fillets to the connected core
  // individually. A failed optional loft cannot discard all rounded intersections.
  let organicCore=union([source,continuity.solid,terraces?.solid,officeSolid].filter((s):s is InstanceType<typeof Manifold>=>Boolean(s)));
  const retainedFillets:InstanceType<typeof Manifold>[]=[];
  for(const fillet of fillets)if(organicCore){
   const candidate=own(organicCore.add(fillet));
   if(continuous(candidate)){organicCore=candidate;retainedFillets.push(fillet);}
  }
  if(a&&!continuous(a)){
   a=organicCore;
   bridges=union([continuity.solid,...retainedFillets].filter((s):s is InstanceType<typeof Manifold>=>Boolean(s)));
   if(formation)formation.operations.push('Disconnected optional loft fragments were replaced by the verified rounded bridges and attached intersection fillets.');
  }
  if(a&&!continuous(a)){const count=componentCount(a);throw new Error(count===1?'Final continuity validation failed. The solid is connected, but one or more letters are not fully contained in it.':`Final continuity validation failed. The result is ${count} separate solids, so the selected letters do not form one connected piece.`);}
  if(a&&protectedOpening&&own(a.intersect(protectedOpening)).volume()>Math.max(1e-12,protectedOpening.volume()*1e-8))throw new Error('The generated geometry obstructs a protected opening. Adjust the arrangement or protected void radius.');
  if(!office&&letters.length>1&&(!gathering||gatheringOperations.requireConnectivity)&&continuity.connections!==letters.length-1)throw new Error('A required adjacent bridge is missing.');
  if(formation&&!office)formation.operations.push(continuity.connections+' generated bridges have rounded edges (radius 20% of bridge depth); '+retainedFillets.length+' intersection fillets verified on the connected core.');
  if(typology==='vertical-void-lobby'&&a){
   const box=a.boundingBox(),span=Math.max(...box.max.map((value,axis)=>value-box.min[axis]),1e-8),factor=20/span,center:[number,number,number]=[(box.min[0]+box.max[0])/2,(box.min[1]+box.max[1])/2,(box.min[2]+box.max[2])/2];
   const fit=(solid:InstanceType<typeof Manifold>|null)=>{
    if(!solid)return solid;
    const moved=solid.translate([-center[0],-center[1],-center[2]]),scaled=moved.scale(factor),placed=scaled.translate(center);
    if(moved!==solid)moved.delete();if(scaled!==moved)scaled.delete();
    return own(placed);
   };
   a=fit(a);source=fit(source);bridges=fit(bridges);floors=fit(floors);
   for(let i=0;i<letters.length;i++)letters[i]=fit(letters[i])!;
   for(let i=0;i<intersectionSolids.length;i++)intersectionSolids[i]=fit(intersectionSolids[i])!;
   if(protectedOpening)protectedOpening=fit(protectedOpening);
   for(const placement of arranged){placement.x=center[0]+(placement.x-center[0])*factor;placement.y=center[1]+(placement.y-center[1])*factor;placement.z=center[2]+(placement.z-center[2])*factor;placement.scale*=factor;if(placement.letterRules)placement.letterRules={...placement.letterRules,supportZ:center[2]+(placement.letterRules.supportZ-center[2])*factor,strokeWidth:placement.letterRules.strokeWidth*factor};}
   if(bridgeMesh.links)for(const link of bridgeMesh.links){link.start=link.start.map((value,axis)=>center[axis]+(value-center[axis])*factor);link.end=link.end.map((value,axis)=>center[axis]+(value-center[axis])*factor);if(link.gapFeet)link.gapFeet*=factor;}
   enclosure=own(Manifold.cube([20,20,20],true).translate(center));
   if(formation)formation.operations.push(`Letters and bridge connections keep the vertical-void arrangement, then scale uniformly by ${factor.toFixed(3)} so the longest side of the connected form is 20 ft inside the 20 × 20 × 20 ft cube.`);
  }
  let b:InstanceType<typeof Manifold>|null=null;
  if(enclosure&&source){
   const bounds=enclosure.boundingBox(),height=bounds.max[2]-bounds.min[2],overrun=Math.max(height*1e-5,1e-6);
   const order=arranged.map((_,i)=>i).sort((a,b)=>arranged[a].z-arranged[b].z||a-b);
   const cutters=[source];
   // Extend only a thin end section of the outermost letters, keeping all other cavities intact.
   for(const top of [false,true]){
    const letter=letters[order[top?order.length-1:0]],box=letter.boundingBox();
    const inset=Math.max((box.max[2]-box.min[2])*1e-4,overrun);
    const sectionZ=top?box.max[2]-inset:box.min[2]+inset;
    const start=top?sectionZ:bounds.min[2]-overrun;
    const end=top?bounds.max[2]+overrun:sectionZ;
    const section=letter.slice(sectionZ);
    try{if(end>start&&!section.isEmpty()){const extension=own(section.extrude(end-start));cutters.push(own(extension.translate([0,0,start])));}}finally{section.delete();}
   }
   // Any letter touching any cube face opens that face. Slice in a temporary
   // coordinate frame whose Z axis is the face normal, then restore the cutter.
   for(const letter of letters){
    const box=letter.boundingBox();
    for(const axis of [0,1,2])for(const upper of [false,true]){
     const face=upper?bounds.max[axis]:bounds.min[axis],edge=upper?box.max[axis]:box.min[axis];
     if(Math.abs(edge-face)>overrun*2)continue;
     const rotation:[number,number,number]=axis===0?[0,-90,0]:axis===1?[90,0,0]:[0,0,0];
     const oriented=axis===2?letter:own(letter.rotate(rotation));
     const inset=Math.min((box.max[axis]-box.min[axis])*.01,overrun*2);
     const sectionZ=face+(upper?-inset:inset),start=upper?sectionZ:face-overrun,end=upper?face+overrun:sectionZ;
     const section=oriented.slice(sectionZ);
     try{if(!section.isEmpty()){
      const extrusion=own(section.extrude(end-start));const placed=own(extrusion.translate([0,0,start]));
      cutters.push(axis===2?placed:own(placed.rotate([-rotation[0],-rotation[1],-rotation[2]])));
     }}finally{section.delete();}
    }
   }
   const cutter=union(cutters);b=cutter?own(enclosure.subtract(cutter)):null;
  }
  await progress(94,"Combining variations");
  // Preserve exact shared boundaries when combining enclosed profiles with their void.
  const c=!b||b.isEmpty()?a:union([a,b].filter((x):x is InstanceType<typeof Manifold>=>Boolean(x)));

  await progress(98,"Preparing preview meshes");
  const limits=angleLimits??{xMin:-180,xMax:180,yMin:-180,yMax:180,zMin:0,zMax:360};
  const yawOf=(angle:number)=>((angle%360)+360)%360;
  const rotationsPass=arranged.every(p=>p.rx>=limits.xMin-1e-6&&p.rx<=limits.xMax+1e-6&&p.ry>=limits.yMin-1e-6&&p.ry<=limits.yMax+1e-6&&yawOf(p.rz)>=limits.zMin-1e-6&&yawOf(p.rz)<=limits.zMax+1e-6);
  const identityPass=arranged.every((p,i)=>p.letter===placements[i].letter&&p.scaleX===placements[i].scaleX&&p.scaleY===placements[i].scaleY&&(p.scaleZ??1)===(placements[i].scaleZ??1));
  const eligibleBoundaries=arranged.filter(p=>!['wall','void'].includes(gatheringOperations.boundaryRoles[p.letter])).length;
  const boundariesPass=Boolean(terraces&&eligibleBoundaries>0&&terraces.sourceIndices.length===eligibleBoundaries);
  const floorsLevel=!terraces||terraces.measurements.every(m=>{const dx=m.max[0]-m.min[0],dy=m.max[1]-m.min[1],dz=m.max[2]-m.min[2];return dz<=Math.max(.05,Math.min(dx,dy)*.35);});
  const connected=Boolean(a&&continuous(a));
  const networkPass=!gatheringOperations.requireConnectivity||(continuity.connections===Math.max(0,letters.length-1)&&connected);
  const gatheringValidation:ConnectionWorkflow['gatheringValidation']=gathering?[
   {label:'Rotation limits',status:rotationsPass?'pass':'unverified',detail:rotationsPass?'Every generated yaw, X tilt, and Y tilt is inside the selected limits.':'One or more generated rotations fall outside the selected limits.'},
   {label:'Source identity and transformations',status:identityPass?'pass':'unverified',detail:identityPass?'Each source index keeps its L, U, or V identity and original axis proportions. Original and generated transforms are both stored.':'A generated letter no longer matches its source identity or axis proportions.'},
   {label:'Letter-derived boundaries',status:boundariesPass?'pass':'unverified',detail:terraces?`${terraces.sourceIndices.length} of ${eligibleBoundaries} floor, edge, or enclosure letters produced a plate that intersects that letter. Wall and void roles stay boundary designations.`:'No floor plate geometry was produced.'},
   {label:'Floor usability and slope',status:terraces&&floorsLevel?'pass':'unverified',detail:terraces&&floorsLevel?'Generated floor plates are horizontal extrusions. Connector slope is not treated as an occupiable ramp.':terraces?'A generated plate is too tall to count as a level floor.':'No floor plates were generated to check.'},
   {label:'Protected openings',status:protectedOpening?'pass':'unverified',detail:protectedOpening?'The identified opening was checked against the final generated solid.':'No protected opening was specified or detected.'},
   {label:'Circulation network',status:networkPass?'pass':'unverified',detail:gatheringOperations.requireConnectivity?`${continuity.connections} adjacent connectors link ${letters.length} letters into one solid.`:'Adjacent connectivity was not required for this run.'},
   {label:'Alcove clearance',status:terraces?.clearanceSatisfied?'pass':'unverified',detail:terraces?`${terraces.recesses} alcoves were cut from the plates. ${terraces.skippedClearance} were omitted so the remaining bay stays at least ${gatheringOperations.minimumClearance} ft clear.`:'No alcove geometry was produced.'},
   {label:'Mesh connectivity',status:connected?'pass':'unverified',detail:connected?'The final solid is one manifold component and contains every source letter.':'The final solid is disconnected or does not contain every source letter.'},
   {label:'Source correspondence',status:identityPass?'pass':'unverified',detail:'Boundary roles, rotations, and source indices record which L, U, or V form each architectural piece came from.'},
   {label:'Selected alternative',status:'unverified',detail:'The workflow stores the source snapshot sent from Letter-Driven Panel A. The validation table checks that snapshot against the panel.'},
  ]:undefined;
  return {boundaryDesignations:gathering?arranged.map((p,i)=>({sourceIndex:i,letter:p.letter,role:gatheringOperations.boundaryRoles[p.letter],rotation:[p.rx,p.ry,p.rz] as [number,number,number]})):undefined,gatheringOperations:gathering?gatheringOperations:undefined,gatheringValidation,officeValidation:arrangement?.officePlan?.checks,protectedVoid:protectedOpening?describe(protectedOpening):undefined,floors:describe(floors),enclosure:describe(enclosure),source:describe(originalSource,included),arrangedSource:describe(source,included),arrangement:arrangement?{originalPlacements:placements,placements:arrangement.placements,sequence:arrangement.sequence,preservedPairs:arrangement.preservedPairs,overlapFractions:arrangement.overlapFractions,riseFractions:arrangement.riseFractions}:undefined,intersections:describe(union(intersectionSolids)),bridges:describe(bridges),variants:{letters:describe(a,included),voids:describe(b),combined:describe(c,included)},links:bridgeMesh.links??[],settings,formation:formation?{operations:formation.operations,supported:formation.supported}:undefined};
 }finally{owned.forEach(s=>s.delete());}
}













