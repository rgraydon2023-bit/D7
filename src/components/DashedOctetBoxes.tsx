"use client";

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import type { OctetBox } from "./letterVolumeLayout";

const EDGES: Array<[number, number, number, number, number, number]> = [
  [0, 0, 0, 1, 0, 0],
  [1, 0, 0, 1, 1, 0],
  [1, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 1, 1],
  [0, 1, 1, 0, 0, 1],
  [0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 1],
  [1, 1, 0, 1, 1, 1],
  [0, 1, 0, 0, 1, 1],
];

export default function DashedOctetBoxes({ boxes }: { boxes: OctetBox[] }) {
  const line = useMemo(() => {
    if (boxes.length === 0) return null;
    const positions: number[] = [];
    for (const box of boxes) {
      const x0 = box.x - box.width / 2;
      const y0 = box.y - box.height / 2;
      const z0 = box.z - box.depth / 2;
      const span = [box.width, box.height, box.depth];
      for (const [ax, ay, az, bx, by, bz] of EDGES) {
        positions.push(
          x0 + ax * span[0], y0 + ay * span[1], z0 + az * span[2],
          x0 + bx * span[0], y0 + by * span[1], z0 + bz * span[2],
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineDashedMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.92,
      dashSize: 0.08,
      gapSize: 0.05,
    });
    const segments = new THREE.LineSegments(geometry, material);
    segments.computeLineDistances();
    return segments;
  }, [boxes]);

  useLayoutEffect(() => {
    return () => {
      line?.geometry.dispose();
      (line?.material as THREE.Material | undefined)?.dispose();
    };
  }, [line]);

  if (!line) return null;
  return (
    <group>
      <primitive object={line} />
      {boxes.map((box, index) => (
        <mesh key={index} position={[box.x, box.y, box.z]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}
