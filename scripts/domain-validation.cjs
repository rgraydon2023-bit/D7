// Reproducible full-field contrast test. No browser state is modified.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const engine = require('../.typology-matrix-build/src/components/amphitheaterPrototype.js');
const {DEFAULT_DESCRIPTORS} = require('../.typology-matrix-build/src/components/compositionEngine.js');
const source = Array.from({length:192}, (_,i) => ({cell:{id:`domain-${i}`,letter:['V','U','L'][i%3],rotation:i*23%90},sourceIndex:i,layerIndex:Math.floor(i/48),x:(i%8-3.5)*1.12,y:(2.5-Math.floor(i/8)%6)*1.12,z:(Math.floor(i/48)-1.5)*1.12,rx:i%3*7,ry:i%2*11,rz:i*23%90,scale:.7168}));
const descriptors = structuredClone(DEFAULT_DESCRIPTORS);
const types = ['contained-room-within-volume','flat-deep-plan-plate','vertical-void-lobby'];
const reportDir = path.resolve(__dirname,'../reports/full-domain-validation'); fs.mkdirSync(reportDir,{recursive:true});
const analysis = engine.analyzeSourceGeometry(source,true);
const rows = [], views = [];
const input = {source,descriptors,seed:2041,continuityControls:engine.DEFAULT_CONTINUITY_CONTROLS};
fs.writeFileSync(path.join(reportDir,'fixture.json'),JSON.stringify({...input,note:'Deterministic 192-letter fixture, not a recovered seven-letter screenshot arrangement.'},null,2));

