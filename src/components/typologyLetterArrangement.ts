import { enforceContactOverlap, enforceLetterOverlap, letterBoxGap, letterOverlapFractions, limitAdjacentLetterGap } from './letterOverlapRule';
import { ATRIUM_TYPOLOGIES, gatheringAtriumLayout, gatheringEnclosureLayout } from './gatheringAtriumLayout';
import { editorRotationSteps, foundationPoses } from './typologyOrientationRules';
import { typologyLetterPriority } from './typologyLetterOrder';
import { originalLetterJoins } from './preserveLetterIntersections';
import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import { DEFAULT_GATHERING_OPERATIONS, GATHERING_TYPOLOGIES, type GatheringOperations } from './gatheringOperations';
import { OFFICE_TYPOLOGIES } from './officeWorkspaceRules';
import { arrangeIntersectingOfficeLetters } from './officeLetterIntersections';
import * as THREE from 'three';

export type GatheringAngleLimits = { xMin:number; xMax:number; yMin:number; yMax:number; zMin:number; zMax:number };
export const DEFAULT_GATHERING_ANGLES:GatheringAngleLimits = {xMin:-180,xMax:180,yMin:-180,yMax:180,zMin:0,zMax:360};

// An interior point lets us bring a separated pair into contact without
// changing the letter's shape or rotation.
function letterInteriorPoint(solid:Manifold) {
 const mesh=solid.getMesh(),stride=mesh.numProp;let area=0,point=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<mesh.triVerts.length;i+=3){const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromArray(mesh.vertProperties,mesh.triVerts[i+k]*stride));const n=b.clone().sub(a).cross(c.clone().sub(a));if(n.lengthSq()>area){area=n.lengthSq();point=a.add(b).add(c).divideScalar(3);normal=n.normalize();}}
 const box=solid.boundingBox(),epsilon=Math.max(1e-8,Math.min(...box.max.map((v,i)=>v-box.min[i]))*.002);
 return point.addScaledVector(normal,-epsilon);
}

export function typologyLayout(id:string) {
 return {ring:/amphitheater|void-field|void-edge|contained/.test(id),topographic:/topographic|folded-undulating/.test(id),vertical:id==='vertical-void-lobby',compressed:id==='compressed-sequential-lobby',axis:/vertical|linear|continuous|open-hall|flat-deep|cascaded|inserted/.test(id)};
}
function letterOrientation(p:IntersectionPlacement) {
 const rad=THREE.MathUtils.degToRad;
 return new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(p.rx),rad(p.ry),rad(p.rz),'XYZ'));
}

function matchingNeighborOrientations(a:IntersectionPlacement,b:IntersectionPlacement) {
 // Equivalent Euler angles and opposite quaternion signs are the same orientation.
 return a.letter===b.letter&&Math.abs(letterOrientation(a).dot(letterOrientation(b)))>1-1e-10;
}

function varyLobbyNeighborOrientations(placements:IntersectionPlacement[],sequence:number[],typology:string) {
 const steps=editorRotationSteps(typology);
 for(let k=1;k<sequence.length;k++){
  const id=sequence[k],p=placements[id],previous=placements[sequence[k-1]];
  if(!matchingNeighborOrientations(previous,p))continue;
  // For Linear Gallery, turn within the face plane so XY and YZ stay locked.
  // In the topographic spiral a world Z turn retains the face tilt.
  const axis=typology==='linear-gallery-lobby'&&Math.abs(p.ry)===90?0:
   typology==='compressed-sequential-lobby'||typology==='continuous-hall-lobby'?1:2;
  const turn=new THREE.Vector3().setComponent(axis,1);
  const q=new THREE.Quaternion().setFromAxisAngle(turn,THREE.MathUtils.degToRad(steps[axis])).multiply(letterOrientation(p));
  const e=new THREE.Euler().setFromQuaternion(q,'XYZ'),deg=THREE.MathUtils.radToDeg;
  const angles=[e.x,e.y,e.z].map(deg).map(angle=>typology==='linear-gallery-lobby'?Math.round(angle/90)*90:angle);
  placements[id]={...p,rx:angles[0],ry:angles[1],rz:angles[2],letterRules:p.letterRules?{...p.letterRules,yaw:angles[2]}:undefined};
 }
}

