const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
const current=require('../.typology-matrix-build/src/components/amphitheaterPrototype.js');
const file=path.resolve(__dirname,'../.typology-matrix-build/src/components/baseline.js');
const baseline=new Module(file,module); baseline.filename=file; baseline.paths=Module._nodeModulePaths(path.dirname(file));
baseline._compile(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../checkpoints/2026-09-28-before-full-domain/amphitheaterPrototype.ts.checkpoint.txt'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const input=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../reports/full-domain-validation/fixture.json')));
const rows=[];
for(const typology of ['contained-room-within-volume','flat-deep-plan-plate','vertical-void-lobby']) {
 const result=baseline.exports.generateProtoArchitecture({...input,typology,mode:'combined'});
 rows.push({typology,raw:result.typologyDebug.rawTopology,rawXYZ:current.elementXYZExtent(result.disconnectedElements),finalXYZ:current.meshXYZExtent(result.presentationMesh),components:result.continuousMesh.componentCount});
 console.log(typology,rows[rows.length-1].finalXYZ);
}
fs.writeFileSync(path.resolve(__dirname,'../reports/full-domain-validation/before.json'),JSON.stringify(rows,null,2));
