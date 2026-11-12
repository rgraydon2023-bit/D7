import type { Manifold, ManifoldToplevel } from 'manifold-3d/manifold';

/** Construct letter-derived terrace plates; each retained component intersects its source letter. */
export function amphitheaterTerraces(wasm:ManifoldToplevel,letters:Manifold[],sequence:number[],own:(solid:Manifold)=>Manifold) {
 const {Manifold}=wasm, plates:Manifold[]=[];let recesses=0;
 for(let level=0;level<sequence.length;level++){
  const letter=letters[sequence[level]],box=letter.boundingBox(),width=box.max[0]-box.min[0],depth=box.max[1]-box.min[1],height=box.max[2]-box.min[2];
  if(width<=1e-8||depth<=1e-8||height<=1e-8)continue;
  const edge=Math.min(width,depth)*.06,thickness=Math.min(height*.2,Math.min(width,depth)*.06),z=box.min[2]+height*.25;
  const outline=letter.project(),expanded=outline.offset(edge);
  let plate:Manifold;
  try{plate=own(own(expanded.extrude(thickness)).translate([0,0,z]));}finally{outline.delete();expanded.delete();}
  // Recess one side by one quarter of its local bay depth, alternating by level.
  const notchDepth=depth*.25,notchWidth=width*.3;
  const notch=own(Manifold.cube([notchWidth,notchDepth+edge*2,thickness*3]).translate([level%2?box.max[0]-notchWidth:box.min[0],level%2?box.max[1]-notchDepth:box.min[1]-edge,z-thickness]));
  const recessed=own(plate.subtract(notch));
  if(recessed.volume()<plate.volume()-1e-10){plate=recessed;recesses++;}
  for(const piece of plate.decompose()){
   own(piece);const intersection=own(piece.intersect(letter));
   if(intersection.volume()>letter.volume()*1e-10)plates.push(piece);
  }
 }
 return {solid:plates.length?own(Manifold.union(plates)):null,count:plates.length,recesses};
}
