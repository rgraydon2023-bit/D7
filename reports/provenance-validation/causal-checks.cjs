const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),e=require(path.join(root,'.typology-matrix-build/src/components/amphitheaterPrototype.js')),f=require('../full-domain-validation/fixture.json');
const analysis=e.analyzeSourceGeometry(f.source,true),rows=[];
const identity=p=>`${p.cell.id}@${p.sourceIndex??'member'}:${p.layerIndex??0}`;
const geometry=elements=>elements.map(({id,provenance,...g})=>JSON.stringify(g)).sort().join('|');
for(const typology of ['contained-room-within-volume','flat-deep-plan-plate','vertical-void-lobby'])for(const mode of ['letters','voids','combined']){
 const generate=(source,a)=>e.generateProtoArchitecture({...f,source,sourceAnalysis:a,typology,mode,quality:'preview'}),base=generate(f.source,analysis);
 const targets=r=>r.disconnectedElements.filter(x=>typology==='contained-room-within-volume'?x.id.endsWith('-contained-room'):typology==='flat-deep-plan-plate'?x.id.includes('-courtyard-'):x.id.includes('primary-space-arrival')||x.id.includes('void-overlook'));
 const target=targets(base)[0],members=target.provenance.sourceLetterIds;let ids=target.provenance.sourceVoidIds;
 if(typology==='vertical-void-lobby'){const all=[...new Set(base.connectorElements.flatMap(x=>x.provenance?.sourceVoidIds||[]))];const chain=analysis.voids.filter(v=>all.includes(v.id)).sort((a,b)=>a.z-b.z);ids=[chain[Math.floor(chain.length/2)].id];}
 const row={typology,mode,tests:{}};
 for(const remove of [false,true]){
  let source=f.source,a=structuredClone(analysis);
  if(typology==='contained-room-within-volume'&&mode!=='voids'){source=remove?source.filter(p=>!members.includes(identity(p))):source.map(p=>members.includes(identity(p))?{...p,x:p.x+.45,y:p.y+.2,z:p.z+.15,rz:p.rz+20}:p);a=e.analyzeSourceGeometry(source,true);}
  else{a.voids=a.voids.filter(v=>!remove||!ids.includes(v.id)).map(v=>ids.includes(v.id)?{...v,center:[v.center[0]+.65,v.center[1]+.2],points:v.points.map(p=>[p[0]+.65,p[1]+.2]),z:v.z+.2,zMin:v.zMin+.2,zMax:v.zMax+.2}:v);const byId=new Map([...a.letters,...a.voids].map(v=>[v.id,v]));a.relationships=a.relationships.filter(x=>byId.has(x.fromId)&&byId.has(x.toId)).map(x=>({...x,from:byId.get(x.fromId).center,to:byId.get(x.toId).center,fromZ:byId.get(x.fromId).z,toZ:byId.get(x.toId).z}));}
  const result=generate(source,a),changed=geometry(targets(base))!==geometry(targets(result));assert(changed,typology+' '+mode+' actual target geometry unchanged');
  row.tests[remove?'assignedRemoval':'assignedMove']={actualTargetGeometryChanged:changed,identityAndProvenanceExcluded:true,unsupported:result.elements.length===0,baselineElements:targets(base).length,afterElements:targets(result).length};
 }
 rows.push(row);
}
fs.writeFileSync(path.join(__dirname,'causal-checks.json'),JSON.stringify(rows,null,2));console.log('All 18 target-geometry checks passed with IDs and provenance excluded.');
