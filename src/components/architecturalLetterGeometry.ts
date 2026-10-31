import * as THREE from "three";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import type { Letter } from "./letterTypes";

export type LetterPlacementRules = {
 yaw:number; level:number; supportZ:number; strokeWidth:number;
 footTilt:number; armRoll:number; deviations:string[];
 architectural?:boolean; mirrored?:boolean; enclosed?:boolean;
};
function spaceProfile(letter:Letter,mirrored=false,enclosed=false) {
 const shape=new THREE.Shape(),flip=mirrored?-1:1;
 const trace=(points:number[][])=>{const pts=points.map(([x,y])=>new THREE.Vector2(x,y*flip));if(mirrored)pts.reverse();shape.setFromPoints(pts);};
 if(letter==='U'){
  const pts:number[][]=[[-.5,.5],[-.5,0]];
  for(let i=0;i<=40;i++){const a=Math.PI+Math.PI*i/40;pts.push([.5*Math.cos(a),.5*Math.sin(a)]);}
  pts.push([.5,.5],[.34,.5],[.34,0]);
  for(let i=40;i>=0;i--){const a=Math.PI+Math.PI*i/40;pts.push([.34*Math.cos(a),.34*Math.sin(a)]);}
  pts.push([-.34,.5]);trace(pts);
 }else if(letter==='L'){
  trace(enclosed?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]:[[-.5,-.5],[.5,-.5],[.5,-.34],[-.34,-.34],[-.34,.5],[-.5,.5]]);
  if(enclosed){const hole=new THREE.Path();hole.setFromPoints([new THREE.Vector2(-.34,-.34),new THREE.Vector2(-.34,.34),new THREE.Vector2(.34,.34),new THREE.Vector2(.34,-.34)]);shape.holes.push(hole);}
 }else{
  const a=Math.tan(Math.PI/8);
  trace(enclosed?[[0,-1],[a,0],[0,1],[-a,0]]:[[-a,.5],[0,-.5],[a,.5],[a-.14,.5],[0,-.16],[-a+.14,.5]]);
  if(enclosed){const hole=new THREE.Path();hole.setFromPoints([new THREE.Vector2(0,-.66),new THREE.Vector2(-a+.14,0),new THREE.Vector2(0,.66),new THREE.Vector2(a-.14,0)]);shape.holes.push(hole);}
 }
 return shape;
}
const cache=new Map<string,THREE.BufferGeometry>();
/** Local cantilever/roof lift; whole footprints remain level in their support plane. */
export function architecturalLetterGeometry(letter:Letter,thickness:number,rules?:LetterPlacementRules) {
 if(!rules)return getLetterVolumeGeometry(letter,thickness);
 const key=JSON.stringify([letter,thickness,rules.footTilt,rules.armRoll,rules.architectural,rules.mirrored,rules.enclosed]);
 const found=cache.get(key);if(found)return found;
 const depth=thickness/100+.02;
 const geometry=rules.architectural?new THREE.ExtrudeGeometry(spaceProfile(letter,rules.mirrored,rules.enclosed),{depth,bevelEnabled:false,curveSegments:40,steps:1}).translate(0,0,-depth/2):getLetterVolumeGeometry(letter,thickness).clone();const pos=geometry.getAttribute("position");
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i);
  const lift=letter==="L"?Math.max(0,x+.12)*Math.tan(THREE.MathUtils.degToRad(rules.footTilt)):
   letter==="V"?Math.max(0,Math.abs(x)-.15)*Math.tan(THREE.MathUtils.degToRad(rules.armRoll)):0;
  pos.setZ(i,pos.getZ(i)+lift);
 }
 pos.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();cache.set(key,geometry);return geometry;
}
