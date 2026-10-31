"use client";

import { OrbitControls } from "@react-three/drei";
import { BoardOrthographicCamera as OrthographicCamera } from "./BoardOrthographicCamera";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import { letterDepthSpan, letterVolumeLayout, zLayerPitch, type VolumeOptions } from "./letterVolumeLayout";
import type { CompositionPlacement } from "./compositionEngine";
import type { VolumeBounds } from "./exportLetterVolume";

type Props = VolumeOptions & { compositionPlacements?: CompositionPlacement[] | null; compositionBounds?: VolumeBounds };
type PlaneState = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
type Segment2 = [THREE.Vector2, THREE.Vector2];

const INITIAL_PLANE: PlaneState = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const EPSILON = 0.0001;

type ResolvedPlacement = CompositionPlacement;

function resolvedLayout(options: Props) {
  const regular = letterVolumeLayout(options);
  const placements: ResolvedPlacement[] = options.compositionPlacements ?? regular.placements.map((placement, sourceIndex) => ({
    cell: placement.cell,
    sourceIndex,
    layerIndex: placement.layerIndex,
    x: placement.x,
    y: placement.y,
    z: placement.z,
    rx: 0,
    ry: placement.yRotation,
    rz: placement.cell.rotation,
    scale: regular.worldLetterSize,
  }));
  if (!options.compositionPlacements?.length) return { ...regular, placements };
  const extent = (axis: "x" | "y" | "z") => {
    const min = Math.min(...placements.map((placement) => placement[axis] - placement.scale * 0.55));
    const max = Math.max(...placements.map((placement) => placement[axis] + placement.scale * 0.55));
    return max - min;
  };
  return {
    ...regular,
    placements,
    width: options.compositionBounds?.width ?? extent("x"),
    height: options.compositionBounds?.height ?? extent("y"),
    depth: options.compositionBounds?.depth ?? extent("z"),
  };
}

function placementMatrix(placement: ResolvedPlacement) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(placement.x, placement.y, placement.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(placement.rx),
      THREE.MathUtils.degToRad(placement.ry),
      THREE.MathUtils.degToRad(placement.rz),
      "XYZ",
    )),
    new THREE.Vector3(
      placement.scale * (placement.scaleX ?? 1),
      placement.scale * (placement.scaleY ?? 1),
      placement.scale * (placement.scaleZ ?? 1),
    ),
  );
}

function planeFromState(state: PlaneState) {
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(state.rx),
    THREE.MathUtils.degToRad(state.ry),
    THREE.MathUtils.degToRad(state.rz),
    "XYZ",
  );
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(rotation).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(state.x, state.y, state.z));
}

function intersectTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, plane: THREE.Plane) {
  const vertices = [a, b, c];
  const distances = vertices.map((point) => plane.distanceToPoint(point));
  const hits: THREE.Vector3[] = [];
  for (let index = 0; index < 3; index++) {
    const p1 = vertices[index];
    const p2 = vertices[(index + 1) % 3];
    const d1 = distances[index];
    const d2 = distances[(index + 1) % 3];
    if (Math.abs(d1) < EPSILON) hits.push(p1.clone());
    if (d1 * d2 < -EPSILON * EPSILON) hits.push(p1.clone().lerp(p2, d1 / (d1 - d2)));
  }
  const unique = hits.filter((point, index) => hits.findIndex((other) => other.distanceToSquared(point) < EPSILON * EPSILON) === index);
  if (unique.length < 2) return null;
  let pair: [THREE.Vector3, THREE.Vector3] = [unique[0], unique[1]];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      if (unique[i].distanceToSquared(unique[j]) > pair[0].distanceToSquared(pair[1])) pair = [unique[i], unique[j]];
    }
  }
  return pair;
}

function closedLoops(segments: Segment2[]) {
  const key = (point: THREE.Vector2) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
  const at = new Map<string, number[]>();
  segments.forEach((segment, index) => segment.forEach((point) => at.set(key(point), [...(at.get(key(point)) ?? []), index])));
  const used = new Set<number>();
  const loops: THREE.Vector2[][] = [];
  for (let startIndex = 0; startIndex < segments.length; startIndex++) {
    if (used.has(startIndex)) continue;
    used.add(startIndex);
    const path = [segments[startIndex][0].clone(), segments[startIndex][1].clone()];
    while (path.length < segments.length + 2) {
      const current = path[path.length - 1];
      if (key(current) === key(path[0])) break;
      const nextIndex = (at.get(key(current)) ?? []).find((index) => !used.has(index));
      if (nextIndex === undefined) break;
      used.add(nextIndex);
      const next = segments[nextIndex];
      path.push((key(next[0]) === key(current) ? next[1] : next[0]).clone());
    }
    if (path.length >= 4 && key(path[0]) === key(path[path.length - 1])) loops.push(path.slice(0, -1));
  }
  return loops;
}

