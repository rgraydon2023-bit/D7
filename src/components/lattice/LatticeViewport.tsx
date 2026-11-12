"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CATEGORY_COLORS, slotById, typologyColor } from "./slots";
import type { GeneratedConnector } from "./connectionSynthesis";
import {
  buildCompleteFileGeometry,
  buildFileSpaceGeometries,
  IDENTITY_PLACEMENT,
  tileRootMatrix,
} from "./objFidelity";
import type { CameraMode, ColorMode, ConnectionReport, ContinuityOverlay, DiagnosticMode, ImportedObj, LatticeField, Placement, PortCandidate, PortPair, TileModel, UpAxisMode } from "./types";
import { LATTICE_FEET, placementWorldZ } from "./types";

export type LatticeViewportHandle = { capture: () => string };

type Props = {
  meshes: ImportedObj[];
  models: TileModel[];
  placements: Record<string, Placement>;
  unitScale: number;
  upAxisMode: UpAxisMode;
  field: LatticeField;
  colorMode: ColorMode;
  showLattice: boolean;
  showConnections: boolean;
  showConnectionPorts?: boolean;
  portPairs?: PortPair[];
  portCandidates?: PortCandidate[];
  showGeneratedConnectors?: boolean;
  showOriginalTiles?: boolean;
  connectors?: GeneratedConnector[];
  cameraMode: CameraMode;
  diagnostic: DiagnosticMode;
  continuityOverlay?: ContinuityOverlay;
  presentation: boolean;
  selectedId: string | null;
  connections: ConnectionReport[];
  onSelect: (id: string) => void;
  /** When set, shows RAW | REGISTERED | COPY+20'X side-by-side for one source mesh. */
  fidelityMesh?: ImportedObj | null;
};

function geometryKey(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function TileRoot({
  mesh,
  placement,
  unitScale,
  upAxisMode,
  color,
  selected,
  register,
  applyUnitAndUp,
  anchor,
  onSelect,
  geometries,
}: {
  mesh: ImportedObj;
  placement: Placement;
  unitScale: number;
  upAxisMode: UpAxisMode;
  color: string;
  selected: boolean;
  register: boolean;
  applyUnitAndUp: boolean;
  anchor?: [number, number, number];
  onSelect: (id: string) => void;
  geometries: Array<{ name: string; geometry: THREE.BufferGeometry }>;
}) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, placement, unitScale, upAxisMode, { register, applyUnitAndUp, anchor });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, placement, unitScale, upAxisMode, register, applyUnitAndUp, anchor]);

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(mesh.id);
      }}
    >
      {geometries.map(({ name, geometry }) => (
        <mesh key={`${mesh.id}:${name}`} geometry={geometry}>
          <meshStandardMaterial color={color} roughness={0.72} metalness={0.02} emissive={selected ? "#145c60" : "#000000"} />
        </mesh>
      ))}
    </group>
  );
}

/** Isolated fidelity instance: complete source OBJ under one root only. */
function FidelityInstance({
  mesh,
  placement,
  unitScale,
  upAxisMode,
  color,
  label,
  register,
  applyUnitAndUp,
  geometry,
  onSelect,
}: {
  mesh: ImportedObj;
  placement: Placement;
  unitScale: number;
  upAxisMode: UpAxisMode;
  color: string;
  label: string;
  register: boolean;
  applyUnitAndUp: boolean;
  geometry: THREE.BufferGeometry;
  onSelect: (id: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, placement, unitScale, upAxisMode, { register, applyUnitAndUp });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, placement, unitScale, upAxisMode, register, applyUnitAndUp]);

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(mesh.id);
      }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
      </mesh>
      {/* Label marker — diagnostic only, not geometry */}
      <mesh position={[0, 2, 0]} visible={false} userData={{ fidelityLabel: label }} />
    </group>
  );
}

