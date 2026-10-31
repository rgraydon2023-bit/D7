import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringOperations } from './gatheringOperations';

export const ATRIUM_TYPOLOGIES=new Set(['void-field-gathering','inserted-horizontal-plate']);
const normalize=(value:number)=>((value%360)+360)%360;

/** Preserve the source angular order and place each letter around a shared opening. */
export function gatheringAtriumLayout(source:IntersectionPlacement[],sequence:number[],typology:string,controls:GatheringOperations) {
 const n=source.length;if(!n)return {poses:[],center:[0,0] as [number,number],radius:0};
 const mean=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n],[0,0]);
 const center:[number,number]=[mean[0]+controls.protectedVoidOffsetX,mean[1]+controls.protectedVoidOffsetY];
 const width=source.reduce((sum,p)=>sum+p.scale*Math.max(p.scaleX,p.scaleY),0)/n;
 const radius=controls.protectedVoidRadius>0?controls.protectedVoidRadius:width*.18;
 const poses=source.map(()=>({u:0,v:0,rx:0,ry:0,rz:0}));
 sequence.forEach((index,k)=>{
  const letter=source[index],dx=letter.x-mean[0],dy=letter.y-mean[1];
  const sourceAngle=Math.hypot(dx,dy)>1e-8?Math.atan2(dy,dx)*180/Math.PI:k*360/n;
  const angle=typology==='void-field-gathering'?Math.round(sourceAngle/15)*15:Math.round(sourceAngle/90)*90;
  const radians=angle*Math.PI/180;
  // A footprint diagonal bounds the rotated source; stagger only moves outward from that clearance.
  const extent=letter.scale*1.5*Math.max(letter.scaleX,letter.scaleY,letter.scaleZ)*1.1;
  const localWidth=letter.scale*Math.max(letter.scaleX,letter.scaleY),setback=localWidth*(k%2?controls.staggerPercent:10)/100,distance=radius+extent+setback;
  const role=controls.boundaryRoles[letter.letter],upright=role==='wall';
  poses[index]={u:center[0]-mean[0]+Math.cos(radians)*distance,v:center[1]-mean[1]+Math.sin(radians)*distance,rx:upright?(k%2?90:-90):0,ry:0,rz:normalize(typology==='void-field-gathering'?angle+90:Math.round((angle+90)/90)*90)};
 });
 return {poses,center,radius};
}

/** Source-derived initial layouts for the contained room and linear gallery. */
export function gatheringEnclosureLayout(source:IntersectionPlacement[],sequence:number[],typology:string,controls:GatheringOperations,heading:number) {
 const n=source.length, mean=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n],[0,0]);
 const poses=source.map(()=>({u:0,v:0,rx:0,ry:0,rz:0})), axis=heading*Math.PI/180;
 sequence.forEach((index,k)=>{
  const p=source[index],dx=p.x-mean[0],dy=p.y-mean[1],width=p.scale*Math.max(p.scaleX,p.scaleY), wall=controls.boundaryRoles[p.letter]==='wall';
  if(typology==='contained-room-within-volume'){
   const angle=Math.hypot(dx,dy)>1e-8?Math.atan2(dy,dx):2*Math.PI*k/n, distance=Math.max(Math.hypot(dx,dy),width*.5);
   poses[index]={u:Math.cos(angle)*distance,v:Math.sin(angle)*distance,rx:wall?90:0,ry:0,rz:normalize(Math.round((angle*180/Math.PI+90)/15)*15)};
  }else{
   const along=dx*Math.cos(axis)+dy*Math.sin(axis),offset=(k%2?1:-1)*width*Math.max(15,Math.min(35,controls.staggerPercent))/100;
   poses[index]={u:along*Math.cos(axis)-offset*Math.sin(axis),v:along*Math.sin(axis)+offset*Math.cos(axis),rx:wall?90:0,ry:0,rz:normalize(Math.round(heading/15)*15)};
  }
 });return poses;
}
