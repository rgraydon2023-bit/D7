const assert=require('node:assert/strict');
(async()=>{
 const {default:Module}=await import('manifold-3d/manifold');const wasm=await Module();wasm.setup();const {Manifold,Mesh,CrossSection}=wasm;
 const placements=[{letter:'U',x:0,rz:0},{letter:'U',x:0,rz:180},{letter:'L',x:1.2,rz:0}].map(p=>({y:0,z:0,rx:0,ry:0,scale:1,scaleX:1,scaleY:1,scaleZ:1,...p}));
 const r=await fetch('http://127.0.0.1:3000/api/letter-intersections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflow:true,typology:"flat-deep-plan-plate",placements,thickness:20,faceBridges:{enabled:true,gridDivisions:4,maxDistance:2,width:70,thickness:80,curvature:35,smoothness:62,maxConnections:4,direction:'all',mode:'all'}})});assert(r.ok,await r.clone().text());const d=await r.json();
 assert(d.links.length>0,'non-vacuous side bridges');assert(d.links.every(l=>l.plane==='xz'||l.plane==='yz'));
 const owned=[];const own=s=>(owned.push(s),s);const solid=m=>own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)})));
 try{const source=solid(d.arrangedSource),a=solid(d.variants.letters),footprint=source.project();owned.push(footprint);const holes=footprint.toPolygons().filter(p=>p.reduce((sum,v,i)=>{const q=p[(i+1)%p.length];return sum+v[0]*q[1]-q[0]*v[1];},0)<0);assert(holes.length>0,'fixture has an enclosed void');const opening=own(new CrossSection(holes.map(p=>[...p].reverse()),'NonZero'));const shaft=own(own(opening.extrude(10)).translate([0,0,-5]));assert(Math.abs(own(a.intersect(shaft)).volume())<1e-6,'A fills the void');assert(Math.abs(own(source.subtract(a)).volume())<1e-6,'A removes letters');console.log('PASS: XZ/YZ bridges only; enclosed central void preserved; source letters retained.');}finally{owned.reverse().forEach(s=>s.delete());}
})().catch(e=>{console.error(e);process.exitCode=1;});

