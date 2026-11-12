const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const engine = require('../../.typology-matrix-build/src/components/amphitheaterPrototype.js');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../full-domain-validation/fixture.json'), 'utf8'));

const requestedMode = process.argv.find((argument) => ['letters', 'voids', 'combined'].includes(argument));
const modes = requestedMode ? [requestedMode] : ['letters', 'voids', 'combined'];
const geometric = (element) => ({ kind: element.kind, z: element.z, height: element.height, footprint: element.footprint, innerFootprint: element.innerFootprint, rise: element.rise });
const center = (element) => element.footprint?.length ? [element.footprint.reduce((sum,p)=>sum+p[0],0)/element.footprint.length,element.footprint.reduce((sum,p)=>sum+p[1],0)/element.footprint.length] : [element.x,element.y];
const geometryText = (variation) => JSON.stringify(variation.disconnectedElements.map(geometric));
const perturb = fixture.source.map((item, index) => index % 17 === 0
  ? { ...item, x: item.x + .31, y: item.y - .18, z: item.z + .23, rz: item.rz + 19 }
  : item);

const preview = Object.fromEntries(modes.map((mode) => [mode, engine.generateProtoArchitecture({ ...fixture, typology: 'flat-deep-plan-plate', category: 'office', mode, quality: 'preview' })]));
const changed = Object.fromEntries(modes.map((mode) => [mode, engine.generateProtoArchitecture({ ...fixture, source: perturb, typology: 'flat-deep-plan-plate', category: 'office', mode, quality: 'preview' })]));
for (const mode of modes) {
  assert(preview[mode].fullFormDiagnostic?.fullVolumetricSourceUsed, `${mode}: full volume flag`);
  assert(preview[mode].unifiedSourceElements?.length, `${mode}: unified source elements`);
  assert.notEqual(geometryText(preview[mode]), geometryText(changed[mode]), `${mode}: perturbation must change primary pre-SDF geometry`);
}

if (process.argv.includes('--preview-only')) {
  console.log(JSON.stringify(modes.map((mode) => ({ mode, diagnostic: preview[mode].fullFormDiagnostic, unifiedSourceElements: preview[mode].unifiedSourceElements.length, primaryElements: preview[mode].disconnectedElements.length, connectors: preview[mode].connectorElements.length,
    plates: preview[mode].disconnectedElements.filter(element=>element.kind==='platform'||element.kind==='stage').map(element=>({id:element.id,center:center(element),z:element.z,height:element.height})),
    routes: preview[mode].connectorElements.filter(element=>element.id.includes('domain-route')).map(element=>({id:element.id,from:element.slopeFrom,to:element.slopeTo,z:element.z,height:element.height,widthArea:element.footprint&&Math.abs(element.footprint.reduce((sum,p,i)=>sum+p[0]*element.footprint[(i+1)%element.footprint.length][1]-element.footprint[(i+1)%element.footprint.length][0]*p[1],0)/2)})) })), null, 2));
  process.exit(0);
}

const results = [];
(async () => {
  for (const mode of modes) {
    const variation = engine.generateProtoArchitecture({ ...fixture, typology: 'flat-deep-plan-plate', category: 'office', mode, quality: 'final' });
    const d = variation.fullFormDiagnostic;
    results.push({
      mode,
      sourceComponentsBeforeUnion: d.sourceComponentsBeforeUnion,
      sourceComponentsAfterUnion: d.sourceComponentsAfterUnion,
      disconnectedSourceGroups: d.disconnectedSourceGroups,
      sourceExtent: d.sourceExtent,
      architectureExtent: d.architectureExtent,
      volumetricRepresentation: d.volumetricRepresentation,
      relationshipGraphEdges: d.relationshipGraphEdges,
      architecturalConnectors: d.architecturalConnectors,
      finalMeshComponents: d.finalMeshComponents,
      componentBounds: variation.continuousMesh.componentBounds,
      continuousCirculation: d.continuousCirculation,
      fullVolumetricSourceUsed: d.fullVolumetricSourceUsed,
      graphUsedAsSecondaryOrganizer: d.graphUsedAsSecondaryOrganizer,
      unifiedSourceElements: variation.unifiedSourceElements.length,
      primaryElementsBeforeConnections: variation.disconnectedElements.length,
      perturbationChangedPrimaryGeometry: geometryText(preview[mode]) !== geometryText(changed[mode]),
      failures: variation.validation.failures,
      architecturalFailures: variation.architecturalValidation.failures,
    });
  }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ fixture: 'full-domain-validation/fixture.json', typology: 'O3 — Flat Deep-Plan Plate', results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
