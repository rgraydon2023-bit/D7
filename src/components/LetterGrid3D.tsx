"use client";

import { Center, OrbitControls, Text } from "@react-three/drei";
import { BoardOrthographicCamera as OrthographicCamera } from "./BoardOrthographicCamera";
import { useLoader } from "@react-three/fiber";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { Suspense, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Cell, Letter, LetterAsset, LetterAssets } from "./letterTypes";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import DashedOctetBoxes from "./DashedOctetBoxes";
import { letterDepthSpan, letterVolumeLayout, octetBoxes, UNIT_LETTER_SPAN } from "./letterVolumeLayout";
import type { VolumeBounds, VolumeExportTarget } from "./exportLetterVolume";
import type { CompositionPlacement } from "./compositionEngine";

type LetterGrid3DProps = {
  cells: Cell[];
  layerCells: Cell[][];
  zSpacing: number;
  letterThickness: number;
  yRotationEnabled: boolean;
  yRotationRange: number;
  layerMode: boolean;
  cols: number;
  rows: number;
  spacing: number;
  attractorGap?: number;
  letterSize: number;
  assets: LetterAssets;
  useAssets: boolean;
  showGuides: boolean;
  volumeTarget: VolumeExportTarget;
  compositionPlacements?: CompositionPlacement[] | null;
  compositionBounds?: VolumeBounds;
};

const layerMaterials = [
  "#e8f7fb", "#cbeaf4", "#a9dbe9", "#8ccbdc",
  "#72b7cc", "#5da4bb", "#4b90a8", "#397d96",
].map((color) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.68,
  metalness: 0.03,
  side: THREE.DoubleSide,
}));
const voidCutterMaterial = new THREE.MeshStandardMaterial({
  color: "#050505",
  roughness: 0.85,
  side: THREE.DoubleSide,
});

function SolidLetter({ letter, size, rotationDeg, layerIndex, thickness, voidMode }: {
  letter: Letter;
  size: number;
  rotationDeg: number;
  layerIndex: number;
  thickness: number;
  voidMode: boolean;
}) {
  const geometry = getLetterVolumeGeometry(letter, thickness);
  return (
    <mesh
      geometry={geometry}
      material={voidMode ? voidCutterMaterial : layerMaterials[layerIndex]}
      scale={size}
      rotation={[0, 0, THREE.MathUtils.degToRad(rotationDeg)]}
    />
  );
}

function normalizeObject(object: THREE.Object3D, targetSize: number) {
  object.position.set(0, 0, 0);
  object.scale.setScalar(1);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);
  object.position.copy(center).multiplyScalar(-scale);
}

function GltfModel({
  url,
  size,
  rotationDeg,
}: {
  url: string;
  size: number;
  rotationDeg: number;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useLayoutEffect(() => {
    normalizeObject(scene, size);
  }, [scene, size]);

  return (
    <group rotation={[0, 0, THREE.MathUtils.degToRad(rotationDeg)]}>
      <primitive object={scene} />
    </group>
  );
}

function ObjModel({
  url,
  size,
  rotationDeg,
}: {
  url: string;
  size: number;
  rotationDeg: number;
}) {
  const obj = useLoader(OBJLoader, url);
  const scene = useMemo(() => obj.clone(true), [obj]);

  useLayoutEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          color: "#f2f2f2",
          metalness: 0.05,
          roughness: 0.7,
        });
      }
    });
    normalizeObject(scene, size);
  }, [scene, size]);

  return (
    <group rotation={[0, 0, THREE.MathUtils.degToRad(rotationDeg)]}>
      <primitive object={scene} />
    </group>
  );
}

