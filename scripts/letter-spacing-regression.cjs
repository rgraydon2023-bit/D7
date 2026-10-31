const fs = require('fs');
const assert = require('assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { letterCenterPitch, letterVolumeLayout, letterPlanLayout, letterDepthSpan } = require('../src/components/letterVolumeLayout.ts');
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
// Check continuity, cap, monotonicity, and inputs below the control minimum.
for (const [span, min] of [[64, 8], [1.1776, .16], [.6656, .4]]) {
  close(letterCenterPitch(span * 2, span, min), span * 2);
  close(letterCenterPitch(span, span, min), span);
  close(letterCenterPitch(min, span, min), span * .42);
  close(letterCenterPitch(-10, span, min), span * .42);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const pitch = letterCenterPitch(min + (span * 2 - min) * i / 100, span, min);
    assert(pitch >= previous && pitch > 0);
    previous = pitch;
  }
}
// A thin letter stays separated if the smallest allowed gap exceeds its depth.
close(letterCenterPitch(.4, .1, .4), .4);
const cells = Array.from({ length: 4 }, (_, i) => ({ id: `cell-${i}`, letter: 'V', rotation: i * 15 }));
const base = { cells, layerCells: [cells.map(c => ({ ...c, id: `${c.id}-layer` }))], cols: 2, rows: 2, letterSize: 64, thickness: 50, yRotationRange: 90 };
for (const yRotationEnabled of [false, true]) {
  const size = 64 / 50, span = size * .92;
  const depth = letterDepthSpan(size, 50, yRotationEnabled);
  for (const mode of ['wide', 'touch', 'minimum']) {
    const xy = mode === 'wide' ? 120 : mode === 'touch' ? span * 50 : 8;
    const z = mode === 'wide' ? 120 : mode === 'touch' ? depth * 50 : 20;
    const result = letterVolumeLayout({ ...base, spacing: xy, zSpacing: z, yRotationEnabled });
    const pitch = mode === 'wide' ? 2.4 : mode === 'touch' ? span : span * .42;
    const zPitch = mode === 'wide' ? 2.4 : mode === 'touch' ? depth : depth * .42;
    const [a, b, c, , layer] = result.placements;
    close(b.x - a.x, pitch);
    close(a.y - c.y, pitch); // Rows descend; columns and layers ascend.
    close(layer.z - a.z, zPitch);
    close(a.x + b.x, 0);
    close(a.z + layer.z, 0);
    close(result.worldLetterSize, size);
    assert.equal(result.placements.length, 8);
    assert.equal(new Set(result.placements.map(p => p.cell.id)).size, 8);
    assert.strictEqual(a.cell, cells[0]);
  }
}
for (const gap of [120, 64, 8]) {
  const layout = letterPlanLayout(3, 2, gap, 64);
  close(layout.pitch, gap === 120 ? 120 : gap === 64 ? 64 : 64 * .42);
  close(layout.width, 2 * layout.pitch + 64);
  close(layout.height, layout.pitch + 64);
}
// Confirm the spacing span matches actual extruded geometry including bevels.
const { getLetterVolumeGeometry } = require('../src/components/letterGeometry3d.ts');
for (const thickness of [4, 25, 50]) {
  const geometry = getLetterVolumeGeometry('V', thickness);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  assert(Math.abs(box.max.z - box.min.z - letterDepthSpan(1, thickness, false)) < 1e-6);
}
console.log('PASS: wide/touch/minimum, 58% overlap cap, X/Y/Z signs, rotation depth, geometry depth, 2D bounds, stable size and identities');
