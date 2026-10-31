const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const filename=path.join(root,'src/components/faceBridges.ts');
const instrumented=new Module(filename,module);instrumented.filename=filename;instrumented.paths=Module._nodeModulePaths(path.dirname(filename));
const source=fs.readFileSync(filename,'utf8');
instrumented._compile(ts.transpileModule(source+'\nexport {cachedSurface,faceGridLines};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {cachedSurface,faceGridLines,buildFaceBridges,DEFAULT_FACE_BRIDGES}=instrumented.exports;
const item={letter:'U',x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,scaleX:1,scaleY:1,scaleZ:1};
for(const letter of ['L','U','V'])for(const divisions of [2,4,8]){const s=cachedSurface({...item,letter},12,divisions);console.log('Grid size',letter,divisions,'patches',s.patches.length,'triangles',s.triangles.length,'line entries',faceGridLines(s).length);}
const one=faceGridLines(cachedSurface(item,12,8)),count=Math.max(2,Math.ceil(200000/one.length));
const inputs=Array.from({length:count},()=>({...item}));
// Same letters + different-letter filter isolate grid append, without changing grid generation.
const settings={...DEFAULT_FACE_BRIDGES,gridDivisions:8,mode:'different',consolidate:false};
const actual=buildFaceBridges(inputs,12,settings);
assert(actual.lines.length>=200000);assert.equal(actual.lines.length,count*one.length);assert.equal(actual.count,0);
for(let i=0;i<actual.lines.length;i++)assert.equal(actual.lines[i],one[i%one.length],`entry ${i}`);
const again=buildFaceBridges(inputs,12,settings);assert.deepEqual(again,actual,'Cache reuse must not accumulate geometry');
// Verify the regression really reaches the former failing argument spread.
const old=new Module(filename,module);old.filename=filename;old.paths=instrumented.paths;
const oldSource=source.replace(/for \(const line of gridLines\) \{\s*lines.push\(line\);\s*\}/,'lines.push(...gridLines);');assert.notEqual(oldSource,source);
old._compile(ts.transpileModule(oldSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
assert.throws(()=>old.exports.buildFaceBridges(inputs,12,settings),RangeError);
console.log(`PASS: ${actual.lines.length} actual grid-line entries appended in exact order, repeat stable; old spread reproduces RangeError.`);

const small=[{...item},{...item,z:1}];
const smallSettings={...DEFAULT_FACE_BRIDGES,maxDistance:2};
assert.deepEqual(buildFaceBridges(small,12,smallSettings),old.exports.buildFaceBridges(small,12,smallSettings),'Geometry and ordering must be identical to the old implementation on safe-sized input');
console.log('PASS: exact old/new mesh equality on ordinary bridge generation.');
