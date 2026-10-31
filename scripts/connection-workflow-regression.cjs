const assert=require('node:assert/strict');
(async()=>{
 const {default:Module}=await import('manifold-3d/manifold');const wasm=await Module();wasm.setup();const {Manifold,Mesh}=wasm;
 const placements=['U','L','V'].map((letter,z)=>({letter,x:0,y:0,z,rx:0,ry:0,rz:0,scale:1,scaleX:1,scaleY:1,scaleZ:1}));
 const body={workflow:true,placements,thickness:12,typology:'stepped-amphitheater',faceBridges:{enabled:true,gridDivisions:4,maxDistance:1.5,width:70,thickness:80,curvature:35,smoothness:62,maxConnections:4,direction:'all',mode:'all'}};
 const response=await fetch('http://127.0.0.1:3000/api/letter-intersections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(response.ok,await response.clone().text());const data=await response.json();
 const own=[];const hold=s=>(own.push(s),s);const solid=m=>hold(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)})));
 try {
  const source=solid(data.arrangedSource??data.source),a=solid(data.variants.letters),b=solid(data.variants.voids),c=solid(data.variants.combined),bridges=solid(data.bridges);
  for(const s of [source,a,b,c,bridges])assert.equal(s.status(),'NoError');
  const tolerance=1e-5;
  assert(data.arrangement,'Expected the generated letter arrangement');
  assert(data.links.every(l=>l.from!==l.to&&l.from<placements.length&&l.to<placements.length));
  assert(b.volume()>=0&&c.volume()>=a.volume()-tolerance);
  assert(Math.abs(hold(b.intersect(source)).volume())<tolerance,'B includes letter solids');
  assert(Math.abs(hold(source.subtract(a)).volume())<tolerance,'A lost source letters');
  assert(Math.abs(hold(bridges.subtract(a)).volume())<tolerance,'A lost bridge geometry');
  const expected=hold(a.add(b));
  assert(Math.abs(hold(c.subtract(expected)).volume())<tolerance,'C has unrelated geometry');
  assert(Math.abs(hold(expected.subtract(c)).volume())<tolerance,'C omits A/B geometry');
  for(const [mode,m] of Object.entries(data.variants)){assert(m.positions.every(Number.isFinite));assert(m.indices.length>0);assert(m.components>0);assert(m.volume>0);console.log(mode,m.volume,m.components);}
 }finally{own.forEach(s=>s.delete());}
 const off=await fetch('http://127.0.0.1:3000/api/letter-intersections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,faceBridges:{...body.faceBridges,enabled:false}})});assert(off.ok);const none=await off.json();assert.equal(none.links.length,0);assert.equal(none.variants.voids.indices.length,0);assert.equal(none.variants.letters.volume,none.variants.combined.volume);
 console.log('PASS: A contains source and bridges; B excludes letters; C equals A union B; disabled bridges create no gap geometry.');
})().catch(e=>{console.error(e);process.exitCode=1;});




