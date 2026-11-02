import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
export const MIN_LETTER_OVERLAP=.25;
function union(solids:Manifold[]){let s=solids[0];for(let i=1;i<solids.length;i++){const next=s.add(solids[i]);if(i>1)s.delete();s=next;}return s;}
export function letterOverlapFractions(solids:Manifold[]){
 if(solids.length<2)return solids.map(()=>0);
 return solids.map((solid,i)=>{const rest=solids.filter((_,j)=>i!==j),others=union(rest),overlap=solid.intersect(others);try{return overlap.volume()/solid.volume();}finally{overlap.delete();if(rest.length>1)others.delete();}});
}
/** True solid-union overlap; triple intersections count only once. */
export function enforceLetterOverlap(input:IntersectionPlacement[],makeSolid:(p:IntersectionPlacement)=>Manifold,spiralCenter?:number[],verticalStack=false,scaleBounds?:{min:number;max:number}[],preserveRotation=false,shiftAxis?:[number,number],minimumRise=0){
 if(input.length<2)throw new Error('The 25% overlap rule requires at least two letters.');
 const result=input.map(p=>({...p})),solids=result.map(makeSolid);
 const levels=result.map((_,i)=>i).sort((a,b)=>(result[a].letterRules?.level??a)-(result[b].letterRules?.level??b));
 // Begin with the requested rise, measured from the preceding rotated solid's world-Z height.
 for(let k=1;k<levels.length;k++){const a=levels[k-1],i=levels[k],box=solids[a].boundingBox(),p=result[i],z=result[a].z+.75*(box.max[2]-box.min[2]);result[i]={...p,z,letterRules:p.letterRules?{...p.letterRules,supportZ:p.letterRules.supportZ+z-p.z}:undefined};solids[i]=makeSolid(result[i]);}
 const span=solids.reduce((v,s)=>{const b=s.boundingBox();return v+Math.max(...b.max.map((x,k)=>x-b.min[k]))/solids.length;},0);
 let fractions=letterOverlapFractions(solids);
 for(let pass=0;pass<(minimumRise>0?48:24)&&fractions.some(f=>f<MIN_LETTER_OVERLAP-1e-6);pass++){
  if(pass===12&&!spiralCenter&&!verticalStack&&!preserveRotation){
   // Repeated elements can form interlocking layers without changing their profile.
   // Use one rule-compliant pose per group, keeping the group's layout centroid.
   for(const letter of ['U','L','V']){
    const ids=result.map((p,i)=>p.letter===letter?i:-1).filter(i=>i>=0);if(ids.length<2)continue;
    const template=result[ids[0]],center=ids.reduce((v,i)=>[v[0]+result[i].x/ids.length,v[1]+result[i].y/ids.length,v[2]+result[i].z/ids.length],[0,0,0]);
    ids.forEach((i,k)=>{const z=center[2]+(k-(ids.length-1)/2)*span*.001;result[i]={...result[i],x:center[0],y:center[1],z,rx:template.rx,ry:template.ry,rz:template.rz,scale:scaleBounds?Math.max(scaleBounds[i].min,Math.min(scaleBounds[i].max,template.scale)):template.scale,letterRules:result[i].letterRules?{...result[i].letterRules!,yaw:template.rz,supportZ:z,strokeWidth:template.letterRules!.strokeWidth}:undefined};solids[i]=makeSolid(result[i]);});
   }
  }
  for(let k=1;k<levels.length;k++){const a=levels[k-1],i=levels[k];if(result[i].z<result[a].z+Math.max(minimumRise,span*1e-9)){const p=result[i],z=result[a].z+Math.max(minimumRise,span*.001);result[i]={...p,z,letterRules:p.letterRules?{...p.letterRules,supportZ:p.letterRules.supportZ+z-p.z}:undefined};solids[i]=makeSolid(result[i]);}}
  {const base=Math.min(...result.map(p=>p.z));for(let i=0;i<result.length;i++){const p=result[i],z=base+(p.z-base)*.65;result[i]={...p,z,letterRules:p.letterRules?{...p.letterRules,supportZ:p.letterRules.supportZ+z-p.z}:undefined};solids[i]=makeSolid(result[i]);}}
  const step=span*[.3,.15,.075,.03,.01,.003][pass%6];
  const order=fractions.map((_,i)=>i).sort((a,b)=>fractions[a]-fractions[b]);
  for(const i of order){
   const rest=solids.filter((_,j)=>i!==j),others=union(rest),start=result[i];
   const ratio=(s:Manifold)=>{const o=s.intersect(others);try{return o.volume()/s.volume();}finally{o.delete();}};
   try{
    let best=ratio(solids[i]);if(best>=.27)continue;
    let chosen=start,chosenSolid=solids[i];
    const shifts:number[][]=[];
    if(spiralCenter){
     const dx=start.x-spiralCenter[0],dy=start.y-spiralCenter[1],r=Math.hypot(dx,dy);
     for(const dr of [-step,-step/2,0,step/2,step])for(const dz of [-step/2,0,step/2])if(r+dr>span*.01)shifts.push([dx/r*dr,dy/r*dr,dz]);
    }else if(verticalStack){for(const z of [-step,-step/2,0,step/2,step])shifts.push([0,0,z]);}
    else if(shiftAxis){for(const along of [-step,0,step])for(const z of [-step/2,0,step/2])shifts.push([along*shiftAxis[0],along*shiftAxis[1],z]);}
    else for(const x of [-step,0,step])for(const y of [-step,0,step])for(const z of [-step/2,0,step/2])shifts.push([x,y,z]);
    if(best<.1){
     if(spiralCenter){const dx=start.x-spiralCenter[0],dy=start.y-spiralCenter[1],r=Math.hypot(dx,dy);for(const radius of [.05,.2,.4,.6,.8,1,1.5].map(f=>span*f))for(const other of result)shifts.push([dx/r*(radius-r),dy/r*(radius-r),other.z-start.z]);}
     else if(!verticalStack)for(const other of result){const dx=other.x-start.x,dy=other.y-start.y,along=shiftAxis?dx*shiftAxis[0]+dy*shiftAxis[1]:0;shifts.push(shiftAxis?[along*shiftAxis[0],along*shiftAxis[1],other.z-start.z]:[dx,dy,other.z-start.z]);}
    }
    const levels=result.map((_,j)=>j).sort((a,b)=>(result[a].letterRules?.level??a)-(result[b].letterRules?.level??b)),level=levels.indexOf(i);
    for(const [dx,dy,dz] of shifts)for(const scaleFactor of (pass%6<4?[.75,1,1.25]:[.95,1,1.05])){
     const p={...start,scale:start.scale*scaleFactor,x:start.x+dx,y:start.y+dy,z:start.z+dz,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+dz,strokeWidth:start.letterRules.strokeWidth*scaleFactor}:undefined};
     if(((level>0&&p.z<result[levels[level-1]].z+minimumRise)||(level+1<levels.length&&p.z>result[levels[level+1]].z-minimumRise)))continue;
     if(scaleBounds&&(p.scale<scaleBounds[i].min-1e-10||p.scale>scaleBounds[i].max+1e-10))continue;
     const solid=makeSolid(p),f=ratio(solid);if(f>best+1e-7){best=f;chosen=p;chosenSolid=solid;}
    }
    if(best<.27&&!spiralCenter&&!preserveRotation&&chosen.letter!=='V'){
     const p={...chosen,rx:0,ry:0};if(scaleBounds&&(p.scale<scaleBounds[i].min-1e-10||p.scale>scaleBounds[i].max+1e-10))continue;
     const solid=makeSolid(p),f=ratio(solid);
     if(f>best+1e-7){best=f;chosen=p;chosenSolid=solid;}
    }
    if(best<.27)for(const factor of [.8,.9,1.1,1.2]){
     const p={...chosen,scale:chosen.scale*factor,letterRules:chosen.letterRules?{...chosen.letterRules,strokeWidth:chosen.letterRules.strokeWidth*factor}:undefined};
     if(scaleBounds&&(p.scale<scaleBounds[i].min-1e-10||p.scale>scaleBounds[i].max+1e-10))continue;
     const solid=makeSolid(p),f=ratio(solid);if(f>best+1e-7){best=f;chosen=p;chosenSolid=solid;}
    }
    result[i]=chosen;solids[i]=chosenSolid;
   }finally{if(rest.length>1)others.delete();}
  }
  fractions=letterOverlapFractions(solids);
 }
 if(fractions.some(f=>f<MIN_LETTER_OVERLAP-1e-6))throw new Error('Could not satisfy 25% solid overlap for every letter: '+fractions.map(f=>(f*100).toFixed(1)+'%').join(', '));
 // Recover as much of the 75% rise as possible after overlap optimization.
 // Move the whole upper suffix so established rises above it are preserved.
 for(let k=1;k<levels.length;k++){
  const a=levels[k-1],i=levels[k],box=solids[a].boundingBox(),needed=result[a].z+.75*(box.max[2]-box.min[2])-result[i].z;
  if(needed<=0)continue;
  const ids=levels.slice(k),base=ids.map(id=>result[id]);let low=0,high=1;
  for(let attempt=0;attempt<8;attempt++){
   const fraction=attempt===0?1:(low+high)/2,trial=[...solids],poses=base.map(p=>({...p,z:p.z+needed*fraction,letterRules:p.letterRules?{...p.letterRules,supportZ:p.letterRules.supportZ+needed*fraction}:undefined}));
   ids.forEach((id,j)=>{trial[id]=makeSolid(poses[j]);});const trialFractions=letterOverlapFractions(trial);
   if(trialFractions.every(f=>f>=MIN_LETTER_OVERLAP-1e-6)){low=fraction;ids.forEach((id,j)=>{result[id]=poses[j];solids[id]=trial[id];});fractions=trialFractions;if(fraction===1)break;}else high=fraction;
  }
 }
 const riseFractions=levels.slice(1).map((i,k)=>{const a=levels[k],b=solids[a].boundingBox();return (result[i].z-result[a].z)/(b.max[2]-b.min[2]);});
 if(riseFractions.some((r,k)=>r<=0||result[levels[k+1]].z-result[levels[k]].z<minimumRise-1e-8))throw new Error(minimumRise>0?'The amphitheater cannot maintain distinct rising levels while satisfying the 25% overlap rule for this selection.':'Every successive letter must rise along Z.');
 return {placements:result,fractions,riseFractions};
}

