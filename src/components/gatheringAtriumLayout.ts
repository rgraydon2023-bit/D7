import type { IntersectionPlacement } from './architecturalConnections';
import type { GatheringOperations } from './gatheringOperations';

export const ATRIUM_TYPOLOGIES=new Set(['void-field-gathering','inserted-horizontal-plate']);
const normalize=(value:number)=>((value%360)+360)%360;
const angleDelta=(from:number,to:number)=>((to-from+540)%360)-180;
const nearestOrthogonal=(deg:number)=>{const choices=[0,90,180,270];return choices.reduce((best,value)=>Math.abs(angleDelta(value,deg))<Math.abs(angleDelta(best,deg))?value:best);};

function planHeading(source:IntersectionPlacement[]){
 const n=source.length,mean=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n],[0,0]);
 let xx=0,yy=0,xy=0;for(const p of source){const dx=p.x-mean[0],dy=p.y-mean[1];xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
 return .5*Math.atan2(2*xy,xx-yy);
}

/** Headings follow the source path so a linear gallery can curve and still turn orthogonally. */
function galleryHeadings(source:IntersectionPlacement[],mean:[number,number],fallback:number){
 const axis=fallback*Math.PI/180,order=source.map((p,i)=>({i,along:(p.x-mean[0])*Math.cos(axis)+(p.y-mean[1])*Math.sin(axis)})).sort((a,b)=>a.along-b.along||a.i-b.i);
 const heading=source.map(()=>fallback),incoming=source.map(()=>fallback),outgoing=source.map(()=>fallback);
 const dir=(a:number,b:number)=>{const dx=source[b].x-source[a].x,dy=source[b].y-source[a].y;return Math.hypot(dx,dy)>1e-8?Math.atan2(dy,dx)*180/Math.PI:fallback;};
 for(let i=0;i<order.length;i++){
  const prev=order[Math.max(0,i-1)].i,next=order[Math.min(order.length-1,i+1)].i,id=order[i].i;
  const inn=i===0?dir(id,next):dir(prev,id),out=i===order.length-1?dir(prev,id):dir(id,next);
  incoming[id]=inn;outgoing[id]=out;heading[id]=i===0?out:i===order.length-1?inn:inn+angleDelta(inn,out)/2;
 }
 return {heading,incoming,outgoing};
}

/** Preserve the source angular order and place each letter around a shared opening. */
export function gatheringAtriumLayout(source:IntersectionPlacement[],sequence:number[],typology:string,controls:GatheringOperations) {
 const n=source.length;if(!n)return {poses:[],center:[0,0] as [number,number],radius:0};
 const mean=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n],[0,0]);
 const center:[number,number]=[mean[0]+controls.protectedVoidOffsetX,mean[1]+controls.protectedVoidOffsetY];
 const width=source.reduce((sum,p)=>sum+p.scale*Math.max(p.scaleX,p.scaleY),0)/n;
 const radius=controls.protectedVoidRadius>0?controls.protectedVoidRadius:width*.18;
 const poses=source.map(()=>({u:0,v:0,rx:0,ry:0,rz:0}));
 const axis=planHeading(source);
 sequence.forEach((index,k)=>{
  const letter=source[index],dx=letter.x-mean[0],dy=letter.y-mean[1];
  const sourceAngle=Math.hypot(dx,dy)>1e-8?Math.atan2(dy,dx)*180/Math.PI:k*360/n;
  const extent=letter.scale*1.5*Math.max(letter.scaleX,letter.scaleY,letter.scaleZ)*1.1;
  const role=controls.boundaryRoles[letter.letter];
  if(typology==='inserted-horizontal-plate'){
   const localDepth=letter.scale*Math.min(letter.scaleX,letter.scaleY),pct=Math.max(10,Math.min(25,controls.staggerPercent));
   const setback=localDepth*(k%2?pct:Math.max(10,pct*.4))/100,lateral=(k%2?1:-1)*(radius+extent+setback),along=(k-(n-1)/2)*localDepth*.85,side=axis+Math.PI/2;
   const orthogonal=Math.round(axis*180/Math.PI/90)*90;
   poses[index]={u:center[0]-mean[0]+Math.cos(axis)*along+Math.cos(side)*lateral,v:center[1]-mean[1]+Math.sin(axis)*along+Math.sin(side)*lateral,rx:role==='wall'?(k%2?90:-90):0,ry:0,rz:normalize(orthogonal+(k%4)*90)};
   return;
  }
  const angle=Math.round(sourceAngle/15)*15,radians=angle*Math.PI/180;
  const localWidth=letter.scale*Math.max(letter.scaleX,letter.scaleY),pct=Math.max(10,Math.min(30,controls.staggerPercent));
  const setback=localWidth*(k%2?pct:Math.max(10,Math.min(30,pct*.4)))/100,distance=radius+extent+setback;
  const upright=role==='wall'||role==='enclosure';
  poses[index]={u:center[0]-mean[0]+Math.cos(radians)*distance,v:center[1]-mean[1]+Math.sin(radians)*distance,rx:upright?(k%2?90:-90):0,ry:0,rz:normalize(angle+90)};
 });
 return {poses,center,radius};
}

/** Source-derived initial layouts for the contained room and linear gallery. */
export function gatheringEnclosureLayout(source:IntersectionPlacement[],sequence:number[],typology:string,controls:GatheringOperations,heading:number) {
 const n=source.length, mean=source.reduce((a,p)=>[a[0]+p.x/n,a[1]+p.y/n],[0,0]) as [number,number];
 const poses=source.map(()=>({u:0,v:0,rx:0,ry:0,rz:0}));
 const gallery=typology==='linear-edge-gallery'?galleryHeadings(source,mean,heading):null;
 sequence.forEach((index,k)=>{
  const p=source[index],dx=p.x-mean[0],dy=p.y-mean[1],width=p.scale*Math.max(p.scaleX,p.scaleY),role=controls.boundaryRoles[p.letter];
  if(typology==='contained-room-within-volume'){
   const angle=Math.hypot(dx,dy)>1e-8?Math.atan2(dy,dx):2*Math.PI*k/n, distance=Math.max(Math.hypot(dx,dy),width*.5);
   const offset=(k%2?1:-1)*width*Math.max(0,Math.min(15,controls.staggerPercent))/100, direction=angle+controls.staggerDirection*Math.PI/180;
   const angleDeg=angle*180/Math.PI,facing=p.letter==='U'?angleDeg-90:p.letter==='V'?angleDeg+90:angleDeg+135;
   const upright=role==='wall'||role==='enclosure';
   poses[index]={u:Math.cos(angle)*distance+Math.cos(direction)*offset,v:Math.sin(angle)*distance+Math.sin(direction)*offset,rx:upright?(k%2?90:-90):0,ry:0,rz:normalize(Math.round(facing/15)*15)};
  }else{
   const local=gallery?.heading[index]??heading,turn=Math.abs(angleDelta(gallery?.incoming[index]??local,gallery?.outgoing[index]??local));
   const pct=Math.max(15,Math.min(35,controls.staggerPercent)),offset=(k%2?1:-1)*width*pct/100,side=local*Math.PI/180+controls.staggerDirection*Math.PI/180;
   const upright=role==='wall'||role==='edge';
   poses[index]={u:dx+Math.cos(side)*offset,v:dy+Math.sin(side)*offset,rx:upright?(k%2?90:-90):0,ry:0,rz:normalize(turn>=45?nearestOrthogonal(local):Math.round(local/15)*15)};
  }
 });return poses;
}
