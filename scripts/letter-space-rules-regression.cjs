const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),THREE=require('three');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {architecturalLetterGeometry}=require('../src/components/architecturalLetterGeometry.ts');
const {arrangeTypologyLetters,typologyLayout}=require('../src/components/typologyLetterArrangement.ts');
const {buildTypologyContinuity}=require('../src/components/typologyContinuity.ts');
const {connectionFilletRadius}=require('../src/components/connectionFillet.ts');
const {letterOverlapFractions}=require('../src/components/letterOverlapRule.ts');
const {placementMatrix}=require('../src/components/architecturalConnections.ts');
const {foundationPoses,orientationFamily,orientationSteps}=require('../src/components/typologyOrientationRules.ts');
const {spatialCriteria}=require('../src/components/typologySpatialCriteria.ts');
(async()=>{const {default:Module}=await import('manifold-3d/manifold');const w=await Module();w.setup();
for(const id of Object.keys(spatialCriteria).filter(id=>!process.argv[2]||id===process.argv[2])){
 console.log("Checking",id);
 const owned=[],own=s=>(owned.push(s),assert.equal(s.status(),'NoError',id),s);
 const make=p=>{const g=architecturalLetterGeometry(p.letter,12,p.letterRules),pos=g.getAttribute('position'),idx=g.getIndex(),matrix=placementMatrix(p),vertices=[],triangles=[],seen=new Map();for(let i=0;i<(idx?.count??pos.count);i++){const v=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(matrix),key=v.toArray().map(x=>Math.round(x*1e7)).join(',');let index=seen.get(key);if(index===undefined){index=vertices.length/3;vertices.push(v.x,v.y,v.z);seen.set(key,index);}triangles.push(index);}return own(new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)})));};
 try{
 const source=['U','L','V','U','L','V'].map((letter,i)=>({letter,x:i*.3,y:i%2,z:i*.1,rx:20,ry:10,rz:35,scale:Number(process.argv[3]??1),scaleX:1,scaleY:1,scaleZ:1})),original=JSON.stringify(source);
 const arrangement=arrangeTypologyLetters(source,source.map(make),make,id);assert.equal(JSON.stringify(source),original);assert.equal(arrangement.placements.length,source.length);
 const layout=typologyLayout(id);
 const family=orientationFamily(id),steps=orientationSteps(family),near=(a,b)=>Math.abs(a-b)<1e-7;
 arrangement.placements.forEach(p=>{
  if(p.letter!=='V'&&!layout.topographic)assert(near(p.rz/steps.xy,Math.round(p.rz/steps.xy)),id+' XY interval');
  if(p.letter!=='V'&&!layout.topographic)for(const a of [p.rx,p.ry])assert(steps.vertical?near(a/steps.vertical,Math.round(a/steps.vertical)):near(a,0),id+' vertical interval');
  if(p.letter==='V'){const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180));const tilt=Math.acos(Math.max(-1,Math.min(1,normal.z)))*180/Math.PI;assert(tilt>=45-1e-6&&tilt<=135+1e-6,id+' V face tilt');}
  if(family==='amphitheater'&&p.letter==='U')assert(Math.abs(p.rx)<=30&&p.ry===0,id+' seating tilt');
 });
 if(family==='rigid'||family==='flat'){
  const center=source.reduce((v,p)=>[v[0]+p.x/source.length,v[1]+p.y/source.length],[0,0]);
  const poses=foundationPoses(source,arrangement.sequence,id,1,0).poses;
  poses.forEach(p=>assert(poses.some(q=>near(p.u+q.u,0)&&near(p.v+q.v,0)&&near(p.z,q.z)),id+' symmetric foundation')); 
 }

 arrangement.placements.forEach(p=>{assert.equal(p.letterRules.architectural,true);assert.equal(p.letterRules.mirrored,false);assert(p.scale>0);});
 if(family==='void')for(let k=1;k<arrangement.sequence.length;k++){const a=arrangement.placements[arrangement.sequence[k-1]],b=arrangement.placements[arrangement.sequence[k]];assert(near(a.x,b.x)&&near(a.y,b.y),id+' shared Z axis');assert(b.z>a.z,id+' increasing levels');}
 if(layout.topographic){
  const tilts=arrangement.sequence.map(i=>{const p=arrangement.placements[i];return Math.acos(Math.max(-1,Math.min(1,Math.cos(p.rx*Math.PI/180)*Math.cos(p.ry*Math.PI/180))))*180/Math.PI;});
  assert(Math.abs(tilts[0])<1e-6&&Math.abs(tilts.at(-1)-90)<1e-6,'Horizontal base and vertical top');
  for(let i=1;i<tilts.length;i++)assert(tilts[i]>=tilts[i-1]-1e-6,'Progressive tilt');
  const cx=source.reduce((v,p)=>v+p.x/source.length,0),cy=source.reduce((v,p)=>v+p.y/source.length,0);let previous,first,last;
  for(const i of arrangement.sequence){const p=arrangement.placements[i];let a=Math.atan2(p.y-cy,p.x-cx)*180/Math.PI;if(previous!==undefined)while(a<previous-1e-6)a+=360;first??=a;last=a;previous=a;
   const open=new THREE.Vector3(...(p.letter==='U'?[0,-1,0]:p.letter==='V'?[0,1,0]:[1,1,0])).normalize().applyEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180));
   assert(open.dot(new THREE.Vector3(cx-p.x,cy-p.y,0).normalize())>.99,id+' openings face center');
  }assert(last-first>=90-1e-6&&last-first<=120+1e-6,id+' spiral sweep');
 }
 for(let k=1;k<arrangement.sequence.length;k++)assert(arrangement.placements[arrangement.sequence[k]].z>arrangement.placements[arrangement.sequence[k-1]].z,id+' positive rise');
 const locked=arrangement.placements.map(make);
 if(layout.topographic){
  assert.deepEqual(arrangement.sequence.map(i=>source[i].letter),['U','U','L','L','V','V'],'Curves, Ls, then Vs');
  const firstV=arrangement.sequence.find(i=>source[i].letter==='V'),lastL=arrangement.sequence.filter(i=>source[i].letter==='L').at(-1);
  const vm=locked[firstV].getMesh(),bottom=locked[firstV].boundingBox().min[2],tip=new THREE.Vector3();let count=0;
  for(let i=0;i<vm.vertProperties.length;i+=vm.numProp)if(Math.abs(vm.vertProperties[i+2]-bottom)<1e-6){tip.add(new THREE.Vector3().fromArray(vm.vertProperties,i));count++;}tip.divideScalar(count);
  const lm=locked[lastL].getMesh();let distance=Infinity;
  for(let i=0;i<lm.triVerts.length;i+=3){const t=new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromArray(lm.vertProperties,lm.triVerts[i+k]*lm.numProp)));distance=Math.min(distance,t.closestPointToPoint(tip,new THREE.Vector3()).distanceTo(tip));}
  assert(distance<1e-5,'V lower edge starts on L boundary');
  const boxes=locked.map(s=>s.boundingBox());assert(Math.min(...boxes.map(b=>b.min[2]))>=-1e-6,'Grounded letters');assert(Math.max(...boxes.map(b=>b.max[2]))<=4+1e-6,'Four-foot maximum');
 }
 const fractions=letterOverlapFractions(locked);assert(fractions.every(f=>f>=.25-1e-6),id+' each letter must overlap 25% of its own volume');
 const letters=locked,links=buildTypologyContinuity(w,letters,arrangement.sequence,id,own),joined=own(w.Manifold.union([...letters,...(links.solid?[links.solid]:[])]));
 assert.equal(links.connections,Math.max(0,letters.length-1),id+' must bridge every adjacent pair even when letters intersect');assert(links.solid.volume()>0,id+' rounded bridge solid');
 const shells=joined.decompose();assert.equal(shells.filter(p=>p.volume()>1e-7).length,1,id+' must be continuous');shells.forEach(s=>s.delete());
 if(layout.axis||layout.topographic)assert(links.floors?.volume()>0,id+' floors');
 }finally{owned.reverse().forEach(s=>s.delete());}
}
for(const z of [-.75,-.5,-.25,.25,.5,.75]){const h=.001,d=connectionFilletRadius(z+h,1)-2*connectionFilletRadius(z,1)+connectionFilletRadius(z-h,1);assert(z<0?d>0:d<0,'Lower concave / upper convex curvature');}
console.log('PASS: all 15 typologies apply architectural letter profiles and preserve connected final solids.');
})().catch(e=>{console.error(e);process.exitCode=1});
