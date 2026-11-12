// Diagnostic harness only. Does not write application files or browser state.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),engine=require(path.join(root,'.typology-matrix-build/src/components/amphitheaterPrototype.js'));
const fixture=require('../full-domain-validation/fixture.json');
const types=['contained-room-within-volume','flat-deep-plan-plate','vertical-void-lobby'],modes=['letters','voids','combined'];
const files=['amphitheaterPrototype.ts','PrototypeDemonstration.tsx','CompositionStudio.tsx'];
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const hashes=()=>Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,'src/components',f),'utf8'))]));
const before=hashes(),source=fixture.source;
const chosen=source.filter((p,i)=>i%8>=2&&i%8<=4&&Math.floor(i/8)%6>=2&&Math.floor(i/8)%6<=3&&p.layerIndex>=1&&p.layerIndex<=2).map(p=>p.sourceIndex);
const changed=source.map(p=>chosen.includes(p.sourceIndex)?{...p,x:p.x+.35,y:p.y+.15,z:p.z+.2,rz:p.rz+30}:p);
const removed=source.filter(p=>!chosen.includes(p.sourceIndex));
const analyses={base:engine.analyzeSourceGeometry(source,true),move:engine.analyzeSourceGeometry(changed,true),remove:engine.analyzeSourceGeometry(removed,true)};
const largest=[...analyses.base.voids].sort((a,b)=>b.area*(b.zMax-b.zMin)-a.area*(a.zMax-a.zMin))[0];
const same=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-7;
analyses.voidRemoval={...analyses.base,voids:analyses.base.voids.filter(v=>v.id!==largest.id),relationships:analyses.base.relationships.filter(r=>!(r.kind!=='adjacency'&&(same(r.from,largest.center)||same(r.to,largest.center))))};
fs.writeFileSync(path.join(__dirname,'inputs.json'),JSON.stringify({fixture,chosen,perturbation:{x:.35,y:.15,z:.2,rz:30},removedVoid:largest,analyses},null,2));
function bins(mesh){const set=new Set();for(let i=0;i<mesh.positions.length;i+=3)set.add(mesh.positions.slice(i,i+3).map(v=>Math.floor(v/.5)).join(','));return set;}
function compare(a,b){
 const raw=a.disconnectedElements, other=new Map(b.disconnectedElements.map(e=>[e.id,e]));
 const elements=raw.map(e=>{const f=other.get(e.id);if(!f)return{id:e.id,removed:true};let sq=0,n=0,max=0;for(const key of ['footprint','innerFootprint']){const p=e[key]||[],q=f[key]||[];for(let i=0;i<Math.min(p.length,q.length);i++){const d=Math.hypot(p[i][0]-q[i][0],p[i][1]-q[i][1]);sq+=d*d;n++;max=Math.max(max,d);}}return{id:e.id,rmsXY:n?Math.sqrt(sq/n):0,maxXY:max,dZ:f.z-e.z,dHeight:f.height-e.height,changed:hash(e)!==hash(f)};});
 const x=bins(a.presentationMesh),y=bins(b.presentationMesh);let intersection=0;for(const k of x)if(y.has(k))intersection++;
 return{elements,rawTopologySame:hash(a.typologyDebug.rawTopology)===hash(b.typologyDebug.rawTopology),finalSurfaceBinDifference:1-intersection/(x.size+y.size-intersection),finalHashChanged:hash(a.presentationMesh.positions)!==hash(b.presentationMesh.positions),extent:b.domainDiagnostic.final,components:b.presentationMesh.componentCount};
}
function svg(mesh,title){const p=mesh.positions,faces=[];const project=i=>[250+(p[i*3]-p[i*3+2])*.707*13,260+((p[i*3]+p[i*3+2])*.37-p[i*3+1]*.86)*13];for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3);faces.push({z:ids.reduce((s,j)=>s+p[j*3]+p[j*3+2]+p[j*3+1]*.4,0),s:`<polygon points="${ids.map(j=>project(j).join(',')).join(' ')}" fill="#b9cace" stroke="#84999d" stroke-width=".08"/>`});}faces.sort((a,b)=>a.z-b.z);return wrap(title,faces.map(f=>f.s).join(''));}
const wrap=(title,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="440"><rect width="500" height="440" fill="#0b161b"/><text x="14" y="24" fill="white" font-family="sans-serif" font-size="13">${title}</text>${body}</svg>`;
const proj=(p,z)=>[250+(p[0]-p[1])*.707*13,260+((p[0]+p[1])*.37-z*.86)*13];
function boundaries(a,mode,links=false,voids=false){const regions=voids?a.voids:mode==='letters'?a.letters:mode==='voids'?a.voids:[...a.letters,...a.voids];return regions.map((r,i)=>`<polygon points="${r.points.map(p=>proj(p,r.z).join(',')).join(' ')}" fill="none" stroke="${r.kind==='void'?'#54ddd1':'#edd889'}" stroke-width=".6"/>${i<8?`<text x="${proj(r.center,r.z)[0]}" y="${proj(r.center,r.z)[1]}" fill="white" font-size="9">${r.id}</text>`:''}`).join('')+(links?a.relationships.filter(r=>mode==='combined'||r.kind===(mode==='letters'?'adjacency':'void-link')).map(r=>`<path d="M${proj(r.from,r.fromZ).join(',')} L${proj(r.to,r.toZ).join(',')}" stroke="#b49fec" stroke-width=".6"/>`).join(''):'');}
const rows=[],cards=[];
for(const typology of types)for(const mode of modes){
 const result={};for(const test of ['base','move','remove','voidRemoval']){if(test==='voidRemoval'&&mode==='letters')continue;const t=Date.now();result[test]=engine.generateProtoArchitecture({...fixture,source:test==='move'?changed:test==='remove'?removed:source,typology,mode,sourceAnalysis:analyses[test],quality:'final'});console.log(typology,mode,test,Date.now()-t);}
 const base=result.base,name=typology+'-'+mode;
 const row={typology,mode,diagnostic:base.domainDiagnostic,raw:base.typologyDebug.rawTopology,components:base.presentationMesh.componentCount,perturbation:compare(base,result.move),removal:compare(base,result.remove),voidRemoval:result.voidRemoval?compare(base,result.voidRemoval):null};rows.push(row);
 fs.writeFileSync(path.join(__dirname,name+'-trace.json'),JSON.stringify({raw:base.disconnectedElements,connections:base.connectorElements,relationships:base.sourceRelationships,boundaries:base.sourceBoundaries},null,2));
 const rawBody=base.disconnectedElements.map(e=>`<polygon points="${(e.footprint||[]).map(p=>proj(p,e.z).join(',')).join(' ')}" fill="${e.kind==='enclosure'?'#a68962':'#6abfae'}" fill-opacity=".35" stroke="#aedcd0" stroke-width=".6"/>`).join('');
 for(const [label,body] of [['clusters',boundaries(analyses.base,mode)],['relationships',boundaries(analyses.base,mode,true)],['voids',boundaries(analyses.base,mode,false,true)],['raw',rawBody]])fs.writeFileSync(path.join(__dirname,name+'-'+label+'.svg'),wrap(label+' / '+mode,body));
 for(const test of Object.keys(result))fs.writeFileSync(path.join(__dirname,name+'-'+test+'.svg'),svg(result[test].presentationMesh,test+' / '+mode));
 cards.push(`<section><h2>${typology} / ${mode}</h2><p>Gold = extracted letter regions; teal = extracted voids; purple = relationships. Labels are extractor IDs, NOT proven architectural provenance. All regions feed aggregate outline/direction/Z summaries → prescribed typology organization. No cluster-to-zone assignment exists.</p><main><figure><img src="../full-domain-validation/original.svg"><figcaption>1 Original source</figcaption></figure>${['clusters','relationships','voids','raw','base','move','remove',...(mode==='letters'?[]:['voidRemoval'])].map((v,i)=>`<figure><img src="${name}-${v}.svg"><figcaption>${v}</figcaption></figure>`).join('')}</main></section>`);
 fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({chosen,removedVoid:largest.id,rows,before,after:hashes()},null,2));
 fs.writeFileSync(path.join(__dirname,'SOURCE_INFLUENCE_MAP.html'),`<!doctype html><meta charset="utf-8"><title>SOURCE INFLUENCE MAP</title><style>body{background:#0b161b;color:#ddd;font:16px sans-serif;padding:24px}main{display:grid;grid-template-columns:repeat(3,1fr)}img{width:100%}figure{margin:4px}section{margin-bottom:48px}p{max-width:1100px}</style><h1>SOURCE INFLUENCE MAP</h1><p>Controlled 192-letter fixture; seed 2041; identical descriptors, organic controls, extent and camera. Diagnostic only. No application changes. The cluster panel shows extracted regions; the generator has no semantic cluster assignment. Perturbation moves/rotates 12 interior letters; removal deletes them. VoidRemoval removes one detected void and incident relationships at the extraction boundary. No invented source-to-zone correspondence is drawn.</p>${cards.join('')}`);
}
