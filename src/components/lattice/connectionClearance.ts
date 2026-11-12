import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { placementWorldZ } from "./types";
import { transitionMeshes, transitionSections } from "./transitionGeometry";

type Triangle = [Vec3,Vec3,Vec3];
type Bounds = {min:Vec3;max:Vec3};
type Node = Bounds & {left?:Node;right?:Node;triangles?:Triangle[];closed?:boolean};
export type ConnectorSurface = {positions:Float32Array;indices:number[];portPair?:PortPair};
const cache=new WeakMap<object,Node>();
const sourceClearanceCache=new WeakMap<object,Map<string,boolean>>();
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function bounds(triangles:Triangle[]):Bounds {
  const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
  for(const tri of triangles) for(const p of tri) for(let i=0;i<3;i++) {min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  return {min,max};
}
function build(triangles:Triangle[]):Node {
  const box=bounds(triangles);
  if(triangles.length<=12) return {...box,triangles};
  const spans=box.max.map((v,i)=>v-box.min[i]),axis=spans.indexOf(Math.max(...spans));
  triangles.sort((a,b)=>a.reduce((s,p)=>s+p[axis],0)-b.reduce((s,p)=>s+p[axis],0));
  const mid=Math.floor(triangles.length/2);
  return {...box,left:build(triangles.slice(0,mid)),right:build(triangles.slice(mid))};
}
function trianglesOf(surface:ConnectorSurface):Triangle[] {
  const out:Triangle[]=[];
  for(let i=0;i<surface.indices.length;i+=3) out.push(surface.indices.slice(i,i+3).map(index=>Array.from(surface.positions.slice(index*3,index*3+3)) as Vec3) as Triangle);
  return out;
}
function overlaps(a:Bounds,b:Bounds) {return a.min.every((v,i)=>v<=b.max[i]+1e-6&&a.max[i]>=b.min[i]-1e-6);}
function segmentHit(a:Vec3,b:Vec3,tri:Triangle):Vec3|null {
  const dir=sub(b,a),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(dir,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-8) return null;
  const s=sub(a,tri[0]),u=dot(s,h)/det;
  if(u< -1e-6||u>1+1e-6) return null;
  const q=cross(s,e1),v=dot(dir,q)/det;
  if(v< -1e-6||u+v>1+1e-6) return null;
  const t=dot(e2,q)/det;
  return t>=-1e-6&&t<=1+1e-6?a.map((x,i)=>x+dir[i]*t) as Vec3:null;
}
function pointInside(p:Vec3,tri:Triangle) {
  const a=sub(tri[1],tri[0]),b=sub(tri[2],tri[0]),v=sub(p,tri[0]),n=cross(a,b),nn=dot(n,n);
  if(nn<1e-12||Math.abs(dot(v,n))>1e-5*Math.sqrt(nn)) return false;
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),av=dot(a,v),bv=dot(b,v),d=aa*bb-ab*ab;
  const u=(bb*av-ab*bv)/d,w=(aa*bv-ab*av)/d;
  return u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6;
}
function intersects(a:Triangle,b:Triangle,allowed:(p:Vec3)=>boolean) {
  for(const [first,second] of [[a,b],[b,a]]) {
    for(let i=0;i<3;i++) {const hit=segmentHit(first[i],first[(i+1)%3],second);if(hit&&!allowed(hit))return true;}
    for(const p of first) if(pointInside(p,second)&&!allowed(p)) return true;
  }
  const normal=cross(sub(a[1],a[0]),sub(a[2],a[0]));
  if(Math.hypot(...normal)>1e-8&&b.every(p=>Math.abs(dot(sub(p,a[0]),normal))<1e-6*Math.hypot(...normal))) {
    const drop=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=[0,1,2].filter(i=>i!==drop);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++) {
      const p=a[i],q=b[j],r=sub(a[(i+1)%3],p),s=sub(b[(j+1)%3],q),v=sub(q,p);
      const det=r[axes[0]]*s[axes[1]]-r[axes[1]]*s[axes[0]];
      if(Math.abs(det)<1e-10)continue;
      const t=(v[axes[0]]*s[axes[1]]-v[axes[1]]*s[axes[0]])/det,u=(v[axes[0]]*r[axes[1]]-v[axes[1]]*r[axes[0]])/det;
      if(t>=0&&t<=1&&u>=0&&u<=1&&!allowed(p.map((x,k)=>x+r[k]*t) as Vec3))return true;
    }
  }
  return false;
}
function closedSurface(triangles:Triangle[]) {
  const edges=new Map<string,number>(),key=(p:Vec3)=>p.map(v=>v.toFixed(5)).join(',');
  for(const tri of triangles)for(let i=0;i<3;i++){const edge=[key(tri[i]),key(tri[(i+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  return edges.size>0&&[...edges.values()].every(n=>n===2);
}
function collides(tri:Triangle,node:Node,allowed:(p:Vec3)=>boolean,box=bounds([tri])):boolean {
  if(!overlaps(box,node)) return false;
  return node.triangles?node.triangles.some(other=>intersects(tri,other,allowed)):
    collides(tri,node.left!,allowed,box)||collides(tri,node.right!,allowed,box);
}
function localPoint(p:Vec3,tile:PlacedTile,model:TileModel):Vec3 {
  const variant=model.variants[tile.variant],angle=-variant.rotation*Math.PI/180;
  const x=p[0]-tile.ix*20,y=p[1]-tile.iy*20;
  const rx=x*Math.cos(angle)-y*Math.sin(angle),ry=x*Math.sin(angle)+y*Math.cos(angle);
  return [variant.mirror==="x"?-rx:rx,variant.mirror==="y"?-ry:ry,p[2]-placementWorldZ(tile)];
}
/** Exact triangle surface intersection; only a 0.04' seam at the intended edge is allowed. */
export function transitionSurfaceClear(pair:PortPair,tiles:PlacedTile[],models:TileModel[],existing:ConnectorSurface[]=[]):boolean {
  const meshes=transitionMeshes(pair),tris=meshes.flatMap(trianglesOf);
  for(const tile of tiles) {
    const model=models.find(m=>m.id===tile.id||m.id===tile.id.split("::")[0]);
    if(!model?.connectionSurface) continue; // Voxel clearance remains mandatory for older/session models.
    const surface=model.connectionSurface;
    let tree=cache.get(surface);
    if(!tree) {const sourceTriangles=trianglesOf({positions:surface.positions,indices:surface.triangles});const closed=closedSurface(sourceTriangles);tree=build(sourceTriangles);tree.closed=closed;cache.set(surface,tree);}
    let checks=sourceClearanceCache.get(surface);
    if(!checks){checks=new Map();sourceClearanceCache.set(surface,checks);}
    const canonical=(p:Vec3)=>p.map(v=>Number(v.toFixed(9))) as Vec3;
    const localDirection=(d:Vec3|undefined)=>d?canonical(sub(localPoint(pair.from.map((v,i)=>v+d[i]) as Vec3,tile,model),localPoint(pair.from,tile,model))):undefined;
    const signature=JSON.stringify({role:tile.id===pair.tileA?'A':tile.id===pair.tileB?'B':'obstacle',from:canonical(localPoint(pair.from,tile,model)),to:canonical(localPoint(pair.to,tile,model)),path:pair.path?.map(p=>canonical(localPoint(p,tile,model))),startDirection:localDirection(pair.startDirection),endDirection:localDirection(pair.endDirection),startWidth:pair.startWidth,endWidth:pair.endWidth,width:pair.usableWidth,startProfile:pair.startProfile?.map(p=>canonical(localPoint(p,tile,model))),endProfile:pair.endProfile?.map(p=>canonical(localPoint(p,tile,model))),class:pair.connectionClass,angle:pair.angle,lateralOffset:pair.lateralOffset,rise:pair.rise,plan:pair.plan});
    const previous=checks.get(signature);
    if(previous!==undefined){if(!previous)return false;continue;}
    const clearSource=()=>{
    const endpoint=tile.id===pair.tileA?pair.from:tile.id===pair.tileB?pair.to:null;
    const direction=tile.id===pair.tileA?pair.startDirection:pair.endDirection;
    const localEnd=endpoint?localPoint(endpoint,tile,model):null;
    const localDir=endpoint&&direction?sub(localPoint(endpoint.map((v,i)=>v+direction[i]) as Vec3,tile,model),localEnd!):null;
    const allowed=(p:Vec3)=>!!localEnd&&!!localDir&&Math.abs(dot(sub(p,localEnd),localDir))<=.04&&Math.abs(p[2]-localEnd[2])<=.26;
    for(const tri of tris) if(collides(tri.map(p=>localPoint(p,tile,model)) as Triangle,tree,allowed))return false;
    // Standing clearance over the walking ribbon, including walls/roof above it.
    for(const section of transitionSections(pair)) for(const side of [-.5,0,.5]) {
      const p=section.center.map((v,i)=>v+section.side[i]*section.width*side) as Vec3;
      const a=localPoint([p[0],p[1],p[2]+.05],tile,model),b=localPoint([p[0],p[1],p[2]+6.5],tile,model);
      const probeBounds=bounds([[a,b,b]]);
      const probe=(node:Node):boolean=>overlaps(probeBounds,node)&&(node.triangles?node.triangles.some(t=>!!segmentHit(a,b,t)):probe(node.left!)||probe(node.right!));
      if(probe(tree))return false;
      if(tree.closed) {
        const far:Vec3=[a[0],a[1],tree.max[2]+1],hits:number[]=[],rayBounds=bounds([[a,[a[0],a[1],tree.max[2]+1],[a[0],a[1],tree.max[2]+1]]]);
        const collect=(node:Node)=>{
          if(!overlaps(rayBounds,node))return;
          if(node.triangles)for(const tri of node.triangles){const hit=segmentHit(a,far,tri);if(hit)hits.push(hit[2]);}
          else {collect(node.left!);collect(node.right!);}
        };
        collect(tree);hits.sort((x,y)=>x-y);
        if(hits.filter((z,i)=>i===0||Math.abs(z-hits[i-1])>1e-5).length%2===1)return false;
      }
    }
    return true;
    };
    const clear=clearSource();
    if(checks.size>=2000)checks.delete(checks.keys().next().value!);
    checks.set(signature,clear);
    if(!clear)return false;
  }
  for(const mesh of existing) {
    const tree=build(trianglesOf(mesh));
    const other=mesh.portPair;
    const seamContact=(p:Vec3)=>{
      if(!other)return false;
      for(const tile of [pair.tileA,pair.tileB]) {
        if(tile!==other.tileA&&tile!==other.tileB)continue;
        const a=tile===pair.tileA?pair.from:pair.to,na=tile===pair.tileA?pair.startDirection:pair.endDirection;
        const b=tile===other.tileA?other.from:other.to,nb=tile===other.tileA?other.startDirection:other.endDirection;
        if(na&&nb&&Math.abs(dot(sub(p,a),na))<1e-5&&Math.abs(dot(sub(p,b),nb))<1e-5&&Math.abs(p[2]-a[2])<=.26&&Math.abs(p[2]-b[2])<=.26)return true;
      }
      return false;
    };
    if(tris.some(tri=>collides(tri,tree,seamContact))) return false;
  }
  return true;
}
