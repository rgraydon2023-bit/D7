import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringOperations } from './gatheringOperations';
import { foundationPoses } from './typologyOrientationRules';
import { gatheringEnclosureLayout } from './gatheringAtriumLayout';

export type GatheringRuleCheck = {label:string;status:'pass'|'unverified';detail:string};
const delta = (a:number,b:number) => Math.abs(((a-b+540)%360)-180);
const multiple = (v:number,step:number) => Math.abs(v/step-Math.round(v/step))<1e-6;

/** Plate operations remain disabled by the user's direct-letter-only generation request. */
export function inactiveGatheringOperation(typology:string,key:string) {
 if(['boundaryRotation','alcoveDepthPercent','alcoveWidthPercent','minimumClearance'].includes(key))return true;
 if(typology==='contained-room-within-volume'&&['staggerPercent','staggerDirection'].includes(key))return true;
 return key==='staggerDirection'&&['void-field-gathering','inserted-horizontal-plate'].includes(typology);
}

/** Check the final Rule A → Rule B handoff without inferring occupiability from solid contact. */
export function gatheringRuleChecks(source:IntersectionPlacement[],placed:IntersectionPlacement[],sequence:number[],typology:string,operations:GatheringOperations,atrium?:{center:[number,number];radius:number}|null):GatheringRuleCheck[] {
 const checks:GatheringRuleCheck[]=[],add=(label:string,pass:boolean,detail:string)=>checks.push({label,status:pass?'pass':'unverified',detail});
 const n=source.length,center=source.reduce((a,p)=>[a[0]+p.x/Math.max(1,n),a[1]+p.y/Math.max(1,n),a[2]+p.z/Math.max(1,n)],[0,0,0]);
 let xx=0,yy=0,xy=0;for(const p of source){xx+=(p.x-center[0])**2;yy+=(p.y-center[1])**2;xy+=(p.x-center[0])*(p.y-center[1]);}
 const heading=.5*Math.atan2(2*xy,xx-yy)*180/Math.PI,spacing=source.reduce((sum,p)=>sum+p.scale/Math.max(1,n),0)*.7;
 const foundation=foundationPoses(source,sequence,typology,spacing,heading);
 const poses=sequence.map(i=>placed[i]),rises=poses.slice(1).map((p,k)=>p.z-poses[k].z);
 const handoff=source.length===placed.length&&placed.every((p,i)=>p.letter===source[i].letter&&p.scaleX===source[i].scaleX&&p.scaleY===source[i].scaleY&&(p.scaleZ??1)===(source[i].scaleZ??1)&&p.letterRules?.architectural===false&&Math.abs((p.letterRules?.supportZ??Infinity)-p.z)<1e-6&&delta(p.letterRules?.yaw??Infinity,p.rz)<1e-6)&&sequence.every((id,k)=>placed[id]?.letterRules?.level===k);
 add('Rule A/B source handoff',handoff,'Rule B uses the oriented letter solids with their original identities and axis proportions. Generated yaw, support elevation and sequence metadata are checked against the final transforms.');
 let family=false;
 if(typology==='void-field-gathering')family=placed.every(p=>Math.abs(p.rx)<1e-6&&Math.abs(p.ry)<1e-6&&multiple(p.rz,15));
 else if(typology==='stepped-amphitheater')family=placed.every(p=>Math.abs(p.ry)<1e-6&&(p.letter==='L'?Math.abs(p.rx)<1e-6:[0,90,-90].some(v=>Math.abs(p.rx-v)<1e-6))&&[0,15,30,45,90].some(v=>delta(p.rz,foundation.heading+v)<1e-6));
 else family=placed.every(p=>Math.abs(p.ry)<1e-6&&[0,90,-90].some(v=>Math.abs(p.rx-v)<1e-6)&&multiple(p.rz,typology==='inserted-horizontal-plate'?90:15));
 add('Rule A orientation family',family,typology==='void-field-gathering'?'Current override: Void-Field faces remain horizontal with 15° yaw increments.':typology==='stepped-amphitheater'?'Yaw offsets are 0°, 15°, 30°, 45° or 90° about the source axis; letter faces use the permitted horizontal/upright poses.':'Final letter tilts and yaw are checked against this Gathering typology’s implemented orientation family.');
 const width=source.reduce((sum,p)=>sum+p.scale*Math.max(p.scaleX,p.scaleY)/Math.max(1,n),0);
 let levels=false,levelDetail='One letter does not establish a sequence of architectural levels.';
 if(n>1){
  if(['stepped-amphitheater','void-field-gathering','contained-room-within-volume'].includes(typology)){
   levels=rises.every(r=>r>1e-6);
   levelDetail=`Final sequence rise ranges from ${Math.min(...rises).toFixed(4)} to ${Math.max(...rises).toFixed(4)} ft. ${levels?'Ascending order is retained.':'One or more rises reversed or collapsed while obtaining intersections.'}`;
  }else{
   const targets=poses.map((_,k)=>operations.levelRise>0?k*operations.levelRise:typology==='inserted-horizontal-plate'?Math.floor(k/2)*width*.5:(Math.floor(k/2)%2)*width*.35);
   const error=Math.max(...poses.map((p,k)=>Math.abs((p.z-poses[0].z)-(targets[k]-targets[0]))));
   levels=error<1e-5;levelDetail=`Maximum deviation from the requested paired/grouped levels is ${error.toFixed(4)} ft. ${levels?'Grouping is retained.':'Intersections took priority over the requested level pattern.'}`;
  }
 }
 add('Rule A level organization',levels,levelDetail);
 if(operations.levelRise>0&&n>1){const exact=rises.every(r=>Math.abs(r-operations.levelRise)<1e-5);add('Requested level spacing',exact,`Requested rise is ${operations.levelRise.toFixed(3)} ft; actual adjacent rises range ${Math.min(...rises).toFixed(4)}–${Math.max(...rises).toFixed(4)} ft. Rise may tighten to preserve letter intersections.`);}
 if(typology==='void-field-gathering'&&atrium){
  const errors=placed.map(p=>delta(p.rz,Math.atan2(p.y-atrium.center[1],p.x-atrium.center[0])*180/Math.PI+90));
  const max=Math.max(0,...errors);add('Rule A boundary alignment',max<=15+1e-6,`Final radial/tangential deviation reaches ${max.toFixed(1)}° against the requested atrium center (15° target). Direct intersection adjustments may change the initial radial relationship.`);
 }else if(typology==='contained-room-within-volume'){
  const spread=Math.max(0,...placed.map(p=>Math.hypot(p.x-(placed[0]?.x??0),p.y-(placed[0]?.y??0))));
  add('Rule A boundary alignment',spread<1e-6,`Current override: letters stack on a shared Z-axis. XY center deviation is ${spread.toFixed(6)} ft; this does not establish a dominant enclosed room.`);
 }else if(typology==='linear-edge-gallery'&&n>1){
  const expected=gatheringEnclosureLayout(placed,sequence,typology,operations,foundation.heading),max=Math.max(...placed.map((p,i)=>delta(p.rz,expected[i].rz)));
  add('Rule A boundary alignment',max<=15+1e-6,`Final gallery-tangent/orthogonal alignment deviation reaches ${max.toFixed(1)}° (15° target). Source-based headings can diverge from the path after intersection adjustments.`);
 }
 add('Rule B architectural operations',false,'Direct letter intersections are active. Added floor/terrace conversion, alcove subtraction, bridges, blending and occupiable circulation are disabled or unimplemented in the current letter-only path; a connected solid does not verify the complete architectural Rule B.');
 return checks;
}
