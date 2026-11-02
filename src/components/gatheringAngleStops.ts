import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringAngleLimits } from './typologyLetterArrangement';
import { foundationPoses } from './typologyOrientationRules';
import { typologyLetterPriority } from './typologyLetterOrder';
import { ATRIUM_TYPOLOGIES, gatheringAtriumLayout, gatheringEnclosureLayout } from './gatheringAtriumLayout';
import { DEFAULT_GATHERING_OPERATIONS, type GatheringOperations } from './gatheringOperations';

type AxisRange = { min:number; max:number };
export type GatheringStops = { x:AxisRange; y:AxisRange; z:AxisRange; yawChoices?:number[] };
const normalizeYaw=(angle:number)=>((angle%360)+360)%360;
const range=(values:number[],lower:number,upper:number):AxisRange=>({min:Math.max(lower,Math.floor((Math.min(...values)+1e-8)/15)*15),max:Math.min(upper,Math.ceil((Math.max(...values)-1e-8)/15)*15)});

/** Required initial orientations for the selected letters and typology. */
export function gatheringAngleStops(source:IntersectionPlacement[],typology:string,operations:GatheringOperations=DEFAULT_GATHERING_OPERATIONS):GatheringStops {
 if(!source.length)return {x:{min:0,max:0},y:{min:0,max:0},z:{min:0,max:0}};
 const n=source.length,center=source.reduce((acc,p)=>[acc[0]+p.x/n,acc[1]+p.y/n],[0,0]);
 let xx=0,yy=0,xy=0;for(const p of source){xx+=(p.x-center[0])**2;yy+=(p.y-center[1])**2;xy+=(p.x-center[0])*(p.y-center[1]);}
 const heading=.5*Math.atan2(2*xy,xx-yy)*180/Math.PI,priority=typologyLetterPriority(typology);
 const sequence=source.map((_,i)=>i).sort((a,b)=>priority.indexOf(source[a].letter)-priority.indexOf(source[b].letter)||a-b);
 const spacing=source.reduce((sum,p)=>sum+p.scale/n,0)*.7,foundation=foundationPoses(source,sequence,typology,spacing,heading);
 if(typology==='stepped-amphitheater')return {x:source.some(p=>p.letter!=='L')?{min:-90,max:90}:{min:0,max:0},y:{min:0,max:0},z:{min:0,max:360},yawChoices:[0,15,30,45,90].map(offset=>normalizeYaw(foundation.heading+offset)).sort((a,b)=>a-b)};
 const poses=ATRIUM_TYPOLOGIES.has(typology)?gatheringAtriumLayout(source,sequence,typology,operations).poses:['contained-room-within-volume','linear-edge-gallery'].includes(typology)?gatheringEnclosureLayout(source,sequence,typology,operations,foundation.heading):foundation.poses;
 return {x:range(poses.map(p=>p.rx),-180,180),y:range(poses.map(p=>p.ry),-180,180),z:range(poses.map(p=>normalizeYaw(p.rz)),0,360)};
}

/** Expand limits only as necessary when the typology or source changes. */
export function fitGatheringLimits(value:GatheringAngleLimits,stops:GatheringStops):GatheringAngleLimits {
 const next={...value};
 next.xMin=Math.min(next.xMin,next.xMax,stops.x.min);next.xMax=Math.max(next.xMin,next.xMax,stops.x.max);
 next.yMin=Math.min(next.yMin,next.yMax,stops.y.min);next.yMax=Math.max(next.yMin,next.yMax,stops.y.max);
 next.zMin=Math.min(next.zMin,next.zMax);next.zMax=Math.max(next.zMin,next.zMax);
 if(stops.yawChoices?.length){
  if(!stops.yawChoices.some(angle=>angle>=next.zMin&&angle<=next.zMax)){
   const nearest=stops.yawChoices.reduce((best,angle)=>Math.min(Math.abs(angle-next.zMin),Math.abs(angle-next.zMax))<Math.min(Math.abs(best-next.zMin),Math.abs(best-next.zMax))?angle:best);
   next.zMin=Math.min(next.zMin,nearest);next.zMax=Math.max(next.zMax,nearest);
  }
 }else {next.zMin=Math.min(next.zMin,stops.z.min);next.zMax=Math.max(next.zMax,stops.z.max);}
 return next;
}

export function gatheringInputBounds(key:keyof GatheringAngleLimits,current:GatheringAngleLimits,stops:GatheringStops):AxisRange {
 switch(key){
  case 'xMin':return {min:-180,max:Math.min(current.xMax,stops.x.min)};
  case 'xMax':return {min:Math.max(current.xMin,stops.x.max),max:180};
  case 'yMin':return {min:-180,max:Math.min(current.yMax,stops.y.min)};
  case 'yMax':return {min:Math.max(current.yMin,stops.y.max),max:180};
  case 'zMin':return {min:0,max:Math.min(current.zMax,stops.yawChoices?.filter(a=>a<=current.zMax).at(-1)??stops.z.min)};
  case 'zMax':return {min:Math.max(current.zMin,stops.yawChoices?.find(a=>a>=current.zMin)??stops.z.max),max:360};
 }
}