function sectionGeometry(options: Props, plane: THREE.Plane) {
  const { placements } = resolvedLayout(options);
  const normal = plane.normal;
  const reference = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const axisU = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize();
  const lineValues: number[] = [];
  const shapes: THREE.Shape[] = [];
  const bounds = new THREE.Box2();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (const placement of placements) {
    const geometry = getLetterVolumeGeometry(placement.cell.letter, options.thickness);
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const matrix = placementMatrix(placement);
    const segments: Segment2[] = [];
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix);
      const hit = intersectTriangle(a, b, c, plane);
      if (!hit) continue;
      const p1 = new THREE.Vector2(hit[0].dot(axisU), hit[0].dot(axisV));
      const p2 = new THREE.Vector2(hit[1].dot(axisU), hit[1].dot(axisV));
      if (p1.distanceToSquared(p2) < EPSILON * EPSILON) continue;
      segments.push([p1, p2]);
      bounds.expandByPoint(p1).expandByPoint(p2);
      lineValues.push(p1.x, p1.y, 0.012, p2.x, p2.y, 0.012);
    }
    for (const loop of closedLoops(segments)) {
      const shape = new THREE.Shape();
      shape.moveTo(loop[0].x, loop[0].y);
      loop.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
      shape.closePath();
      shapes.push(shape);
    }
  }

  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.Float32BufferAttribute(lineValues, 3));
  const fill = shapes.length ? new THREE.ShapeGeometry(shapes) : new THREE.BufferGeometry();
  const center = bounds.isEmpty() ? new THREE.Vector2() : bounds.getCenter(new THREE.Vector2());
  const size = bounds.isEmpty() ? new THREE.Vector2(1, 1) : bounds.getSize(new THREE.Vector2());
  const scale = 6 / Math.max(size.x, size.y, 0.1);
  return { lines, fill, center, scale, segmentCount: lineValues.length / 6 };
}

function CutModel({ options, plane }: { options: Props; plane: THREE.Plane }) {
  const layout = useMemo(() => resolvedLayout(options), [options]);
  return <>
    {layout.placements.map((placement) => (
      <mesh
        key={`${placement.layerIndex}-${placement.cell.id}`}
        geometry={getLetterVolumeGeometry(placement.cell.letter, options.thickness)}
        matrixAutoUpdate={false}
        matrix={placementMatrix(placement)}
      >
        <meshStandardMaterial color="#b8dce6" roughness={0.65} side={THREE.DoubleSide} clippingPlanes={[plane]} clipShadows />
      </mesh>
    ))}
    <primitive object={new THREE.PlaneHelper(plane, Math.max(layout.width, layout.height, layout.depth) * 1.35, 0x45e1ef)} />
  </>;
}

function SourceViewport({ options, plane, resetKey }: { options: Props; plane: THREE.Plane; resetKey: number }) {
  const layout = resolvedLayout(options);
  const zoom = Math.min(90, 330 / Math.max(layout.width, layout.height, layout.depth, 1));
  return <Canvas gl={{ antialias: true, localClippingEnabled: true }}>
    <color attach="background" args={["#05080c"]} />
    <ambientLight intensity={0.7} />
    <directionalLight position={[5, 7, 8]} intensity={1.2} />
    <OrthographicCamera makeDefault position={[layout.width, layout.height * 0.8, layout.depth * 1.4 + 2]} zoom={zoom} near={0.01} far={300} />
    <CutModel options={options} plane={plane} />
    <OrbitControls key={resetKey} enablePan enableZoom enableRotate />
  </Canvas>;
}

