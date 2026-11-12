import * as THREE from 'three';
import type { IntersectionPlacement } from './architecturalConnections';
export type OrientationFamily='rigid'|'continuous'|'flat'|'void'|'terrain';
export function orientationFamily(id:string):OrientationFamily {
 if(id==='stepped-amphitheater')return 'terrain';
 if(/linear|compressed|contained/.test(id))return 'rigid';
 if(/flat|inserted-horizontal/.test(id))return 'flat';
 if(/void/.test(id))return 'void';
 if(/cascaded|terraced|topographic|folded-undulating/.test(id))return 'terrain';
 return 'continuous';
}
export function orientationSteps(family:OrientationFamily){return {xy:family==='rigid'||family==='flat'?90:15,vertical:family==='flat'?0:family==='rigid'?45:15};}
/** Form Editor rotation increments, in world-axis order. Zero means locked. */
export function editorRotationSteps(id:string):[number,number,number] {
 if(id==='linear-gallery-lobby')return [90,90,90];
 if(id==='open-hall-workspace')return [0,0,90];
 if(id==='void-field-gathering')return [0,0,15];
 if(id==='stepped-amphitheater')return [90,0,15];
 if(id==='flat-deep-plan-plate'||id==='inserted-horizontal-plate')return [90,0,90];
 const steps=orientationSteps(orientationFamily(id));
 return [steps.vertical,steps.vertical,steps.xy];
}
/** Foundational poses precede profile selection, importance scaling and solid connections.
 * XY rotation is Z yaw; XZ is Y rotation; YZ is X rotation. */
