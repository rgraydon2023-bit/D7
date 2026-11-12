const fs = require('fs'), path = require('path'), Module = require('module'), vm = require('vm'), assert = require('node:assert/strict');
const ts = require('typescript');
const THREE = require('three');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'manifold-3d/manifold') return originalLoad.call(this, path.join(process.env.NODE_PATH || path.join(__dirname, '../node_modules'), 'manifold-3d/manifold.js'), ...args);
  return originalLoad.call(this, request, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { buildConnectionWorkflow } = require('../src/components/letterIntersectionSpaces.ts');
const { OFFICE_TYPOLOGIES } = require('../src/components/officeWorkspaceRules.ts');
const raw = fs.readFileSync(path.join(__dirname, 'letter-space-workflow-regression.cjs'), 'utf8');
const base = vm.runInNewContext(raw.split('\n')[1].replace('const payload=', '(').replace(/;\s*$/, ')')).placements;
const single = { letter: 'U', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, scaleX: 1, scaleY: 1, scaleZ: 1 };
const fixtures = [
  ['eight-source', base, 12],
  ['thin-three', base.slice(0, 3), 1],
  ['anisotropic-eight', base.map((p, i) => ({ ...p, scaleX: .7 + i * .1, scaleY: 1.4 - i * .08, scaleZ: .5 + i * .2 })), 12],
  ['single-U', [single], 12],
  ['single-L', [{...single,letter:'L'}], 12],
  ['two-L', [{...single,letter:'L'}, {...single,letter:'L',x:4}], 12],
  ['unequal-L', [{...single,letter:'L',scaleX:.7,scaleY:1.4}, {...single,letter:'L',x:4,scaleX:1.3,scaleY:.92,scaleZ:1.7}], 12],
  ['repeated-U', Array.from({ length: 8 }, (_, i) => ({ ...single, x: i * 4 })), 12],
  ['two-separated', [{ ...single, letter: 'L', x: -40 }, { ...single, letter: 'V', x: 40 }], 12],
];
(async () => {
  const results = [];
  for (const [fixture, placements, thickness] of fixtures) for (const id of OFFICE_TYPOLOGIES) {
    if (process.argv[3] && id !== process.argv[3]) continue;
    const started = Date.now();
    if(id==='open-hall-workspace'&&!placements.some(p=>p.letter==='L')){await assert.rejects(()=>buildConnectionWorkflow(placements,thickness,{enabled:true},id),/Open Hall uses L letters only/);results.push({fixture,id,expectedRejection:true});console.log('PASS '+fixture+' '+id+' (L-only selection check)');continue;}
    const data = await buildConnectionWorkflow(placements, thickness, { enabled: true, requiredGap: 1, maxConnections: 50, filletPercent: 50 }, id);
    assert.equal(data.variants.letters.components, 1, `${fixture} ${id}: disconnected letter space`);
    assert.equal(data.bridges.indices.length, 0, `${fixture} ${id}: added bridge/filler`);
    assert.equal(data.floors.indices.length, 0, `${fixture} ${id}: added plate`);
    assert.equal(data.links.length, 0, `${fixture} ${id}: old bridge link`);
    assert.equal(data.arrangement.placements.length, id==='open-hall-workspace'?placements.filter(p=>p.letter==='L').length*4:placements.length);
    assert(data.arrangement.placements.every((p, i) => p.letterRules.architectural === false && p.letter === placements[data.arrangement.sourceIndices[i]].letter && p.scaleX === placements[data.arrangement.sourceIndices[i]].scaleX && p.scaleY === placements[data.arrangement.sourceIndices[i]].scaleY && p.scaleZ === placements[data.arrangement.sourceIndices[i]].scaleZ));
    assert(data.variants.letters.positions.every(Number.isFinite));
    assert(Math.abs(data.variants.letters.volume - data.arrangedSource.volume) < data.arrangedSource.volume * 1e-6, `${fixture} ${id}: generated material differs from letter union`);
    for (const label of ['Selected letter geometry', 'Direct letter connectivity', 'No added bridges or plates', '20 ft envelope']) assert.equal(data.officeValidation.find(v => v.label === label)?.status, 'pass', `${fixture} ${id}: ${label}`);
    if (id === 'open-hall-workspace') {
      for(const label of ['L-only vocabulary','L wall and floor orientation','Shared X-axis orientation']) assert.equal(data.officeValidation.find(v=>v.label===label)?.status,'pass',label);
      const ordered=data.arrangement.placements;
      ordered.forEach((p,k)=>{
        assert.equal(p.letter,'L');
        const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180));
        const normal=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
        assert(Math.abs(Math.abs(k%4<2?normal.x:normal.z)-1)<1e-5,'Walls must stay on YZ and horizontal letters on XY');
        if(k%2){
          const a=ordered[k-1],base=new THREE.Quaternion().setFromEuler(new THREE.Euler(a.rx*Math.PI/180,a.ry*Math.PI/180,a.rz*Math.PI/180));
          const relative=base.invert().multiply(rotation);
          assert(new THREE.Vector3(1,0,0).applyQuaternion(relative).distanceTo(new THREE.Vector3(0,-1,0))<1e-5);
          assert(new THREE.Vector3(0,1,0).applyQuaternion(relative).distanceTo(new THREE.Vector3(-1,0,0))<1e-5);
        }
      });
      const stations=ordered.filter((_,i)=>i%4===0),steps=stations.slice(1).map((p,i)=>p.x-stations[i].x);
      assert(steps.every(step=>step>0));if(steps.length)assert(Math.max(...steps)-Math.min(...steps)<1e-5);
      assert(data.arrangement.sourceIndices.every(i=>placements[i].letter==='L'));
    }
    assert(data.officeValidation.some(v => v.status === 'unverified'), 'Preset performance checks must not all be inherited as passes');
    results.push({ fixture, id, ms: Date.now() - started, components: data.variants.letters.components, volume: data.variants.letters.volume, checks: data.officeValidation, notes: data.formation.operations });
    console.log(`PASS ${fixture} ${id} (${Date.now() - started} ms)`);
  }
  const output = process.argv[2];
  if (output) fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(`Passed ${results.length} office generation cases.`);
})().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
