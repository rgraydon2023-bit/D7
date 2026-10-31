import type { IntersectionPlacement } from './architecturalConnections';

/** Secondary spatial targets. These translate rigid letters; they never reshape them. */
export const spatialCriteria: Record<string,string> = {
 'vertical-void-lobby':'Multi-story atrium: vertically distributed edges around a continuous central void.',
 'compressed-sequential-lobby':'Choke → release: successive narrow entry chambers and wider arrival volumes.',
 'continuous-hall-lobby':'One broad horizontal hall with a common roof datum and minimal subdivision.',
 'topographic-ground-field-lobby':'A continuous sloping ground field with folded changes in level.',
 'linear-gallery-lobby':'An elongated directional path through successive volumes.',
 'open-hall-workspace':'One continuous horizontal work field, one plate and a common roof datum.',
 'cascaded-terraced-plates':'Successive offset floor levels form a stepped section with overlooks.',
 'flat-deep-plan-plate':'A level, deep grid of work zones organized around a core and daylight edges.',
 'void-edge-workspace':'Work zones ring a central atrium or light well.',
 'folded-undulating-work-surface':'Work zones follow a continuous rising and falling floor sequence.',
 'stepped-amphitheater':'Staggered letter-derived terraces and recessed edges rise around a gathering focus.',
 'void-field-gathering':'A full-height collective void with gathering at its floor.',
 'inserted-horizontal-plate':'A discrete communal platform occupies the middle of a taller section.',
 'contained-room-within-volume':'An inner gathering enclosure is nested within a larger surrounding volume.',
 'linear-edge-gallery':'A raised linear overlook follows the edge of a void.'
};

export function secondarySpatialTargets(source:IntersectionPlacement[], sequence:number[], boxes:{min:number[];max:number[]}[], typology:string) {
 const n=source.length;
 if(!n||!spatialCriteria[typology])return source.map(p=>({...p}));
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const b of boxes)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],b.min[j]);hi[j]=Math.max(hi[j],b.max[j]);}
 const cx=(lo[0]+hi[0])/2,cy=(lo[1]+hi[1])/2,base=lo[2],w=Math.max(hi[0]-lo[0],hi[1]-lo[1],.01),h=Math.max(hi[2]-lo[2],w*.25);
 // Preserve the dominant horizontal direction of the rule-compliant arrangement.
 let xx=0,yy=0,xy=0;for(const p of source){xx+=(p.x-cx)**2;yy+=(p.y-cy)**2;xy+=(p.x-cx)*(p.y-cy);}
 const angle=.5*Math.atan2(2*xy,xx-yy),c=Math.cos(angle),s=Math.sin(angle);
 const result=source.map(p=>({...p}));
 sequence.forEach((id,k)=>{
  const t=n===1?0:k/(n-1),u=t-.5,a=2*Math.PI*k/n,side=k%2?1:-1;
  let x=u*w,y=0,floor=base;
  switch(typology){
   case 'vertical-void-lobby':x=Math.cos(a)*w*.3;y=Math.sin(a)*w*.3;floor+=t*h*.8;break;
   case 'compressed-sequential-lobby':x=u*w*1.2;y=side*w*(Math.floor(k/2)%2?.3:.07);floor+=Math.floor(k/2)%2?h*.06:0;break;
   case 'continuous-hall-lobby':x=u*w;y=side*w*.28;break;
   case 'topographic-ground-field-lobby':x=u*w;y=side*w*.2;floor+=t*h*.3+Math.abs(Math.sin(t*Math.PI*2))*h*.08;break;
   case 'linear-gallery-lobby':x=u*w*1.5;y=side*w*.08;floor+=t*h*.08;break;
   case 'open-hall-workspace':x=u*w*.9;y=side*w*.32;break;
   case 'cascaded-terraced-plates':x=u*w;y=side*w*.14;floor+=Math.floor(t*3)*h*.2;break;
   case 'flat-deep-plan-plate':{const cols=Math.ceil(Math.sqrt(n));x=(k%cols-(cols-1)/2)*w/cols;y=(Math.floor(k/cols)-(Math.ceil(n/cols)-1)/2)*w/cols;break;}
   case 'void-edge-workspace':x=Math.cos(a)*w*.42;y=Math.sin(a)*w*.35;break;
   case 'folded-undulating-work-surface':x=u*w;y=side*w*.14;floor+=(.5-.5*Math.cos(t*Math.PI*4))*h*.3;break;
   case 'stepped-amphitheater':{const tier=Math.floor(k/3),theta=Math.PI*(k%3)/2;x=Math.cos(theta)*w*(.2+tier*.12);y=Math.sin(theta)*w*(.2+tier*.12);floor+=tier*h*.14;break;}
   case 'void-field-gathering':x=Math.cos(a)*w*.36;y=Math.sin(a)*w*.36;floor+=k%3===0?0:h*.45;break;
   case 'inserted-horizontal-plate':x=u*w*.8;y=side*w*.18;floor+=k===0?0:k===n-1?h*.75:h*.35;break;
   case 'contained-room-within-volume':x=Math.cos(a)*w*(k<n/3?.12:.42);y=Math.sin(a)*w*(k<n/3?.12:.42);floor+=k<n/3?h*.12:0;break;
   case 'linear-edge-gallery':x=u*w*1.3;y=w*.3;floor+=h*.45;break;
  }
  const p=source[id],b=boxes[id];
  // Align actual solid bottoms (or roofs), not centers of differently oriented letters.
  const z=typology==='continuous-hall-lobby'||typology==='open-hall-workspace'
   ?base+h-(b.max[2]-p.z):floor-(b.min[2]-p.z);
  result[id]={...p,x:cx+x*c-y*s,y:cy+x*s+y*c,z};
 });
 return result;
}
