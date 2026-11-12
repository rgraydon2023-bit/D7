// node scripts/assignment-source-selection-regression.cjs --real-inputs <directory> --report <json-file>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {parseObj}=require('../src/components/lattice/parseObj.ts');
const {analyzeMesh}=require('../src/components/lattice/analyze.ts');
const {LATTICE_SLOTS}=require('../src/components/lattice/slots.ts');
const {buildAssignedSourcePool,selectDistinctForms,searchAssignmentCopies,assertEligibleAssignmentSources}=require('../src/components/lattice/assignmentSearch.ts');
const arg=f=>{const i=process.argv.indexOf(f);return i<0?null:process.argv[i+1];},realDir=arg('--real-inputs'),reportPath=arg('--report');
const root=path.resolve(__dirname,'..'),sourceId=id=>id.split('::')[0];
const triangles=m=>m.faces.reduce((n,f)=>n+Math.max(0,f.vertices.length-2),0);
const fixture='# feet, Z-up\no assigned\nv -8 -8 0\nv 8 -8 0\nv 8 8 0\nv -8 8 0\nf 1 2 3 4';
const samples=LATTICE_SLOTS.map(slot=>{const filename=`${slot.id}-${slot.name.replace(/[ /]/g,'-')}.obj`;return {mesh:parseObj(fs.readFileSync(path.join(root,'public/part2-samples',filename),'utf8'),filename),slot:slot.id,origin:'sample'};});
const uploads=LATTICE_SLOTS.map(slot=>{const filename=realDir?fs.readdirSync(realDir).find(n=>n.startsWith(slot.id+'-')&&n.endsWith('.obj')):`${slot.id}-assigned.obj`;assert(filename,`Missing real OBJ for ${slot.id}`);return {mesh:parseObj(realDir?fs.readFileSync(path.join(realDir,filename),'utf8'):fixture,filename),slot:slot.id,origin:'upload'};});
const records=[...samples,...uploads],meshes=records.map(s=>s.mesh),models=records.map(s=>analyzeMesh(s.mesh,s.slot,1,s.mesh.upAxis));
const assignments=Object.fromEntries(uploads.map(s=>[s.slot,s.mesh.id])),eligible=buildAssignedSourcePool(models,meshes,assignments);
const allowed=new Set(uploads.map(s=>s.mesh.id)),forbidden=new Set(samples.map(s=>s.mesh.id));
assert.equal(meshes.length,30);assert.equal(models.length,30);assert.equal(eligible.length,15);assert.deepEqual(new Set(eligible.map(m=>m.id)),allowed);
const staleSeed={...models[0],id:models[0].id+'::0'},livePreviewSeed={...eligible[0],id:eligible[0].id+'::8',filename:'stale preview',slotId:'L5'};
assert.equal(selectDistinctForms(eligible,4,[staleSeed,livePreviewSeed])[0],eligible[0],'preview seed must resolve to canonical source');
assert.deepEqual(selectDistinctForms([...eligible].reverse(),4,[staleSeed]).map(m=>m.id),selectDistinctForms(eligible,4,[staleSeed]).map(m=>m.id),'source selection must not depend on record array order');
assert.equal(buildAssignedSourcePool(models,meshes,{}).length,0);
assert.throws(()=>buildAssignedSourcePool(models.filter(m=>m.id!==uploads[0].mesh.id),meshes,assignments),/Assigned source unavailable/);
assert.throws(()=>buildAssignedSourcePool(models,meshes,{...assignments,G1:'missing-source'}),/Assigned source unavailable/);
const demo=buildAssignedSourcePool(models,meshes,Object.fromEntries(samples.map(s=>[s.slot,s.mesh.id])));assert(demo.every(m=>forbidden.has(m.id)));
assert.throws(()=>assertEligibleAssignmentSources([{id:staleSeed.id}],[staleSeed],allowed),/eligibility violation/);
assert.throws(()=>assertEligibleAssignmentSources([{id:eligible[0].id+'::missing'}],eligible,allowed),/eligibility violation/);
(async()=>{const runs=[];for(const count of [2,3,4,8]){
 const result=await searchAssignmentCopies(count===4?models:eligible,count,{cancelled:()=>false,onProgress:()=>{}},undefined,{cellsX:5,cellsY:5,cellsZ:1},[staleSeed,livePreviewSeed],allowed);
 assert.equal(result.tiles.length,count);assert(result.formIds.every(id=>allowed.has(sourceId(id))));assert(result.models.every(m=>allowed.has(sourceId(m.id))));assert(result.placementNotes.every(n=>allowed.has(n.sourceId)));
 const selected=result.tiles.map(tile=>{const id=sourceId(tile.id),record=records.find(s=>s.mesh.id===id),model=result.models.find(m=>m.id===tile.id);assert(allowed.has(id)&&!forbidden.has(id));return {slot:model.slotId,sourceId:id,filename:record.mesh.filename,origin:record.origin,vertices:record.mesh.positions.length/3,triangles:triangles(record.mesh),selectedVariant:tile.variant,rotation:model.variants[tile.variant].rotation,mirror:model.variants[tile.variant].mirror};});
 assert(selected.every(s=>s.origin==='upload'));const g1=selected.find(s=>s.slot==='G1');assert(g1&&g1.sourceId===assignments.G1);if(realDir){assert.equal(g1.vertices,12576);assert.equal(g1.triangles,21421);}
 runs.push({count,status:result.status,selected});console.log(`PASS ${count} forms: assigned uploads only; no sample IDs or preview records`);if(count===4)console.table(selected);
 }const report={realInputs:realDir?path.resolve(realDir):null,sources:30,eligible:15,assignedSources:uploads.map(s=>({slot:s.slot,sourceId:s.mesh.id,filename:s.mesh.filename,origin:s.origin,vertices:s.mesh.positions.length/3,triangles:triangles(s.mesh)})),runs};if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log('PASS stale seeds, reordered pools, missing assigned analysis, sample demo, invalid-result guards');})().catch(e=>{console.error(e);process.exitCode=1;});