/** A smaller solid overlap used before bridges when a typology must keep its levels, yaw, and protected opening. */
export function enforceContactOverlap(input:IntersectionPlacement[],makeSolid:(p:IntersectionPlacement)=>Manifold,options?:{minimum?:number;lockZ?:boolean;radialYaw?:boolean;protectedCircle?:{center:[number,number];radius:number}}){
 const minimum=options?.minimum??.05;
 if(input.length<2)return {placements:input.map(p=>({...p})),fractions:input.map(()=>1),riseFractions:[] as number[]};
 const result=input.map(p=>({...p})),solids=result.map(makeSolid);
 const circle=options?.protectedCircle;
 const clearsSolid=(solid:Manifold)=>{if(!circle||circle.radius<=0)return true;const box=solid.boundingBox(),x=Math.max(box.min[0],Math.min(circle.center[0],box.max[0])),y=Math.max(box.min[1],Math.min(circle.center[1],box.max[1]));return Math.hypot(x-circle.center[0],y-circle.center[1])>=circle.radius+.02;};
 const face=(p:IntersectionPlacement)=>{if(!options?.radialYaw)return p;const angle=Math.atan2(p.y,p.x)*180/Math.PI,rz=((angle+90)%360+360)%360;return {...p,rz,letterRules:p.letterRules?{...p.letterRules,yaw:rz}:undefined};};
 let fractions=letterOverlapFractions(solids);
 for(let pass=0;pass<4&&fractions.some(f=>f<minimum-1e-6);pass++){
  const order=fractions.map((_,i)=>i).sort((a,b)=>fractions[a]-fractions[b]);
  for(const i of order){
   if(fractions[i]>=minimum-1e-6)continue;
   const rest=solids.filter((_,j)=>j!==i),others=union(rest);
   const ratio=(solid:Manifold)=>{const overlap=solid.intersect(others);try{return overlap.volume()/Math.max(solid.volume(),1e-12);}finally{overlap.delete();}};
   try{
    let best=fractions[i],chosen=result[i],chosenSolid=solids[i],start=result[i];
    const candidates:IntersectionPlacement[]=[];
    for(const factor of [1.08,1.2])candidates.push(face({...start,scale:start.scale*factor,letterRules:start.letterRules?{...start.letterRules,strokeWidth:start.letterRules.strokeWidth*factor}:undefined}));
    for(const portion of [.2,.35,.55])for(let j=0;j<result.length;j++)if(j!==i){
     const dx=result[j].x-start.x,dy=result[j].y-start.y,dz=options?.lockZ?0:result[j].z-start.z;
     candidates.push(face({...start,x:start.x+dx*portion,y:start.y+dy*portion,z:start.z+dz*portion,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+dz*portion}:undefined}));
    }
    for(const candidate of candidates){
     const solid=makeSolid(candidate);if(!clearsSolid(solid))continue;const value=ratio(solid);
     if(value+1e-7>=minimum){best=value;chosen=candidate;chosenSolid=solid;break;}
     if(value>best+1e-7){best=value;chosen=candidate;chosenSolid=solid;}
    }
    result[i]=chosen;solids[i]=chosenSolid;
   }finally{if(rest.length>1)others.delete();}
  }
  fractions=letterOverlapFractions(solids);
 }
 // Separated levels can stay past the requested rise only until the solids miss each other.
 // Pull just far enough in Z for the small overlap, and keep the sequence in order.
 if(fractions.some(f=>f<minimum-1e-6)){
  for(const i of fractions.map((_,index)=>index).sort((a,b)=>fractions[a]-fractions[b])){
   if(fractions[i]>=minimum-1e-6)continue;
   const level=result[i].letterRules?.level??i,prev=result.find(p=>p.letterRules?.level===level-1),next=result.find(p=>p.letterRules?.level===level+1);
   const partners=[prev,next].filter((p):p is IntersectionPlacement=>Boolean(p)).sort((a,b)=>Math.abs(a.z-result[i].z)-Math.abs(b.z-result[i].z));
   const rest=solids.filter((_,j)=>j!==i),others=union(rest);
   const ratio=(solid:Manifold)=>{const overlap=solid.intersect(others);try{return overlap.volume()/Math.max(solid.volume(),1e-12);}finally{overlap.delete();}};
   try{
    const start=result[i];let best=fractions[i],chosen=start,chosenSolid=solids[i];
    for(const partner of partners){
     const dir=Math.sign(partner.z-start.z);if(!dir)continue;
     const floor=prev?prev.z+.01:-Infinity,cap=next?next.z-.01:Infinity,limit=dir>0?cap-start.z:start.z-floor;
     let lo=0,hi=Math.min(Math.abs(partner.z-start.z)-.01,Math.max(0,limit));if(hi<=1e-6)continue;
     for(let attempt=0;attempt<8;attempt++){
      const mid=(lo+hi)/2,z=start.z+dir*mid,pose=face({...start,z,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+(z-start.z)}:undefined});
      const solid=makeSolid(pose);if(!clearsSolid(solid))continue;const value=ratio(solid);
      if(value+1e-7>=minimum){hi=mid;best=value;chosen=pose;chosenSolid=solid;}
      else{lo=mid;if(value>best+1e-7){best=value;chosen=pose;chosenSolid=solid;}}
     }
    }
    result[i]=chosen;solids[i]=chosenSolid;
   }finally{if(rest.length>1)others.delete();}
  }
  fractions=letterOverlapFractions(solids);
 }
 if(fractions.some(f=>f<minimum-1e-6)){
  for(const i of fractions.map((_,index)=>index).sort((a,b)=>fractions[a]-fractions[b])){
   if(fractions[i]>=minimum-1e-6)continue;
   const rest=solids.filter((_,j)=>j!==i),others=union(rest);
   const ratio=(solid:Manifold)=>{const overlap=solid.intersect(others);try{return overlap.volume()/Math.max(solid.volume(),1e-12);}finally{overlap.delete();}};
   try{
    const start=result[i];let best=fractions[i],chosen=start,chosenSolid=solids[i];
    const nearest=result.map((p,j)=>j===i?Infinity:Math.hypot(p.x-start.x,p.y-start.y)).map((distance,j)=>({distance,j})).sort((a,b)=>a.distance-b.distance).slice(0,4);
    if(circle&&circle.radius>0)for(const {j} of nearest){
     const radius=Math.hypot(start.x-circle.center[0],start.y-circle.center[1]),a0=Math.atan2(start.y-circle.center[1],start.x-circle.center[0]),a1=Math.atan2(result[j].y-circle.center[1],result[j].x-circle.center[0]);
     let sweep=a1-a0;if(sweep>Math.PI)sweep-=Math.PI*2;if(sweep<-Math.PI)sweep+=Math.PI*2;
     for(const portion of [.25,.45,.7]){
      const angle=a0+sweep*portion,z=options?.lockZ?start.z:start.z+(result[j].z-start.z)*portion;
      const pose=face({...start,x:circle.center[0]+radius*Math.cos(angle),y:circle.center[1]+radius*Math.sin(angle),z,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+(z-start.z)}:undefined});
      const solid=makeSolid(pose);if(!clearsSolid(solid))continue;const value=ratio(solid);
      if(value+1e-7>=minimum){best=value;chosen=pose;chosenSolid=solid;break;}
      if(value>best+1e-7){best=value;chosen=pose;chosenSolid=solid;}
     }
     if(best+1e-7>=minimum)break;
    }
    if(best+1e-7<minimum)for(const {j} of nearest){
     const dx=result[j].x-start.x,dy=result[j].y-start.y,dz=options?.lockZ?0:result[j].z-start.z;let lo=0,hi=.9;
     for(let attempt=0;attempt<8;attempt++){
      const portion=(lo+hi)/2,pose=face({...start,x:start.x+dx*portion,y:start.y+dy*portion,z:start.z+dz*portion,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+dz*portion}:undefined});
      const solid=makeSolid(pose);if(!clearsSolid(solid)){hi=portion;continue;}
      const value=ratio(solid);
      if(value+1e-7>=minimum){best=value;chosen=pose;chosenSolid=solid;break;}
      lo=portion;if(value>best+1e-7){best=value;chosen=pose;chosenSolid=solid;}
     }
    }
    result[i]=chosen;solids[i]=chosenSolid;
   }finally{if(rest.length>1)others.delete();}
  }
  fractions=letterOverlapFractions(solids);
 }
 if(fractions.some(f=>f<.005))throw new Error('Could not give every letter a physical overlap before bridging: '+fractions.map(f=>(f*100).toFixed(1)+'%').join(', '));
 return {placements:result,fractions,riseFractions:[] as number[]};
}

