"use client";

import { Center, OrbitControls, OrthographicCamera, Text } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { Cell, Letter, LetterAsset, LetterAssets } from "./letterTypes";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import { letterVolumeLayout } from "./letterVolumeLayout";
import type { VolumeExportTarget } from "./exportLetterVolume";

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
  letterSize: number;
  assets: LetterAssets;
  useAssets: boolean;
  showGuides: boolean;
  volumeTarget: VolumeExportTarget;
  clipPositions: { x: number; y: number; z: number };
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
        <group rotation={[0, yRotation, 0]}>
          <Center>
            <LetterContent
              letter={cell.letter}
              asset={asset}
              useAssets={useAssets}
              size={worldLetterSize}
              rotationDeg={cell.rotation}
              solid={solid}
              layerIndex={layerIndex}
              thickness={thickness}
              voidMode={voidMode}
            />
          </Center>
        </group>
      </Suspense>
    </group>
  );
}

function GridClipPlanes({ positions, width, height, depth }: {
  positions: { x: number; y: number; z: number };
  width: number;
  height: number;
  depth: number;
}) {
  const { gl } = useThree();
  const cuts = useMemo(() => ({
    x: (width * positions.x) / 200,
    y: (height * positions.y) / 200,
    z: (depth * positions.z) / 200,
  }), [width, height, depth, positions]);
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), cuts.x),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), cuts.y),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), cuts.z),
  ], [cuts]);

  useEffect(() => {
    const previous = gl.clippingPlanes;
    const previousLocal = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    gl.clippingPlanes = clippingPlanes;
    return () => {
      gl.clippingPlanes = previous;
      gl.localClippingEnabled = previousLocal;
    };
  }, [gl, clippingPlanes]);

  return (
    <>
      <mesh position={[cuts.x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth * 1.08, height * 1.08]} />
        <meshBasicMaterial color="#f49aa6" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, cuts.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 1.08, depth * 1.08]} />
        <meshBasicMaterial color="#b7ea9c" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, cuts.z]}>
        <planeGeometry args={[width * 1.08, height * 1.08]} />
        <meshBasicMaterial color="#9fc7ff" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
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
    letterSize,
    assets,
    useAssets,
    showGuides,
    volumeTarget,
    clipPositions,
  } = props;

  const { placements, worldLetterSize, width: worldWidth, height: worldHeight, depth: worldDepth } =
    useMemo(() => letterVolumeLayout({
      cells,
      layerCells: layerMode ? layerCells : [],
      cols,
      rows,
      spacing,
      zSpacing,
      letterSize,
      thickness: letterThickness,
      yRotationEnabled: layerMode && yRotationEnabled,
      yRotationRange,
    }), [cells, layerCells, layerMode, cols, rows, spacing, zSpacing, letterSize, letterThickness, yRotationEnabled, yRotationRange]);

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
      <group>
        {placements.map(({ cell, x, y, z, layerIndex, yRotation }) => (
          <GridCell
            key={`${layerIndex}-${cell.id}`}
            cell={cell}
            x={x}
            y={y}
            z={z}
            asset={assets[cell.letter]}
            useAssets={useAssets}
            worldLetterSize={worldLetterSize}
            showGuides={showGuides && !layerMode}
            solid={layerMode}
            layerIndex={layerIndex}
            thickness={letterThickness}
            yRotationDeg={yRotation}
            voidMode={volumeTarget === "void"}
          />
        ))}
      </group>
      <GridClipPlanes positions={clipPositions} width={worldWidth} height={worldHeight} depth={worldDepth} />
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
