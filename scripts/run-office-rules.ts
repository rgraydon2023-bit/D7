import { OFFICE_TYPOLOGIES, planOfficeWorkspace, officePlanReady } from "../src/components/officeWorkspaceRules";

const center: [number, number, number] = [0, 0, 0];
const only = process.argv[2];
let failed = 0;
for (const typology of OFFICE_TYPOLOGIES) {
  if (only && typology !== only) continue;
  const plan = planOfficeWorkspace(typology, 0, center);
  const ready = officePlanReady(plan);
  if (!ready) failed++;
  console.log(`\n${typology} ${ready ? "PASS" : "FAIL"}`);
  for (const item of plan.checks) console.log(`  [${item.status}] ${item.label}: ${item.detail}`);
}
process.exit(failed ? 1 : 0);