/** Clear distance between two bounding boxes. Zero when the boxes touch or overlap. */
export function letterBoxGap(a:{min:number[]|Float32Array|[number,number,number];max:number[]|Float32Array|[number,number,number]},b:{min:number[]|Float32Array|[number,number,number];max:number[]|Float32Array|[number,number,number]}){
 const signed=[0,1,2].map(axis=>a.min[axis]>b.max[axis]?a.min[axis]-b.max[axis]:b.min[axis]>a.max[axis]?-(b.min[axis]-a.max[axis]):0);
 return {signed,dist:Math.hypot(...signed)};
}

/** Move each later sequence letter toward the previous one until the clear gap is at most maxGap feet. */
export function limitAdjacentLetterGap(input:IntersectionPlacement[],sequence:number[],makeSolid:(p:IntersectionPlacement)=>Manifold,maxGap:number,options?:{radialYaw?:boolean;protectedCircle?:{center:[number,number];radius:number}}){
 const result=input.map(p=>({...p})),solids=result.map(makeSolid),circle=options?.protectedCircle;
 const clears=(solid:Manifold)=>{if(!circle||circle.radius<=0)return true;const box=solid.boundingBox(),x=Math.max(box.min[0],Math.min(circle.center[0],box.max[0])),y=Math.max(box.min[1],Math.min(circle.center[1],box.max[1]));return Math.hypot(x-circle.center[0],y-circle.center[1])>=circle.radius+.02;};
 const face=(p:IntersectionPlacement)=>{if(!options?.radialYaw)return p;const angle=Math.atan2(p.y,p.x)*180/Math.PI,rz=((angle+90)%360+360)%360;return {...p,rz,letterRules:p.letterRules?{...p.letterRules,yaw:rz}:undefined};};
 for(let k=1;k<sequence.length;k++){
  const i=sequence[k-1],j=sequence[k],gap=letterBoxGap(solids[i].boundingBox(),solids[j].boundingBox());
  if(gap.dist<=maxGap+1e-6)continue;
  const start=result[j],full=(gap.dist-maxGap)/gap.dist;let lo=0,hi=full,chosen=start,chosenSolid=solids[j];
  for(let attempt=0;attempt<12;attempt++){
   const t=attempt===0?full:(lo+hi)/2,pose=face({...start,x:start.x+gap.signed[0]*t,y:start.y+gap.signed[1]*t,z:start.z+gap.signed[2]*t,letterRules:start.letterRules?{...start.letterRules,supportZ:start.letterRules.supportZ+gap.signed[2]*t}:undefined});
   const solid=makeSolid(pose);if(!clears(solid)){hi=t;continue;}
   lo=t;chosen=pose;chosenSolid=solid;if(t===full)break;
  }
  result[j]=chosen;solids[j]=chosenSolid;
  // A straight close can cross a protected opening. Slide around it, matching the
  // previous letter's angle and radius, and keep only the part that stays outside.
  if(!circle||circle.radius<=0||letterBoxGap(solids[i].boundingBox(),solids[j].boundingBox()).dist<=maxGap+1e-6)continue;
  const around=result[j],other=result[i],boxGap=letterBoxGap(solids[i].boundingBox(),solids[j].boundingBox());
  const a0=Math.atan2(around.y-circle.center[1],around.x-circle.center[0]),a1=Math.atan2(other.y-circle.center[1],other.x-circle.center[0]);
  let sweep=a1-a0;if(sweep>Math.PI)sweep-=Math.PI*2;if(sweep<-Math.PI)sweep+=Math.PI*2;
  const r0=Math.hypot(around.x-circle.center[0],around.y-circle.center[1]),r1=Math.hypot(other.x-circle.center[0],other.y-circle.center[1]);
  const zMove=Math.abs(boxGap.signed[2])>maxGap?boxGap.signed[2]*(1-maxGap/Math.abs(boxGap.signed[2])):boxGap.signed[2];
  let arcLo=0,arcHi=1,arcPose=around,arcSolid=solids[j],arcGap=boxGap.dist;
  for(let attempt=0;attempt<16;attempt++){
   const t=attempt===0?1:(arcLo+arcHi)/2,angle=a0+sweep*t,radius=r0+(r1-r0)*t,z=around.z+zMove*t;
   const pose=face({...around,x:circle.center[0]+radius*Math.cos(angle),y:circle.center[1]+radius*Math.sin(angle),z,letterRules:around.letterRules?{...around.letterRules,supportZ:around.letterRules.supportZ+(z-around.z)}:undefined});
   const solid=makeSolid(pose);if(!clears(solid)){arcHi=t;continue;}
   const nextGap=letterBoxGap(solids[i].boundingBox(),solid.boundingBox()).dist;
   if(nextGap<=maxGap+1e-6){arcPose=pose;arcSolid=solid;arcGap=nextGap;arcHi=t;if(arcHi-arcLo<1e-3)break;}
   else{arcLo=t;if(nextGap<arcGap){arcPose=pose;arcSolid=solid;arcGap=nextGap;}}
  }
  result[j]=arcPose;solids[j]=arcSolid;
 }
 let largest=0;for(let k=1;k<sequence.length;k++)largest=Math.max(largest,letterBoxGap(solids[sequence[k-1]].boundingBox(),solids[sequence[k]].boundingBox()).dist);
 return {placements:result,largest};
}