function svg(mesh, view, title) {
  const p=mesh.positions, inds=mesh.indices, polys=[];
  function project(i) { const x=p[i*3],y=p[i*3+2],z=p[i*3+1]; return view==='plan'?[x,-y,z]:view==='section'?[x,-z,y]:[(x-y)*.707,(x+y)*.37-z*.86,x+y+z*.4]; }
  for(let i=0;i<inds.length;i+=3) {
    const ids=inds.slice(i,i+3);
    // A true central cutaway, using the same source coordinate plane.
    if(view==='section' && ids.every(j=>p[j*3+2]>0)) continue;
    const pts=ids.map(project), depth=pts.reduce((a,b)=>a+b[2],0)/3;
    const a=ids.map(j=>[p[j*3],p[j*3+1],p[j*3+2]]), u=a[1].map((v,j)=>v-a[0][j]),v=a[2].map((n,j)=>n-a[0][j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;
    const shade=Math.round(160+65*Math.abs((n[0]*.3+n[1]*.85+n[2]*.4)/len));
    polys.push({depth,markup:`<polygon points="${pts.map(q=>`${250+q[0]*13},${260+q[1]*13}`).join(' ')}" fill="rgb(${shade},${shade+5},${shade+8})"/>`});
  }
  polys.sort((a,b)=>a.depth-b.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="440" viewBox="0 0 500 440"><rect width="500" height="440" fill="#081114"/><text x="15" y="24" fill="#9ce3df" font-family="sans-serif" font-size="14">${title}</text>${polys.map(x=>x.markup).join('')}</svg>`;
}
if (process.argv.includes('--render')) {
  const meshElements = elements => {
    const positions=[],indices=[];
    for(const e of elements.filter(e=>e.kind!=='void')) {
      const g=engine.architecturalElementGeometry(e);g.rotateY(e.rotation*Math.PI/180);g.translate(e.x,e.z,e.y);
      const p=g.getAttribute('position'),offset=positions.length/3;
      for(let i=0;i<p.count;i++) positions.push(p.getX(i),p.getY(i),p.getZ(i));
      if(g.index) for(let i=0;i<g.index.count;i++) indices.push(offset+g.index.getX(i));
      else for(let i=0;i<p.count;i++) indices.push(offset+i);
      g.dispose();
    }
    return {positions,indices};
  };
  const cards=[];
  const THREE=require('three');
  const {getLetterVolumeGeometry}=require('../.typology-matrix-build/src/components/letterGeometry3d.js');
  const sourceMesh={positions:[],indices:[]};
  const minX=Math.min(...source.map(p=>p.x)),maxX=Math.max(...source.map(p=>p.x)),minY=Math.min(...source.map(p=>p.y)),maxY=Math.max(...source.map(p=>p.y)),minZ=Math.min(...source.map(p=>p.z)),scale=16/Math.max(maxX-minX,maxY-minY,1);
  for(const p of source) {
    const g=getLetterVolumeGeometry(p.cell.letter,14).clone();
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.rz*Math.PI/180,p.ry*Math.PI/180)));
    g.scale(p.scale*scale*.5,p.scale*scale*.5,p.scale*scale*.5);
    g.translate((p.x-(minX+maxX)/2)*scale,(p.z-minZ)*scale,(p.y-(minY+maxY)/2)*scale);
    const a=g.getAttribute('position'),offset=sourceMesh.positions.length/3;
    for(let i=0;i<a.count;i++) sourceMesh.positions.push(a.getX(i),a.getY(i),a.getZ(i));
    if(g.index) for(let i=0;i<g.index.count;i++) sourceMesh.indices.push(offset+g.index.getX(i));else for(let i=0;i<a.count;i++) sourceMesh.indices.push(offset+i);
    g.dispose();
  }
  fs.writeFileSync(path.join(reportDir,'original.svg'),svg(sourceMesh,'isometric','Original 192-letter domain / normalized'));
  for(const typology of types) {
    const file=path.join(reportDir,`${typology}-stages.json`); if(!fs.existsSync(file)) continue;
    const stages=JSON.parse(fs.readFileSync(file));
    const preview=engine.generateProtoArchitecture({...input,typology,mode:'combined',quality:'preview',sourceAnalysis:analysis});
    fs.writeFileSync(path.join(reportDir,`${typology}-organic.svg`),svg(preview.presentationMesh,'isometric',`${typology} / organic boundaries`));
    for(const view of ['isometric','plan','section']) fs.writeFileSync(path.join(reportDir,`${typology}-${view}.svg`),svg(stages.final,view,`${typology} / ${view}`));
    for(const [label,elements] of [['raw',stages.raw],['primary',stages.primary],['connections',stages.connections]]) fs.writeFileSync(path.join(reportDir,`${typology}-${label}.svg`),svg(meshElements(elements),'isometric',`${typology} / ${label}`));
    const line=(p,z)=>[250+(p[0]-p[1])*.707*13,260+((p[0]+p[1])*.37-z*.86)*13];
    const outlines=stages.sourceBoundaries.map(b=>`<polygon points="${b.points.map(p=>line(p,b.z).join(',')).join(' ')}" fill="none" stroke="${b.kind==='void'?'#46cad1':'#e8d58d'}" stroke-width=".65"/>`).join('');
    const links=stages.relationships.map(r=>{const a=line(r.from,r.fromZ),b=line(r.to,r.toZ);return `<path d="M${a.join(',')} L${b.join(',')}" stroke="#9991dc" stroke-width=".5"/>`;}).join('');
    fs.writeFileSync(path.join(reportDir,`${typology}-relationships.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="440"><rect width="500" height="440" fill="#081114"/><text x="15" y="24" fill="white">All extracted boundaries and relationships</text>${outlines}${links}</svg>`);
    cards.push(`<h2>${typology}</h2><main><figure><img src="original.svg"><figcaption>Original source</figcaption></figure>${['relationships','raw','primary','connections','organic','isometric','plan','section'].map(v=>`<figure><img src="${typology}-${v}.svg"><figcaption>${v}</figcaption></figure>`).join('')}</main>`);
  }
  fs.writeFileSync(path.join(reportDir,'development.html'),`<!doctype html><meta charset="utf-8"><title>LUV development stages</title><style>body{background:#081114;color:#ddd;font:16px sans-serif;padding:24px}main{display:grid;grid-template-columns:repeat(3,1fr)}figure{margin:6px}img{width:100%}</style><h1>Full-domain development review</h1><p>Same 192-letter source, seed 2041, descriptors and organic controls. Raw/primary views are contour extrusions before connectors and reconstruction. Organic boundaries are developed after circulation; final views show continuous reconstruction. Source geometry and all stage data are included in the JSON records.</p>${cards.join('')}`);
  process.exit(0);
}
for (const typology of types) for(const mode of ['letters','voids','combined']) {
  const t=Date.now();
  const result=engine.generateProtoArchitecture({...input,typology,mode,sourceAnalysis:analysis});
  const diagnostic=result.domainDiagnostic;
  assert(diagnostic && diagnostic.componentsUsed===diagnostic.componentsAvailable);
  assert.equal(diagnostic.relationshipsUsed,diagnostic.relationshipsAvailable);
  assert.equal(result.typologyDebug.rawTopology.terraceActive,false);
  assert(result.presentationMesh.indices.length>0);
  const row={typology,mode,ms:Date.now()-t,diagnostic,raw:result.typologyDebug.rawTopology,components:result.continuousMesh.componentCount,presentationComponents:result.presentationMesh.componentCount,validation:result.architecturalValidation};
  rows.push(row);
  fs.writeFileSync(path.join(reportDir,`${typology}-${mode}.json`),JSON.stringify(row,null,2));
  if(mode==='combined') {
    for(const view of ['isometric','plan','section']) {
      const name=`${typology}-${view}.svg`;
      fs.writeFileSync(path.join(reportDir,name),svg(result.presentationMesh,view,`${typology} / ${view}`));
      views.push(name);
    }
    fs.writeFileSync(path.join(reportDir,`${typology}-final.obj`),engine.architecturalObj(result));
    // Primary surfaces and secondary circulation shown before reconstruction.
    fs.writeFileSync(path.join(reportDir,`${typology}-stages.json`),JSON.stringify({source,sourceBoundaries:result.sourceBoundaries,relationships:result.sourceRelationships,raw:result.disconnectedElements,primary:result.initialElements,connections:result.connectorElements,final:result.presentationMesh}));
  }
  console.log(typology,mode,Math.round(row.ms/1000)+'s','components',row.components,'XYZ',diagnostic.final.map(x=>x.toFixed(2)).join(' / '));
  fs.writeFileSync(path.join(reportDir,'results.json'),JSON.stringify({fixture:input,rows},null,2));
}
// Descriptor and interior-source sensitivity is tested before reconstruction.
const sensitivity=[];
for(const typology of types) {
  const raw=(settings,src=source)=>JSON.stringify(engine.generateProtoArchitecture({...input,source:src,descriptors:settings,typology,mode:'combined',quality:'preview',sourceAnalysis:src===source?analysis:undefined}).elements);
  const base=raw(descriptors);
  const changes=Object.keys(descriptors).map(key=> {const next=structuredClone(descriptors); next[key].intensity=85; return {descriptor:key,changed:raw(next)!==base};});
  const shifted=source.map((p,i)=>i===75?{...p,x:p.x+.3,z:p.z+.4}:p);
  sensitivity.push({typology,descriptors:changes,interiorSourceChanged:raw(descriptors,shifted)!==base});
}
fs.writeFileSync(path.join(reportDir,'sensitivity.json'),JSON.stringify(sensitivity,null,2));
fs.writeFileSync(path.join(reportDir,'comparison.html'),`<!doctype html><meta charset="utf-8"><title>LUV full-domain validation</title><style>body{background:#081114;color:#dbe9e9;font:16px sans-serif;padding:24px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}img{width:100%}p{max-width:1000px}</style><h1>G4 / O3 / L1 — same complete source, seed and settings</h1><p>Combined mode. Deterministic 192-letter fixture. Identical projection and drawing scale. Left: isometric. Center: plan. Right: central section cutaway. These are geometry review views, not a certification of architectural usability.</p><main>${views.map(v=>`<img src="${v}" alt="${v}">`).join('')}</main>`);
console.log('Saved',reportDir);