function ImagePlane({
  url,
  size,
  rotationDeg,
}: {
  url: string;
  size: number;
  rotationDeg: number;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh rotation={[0, 0, THREE.MathUtils.degToRad(rotationDeg)]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

function TextLetter({
  letter,
  size,
  rotationDeg,
}: {
  letter: Letter;
  size: number;
  rotationDeg: number;
}) {
  return (
    <Text
      fontSize={size * 0.85}
      color="#f2f2f2"
      anchorX="center"
      anchorY="middle"
      rotation={[0, 0, THREE.MathUtils.degToRad(rotationDeg)]}
    >
      {letter}
    </Text>
  );
}

function LetterContent({
  letter,
  asset,
  useAssets,
  size,
  rotationDeg,
  solid,
  layerIndex,
  thickness,
  voidMode,
}: {
  letter: Letter;
  asset: LetterAsset | null;
  useAssets: boolean;
  size: number;
  rotationDeg: number;
  solid: boolean;
  layerIndex: number;
  thickness: number;
  voidMode: boolean;
}) {
  if (useAssets && asset) {
    if (asset.kind === "model") {
      if (asset.format === "obj") {
        return <ObjModel url={asset.url} size={size} rotationDeg={rotationDeg} />;
      }
      return <GltfModel url={asset.url} size={size} rotationDeg={rotationDeg} />;
    }
    return <ImagePlane url={asset.url} size={size} rotationDeg={rotationDeg} />;
  }

  return solid
    ? <SolidLetter letter={letter} size={size} rotationDeg={rotationDeg} layerIndex={layerIndex} thickness={thickness} voidMode={voidMode} />
    : <TextLetter letter={letter} size={size} rotationDeg={rotationDeg} />;
}

function DashedNodeCircle({ radius }: { radius: number }) {
  const line = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, -0.04));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: "#3dd6db",
      transparent: true,
      opacity: 0.5,
      dashSize: Math.max(0.04, radius * 0.16),
      gapSize: Math.max(0.03, radius * 0.1),
    });
    const obj = new THREE.Line(geometry, material);
    obj.computeLineDistances();
    return obj;
  }, [radius]);

  useLayoutEffect(() => {
    return () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [line]);

  return <primitive object={line} />;
}

function GridCell({
  cell,
  x,
  y,
  z,
  asset,
  useAssets,
  worldLetterSize,
  showGuides,
  solid,
  layerIndex,
  thickness,
  yRotationDeg,
  xRotationDeg,
  zRotationDeg,
  axisScale,
  voidMode,
}: {
  cell: Cell;
  x: number;
  y: number;
  z: number;
  asset: LetterAsset | null;
  useAssets: boolean;
  worldLetterSize: number;
  showGuides: boolean;
  solid: boolean;
  layerIndex: number;
  thickness: number;
  yRotationDeg: number;
  xRotationDeg: number;
  zRotationDeg: number;
  axisScale: [number, number, number];
  voidMode: boolean;
}) {
  // Diameter ≤ letter size (0.85×).
  const circleRadius = (worldLetterSize * 0.85) / 2;
  const yRotation = THREE.MathUtils.degToRad(yRotationDeg);

  return (
    <group position={[x, y, z]}>
      {showGuides && <DashedNodeCircle radius={circleRadius} />}
      <Suspense
        fallback={
          <mesh>
            <boxGeometry
              args={[
                worldLetterSize * 0.35,
                worldLetterSize * 0.35,
                worldLetterSize * 0.35,
              ]}
            />
            <meshStandardMaterial color="#444444" wireframe />
          </mesh>
        }
      >
        <group rotation={[THREE.MathUtils.degToRad(xRotationDeg), yRotation, 0]}>
          <group scale={axisScale}>
          <Center>
            <LetterContent
              letter={cell.letter}
              asset={asset}
              useAssets={useAssets}
              size={worldLetterSize}
              rotationDeg={zRotationDeg}
              solid={solid}
              layerIndex={layerIndex}
              thickness={thickness}
              voidMode={voidMode}
            />
          </Center>
          </group>
        </group>
      </Suspense>
    </group>
  );
}

