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

const familyLabel: Record<OrientationFamily, string> = {
  rigid: "Rigid grid",
  continuous: "Continuous",
  flat: "Flat / horizontal",
  void: "Void",
  terrain: "Terrain / stepped",
};
const rotationGroups: RotationGroup[] = (Object.keys(familyLabel) as OrientationFamily[]).flatMap((family) => {
  const familyMembers = TYPOLOGY_RULES.filter((rule) => orientationFamily(rule.id) === family && rule.id !== "open-hall-workspace" && rule.id !== "linear-gallery-lobby");
  if (!familyMembers.length) return [];
  if (family === "flat") {
    return [{ key: family, label: familyLabel[family], members: familyMembers.map((rule) => rule.id), xy: "90° steps", xz: "Level (0°)", yz: "90° steps" }];
  }
  if (family === "void") {
    const radial=familyMembers.filter(rule=>rule.id==='void-field-gathering');
    const others=familyMembers.filter(rule=>rule.id!=='void-field-gathering');
    return [
      ...(radial.length?[{key:'void-radial',label:'Radial atrium',members:radial.map(rule=>rule.id),xy:'Radial; 15° increments',xz:'0°',yz:'0° (horizontal layers)'}]:[]),
      ...(others.length?[{key:'void',label:'Void',members:others.map(rule=>rule.id),xy:'15° steps',xz:'15° steps',yz:'15° steps'}]:[]),
    ];
  }
  if (family === "terrain") {
    const amphitheater = familyMembers.filter((rule) => rule.id === "stepped-amphitheater");
    const stepped = familyMembers.filter((rule) => rule.id === "cascaded-terraced-plates");
    const topographic = familyMembers.filter((rule) => rule.id === "topographic-ground-field-lobby");
    const progressive = familyMembers.filter((rule) => rule.id !== "cascaded-terraced-plates" && rule.id !== "stepped-amphitheater" && rule.id !== "topographic-ground-field-lobby");
    const groups: RotationGroup[] = [];
    if (amphitheater.length) groups.push({ key: "amphitheater", label: "Staggered amphitheater", members: amphitheater.map((rule) => rule.id), xy: "0°, 15°, 30°, 45°, 90° relative to axis", xz: "0°", yz: "0° or ±90°" });
    if (stepped.length) groups.push({ key: "terrain-stepped", label: familyLabel[family], members: stepped.map((rule) => rule.id), xy: "15° steps", xz: "15° steps", yz: "15° steps" });
    if (topographic.length) groups.push({ key: "terrain-topographic", label: "Topographic L → U → V spiral", members: topographic.map((rule) => rule.id), xy: "15° steps; 90° spiral around Z", xz: "L 0°–45° · U 45°–90° · V 90°–120°", yz: "L 0°–45° · U 45°–90° · V 90°–120°" });
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
}).concat([{key:"linear-gallery",label:"Linear gallery",members:["linear-gallery-lobby"],xy:"90° steps",xz:"90° steps",yz:"90° steps"},{key:"open-hall-l",label:"L wall and floor pairs",members:["open-hall-workspace"],xy:"Mirrored L pair + 90°",xz:"90° to place walls on YZ",yz:"Mirrored L pair + 90°"}] as RotationGroup[]);

export function TypologyRotationChart() {
  const categories: Array<keyof typeof CATEGORY_DEFINITIONS> = ["lobby", "gathering", "office"];
  return (
    <section aria-labelledby="typology-rotation-chart-title" className="rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
      <h3 id="typology-rotation-chart-title" className="text-sm font-semibold" style={{ color: "#43A9CF" }}>Typologies by Letter Rotation</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Each typology has its own row. Rotation values are increments unless labeled as a progressive tilt.</p>
      <div className="mt-2 space-y-4">
        {categories.map((category) => (
          <section key={category} aria-label={CATEGORY_DEFINITIONS[category].name + " typologies"}>
            <h4 className="mb-1 text-xs font-semibold" style={{ color: "#d8b96b" }}>{CATEGORY_DEFINITIONS[category].name}</h4>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead><tr className="border" style={{ borderColor: "var(--line)", color: "#ffffff" }}><th scope="col" className="px-3 py-2">Typology</th><th scope="col" className="px-3 py-2">XY</th><th scope="col" className="px-3 py-2">XZ</th><th scope="col" className="px-3 py-2">YZ</th></tr></thead>
              <tbody>{TYPOLOGY_RULES.filter(rule => rule.category === category).map(rule => {
                const group = rotationGroups.find(item => item.members.includes(rule.id));
                return <tr key={rule.id} className="border align-top" style={{ borderColor: "var(--line)" }}><th scope="row" className="px-3 py-2 font-medium" style={{ color: "#71beda" }}>{rule.name}</th><td className="px-3 py-2">{group?.xy ?? "—"}</td><td className="px-3 py-2">{group?.xz ?? "—"}</td><td className="px-3 py-2">{group?.yz ?? "—"}</td></tr>;
              })}</tbody>
            </table></div>
          </section>
        ))}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>Topographic Ground-Field uses letter-specific 15° tilt bands around the center Z-axis: L 0°–45°, U 45°–90°, and V 90°–120°. Folded forms retain their existing 0°–90° progression.</p>
    </section>
  );
}