export function foundationPoses(source:IntersectionPlacement[],sequence:number[],typology:string,spacing:number,heading:number){
 const family=orientationFamily(typology),steps=orientationSteps(family),yaw=Math.round(heading/steps.xy)*steps.xy,n=sequence.length;
 const result=source.map(()=>({u:0,v:0,z:0,rx:0,ry:0,rz:yaw,scaleMultiplier:1}));
 const topographicOccurrence=new Map<number,number>();
 if(typology==='topographic-ground-field-lobby')for(const letter of ['L','U','V'] as const)sequence.filter(id=>source[id].letter===letter).forEach((id,index)=>topographicOccurrence.set(id,index));
 sequence.forEach((id,k)=>{
  const p=result[id],symmetric=k-(n-1)/2,side=Math.sign(symmetric),tier=Math.abs(symmetric);
  if(typology==='stepped-amphitheater'){
   const width=source.reduce((total,item)=>total+item.scale*Math.max(item.scaleX,item.scaleY),0)/Math.max(n,1);
   p.u=(k-(n-1)/2)*width*.16;p.v=(k%2?1:-1)*width*.125;p.z=k*width*.2;
   p.rz=yaw+[0,15,30,45,90][k%5];
   p.rx=source[id].letter==='V'?(k%2?90:-90):0;p.ry=0;
  }else if(family==='rigid'||family==='flat'){
   // A centered, regular lattice: every occupied position has an opposite partner.
   p.u=symmetric*spacing;p.rz=yaw+(side<0?180:0);
   if(/contained|flat-deep/.test(typology)){p.u=side*(Math.floor(tier)+1)*spacing;p.v=side*(Math.floor(tier)%2)*spacing;if(!side)p.u=0;}
   if((typology==='flat-deep-plan-plate'||typology==='inserted-horizontal-plate'))p.rx=(k%2)*90;
   if(family==='rigid'){p.rx=side*(Math.floor(tier)%2)*45;p.ry=side*(Math.floor(tier+1)%2)*45;}
   if(/compressed/.test(typology))p.u*=.5;
  }else if(family==='continuous'){
   p.u=symmetric*spacing;p.rz=yaw+side*45;p.rx=side*45;
  }else if(family==='void'){
   // Shared XY center and increasing levels create a vertical stack.
   p.u=0;p.v=0;p.z=k*spacing*.45;
   p.rz=yaw+k*15;p.rx=(k%3-1)*15;p.ry=(k%2?1:-1)*15;
  }else if(family==='terrain'&&!/topographic|folded-undulating/.test(typology)){
   p.u=symmetric*spacing*.3;p.v=(k%2?1:-1)*spacing*.1;p.z=k*spacing*.15;
   p.rz=yaw+k*15;p.rx=(k%3)*15;p.ry=0;
  }else if(family==='terrain'){
   const angle=yaw+Math.round(90*k/Math.max(1,n-1)/15)*15,a=angle*Math.PI/180;
   const radius=spacing*(.4+.08*k/Math.max(1,n-1));
   p.u=Math.cos(a)*radius;p.v=Math.sin(a)*radius;p.z=k*spacing*.015;
   // Local openings: U points -Y, V +Y, L toward its inner (+X,+Y) corner.
   p.rz=angle+(source[id].letter==='U'?-90:source[id].letter==='V'?90:135);p.rx=0;p.ry=0;
  }
  if(['compressed-sequential-lobby','continuous-hall-lobby','linear-gallery-lobby'].includes(typology)){
   p.u=(k-(n-1)/2)*spacing*.45;p.v=0;p.z=0;
  }
  if(/topographic|folded-undulating/.test(typology)){
   const range=typology==='topographic-ground-field-lobby'?({L:[0,45],U:[45,90],V:[90,120]} as const)[source[id].letter]:undefined;
   const occurrence=topographicOccurrence.get(id)??0;
   const tilt=range?range[0]+15*(occurrence%(Math.floor((range[1]-range[0])/15)+1)):source[id].letter==='V'?90:Math.round(90*k/Math.max(1,n-1)/15)*15;
   const axis=source[id].letter==='L'?new THREE.Vector3(1,1,0).normalize():new THREE.Vector3(0,1,0);
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),p.rz*Math.PI/180).multiply(new THREE.Quaternion().setFromAxisAngle(axis,tilt*Math.PI/180));
   const e=new THREE.Euler().setFromQuaternion(q,'XYZ');p.rx=e.x*180/Math.PI;p.ry=e.y*180/Math.PI;p.rz=e.z*180/Math.PI;
  }else if(source[id].letter==='V'&&typology!=='stepped-amphitheater'&&typology!=='flat-deep-plan-plate'&&typology!=='inserted-horizontal-plate'){
   // Tilt about the V opening's local Y axis: its mouth still faces inward in plan.
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),p.rz*Math.PI/180).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4));
   const e=new THREE.Euler().setFromQuaternion(q,'XYZ');p.rx=e.x*180/Math.PI;p.ry=e.y*180/Math.PI;p.rz=e.z*180/Math.PI;
  }
  if(['compressed-sequential-lobby','continuous-hall-lobby','linear-gallery-lobby'].includes(typology)){
   // The local letter face starts in XY. Turn it onto YZ, then rotate around world X.
   p.rx=(k%4)*90;p.ry=90;p.rz=0;
  }
 });
 return {poses:result,family,steps,heading:yaw,description:typology==='linear-gallery-lobby'?'Linear Gallery: letters rotate in 90° increments; horizontal XY letters occupy the top and bottom, with vertical YZ letters between.':['compressed-sequential-lobby','continuous-hall-lobby'].includes(typology)?'Letters start in the YZ plane with equal X offsets; alternate letters rotate 45 degrees around Y.':typology==='topographic-ground-field-lobby'?'Topographic foundation: an inward-facing L → U → V spiral sweeps 90 degrees around the center Z-axis. In 15-degree steps, L tilts 0–45 degrees, U tilts 45–90 degrees, and V tilts 90–120 degrees relative to XY.':typology==='stepped-amphitheater'?'Stepped amphitheater foundation: yaw offsets 0°, 15°, 30°, 45° or 90° relative to the circulation axis; L and U are horizontal and V uses upright tilts of ±90°. Alternating lateral offsets start at 25% of representative letter width.':family+' foundation: XY rotations in '+steps.xy+'° steps; '+((typology==='flat-deep-plan-plate'||typology==='inserted-horizontal-plate')?'XZ level (0°), YZ 90° steps': 'XZ/YZ '+(steps.vertical?steps.vertical+'° steps':'level (0°)'))+'.'+(family==='rigid'||family==='flat'?' Centered symmetric placement grid.':family==='void'?' Letters stack along a shared Z axis with bridges between adjacent levels.':family==='terrain'?(/topographic|folded-undulating/.test(typology)?' Inward-facing spiral spans 90 degrees (within the 90–120 degree range) around Z; letter faces progressively tilt from 0 to 90 degrees.':' Closely spaced levels emphasize Z interlocking.'):' Shared continuous axis.')};
}
