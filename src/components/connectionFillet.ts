import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d/manifold';
/** Radius is concave on -1..0 and convex on 0..1; both halves have equal height. */
export function connectionFilletRadius(z:number,radius:number){const neck=radius*.55;return z<=0?neck+(radius-neck)*(1-Math.sin((z+1)*Math.PI/2)):neck*Math.cos(z*Math.PI/2);}
export function connectionFillet(wasm:ManifoldToplevel,center:[number,number,number],radius:number,own:(s:Manifold)=>Manifold){
 const points:Vec2[]=[[0,-radius],[radius,-radius]];
 for(let i=1;i<=32;i++){const z=-1+i/16;points.push([Math.max(0,connectionFilletRadius(z,radius)),z*radius]);}
 points.push([0,radius]);
 const section=new wasm.CrossSection([points],'NonZero');
 try{return own(own(section.revolve(32)).translate(center));}finally{section.delete();}
}
