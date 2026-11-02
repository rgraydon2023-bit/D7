import { DEFAULT_FACE_BRIDGES } from "../src/components/faceBridges";
import { buildConnectionWorkflow } from "../src/components/letterIntersectionSpaces";
import { OFFICE_TYPOLOGIES } from "../src/components/officeWorkspaceRules";
import type { IntersectionPlacement } from "../src/components/architecturalConnections";

const only = process.argv[2];
const letter = (value: IntersectionPlacement["letter"], x: number, y: number): IntersectionPlacement => ({
  letter: value, x, y, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, scaleX: 1, scaleY: 1, scaleZ: 1,
});

function selection(typology: string): IntersectionPlacement[] {
  if (typology === "void-edge-workspace") return [letter("U", 0, 0), letter("U", 3, 1), letter("U", -2, 2)];
  return [letter("L", 0, 0), letter("V", 3, 1), letter("L", -2, 2)];
}

async function main() {
let failed = 0;
for (const typology of OFFICE_TYPOLOGIES) {
  if (only && typology !== only) continue;
  const started = Date.now();
  try {
    const workflow = await buildConnectionWorkflow(selection(typology), 12, { ...DEFAULT_FACE_BRIDGES }, typology);
    const checks = workflow.officeValidation ?? [];
    const unverified = checks.filter((item) => item.status !== "pass");
    const components = workflow.variants.letters.components;
    const ok = unverified.length === 0 && components === 1 && workflow.variants.letters.volume > 0;
    if (!ok) failed++;
    console.log(`\n${typology} ${ok ? "PASS" : "FAIL"} ${((Date.now() - started) / 1000).toFixed(1)}s  components=${components} volume=${workflow.variants.letters.volume.toFixed(1)} bridges=${workflow.links.length}`);
    for (const item of unverified) console.log(`  [unverified] ${item.label}: ${item.detail}`);
    if (components !== 1) console.log(`  result is ${components} components`);
  } catch (error) {
    failed++;
    console.log(`\n${typology} ERROR ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}
process.exit(failed ? 1 : 0);
}
void main();
