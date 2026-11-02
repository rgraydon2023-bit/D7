import type { Manifold, ManifoldToplevel } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringOperations } from './gatheringOperations';

/** Staggered floor plates for the amphitheater, void field, and linear gallery, also used by the other gathering typologies. Level rise comes from the arranged placement heights. */
export function canyonStaggering(wasm:ManifoldToplevel,letters:Manifold[],placements:IntersectionPlacement[],sequence:number[],controls:GatheringOperations,protectedVoid:Manifold|null,own:(solid:Manifold)=>Manifold) {
 const {Manifold}=wasm,plates:Manifold[]=[],sourceIndices:number[]=[];let recesses=0,skippedClearance=0;const measurements:{sourceIndex:number;min:[number,number,number];max:[number,number,number]}[]=[];
 const dimensions=letters.flatMap(letter=>{const box=letter.boundingBox();return box.max.map((value,axis)=>value-box.min[axis]);}).filter(value=>value>1e-8);
 const thickness=Math.min(...dimensions)*.06;
 for(let level=0;level<sequence.length;level++){
  const sourceIndex=sequence[level],letter=letters[sourceIndex],placement=placements[sourceIndex],role=controls.boundaryRoles[placement.letter],box=letter.boundingBox(),width=box.max[0]-box.min[0],depth=box.max[1]-box.min[1],height=box.max[2]-box.min[2];
  if(role==='wall'||role==='void'||width<=1e-8||depth<=1e-8||height<=1e-8)continue;
  const edge=Math.min(width,depth)*.06,z=placement.z-thickness/2;
  if(z<box.min[2]-1e-8||z+thickness>box.max[2]+1e-8)throw new Error(`Cannot place the floor at the requested level for source letter ${sourceIndex+1}.`);
  const outline=letter.project(),expanded=outline.offset(edge);let plate:Manifold;
  try{plate=own(own(expanded.extrude(thickness)).translate([0,0,z]));}finally{outline.delete();expanded.delete();}
  const notchDepth=depth*controls.alcoveDepthPercent/100,notchWidth=width*controls.alcoveWidthPercent/100;
  const remainingClear=controls.minimumClearance<=0||(width-notchWidth+1e-8>=controls.minimumClearance&&depth-notchDepth+1e-8>=controls.minimumClearance);
  if(notchDepth>1e-8&&notchWidth>1e-8&&notchDepth>=controls.minimumClearance&&notchWidth>=controls.minimumClearance&&remainingClear){
   const notch=own(Manifold.cube([notchWidth,notchDepth+edge*2,thickness*3]).translate([level%2?box.max[0]-notchWidth:box.min[0],level%2?box.max[1]-notchDepth:box.min[1]-edge,z-thickness]));
   const recessed=own(plate.subtract(notch));if(recessed.volume()<plate.volume()-1e-10){plate=recessed;recesses++;}
  }else if(notchDepth>1e-8&&notchWidth>1e-8)skippedClearance++;
  if(controls.boundaryRotation&&role!=='floor'){const turn=(level%2?1:-1)*controls.boundaryRotation;plate=own(own(own(plate.translate([-placement.x,-placement.y,0])).rotate([0,0,turn])).translate([placement.x,placement.y,0]));}
  if(protectedVoid)plate=own(plate.subtract(protectedVoid));
  let kept=false;for(const piece of plate.decompose()){
   own(piece);const intersection=own(piece.intersect(letter));
   if(intersection.volume()>letter.volume()*1e-10){plates.push(piece);const bounds=piece.boundingBox();measurements.push({sourceIndex,min:[...bounds.min] as [number,number,number],max:[...bounds.max] as [number,number,number]});kept=true;}
  }
  if(kept)sourceIndices.push(sourceIndex);
 }
 let laps=0;
 const centerOf=(solid:Manifold)=>{const box=solid.boundingBox();return [(box.min[0]+box.max[0])/2,(box.min[1]+box.max[1])/2,(box.min[2]+box.max[2])/2] as [number,number,number];};
 // Floor laps rotate about Z only. The plate stays in a vertical plane, so every face is either horizontal or perpendicular to XY.
 const levelPlate=(from:[number,number,number],to:[number,number,number],width:number)=>{
  const dx=to[0]-from[0],dy=to[1]-from[1],span=Math.max(Math.hypot(dx,dy),width,1e-4),height=Math.max(Math.abs(to[2]-from[2]),thickness,1e-4);
  const angle=Math.atan2(dy,dx)*180/Math.PI,z=(from[2]+to[2])/2;
  return own(own(own(Manifold.cube([span,Math.max(width,1e-4),height],true)).rotate([0,0,angle])).translate([(from[0]+to[0])/2,(from[1]+to[1])/2,z]));
 };
 const share=(a:Manifold,b:Manifold)=>Math.min(a.volume(),b.volume())*.05;
 const overlapsEnough=(a:Manifold,b:Manifold,minimum:number)=>{const hit=a.intersect(b);try{return hit.volume()+1e-12>=minimum;}finally{hit.delete();}};
 for(let i=1;i<plates.length;i++){
  const a=plates[i-1],b=plates[i];
  if(overlapsEnough(a,b,share(a,b)))continue;
  const boxA=a.boundingBox(),boxB=b.boundingBox(),width=Math.min(boxA.max[0]-boxA.min[0],boxA.max[1]-boxA.min[1],boxB.max[0]-boxB.min[0],boxB.max[1]-boxB.min[1])*.28;
  let lap=levelPlate(centerOf(a),centerOf(b),width);if(!lap)continue;
  if(protectedVoid)lap=own(lap.subtract(protectedVoid));
  if(!lap.isEmpty()&&overlapsEnough(lap,a,1e-8)&&overlapsEnough(lap,b,1e-8)){plates.push(lap);laps++;}
 }
 const floor=plates.length?own(Manifold.union(plates)):null;
 for(let i=0;i<letters.length&&floor;i++){
  const role=controls.boundaryRoles[placements[i].letter];
  if(role!=='wall'&&role!=='edge'&&role!=='enclosure')continue;
  if(overlapsEnough(letters[i],floor,Math.min(letters[i].volume(),floor.volume())*.02))continue;
  let nearest=0,nearestDistance=Infinity;
  for(let p=0;p<plates.length;p++){const delta=centerOf(letters[i]).map((value,axis)=>value-centerOf(plates[p])[axis]);const distance=Math.hypot(...delta);if(distance<nearestDistance){nearestDistance=distance;nearest=p;}}
  const letterBox=letters[i].boundingBox(),plateBox=plates[nearest].boundingBox(),width=Math.min(letterBox.max[0]-letterBox.min[0],letterBox.max[1]-letterBox.min[1],plateBox.max[0]-plateBox.min[0],plateBox.max[1]-plateBox.min[1])*.22;
  let lap=levelPlate(centerOf(letters[i]),centerOf(plates[nearest]),width);if(!lap)continue;
  if(protectedVoid)lap=own(lap.subtract(protectedVoid));
  if(!lap.isEmpty()&&overlapsEnough(lap,letters[i],1e-8)&&overlapsEnough(lap,plates[nearest],1e-8)){plates.push(lap);laps++;}
 }
 return {solid:plates.length?own(Manifold.union(plates)):null,count:plates.length,recesses,skippedClearance,clearanceSatisfied:true,sourceIndices,measurements,laps};
}
