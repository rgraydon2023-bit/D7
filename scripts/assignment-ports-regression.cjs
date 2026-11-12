// Run with: node scripts/assignment-ports-regression.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const root = path.resolve(__dirname, '..');
const { analyzeMesh, transformSpecNormal, transformSpecPoint } = require('../src/components/lattice/analyze.ts');
const { parseObj } = require('../src/components/lattice/parseObj.ts');
const { packCell } = require('../src/components/lattice/types.ts');
const { extractConnectionPorts } = require('../src/components/lattice/connectionPorts.ts');
const { matchAssemblyPorts, scorePortPair, portRouteClear } = require('../src/components/lattice/portMatching.ts');
const { searchAssignmentCopies } = require('../src/components/lattice/assignmentSearch.ts');
const { synthesizeConnectors } = require('../src/components/lattice/connectionSynthesis.ts');
const { assembledObj } = require('../src/components/lattice/exportAssembly.ts');
const hooks = { cancelled: () => false, onProgress: () => {} };
const source = 'o plate\nv -4 -4 0\nv 4 -4 0\nv 4 4 0\nv -4 4 0\nvn 0 0 1\ng surface\nf 1//1 2//1 3//1 4//1';
const mesh = parseObj(source, 'test.obj');
const sourceSnapshot = JSON.stringify(mesh);
const base = analyzeMesh(mesh, 'G1', 1, 'z');
assert.equal(JSON.stringify(mesh), sourceSnapshot, 'analysis must not mutate original OBJ data');

const empty = { ...base.variants[0], occupied: [], floor: [], passage: [], voidCells: [], vertical: [], ports: [] };
assert.equal(extractConnectionPorts('empty', empty, 2).length, 0);
assert.equal(extractConnectionPorts('isolated', { ...empty, occupied: [packCell(0,0,0)], floor: [packCell(0,0,0)] }, 2).length, 0);

const port = { id: 'P1', sourceFormId: 'a', type: 'BRANCH_END', localPosition: [8,0,0], elevation: 0, outwardDirection: [1,0,0], upDirection: [0,0,1], usableWidth: 4, usableDepth: 6, confidence: .9, sourceCells: [] };
const a = { id: 'a', variant: 0, ix: 0, iy: 0, iz: 0 };
const b = { id: 'b', variant: 0, ix: 1, iy: 0, iz: 0 };
const facing = { ...port, localPosition: [-8,0,0], outwardDirection: [-1,0,0] };
assert(scorePortPair(port, a, facing, b));
assert.equal(scorePortPair(port, a, { ...facing, outwardDirection: [1,0,0] }, b), null, 'facing away cannot win through proximity');
assert.equal(scorePortPair(port, a, { ...facing, confidence: .2 }, b), null);
assert.equal(scorePortPair(port, a, { ...facing, elevation: 20 }, b), null);
assert.equal(scorePortPair(port, a, { ...facing, usableWidth: .5 }, b), null);

const directional = ['a','b'].map(id => ({ ...base, id, variants: base.variants.map(v => ({ ...v, ports: [{ ...port,
  localPosition: transformSpecNormal(port.localPosition, v.rotation, v.mirror),
  outwardDirection: transformSpecNormal(port.outwardDirection, v.rotation, v.mirror),
}] })) }));
const scores = directional[1].variants.map((v, variant) => matchAssemblyPorts(directional, [a, { ...b, variant }]).score);
assert.equal(scores[0], 0);
assert(Math.max(...scores) > 6);
assert.notEqual(scores.indexOf(Math.max(...scores)), 0, 'the winning existing variant must change with facing');
const report = { tileA: 'a', tileB: 'b', collision: 'FAIL' };
assert.equal(matchAssemblyPorts(directional, [a, { ...b, variant: 1 }], [report]).pairs.length, 0);
const blocker = { ...base, connectionSurface: undefined, id: 'blocker', variants: [{ ...empty, occupied: [packCell(5,0,0)] }] };
assert.equal(portRouteClear([8,0,0],[12,0,0],4,[{...a,id:'blocker'}],[blocker],['a','b']),false,'third forms obstruct connectors');

function connectorFor(plan, rise) {
  const pair = { ...scorePortPair(port,a,facing,b), from:[0,0,0],to:[plan,0,rise],plan,rise,distance:Math.hypot(plan,rise),connectionClass:Math.abs(rise)>.5?"VERTICAL":plan<=4?"DIRECT":"ADAPTIVE" };
  return synthesizeConnectors([],[],[],{portPairs:[pair]});
}
assert.equal(connectorFor(.5,0).connectors.length,1,'nearly meeting ports require a lofted transition');
assert.equal(connectorFor(2,0).connectors[0].kind,'plate');
assert.equal(connectorFor(8,0).connectors[0].kind,'bridge');
assert.equal(connectorFor(12,1).connectors[0].kind,'ramp');
const stairs = connectorFor(6,2);
assert.equal(stairs.stairs,1);
assert(stairs.connectors.every(c=>c.kind==='stair'));
assert.equal(stairs.landings,0,'do not add pads to every endpoint');
for (const tread of stairs.connectors) assert(Math.abs(tread.positions[2]-tread.positions[14])<1e-6,'treads are horizontal');
assert.equal(synthesizeConnectors(directional,[a,b],[],{portPairs:[]}).connectors.length,0,'do not fallback around facing rejection');

