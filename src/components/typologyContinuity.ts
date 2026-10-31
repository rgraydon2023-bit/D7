import { connectionFillet } from './connectionFillet';
import * as THREE from 'three';
import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d/manifold';
import { originalLetterJoins } from './preserveLetterIntersections';
import { typologyLayout } from './typologyLetterArrangement';

function interiorAnchor(solid:Manifold) {
 const mesh=solid.getMesh(),stride=mesh.numProp;let largest=0,point=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<mesh.triVerts.length;i+=3){const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromArray(mesh.vertProperties,mesh.triVerts[i+k]*stride));const n=b.clone().sub(a).cross(c.clone().sub(a));if(n.lengthSq()>largest){largest=n.lengthSq();point=a.add(b).add(c).divideScalar(3);normal=n.normalize();}}
 const bounds=solid.boundingBox(),epsilon=Math.max(1e-8,Math.min(...bounds.max.map((v,i)=>v-bounds.min[i]))*1e-4);
 return point.addScaledVector(normal,-epsilon);
}

/** A spanning set of solid connections guarantees continuity regardless of optional bridge budgets. */
export function buildTypologyContinuity(wasm:ManifoldToplevel,letters:Manifold[],sequence:number[],typology:string,own:(solid:Manifold)=>Manifold,filletPercent=20,minimumClearance=0,requireAdjacent=true,protectedCircle?:{center:[number,number];radius:number}) {
 const {Manifold}=wasm,anchors=letters.map(interiorAnchor),parents=letters.map((_,i)=>i),pieces:Manifold[]=[],floors:Manifold[]=[];
 const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]));
 const join=(a:number,b:number)=>{parents[root(a)]=root(b);};
 for(const pair of originalLetterJoins(letters))join(pair.a,pair.b);
 const beam=(a:THREE.Vector3,b:THREE.Vector3,width:number,depth:number)=>{
  const delta=b.clone().sub(a),length=delta.length(),x=length>1e-10?delta.divideScalar(length):new THREE.Vector3(1,0,0);
  const y=new THREE.Vector3().crossVectors(Math.abs(x.z)>.99?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1),x).normalize(),z=new THREE.Vector3().crossVectors(x,y),mid=a.clone().add(b).multiplyScalar(.5);
  const transform:Mat4=[x.x,x.y,x.z,0,y.x,y.y,y.z,0,z.x,z.y,z.z,0,mid.x,mid.y,mid.z,1];
  const radius=depth*.2;
  const core=own(Manifold.cube([length+2*depth-2*radius,width-2*radius,depth-2*radius],true));
  const ball=own(Manifold.sphere(radius,16));
  const rounded=own(core.minkowskiSum(ball));
  return own(rounded.transform(transform));
 };
 // Route a connector around the protected circular opening when its direct path crosses it.
 const route=(start:THREE.Vector3,end:THREE.Vector3,width:number,depth:number)=>{
  if(!protectedCircle)return [beam(start,end,width,depth)];
  const [cx,cy]=protectedCircle.center,dx=end.x-start.x,dy=end.y-start.y,den=dx*dx+dy*dy,t=den?THREE.MathUtils.clamp(((cx-start.x)*dx+(cy-start.y)*dy)/den,0,1):0;
  const nearest=Math.hypot(start.x+t*dx-cx,start.y+t*dy-cy),safe=protectedCircle.radius+width+depth;
  if(nearest>=safe)return [beam(start,end,width,depth)];
  const a=Math.atan2(start.y-cy,start.x-cx),b=Math.atan2(end.y-cy,end.x-cx),sweep=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI,steps=Math.max(1,Math.ceil(Math.abs(sweep)/(Math.PI/12))),points=[start];
  for(let i=0;i<=steps;i++){const fraction=(i+1)/(steps+2),angle=a+sweep*i/steps;points.push(new THREE.Vector3(cx+safe*Math.cos(angle),cy+safe*Math.sin(angle),start.z+(end.z-start.z)*fraction));}
  points.push(end);return points.slice(1).map((p,index)=>beam(points[index],p,width,depth));
 };
 let connections=0;
 const connect=(i:number,j:number,floor:boolean)=>{
  const a=anchors[i],b=anchors[j],bounds=[letters[i].boundingBox(),letters[j].boundingBox()];
  const shortest=Math.min(...bounds.flatMap(box=>box.max.map((v,k)=>v-box.min[k]))),depth=Math.max(shortest*.2,1e-5);
  const width=Math.max(minimumClearance,depth*2,Math.min(...bounds.map(box=>Math.max(box.max[0]-box.min[0],box.max[1]-box.min[1])))*.18);
  const parts:Manifold[]=[];
  if(floor){const level=(a.z+b.z)/2,aa=new THREE.Vector3(a.x,a.y,level),bb=new THREE.Vector3(b.x,b.y,level);const plates=route(aa,bb,width,depth);floors.push(...plates);parts.push(...plates,beam(a,aa,depth*2,depth),beam(bb,b,depth*2,depth));}
  else parts.push(...route(a,b,protectedCircle?width:depth*2,depth));
  const radius=depth*Math.max(.01,Math.min(50,filletPercent))/100;
  parts.push(connectionFillet(wasm,a.toArray() as [number,number,number],radius,own),connectionFillet(wasm,b.toArray() as [number,number,number],radius,own));
  const connection=own(Manifold.union(parts));
  for(const id of [i,j]){const intersection=own(connection.intersect(letters[id]));if(intersection.volume()<=letters[id].volume()*1e-10)throw new Error('A required continuity bridge did not intersect its source element.');}
  pieces.push(connection);connections++;join(i,j);
 };
 // Every adjacent pair receives a rounded solid bridge, even if already interlocked.
 for(let k=1;k<sequence.length;k++){const a=sequence[k-1],b=sequence[k];if(requireAdjacent||root(a)!==root(b))connect(a,b,typologyLayout(typology).axis||typologyLayout(typology).topographic);}
 return {solid:pieces.length?own(Manifold.union(pieces)):null,floors:floors.length?own(Manifold.union(floors)):null,connections};
}