function Scene({
  meshes, models, placements, unitScale, upAxisMode, field, colorMode, showLattice, showConnections,
  showGeneratedConnectors = true, showOriginalTiles = true, showConnectionPorts = false, portPairs, portCandidates, connectors = [], cameraMode, diagnostic,
  continuityOverlay = "all", presentation, selectedId, connections, onSelect, fidelityMesh = null,
}: Props) {
  const { camera, invalidate } = useThree();
  const fidelityMode = diagnostic === "obj-fidelity" && !!fidelityMesh;

  const geometryCache = useMemo(() => {
    const map = new Map<string, Array<{ name: string; geometry: THREE.BufferGeometry }>>();
    if (fidelityMode) return map;
    for (const mesh of meshes) {
      const key = geometryKey(mesh.id);
      if (!map.has(key)) map.set(key, buildFileSpaceGeometries(mesh));
    }
    return map;
  }, [meshes, fidelityMode]);

  const fidelityGeometry = useMemo(() => {
    if (!fidelityMesh || !fidelityMode) return null;
    return buildCompleteFileGeometry(fidelityMesh);
  }, [fidelityMesh, fidelityMode]);

  useEffect(() => () => {
    geometryCache.forEach((list) => list.forEach((item) => item.geometry.dispose()));
  }, [geometryCache]);
  useEffect(() => () => {
    fidelityGeometry?.dispose();
  }, [fidelityGeometry]);

  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);

  const spread = diagnostic === "originals" && !presentation && !fidelityMode;
  // Fidelity isolation: never render aggregation / preview meshes.
  const visibleMeshes = fidelityMode ? [] : diagnostic === "copies" && !presentation && meshes.length === 0 ? [] : meshes;

  const aim = useMemo(() => {
    if (fidelityMode) return new THREE.Vector3(0, 12, 0);
    const points = visibleMeshes.map((mesh, index) => {
      const placement = placements[mesh.id];
      if (spread) return new THREE.Vector3(index * 40, 0, 0);
      if (!placement) return new THREE.Vector3();
      return new THREE.Vector3(placement.ix * LATTICE_FEET, placementWorldZ(placement), placement.iy * LATTICE_FEET);
    });
    if (!points.length) return new THREE.Vector3((field.cellsX * LATTICE_FEET) / 2, (field.cellsZ * LATTICE_FEET) / 2, (field.cellsY * LATTICE_FEET) / 2);
    return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  }, [visibleMeshes, placements, spread, field, fidelityMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const span = fidelityMode ? 80 : Math.max(field.cellsX, field.cellsY, field.cellsZ, 1) * LATTICE_FEET;
      const fit = Math.max(presentation ? 90 : 60, span * (presentation ? 1.2 : 0.85));
      camera.near = Math.max(0.1, fit * 0.001);
      camera.far = Math.max(4000, fit * 10);
      if (cameraMode === "plan") camera.position.set(aim.x, aim.y + fit * 1.8, aim.z + 0.2);
      else if (cameraMode === "section") camera.position.set(aim.x + fit, aim.y + span * 0.15, aim.z);
      else camera.position.set(aim.x + fit * 0.72, aim.y + fit * 0.55, aim.z + fit * 0.72);
      camera.lookAt(aim.x, aim.y, aim.z);
      camera.updateProjectionMatrix();
      invalidate();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [camera, cameraMode, aim, field.cellsX, field.cellsY, field.cellsZ, presentation, fidelityMode, invalidate]);

  const clip = useMemo(
    () => (cameraMode === "section" ? [new THREE.Plane(new THREE.Vector3(-1, 0, 0), aim.x + 0.05)] : []),
    [cameraMode, aim.x],
  );
  useEffect(() => {
    const gl = (camera as THREE.Camera & { userData?: unknown });
    void gl;
  }, [camera, clip]);

  const latticeGeometry = useMemo(() => {
    const positions: number[] = [];
    const { cellsX, cellsY, cellsZ } = field;
    for (let iz = 0; iz <= cellsZ; iz += 1) {
      for (let ix = 0; ix <= cellsX; ix += 1) {
        positions.push(ix * LATTICE_FEET, iz * LATTICE_FEET, 0, ix * LATTICE_FEET, iz * LATTICE_FEET, cellsY * LATTICE_FEET);
      }
      for (let iy = 0; iy <= cellsY; iy += 1) {
        positions.push(0, iz * LATTICE_FEET, iy * LATTICE_FEET, cellsX * LATTICE_FEET, iz * LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    for (let ix = 0; ix <= cellsX; ix += 1) {
      for (let iy = 0; iy <= cellsY; iy += 1) {
        positions.push(ix * LATTICE_FEET, 0, iy * LATTICE_FEET, ix * LATTICE_FEET, cellsZ * LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return geometry;
  }, [field.cellsX, field.cellsY, field.cellsZ]);
  useEffect(() => () => latticeGeometry.dispose(), [latticeGeometry]);

  const connectionGeometry = useMemo(() => {
    if (fidelityMode || !showConnections) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const palette = {
      interlock: { PASS: [0.49, 0.81, 0.63], REVIEW: [0.84, 0.68, 0.31], FAIL: [0.77, 0.42, 0.42] },
      floor: [0.35, 0.65, 1.0],
      void: [0.72, 0.45, 0.95],
      circulation: [0.35, 0.9, 0.55],
    } as const;
    for (const pair of portPairs ?? []) {
      const [x,y,z]=pair.from, [bx,by,bz]=pair.to;
      positions.push(x,z,y,bx,bz,by);
      colors.push(.25,.86,.78,.25,.86,.78);
    }
    for (const connection of portPairs === undefined ? connections : []) {
      if (continuityOverlay === "floor" && connection.floor === "FAIL") continue;
      if (continuityOverlay === "void" && connection.void === "FAIL") continue;
      if (continuityOverlay === "circulation" && connection.circulation === "FAIL") continue;
      if (continuityOverlay === "interlock" && connection.interlock === "FAIL") continue;
      const a = placements[connection.tileA];
      const b = placements[connection.tileB];
      if (!a || !b) continue;
      positions.push(a.ix * LATTICE_FEET, placementWorldZ(a), a.iy * LATTICE_FEET, b.ix * LATTICE_FEET, placementWorldZ(b), b.iy * LATTICE_FEET);
      let color: readonly number[] = palette.interlock[connection.interlock] ?? palette.interlock.FAIL;
      if (diagnostic === "continuity") {
        if (continuityOverlay === "floor") color = palette.floor;
        else if (continuityOverlay === "void") color = palette.void;
        else if (continuityOverlay === "circulation") color = palette.circulation;
      }
      colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
    }
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geometry;
  }, [connections, placements, portPairs, showConnections, diagnostic, continuityOverlay, fidelityMode]);
  useEffect(() => () => connectionGeometry?.dispose(), [connectionGeometry]);

  const connectorGeometries = useMemo(() => {
    if (fidelityMode || !showGeneratedConnectors || !connectors.length) return [];
    return connectors.map((connector) => {
      const geometry = new THREE.BufferGeometry();
      const count = connector.positions.length / 3;
      const display = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        display[index * 3] = connector.positions[index * 3];
        display[index * 3 + 1] = connector.positions[index * 3 + 2];
        display[index * 3 + 2] = connector.positions[index * 3 + 1];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(display, 3));
      // Generated assignment lofts export outward faces in Z-up. The baked axis swap reflects winding.
      geometry.setIndex(connector.portPair ? connector.indices.flatMap((_,i)=>i%3===0?[connector.indices[i],connector.indices[i+2],connector.indices[i+1]]:[]) : connector.indices);
      geometry.computeVertexNormals();
      return { id: connector.id, geometry };
    });
  }, [connectors, showGeneratedConnectors, fidelityMode]);
  useEffect(() => () => connectorGeometries.forEach((item) => item.geometry.dispose()), [connectorGeometries]);

  /**
   * OBJ FIDELITY — exactly three source instances, spatially separated.
   * RAW: true file import (identity root).
   * REGISTERED: unit + up + registration translation only.
   * COPY 2: identical registered clone +20' X (lattice), placed at diagnostic +40' for clear separation.
   * Gold = COPY 2 source clone only (never connectors in this mode).
   */
  const fidelityLayouts = useMemo(() => {
    if (!fidelityMesh || !fidelityGeometry) return [];
    const rawPlacement = IDENTITY_PLACEMENT(`${fidelityMesh.id}::raw`);
    const registeredPlacement = IDENTITY_PLACEMENT(`${fidelityMesh.id}::reg`);
    const copyPlacement: Placement = { ...IDENTITY_PLACEMENT(`${fidelityMesh.id}::copy2`), ix: 1 };
    return [
      {
        key: "raw",
        label: "RAW IMPORT",
        mesh: { ...fidelityMesh, id: `${fidelityMesh.id}::raw` },
        placement: rawPlacement,
        register: false,
        applyUnitAndUp: false,
        offsetDisplay: new THREE.Vector3(-40, 0, 0),
        color: "#ffffff",
      },
      {
        key: "reg",
        label: "REGISTERED TILE",
        mesh: { ...fidelityMesh, id: `${fidelityMesh.id}::reg` },
        placement: registeredPlacement,
        register: true,
        applyUnitAndUp: true,
        offsetDisplay: new THREE.Vector3(0, 0, 0),
        color: "#c8c8c8",
      },
      {
        key: "copy2",
        label: "COPY 2 (+20' X)",
        mesh: { ...fidelityMesh, id: `${fidelityMesh.id}::copy2` },
        placement: copyPlacement,
        register: true,
        applyUnitAndUp: true,
        // Diagnostic spacing: registered is at 0; clone's +20' lattice plus +20' offset → clear visual gap.
        offsetDisplay: new THREE.Vector3(20, 0, 0),
        color: "#d4a84b",
      },
    ];
  }, [fidelityMesh, fidelityGeometry]);

  if (fidelityMode && fidelityMesh && fidelityGeometry) {
    return (
      <>
        <ambientLight intensity={0.75} />
        <directionalLight position={[40, 80, 30]} intensity={1.15} />
        {fidelityLayouts.map((item) => (
          <group key={item.key} position={item.offsetDisplay}>
            <FidelityInstance
              mesh={item.mesh}
              placement={item.placement}
              unitScale={unitScale}
              upAxisMode={upAxisMode}
              color={item.color}
              label={item.label}
              register={item.register}
              applyUnitAndUp={item.applyUnitAndUp}
              geometry={fidelityGeometry}
              onSelect={onSelect}
            />
          </group>
        ))}
        {/* Optional 20' grid — only when parent passes showLattice; defaults OFF in fidelity. */}
        <lineSegments visible={showLattice} geometry={latticeGeometry} renderOrder={2}>
          <lineBasicMaterial color="#9a9a9a" depthWrite={false} />
        </lineSegments>
        <OrbitControls key={`fidelity-${cameraMode}`} makeDefault target={[aim.x, aim.y, aim.z]} enableDamping={false} />
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.1} />

      {showOriginalTiles && visibleMeshes.map((mesh, index) => {
        const placement = placements[mesh.id] ?? IDENTITY_PLACEMENT(mesh.id);
        const model = modelById.get(mesh.id) ?? modelById.get(geometryKey(mesh.id));
        const slot = slotById(placement.slotId ?? model?.slotId ?? null);
        const color = colorMode === "category" ? CATEGORY_COLORS[slot?.category ?? "Gathering"] : colorMode === "typology" ? typologyColor(placement.slotId ?? model?.slotId ?? null) : "#f4f4f4";
        const geos = geometryCache.get(geometryKey(mesh.id)) ?? [];
        if (spread) {
          return (
            <group key={mesh.id} position={[index * 40, 0, 0]}>
              <TileRoot
                mesh={mesh}
                placement={IDENTITY_PLACEMENT(mesh.id, placement.slotId)}
                unitScale={unitScale}
                upAxisMode={upAxisMode}
                color={color}
                selected={selectedId === mesh.id}
                register
                applyUnitAndUp
                anchor={model?.anchor}
                onSelect={onSelect}
                geometries={geos}
              />
            </group>
          );
        }
        return (
          <TileRoot
            key={mesh.id}
            mesh={mesh}
            placement={placement}
            unitScale={unitScale}
            upAxisMode={upAxisMode}
            color={color}
            selected={selectedId === mesh.id}
            register
            applyUnitAndUp
            anchor={model?.anchor}
            onSelect={onSelect}
            geometries={geos}
          />
        );
      })}

      {!fidelityMode && !spread && showConnectionPorts && models.flatMap(model => {
        const placement = placements[model.id];
        if (!placement) return [];
        const variant = model.variants.find(v => v.rotation === placement.rotation && v.mirror === placement.mirror);
        return (variant?.ports ?? []).map(port => {
          const [x,y,z] = port.localPosition;
          const point: [number,number,number] = [placement.ix*20+x,placementWorldZ(placement)+z,placement.iy*20+y];
          const [dx,dy,dz] = port.outwardDirection;
          const tip: [number,number,number] = [point[0]+dx*3,point[1]+dz*3,point[2]+dy*3];
          return <group key={`${model.id}:${port.id}`}>
            <mesh position={point}><sphereGeometry args={[.3,8,6]} /><meshBasicMaterial color="#41dbc7" /></mesh>
            <Line points={[point,tip]} color="#41dbc7" lineWidth={1} />
            <Line points={[[tip[0]-dx*.65-dy*.4,tip[1],tip[2]-dy*.65+dx*.4],tip,[tip[0]-dx*.65+dy*.4,tip[1],tip[2]-dy*.65-dx*.4]]} color="#41dbc7" />
            <Html zIndexRange={[5, 0]} position={point} style={{fontSize:9,whiteSpace:"nowrap",color:"#93fff0",background:"#152725cc",padding:2}}>
              <span title={`${model.filename} · ${port.id}\n${port.type}\nZ: ${point[1].toFixed(1)}′ · W: ${port.usableWidth.toFixed(1)}′\nConfidence: ${port.confidence.toFixed(2)}`}>{port.id}</span>
            </Html>
          </group>;
        });
      })}
      {!fidelityMode && showConnectionPorts && (portPairs ?? []).map(pair => <Html zIndexRange={[5, 0]} key={`${pair.tileA}:${pair.tileB}`} position={[(pair.from[0]+pair.to[0])/2,(pair.from[2]+pair.to[2])/2+.8,(pair.from[1]+pair.to[1])/2]} style={{fontSize:10,color:"#ffdc87",whiteSpace:"nowrap",background:"#252015cc"}}>
        <span title={`${pair.tileA} → ${pair.tileB}\nClass: ${pair.connectionClass}\nLateral: ${(pair.lateralOffset??0).toFixed(1)}′ · Angle: ${(pair.angle??0).toFixed(1)}°\nDistance: ${pair.distance.toFixed(1)}′ · ΔZ: ${pair.rise.toFixed(1)}′\nFacing: ${pair.facing.toFixed(2)} · Width compatibility: ${pair.widthCompatibility.toFixed(2)}\nPort score: ${pair.score.toFixed(2)}`}>{pair.connectionClass} {pair.portA} → {pair.portB}</span>
      </Html>)}
      {!fidelityMode && showConnectionPorts && [...(portCandidates??[]).filter(c=>c.accepted),...(portCandidates??[]).filter(c=>!c.accepted&&!['NETWORK REDUNDANT','PORT IN USE'].includes(c.reason??'')).sort((a,b)=>a.pair.distance-b.pair.distance||b.pair.score-a.pair.score).slice(0,64)].map((candidate,index)=>{
        const pair=candidate.pair,color=!candidate.accepted?"#e47079":pair.connectionClass==="DIRECT"?"#63efb5":pair.connectionClass==="VERTICAL"?"#d5a0ff":"#66bfff";
        const points=(pair.path??[pair.from,pair.to]).map(([x,y,z])=>[x,z+.1,y] as [number,number,number]);
        return <group key={`candidate-${index}`}><Line points={points} color={color} lineWidth={candidate.accepted?2:1} dashed={!candidate.accepted} />
          {!candidate.accepted&&<Html zIndexRange={[5, 0]} position={points[Math.floor(points.length/2)]} style={{fontSize:8,color,whiteSpace:'nowrap'}}><span title={`${pair.portA} → ${pair.portB}: ${candidate.reason}\nDistance ${pair.distance.toFixed(1)}′ · Lateral ${(pair.lateralOffset??0).toFixed(1)}′ · ΔZ ${pair.rise.toFixed(1)}′ · Angle ${(pair.angle??0).toFixed(1)}°`}>{candidate.reason}</span></Html>}
        </group>;
      })}
      {!fidelityMode && connectorGeometries.map(({ id, geometry }) => (
        <mesh key={id} geometry={geometry}>
          <meshStandardMaterial color="#d6ad4f" roughness={0.55} metalness={0.08} />
        </mesh>
      ))}
      <lineSegments visible={!fidelityMode && showLattice} geometry={latticeGeometry} renderOrder={2}>
        <lineBasicMaterial color="#9a9a9a" depthWrite={false} />
      </lineSegments>
      {connectionGeometry && (
        <lineSegments visible={!fidelityMode && showConnections} geometry={connectionGeometry}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      )}
      <OrbitControls key={`${cameraMode}-${fidelityMode}`} makeDefault target={[aim.x, aim.y, aim.z]} enableDamping={false} />
    </>
  );
}

const LatticeViewport = forwardRef<LatticeViewportHandle, Props>(function LatticeViewport(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  useImperativeHandle(ref, () => ({ capture: () => canvasRef.current?.toDataURL("image/png") ?? "" }), [canvasKey]);
  return (
    <Canvas
      key={canvasKey}
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [80, 64, 80], fov: 40, near: 0.1, far: 8000 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          setCanvasKey((value) => value + 1);
        });
      }}
      onPointerMissed={() => props.onSelect("")}
      ref={canvasRef as never}
    >
      <Scene {...props} />
    </Canvas>
  );
});

export default LatticeViewport;
