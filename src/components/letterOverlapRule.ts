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
