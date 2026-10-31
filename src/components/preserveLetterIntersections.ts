import * as THREE from "three";
import type { Manifold } from "manifold-3d/manifold";
import { placementMatrix, type IntersectionPlacement } from "./architecturalConnections";

export type OriginalJoin = { a:number; b:number; volume:number };
export function originalLetterJoins(solids:Manifold[]):OriginalJoin[] {
 const joins:OriginalJoin[]=[];
 for(let a=0;a<solids.length;a++)for(let b=a+1;b<solids.length;b++){
  const aa=solids[a].boundingBox(),bb=solids[b].boundingBox();
  if(aa.min.some((v,i)=>v>=bb.max[i]||aa.max[i]<=bb.min[i]))continue;
  const intersection=solids[a].intersect(solids[b]);
  try {const volume=intersection.volume();if(volume>1e-10*Math.min(solids[a].volume(),solids[b].volume()))joins.push({a,b,volume});}finally{intersection.delete();}
 }
 return joins;
}
/** Reposition rigid letters; original orientations, dimensions and extrusion are immutable. */
export function preserveLetterIntersections(source:IntersectionPlacement[],targets:IntersectionPlacement[],_joins:OriginalJoin[],makeSolid:(p:IntersectionPlacement)=>Manifold) {
 const result=connectLetterGroups(source,makeSolid).placements;
 if(!result.length)return result;
 const center=result.reduce((v,p)=>v.add(new THREE.Vector3(p.x,p.y,p.z)),new THREE.Vector3()).divideScalar(result.length);
 const destination=targets.reduce((v,p)=>v.add(new THREE.Vector3(p.x,p.y,p.z)),new THREE.Vector3()).divideScalar(targets.length);
 const delta=destination.sub(center);for(const p of result){p.x+=delta.x;p.y+=delta.y;p.z+=delta.z;}
 const solids=result.map(makeSolid),required=originalLetterJoins(solids);
 const keeps=(id:number,solid:Manifold)=>required.filter(j=>j.a===id||j.b===id).every(j=>{const overlap=solid.intersect(solids[j.a===id?j.b:j.a]);try{return overlap.volume()>=j.volume*.15;}finally{overlap.delete();}});
 for(let pass=0;pass<4;pass++)for(let i=0;i<result.length;i++){
  const start=result[i],target=targets[i];
  for(let fraction=1;fraction>=1/1024;fraction/=2){
   const trial={...start,x:THREE.MathUtils.lerp(start.x,target.x,fraction),y:THREE.MathUtils.lerp(start.y,target.y,fraction),z:THREE.MathUtils.lerp(start.z,target.z,fraction)};
   const solid=makeSolid(trial);if(keeps(i,solid)){result[i]=trial;solids[i]=solid;break;}
  }
 }
 for(const j of required){const overlap=solids[j.a].intersect(solids[j.b]);try{if(overlap.volume()<j.volume*.149)throw new Error('Unable to retain letter interlocking.');}finally{overlap.delete();}}
 return result;
}

/** Translate whole disconnected clusters to shared interior anchors, preserving every existing join. */
export function connectLetterGroups(input:IntersectionPlacement[],makeSolid:(p:IntersectionPlacement)=>Manifold) {
 const placements=input.map(p=>({...p,letterRules:p.letterRules?{...p.letterRules}:undefined}));
 const solids=placements.map(makeSolid),joins=originalLetterJoins(solids),neighbors=placements.map(()=>[] as number[]);
 for(const {a,b} of joins){neighbors[a].push(b);neighbors[b].push(a);}
 const groups:number[][]=[],seen=new Set<number>();
 for(let i=0;i<placements.length;i++){if(seen.has(i))continue;const group=[i];seen.add(i);for(let k=0;k<group.length;k++)for(const j of neighbors[group[k]])if(!seen.has(j)){seen.add(j);group.push(j);}groups.push(group);}
 const addedPairs:number[][]=[];if(groups.length<2)return {placements,addedPairs};
 const inside=(p:IntersectionPlacement)=>{
  const v=p.letter==='L'?new THREE.Vector3(-.27,-.3,0):p.letter==='U'?new THREE.Vector3(-.32,0,0):new THREE.Vector3(.3,.3,0);
  if(p.letterRules){if(p.letter==='L')v.z+=Math.max(0,v.x+.12)*Math.tan(THREE.MathUtils.degToRad(p.letterRules.footTilt));if(p.letter==='V')v.z+=Math.max(0,Math.abs(v.x)-.15)*Math.tan(THREE.MathUtils.degToRad(p.letterRules.armRoll));}
  return v.applyMatrix4(placementMatrix(p));
 };
 const attached=[...groups[0]];
 for(const group of groups.slice(1)){
  let a=attached[0],b=group[0],distance=Infinity;
  for(const i of attached)for(const j of group){const d=inside(placements[i]).distanceToSquared(inside(placements[j]));if(d<distance){distance=d;a=i;b=j;}}
  const delta=inside(placements[a]).sub(inside(placements[b]));
  for(const i of group){placements[i].x+=delta.x;placements[i].y+=delta.y;placements[i].z+=delta.z;if(placements[i].letterRules)placements[i].letterRules!.supportZ+=delta.z;solids[i]=makeSolid(placements[i]);}
  const intersection=solids[a].intersect(solids[b]);try{if(intersection.volume()<=1e-10*Math.min(solids[a].volume(),solids[b].volume()))throw new Error('Unable to connect all selected letters without losing an existing intersection.');}finally{intersection.delete();}
  addedPairs.push([a,b]);attached.push(...group);
 }
 // The connected graph is checked from solid intersections, not bridge proximity.
 const finalJoins=originalLetterJoins(solids),reached=new Set<number>([0]);
 let changed=true;while(changed){changed=false;for(const {a,b} of finalJoins)if(reached.has(a)!==reached.has(b)){reached.add(a);reached.add(b);changed=true;}}
 if(reached.size!==placements.length)throw new Error('The selected letters did not form one connected composition.');
 return {placements,addedPairs};
}