const samples = fs.readdirSync(path.join(root,'public/part2-samples')).filter(n=>n.endsWith('.obj')).map(name=>{
  const mesh = parseObj(fs.readFileSync(path.join(root,'public/part2-samples',name),'utf8'),name);
  return {mesh,model:analyzeMesh(mesh,name.slice(0,2),1,'z')};
});
for (const {model} of samples) {
  assert.equal(model.variants.length,12);
  assert(model.variants[0].ports.length>0);
  for (const variant of model.variants) for (const p of variant.ports) {
    const original = model.variants[0].ports.find(q=>q.id===p.id);
    assert.deepEqual(p.localPosition,transformSpecNormal(original.localPosition,variant.rotation,variant.mirror));
    assert.deepEqual(p.outwardDirection,transformSpecNormal(original.outwardDirection,variant.rotation,variant.mirror));
    assert.equal(p.usableWidth,original.usableWidth);
    if(original.profile)assert.deepEqual(p.profile,original.profile.map(edge=>transformSpecNormal(edge,variant.rotation,variant.mirror)),"usable boundary profiles follow all 12 existing variants");
    assert(p.sourceCells.every(cell=>variant.floor.includes(cell)));
  }
}
// Unit conversion and Y-up registration use the same anchored frame for ports and source export.
const yMesh={...mesh,positions:Float32Array.from(Array.from(mesh.positions).map((v,i)=>i%3===1 ? mesh.positions[i+1] : i%3===2 ? -mesh.positions[i-1] : v)),upAxis:'y'};
const scaled=analyzeMesh(yMesh,'G1',2,'y');
assert(scaled.variants[0].ports.length>0);
for(const variant of scaled.variants) for(const p of variant.ports) {
  const original=scaled.variants[0].ports.find(q=>q.id===p.id);
  assert.deepEqual(p.localPosition.map(v=>v===0?0:v),transformSpecPoint(original.localPosition,[0,0,0],variant.rotation,variant.mirror,[0,0,0]).map(v=>v===0?0:v));
}

(async()=>{
  const synthetic = ['G1','O1','L1','G2'].map((slotId,i)=>({...base,id:`synthetic-${i}`,slotId}));
  for (const models of [synthetic,samples.map(s=>s.model)]) for(const count of [2,3,4,8]) {
    const result=await searchAssignmentCopies(models,count,hooks,undefined,{cellsX:4,cellsY:4,cellsZ:1});
    assert.equal(result.field.cellsZ,1);
    assert.equal(result.tiles.length,count);
    assert(result.tiles.every(t=>t.iz===0&&(t.zLift??0)===0));
    assert.equal(new Set(result.tiles.map(t=>`${t.ix},${t.iy}`)).size,count);
    if(models!==synthetic) {
      assert.equal(result.status,'PASS');assert.equal(result.components,1);
      assert(result.synthesis.portPairs.length<=count-1&&result.synthesis.portPairs.length>0);
      assert.equal(result.synthesis.connectionDiagnostics.componentsAfter,1);
      assert(result.synthesis.portPairs.every(p=>p.distance<=20&&p.facing>=-.35));
      const instances=result.models.map(m=>({...samples.find(s=>s.model.id===m.id.split('::')[0]).mesh,id:m.id}));
      const before=assembledObj(instances,result.placements,result.models,1,'z');
      const after=assembledObj(instances,result.placements,result.models,1,'z',result.synthesis.connectors);
      assert.equal((before.match(/^v /gm)||[]).length,instances.reduce((n,m)=>n+m.positions.length/3,0));
      assert.equal((before.match(/^f /gm)||[]).length,instances.reduce((n,m)=>n+m.faces.length,0));
      assert(after.startsWith(before.trimEnd()),'synthesis only appends export geometry');
      assert(!after.includes('BRANCH_END'),'debug metadata must not enter OBJ architecture');
    }
    console.log(`PASS ${models===synthetic?'synthetic':'bundled'} ${count} forms: Z=1; ${result.synthesis.portPairs.length} port pairs; ${result.synthesis.connectors.length} connector meshes`);
  }
  const multilevel=await searchAssignmentCopies(synthetic,2,hooks,undefined,{cellsX:3,cellsY:3,cellsZ:2});
  assert.equal(multilevel.field.cellsZ,2);
  const tall=synthetic.map(m=>({...m,maxZ:100}));
  const tallResult=await searchAssignmentCopies(tall,4,hooks,undefined,{cellsX:4,cellsY:4,cellsZ:1});
  assert.equal(tallResult.tiles.length,4,'source height must not restrict a single root level');
  assert(tallResult.tiles.every(t=>t.iz===0&&t.zLift===0));
  assert.equal(JSON.stringify(mesh),sourceSnapshot);
  console.log('PASS extraction, 12 variants, units/up-axis, facing, collision, minimal synthesis, multilevel opt-in, tall sources, and source-preserving export');
})().catch(error=>{console.error(error);process.exitCode=1;});
