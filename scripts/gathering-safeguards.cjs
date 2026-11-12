const fs = require('fs'), path = require('path'), Module = require('module'), vm = require('vm'), crypto = require('crypto'), assert = require('node:assert/strict');
const ts = require('typescript');
const root = process.env.APP_ROOT || path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if(request === 'manifold-3d/manifold') return originalLoad.call(this, path.join(process.env.NODE_PATH || path.join(root, 'node_modules'), 'manifold-3d/manifold.js'), ...args);
  return originalLoad.call(this, request, ...args);
};
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
const {buildConnectionWorkflow} = require(path.join(root, 'src/components/letterIntersectionSpaces.ts'));
const {DEFAULT_GATHERING_OPERATIONS, defaultGatheringBoundaryRoles, GATHERING_TYPOLOGIES} = require(path.join(root, 'src/components/gatheringOperations.ts'));
const {gatheringAngleStops, fitGatheringLimits} = require(path.join(root, 'src/components/gatheringAngleStops.ts'));
const ids = ['stepped-amphitheater','void-field-gathering','inserted-horizontal-plate','contained-room-within-volume','linear-edge-gallery'];
const otherIds = ['open-hall-workspace','flat-deep-plan-plate','cascaded-terraced-plates','void-edge-workspace','folded-undulating-work-surface','vertical-void-lobby','compressed-sequential-lobby','continuous-hall-lobby','topographic-ground-field-lobby','linear-gallery-lobby'];
const raw = fs.readFileSync(path.join(root, 'scripts/letter-space-workflow-regression.cjs'),'utf8');
const eight = vm.runInNewContext(raw.split('\n')[1].replace('const payload=','(').replace(/;\s*$/,')')).placements;
const three = ['L','U','V'].map((letter,i)=>({letter,x:i*.6,y:i%2*.15,z:0,rx:0,ry:0,rz:0,scale:1,scaleX:1,scaleY:1,scaleZ:1}));
const fixtures = {
  'eight-default':{placements:eight,thickness:12},
  'thin-three':{placements:three,thickness:1},
  'unequal-eight':{placements:eight.map((p,i)=>({...p,scaleX:.7+i*.1,scaleY:1.4-i*.08,scaleZ:.5+i*.2})),thickness:12},
  'single-U':{placements:[{...three[1]}],thickness:12},
  'requested-rise':{placements:eight,thickness:12,operations:{levelRise:.25,staggerPercent:15,protectedVoidOffsetY:10}},
  'large-rise':{placements:eight,thickness:12,operations:{levelRise:3}},
  'three':{placements:three,thickness:12},
  'two-L':{placements:[{...three[0]},{...three[0],x:.6}],thickness:12},
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const controls = (id, extra={}) => ({...DEFAULT_GATHERING_OPERATIONS,staggerPercent:id==='contained-room-within-volume'?15:25,boundaryRoles:defaultGatheringBoundaryRoles(id),...extra});
async function generate(id, fixture, extra={}, angles) {
  const f=fixtures[fixture];
  return buildConnectionWorkflow(f.placements,f.thickness,{enabled:true,maxConnections:8,requiredGap:1,filletPercent:20},id,undefined,angles,controls(id,{...f.operations,...extra}));
}
function summarize(data) {
  const p=data.arrangement.placements,seq=data.arrangement.sequence,rises=seq.slice(1).map((id,k)=>p[id].z-p[seq[k]].z);
  const geometryHash=hash([data.arrangedSource,data.variants,data.floors,data.bridges,data.links]);
  let degenerates=0;const mesh=data.variants.letters;
  for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=[0,1,2].map(k=>mesh.positions.slice(mesh.indices[i+k]*3,mesh.indices[i+k]*3+3));const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(!n.every(Number.isFinite)||Math.hypot(...n)<=1e-12)degenerates++;}
  return {hash:hash(data),geometryHash,placementHash:hash(p),components:mesh.components,letterCount:p.length,volume:mesh.volume,triangles:mesh.indices.length/3,finite:mesh.positions.every(Number.isFinite),degenerateTriangles:degenerates,bridgeIndices:data.bridges.indices.length,floorIndices:data.floors?.indices.length??0,links:data.links.length,minRise:rises.length?Math.min(...rises):null,maxRise:rises.length?Math.max(...rises):null,minOverlap:p.length>1?Math.min(...data.arrangement.overlapFractions):null,xySpread:Math.max(0,...p.map(v=>Math.hypot(v.x-p[0].x,v.y-p[0].y))),angles:p.map(v=>[v.rx,v.ry,v.rz]),validation:data.gatheringValidation??data.officeValidation,operations:data.formation.operations};
}
function verifyGathering(id, fixture, data, row) {
  const original=fixtures[fixture].placements;
  assert.deepEqual(JSON.parse(JSON.stringify(data.arrangement.originalPlacements)),JSON.parse(JSON.stringify(original)));
  assert.equal(row.letterCount,original.length);
  assert.equal(row.components,1,`${id}/${fixture}: disconnected`);
  assert(row.finite && row.volume>0);
  assert.equal(row.bridgeIndices,0); assert.equal(row.floorIndices,0); assert.equal(row.links,0);
  assert(Math.abs(data.arrangedSource.volume-data.variants.letters.volume)<Math.max(1e-10,data.arrangedSource.volume*1e-6));
  data.arrangement.placements.forEach((p,i)=>{assert.equal(p.letter,original[i].letter);assert.equal(p.scaleX,original[i].scaleX);assert.equal(p.scaleY,original[i].scaleY);assert.equal(p.scaleZ,original[i].scaleZ);assert.equal(p.letterRules.architectural,false);});
  assert.equal(data.gatheringValidation.find(v=>v.label==='Rotation limits').status,'pass');
  assert.equal(data.officeValidation,undefined);
  for(const label of ['Rule A/B source handoff','Rule A orientation family'])assert.equal(data.gatheringValidation.find(v=>v.label===label)?.status,'pass',id+'/'+fixture+': '+label);
  if(id==='void-field-gathering'){assert(data.arrangement.placements.every(p=>p.rx===0&&p.ry===0));if(original.length>1)assert(row.minRise>0);}
  if(id==='contained-room-within-volume'){assert(row.xySpread<1e-6);if(original.length>1)assert(row.minRise>0);}
  const marker = {'stepped-amphitheater':'Stepped amphitheater:','void-field-gathering':'Void field radial foundation:','inserted-horizontal-plate':'Inserted plate foundation:','contained-room-within-volume':'Contained room:','linear-edge-gallery':'Linear gallery:'}[id];
  assert(data.formation.operations[0].startsWith(marker), 'Wrong Gathering dispatch');
}
async function main() {
 const [mode,output,baselinePath]=process.argv.slice(2);const results=[];
 const save=()=>fs.writeFileSync(output,JSON.stringify({mode,root,results},null,2));
 if(mode==='record-compat'||mode==='verify-compat'){
  const baseline=baselinePath?JSON.parse(fs.readFileSync(baselinePath,'utf8')).results:[];
  for(const id of otherIds){const prior=baseline.find(x=>x.id===id),attempts=[];let found;
   for(const fixture of prior?[prior.fixture]:['three','eight-default','two-L']){try{const data=await generate(id,fixture),row=summarize(data);assert(row.volume>0&&row.finite&&row.components===1);const angleStops=gatheringAngleStops(fixtures[fixture].placements,id,controls(id));found={id,fixture,...row,angleStops,attempts};if(prior){assert.equal(row.hash,prior.hash,id+' changed workflow output');assert.deepEqual(JSON.parse(JSON.stringify(angleStops)),prior.angleStops,id+' changed control dependencies');}break;}catch(error){attempts.push({fixture,error:error.message});if(prior)throw error;}}
   assert(found,'No successful representative for '+id+': '+JSON.stringify(attempts));results.push(found);console.log('PASS compatibility',id,found.fixture);save();
  }
 }else if(mode==='record-gathering'||mode==='verify-gathering'){
  for(const fixture of ['eight-default','thin-three','unequal-eight','single-U','requested-rise','large-rise'])for(const id of ids){const started=Date.now();const data=await generate(id,fixture),row=summarize(data);verifyGathering(id,fixture,data,row);results.push({id,fixture,ms:Date.now()-started,...row});console.log('PASS Gathering',id,fixture);save();}
  for(const id of ids){const f='eight-default',ops=controls(id),stops=gatheringAngleStops(eight,id,ops),limits=fitGatheringLimits({xMin:stops.x.min,xMax:stops.x.max,yMin:stops.y.min,yMax:stops.y.max,zMin:stops.z.min,zMax:stops.z.max},stops);try{const d=await generate(id,f,{},limits);results.push({id,fixture:'tight-angle-controls',limits,...summarize(d)});console.log('PASS tight controls',id);}catch(error){if(mode!=='record-gathering')throw error;results.push({id,fixture:'tight-angle-controls',limits,error:error.message});console.log('REPRODUCED control failure',id,error.message);}save();}
 }else if(mode==='api'){
  for(const id of ids){const f=fixtures['eight-default'],response=await fetch('http://127.0.0.1:3000/api/letter-intersections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflow:true,typology:id,placements:f.placements,thickness:f.thickness,faceBridges:{enabled:false},gatheringOperations:controls(id)})});assert(response.ok,await response.clone().text());const data=await response.json(),row=summarize(data);verifyGathering(id,'eight-default',data,row);results.push({id,transport:'JSON',...row});console.log('PASS API dispatch',id);save();}
  const id='void-field-gathering',f=fixtures['eight-default'],response=await fetch('http://127.0.0.1:3000/api/letter-intersections',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({workflow:true,typology:id,placements:f.placements,thickness:f.thickness,faceBridges:{enabled:false},gatheringOperations:controls(id)})});assert(response.ok);const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));assert(events.some(e=>e.type==='progress'));assert(!events.some(e=>e.type==='error'));const data=events.find(e=>e.type==='result')?.data;assert(data);const row=summarize(data);verifyGathering(id,'eight-default',data,row);results.push({id,transport:'NDJSON',progressEvents:events.filter(e=>e.type==='progress').length,...row});save();console.log('PASS streamed Gathering dispatch');
 }else if(mode==='control-regression'){
  const id='void-field-gathering',source=fixtures['single-U'].placements,ops=controls(id),stops=gatheringAngleStops(source,id,ops);
  for(const axis of ['x','y'])for(const end of ['min','max'])assert.equal(Math.abs(stops[axis][end]),0);
  const limits=fitGatheringLimits({xMin:stops.x.min,xMax:stops.x.max,yMin:0,yMax:0,zMin:0,zMax:360},stops),data=await generate(id,'single-U',{},limits);
  assert(!data.formation.operations.some(note=>note.includes('overlap target was not met')),'Single letters must not receive an inapplicable overlap warning');
  const {inactiveGatheringOperation}=require(path.join(root,'src/components/gatheringRuleChecks.ts'));
  for(const typology of ids){for(const key of ['boundaryRotation','alcoveDepthPercent','alcoveWidthPercent','minimumClearance'])assert(inactiveGatheringOperation(typology,key));assert(!inactiveGatheringOperation(typology,'levelRise'));}
  assert(inactiveGatheringOperation('contained-room-within-volume','staggerPercent'));
  results.push({id,fixture:'single-U-tight-controls',stops,limits,disabledControlsChecked:true,...summarize(data)});save();console.log('PASS narrow Void-Field controls, singleton overlap and inactive controls');
 }else if(mode==='sensitivity'){
  for(const id of ids){const base=await generate(id,'eight-default'),reference=summarize(base);const changes={levelRise:{levelRise:.25},staggerPercent:{staggerPercent:id==='contained-room-within-volume'?0:id==='inserted-horizontal-plate'?10:15},staggerDirection:{staggerDirection:0},boundaryRotation:{boundaryRotation:15},alcoveDepthPercent:{alcoveDepthPercent:35},alcoveWidthPercent:{alcoveWidthPercent:60},minimumClearance:{minimumClearance:2},protectedVoidRadius:{protectedVoidRadius:.2},protectedVoidOffsetX:{protectedVoidOffsetX:.5},protectedVoidOffsetY:{protectedVoidOffsetY:.5},boundaryRoles:{boundaryRoles:{L:'wall',U:'wall',V:'wall'}},requireConnectivity:{requireConnectivity:false}};
   for(const [parameter,extra]of Object.entries(changes)){const data=await generate(id,'eight-default',extra),row=summarize(data);results.push({id,parameter,extra,geometryChanged:row.geometryHash!==reference.geometryHash,placementChanged:row.placementHash!==reference.placementHash,...row});console.log('SENSITIVITY',id,parameter,row.geometryHash!==reference.geometryHash?'changed':'unchanged');save();}
  }
 }else throw Error('Unknown mode '+mode);
 console.log('PASS',mode,results.length,'cases');
}
main().catch(error=>{console.error(error.stack??error);process.exitCode=1;});
