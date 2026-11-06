import type { ConnectionWorkflow, WorkflowMesh } from './letterIntersectionSpaces';

export type ModuleRange = { bottom: number; top: number };
export const BASE_MODULE: ModuleRange = { bottom: 0, top: 1 };
export function moduleHeight(range: ModuleRange) { return (range.top-range.bottom)*20; }
export function moduleZ(z:number, centerZ:number, range:ModuleRange) {
  return centerZ-10+range.bottom*20+(z-(centerZ-10))*(range.top-range.bottom);
}
/** Stretch the completed meshes together, preserving contacts, cavities and topology.
 * The canonical workflow is retained for subsequent letter edits, avoiding TRS
 * decomposition (and shear loss) when tilted letters are stretched vertically. */
export function moduleMesh<T extends {positions:number[];indices:number[]}>(mesh:T, centerZ:number, range:ModuleRange):T {
  if(range.bottom===0&&range.top===1)return mesh;
  const positions=mesh.positions.map((v,i)=>i%3===2?moduleZ(v,centerZ,range):v);
  return {...mesh,positions};
}
export function moduleWorkflow(data:ConnectionWorkflow, centerZ:number, range:ModuleRange):ConnectionWorkflow {
  if(range.bottom===0&&range.top===1)return data;
  const factor=range.top-range.bottom;
  const convert=(mesh:WorkflowMesh):WorkflowMesh=>{
    const result=moduleMesh(mesh,centerZ,range);
    const normals=mesh.normals.map((v,i)=>i%3===2?v/factor:v);
    for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=n;normals[i+1]/=n;normals[i+2]/=n;}
    let area=0;
    for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(v=>v*3),p=result.positions;const u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}
    return {...result,normals,area,volume:mesh.volume*factor};
  };
  return {...data,source:convert(data.source),arrangedSource:data.arrangedSource&&convert(data.arrangedSource),enclosure:data.enclosure&&convert(data.enclosure),protectedVoid:data.protectedVoid&&convert(data.protectedVoid),intersections:convert(data.intersections),bridges:convert(data.bridges),floors:data.floors&&convert(data.floors),variants:{letters:convert(data.variants.letters),voids:convert(data.variants.voids),combined:convert(data.variants.combined)},links:data.links.map(link=>({...link,start:link.start.map((v,i)=>i===2?moduleZ(v,centerZ,range):v),end:link.end.map((v,i)=>i===2?moduleZ(v,centerZ,range):v)})),formation:data.formation&&{...data.formation,operations:[...data.formation.operations,`Module Modifier: 20 × 20 × ${moduleHeight(range)} ft enclosure. All geometry is stretched together along world Z; connectivity is retained. Earlier rule measurements describe the base module.`]},gatheringValidation:data.gatheringValidation?.map(check=>({...check,status:'unverified',detail:check.detail+' Module height changed; this rule has not been revalidated at the new height.'})),officeValidation:data.officeValidation?.map(check=>({...check,status:'unverified',detail:check.detail+' Module height changed; this rule has not been revalidated at the new height.'}))};
}