function SectionViewport({ section, resetKey }: { section: ReturnType<typeof sectionGeometry>; resetKey: number }) {
  return <Canvas>
    <color attach="background" args={["#071016"]} />
    <ambientLight intensity={1} />
    <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={62} near={0.01} far={100} />
    <group scale={section.scale} position={[-section.center.x * section.scale, -section.center.y * section.scale, 0]}>
      <mesh geometry={section.fill}>
        <meshBasicMaterial color="#ff765f" transparent opacity={0.72} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={section.lines}>
        <lineBasicMaterial color="#dffaff" />
      </lineSegments>
    </group>
    <axesHelper args={[0.8]} />
    <OrbitControls key={resetKey} enablePan enableZoom enableRotate />
  </Canvas>;
}

function PlaneSlider({ label, value, min, max, step, onChange, suffix = "" }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void;
}) {
  return <label className="flex min-w-[150px] flex-1 items-center gap-1.5 text-[11px]">
    <span className="w-8" style={{ color: "var(--muted)" }}>{label}</span>
    <input className="min-w-0 flex-1 accent-[var(--accent)]" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <span className="w-12 text-right tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}{suffix}</span>
  </label>;
}

export default function SectionPlaneStudio(options: Props) {
  const defaultPlane = useMemo(() => ({
    ...INITIAL_PLANE,
    z: -(options.layerCells.length / 2) * zLayerPitch(options.zSpacing, letterDepthSpan(Math.max(options.letterSize / 50, 0.1), options.thickness, false)),
  }), [options.layerCells.length, options.letterSize, options.thickness, options.zSpacing]);
  const [planeState, setPlaneState] = useState<PlaneState>(() => defaultPlane);
  const [sourceReset, setSourceReset] = useState(0);
  const [sectionReset, setSectionReset] = useState(0);
  const layout = useMemo(() => resolvedLayout(options), [options]);
  const plane = useMemo(() => planeFromState(planeState), [planeState]);
  const section = useMemo(() => sectionGeometry(options, plane), [options, plane]);
  useEffect(() => () => {
    section.lines.dispose();
    section.fill.dispose();
  }, [section]);
  const set = (key: keyof PlaneState, value: number) => setPlaneState((current) => ({ ...current, [key]: value }));
  const limits = { x: layout.width / 2, y: layout.height / 2, z: layout.depth / 2 };

  return <section className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">Live Section Cut</h2>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>The model remains unchanged. Coral shows cut surfaces; white lines show section boundaries.</p>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={() => setPlaneState(defaultPlane)} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "var(--line)" }}>Reset plane</button>
        <button type="button" onClick={() => { setSourceReset((v) => v + 1); setSectionReset((v) => v + 1); }} className="rounded border px-2 py-1 text-[11px]" style={{ borderColor: "var(--line)" }}>Reset cameras</button>
      </div>
    </div>
    <div className="mb-3 grid gap-2 border-y py-2 md:grid-cols-3" style={{ borderColor: "var(--line)" }}>
      <div className="space-y-1">
        <PlaneSlider label="X" suffix=" ft" value={planeState.x} min={-limits.x} max={limits.x} step={0.02} onChange={(v) => set("x", v)} />
        <PlaneSlider label="Y" suffix=" ft" value={planeState.y} min={-limits.y} max={limits.y} step={0.02} onChange={(v) => set("y", v)} />
        <PlaneSlider label="Z" suffix=" ft" value={planeState.z} min={-limits.z} max={limits.z} step={0.02} onChange={(v) => set("z", v)} />
      </div>
      <div className="space-y-1 md:col-span-2 md:grid md:grid-cols-3 md:gap-2 md:space-y-0">
        <PlaneSlider label="Rot X" value={planeState.rx} min={-180} max={180} step={1} suffix="°" onChange={(v) => set("rx", v)} />
        <PlaneSlider label="Rot Y" value={planeState.ry} min={-180} max={180} step={1} suffix="°" onChange={(v) => set("ry", v)} />
        <PlaneSlider label="Rot Z" value={planeState.rz} min={-180} max={180} step={1} suffix="°" onChange={(v) => set("rz", v)} />
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--muted)" }}><span>3D model + cutting plane</span><span>orbit · zoom · pan</span></div>
        <div className="h-[360px]"><SourceViewport options={options} plane={plane} resetKey={sourceReset} /></div>
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--muted)" }}><span>Centered section · {section.segmentCount} boundary segments</span><span>independent orbit · zoom · pan</span></div>
        <div className="h-[360px]"><SectionViewport section={section} resetKey={sectionReset} /></div>
      </div>
    </div>
  </section>;
}
