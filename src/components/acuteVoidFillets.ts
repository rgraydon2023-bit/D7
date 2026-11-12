import * as THREE from 'three';
export type AcuteVoidCorner={origin:THREE.Vector3;axis:THREE.Vector3;u:THREE.Vector3;v:THREE.Vector3;length:number;width:number;angle:number;reach:number};
/** Inspect concave dihedral edges; width is measured at the shorter adjacent face's mouth. */
export function acuteVoidCorners(mesh:{positions:number[];indices:number[]},maximumWidth=2):AcuteVoidCorner[]{
 const vertices:THREE.Vector3[]=[],weld=new Map<string,number>();
 const ids=mesh.indices.map(id=>{const p=new THREE.Vector3().fromArray(mesh.positions,id*3),key=p.toArray().map(v=>v.toFixed(7)).join(':');let n=weld.get(key);if(n===undefined){n=vertices.length;vertices.push(p);weld.set(key,n);}return n;});
 const faces:{ids:number[];normal:THREE.Vector3}[]=[],edges=new Map<string,{a:number;b:number;faces:number[]}>();
 for(let i=0;i<ids.length;i+=3){const tri=ids.slice(i,i+3),[a,b,c]=tri.map(id=>vertices[id]);const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<1e-20)continue;normal.normalize();const index=faces.length;faces.push({ids:tri,normal});for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);let e=edges.get(key);if(!e){e={a,b,faces:[]};edges.set(key,e);}e.faces.push(index);}}
 const parents=faces.map((_,i)=>i),root=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 for(const e of edges.values())if(e.faces.length===2){const [a,b]=e.faces;if(faces[a].normal.dot(faces[b].normal)>1-1e-7)parents[root(b)]=root(a);}
 const groups=new Map<number,Set<number>>();faces.forEach((f,i)=>{const key=root(i),group=groups.get(key)??new Set<number>();for(const id of f.ids)group.add(id);groups.set(key,group);});
 const result:AcuteVoidCorner[]=[];
 for(const e of edges.values()){
  if(e.faces.length!==2)continue;const [a,b]=e.faces.map(id=>faces[id]),origin=vertices[e.a],end=vertices[e.b],axis=end.clone().sub(origin),length=axis.length();if(length<1e-7)continue;axis.divideScalar(length);
  const otherA=vertices[a.ids.find(id=>id!==e.a&&id!==e.b)!],otherB=vertices[b.ids.find(id=>id!==e.a&&id!==e.b)!];
  if(otherB.clone().sub(origin).dot(a.normal)<=1e-7)continue; // convex edges are not void corners
  const direction=(p:THREE.Vector3)=>{const d=p.clone().sub(origin);return d.addScaledVector(axis,-d.dot(axis)).normalize();};
  const u=direction(otherA),sideB=direction(otherB),angle=Math.acos(THREE.MathUtils.clamp(u.dot(sideB),-1,1));
  if(angle<=1e-4||angle>=Math.PI/2-1e-6)continue;
  const extent=(face:number,dir:THREE.Vector3)=>{let value=0;for(const id of groups.get(root(face))!)value=Math.max(value,vertices[id].clone().sub(origin).dot(dir));return value;};
  const reach=Math.min(extent(e.faces[0],u),extent(e.faces[1],sideB)),width=2*reach*Math.sin(angle/2);
  if(width<=1e-7||width>=maximumWidth)continue;
  const v=sideB.clone().addScaledVector(u,-Math.cos(angle)).normalize();
  result.push({origin:origin.clone(),axis,u,v,length,width,angle,reach});
 }
 return result;
}
/** Circular tangent arc fills only the acute tip, leaving at least 80% of its depth open. */
export function acuteFilletProfile(corner:AcuteVoidCorner,desiredRadius:number){
 const {angle,reach,width}=corner;
 const radius=Math.min(desiredRadius,width*.1,reach*.2*Math.tan(angle/2));
 const tangent=radius/Math.tan(angle/2),center=new THREE.Vector2(tangent,radius);
 const points:[number,number][]=[[0,0],[tangent,0]];
 const sweep=Math.PI-angle,segments=Math.max(8,Math.ceil(sweep/(Math.PI/24)));
 for(let i=1;i<=segments;i++){const a=-Math.PI/2-sweep*i/segments;points.push([center.x+radius*Math.cos(a),center.y+radius*Math.sin(a)]);}
 return {points,radius};
}
