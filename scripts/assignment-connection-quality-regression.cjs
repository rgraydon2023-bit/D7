const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {scorePortPair,assessPortPair,matchAssemblyPorts,DEFAULT_PORT_TOLERANCES}=require('../src/components/lattice/portMatching.ts');
const {synthesizeConnectors}=require('../src/components/lattice/connectionSynthesis.ts');
const {transitionSections,transitionMeshes}=require('../src/components/lattice/transitionGeometry.ts');
const {transitionSurfaceClear}=require('../src/components/lattice/connectionClearance.ts');
const {parseObj}=require('../src/components/lattice/parseObj.ts'),{analyzeMesh}=require('../src/components/lattice/analyze.ts');
const {assembledObj}=require('../src/components/lattice/exportAssembly.ts');
const {buildAssignedSourcePool,searchAssignmentCopies}=require('../src/components/lattice/assignmentSearch.ts');
const hooks={cancelled:()=>false,onProgress:()=>{}};
const source='o floor\nv -8 -3 0\nv 8 -3 0\nv 8 3 0\nv -8 3 0\nf 1 2 3 4';
const mesh=parseObj(source,'G1-upload.obj'),snapshot=JSON.stringify(mesh),base=analyzeMesh(mesh,'G1',1,'z');
assert.equal(JSON.stringify(mesh),snapshot);
const degenerate=parseObj("v 0 0 0\nv 4 0 0\nv 8 0 0\nf 1 2 3","degenerate.obj");
assert.equal(require("../src/components/lattice/connectionPorts.ts").extractSourceEdgePorts(degenerate,degenerate.positions,[]).length,0,"degenerate faces cannot create walkable ports");
const port=(id,x,y,z,n,width=4)=>({id,sourceFormId:'upload',type:'BRANCH_END',localPosition:[x,y,z],elevation:z,outwardDirection:n,upDirection:[0,0,1],usableWidth:width,usableDepth:6,confidence:.9,sourceCells:[]});
const tile=(id,ix)=>({id,variant:0,ix,iy:0,iz:0,zLift:0});
const a=tile('a',0),b=tile('b',1),pa=port('east',8,0,0,[1,0,0]);
const pb=port('west',-8,.8,.1,[-Math.cos(.15),-Math.sin(.15),0],3);
const direct=scorePortPair(pa,a,pb,b);assert(direct,'offset, angle and small rise accepted');
assert.equal(direct.connectionClass,'ADAPTIVE'); // Plan is slightly above 4 feet.
const short=scorePortPair(pa,a,{...pb,localPosition:[-9,.8,.1]},b);assert.equal(short.connectionClass,'DIRECT');
assert.equal(scorePortPair(pa,a,{...pb,localPosition:[-9,.8,.3],elevation:.3},b).connectionClass,'DIRECT','small elevation has a shallow direct transition');
assert.equal(scorePortPair(pa,a,{...pb,localPosition:[-11,0,.4],elevation:.4},b).connectionClass,'VERTICAL','short steep gap becomes a step instead of rejecting a feasible connection');
const directMesh=transitionMeshes(short)[0];
const signedVolume=m=>m.indices.reduce((sum,_,i)=>{if(i%3)return sum;const a=m.indices[i]*3,b=m.indices[i+1]*3,c=m.indices[i+2]*3,p=m.positions;return sum+(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;},0);
assert(signedVolume(directMesh)>0,'connector OBJ faces point outward');
assert(directMesh.positions.length>24,'DIRECT is a multi-section loft');
const sections=transitionSections(short);assert.equal(sections[0].width,4);assert.equal(sections.at(-1).width,3);
assert(sections.slice(1,-1).some(s=>Math.abs(s.center[1]-.8*(s.center[0]-8)/3)>.005),'neck gradually bends');
assert.equal(synthesizeConnectors([],[],[],{portPairs:[short]}).connectors.length,1);
const near=scorePortPair(pa,a,port('west',-11.5,0,0,[-1,0,0]),b);assert.equal(near.connectionClass,'DIRECT');assert(transitionMeshes(near)[0].indices.length>36,'near touch still has geometry');
const adaptive=scorePortPair(pa,a,port('west',-5,5,0,[-.8,-.6,0],3),b);assert.equal(adaptive.connectionClass,'ADAPTIVE');
const adaptiveSections=transitionSections(adaptive);assert(adaptiveSections.some(s=>s.center[1]>0));assert.notEqual(adaptiveSections[0].width,adaptiveSections.at(-1).width);
const ramp=scorePortPair(port('east',0,0,0,[1,0,0]),a,port('west',-8,0,1,[-1,0,0]),b);assert.equal(ramp.connectionClass,'VERTICAL');assert.equal(transitionMeshes(ramp)[0].kind,'ramp');
const stair=scorePortPair(pa,a,port('west',-6,0,2,[-1,0,0]),b);assert.equal(transitionMeshes(stair)[0].kind,'stair');assert.equal(transitionMeshes(stair).length,4);
for(const tread of transitionMeshes(stair))assert.equal(tread.positions[2],tread.positions[14],'first run of each tread horizontal');
for(const [change,reason] of [[{localPosition:[40,0,0]},'DISTANCE'],[{outwardDirection:[1,0,0]},'ANGLE'],[{elevation:15},'ELEVATION'],[{usableWidth:.5},'WIDTH'],[{confidence:.2},'LOW CONFIDENCE']])assert.equal(assessPortPair(pa,a,{...pb,...change},b).reason,reason);
assert.equal(assessPortPair(pa,a,port('west',-8,8,0,[-1,0,0]),b,{maxLateralOffset:2}).reason,'LATERAL OFFSET');
assert(scorePortPair(pa,a,port('west',-8,8,0,[-1,0,0]),b,{maxLateralOffset:10}),'configurable capture zone');
assert.equal(scorePortPair({...pa,usableWidth:120},a,port('west',-8,0,0,[-1,0,0],120),b),null,'avoid an oversized low-quality closure');
const empty={...base.variants[0],occupied:[],floor:[],passage:[],voidCells:[],ports:[]};
const models=['a','b','c','d'].map((id,i)=>({...base,id,connectionSurface:{positions:new Float32Array([-8,i*.35-(3+i*.2)/2,0,8,i*.35-(3+i*.2)/2,0,8,i*.35+(3+i*.2)/2,0,-8,i*.35+(3+i*.2)/2,0]),triangles:[0,1,2,0,2,3]},variants:[{...empty,ports:[port('west',-8,i*.35,0,[-1,0,0],3+i*.2),port('east',8,i*.35,0,[1,0,0],3+i*.2)]}]}));
const tiles=models.map((m,i)=>tile(m.id,i)),matched=matchAssemblyPorts(models,tiles),synthesis=synthesizeConnectors(models,tiles,[],{portPairs:matched.pairs,...matched});
assert.deepEqual(matchAssemblyPorts(models,tiles,[],{},false).pairs,matched.pairs,"search broad phase preserves accepted routes");
assert.equal(matched.pairs.length,3);assert.equal(matched.componentsBefore,4);assert.equal(matched.componentsAfter,1);assert.equal(synthesis.connectors.length,3);
assert.equal(new Set(matched.pairs.map(p=>[p.tileA,p.tileB].sort().join('|'))).size,3);
// A single broad landing supports three disjoint branch openings, rather than one center-only link.
const rectangle=(x,y)=>({positions:new Float32Array([-x,-y,0,x,-y,0,x,y,0,-x,y,0]),triangles:[0,1,2,0,2,3]});
const hub={...port('landing',8,0,0,[1,0,0],20),type:'LANDING_EDGE',profile:[[8,-10,0],[8,10,0]]};
const wideModels=[['hub',10,hub],['middle',2,port('branch',-8,0,0,[-1,0,0])],['north',8,port('branch',-8,-6,0,[-1,0,0])],['south',8,port('branch',-8,6,0,[-1,0,0])]].map(([id,y,p])=>({...base,id,connectionSurface:rectangle(8,y),variants:[{...empty,ports:[p]}]}));
const wideTiles=[{...tile('hub',0),iy:1},{...tile('middle',1),iy:1},{...tile('north',1),iy:2},tile('south',1)];
const wideSnapshot=JSON.stringify(wideModels.map(m=>m.connectionSurface)),wide=matchAssemblyPorts(wideModels,wideTiles);
assert.equal(wide.pairs.length,3,'broad landing connects every feasible disjoint branch opening');
assert.equal(wide.componentsAfter,1);assert.equal(new Set(wide.pairs.map(p=>p.portOffsetA)).size,3);
assert(wide.pairs.every(p=>p.startWidth===5&&p.endWidth===4),'landing opening fits existing branch edge');
assert.deepEqual(matchAssemblyPorts(wideModels,wideTiles,[],{},false).pairs,wide.pairs);
assert.equal(JSON.stringify(wideModels.map(m=>m.connectionSurface)),wideSnapshot,'usable subprofiles never trim source geometry');
assert.equal(scorePortPair(pa,a,port('touch',-12,0,0,[-1,0,0]),b),null,'zero gap never generates a folded loft');
console.log('PASS wide landing: 3 separate openings, 4 to 1 components, unchanged source surfaces');
// A thin source wall, invisible to empty voxel occupancy, blocks the direct ribbon.
const wall={...base,id:'wall',connectionSurface:{positions:new Float32Array([10,-1,-1,10,1,-1,10,1,7,10,-1,7]),triangles:[0,1,2,0,2,3]},variants:[empty]};
const pair=scorePortPair(pa,a,port('west',-8,0,0,[-1,0,0],2),b);
assert.equal(transitionSurfaceClear(pair,[tile('wall',0)],[wall]),false,'actual triangle wall collision');
const clearModels=models.slice(0,2).map(m=>({...m,variants:[{...empty,ports:[m.id==='a'?{...pa,usableWidth:2}:port('west',-8,0,0,[-1,0,0],2)]}]}));
const detour=matchAssemblyPorts([...clearModels,wall],[a,b,tile('wall',0)]);
assert.equal(detour.pairs.length,1,'blocked route finds a small smooth detour');assert.equal(detour.pairs[0].connectionClass,'ADAPTIVE');assert(detour.pairs[0].path.some(p=>Math.abs(p[1])>1));
const broadWall={...wall,id:'broad',connectionSurface:{positions:new Float32Array([10,-20,-1,10,20,-1,10,20,7,10,-20,7]),triangles:[0,1,2,0,2,3]}};
const blocked=matchAssemblyPorts([...clearModels,broadWall],[a,b,tile('broad',0)]);assert.equal(blocked.pairs.length,0);assert.equal(blocked.rejectionCounts.COLLISION,1);
assert.equal(transitionSurfaceClear(pair,[],[],transitionMeshes(pair)),false,'generated connectors cannot overlap');
// Conservative search bounds must preserve exactly the diagnostic matcher's accepted routes.
let boundCases=0;
for(const aa of [0,35,115])for(const ba of [0,180,295])for(const x of [-12,-8])for(const y of [-8,0,8])for(const tolerance of [{},{maxAngularDeviation:200},{maxDistance:8,maxAngularDeviation:35}]){
 const make=(id,x,y,degrees,width)=>{const angle=degrees*Math.PI/180,n=[Math.cos(angle),Math.sin(angle),0],p=port(id,x,y,0,n,width);return {...p,type:'LANDING_EDGE',profile:[[x-n[1]*width/2,y+n[0]*width/2,0],[x+n[1]*width/2,y-n[0]*width/2,0]]};};
 const ms=[{...base,id:'bound-a',connectionSurface:undefined,variants:[{...empty,ports:[make('edge-a',8,0,aa,12)]}]},{...base,id:'bound-b',connectionSurface:undefined,variants:[{...empty,ports:[make('edge-b',x,y,ba,4)]}]}],ts=[tile('bound-a',0),tile('bound-b',1)];
 assert.deepEqual(matchAssemblyPorts(ms,ts,[],tolerance,false).pairs,matchAssemblyPorts(ms,ts,[],tolerance,true).pairs,'search bounds retain eligible routes at angle/capture boundaries');boundCases++;
}
console.log('PASS search/diagnostic equivalence:',boundCases,'profile/angle/distance configurations');
(async()=>{
 const runs=[];
 for(const count of (process.argv.includes("--only-8")?[8]:process.argv.includes("--quick")?[2,3,4]:[2,3,4,8])){
  const uploads=['G1','O1','L1','G2','O2','L2','G3','O3'].slice(0,count).map(slot=>parseObj(source,slot+'-upload.obj'));
  const snapshots=uploads.map(m=>JSON.stringify(m)),analysed=uploads.map((m,i)=>analyzeMesh(m,uploads[i].filename.slice(0,2),1,'z'));
  const assignments=Object.fromEntries(uploads.map(m=>[m.filename.slice(0,2),m.id])),eligible=buildAssignedSourcePool(analysed,uploads,assignments),allowed=new Set(uploads.map(m=>m.id));
  const result=await searchAssignmentCopies(eligible,count,hooks,undefined,{cellsX:4,cellsY:4,cellsZ:1},[],allowed);
  assert.equal(result.tiles.length,count);assert.equal(result.components,1,'feasible source-edge network must be connected');assert(result.tiles.every(t=>t.iz===0&&t.zLift===0&&allowed.has(t.id.split('::')[0])));
  assert(result.models.every(m=>m.variants.length===12));assert.deepEqual(uploads.map(m=>JSON.stringify(m)),snapshots);
  const instances=result.models.map(m=>({...uploads.find(u=>u.id===m.id.split('::')[0]),id:m.id}));
  const before=assembledObj(instances,result.placements,result.models,1,'z'),after=assembledObj(instances,result.placements,result.models,1,'z',result.synthesis.connectors);
  assert(after.startsWith(before.trimEnd()));
  runs.push({count,status:result.status,components:result.components,diagnostics:result.synthesis.connectionDiagnostics,selected:result.tiles.map(t=>({id:t.id,iz:t.iz,variant:t.variant})),connectors:result.synthesis.connectors.length});
  console.log('PASS',count,'forms, source authority, Z=1, 12 variants, unchanged source/export;',result.synthesis.portPairs.length,'connections');
 }
 const report={tolerances:DEFAULT_PORT_TOLERANCES,fourFormAcceptance:{...synthesis.connectionDiagnostics,classes:matched.pairs.map(p=>p.connectionClass)},wideLanding:{candidates:wide.candidates.length,accepted:wide.pairs.length,rejectionCounts:wide.rejectionCounts,componentsBefore:wide.componentsBefore,componentsAfter:wide.componentsAfter,openings:wide.pairs.map(p=>({offset:p.portOffsetA,startWidth:p.startWidth,endWidth:p.endWidth,class:p.connectionClass}))},collisionTests:{detourAccepted:true,blockedRejected:true,generatedOverlapRejected:true},runs};
 const reportArg=process.argv.indexOf('--report');if(reportArg>=0)fs.writeFileSync(process.argv[reportArg+1],JSON.stringify(report,null,2));
 console.log('PASS graded offsets/angles/elevation, edge taper, DIRECT loft, ADAPTIVE bend, ramp/stairs, network and actual source/connector collision');
})().catch(e=>{console.error(e);process.exitCode=1;});