/** Typology-driven reinterpretation happens after the untouched original selection. */
export function arrangeTypologyLetters(source:IntersectionPlacement[],originals:Manifold[],makeSolid:(p:IntersectionPlacement)=>Manifold,typology:string, angleLimits:GatheringAngleLimits=DEFAULT_GATHERING_ANGLES,operations:GatheringOperations=DEFAULT_GATHERING_OPERATIONS,thicknessPercent=12) {
 if(OFFICE_TYPOLOGIES.has(typology)){const office=arrangeIntersectingOfficeLetters(source,typology,thicknessPercent,makeSolid);return {...office,atrium:null};}
 const priority=typologyLetterPriority(typology),layout=typologyLayout(typology),n=source.length, gathering=GATHERING_TYPOLOGIES.has(typology);
 const topographicLobby=typology==='topographic-ground-field-lobby';
 const placementOrder=topographicLobby?['L','U','V']:layout.topographic?['U','L','V']:priority;
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
 const sharedLobbyAxis=['compressed-sequential-lobby','continuous-hall-lobby','linear-gallery-lobby'].includes(typology);
 const lobby=typology.endsWith('-lobby');
 const layeredGathering=typology==='void-field-gathering';
 const sharedZGathering=typology==='contained-room-within-volume';
 const stackedGathering=layeredGathering||sharedZGathering;
 const commonScale=source.reduce((sum,p)=>sum+p.scale/n,0);
 let result=source.map(p=>({...p}));
 sequence.forEach((id,k)=>{
  const p=source[id],importance=priority.indexOf(p.letter),factor=[1.4,1,.75][importance];
  let {u,v,z}=foundation.poses[id];const {scaleMultiplier}=foundation.poses[id];
  if(atrium||enclosurePoses){const pose=atrium?atrium.poses[id]:enclosurePoses![id];u=pose.u;v=pose.v;}
  if(gathering&&!atrium&&!enclosurePoses){if(!(amphitheater&&!(operations.levelRise>0)))z=p.z-center[2];const direction=(foundation.heading+operations.staggerDirection)*Math.PI/180,offset=(k%2?1:-1)*representativeWidth*operations.staggerPercent/100;if(amphitheater)v=0;u+=offset*Math.cos(direction-(amphitheater?axisYaw:0));v+=offset*Math.sin(direction-(amphitheater?axisYaw:0));}
  if(atrium||enclosurePoses)z=p.z-center[2];
  if(gathering&&!(operations.levelRise>0)){if(typology==='void-field-gathering')z=(k%2)*representativeWidth*.45;else if(typology==='inserted-horizontal-plate')z=Math.floor(k/2)*representativeWidth*.5;else if(typology==='linear-edge-gallery')z=(Math.floor(k/2)%2)*representativeWidth*.35;else if(typology==='contained-room-within-volume'&&operations.boundaryRoles[p.letter]==='edge')z=representativeWidth*.35;}
  if(gathering&&(operations.levelRise??0)>0)z=k*operations.levelRise;
  if(sharedZGathering){u=0;v=0;}
  let {rx,ry,rz}=atrium?atrium.poses[id]:enclosurePoses?enclosurePoses[id]:foundation.poses[id];
  if(layeredGathering){rx=0;ry=0;}
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
  const tilt=topographicLobby?THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...[rx,ry,rz].map(THREE.MathUtils.degToRad) as [number,number,number],'XYZ'))).z,-1,1))):0;
  const scale=topographicLobby?commonScale*(1.4-.65*THREE.MathUtils.clamp(tilt/120,0,1)):sharedLobbyAxis?commonScale:p.scale*factor*scaleMultiplier;
  result[id]={...p,x:center[0]+(amphitheater?u*Math.cos(axisYaw)-v*Math.sin(axisYaw):u),y:center[1]+(amphitheater?u*Math.sin(axisYaw)+v*Math.cos(axisYaw):v),z:center[2]+z,rx,ry,rz,scale,
   scaleX:gathering?p.scaleX:1,scaleY:gathering?p.scaleY:1,scaleZ:sharedLobbyAxis?1:(p.scaleZ??1),
   letterRules:{yaw:rz,level:k,supportZ:center[2]+z,strokeWidth:scale*.14,footTilt:0,armRoll:0,deviations:[],architectural:!gathering,mirrored:false,enclosed:false}};
 });
 if(stackedGathering){
  const depths=result.map(p=>{const box=makeSolid(p).boundingBox();return box.max[2]-box.min[2];});
  let level=center[2];
  sequence.forEach((id,k)=>{
   if(k>0){const span=(depths[sequence[k-1]]+depths[id])/2;level+=Math.min(operations.levelRise>0?operations.levelRise:span*.75,span*.85);}
   const p=result[id];result[id]={...p,z:level,letterRules:p.letterRules?{...p.letterRules,supportZ:level}:undefined};
  });
 }

 let neighborIntersections=0;
 if(sharedLobbyAxis){
  // The same baseline faces the protected opening. Odd sequence members
  // receive a 45-degree rotation around world Y.
  sequence.forEach((id,k)=>{
   const p=result[id],base=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
   if(typology==='linear-gallery-lobby'){
    const horizontal=k===0||(k===sequence.length-1&&sequence.length>1);
    const z=center[2]+(horizontal?(k===0?-.5:.5)*commonScale:0);
    result[id]={...p,x:center[0],y:center[1],z,rx:0,ry:horizontal?0:90,rz:0,letterRules:p.letterRules?{...p.letterRules,yaw:0,supportZ:z}:undefined};
    return;
   }
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),k%2?Math.PI/4:0).multiply(base),e=new THREE.Euler().setFromQuaternion(q,'XYZ');
   const aperture=new THREE.Vector3(p.letter==='L'?.06:0,p.letter==='V'?.22:p.letter==='L'?.06:.05,0).multiplyScalar(commonScale).applyQuaternion(q);
   const oriented={...p,x:center[0],y:center[1]-aperture.y,z:center[2]-aperture.z,rx:THREE.MathUtils.radToDeg(e.x),ry:THREE.MathUtils.radToDeg(e.y),rz:THREE.MathUtils.radToDeg(e.z)};
   result[id]={...oriented,letterRules:oriented.letterRules?{...oriented.letterRules,yaw:oriented.rz}:undefined};
  });
  varyLobbyNeighborOrientations(result,sequence,typology);
  // Search one equal X increment for the entire sequence. Prefer candidates
  // with all neighbors intersecting, then the closest feasible 2:1 outline.
  const bases=result.map(makeSolid),boxes=bases.map(solid=>solid.boundingBox());
  const zSpan=Math.max(...boxes.map(b=>b.max[2]))-Math.min(...boxes.map(b=>b.min[2]));
  const maxStep=sequence.length>1?Math.max(commonScale*.02,2*zSpan/(sequence.length-1)):0;
  let bestStep=0,bestConnected=-1,bestError=Infinity;
  for(let step=1;step<=48;step++){
   const increment=maxStep*step/48,solids=sequence.map((id,k)=>bases[id].translate([(k-(sequence.length-1)/2)*increment,0,0]));
   let connected=0;for(let k=1;k<solids.length;k++){const intersection=solids[k-1].intersect(solids[k]);if(intersection.volume()>Math.min(solids[k-1].volume(),solids[k].volume())*1e-8)connected++;intersection.delete();}
   const bounds=solids.map(solid=>solid.boundingBox()),xSpan=Math.max(...bounds.map(b=>b.max[0]))-Math.min(...bounds.map(b=>b.min[0])),error=Math.abs(xSpan/Math.max(zSpan,1e-8)-2);
   if(connected>bestConnected||(connected===bestConnected&&error<bestError)){bestConnected=connected;bestError=error;bestStep=increment;}
   solids.forEach(solid=>solid.delete());
  }
  sequence.forEach((id,k)=>{result[id]={...result[id],x:center[0]+(k-(sequence.length-1)/2)*bestStep};});
  neighborIntersections=bestConnected;
 }

 if(lobby&&!sharedLobbyAxis)varyLobbyNeighborOrientations(result,sequence,typology);
 // Preserve the Topographic Ground-Field spiral even when its selected letter
 // profiles cannot also satisfy the general 25% lobby overlap target.
 const overlap=sharedLobbyAxis||stackedGathering||topographicLobby?{placements:result,fractions:letterOverlapFractions(result.map(makeSolid)),riseFractions:[] as number[]}:gathering?enforceContactOverlap(result,makeSolid,{minimum:.05,lockZ:false,radialYaw:typology==='void-field-gathering',protectedCircle:atrium?{center:atrium.center,radius:atrium.radius}:undefined,allowIncomplete:true}):enforceLetterOverlap(result,makeSolid,layout.topographic?center:undefined,foundation.family==='void');
 result=overlap.placements;
 const boundsOf=(placements:IntersectionPlacement[])=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const solid of placements.map(makeSolid)){const box=solid.boundingBox();for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],box.min[axis]);max[axis]=Math.max(max[axis],box.max[axis]);}}return Math.max(...max.map((value,axis)=>value-min[axis]),1e-8);};
 const gapOptions={radialYaw:typology==='void-field-gathering',xOnly:sharedLobbyAxis,protectedCircle:atrium?{center:atrium.center,radius:atrium.radius}:undefined};
 const maxGap=typology==='vertical-void-lobby'?0.1*boundsOf(result)/20:0.1;
 let closed=sharedLobbyAxis||stackedGathering?{placements:result,largest:0}:limitAdjacentLetterGap(result,sequence,makeSolid,maxGap,gapOptions);
 result=closed.placements;
 let directPairs=0;
 if(gathering&&sequence.length>1){
  const solids=result.map(makeSolid);
  const intersects=(a:Manifold,b:Manifold)=>{const intersection=a.intersect(b);try{return intersection.volume()>Math.min(a.volume(),b.volume())*1e-7;}finally{intersection.delete();}};
  const clearsOpening=(solid:Manifold)=>{if(!atrium||atrium.radius<=0)return true;const box=solid.boundingBox(),x=Math.max(box.min[0],Math.min(atrium.center[0],box.max[0])),y=Math.max(box.min[1],Math.min(atrium.center[1],box.max[1]));return Math.hypot(x-atrium.center[0],y-atrium.center[1])>=atrium.radius;};
  for(let k=1;k<sequence.length;k++){
   const i=sequence[k],prev=sequence[k-1];if(intersects(solids[prev],solids[i])){directPairs++;continue;}
   const start=result[i],delta=letterInteriorPoint(solids[prev]).sub(letterInteriorPoint(solids[i]));let chosen:IntersectionPlacement|undefined,fallback:IntersectionPlacement|undefined;
   if(layeredGathering)delta.z=0;
   if(sharedZGathering){
    const a=solids[prev].boundingBox(),b=solids[i].boundingBox();
    delta.x=0;delta.y=0;
    delta.z=Math.min(0,result[prev].z+Math.max(1e-6,Math.min(a.max[2]-a.min[2],b.max[2]-b.min[2])*.05)-start.z);
   }
   for(let step=1;step<=40;step++){
    const t=step/40,pose={...start,x:start.x+delta.x*t,y:start.y+delta.y*t,z:start.z+delta.z*t,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+delta.z*t}:undefined};
    const solid=makeSolid(pose);if(!intersects(solids[prev],solid))continue;
    if(!fallback)fallback=pose;if(clearsOpening(solid)){chosen=pose;break;}
   }
   const pose=chosen??fallback;if(pose){result[i]=pose;solids[i]=makeSolid(pose);directPairs++;}
  }
  overlap.fractions=letterOverlapFractions(solids);
  closed.largest=sequence.slice(1).reduce((largest,id,k)=>Math.max(largest,letterBoxGap(solids[sequence[k]].boundingBox(),solids[id].boundingBox()).dist),0);
 }
 if(sharedLobbyAxis)overlap.fractions=letterOverlapFractions(result.map(makeSolid));
 if(typology==='topographic-ground-field-lobby'){
  const fractions=letterOverlapFractions(result.map(makeSolid));
  overlap.fractions=fractions;
  const boxes=result.map(p=>makeSolid(p).boundingBox());
  const low=Math.min(...boxes.map(box=>box.min[2])), high=Math.max(...boxes.map(box=>box.max[2]));
  const factor=Math.min(1,4/Math.max(high-low,1e-8));
  closed.largest*=factor;
  result=result.map(p=>({...p,x:center[0]+(p.x-center[0])*factor,y:center[1]+(p.y-center[1])*factor,z:(p.z-low)*factor,scale:p.scale*factor,letterRules:p.letterRules?{...p.letterRules,supportZ:(p.letterRules.supportZ-low)*factor,strokeWidth:p.letterRules.strokeWidth*factor}:undefined}));
 }
 if(typology==='vertical-void-lobby'){const span=boundsOf(result);if(closed.largest*20/span>0.1+1e-4){closed=limitAdjacentLetterGap(result,sequence,makeSolid,0.1*span/20,gapOptions);result=closed.placements;}}
 if(lobby&&sequence.slice(1).some((id,k)=>matchingNeighborOrientations(result[sequence[k]],result[id])))throw new Error('The lobby could not keep adjacent copies of the same letter at different orientations. Try another letter selection.');
 const adjacentGapFeet=typology==='vertical-void-lobby'?closed.largest*20/Math.max(boundsOf(result),1e-8):closed.largest;
 const originalKeys=new Set(originalLetterJoins(originals).map(j=>j.a+':'+j.b));
 const preservedPairs=originalLetterJoins(result.map(makeSolid)).filter(j=>originalKeys.has(j.a+':'+j.b)).map(j=>[j.a,j.b]);
 return {placements:result,sequence,preservedPairs,atrium,overlapFractions:overlap.fractions,riseFractions:overlap.riseFractions,operations:[
  atrium?typology==='void-field-gathering'?`Void field radial foundation: letters follow source angular directions around a protected opening of radius ${atrium.radius.toFixed(3)} ft. Letter faces form horizontal layers. Initial ring setbacks stay between 10% and 30% of local width.`:`Inserted plate foundation: letters align to a shared vertical axis beside a protected opening of radius ${atrium.radius.toFixed(3)} ft. Yaw stays on 90° increments and selected plates offset by 10–25% of plate depth.`:enclosurePoses?typology==='contained-room-within-volume'?'Contained room: letter centers align on a shared vertical axis; enclosure and wall letters keep their selected upright orientations.':'Linear gallery: each letter follows its local circulation tangent within ±15°, with orthogonal yaw where the gallery turns. Alternating setbacks are 15–35% of local width. Edge and wall letters stand upright.':amphitheater?`Stepped amphitheater: yaw offsets 0°, 15°, 30°, 45° or 90° relative to the circulation axis; L is horizontal; U and V use permitted horizontal/upright poses, and horizontal stagger is ${operations.staggerPercent}% of representative width.`:foundation.description,
  ...(amphitheater?['Stepped amphitheater: L forms define terrace boundaries, U forms gathering enclosures, and V forms circulation transitions.']:[]),
  ...(layeredGathering?['Void-field letters form horizontal layers at distinct ascending Z levels. Rise is limited to 85% of the adjacent half-depth sum so neighboring layers can intersect. Horizontal adjustments retain those levels; no bridges or extra floor plates are added.']:[]),
  ...(sharedZGathering?['Contained-room letters share the same X and Y center and stack upward along Z. Existing letter orientations are retained. Elevations may tighten to obtain direct intersections while preserving the shared axis and ascending order.']:[]),
  ...(gathering&&sequence.length>1?[`Direct letter intersections: ${directPairs} of ${sequence.length-1} adjacent pairs intersect before joining.`,...(directPairs<sequence.length-1?['Constraint note: Some adjacent letters could not be made to intersect directly; the generated layout is retained.']:[])]:[]),
  ...(gathering?['Direct-intersection acceptance uses positive solid contact and final connectivity; no fixed overlap percentage is required.']:[]),
  ...(sharedLobbyAxis?[typology==='linear-gallery-lobby'?'The first and last letters are horizontal on XY at the bottom and top; intervening letters stand on YZ. All rotations use 90° increments.':'Letters begin in the YZ plane and surround a protected void along X. The sequence uses equal X offsets with alternating 45-degree Y rotation.']:[]),
  ...(sharedLobbyAxis?[typology==='linear-gallery-lobby'?'Letters have equal X offsets. No minimum or maximum overlap percentage is imposed.':'Letters have equal X offsets; alternating letters rotate 45 degrees around Y. No minimum or maximum overlap percentage is imposed.']:[]),
  ...(lobby?['Neighbor rotation rule: in the generated layout, adjacent copies of the same letter have different orientations.']:[]),
  ...(sharedLobbyAxis&&neighborIntersections<Math.max(0,sequence.length-1)?[`Constraint note: ${neighborIntersections} of ${sequence.length-1} adjacent letter pairs intersect before bridging; the remaining pairs require bridges.`]:[]),
  ...(gathering?[`Gathering standards: Z is up; yaw about Z, X tilt and Y tilt use degrees. Each letter rotates around its original local origin using XYZ Euler order, then is translated to its world position. Z position is independent of rotation. Rotation limits: X ${angleLimits.xMin}° to ${angleLimits.xMax}°, Y ${angleLimits.yMin}° to ${angleLimits.yMax}°, Z ${angleLimits.zMin}° to ${angleLimits.zMax}°.` ,
   "Original letter identities and axis proportions are retained; original and generated transforms are recorded in the workflow. Floor and wall previews classify surfaces by orientation; semantic enclosure and void-boundary designations require further validation."]:[]),
  ...(layout.topographic?[topographicLobby?'The spiral proceeds L → U → V around the center Z-axis. L faces tilt 0–45°, U faces tilt 45–90°, and V faces tilt 90–120° relative to XY, in 15° steps. Connections use horizontal XY bridge plates. The letter assembly is grounded and uniformly reduced only when needed to fit within four feet; the source letter profiles and proportions, including the U width-to-height ratio, are retained.':'Curved U/C elements first, then L, then V. Faces progressively tilt from horizontal to vertical. Connections use horizontal XY bridge plates. Letter dimensions follow the selected source and typology scales without a fixed height cap.']:[]),
  ...(!gathering&&!sharedLobbyAxis?[topographicLobby?'Topographic levels and adjacent gaps may adjust to retain the center-Z spiral. The 25% overlap target is measured but is not a generation constraint.':(layout.topographic?'Topographical faces progress from horizontal to vertical; Vs finish at 90 degrees.':((typology==='flat-deep-plan-plate'||typology==='inserted-horizontal-plate')?'Letters rotate in 90-degree YZ increments.':'V faces tilt 45–135 degrees relative to XY (45 degrees initially).'))+' All letters rise along Z; 75% of the preceding letter height is the target, reduced when needed to keep 25% overlap. '+overlap.riseFractions.filter(r=>r<.75-1e-6).length+' level rises were reduced.']:[]),
  ...(!gathering&&!sharedLobbyAxis?[topographicLobby?'Topographic overlap is non-blocking; measured minimum overlap: '+(Math.min(...overlap.fractions)*100).toFixed(1)+'%.':'Each letter overlaps the union of the other letters by at least 25% of its own solid volume; shared regions count once. Minimum verified overlap: '+(Math.min(...overlap.fractions)*100).toFixed(1)+'%.']:[]),
  gathering?`Gathering letters ${operations.levelRise>0?`initially target a ${operations.levelRise.toFixed(3)} ft rise between sequence levels`:amphitheater?'rise one terrace at a time using the amphitheater level spacing':typology==='void-field-gathering'?'form horizontal layers at distinct ascending levels':typology==='inserted-horizontal-plate'?'share a floor level in successive pairs':typology==='contained-room-within-volume'?'stack on a shared vertical axis at ascending levels':typology==='linear-edge-gallery'?'shift alternate gallery groups between adjacent levels':'retain their source elevations'}. ${sharedZGathering?"Horizontal stagger is inactive while the contained-room centers share a Z-axis.":`Initial horizontal stagger targets ${operations.staggerPercent}% of representative letter width at ${operations.staggerDirection}° to the source axis; positions may shift to make direct intersections.`} Measured overlap with the union of the other letters: ${(Math.min(...overlap.fractions)*100).toFixed(1)}%. Letter-derived floor plates are currently disabled.`:sharedLobbyAxis?'Letters follow the shared X-axis; adjacent connections establish continuity.':topographicLobby?'Letters retain the center-Z spiral and type-specific tilt bands even when measured overlap is below 25%. Adjacent gaps may close and connections may be added without making overlap a generation requirement.':foundation.family==='void'?'Letters share a vertical axis; every letter overlaps the others by at least 25% and neighboring levels receive rounded bridges.':'Every letter interlocks with other selected letters by at least 25% of its own volume. Positions close gaps after the foundation layout; rotation intervals and letter proportions are preserved. Bridges connect adjacent sequence members or surfaces within 2 feet.',
  gathering?'Letter-space rules: selected U, L and V profiles and their original axis proportions are retained.':topographicLobby?'Letter-space rules: the existing U curved-band width-to-height ratio is retained; L remains a 90-degree corner and V remains a 45-degree wedge.':'Letter-space rules: U becomes a curved band, L becomes a 90-degree corner, and V becomes a 45-degree wedge.',
  topographicLobby?'Typology priority: '+priority.join(' > ')+'. Letter scale decreases uniformly with face tilt, from 140% at 0° to 75% at 120°, using a shared reference size. All selected letters are used.':sharedLobbyAxis?'Typology priority: '+priority.join(' > ')+'. All selected letters use the same scale.':'Typology priority: '+priority.join(' > ')+'. Initial scales: primary 140%, secondary 100%, supporting 75%; letter dimensions have no fixed minimum or maximum. All selected letters are used.',
  gathering?'Foundation rotations are constrained by the selected axis limits. Adjacent letters connect by direct intersection.':sharedLobbyAxis?'Equal sequence spacing is retained when adding connections.':'Foundation rotation intervals are retained. Direct interlocking takes priority over exact placement spacing or symmetry.',
  sharedLobbyAxis?'Adjacent letters connect around the protected X-axis void.':`Adjacent letters in the typology sequence stay within a 0.1 ft clear gap. Largest gap: ${adjacentGapFeet.toFixed(3)} ft.`,
  gathering?'Final continuity is checked after intersecting the letters. The enclosing cube is 20 × 20 × 20 ft, centered on the letters.':'Final continuity is checked after adding intersection or bridge connections. Axis-based spaces receive connecting floor plates. The enclosing cube is 20 × 20 × 20 ft, centered on the letters.'
 ],supported:true,officePlan:null};
}
