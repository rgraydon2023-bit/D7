const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {buildFaceBridges,DEFAULT_FACE_BRIDGES}=require('../src/components/faceBridges.ts');
const item=x=>({letter:'U',x,y:0,z:0,rx:0,ry:0,rz:0,scale:1,scaleX:1,scaleY:1,scaleZ:1});
const settings={...DEFAULT_FACE_BRIDGES,enabled:false,maxDistance:.05,maxConnections:1,typologyCoverage:0,requiredGap:1,allowedPlanes:['xz','yz']};
const near=buildFaceBridges([item(0),item(1.859)],20,settings);assert(near.count>0,'gap just under a foot must connect');assert(near.links.every(l=>l.required&&l.gapFeet<1&&l.plane!=='xy'));
const far=buildFaceBridges([item(0),item(1.861)],20,settings);assert.equal(far.count,0,'gap above one foot must not be forced');
const multiple=buildFaceBridges([item(0),item(1.2),item(-1.2)],20,settings);assert(multiple.links.some(l=>l.from===0&&l.to===1));assert(multiple.links.some(l=>l.from===0&&l.to===2),'required links exceed optional neighbor limit');
const tiny=buildFaceBridges([item(0),item(.87)],20,settings);assert(tiny.count>0,'sub-.02-foot gap must connect');
console.log('PASS: near/far one-foot threshold, tiny gaps, disabled optional bridges, zero coverage, and neighbor-budget override.');

