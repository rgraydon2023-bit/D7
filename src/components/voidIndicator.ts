import * as THREE from "three";

type Mesh = { positions: number[]; indices: number[] };

/** Sweep the central opening up Z, stopping each radial edge at the first letter face. */
export function centralVoidProfile(letters: Mesh): Mesh {
 if (!letters.indices.length) return { positions: [], indices: [] };
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute("position", new THREE.Float32BufferAttribute(letters.positions, 3));
 geometry.setIndex(letters.indices);
 geometry.computeBoundingBox();
 const box = geometry.boundingBox;
 if (!box) { geometry.dispose(); return { positions: [], indices: [] }; }
 const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
 if (size.x <= 0 || size.y <= 0 || size.z <= 0) { geometry.dispose(); return { positions: [], indices: [] }; }
 const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
 const ray = new THREE.Raycaster();
 ray.far = Math.max(size.x, size.y) * 1.5;
 const angles = 48, levels = 13;
 const defaultRadius = Math.min(size.x, size.y) * 0.15;
 const radii: (number | null)[][] = [];
 for (let level = 0; level < levels; level++) {
  // Sample inside the end faces so horizontal rays can meet vertical letter walls.
  const z = box.min.z + size.z * (0.002 + 0.996 * level / (levels - 1));
  const ring: (number | null)[] = [];
  for (let angle = 0; angle < angles; angle++) {
   const theta = angle * Math.PI * 2 / angles;
   ray.set(new THREE.Vector3(center.x, center.y, z), new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
   const hit = ray.intersectObject(face, false)[0];
   ring.push(hit ? Math.max(0.001, hit.distance - size.length() * 0.0005) : null);
  }
  radii.push(ring);
 }
 face.material.dispose(); geometry.dispose();
 const positions: number[] = [], indices: number[] = [];
 for (let level = 0; level < levels; level++) for (let angle = 0; angle < angles; angle++) {
  const theta = angle * Math.PI * 2 / angles;
  let radius = radii[level][angle];
  if (radius === null) {
   // Open sides have no inner face; continue the nearest measured profile.
   for (let offset = 1; offset <= angles / 2; offset++) {
    radius = radii[level][(angle + offset) % angles] ?? radii[level][(angle - offset + angles) % angles];
    if (radius !== null) break;
   }
  }
  radius ??= defaultRadius;
  positions.push(center.x + radius * Math.cos(theta), center.y + radius * Math.sin(theta), box.min.z + size.z * level / (levels - 1));
 }
 for (let level = 0; level < levels - 1; level++) for (let angle = 0; angle < angles; angle++) {
  const next = (angle + 1) % angles, a = level * angles + angle, b = level * angles + next, c = (level + 1) * angles + angle, d = (level + 1) * angles + next;
  indices.push(a, b, c, b, d, c);
 }
 const bottom = positions.length / 3;
 positions.push(center.x, center.y, box.min.z);
 const top = positions.length / 3;
 positions.push(center.x, center.y, box.max.z);
 for (let angle = 0; angle < angles; angle++) {
  const next = (angle + 1) % angles;
  indices.push(bottom, next, angle);
  indices.push(top, (levels - 1) * angles + angle, (levels - 1) * angles + next);
 }
 return { positions, indices };
}
