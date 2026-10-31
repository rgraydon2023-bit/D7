import * as THREE from 'three';
type Mesh = { positions:number[]; indices:number[] };

/** Smallest axis-aligned cube containing the geometry, centered on its bounds. */
export function modelCube(mesh:Mesh):THREE.Box3 {
 const box=new THREE.Box3();
 for(const index of mesh.indices)box.expandByPoint(new THREE.Vector3().fromArray(mesh.positions,index*3));
 if(box.isEmpty())return new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
 const size=box.getSize(new THREE.Vector3()),half=Math.max(size.x,size.y,size.z,.001)/2,center=box.getCenter(new THREE.Vector3());
 return new THREE.Box3(center.clone().addScalar(-half),center.clone().addScalar(half));
}

export function architecturalElements(mesh:Mesh) {
 const cube=modelCube(mesh),mid=(cube.min.z+cube.max.z)/2;
 const floors:Mesh={positions:[],indices:[]},walls:Mesh={positions:[],indices:[]},ceilings:Mesh={positions:[],indices:[]};
 const append=(out:Mesh,polygon:THREE.Vector3[])=>{
  if(polygon.length<3)return;
  const offset=out.positions.length/3;
  for(const p of polygon)out.positions.push(p.x,p.y,p.z);
  for(let i=1;i<polygon.length-1;i++)out.indices.push(offset,offset+i,offset+i+1);
 };
 const clip=(triangle:THREE.Vector3[],lower:boolean)=>{
  const polygon:THREE.Vector3[]=[];
  for(let i=0;i<3;i++){
   const a=triangle[i],b=triangle[(i+1)%3],insideA=lower?a.z<=mid:a.z>mid,insideB=lower?b.z<=mid:b.z>mid;
   if(insideA)polygon.push(a);
   if(insideA!==insideB)polygon.push(a.clone().lerp(b,(mid-a.z)/(b.z-a.z)));
  }
  return polygon;
 };
 let sloped=0;
 // A 15-degree tolerance accommodates triangulation and gently tilted surfaces.
 const threshold=Math.cos(Math.PI/12);
 for(let i=0;i<mesh.indices.length;i+=3){
  const triangle=mesh.indices.slice(i,i+3).map(id=>new THREE.Vector3().fromArray(mesh.positions,id*3));
  const normal=triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
  if(normal.lengthSq()<1e-20)continue;normal.normalize();
  if(Math.abs(normal.z)>=threshold){append(floors,clip(triangle,true));append(ceilings,clip(triangle,false));}
  else if(Math.max(Math.abs(normal.x),Math.abs(normal.y))>=threshold)append(walls,triangle);
  else sloped++;
 }
 return {floors,walls,ceilings,cube,sloped};
}
