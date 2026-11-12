const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript'),assert=require('assert/strict'),crypto=require('crypto');
const current=require('../.typology-matrix-build/src/components/amphitheaterPrototype.js');
const file=path.resolve(__dirname,'../.typology-matrix-build/src/components/baseline.js');
const baseline=new Module(file,module); baseline.filename=file; baseline.paths=Module._nodeModulePaths(path.dirname(file));
baseline._compile(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../checkpoints/2026-09-28-before-full-domain/amphitheaterPrototype.ts.checkpoint.txt'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const input=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../reports/full-domain-validation/fixture.json')));
const rows=[];const hash=r=>crypto.createHash('sha256').update(JSON.stringify([r.continuousMesh.positions,r.continuousMesh.indices])).digest('hex');
for(const typology of ['stepped-amphitheater','void-field-gathering','open-hall-workspace']) {
 const args={...input,typology,mode:'combined'};
 const before=hash(baseline.exports.generateProtoArchitecture(args)),after=hash(current.generateProtoArchitecture(args));
 assert.equal(after,before,typology+' mesh regression');rows.push({typology,identical:true,hash:after});console.log(typology,'unchanged');
}
const empty=current.generateProtoArchitecture({...input,source:[],mode:'voids',typology:'vertical-void-lobby',quality:'preview'});
assert.equal(empty.elements.length,0);assert.equal(empty.validation.valid,false);
fs.writeFileSync(path.resolve(__dirname,'../reports/full-domain-validation/regression.json'),JSON.stringify({rows,emptyVoidGuard:true},null,2));
