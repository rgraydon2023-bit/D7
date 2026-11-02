const assert=require('node:assert/strict');
const letters=['U','L','V','U','L','V','U','L'];
const placements=letters.map((letter,i)=>({letter,x:Math.cos(i*Math.PI/4),y:Math.sin(i*Math.PI/4),z:0,rx:0,ry:0,rz:0,scale:.7728,scaleX:1,scaleY:1,scaleZ:1}));
const controls={levelRise:.25,staggerPercent:25,staggerDirection:90,boundaryRotation:0,alcoveDepthPercent:25,alcoveWidthPercent:30,protectedVoidRadius:0,protectedVoidOffsetX:0,protectedVoidOffsetY:0,minimumClearance:0,requireConnectivity:true};
(async()=>{
 const {default:moduleFactory}=await import('manifold-3d/manifold');const wasm=await moduleFactory();wasm.setup();const {Manifold,Mesh}=wasm;
 for(const [typology,roles] of [['void-field-gathering',{U:'void',L:'floor',V:'edge'}],['inserted-horizontal-plate',{U:'edge',L:'floor',V:'wall'}]]){
  const response=await fetch('http://localhost:3000/api/letter-intersections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflow:true,placements,thickness:12,typology,faceBridges:{enabled:false},gatheringOperations:{...controls,boundaryRoles:roles}})});
  assert(response.ok,typology+': '+await response.clone().text());const data=await response.json();
  assert.deepEqual(data.arrangement.originalPlacements,placements,'Original selection must remain traceable');
  assert.equal(data.arrangement.placements.length,placements.length);assert.equal(data.variants.letters.components,1);
  assert(data.protectedVoid.indices.length>0,'Missing protected atrium geometry');
  assert.equal(data.gatheringValidation.find(item=>item.label==='Protected openings').status,'pass');
  assert(data.arrangement.overlapFractions.every(fraction=>fraction>=.005),'Letters do not physically overlap before bridging');
  const heights=data.arrangement.placements.map(p=>p.z);assert(Math.max(...heights)-Math.min(...heights)>.05,'Letter levels collapsed');
  for(const p of data.arrangement.placements){assert.equal(p.scaleX,1);assert.equal(p.scaleY,1);assert.equal(p.scaleZ,1);if(typology==='inserted-horizontal-plate')assert(Math.abs(p.rz/90-Math.round(p.rz/90))<1e-8,'Non-orthogonal plate orientation');else {const angle=Math.atan2(p.y,p.x)*180/Math.PI;const delta=((p.rz-angle-90+540)%360)-180;assert(Math.abs(delta)<1e-6,'Letter does not follow the radial axis');}}
  const owned=[],make=m=>{const solid=new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));owned.push(solid);return solid;};
  try{const solid=make(data.variants.letters),voidSolid=make(data.protectedVoid),intersection=solid.intersect(voidSolid);owned.push(intersection);assert(intersection.volume()<1e-8,'Protected opening is obstructed');}finally{owned.forEach(s=>s.delete());}
  console.log('PASS',typology,'8 source letters, level rise, orientations, protected opening, one connected component');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
