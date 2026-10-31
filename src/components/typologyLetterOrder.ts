import type { Letter } from "./letterTypes";

/** Shape roles for the letter inventory; stable within each letter group. */
export const LETTER_ROLES:Record<Letter,string>={
 L:"90-degree angles for linear and flat spaces",
 U:"Curvilinear bands for rings and concentric spaces",
 V:"45-degree wedges for narrow, low and compressed spaces",
};
const priorities:Record<string,Letter[]>={
 "stepped-amphitheater":["U","V","L"],
 "void-field-gathering":["U","L","V"],
 "inserted-horizontal-plate":["L","V","U"],
 "contained-room-within-volume":["L","V","U"],
 "linear-edge-gallery":["L","V","U"],
 "open-hall-workspace":["U","V","L"],
 "cascaded-terraced-plates":["U","V","L"],
 "flat-deep-plan-plate":["L","V","U"],
 "void-edge-workspace":["U","L","V"],
 "folded-undulating-work-surface":["U","V","L"],
 "vertical-void-lobby":["U","L","V"],
 "compressed-sequential-lobby":["L","V","U"],
 "continuous-hall-lobby":["U","V","L"],
 "topographic-ground-field-lobby":["U","V","L"],
 "linear-gallery-lobby":["L","V","U"],
};
export function typologyLetterPriority(typology:string):readonly Letter[]{return priorities[typology]??["U","L","V"];}
export function orderTypologyLetters<T extends {cell:{letter:Letter}}>(source:readonly T[],typology:string):T[]{
 const order=typologyLetterPriority(typology);
 return source.map((placement,index)=>({placement,index})).sort((a,b)=>order.indexOf(a.placement.cell.letter)-order.indexOf(b.placement.cell.letter)||a.index-b.index).map(item=>item.placement);
}
