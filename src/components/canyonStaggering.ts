import type { Manifold, ManifoldToplevel } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringOperations } from './gatheringOperations';

/** Letter-derived, level floor boundaries with alternating recessed pockets. */
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
  if(notchDepth>1e-8&&notchWidth>1e-8&&notchDepth>=controls.minimumClearance&&notchWidth>=controls.minimumClearance){
   const notch=own(Manifold.cube([notchWidth,notchDepth+edge*2,thickness*3]).translate([level%2?box.max[0]-notchWidth:box.min[0],level%2?box.max[1]-notchDepth:box.min[1]-edge,z-thickness]));
   const recessed=own(plate.subtract(notch));if(recessed.volume()<plate.volume()-1e-10){plate=recessed;recesses++;}
  }else if(notchDepth>1e-8&&notchWidth>1e-8)skippedClearance++;
  if(controls.boundaryRotation){plate=own(own(own(plate.translate([-placement.x,-placement.y,0])).rotate([0,0,controls.boundaryRotation])).translate([placement.x,placement.y,0]));}
  if(protectedVoid)plate=own(plate.subtract(protectedVoid));
  let kept=false;for(const piece of plate.decompose()){
   own(piece);const intersection=own(piece.intersect(letter));
   if(intersection.volume()>letter.volume()*1e-10){plates.push(piece);const bounds=piece.boundingBox();measurements.push({sourceIndex,min:[...bounds.min] as [number,number,number],max:[...bounds.max] as [number,number,number]});kept=true;}
  }
  if(kept)sourceIndices.push(sourceIndex);
 }
 return {solid:plates.length?own(Manifold.union(plates)):null,count:plates.length,recesses,skippedClearance,sourceIndices,measurements};
}
