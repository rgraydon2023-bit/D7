import type { Manifold } from "manifold-3d/manifold";
import type { IntersectionPlacement } from "./architecturalConnections";

/** Uniformly scale each letter, then fit a connected stack to all six cube faces. */
export function fitLetterCube(input:IntersectionPlacement[],makeSolid:(p:IntersectionPlacement)=>Manifold){
 if(!input.length)return input;
 const order=input.map((_,i)=>i).sort((a,b)=>input[a].z-input[b].z||a-b);
 const original=input.map(makeSolid),boxes=original.map(s=>s.boundingBox());
 const minimum=[0,1,2].map(a=>boxes.reduce((v,b)=>Math.min(v,b.min[a]),Infinity));
 const maximum=[0,1,2].map(a=>boxes.reduce((v,b)=>Math.max(v,b.max[a]),-Infinity));
 const side=Math.max(...maximum.map((v,a)=>v-minimum[a]));
 const centers=boxes.map(b=>b.min.map((v,a)=>(v+b.max[a])/2));
 // The cube is fixed; changing scalar scale preserves each letter's proportions.
 const verticalOptions=[-1,...input.map((p,i)=>p.letter==='V'?i:-1).filter(i=>i>=0)];
 for(const vertical of verticalOptions)for(const plane of [0,1])for(const alignment of [.5,0,1,.25,.75])for(const spread of [0,.25,.5,.75,1]){
  const result=input.map((p,i)=>{const oriented=i===vertical?{...p,rx:plane===0?90:0,ry:plane===1?90:0}:p;const b=makeSolid(oriented).boundingBox(),factor=side/Math.max(...b.max.map((v,a)=>v-b.min[a]));return {...oriented,scale:p.scale*factor,letterRules:p.letterRules?{...p.letterRules}:undefined};});
  const scaled=result.map(makeSolid),local=scaled.map(s=>s.boundingBox());
  for(let k=0;k<order.length;k++){
   const i=order[k],p=result[i],b=local[i],size=b.max.map((v,a)=>v-b.min[a]);
   const t=order.length===1?.5:k/(order.length-1);
   const target=[0,1].map(a=>minimum[a]+size[a]/2+(side-size[a])*Math.max(0,Math.min(1,alignment+spread*((centers[i][a]-minimum[a])/side-.5))));
   target.push(vertical<0?minimum[2]+size[2]/2+t*(side-size[2]):minimum[2]+side/2+(k-order.indexOf(vertical))*side*.001);
   p.x+=target[0]-(b.min[0]+b.max[0])/2;p.y+=target[1]-(b.min[1]+b.max[1])/2;p.z+=target[2]-(b.min[2]+b.max[2])/2;
  }
  const solids=result.map(makeSolid),fitted=solids.map(s=>s.boundingBox());
  // Snap the least constrained face contacts without stretching a letter.
  for(const axis of [0,1])for(const upper of [false,true]){
   const target=minimum[axis]+(upper?side:0);let best=-1,distance=Infinity;
   for(let i=0;i<fitted.length;i++){const d=Math.abs(target-(upper?fitted[i].max[axis]:fitted[i].min[axis]));if(d<distance){distance=d;best=i;}}
   if(best>=0&&distance>side*1e-7){const delta=target-(upper?fitted[best].max[axis]:fitted[best].min[axis]);result[best][axis===0?'x':'y']+=delta;solids[best]=makeSolid(result[best]);fitted[best]=solids[best].boundingBox();}
  }
  const tolerance=side*1e-5;
  if([0,1,2].some(a=>Math.abs(fitted.reduce((v,b)=>Math.min(v,b.min[a]),Infinity)-minimum[a])>tolerance||Math.abs(fitted.reduce((v,b)=>Math.max(v,b.max[a]),-Infinity)-(minimum[a]+side))>tolerance))continue;
  const actualOrder=result.map((_,i)=>i).sort((a,b)=>result[a].z-result[b].z||a-b);
  if(actualOrder.some((id,k)=>id!==order[k]))continue;
  let connected=true;
  for(let k=1;k<order.length;k++){const overlap=solids[order[k-1]].intersect(solids[order[k]]);try{if(overlap.volume()<=Math.min(solids[order[k-1]].volume(),solids[order[k]].volume())*1e-7){connected=false;break;}}finally{overlap.delete();}}
  if(!connected)continue;
  for(let i=0;i<result.length;i++)if(result[i].letterRules)result[i].letterRules!.supportZ=fitted[i].min[2];
  return result;
 }
 throw new Error("This selection could not fill all six cube faces with proportional letters and intersecting neighbors. Try another selection or typology; the previous result has been retained.");
}