function Scene(props: LetterGrid3DProps) {
  const {
    cells,
    layerCells,
    zSpacing,
    letterThickness,
    yRotationEnabled,
    yRotationRange,
    layerMode,
    cols,
    rows,
    spacing,
    attractorGap,
    letterSize,
    assets,
    useAssets,
    showGuides,
    volumeTarget,
    compositionPlacements,
    compositionBounds: fixedCompositionBounds,
  } = props;

  const regularLayout =
    useMemo(() => letterVolumeLayout({
      cells,
      layerCells: layerMode ? layerCells : [],
      cols,
      rows,
      spacing,
      zSpacing,
      attractorGap,
      letterSize,
      thickness: letterThickness,
      yRotationEnabled: layerMode && yRotationEnabled,
      yRotationRange,
    }), [cells, layerCells, layerMode, cols, rows, spacing, zSpacing, attractorGap, letterSize, letterThickness, yRotationEnabled, yRotationRange]);
  const placements = useMemo<CompositionPlacement[]>(() => compositionPlacements ?? regularLayout.placements.map((placement, sourceIndex) => ({
    ...placement,
    sourceIndex,
    rx: 0,
    ry: placement.yRotation,
    rz: placement.cell.rotation,
    scale: regularLayout.worldLetterSize,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  })), [compositionPlacements, regularLayout]);
  const compositionBounds = useMemo(() => {
    if (!compositionPlacements?.length) return null;
    const extent = (axis: "x" | "y" | "z") => {
      const min = Math.min(...compositionPlacements.map((placement) => placement[axis] - placement.scale * Math.max(placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1) * 0.55));
      const max = Math.max(...compositionPlacements.map((placement) => placement[axis] + placement.scale * Math.max(placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1) * 0.55));
      return max - min;
    };
    return { width: extent("x"), height: extent("y"), depth: extent("z") };
  }, [compositionPlacements]);
  const groupBoxes = useMemo(() => {
    const layers = Math.max(1 + layerCells.length, ...placements.map((placement) => placement.layerIndex + 1), 1);
    return octetBoxes(placements.map((placement) => {
      const width = placement.scale * (placement.scaleX ?? 1);
      const height = placement.scale * (placement.scaleY ?? 1);
      const depth = placement.scale * (placement.scaleZ ?? 1);
      const framed = placement as CompositionPlacement & { frameX?: number; frameY?: number; frameZ?: number };
      return {
        col: placement.col,
        row: placement.row,
        layerIndex: placement.layerIndex,
        x: framed.frameX ?? placement.x,
        y: framed.frameY ?? placement.y,
        z: framed.frameZ ?? placement.z,
        halfX: (width * UNIT_LETTER_SPAN) / 2,
        halfY: (height * UNIT_LETTER_SPAN) / 2,
        halfZ: letterDepthSpan(depth, letterThickness, false) / 2,
      };
    }), { cols, rows, layers });
  }, [placements, cols, rows, layerCells.length, letterThickness]);
  const worldLetterSize = regularLayout.worldLetterSize;
  const worldWidth = fixedCompositionBounds?.width ?? compositionBounds?.width ?? regularLayout.width;
  const worldHeight = fixedCompositionBounds?.height ?? compositionBounds?.height ?? regularLayout.height;
  const worldDepth = fixedCompositionBounds?.depth ?? compositionBounds?.depth ?? regularLayout.depth;

  const zoom = Math.min(110, 430 / Math.max(
    worldWidth * (layerMode ? 1.35 : 1),
    worldHeight * (layerMode ? 1.5 : 1),
    worldDepth * 1.8,
    1,
  ));

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 7, 9]} intensity={1.2} />
      <directionalLight position={[-5, -2, 5]} intensity={0.35} />
      <OrthographicCamera
        makeDefault
        position={layerMode
          ? [worldWidth * 1.2, worldHeight * 0.9, Math.max(worldDepth * 1.5, worldWidth * 0.9)]
          : [0, 0, 20]}
        zoom={zoom}
        near={0.1}
        far={200}
      />
      {layerMode && (
        <>
          {volumeTarget === "void" && (
            <mesh>
              <boxGeometry args={[worldWidth + worldLetterSize * 0.12, worldHeight + worldLetterSize * 0.12, worldDepth + worldLetterSize * 0.12]} />
              <meshStandardMaterial color="#69d5e6" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          )}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(
              worldWidth + (volumeTarget === "void" ? worldLetterSize * 0.12 : 0),
              worldHeight + (volumeTarget === "void" ? worldLetterSize * 0.12 : 0),
              worldDepth + (volumeTarget === "void" ? worldLetterSize * 0.12 : 0),
            )]} />
            <lineBasicMaterial color="#3dd6db" transparent opacity={0.75} />
          </lineSegments>
        </>
      )}
      <DashedOctetBoxes boxes={groupBoxes} />
      <group>
        {placements.map((placement, placementIndex) => (
          <GridCell
            key={`${placement.layerIndex}-${placement.cell.id}-${placementIndex}`}
            cell={placement.cell}
            x={placement.x}
            y={placement.y}
            z={placement.z}
            asset={assets[placement.cell.letter]}
            useAssets={useAssets}
            worldLetterSize={placement.scale}
            showGuides={showGuides && !layerMode}
            solid={layerMode}
            layerIndex={placement.layerIndex}
            thickness={letterThickness}
            xRotationDeg={placement.rx}
            yRotationDeg={placement.ry}
            zRotationDeg={placement.rz}
            axisScale={[placement.scaleX ?? 1, placement.scaleY ?? 1, placement.scaleZ ?? 1]}
            voidMode={volumeTarget === "void"}
          />
        ))}
      </group>
      <OrbitControls enablePan enableZoom enableRotate minZoom={15} maxZoom={260} />
    </>
  );
}

export default function LetterGrid3D(props: LetterGrid3DProps) {
  return (
    <div className="relative h-full min-h-[160px] w-full overflow-hidden rounded-xl">
      <Canvas gl={{ antialias: true }} dpr={[1, 2]}>
        <Scene {...props} />
      </Canvas>
      <p className="pointer-events-none absolute bottom-2 left-3 text-[10px]" style={{ color: "#9a9a9a" }}>
        {props.volumeTarget === "void" ? "Void preview: box minus dark letter cutters" : "Letters preview"} · drag to orbit · scroll to zoom
      </p>
    </div>
  );
}
