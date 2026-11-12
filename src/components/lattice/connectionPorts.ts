import type { ConnectionPort, ImportedObj, TileVariant, Vec3 } from "./types";
import { packCell, unpackCell } from "./types";

/** Conservative geometric labels, not semantic recognition. Extract once in the base frame. */
export function extractConnectionPorts(sourceFormId: string, base: TileVariant, cell: number, samples?: Map<number,{min:Vec3;max:Vec3}>): ConnectionPort[] {
  const floor = new Set(base.floor);
  const occupied = new Set(base.occupied);
  const passage = new Set(base.passage);
  const voids = new Set(base.voidCells);
  const walkable = new Set(base.floor.filter(p => {
    const [x,y,z] = unpackCell(p);
    // Require two proxy cells of clear space above a supporting floor.
    return !occupied.has(packCell(x,y,z+1)) && !occupied.has(packCell(x,y,z+2));
  }));
  if (!walkable.size) return [];
  const xs = [...walkable].map(p => unpackCell(p)[0]).sort((a,b)=>a-b);
  const ys = [...walkable].map(p => unpackCell(p)[1]).sort((a,b)=>a-b);
  const cx = xs[Math.floor(xs.length/2)], cy = ys[Math.floor(ys.length/2)];
  const ports: ConnectionPort[] = [];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const tx = -dy, ty = dx;
    const exposed = new Set<number>();
    for (const p of walkable) {
      const [x,y,z] = unpackCell(p);
      // A terminal needs supporting depth behind it, not a floating isolated sample.
      if (!walkable.has(packCell(x-dx,y-dy,z))) continue;
      let clear = true;
      for (let run=1;run<=2;run++) {
        for (let dz=0;dz<=2;dz++) {
          const next = packCell(x+dx*run,y+dy*run,z+dz);
          if (occupied.has(next) || voids.has(next)) clear=false;
        }
      }
      if (clear) exposed.add(p);
    }
    // Same-normal, same-elevation contiguous runs are a single usable opening.
    while (exposed.size) {
      const first = exposed.values().next().value as number;
      const cluster = [first]; exposed.delete(first);
      for (let i=0;i<cluster.length;i++) {
        const [x,y,z] = unpackCell(cluster[i]);
        for (const sign of [-1,1]) {
          const next = packCell(x+tx*sign,y+ty*sign,z);
          if (exposed.delete(next)) cluster.push(next);
        }
      }
      if (cluster.length<2) continue;
      const coords = cluster.map(unpackCell);
      const x = coords.reduce((s,p)=>s+p[0],0)/coords.length;
      const y = coords.reduce((s,p)=>s+p[1],0)/coords.length;
      const z = coords[0][2];
      let depth = 1;
      for (let run=1;run<=5;run++) {
        if (coords.filter(([px,py,pz])=>floor.has(packCell(px-dx*run,py-dy*run,pz))).length < cluster.length*.75) break;
        depth=run+1;
      }
      const radial = ((x-cx)*dx+(y-cy)*dy)/Math.max(1,Math.hypot(x-cx,y-cy));
      const narrow = cluster.length<=4;
      const projection = radial>.75 && narrow && depth>=3;
      const passageRatio = coords.filter(([px,py,pz])=>passage.has(packCell(px,py,pz+1))).length/coords.length;
      const type = projection ? "BRANCH_END" : narrow && depth>=3 && passageRatio>.5 ? "PASSAGE_END" : cluster.length>=4 ? "PLATFORM_EDGE" : "EXPOSED_WALKABLE_EDGE";
      const confidence = Math.min(.95,.5+Math.min(.15,(depth-1)*.05)+(projection?.2:0)+passageRatio*.1);
      if (confidence<.6) continue;
      const localPosition: Vec3 = [(x+.5+dx*.5)*cell,(y+.5+dy*.5)*cell,(z+.5)*cell];
      let usableWidth = cluster.length*cell;
      const sampled = cluster.flatMap(p=>samples?.has(p)?[samples.get(p)!]:[]);
      if (sampled.length) {
        const min = [0,1,2].map(axis=>Math.min(...sampled.map(b=>b.min[axis])));
        const max = [0,1,2].map(axis=>Math.max(...sampled.map(b=>b.max[axis])));
        localPosition[0] = dx ? dx>0 ? max[0] : min[0] : (min[0]+max[0])/2;
        localPosition[1] = dy ? dy>0 ? max[1] : min[1] : (min[1]+max[1])/2;
        localPosition[2] = max[2];
        usableWidth = dx ? max[1]-min[1] : max[0]-min[0];
        if (usableWidth < Math.max(2,cell)) continue;
      }
      ports.push({id:`P${ports.length+1}`,sourceFormId,type,localPosition,elevation:localPosition[2],outwardDirection:[dx,dy,0],upDirection:[0,0,1],usableWidth,usableDepth:depth*cell,confidence,sourceCells:cluster});
    }
  }
  // Bound pair evaluation while retaining different sides/elevations and strongest termini.
  return ports.sort((a,b)=>b.confidence-a.confidence || b.usableDepth-a.usableDepth).slice(0,32);
}

