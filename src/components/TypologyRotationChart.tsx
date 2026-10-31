import { CATEGORY_DEFINITIONS, TYPOLOGY_RULES } from "./amphitheaterPrototype";
import { orientationFamily, orientationSteps, type OrientationFamily } from "./typologyOrientationRules";

type RotationGroup = {
  key: string;
  label: string;
  members: (typeof TYPOLOGY_RULES)[number]["id"][];
  xy: string;
  xz: string;
  yz: string;
};

const byId = new Map(TYPOLOGY_RULES.map((rule) => [rule.id, rule]));
const familyLabel: Record<OrientationFamily, string> = {
  rigid: "Rigid grid",
  continuous: "Continuous",
  flat: "Flat / horizontal",
  void: "Void",
  terrain: "Terrain / stepped",
};
const rotationGroups: RotationGroup[] = (Object.keys(familyLabel) as OrientationFamily[]).flatMap((family) => {
  const familyMembers = TYPOLOGY_RULES.filter((rule) => orientationFamily(rule.id) === family);
  if (!familyMembers.length) return [];
  if (family === "flat") {
    return [{ key: family, label: familyLabel[family], members: familyMembers.map((rule) => rule.id), xy: "90° steps", xz: "Level (0°)", yz: "90° steps" }];
  }
  if (family === "void") {
    const radial=familyMembers.filter(rule=>rule.id==='void-field-gathering');
    const others=familyMembers.filter(rule=>rule.id!=='void-field-gathering');
    return [
      ...(radial.length?[{key:'void-radial',label:'Radial atrium',members:radial.map(rule=>rule.id),xy:'Radial; 15° increments',xz:'0°',yz:'0° or ±90°'}]:[]),
      ...(others.length?[{key:'void',label:'Void',members:others.map(rule=>rule.id),xy:'15° steps',xz:'15° steps',yz:'15° steps'}]:[]),
    ];
  }
  if (family === "terrain") {
    const amphitheater = familyMembers.filter((rule) => rule.id === "stepped-amphitheater");
    const stepped = familyMembers.filter((rule) => rule.id === "cascaded-terraced-plates");
    const progressive = familyMembers.filter((rule) => rule.id !== "cascaded-terraced-plates" && rule.id !== "stepped-amphitheater");
    const groups: RotationGroup[] = [];
    if (amphitheater.length) groups.push({ key: "amphitheater", label: "Staggered amphitheater", members: amphitheater.map((rule) => rule.id), xy: "0°, 15°, 30°, 45°, 90° relative to axis", xz: "0°", yz: "0° or ±90°" });
    if (stepped.length) groups.push({ key: "terrain-stepped", label: familyLabel[family], members: stepped.map((rule) => rule.id), xy: "15° steps", xz: "15° steps", yz: "15° steps" });
    if (progressive.length) groups.push({ key: "terrain-progressive", label: "Terrain / progressive tilt", members: progressive.map((rule) => rule.id), xy: "15° steps; 90°–120° spiral", xz: "15° steps; tilt 0°–90°", yz: "15° steps; tilt 0°–90°" });
    return groups;
  }
  const steps = orientationSteps(family);
  return [{
    key: family,
    label: familyLabel[family],
    members: familyMembers.map((rule) => rule.id),
    xy: `${steps.xy}° steps`,
    xz: `${steps.vertical}° steps`,
    yz: `${steps.vertical}° steps`,
  }];
});

export function TypologyRotationChart() {
  const categories: Array<keyof typeof CATEGORY_DEFINITIONS> = ["lobby", "gathering", "office"];
  return (
    <section aria-labelledby="typology-rotation-chart-title" className="rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <h3 id="typology-rotation-chart-title" className="text-sm font-semibold" style={{ color: "#43A9CF" }}>Typologies by Letter Rotation</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Typologies are grouped by their rotation pattern, then listed by architectural category. Rotation values are increments unless labeled as a progressive tilt.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
          <thead>
            <tr className="border" style={{ borderColor: "var(--line)", color: "#ffffff" }}>
              <th scope="col" className="px-3 py-2">Rotation category</th>
              <th scope="col" className="px-3 py-2">XY</th>
              <th scope="col" className="px-3 py-2">XZ</th>
              <th scope="col" className="px-3 py-2">YZ</th>
              {categories.map((category) => <th key={category} scope="col" className="px-3 py-2">{CATEGORY_DEFINITIONS[category].name} typologies</th>)}
            </tr>
          </thead>
          <tbody>
            {rotationGroups.map((group) => (
              <tr key={group.key} className="border align-top" style={{ borderColor: "var(--line)" }}>
                <th scope="row" className="px-3 py-2 font-medium" style={{ color: "#71beda" }}>{group.label}</th>
                <td className="px-3 py-2">{group.xy}</td>
                <td className="px-3 py-2">{group.xz}</td>
                <td className="px-3 py-2">{group.yz}</td>
                {categories.map((category) => {
                  const names = group.members.map((id) => byId.get(id)).filter((rule) => rule?.category === category).map((rule) => rule!.name);
                  return <td key={category} className="px-3 py-2">{names.length ? names.join(", ") : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>For topographical and folded forms, faces progress from horizontal to vertical in 15° steps and the spiral spans 90°–120°.</p>
    </section>
  );
}


