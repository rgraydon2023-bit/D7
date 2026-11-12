import type { Manifold } from 'manifold-3d/manifold';
import type { IntersectionPlacement } from './architecturalConnections';
import type { arrangeOfficeLetters } from './officeWorkspaceRules';
import { letterOverlapFractions } from './letterOverlapRule';

type Initial = ReturnType<typeof arrangeOfficeLetters>;
export function arrangeOpenHallLs(source: IntersectionPlacement[], initial: Initial, makeSolid: (p: IntersectionPlacement) => Manifold) {
  const ids = source.map((p, i) => p.letter === 'L' ? i : -1).filter(i => i >= 0);
  if (!ids.length) throw new Error('Open Hall uses L letters only. Choose a selection containing at least one L.');
  const n = ids.length, scale = ids.reduce((sum, i) => sum + initial.placements[i].scale / n, 0);
  const center = ids.reduce((sum, i) => ({x:sum.x+source[i].x/n,y:sum.y+source[i].y/n,z:sum.z+source[i].z/n}), {x:0,y:0,z:0});
  const pairCount = Math.ceil(n / 2);
  const pairSpacing = 2.1 * scale * Math.max(...ids.map(id => Math.hypot(.43 * source[id].scaleX, .46 * source[id].scaleY)));
  const placements = ids.map((id, i) => {
    const original = source[id], level = i % 2, rz = 0;
    const pair = Math.floor(i / 2), quadrant = pair % 4, row = Math.floor(pair / 4);
    const signX = quadrant===0||quadrant===3?1:-1, signY = quadrant<2?1:-1;
    const pairIds=ids.slice(pair*2,pair*2+2);
    const halfX=scale*Math.max(...pairIds.map(id=>.43*source[id].scaleX));
    const halfY=scale*Math.max(...pairIds.map(id=>.46*source[id].scaleY));
    const x = center.x + signX * (halfX + row*pairSpacing), y = center.y + signY*halfY;
    const z = center.z + (level ? scale : -scale);
    return {...original, x, y, z, scale, rx:signY<0?180:0, ry:signX<0?180:0, rz,
      letterRules:{yaw:rz,level,supportZ:z,strokeWidth:scale*.14,footTilt:0,armRoll:0,deviations:[],architectural:false,mirrored:false,enclosed:false}};
  });
  const solids = placements.map(makeSolid), officePlan = initial.officePlan!;
  officePlan.letterSources = ids;
  return {...initial, placements, sequence:placements.map((_,i)=>i), officePlan, supported:true,
    overlapFractions:letterOverlapFractions(solids), riseFractions:[] as number[], operations:[
      `Open Hall places ${n} selected L letters once each on alternating horizontal elevations; ${source.length-n} U/V letters are excluded.`,
      'Pairs share a Z-axis and are distributed evenly among four XY quadrants about the source center. L edges border the quadrant divider lines. Extra pairs continue along a divider; quadrant pair counts differ by at most one.',
      'Duplicate + mirror reflects copies across the chosen quadrant divider. Copies retain their elevation and cross into the opposite quadrant. Column bridges connect the two elevations.'
    ]};
}
