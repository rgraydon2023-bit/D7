import type { ConnectionPort, ConnectionReport, PlacedTile, PortCandidate, PortPair, PortRejection, TileModel, TileVariant, Vec3 } from "./types";
import { LATTICE_FEET, packCell, placementWorldZ } from "./types";
import { transitionPath, transitionMeshes, pathLength } from "./transitionGeometry";
import { transitionSurfaceClear, type ConnectorSurface } from "./connectionClearance";

export const DEFAULT_PORT_TOLERANCES = Object.freeze({maxDistance:20,maxLateralOffset:12,maxAngularDeviation:115,maxElevation:8,maxDirectElevation:.5,maxDirectSlope:.125,minUsableWidth:2,minConfidence:.55,directDistance:4,directLateralOffset:2,directAngle:35,minCompatibilityScore:4});
export type PortTolerances = { [K in keyof typeof DEFAULT_PORT_TOLERANCES]: number };
export function worldPortPosition(tile:PlacedTile,port:ConnectionPort):Vec3 {
  return [tile.ix*LATTICE_FEET+port.localPosition[0],tile.iy*LATTICE_FEET+port.localPosition[1],placementWorldZ(tile)+port.elevation];
}
const validatedPairs=new WeakMap<PortPair,{models:TileModel[];tiles:PlacedTile[]}>();
export function portPairClearanceValidated(pair:PortPair,models:TileModel[],tiles:PlacedTile[]) {const record=validatedPairs.get(pair);return record?.models===models&&record?.tiles===tiles;}
const occupiedCache=new WeakMap<TileVariant,Set<number>>();
/** Conservative voxel ribbon/headroom check, retained for source/session compatibility. */
export function portRouteClear(from:Vec3,to:Vec3,width:number,tiles:PlacedTile[],models:TileModel[],endpointIds:string[]):boolean {
  const distance=Math.hypot(...to.map((v,i)=>v-from[i])),plan=Math.hypot(to[0]-from[0],to[1]-from[1]);
  const px=plan?-(to[1]-from[1])/plan:0,py=plan?(to[0]-from[0])/plan:0,steps=Math.max(2,Math.ceil(distance/.5));
  for(const tile of tiles) {
    const model=models.find(m=>m.id===tile.id||m.id===tile.id.split("::")[0]),variant=model?.variants[tile.variant];
    if(!model||!variant)continue;
    // Actual source triangles supersede the coarse occupied surface voxels for this check.

    let occupied=occupiedCache.get(variant);
    if(!occupied){occupied=new Set(variant.occupied);occupiedCache.set(variant,occupied);}
    const cell=model.cellFeet;
    for(let i=1;i<steps;i++) {
      const t=i/steps;
      if((tile.id===endpointIds[0]&&t*distance<=cell)||(tile.id===endpointIds[1]&&(1-t)*distance<=cell))continue;
      for(const side of [-.5,0,.5]) for(const height of [.25,cell,cell*2]) {
        const x=from[0]+(to[0]-from[0])*t+px*width*side-tile.ix*20;
        const y=from[1]+(to[1]-from[1])*t+py*width*side-tile.iy*20;
        const z=from[2]+(to[2]-from[2])*t+height-placementWorldZ(tile);
        if(occupied.has(packCell(Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell))))return false;
      }
    }
  }
  return true;
}
function usableProfile(port:ConnectionPort,tile:PlacedTile,direction:Vec3,width:number,target:Vec3) {
  const center=worldPortPosition(tile,port),side:Vec3=[-direction[1],direction[0],0];
  const offset=port.profile?Math.max(-(port.usableWidth-width)/2,Math.min((port.usableWidth-width)/2,(target[0]-center[0])*side[0]+(target[1]-center[1])*side[1])):0;
  let slope=0;
  if(port.profile){const [a,b]=port.profile,len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>1e-6)slope=(b[2]-a[2])/len*Math.sign((b[0]-a[0])*side[0]+(b[1]-a[1])*side[1]);}
  const point:Vec3=[center[0]+side[0]*offset,center[1]+side[1]*offset,center[2]+slope*offset];
  const edge=(sign:number):Vec3=>[point[0]+side[0]*width*.5*sign,point[1]+side[1]*width*.5*sign,point[2]+slope*width*.5*sign];
  return {point,offset,profile:[edge(-1),edge(1)] as [Vec3,Vec3]};
}
export function assessPortPair(a:ConnectionPort,ta:PlacedTile,b:ConnectionPort,tb:PlacedTile,tolerances:Partial<PortTolerances>={}) {
  const t={...DEFAULT_PORT_TOLERANCES,...tolerances};
  const normal=(p:ConnectionPort):Vec3=>{const n=Math.hypot(p.outwardDirection[0],p.outwardDirection[1])||1;return [p.outwardDirection[0]/n,p.outwardDirection[1]/n,0];};
  const da=normal(a),db=normal(b),opposition=-(da[0]*db[0]+da[1]*db[1]);
  const landing=(p:ConnectionPort)=>!!p.profile&&(p.type==="PLATFORM_EDGE"||p.type==="LANDING_EDGE"||p.type==="EXPOSED_WALKABLE_EDGE");
  // The usable opening on a broad landing can be a sub-edge; the source itself is never trimmed.
  const startWidth=landing(a)?Math.min(a.usableWidth,b.usableWidth*1.25):a.usableWidth;
  const endWidth=landing(b)?Math.min(b.usableWidth,a.usableWidth*1.25):b.usableWidth;
  const ap=usableProfile(a,ta,da,startWidth,worldPortPosition(tb,b)),bp=usableProfile(b,tb,db,endWidth,ap.point);
  const from=ap.point,to=bp.point;
  const dx=to[0]-from[0],dy=to[1]-from[1],rise=to[2]-from[2],plan=Math.hypot(dx,dy),distance=Math.hypot(plan,rise);
  const fa=plan>.01?(dx*da[0]+dy*da[1])/plan:opposition,fb=plan>.01?-(dx*db[0]+dy*db[1])/plan:opposition;
  const facing=Math.min(fa,fb),angle=Math.acos(Math.max(-1,Math.min(1,opposition)))*180/Math.PI;
  const lateralOffset=Math.max(Math.abs(dx*da[1]-dy*da[0]),Math.abs(dx*db[1]-dy*db[0]));
  const widthCompatibility=Math.min(startWidth,endWidth)/Math.max(startWidth,endWidth),confidence=Math.min(a.confidence,b.confidence);
  const terminal=(p:ConnectionPort)=>p.type==="BRANCH_END"||p.type==="PASSAGE_END";
  const priority=terminal(a)&&terminal(b)&&plan<=4?2.5:(a.type==="LANDING_EDGE"&&terminal(b))||(b.type==="LANDING_EDGE"&&terminal(a))?2:terminal(a)&&terminal(b)?1.8:a.type==="PLATFORM_EDGE"||b.type==="PLATFORM_EDGE"?1.2:a.type==="CIRCULATION_END"||b.type==="CIRCULATION_END"?1:.2;
  const score=3*((fa+fb+2)/4)+2*(1-distance/t.maxDistance)+1.5*(1-Math.abs(rise)/t.maxElevation)+widthCompatibility+confidence+priority-lateralOffset/t.maxLateralOffset-angle/180-distance*(startWidth+endWidth)/2*.015;
  const connectionClass=Math.abs(rise)>t.maxDirectElevation||(Math.abs(rise)>1e-5&&plan<Math.abs(rise)/t.maxDirectSlope)?"VERTICAL":plan<=t.directDistance&&lateralOffset<=t.directLateralOffset&&angle<=t.directAngle?"DIRECT":"ADAPTIVE";
  const pair:PortPair={tileA:ta.id,tileB:tb.id,portA:a.id,portB:b.id,from,to,plan,rise,distance,facing,widthCompatibility,confidence,usableWidth:Math.min(startWidth,endWidth),startWidth,endWidth,startProfile:ap.profile,endProfile:bp.profile,portOffsetA:ap.offset,portOffsetB:bp.offset,startDirection:da,endDirection:db,angle,lateralOffset,connectionClass,score,fallback:(a.type==="EXPOSED_WALKABLE_EDGE"&&a.confidence<.8)||(b.type==="EXPOSED_WALKABLE_EDGE"&&b.confidence<.8)};
  let reason:PortRejection|undefined;
  if(distance>t.maxDistance)reason="DISTANCE";
  else if(facing<-.35||angle>t.maxAngularDeviation)reason="ANGLE";
  else if(lateralOffset>t.maxLateralOffset)reason="LATERAL OFFSET";
  else if(Math.abs(rise)>t.maxElevation||(connectionClass==="VERTICAL"&&plan<Math.abs(rise)*1.5))reason="ELEVATION";
  else if(Math.min(startWidth,endWidth)<t.minUsableWidth)reason="WIDTH";
  else if(confidence<t.minConfidence)reason="LOW CONFIDENCE";
  else if(score<t.minCompatibilityScore)reason=facing<.5||angle>45?"ANGLE":lateralOffset>t.directLateralOffset?"LATERAL OFFSET":Math.max(a.usableWidth,b.usableWidth)>8?"WIDTH":"DISTANCE";
  else if(distance<1e-5)reason="DISTANCE"; // No remaining gap: do not create a folded zero-length loft.
  return {pair,reason};
}
export function scorePortPair(a:ConnectionPort,ta:PlacedTile,b:ConnectionPort,tb:PlacedTile,tolerances:Partial<PortTolerances>={}):PortPair|null {
  const {pair,reason}=assessPortPair(a,ta,b,tb,tolerances);return reason?null:pair;
}
function routeClear(pair:PortPair,tiles:PlacedTile[],models:TileModel[],existing:ConnectorSurface[]) {
  const path=pair.path!,proxyModels=models.filter(m=>!m.connectionSurface),proxyTiles=tiles.filter(t=>proxyModels.some(m=>m.id===t.id||m.id===t.id.split("::")[0]));
  for(let i=1;i<path.length;i++) if(!portRouteClear(path[i-1],path[i],Math.max(pair.startWidth??pair.usableWidth,pair.endWidth??pair.usableWidth),proxyTiles,proxyModels,[]))return false;
  return transitionSurfaceClear(pair,tiles,models,existing);
}
export function matchAssemblyPorts(models:TileModel[],tiles:PlacedTile[],reports:ConnectionReport[]=[],tolerances:Partial<PortTolerances>={},collectDiagnostics=true) {
  const candidates:PortCandidate[]=[],byId=new Map(models.map(m=>[m.id,m]));
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++) {
    const a=tiles[i],b=tiles[j];
    const ma=byId.get(a.id)??byId.get(a.id.split("::")[0]),mb=byId.get(b.id)??byId.get(b.id.split("::")[0]);
    if(!ma||!mb)continue;
    const collision=reports.some(r=>((r.tileA===a.id&&r.tileB===b.id)||(r.tileB===a.id&&r.tileA===b.id))&&r.collision==="FAIL");
    if(!collectDiagnostics&&collision)continue;
    for(const pa of ma.variants[a.variant].ports??[])for(const pb of mb.variants[b.variant].ports??[]) {
      if(!collectDiagnostics) {
        const from=worldPortPosition(a,pa),to=worldPortPosition(b,pb),maxDistance=tolerances.maxDistance??DEFAULT_PORT_TOLERANCES.maxDistance;
        const na=Math.hypot(pa.outwardDirection[0],pa.outwardDirection[1])||1,nb=Math.hypot(pb.outwardDirection[0],pb.outwardDirection[1])||1;
        const opposition=-(pa.outwardDirection[0]*pb.outwardDirection[0]+pa.outwardDirection[1]*pb.outwardDirection[1])/(na*nb);
        if(opposition+1e-10<Math.cos(Math.max(0,Math.min(180,tolerances.maxAngularDeviation??DEFAULT_PORT_TOLERANCES.maxAngularDeviation))*Math.PI/180))continue;
        if(Math.min(pa.usableWidth,pb.usableWidth)<(tolerances.minUsableWidth??DEFAULT_PORT_TOLERANCES.minUsableWidth)||Math.min(pa.confidence,pb.confidence)<(tolerances.minConfidence??DEFAULT_PORT_TOLERANCES.minConfidence))continue;
        const halfA=pa.profile?pa.usableWidth*.5:0,halfB=pb.profile?pb.usableWidth*.5:0;
        // Opening centers can slide only along their source edges, not in every direction.
        if(Math.abs(to[0]-from[0])>maxDistance+1e-8+Math.abs(pa.outwardDirection[1]/na)*halfA+Math.abs(pb.outwardDirection[1]/nb)*halfB||Math.abs(to[1]-from[1])>maxDistance+1e-8+Math.abs(pa.outwardDirection[0]/na)*halfA+Math.abs(pb.outwardDirection[0]/nb)*halfB)continue;
        const reach=halfA+halfB;
        if(from.reduce((sum,v,i)=>sum+(v-to[i])**2,0)>(maxDistance+reach)**2)continue;
      }
      const {pair,reason}=assessPortPair(pa,a,pb,b,tolerances);
      if(!collectDiagnostics&&reason)continue;
      candidates.push({pair,accepted:false,reason:reason??(collision?"COLLISION":undefined)});
    }
  }
  const parent=new Map(tiles.map(t=>[t.id,t.id]));
  const find=(id:string):string=>parent.get(id)===id?id:find(parent.get(id)!);
  const join=(a:string,b:string)=>parent.set(find(a),find(b));
  // Only proven source circulation is already an edge. Mere proxy overlap is not circulation.
  for(const r of reports) if(r.collision!=="FAIL"&&r.interlock==="PASS"&&(r.floor==="PASS"||r.circulation==="PASS"))join(r.tileA,r.tileB);
  const componentsBefore=new Set(tiles.map(t=>find(t.id))).size;
  const pairs:PortPair[]=[],used=new Map<string,Array<{offset:number;width:number}>>(),surfaces:ConnectorSurface[]=[];
  const sorted=candidates.filter(c=>!c.reason).sort((a,b)=>Number(a.pair.fallback??false)-Number(b.pair.fallback??false)||b.pair.score-a.pair.score||a.pair.distance-b.pair.distance||(`${a.pair.tileA}:${a.pair.tileB}:${a.pair.portA}:${a.pair.portB}`).localeCompare(`${b.pair.tileA}:${b.pair.tileB}:${b.pair.portA}:${b.pair.portB}`));
  for(const candidate of sorted) {
    const pair=candidate.pair,ka=`${pair.tileA}:${pair.portA}`,kb=`${pair.tileB}:${pair.portB}`;
    if(find(pair.tileA)===find(pair.tileB)){candidate.reason="NETWORK REDUNDANT";continue;}
    const occupied=(key:string,offset:number,width:number)=>(used.get(key)??[]).some(span=>Math.abs(span.offset-offset)<(span.width+width)/2+.25);
    if(occupied(ka,pair.portOffsetA??0,pair.startWidth??pair.usableWidth)||occupied(kb,pair.portOffsetB??0,pair.endWidth??pair.usableWidth)){candidate.reason="PORT IN USE";continue;}
    let accepted:PortPair|undefined;
    for(const bend of [0,2,-2,4,-4]) {
      const routed={...pair,path:transitionPath(pair,bend),connectionClass:bend&&pair.connectionClass==="DIRECT"?"ADAPTIVE" as const:pair.connectionClass};
      if(pathLength(routed.path)>(tolerances.maxDistance??DEFAULT_PORT_TOLERANCES.maxDistance)*1.4)continue;
      if(routeClear(routed,tiles,models,surfaces)){accepted=routed;break;}
    }
    if(!accepted){candidate.reason="COLLISION";continue;}
    validatedPairs.set(accepted,{models,tiles});candidate.pair=accepted;candidate.accepted=true;pairs.push(accepted);
    for(const [key,offset,width] of [[ka,pair.portOffsetA??0,pair.startWidth??pair.usableWidth],[kb,pair.portOffsetB??0,pair.endWidth??pair.usableWidth]] as const){const spans=used.get(key)??[];spans.push({offset,width});used.set(key,spans);}join(pair.tileA,pair.tileB);surfaces.push(...transitionMeshes(accepted).map(mesh=>({...mesh,portPair:accepted})));
  }
  const componentsAfter=new Set(tiles.map(t=>find(t.id))).size,connectivityBonus=(componentsBefore-componentsAfter)*5;
  const rejectionCounts:Partial<Record<PortRejection,number>>={};
  for(const c of candidates)if(c.reason)rejectionCounts[c.reason]=(rejectionCounts[c.reason]??0)+1;
  return {pairs,candidates,componentsBefore,componentsAfter,rejectionCounts,score:pairs.reduce((sum,p)=>sum+p.score,0)+connectivityBonus,multiConnectionBonus:connectivityBonus};
}
