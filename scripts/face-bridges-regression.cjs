const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const THREE = require(path.join(root, 'node_modules/three'));
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { buildFaceBridges, DEFAULT_FACE_BRIDGES } = require(path.join(root, 'src/components/faceBridges.ts'));
const { getLetterVolumeGeometry } = require(path.join(root, 'src/components/letterGeometry3d.ts'));
const item = (letter, z, extra = {}) => ({ letter, x: 0, y: 0, z, rx: 0, ry: 0, rz: 0, scale: 1, scaleX: 1, scaleY: 1, scaleZ: 1, ...extra });
const settings = { ...DEFAULT_FACE_BRIDGES, maxDistance: 2, consolidate: false };
function check(mesh) {
  assert(mesh.count > 0, 'Expected a bridge');
  assert(mesh.positions.every(Number.isFinite));
  const edges = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    const [a,b,c] = ids.map(id => new THREE.Vector3().fromArray(mesh.positions, id * 3));
    assert(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-10, 'Degenerate face');
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3];
      const key = [Math.min(a,b),Math.max(a,b)].join(':');
      const edge = edges.get(key) || { count: 0, winding: 0 };
      edge.count++; edge.winding += a < b ? 1 : -1; edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) assert(edge.count === 2 && edge.winding === 0, 'Open or incorrectly wound surface');
  const landings = new Set();
  // Eight displayed pairs per bridge must have distinct destination points.
  for (let i = 3; i < 48; i += 6) landings.add(mesh.points.slice(i,i+3).map(v => v.toFixed(6)).join(':'));
  assert.equal(landings.size, 8, 'Destination samples collapsed to a point');
}
// Every endpoint must actually lie on the triangle mesh of the proper letter.
function checkEndpoints(mesh, instances) {
  const surfaces = instances.map(obj => {
    const geom = getLetterVolumeGeometry(obj.letter, 12);
    const pos = geom.getAttribute('position');
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(obj.x,obj.y,obj.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...[obj.rx,obj.ry,obj.rz].map(THREE.MathUtils.degToRad))), new THREE.Vector3(obj.scale*obj.scaleX,obj.scale*obj.scaleY,obj.scale*obj.scaleZ));
    const tris=[];
    for(let i=0;i<pos.count;i+=3) tris.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,i+j).applyMatrix4(matrix))));
    return tris;
  });
  for (let i=0;i<mesh.points.length;i+=3) {
    const p=new THREE.Vector3().fromArray(mesh.points,i);
    const triangles=surfaces[(i/3)%2];
    assert(triangles.some(t=>t.closestPointToPoint(p,new THREE.Vector3()).distanceTo(p)<1e-5),'Endpoint is off its letter');
  }
}
for (const a of ['V','U','L']) for (const b of ['V','U','L']) {
  const pair=[item(a,0),item(b,1)];
  const mesh=buildFaceBridges(pair,12,settings); check(mesh); checkEndpoints(mesh,pair);
}
for (const extra of [{rx:20,ry:25,rz:15,scaleX:1.3,scaleY:.8}, {ry:90}, {rx:90}]) {
  const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(...[extra.rx||0,extra.ry||0,extra.rz||0].map(THREE.MathUtils.degToRad)));
  const pair=[item('L',0,extra),item('U',normal.z,{...extra,x:normal.x,y:normal.y})];
  const mesh=buildFaceBridges(pair,12,settings); check(mesh); checkEndpoints(mesh,pair);
}
const pair=[item('L',0),item('L',1)];
for (const curvature of [0,100]) for(const width of [15,100]) for(const thickness of [15,100]) check(buildFaceBridges(pair,12,{...settings,curvature,width,thickness}));
assert.equal(buildFaceBridges(pair,12,{...settings,enabled:false}).count,0);
assert.equal(buildFaceBridges(pair,12,{...settings,maxDistance:.05}).count,0);
assert.equal(buildFaceBridges(pair,12,{...settings,mode:'different'}).count,0);
assert.equal(buildFaceBridges(pair,12,{...settings,direction:'x'}).count,0);
const width = mesh => Math.hypot(mesh.positions[1152]-mesh.positions[1200],mesh.positions[1153]-mesh.positions[1201]);
assert(width(buildFaceBridges(pair,12,{...settings,width:100})) > width(buildFaceBridges(pair,12,{...settings,width:15})));
console.log('PASS: distinct XY endpoints, transformed faces, watertight nondegenerate meshes, controls and filters.');

// Width and thickness change the interior, never the perimeter attachments.
const narrow=buildFaceBridges(pair,12,{...settings,width:15,thickness:15});
const wide=buildFaceBridges(pair,12,{...settings,width:100,thickness:100});
assert.deepEqual(narrow.points,wide.points);
console.log('PASS: perimeter anchors remain fixed across width/thickness changes.');

{ // Changing typology changes topology, not just bridge surface styling.
const { typologyBridgeSettings } = require(path.join(root, 'src/components/faceBridges.ts'));
const behavior = {horizontalPlateDominance:.5,surfaceContinuity:0,terracing:0,topographicDeformation:0,verticalConnectivity:.4,linearity:0,openness:1,convergence:0};
const pair = [item('L',0),item('L',1)];
const sparse = buildFaceBridges(pair,12,typologyBridgeSettings(settings,behavior));
const dense = buildFaceBridges(pair,12,typologyBridgeSettings(settings,{...behavior,surfaceContinuity:1,openness:0,convergence:1}));
assert(sparse.count > 0 && dense.count > sparse.count, 'Continuous typology must add bridges compared with open typology');
assert.equal(buildFaceBridges(pair,12,typologyBridgeSettings(settings,behavior)).count,sparse.count,'Switching back must restore the sparse topology');
console.log(`PASS: typology adds/removes bridges (${sparse.count} open, ${dense.count} continuous).`);

}

for (const [axis,plane] of [['x','YZ'],['y','XZ']]) {
  const side = buildFaceBridges([item('L',0),item('L',0,{[axis]:1.5})],12,{...settings,maxDistance:3});
  check(side);
  console.log(`PASS: ${plane} face grid produces watertight perimeter bridges (${side.count}).`);
}

{
 const consolidated=buildFaceBridges([item('L',0),item('L',1)],12,{...settings,consolidate:true});
 check(consolidated);
 assert.equal(consolidated.count,1,'One face pair should form one consolidated bridge');
 console.log('PASS: adjacent XY grid connections form one watertight bridge.');
}
