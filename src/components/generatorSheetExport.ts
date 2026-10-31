import * as THREE from 'three';
import { modelCube } from './architecturalElements';

type Mesh = {positions:number[];indices:number[]};
type View = 'plan'|'section'|'isometric';
export const SHEET_WIDTH=33*72, SHEET_HEIGHT=12.5*72;
const margin=36,header=96,gap=24,footer=36;
export const PANEL_WIDTH=(SHEET_WIDTH-2*margin-2*gap)/3;
export const PANEL_HEIGHT=SHEET_HEIGHT-header-footer-26;
export const PRINT_DPI=300;
const label=(text:string)=>text.replace(/[^\x20-\x7e]/g,'-').replace(/([\\()])/g,'\\$1');

/** Exact physical page size with individually embedded 300-dpi view images. */
export function sheetPdf(images:Uint8Array[],title:string,subtitle:string):Blob {
 if(images.length!==3)throw new Error('A sheet requires plan, section and isometric images.');
 const encoder=new TextEncoder(),objects:Uint8Array[]=[],encode=(s:string)=>encoder.encode(s);
 const stream=(dictionary:string,bytes:Uint8Array)=>{
  const start=encode('<< '+dictionary+' /Length '+bytes.length+' >>\nstream\n'),end=encode('\nendstream');
  const data=new Uint8Array(start.length+bytes.length+end.length);data.set(start);data.set(bytes,start.length);data.set(end,start.length+bytes.length);return data;
 };
 objects.push(encode('<< /Type /Catalog /Pages 2 0 R >>'));
 objects.push(encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
 objects.push(encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+SHEET_WIDTH+' '+SHEET_HEIGHT+'] /Resources << /Font << /F1 4 0 R >> /XObject << /I0 6 0 R /I1 7 0 R /I2 8 0 R >> >> /Contents 5 0 R >>'));
 objects.push(encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
 const text=(value:string,x:number,y:number,size:number)=>'BT /F1 '+size+' Tf '+x+' '+y+' Td ('+label(value)+') Tj ET\n';
 let content='0 0 0 rg 0 0 '+SHEET_WIDTH+' '+SHEET_HEIGHT+' re f\n'+[214/255,173/255,79/255].join(' ')+' rg\n'+text(title,margin,SHEET_HEIGHT-40,20)+text(subtitle,margin,SHEET_HEIGHT-62,10);
 ['PLAN','SECTION','ISOMETRIC'].forEach((name,i)=>{
  const top=SHEET_HEIGHT-header,x=margin+i*(PANEL_WIDTH+gap);
  content+=text(name,x,top+9,12)+'q '+PANEL_WIDTH+' 0 0 '+PANEL_HEIGHT+' '+x+' '+(top-PANEL_HEIGHT)+' cm /I'+i+' Do Q\n';
 });
 content+=text('33 x 12.5 inches | Print at 100% / Actual size | Views fitted to sheet; not a fixed architectural scale.',margin,18,9);
 objects.push(stream('',encode(content)));
 const width=Math.round(PANEL_WIDTH/72*PRINT_DPI),height=Math.round(PANEL_HEIGHT/72*PRINT_DPI);
 images.forEach(bytes=>objects.push(stream('/Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',bytes)));
 const chunks:Uint8Array[]=[encode('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((object,i)=>{offsets.push(length);const start=encode((i+1)+' 0 obj\n'),end=encode('\nendobj\n');chunks.push(start,object,end);length+=start.length+object.length+end.length;});
 const xref=length;let tail='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const offset of offsets.slice(1))tail+=String(offset).padStart(10,'0')+' 00000 n \n';
 tail+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';chunks.push(encode(tail));
 const output=new ArrayBuffer(chunks.reduce((sum,c)=>sum+c.length,0)),bytes=new Uint8Array(output);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
 return new Blob([output],{type:'application/pdf'});
}

export async function exportGeneratorSheet(mesh:Mesh,title:string,subtitle:string,voidMode=false):Promise<Blob> {
 if(!mesh.indices.length)throw new Error('Generate a variation before exporting.');
 const width=Math.round(PANEL_WIDTH/72*PRINT_DPI),height=Math.round(PANEL_HEIGHT/72*PRINT_DPI);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 const geometry=new THREE.BufferGeometry(),scene=new THREE.Scene();
 const material=new THREE.MeshStandardMaterial({color:'#f4f1ea',roughness:.6,metalness:.01,side:THREE.DoubleSide,transparent:voidMode,opacity:voidMode?.2:1,depthWrite:!voidMode});
 const box=modelCube(mesh),center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3()),span=Math.max(extent.length(),1);
 const cube=new THREE.BoxGeometry(extent.x,extent.y,extent.z),edges=new THREE.EdgesGeometry(cube),lineMaterial=new THREE.LineBasicMaterial({color:'#8ca4b6',transparent:true,opacity:.65});
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 try {
  const gl=renderer.getContext();if(Math.max(width,height)>gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))throw new Error('This GPU cannot render the requested 300-dpi sheet.');
  renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  scene.background=new THREE.Color('#000000');geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));geometry.setIndex(mesh.indices);geometry.computeVertexNormals();scene.add(new THREE.Mesh(geometry,material));
  scene.add(new THREE.AmbientLight(0xffffff,.9));for(const [position,intensity] of [[[8,12,9],1.4],[[-8,2,-5],.45]] as const){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(position[0],position[1],position[2]);scene.add(light);}
  const outline=new THREE.LineSegments(edges,lineMaterial);outline.position.copy(center);scene.add(outline);
  const images:Uint8Array[]=[];
  for(const view of ['plan','section','isometric'] as View[]){
   // Yield between renders so the export status can paint.
   await new Promise(resolve=>setTimeout(resolve,0));
   const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.001,span*20);
   camera.up.set(...(view==='plan'?[0,1,0]:[0,0,1]) as [number,number,number]);
   camera.position.copy(center).add(view==='plan'?new THREE.Vector3(0,0,span*2):view==='section'?new THREE.Vector3(0,-span*2,0):new THREE.Vector3(span,-span,span*Math.SQRT2));
   camera.zoom=Math.min(width,height)*.82/span;camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.render(scene,camera);
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image export is unavailable.');ctx.drawImage(renderer.domElement,0,0);
   // Match the generator's rotating XYZ reference in each fixed export view.
   const inverse=camera.quaternion.clone().invert(),origin=[width-150,height-150],length=80;
   for(const [axis,color,direction] of [['X','#ef6464',new THREE.Vector3(1,0,0)],['Y','#7bcd77',new THREE.Vector3(0,1,0)],['Z','#6caaff',new THREE.Vector3(0,0,1)]] as const){
    const v=direction.applyQuaternion(inverse),x=origin[0]+v.x*length,y=origin[1]-v.y*length;
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(origin[0],origin[1]);ctx.lineTo(x,y);ctx.stroke();
    if(Math.hypot(v.x,v.y)>.05){const a=Math.atan2(y-origin[1],x-origin[0]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-18*Math.cos(a-.4),y-18*Math.sin(a-.4));ctx.lineTo(x-18*Math.cos(a+.4),y-18*Math.sin(a+.4));ctx.closePath();ctx.fill();}
    ctx.fillStyle='#d6ad4f';ctx.font='bold 28px Arial';ctx.fillText(axis,x+10,y-10);
   }
   const image=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode view.')),'image/jpeg',.96));images.push(new Uint8Array(await image.arrayBuffer()));
  }
  return sheetPdf(images,title,subtitle);
 } finally {geometry.dispose();material.dispose();cube.dispose();edges.dispose();lineMaterial.dispose();renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=1;}
}
