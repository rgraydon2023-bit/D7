import { enforceContactOverlap, enforceLetterOverlap, limitAdjacentLetterGap } from './letterOverlapRule';
import { ATRIUM_TYPOLOGIES, gatheringAtriumLayout, gatheringEnclosureLayout } from './gatheringAtriumLayout';
import { foundationPoses } from './typologyOrientationRules';
import { typologyLetterPriority } from './typologyLetterOrder';
import { originalLetterJoins } from './preserveLetterIntersections';
import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import { DEFAULT_GATHERING_OPERATIONS, GATHERING_TYPOLOGIES, type GatheringOperations } from './gatheringOperations';
import { OFFICE_TYPOLOGIES, arrangeOfficeLetters } from './officeWorkspaceRules';

export type GatheringAngleLimits = { xMin:number; xMax:number; yMin:number; yMax:number; zMin:number; zMax:number };
export const DEFAULT_GATHERING_ANGLES:GatheringAngleLimits = {xMin:-180,xMax:180,yMin:-180,yMax:180,zMin:0,zMax:360};


export function typologyLayout(id:string) {
 return {ring:/amphitheater|void-field|void-edge|contained/.test(id),topographic:/topographic|folded-undulating/.test(id),vertical:id==='vertical-void-lobby',compressed:id==='compressed-sequential-lobby',axis:/vertical|linear|continuous|open-hall|flat-deep|cascaded|inserted/.test(id)};
}
/** Typology-driven reinterpretation happens after the untouched original selection. */
export function arrangeTypologyLetters(source:IntersectionPlacement[],originals:Manifold[],makeSolid:(p:IntersectionPlacement)=>Manifold,typology:string, angleLimits:GatheringAngleLimits=DEFAULT_GATHERING_ANGLES,operations:GatheringOperations=DEFAULT_GATHERING_OPERATIONS) {
 if(OFFICE_TYPOLOGIES.has(typology)){const office=arrangeOfficeLetters(source,typology);return {...office,atrium:null};}
 const priority=typologyLetterPriority(typology),layout=typologyLayout(typology),n=source.length, gathering=GATHERING_TYPOLOGIES.has(typology);
 const placementOrder=layout.topographic?['U','L','V']:priority;
 const sequence=source.map((_,i)=>i).sort((a,b)=>placementOrder.indexOf(source[a].letter)-placementOrder.indexOf(source[b].letter)||a-b);
 if(!n)return {placements:[],sequence,preservedPairs:[],operations:[],supported:true,officePlan:null,atrium:null};
 const center=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n,a[2]+p.z/n],[0,0,0]);
 let xx=0,yy=0,xy=0;for(const p of source){xx+=(p.x-center[0])**2;yy+=(p.y-center[1])**2;xy+=(p.x-center[0])*(p.y-center[1]);}
 const yaw=.5*Math.atan2(2*xy,xx-yy),spacing=source.reduce((s,p)=>s+p.scale/n,0)*.7;
 const foundation=foundationPoses(source,sequence,typology,spacing,yaw*180/Math.PI);
 const amphitheater=typology==='stepped-amphitheater',axisYaw=foundation.heading*Math.PI/180;
 const representativeWidth=source.reduce((sum,p)=>sum+p.scale*Math.max(p.scaleX,p.scaleY),0)/n;
 const atrium=ATRIUM_TYPOLOGIES.has(typology)?gatheringAtriumLayout(source,sequence,typology,operations):null;
 const enclosurePoses=['contained-room-within-volume','linear-edge-gallery'].includes(typology)?gatheringEnclosureLayout(source,sequence,typology,operations,foundation.heading):null;
 let result=source.map(p=>({...p}));
 sequence.forEach((id,k)=>{
  const p=source[id],importance=priority.indexOf(p.letter),factor=[1.4,1,.75][importance];
  let {u,v,z}=foundation.poses[id];const {scaleMultiplier}=foundation.poses[id];
  if(atrium||enclosurePoses){const pose=atrium?atrium.poses[id]:enclosurePoses![id];u=pose.u;v=pose.v;}
  if(gathering&&!atrium&&!enclosurePoses){if(!(amphitheater&&!(operations.levelRise>0)))z=p.z-center[2];const direction=(foundation.heading+operations.staggerDirection)*Math.PI/180,offset=(k%2?1:-1)*representativeWidth*operations.staggerPercent/100;if(amphitheater)v=0;u+=offset*Math.cos(direction-(amphitheater?axisYaw:0));v+=offset*Math.sin(direction-(amphitheater?axisYaw:0));}
  if(atrium||enclosurePoses)z=p.z-center[2];
  if(gathering&&!(operations.levelRise>0)){if(typology==='void-field-gathering')z=(k%2)*representativeWidth*.45;else if(typology==='inserted-horizontal-plate')z=Math.floor(k/2)*representativeWidth*.5;else if(typology==='linear-edge-gallery')z=(Math.floor(k/2)%2)*representativeWidth*.35;else if(typology==='contained-room-within-volume'&&operations.boundaryRoles[p.letter]==='edge')z=representativeWidth*.35;}
  if(gathering&&(operations.levelRise??0)>0)z=k*operations.levelRise;
  let {rx,ry,rz}=atrium?atrium.poses[id]:enclosurePoses?enclosurePoses[id]:foundation.poses[id];
  if(gathering){
   if(amphitheater){
    const horizontal=[0,15,30,45,90].map(offset=>((foundation.heading+offset)%360+360)%360).filter(value=>value>=angleLimits.zMin&&value<=angleLimits.zMax);
    if(!horizontal.length||angleLimits.yMin>0||angleLimits.yMax<0)throw new Error('The selected rotation limits exclude all permitted amphitheater orientations.');
    const target=((rz%360)+360)%360;rz=horizontal.reduce((best,value)=>Math.abs(value-target)<Math.abs(best-target)?value:best);
    const tilts=(p.letter==='L'?[0]:[90,-90,0]).filter(value=>value>=angleLimits.xMin&&value<=angleLimits.xMax);
    if(!tilts.length)throw new Error('The selected X rotation limits exclude the required amphitheater letter tilt.');
    rx=tilts.reduce((best,value)=>Math.abs(value-rx)<Math.abs(best-rx)?value:best);ry=0;
   }else{rz=((rz%360)+360)%360;if(rx<angleLimits.xMin-1e-7||rx>angleLimits.xMax+1e-7||ry<angleLimits.yMin-1e-7||ry>angleLimits.yMax+1e-7||rz<angleLimits.zMin-1e-7||rz>angleLimits.zMax+1e-7)throw new Error('The selected rotation limits exclude a required orientation for this typology.');}
  }
  const scale=p.scale*factor*scaleMultiplier;
  result[id]={...p,x:center[0]+(amphitheater?u*Math.cos(axisYaw)-v*Math.sin(axisYaw):u),y:center[1]+(amphitheater?u*Math.sin(axisYaw)+v*Math.cos(axisYaw):v),z:center[2]+z,rx,ry,rz,scale,
   scaleX:gathering?p.scaleX:1,scaleY:gathering?p.scaleY:1,scaleZ:p.scaleZ??1,
   letterRules:{yaw:rz,level:k,supportZ:center[2]+z,strokeWidth:scale*.14,footTilt:0,armRoll:0,deviations:[],architectural:!gathering,mirrored:false,enclosed:false}};
 });

 const overlap=gathering?enforceContactOverlap(result,makeSolid,{minimum:.05,lockZ:false,radialYaw:typology==='void-field-gathering',protectedCircle:atrium?{center:atrium.center,radius:atrium.radius}:undefined}):enforceLetterOverlap(result,makeSolid,layout.topographic?center:undefined,foundation.family==='void');
 result=overlap.placements;
 const boundsOf=(placements:IntersectionPlacement[])=>{let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const solid of placements.map(makeSolid)){const box=solid.boundingBox();for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],box.min[axis]);max[axis]=Math.max(max[axis],box.max[axis]);}}return Math.max(...max.map((value,axis)=>value-min[axis]),1e-8);};
 const gapOptions={radialYaw:typology==='void-field-gathering',protectedCircle:atrium?{center:atrium.center,radius:atrium.radius}:undefined};
 let maxGap=typology==='vertical-void-lobby'?0.1*boundsOf(result)/20:0.1;
 let closed=limitAdjacentLetterGap(result,sequence,makeSolid,maxGap,gapOptions);
 result=closed.placements;
 if(typology==='vertical-void-lobby'){const span=boundsOf(result);if(closed.largest*20/span>0.1+1e-4){closed=limitAdjacentLetterGap(result,sequence,makeSolid,0.1*span/20,gapOptions);result=closed.placements;}}
 const adjacentGapFeet=typology==='vertical-void-lobby'?closed.largest*20/Math.max(boundsOf(result),1e-8):closed.largest;
 const originalKeys=new Set(originalLetterJoins(originals).map(j=>j.a+':'+j.b));
 const preservedPairs=originalLetterJoins(result.map(makeSolid)).filter(j=>originalKeys.has(j.a+':'+j.b)).map(j=>[j.a,j.b]);
 return {placements:result,sequence,preservedPairs,atrium,overlapFractions:overlap.fractions,riseFractions:overlap.riseFractions,operations:[
  atrium?typology==='void-field-gathering'?`Void field radial foundation: letters follow source angular directions around a protected opening of radius ${atrium.radius.toFixed(3)} ft. Enclosure and wall letters stand upright; floor plates stay horizontal. Ring setbacks stay between 10% and 30% of local width.`:`Inserted plate foundation: letters align to a shared vertical axis beside a protected opening of radius ${atrium.radius.toFixed(3)} ft. Yaw stays on 90° increments and selected plates offset by 10–25% of plate depth.`:enclosurePoses?typology==='contained-room-within-volume'?'Contained room: letters converge on the central volume, U openings face inward, enclosure and wall letters stand upright, and stagger stays within 15% of letter width.':'Linear gallery: each letter follows its local circulation tangent within ±15°, with orthogonal yaw where the gallery turns. Alternating setbacks are 15–35% of local width. Edge and wall letters stand upright.':amphitheater?`Stepped amphitheater: yaw offsets 0°, 15°, 30°, 45° or 90° relative to the circulation axis; L and U stay horizontal, V stands upright at ±90°, and horizontal stagger is ${operations.staggerPercent}% of representative width.`:foundation.description,
  ...(amphitheater?['Stepped amphitheater: L forms define terrace boundaries, U forms gathering enclosures, and V forms circulation transitions.']:[]),
  ...(gathering?[`Gathering standards: Z is up; yaw about Z, X tilt and Y tilt use degrees. Each letter rotates around its original local origin using XYZ Euler order, then is translated to its world position. Z position is independent of rotation. Rotation limits: X ${angleLimits.xMin}° to ${angleLimits.xMax}°, Y ${angleLimits.yMin}° to ${angleLimits.yMax}°, Z ${angleLimits.zMin}° to ${angleLimits.zMax}°.` ,
   "Original letter identities and axis proportions are retained; original and generated transforms are recorded in the workflow. Floor and wall previews classify surfaces by orientation; semantic enclosure and void-boundary designations require further validation."]:[]),
  ...(layout.topographic?['Curved U/C elements first, then L, then V. Faces progressively tilt from horizontal to vertical. Connections use horizontal XY bridge plates. Letter dimensions follow the selected source and typology scales without a fixed height cap.']:[]),
  ...(!gathering?[(layout.topographic?'Topographical faces progress from horizontal to vertical; Vs finish at 90 degrees.':((typology==='flat-deep-plan-plate'||typology==='inserted-horizontal-plate')?'Letters rotate in 90-degree YZ increments.':'V faces tilt 45–135 degrees relative to XY (45 degrees initially).'))+' All letters rise along Z; 75% of the preceding letter height is the target, reduced when needed to keep 25% overlap. '+overlap.riseFractions.filter(r=>r<.75-1e-6).length+' level rises were reduced.']:[]),
  ...(!gathering?['Each letter overlaps the union of the other letters by at least 25% of its own solid volume; shared regions count once. Minimum verified overlap: '+(Math.min(...overlap.fractions)*100).toFixed(1)+'%.']:[]),
  gathering?`Gathering letters ${operations.levelRise>0?`rise ${operations.levelRise.toFixed(3)} ft from one sequence level to the next, independent of rotation`:amphitheater?'rise one terrace at a time using the amphitheater level spacing':typology==='void-field-gathering'?'alternate between the base level and a raised perimeter gallery':typology==='inserted-horizontal-plate'?'share a floor level in successive pairs':typology==='contained-room-within-volume'?'hold the central enclosure at the source level and raise edge letters to a secondary level':typology==='linear-edge-gallery'?'shift alternate gallery groups between adjacent levels':'retain their source elevations'}. Horizontal stagger is ${operations.staggerPercent}% of representative letter width at ${operations.staggerDirection}° to the source axis. Each letter overlaps the union of the other letters before bridges are added. Minimum verified overlap: ${(Math.min(...overlap.fractions)*100).toFixed(1)}%. Floor plates and wall, edge, and enclosure letters keep a shared lap.`:foundation.family==='void'?'Letters share a vertical axis; every letter overlaps the others by at least 25% and neighboring levels receive rounded bridges.':'Every letter interlocks with other selected letters by at least 25% of its own volume. Positions close gaps after the foundation layout; rotation intervals and letter proportions are preserved. Bridges connect adjacent sequence members or surfaces within 2 feet.',
  gathering?'Letter-space rules: selected U, L and V profiles and their original axis proportions are retained.':'Letter-space rules: U becomes a curved band, L becomes a 90-degree corner, and V becomes a 45-degree wedge.',
  'Typology priority: '+priority.join(' > ')+'. Initial scales: primary 140%, secondary 100%, supporting 75%; letter dimensions have no fixed minimum or maximum. All selected letters are used.',
  gathering?'Foundation rotations are constrained by the selected axis limits. Adjacent letters connect through designed connectors.':'Foundation rotation intervals are retained. Direct interlocking takes priority over exact placement spacing or symmetry.',
  `Adjacent letters in the typology sequence stay within a 0.1 ft clear gap. Largest gap: ${adjacentGapFeet.toFixed(3)} ft.`,
  'Final continuity is checked after adding intersection or bridge connections. Axis-based spaces receive connecting floor plates. The enclosing cube is 20 × 20 × 20 ft, centered on the letters.'
 ],supported:true,officePlan:null};
}
