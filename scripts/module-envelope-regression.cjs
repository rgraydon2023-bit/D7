const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {moduleWorkflow,moduleZ,moduleHeight,BASE_MODULE}=require('../src/components/moduleEnvelope.ts');
// An oblique tetrahedron catches incorrect area scaling and normal transforms.
const mesh={positions:[0,0,0,2,0,0,0,3,0,0,0,4],indices:[0,2,1,0,1,3,0,3,2,1,2,3],normals:[0,0,-1,0,-1,0,-1,0,0,1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)],volume:4,area:20.810249675906654,components:1,pairs:0,included:[0]};
const data={source:mesh,arrangedSource:mesh,enclosure:mesh,intersections:mesh,bridges:mesh,variants:{letters:mesh,voids:mesh,combined:mesh},links:[{start:[0,0,0],end:[0,0,4]}],settings:{}};
const before=JSON.stringify(data);
assert.equal(moduleWorkflow(data,0,BASE_MODULE),data);
for(const range of [{bottom:0,top:2},{bottom:-1,top:1},{bottom:-1,top:3}]){
 const result=moduleWorkflow(data,0,range),factor=range.top-range.bottom;
 assert.equal(moduleHeight(range),20*factor);
 assert.equal(moduleZ(10,0,range)-moduleZ(-10,0,range),20*factor);
 for(const key of ['letters','voids','combined']){const m=result.variants[key];assert.deepEqual(m.indices,mesh.indices);assert.equal(m.components,1);assert.equal(m.volume,mesh.volume*factor);assert(m.area>mesh.area);assert(m.positions.every(Number.isFinite));}
 assert.equal(result.links[0].end[2]-result.links[0].start[2],4*factor);
 assert(Math.abs(moduleZ(.5/factor,0,range)-moduleZ(0,0,range)-.5)<1e-10,'movement must stay six inches at every height');
 for(let i=0;i<result.source.normals.length;i+=3)assert(Math.abs(Math.hypot(...result.source.normals.slice(i,i+3))-1)<1e-10);
}
assert.equal(JSON.stringify(data),before,'module edits must not mutate the canonical workflow');
console.log('PASS: module growth above/below, topology, metrics, normals, six-inch movement and immutable base.');
