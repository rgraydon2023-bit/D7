import type { ConnectionWorkflow, WorkflowMesh } from './letterIntersectionSpaces';

export type ModuleRange = { bottom: number; top: number; x: number; y: number };
export const BASE_MODULE: ModuleRange = { bottom: 0, top: 1, x: 1, y: 1 };
export function moduleOffset(count:number) { return count === 2 ? 10 : 0; }
export function moduleCoordinate(value:number, center:readonly number[], axis:number, range:ModuleRange) {
  if (axis === 2) return moduleZ(value, center[2], range);
  const count = axis === 0 ? range.x : range.y;
  return center[axis] + (value - center[axis]) * count + moduleOffset(count);
}
export function moduleHeight(range: ModuleRange) { return (range.top-range.bottom)*20; }
export function moduleZ(z:number, centerZ:number, range:ModuleRange) {
  return centerZ-10+range.bottom*20+(z-(centerZ-10))*(range.top-range.bottom);
}
/** Stretch the completed meshes together, preserving contacts, cavities and topology.
 * The canonical workflow is retained for subsequent letter edits, avoiding TRS
 * decomposition (and shear loss) when tilted letters are stretched vertically. */
export function moduleMesh<T extends {positions:number[];indices:number[]}>(mesh:T, center:readonly number[], range:ModuleRange):T {
  if(range.bottom===0&&range.top===1&&range.x===1&&range.y===1)return mesh;
  const positions=mesh.positions.map((v,i)=>moduleCoordinate(v,center,i%3,range));
  return {...mesh,positions};
}
export function moduleWorkflow(data:ConnectionWorkflow, center:readonly number[], range:ModuleRange):ConnectionWorkflow {
  if(range.bottom===0&&range.top===1)return data;
  const factor=range.top-range.bottom, factors=[range.x,range.y,factor];
  const convert=(mesh:WorkflowMesh):WorkflowMesh=>{
    const result=moduleMesh(mesh,center,range);
    const normals=mesh.normals.map((v,i)=>v/factors[i%3]);
    for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=n;normals[i+1]/=n;normals[i+2]/=n;}
    let area=0;
    for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(v=>v*3),p=result.positions;const u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}
    return {...result,normals,area,volume:mesh.volume*factor*range.x*range.y};
  };
  return {...data,source:convert(data.source),arrangedSource:data.arrangedSource&&convert(data.arrangedSource),enclosure:data.enclosure&&convert(data.enclosure),protectedVoid:data.protectedVoid&&convert(data.protectedVoid),intersections:convert(data.intersections),bridges:convert(data.bridges),floors:data.floors&&convert(data.floors),variants:{letters:convert(data.variants.letters),voids:convert(data.variants.voids),combined:convert(data.variants.combined)},links:data.links.map(link=>({...link,start:link.start.map((v,i)=>moduleCoordinate(v,center,i,range)),end:link.end.map((v,i)=>moduleCoordinate(v,center,i,range))})),formation:data.formation&&{...data.formation,operations:[...data.formation.operations,`Module Modifier: ${range.x*20} × ${range.y*20} × ${moduleHeight(range)} ft enclosure. All geometry is stretched together along the selected axes; connectivity is retained. Earlier rule measurements describe the base module.`]},gatheringValidation:data.gatheringValidation?.map(check=>({...check,status:'unverified',detail:check.detail+' Module dimensions changed; this rule has not been revalidated at the new dimensions.'})),officeValidation:data.officeValidation?.map(check=>({...check,status:'unverified',detail:check.detail+' Module dimensions changed; this rule has not been revalidated at the new dimensions.'}))};
}
