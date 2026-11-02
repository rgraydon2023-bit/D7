import type { Letter } from './letterTypes';
export type BoundaryRole='floor'|'wall'|'edge'|'enclosure'|'void';
export type GatheringBoundaryRoles=Record<Letter,BoundaryRole>;
export function defaultGatheringBoundaryRoles(typology:string):GatheringBoundaryRoles {
 switch(typology){
  case 'void-field-gathering':return {U:'enclosure',L:'floor',V:'edge'};
  case 'inserted-horizontal-plate':return {U:'edge',L:'floor',V:'wall'};
  case 'contained-room-within-volume':return {U:'enclosure',L:'wall',V:'edge'};
  case 'linear-edge-gallery':return {U:'edge',L:'floor',V:'wall'};
  default:return {U:'enclosure',L:'edge',V:'wall'};
 }
}
/** User-adjustable architectural operations, in feet and degrees. */
export type GatheringOperations = {
 levelRise:number; staggerPercent:number; staggerDirection:number; boundaryRotation:number;
 alcoveDepthPercent:number; alcoveWidthPercent:number; protectedVoidRadius:number; protectedVoidOffsetX:number; protectedVoidOffsetY:number;
 minimumClearance:number; requireConnectivity:boolean; boundaryRoles:GatheringBoundaryRoles;
};
export const DEFAULT_GATHERING_OPERATIONS:GatheringOperations={levelRise:0,staggerPercent:25,staggerDirection:90,boundaryRotation:0,alcoveDepthPercent:25,alcoveWidthPercent:30,protectedVoidRadius:0,protectedVoidOffsetX:0,protectedVoidOffsetY:0,minimumClearance:0,requireConnectivity:true,boundaryRoles:defaultGatheringBoundaryRoles('stepped-amphitheater')};
export const CANYON_TYPOLOGIES=new Set(['stepped-amphitheater','void-field-gathering','linear-edge-gallery']);
export const GATHERING_TYPOLOGIES=new Set([...CANYON_TYPOLOGIES,'inserted-horizontal-plate','contained-room-within-volume']);
