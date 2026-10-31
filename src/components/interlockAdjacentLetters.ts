import * as THREE from 'three';
import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
export const adjacentLetterPairs=(sequence:number[])=>sequence.slice(1).map((id,k)=>[sequence[k],id]);
export const letterPairKey=(a:number,b:number)=>Math.min(a,b)+':'+Math.max(a,b);
function anchor(solid:Manifold){
 const m=solid.getMesh(),box=solid.boundingBox(),depth=Math.min(...box.max.map((v,k)=>v-box.min[k]));
 let best=0,point=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<m.triVerts.length;i+=3){const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromArray(m.vertProperties,m.triVerts[i+k]*m.numProp));const n=b.clone().sub(a).cross(c.clone().sub(a));if(n.lengthSq()>best){best=n.lengthSq();point=a.add(b).add(c).divideScalar(3);normal=n.normalize();}}
 return point.addScaledVector(normal,-depth*.05);
}
/** Keep orientations and sizes; close gaps only between consecutive layout members. */
export function interlockAdjacentLetters(input:IntersectionPlacement[],sequence:number[],makeSolid:(p:IntersectionPlacement)=>Manifold,verticalStack=false){
 const result=input.map(p=>({...p,letterRules:p.letterRules?{...p.letterRules}:undefined})),solids=result.map(makeSolid);
 const enough=(a:Manifold,b:Manifold)=>{const overlap=a.intersect(b);try{return overlap.volume()>Math.min(a.volume(),b.volume())*1e-5;}finally{overlap.delete();}};
 for(const [a,b] of adjacentLetterPairs(sequence)){
  if(verticalStack){
   const start=result[b],box=solids[a].boundingBox(),span=Math.max(...box.max.map((v,k)=>v-box.min[k]));
   const minimumRise=span*1e-4,desiredRise=Math.max(minimumRise,start.z-input[a].z);let accepted=false;
   for(let step=0;step<=128;step++){
    const z=result[a].z+desiredRise+(minimumRise-desiredRise)*step/128;
    const candidate={...start,z,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+z-start.z}:undefined};
    const solid=makeSolid(candidate);if(enough(solids[a],solid)){result[b]=candidate;solids[b]=solid;accepted=true;break;}
   }
   if(!accepted){
    const z=result[a].z+desiredRise;
    result[b]={...start,z,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+z-start.z}:undefined};
    solids[b]=makeSolid(result[b]);
   }
   continue;
  }
  if(enough(solids[a],solids[b]))continue;
  const start=result[b],delta=anchor(solids[a]).sub(anchor(solids[b]));let accepted=false;
  for(let step=1;step<=64;step++){
   const t=step/64,p={...start,x:start.x+delta.x*t,y:start.y+delta.y*t,z:start.z+delta.z*t,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+delta.z*t}:undefined};
   const s=makeSolid(p);if(enough(solids[a],s)){result[b]=p;solids[b]=s;accepted=true;break;}
  }
  if(!accepted)throw new Error('Adjacent letters could not be interlocked without changing their orientations.');
 }
 if(!verticalStack)for(const [a,b] of adjacentLetterPairs(sequence))if(!enough(solids[a],solids[b]))throw new Error('An adjacent letter intersection was lost.');
 return result;
}
