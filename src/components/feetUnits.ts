/** Physical scale for Slide, Crops, Shapes, Voids and Composition. */
export const FEET_PER_MODEL_UNIT = 1;
export function feet(value:number) { return `${Number(value.toFixed(3))} ft`; }
export function lengthControlScale(label:string):number|undefined {
 if(['XY gap','Z gap','45° gap'].includes(label))return 1/50;
 if(label==='Letter size')return .92/50;
 if(['Min letter size','Max letter size'].includes(label))return .92;
 if(/^(Cell|Overall|Selection|Search step) [XYZ]$/.test(label)||label==='Clearance')return 1;
 return undefined;
}