/** Reliable straight boundary profiles on upward source faces. Raster ports remain the fallback. */
export function extractSourceEdgePorts(source:ImportedObj,positions:Float32Array,proxyPorts:ConnectionPort[]):ConnectionPort[] {
  const edges=new Map<string,{a:Vec3;b:Vec3;count:number}>();
  const point=(index:number)=>Array.from(positions.slice(index*3,index*3+3)) as Vec3;
  const key=(p:Vec3)=>p.map(v=>v.toFixed(4)).join(',');
  for(const face of source.faces) {
    if(face.vertices.length<3)continue;
    const a=point(face.vertices[0]),b=point(face.vertices[1]),c=point(face.vertices[2]);
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const normalLength=Math.hypot(...n);
    if(normalLength<1e-8||n[2]/normalLength<.95)continue;
    for(let i=0;i<face.vertices.length;i++) {
      const a=point(face.vertices[i]),b=point(face.vertices[(i+1)%face.vertices.length]);
      const id=[key(a),key(b)].sort().join('|'),old=edges.get(id);
      if(old)old.count++;else edges.set(id,{a,b,count:1});
    }
  }
  const lines=new Map<string,Array<{a:Vec3;b:Vec3;count:number}>>();
  for(const edge of edges.values()) {
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],len=Math.hypot(dx,dy);
    if(edge.count!==1||len<1e-6||Math.abs(edge.a[2]-edge.b[2])>=.05)continue;
    const ux=dx/len,uy=dy/len,id=[ux,uy,-uy*edge.a[0]+ux*edge.a[1],edge.a[2]].map(v=>v.toFixed(3)).join(',');
    const group=lines.get(id)??[];group.push(edge);lines.set(id,group);
  }
  const runs:Array<{a:Vec3;b:Vec3;count:number}>=[];
  for(const group of lines.values()) {
    const d=group[0].b.map((v,i)=>v-group[0].a[i]);
    const projection=(p:Vec3)=>p[0]*d[0]+p[1]*d[1];
    group.sort((a,b)=>projection(a.a)-projection(b.a));
    let previous:typeof group[number]|undefined;
    for(const edge of group) {
      if(previous&&Math.hypot(...edge.a.map((v,i)=>v-previous!.b[i]))<.001)previous.b=edge.b;
      else {previous={...edge};runs.push(previous);}
    }
  }
  const reliable:ConnectionPort[]=[];
  for(const edge of runs) {
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],width=Math.hypot(dx,dy);
    if(width<2)continue;
    const center=edge.a.map((v,i)=>(v+edge.b[i])/2) as Vec3,normal:Vec3=[dy/width,-dx/width,0];
    const proxy=proxyPorts.filter(p=>Math.abs(p.elevation-center[2])<.5&&p.outwardDirection[0]*normal[0]+p.outwardDirection[1]*normal[1]>.8).sort((a,b)=>Math.hypot(a.localPosition[0]-center[0],a.localPosition[1]-center[1])-Math.hypot(b.localPosition[0]-center[0],b.localPosition[1]-center[1]))[0];
    const comparableProxy=proxy&&proxy.usableWidth>=width*.6&&Math.hypot(proxy.localPosition[0]-center[0],proxy.localPosition[1]-center[1])<=Math.max(2,width*.25)?proxy:undefined;
    reliable.push({id:'E'+(reliable.length+1),sourceFormId:source.id,type:comparableProxy?.type??'PLATFORM_EDGE',localPosition:center,elevation:center[2],outwardDirection:normal,upDirection:[0,0,1],usableWidth:width,usableDepth:proxy?.usableDepth??2,confidence:comparableProxy?Math.max(.8,comparableProxy.confidence):.8,sourceCells:proxy?.sourceCells??[],profile:[edge.a,edge.b]});
  }
  const fallback=proxyPorts.filter(p=>!reliable.some(e=>Math.abs(e.elevation-p.elevation)<.5&&e.outwardDirection[0]*p.outwardDirection[0]+e.outwardDirection[1]*p.outwardDirection[1]>.8&&Math.hypot(e.localPosition[0]-p.localPosition[0],e.localPosition[1]-p.localPosition[1])<3));
  return [...reliable.sort((a,b)=>b.confidence-a.confidence||a.usableWidth-b.usableWidth),...fallback].slice(0,32);
}
