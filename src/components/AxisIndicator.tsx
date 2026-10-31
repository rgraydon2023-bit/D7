"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GizmoHelper } from "@react-three/drei";
function AxisArrows() {
 const axes=useMemo(()=>[
  {label:"X",color:"#ef6464",direction:new THREE.Vector3(1,0,0)},
  {label:"Y",color:"#7bcd77",direction:new THREE.Vector3(0,1,0)},
  {label:"Z",color:"#6caaff",direction:new THREE.Vector3(0,0,1)},
 ].map(axis=>{
  const canvas=document.createElement("canvas");canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext("2d")!;ctx.font="bold 44px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=axis.color;ctx.fillText(axis.label,32,34);
  return {...axis,texture:new THREE.CanvasTexture(canvas)};
 }),[]);
 useEffect(()=>()=>axes.forEach(axis=>axis.texture.dispose()),[axes]);
 return <group>{axes.map(axis=><group key={axis.label}>
  <arrowHelper args={[axis.direction,new THREE.Vector3(),32,axis.color,8,5]}/>
  <sprite position={axis.direction.clone().multiplyScalar(44)} scale={[13,13,1]}><spriteMaterial map={axis.texture} transparent depthTest={false} toneMapped={false}/></sprite>
 </group>)}</group>;
}

export function AxisIndicator({ scale = 1, cornerInset }: { scale?: number; cornerInset?: number }) { const inset = cornerInset ?? (50 * scale + 8); return <GizmoHelper alignment="bottom-right" margin={[inset,inset]}><group scale={scale}><AxisArrows/></group></GizmoHelper>; }


