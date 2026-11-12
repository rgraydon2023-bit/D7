import type { PortPair, Vec3 } from "./types";

export type TransitionSection = { center: Vec3; side: Vec3; width: number };
const mix = (a: number,b: number,t: number) => a+(b-a)*t;
export function transitionPath(pair: PortPair, bend = 0): Vec3[] {
  const a=pair.from,b=pair.to, dx=b[0]-a[0],dy=b[1]-a[1],plan=Math.hypot(dx,dy);
  const forward: Vec3=plan>1e-6?[dx/plan,dy/plan,0]:[1,0,0];
  const da=pair.startDirection??forward, db=pair.endDirection??forward.map(v=>-v) as Vec3;
  const handle=Math.min(4,plan*.3);
  const c: Vec3=[a[0]+da[0]*handle,a[1]+da[1]*handle,a[2]+(b[2]-a[2])/3];
  const d: Vec3=[b[0]+db[0]*handle,b[1]+db[1]*handle,a[2]+(b[2]-a[2])*2/3];
  const count=Math.max(8,Math.ceil(plan/.75));
  const points: Vec3[]=[];
  for(let i=0;i<=count;i++) {
    const t=i/count,u=1-t, bulge=bend*16*t*t*u*u;
    points.push([u*u*u*a[0]+3*u*u*t*c[0]+3*u*t*t*d[0]+t*t*t*b[0]-forward[1]*bulge,
      u*u*u*a[1]+3*u*u*t*c[1]+3*u*t*t*d[1]+t*t*t*b[1]+forward[0]*bulge,
      mix(a[2],b[2],t)]);
  }
  return points;
}
export function pathLength(path: Vec3[]) { return path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,k)=>v-path[i][k])),0); }
/** End cross-sections follow the usable source edges; interior sections follow a smooth path. */
export function transitionSections(pair: PortPair, path=pair.path??transitionPath(pair)): TransitionSection[] {
  const n=path.length-1,wa=pair.startWidth??pair.usableWidth,wb=pair.endWidth??pair.usableWidth;
  return path.map((center,i)=>{
    const t=i/n,a=path[Math.max(0,i-1)],b=path[Math.min(n,i+1)];
    let dx=b[0]-a[0],dy=b[1]-a[1];
    if(i===0&&pair.startDirection) [dx,dy]=pair.startDirection;
    if(i===n&&pair.endDirection) {dx=-pair.endDirection[0];dy=-pair.endDirection[1];}
    if(pair.startDirection&&pair.endDirection) {
      const start=Math.atan2(pair.startDirection[1],pair.startDirection[0]),end=Math.atan2(-pair.endDirection[1],-pair.endDirection[0]);
      const delta=Math.atan2(Math.sin(end-start),Math.cos(end-start)),angle=start+delta*t;
      const edgeX=Math.cos(angle),edgeY=Math.sin(angle),len=Math.hypot(dx,dy)||1;
      const clearanceA=Math.hypot(center[0]-pair.from[0],center[1]-pair.from[1])/Math.max(1,wa);
      const clearanceB=Math.hypot(center[0]-pair.to[0],center[1]-pair.to[1])/Math.max(1,wb);
      const blend=Math.min(1,clearanceA**2,clearanceB**2);
      dx=edgeX*(1-blend)+(dx/len)*blend;dy=edgeY*(1-blend)+(dy/len)*blend;
    }
    const len=Math.hypot(dx,dy)||1;
    // A small shoulder makes even a short aligned neck a loft, without large endpoint pads.
    const profileSlope=(profile:[Vec3,Vec3]|undefined,direction:Vec3|undefined)=>{
      if(!profile||!direction)return 0;
      const [a,b]=profile,len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      return len>1e-6?(b[2]-a[2])/len*Math.sign((b[0]-a[0])*(-direction[1])+(b[1]-a[1])*direction[0]):0;
    };
    const slope=mix(profileSlope(pair.startProfile,pair.startDirection),profileSlope(pair.endProfile,pair.endDirection?.map(v=>-v) as Vec3|undefined),t);
    const flare=pair.connectionClass==="ADAPTIVE"&&((pair.angle??0)>35||(pair.lateralOffset??0)>2)?.08:-.04;
    return {center,side:[-dy/len,dx/len,slope],width:mix(wa,wb,t)*(1+flare*Math.sin(Math.PI*t)**2)};
  });
}
export function loftSections(sections: TransitionSection[],thickness=.25) {
  const positions:number[]=[],indices:number[]=[];
  for(const {center,side,width} of sections) for(const level of [0,-thickness]) for(const sign of [-1,1]) {
    positions.push(center[0]+side[0]*width*.5*sign,center[1]+side[1]*width*.5*sign,center[2]+side[2]*width*.5*sign+level);
  }
  for(let i=0;i<sections.length-1;i++) {
    const a=i*4,b=a+4;
    indices.push(a,a+1,b+1,a,b+1,b, a+2,b+3,a+3,a+2,b+2,b+3,
      a,b,a+2,a+2,b,b+2, a+1,a+3,b+1,a+3,b+3,b+1);
  }
  const end=(sections.length-1)*4;
  indices.push(0,2,3,0,3,1,end,end+1,end+3,end,end+3,end+2);
  return {positions:new Float32Array(positions),indices:indices.flatMap((_,i)=>i%3===0?[indices[i],indices[i+2],indices[i+1]]:[])};
}
/** True horizontal treads and risers, with edge-aligned first/last transition sections. */
export function transitionMeshes(pair: PortPair) {
  const sections=transitionSections(pair),route=pair.path??transitionPath(pair),run=route.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-route[i][0],p[1]-route[i][1]),0),rise=Math.abs(pair.rise);
  if(pair.connectionClass!=="VERTICAL"||run>=rise*12) return [{kind:(pair.connectionClass==="VERTICAL"?"ramp":pair.connectionClass==="DIRECT"?"plate":"bridge") as "ramp"|"plate"|"bridge",...loftSections(sections)}];
  const steps=Math.max(1,Math.ceil(rise/.6)),path=pair.path??transitionPath(pair),out:ReturnType<typeof loftSections>[]=[];
  for(let step=0;step<steps;step++) {
    const t0=step/steps,t1=(step+1)/steps;
    const sectionAt=(t:number,z:number) => {
      const at=t*(path.length-1),i=Math.min(path.length-2,Math.floor(at)),u=at-i;
      const a=sections[i],b=sections[i+1];
      const side:Vec3=[mix(a.side[0],b.side[0],u),mix(a.side[1],b.side[1],u),mix(a.side[2],b.side[2],u)];
      const norm=Math.hypot(side[0],side[1])||1;side[0]/=norm;side[1]/=norm;
      return {center:[mix(a.center[0],b.center[0],u),mix(a.center[1],b.center[1],u),z] as Vec3,side,width:mix(a.width,b.width,u)};
    };
    // The first tread meets A; the last transition climbs/descends into B.
    const z=pair.from[2]+pair.rise*step/steps;
    const a=sectionAt(t0,z),b=sectionAt(t1,z),next=sectionAt(t1,pair.from[2]+pair.rise*(step+1)/steps);
    out.push(loftSections([a,b,next]));
  }
  return out.map(mesh=>({kind:"stair" as const,...mesh}));
}
