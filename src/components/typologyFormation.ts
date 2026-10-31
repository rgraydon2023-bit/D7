import type { Manifold, Vec2 } from "manifold-3d/manifold";
import type { IntersectionPlacement } from "./architecturalConnections";
import type { FaceBridgeMesh } from "./faceBridges";

/** Source-unit recipes. Every dimension is derived from the selected letter field. */
export function typologyFormation(M: typeof Manifold, own:(s:Manifold)=>Manifold, letters:Manifold[], gaps:Manifold[], placements:IntersectionPlacement[], links:NonNullable<FaceBridgeMesh["links"]>, typology:string) {
 const solids:Manifold[]=[],cuts:Manifold[]=[];const operations:string[]=[];
 const hull=(pts:Vec2[]):Vec2[]=>{const p=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a:Vec2,b:Vec2,c:Vec2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=(v:Vec2[])=>{const out:Vec2[]=[];for(const q of v){while(out.length>1&&cross(out[out.length-2],out[out.length-1],q)<=0)out.pop();out.push(q);}return out;};return [...half(p).slice(0,-1),...half(p.reverse()).slice(0,-1)];};
 const points=(s:Manifold)=>{const m=s.getMesh(),p:Vec2[]=[];for(let i=0;i<m.vertProperties.length;i+=m.numProp)p.push([m.vertProperties[i],m.vertProperties[i+1]]);return p;};
 const outlines=letters.map(s=>hull(points(s))),outline=hull(outlines.flat());
 const boxes=letters.map(s=>s.boundingBox()),lo=boxes.reduce((value,b)=>Math.min(value,b.min[2]),Infinity),hi=boxes.reduce((value,b)=>Math.max(value,b.max[2]),-Infinity);
 const center:Vec2=[placements.reduce((a,p)=>a+p.x,0)/placements.length,placements.reduce((a,p)=>a+p.y,0)/placements.length];
 let xx=0,yy=0,xy=0;for(const p of placements){xx+=(p.x-center[0])**2;yy+=(p.y-center[1])**2;xy+=(p.x-center[0])*(p.y-center[1]);}
 const angle=Math.abs(xx-yy)+Math.abs(xy)<1e-8?(placements[0]?.rz??0)*Math.PI/180:.5*Math.atan2(2*xy,xx-yy),u:Vec2=[Math.cos(angle),Math.sin(angle)],v:Vec2=[-u[1],u[0]];
 const local=(p:Vec2):Vec2=>[(p[0]-center[0])*u[0]+(p[1]-center[1])*u[1],(p[0]-center[0])*v[0]+(p[1]-center[1])*v[1]];
 const world=(x:number,y:number):Vec2=>[center[0]+u[0]*x+v[0]*y,center[1]+u[1]*x+v[1]*y];
 const coords=outline.map(local),length=Math.max(.1,coords.reduce((value,p)=>Math.max(value,p[0]),-Infinity)-coords.reduce((value,p)=>Math.min(value,p[0]),Infinity)),width=Math.max(.1,coords.reduce((value,p)=>Math.max(value,p[1]),-Infinity)-coords.reduce((value,p)=>Math.min(value,p[1]),Infinity)),span=Math.max(length,width),rise=Math.max(hi-lo,span*.1),slab=span*.035;
 const degree=new Map<number,Set<number>>();for(const l of links){for(const [a,b] of [[l.from,l.to],[l.to,l.from]]){const set=degree.get(a)??new Set<number>();set.add(b);degree.set(a,set);}}
 const branching=Math.min(1,[...degree.values()].reduce((value,s)=>Math.max(value,(s.size-1)/3),0));
 const scale=(poly:Vec2[],factor:number,c:Vec2=center):Vec2[]=>poly.map(p=>[c[0]+(p[0]-c[0])*factor,c[1]+(p[1]-c[1])*factor]);
 const rect=(x:number,y:number,a:number,b:number):Vec2[]=>[world(x-a/2,y-b/2),world(x+a/2,y-b/2),world(x+a/2,y+b/2),world(x-a/2,y+b/2)];
 const disk=(x:number,y:number,a:number,b:number):Vec2[]=>Array.from({length:48},(_,i)=>world(x+Math.cos(i*Math.PI/24)*a,y+Math.sin(i*Math.PI/24)*b));
 const extrude=(poly:Vec2[],z:number,height:number)=>own(own(M.extrude([poly],Math.max(slab*.1,height))).translate([0,0,z]));
 const plate=(poly:Vec2[],z=lo,height=slab)=>{const s=extrude(poly,z,height);solids.push(s);return s;};
 const cut=(poly:Vec2[],z=lo-slab,height=rise+slab*4)=>{const s=extrude(poly,z,height);cuts.push(s);return s;};
 const route=(a:number[],b:number[],w=slab*2)=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);if(d<1e-6)return;const nx=-dy/d*w/2,ny=dx/d*w/2;const poly:Vec2[]=[[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]];const base=extrude(poly,0,slab);solids.push(own(base.warp(p=>{const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(d*d)));p[2]+=a[2]+t*(b[2]-a[2]);})));};
 const graphRoutes=(flat=false)=>{const used=new Set<string>();for(const l of links){const id=[l.from,l.to].sort().join(':');if(used.has(id))continue;used.add(id);route([l.start[0],l.start[1],flat?lo:l.start[2]],[l.end[0],l.end[1],flat?lo:l.end[2]]);}};
 const gapRecords=gaps.filter(g=>!g.isEmpty()&&g.volume()>1e-8).map(g=>{const b=g.boundingBox();return {poly:hull(points(g)),z:(b.min[2]+b.max[2])/2,c:[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2] as Vec2,b};});
 if(typology==="vertical-void-lobby") {
  const chain=gapRecords.filter(a=>gapRecords.some(b=>a!==b&&Math.abs(a.z-b.z)>slab*2&&Math.min(a.b.max[0],b.b.max[0])>Math.max(a.b.min[0],b.b.min[0])&&Math.min(a.b.max[1],b.b.max[1])>Math.max(a.b.min[1],b.b.min[1]))).sort((a,b)=>a.z-b.z);
  if(chain.length<2)return {solids,cuts,operations:["No stacked chain of inter-letter gaps: this typology cannot build from this selection."],supported:false};
  chain.forEach((g,i)=>{const nearby=outlines.filter((_,j)=>boxes[j].min[2]<=g.b.max[2]&&boxes[j].max[2]>=g.b.min[2]);plate(hull(nearby.flat()),g.z);cut(g.poly,g.z-slab,slab*3);if(i)route([...chain[i-1].c,chain[i-1].z],[...g.c,g.z]);});
  operations.push("Floors follow letters surrounding stacked gaps; ramps follow the gap chain.");
 } else if(typology==="stepped-amphitheater") {
  const rows=4;for(let i=0;i<rows;i++){const factor=.35+i*.2;const outer=disk(0,0,length*factor/2,width*factor/2).map(p=>{const nearest=placements.reduce((a,b)=>Math.hypot(a.x-p[0],a.y-p[1])<Math.hypot(b.x-p[0],b.y-p[1])?a:b);const influence=.05*Math.cos(Math.hypot(nearest.x-p[0],nearest.y-p[1])/span*Math.PI);return [p[0]+(nearest.x-p[0])*influence,p[1]+(nearest.y-p[1])*influence] as Vec2;});const ring=own(extrude(outer,lo+i*rise*.16,slab).subtract(extrude(scale(outer,.78),lo+i*rise*.16-slab,slab*3)));solids.push(ring);}
  plate(rect(0,0,span*.12,span*.12));for(let i=0,n=2+Math.round(branching*4);i<n;i++){const a=angle+2*Math.PI*i/n;route([center[0],center[1],lo],[center[0]+Math.cos(a)*length*.48,center[1]+Math.sin(a)*width*.48,lo+rise*.48]);}operations.push("Letter-modulated rings, square focus, and radial rising aisles.");
 } else if(typology==="void-field-gathering"||typology==="void-edge-workspace") {
  gapRecords.forEach((g,i)=>{plate(scale(g.poly,typology==="void-edge-workspace"?1.65:1.3,g.c),g.z);cut(g.poly,g.z-slab,slab*3);if(i)route([...gapRecords[i-1].c,gapRecords[i-1].z],[...g.c,g.z]);if(typology==="void-edge-workspace")for(const p of g.poly.filter((_,j)=>j%2===0))route([...p,g.z],[...scale([p],1.65,g.c)[0],g.z]);});
  if(typology==="void-field-gathering"&&gapRecords.length){plate(rect(-length*.48,0,slab*3,slab*3),lo,rise);gapRecords.forEach(g=>route([...g.c,g.z],[...world(-length*.48,0),g.z]));}operations.push("Gap-sized openings with surrounding plates and linked circulation.");
 } else if(typology==="inserted-horizontal-plate") {
  for(const side of [-1,1])plate(rect(side*length*.22,0,length*.6,width*.42),lo+(side+1)*slab*.65);graphRoutes(true);operations.push("Two thin axis-aligned projecting plates; nearly level routes.");
 } else if(typology==="contained-room-within-volume") {
  solids.push(own(extrude(scale(outline,1.08),lo,rise*.65).subtract(extrude(outline,lo-slab,rise+slab*2))));
  let tight=0,best=Infinity;placements.forEach((p,i)=>{const d=placements.map(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)).sort((a,b)=>a-b).slice(1,4).reduce((a,b)=>a+b,0);if(d<best){tight=i;best=d;}});
  const ids=placements.map((p,i)=>({i,d:Math.hypot(p.x-placements[tight].x,p.y-placements[tight].y)})).sort((a,b)=>a.d-b.d).slice(0,3).map(p=>p.i);plate(hull(ids.flatMap(i=>outlines[i])),lo);
  const far=placements.reduce((a,b)=>Math.hypot(a.x-center[0],a.y-center[1])>Math.hypot(b.x-center[0],b.y-center[1])?a:b);const q=local([far.x,far.y]);cut(rect(q[0],q[1],span*.2,span*.2),lo-slab,rise*.45);operations.push("Group-outline enclosure, room at the tightest cluster, entrance toward the outermost letter.");
 } else if(typology==="linear-edge-gallery") {
  placements.forEach(p=>{const q=local([p.x,p.y]);for(let i=0;i<3;i++)plate(rect(q[0],q[1],length/Math.max(3,placements.length),width*.22),p.z+i*rise*.18);});graphRoutes();operations.push("Axis-aligned blocks in three levels anchored at letter heights.");
 } else if(typology==="open-hall-workspace") {plate(scale(outline,1.05),lo);graphRoutes(true);operations.push("Broad plate centered on letters; flat arms follow the connection graph.");
 } else if(typology==="cascaded-terraced-plates") {for(let i=0;i<4;i++)plate(disk((i-1.5)*length*.14,0,length*.34,width*.42),lo+i*rise*.23);graphRoutes();operations.push("Disks shift along the letter axis and rise with its vertical spread.");
 } else if(typology==="flat-deep-plan-plate") {graphRoutes(true);operations.push("Original letter solids retained as zones; flat routes follow their links and gaps remain open.");
 } else if(typology==="folded-undulating-work-surface"||typology==="topographic-ground-field-lobby") {
  const folded=typology==="folded-undulating-work-surface",n=folded?3:4+Math.round(branching*2);
  for(let i=0;i<n;i++)for(let j=0;j<12;j++){const x0=-length*.5+j*length/12,x1=x0+length/12,y=(i-(n-1)/2)*width/n;const z=(x:number)=>lo+i*rise/(n+1)+(folded?Math.sin(x/length*Math.PI*2)*rise*.16:x/length*rise*.08);route([...world(x0,y),z(x0)],[...world(x1,y),z(x1)],width/n*.65);}
  operations.push(folded?"Three rising and falling ribbons; circulation follows each fold.":"Open gently sloped bands; branching sets band count from four upward.");
 } else if(typology==="compressed-sequential-lobby") {
  for(let i=0;i<5;i++){const x=(i-2)*length*.2;plate(rect(x,0,length*.16,width*(i%2?.28:.7)),lo,slab);if(i)route([...world(x-length*.2,0),lo],[...world(x,0),lo],width*.12);}operations.push("Five alternating wide/narrow rooms with short sequential paths.");
 } else if(typology==="continuous-hall-lobby"||typology==="linear-gallery-lobby") {
  const hall=typology==="continuous-hall-lobby";plate(rect(0,0,length,width*(hall?.55:.18)));const n=(hall?3:5)+Math.round(branching*6);for(let i=0;i<n;i++){const x=-length*.45+i*length*.9/Math.max(1,n-1);for(const side of [-1,1])route([...world(x,0),lo],[...world(x,side*width*.5),lo],width*.07);}operations.push(hall?"Wide axis hall with branching ribs.":"Axis spine with teeth on both sides; branching adds teeth.");
 }
 return {solids,cuts,operations,supported:true};
}

