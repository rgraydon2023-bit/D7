const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {acuteVoidCorners,acuteFilletProfile}=require('../src/components/acuteVoidFillets.ts');
(async()=>{const {default:Module}=await import('manifold-3d/manifold');const w=await Module();w.setup();const owned=[],own=x=>(owned.push(x),x);try{
const notch=[[-2,-1],[2,-1],[2,1],[.5,1],[0,0],[-.5,1],[-2,1]];
const section=own(new w.CrossSection([notch])),solid=own(section.extrude(.4));
const mesh=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
const corners=acuteVoidCorners(mesh(solid));assert(corners.length>0);assert(corners.every(c=>c.angle<Math.PI/2&&c.width<2));
assert.equal(acuteVoidCorners(mesh(own(solid.scale(3)))).length,0,'wide acute void must not be filleted');
const c=corners[0],profile=acuteFilletProfile(c,.08);assert(profile.radius<=c.width*.1);assert(profile.radius/Math.tan(c.angle/2)<=c.reach*.2+1e-9);assert(profile.points.every(p=>p.every(Number.isFinite)));
const right=own(new w.CrossSection([[[-2,-1],[2,-1],[2,1],[1,1],[0,0],[-1,1],[-2,1]]]));assert.equal(acuteVoidCorners(mesh(own(right.extrude(.4)))).length,0,'90-degree notch is not acute');
console.log('PASS: acute detection, 2-ft width threshold, right-angle exclusion, and small fillet preserving at least 80% of opening depth.');
}finally{owned.reverse().forEach(x=>x.delete());}})().catch(e=>{console.error(e);process.exitCode=1});
