import * as THREE from 'three';
import { centralVoidProfile } from './voidIndicator';
import type { ConnectionWorkflow } from './letterIntersectionSpaces';
import { architecturalLetterGeometry } from './architecturalLetterGeometry';
import { placementMatrix, type IntersectionPlacement } from './architecturalConnections';
import { typologyLetterPriority } from './typologyLetterOrder';
import { TYPOLOGY_RULES } from './amphitheaterPrototype';
import { orientationFamily, orientationSteps } from './typologyOrientationRules';
import type { SavedEditor } from './formRepository';
type Mesh={positions:number[];indices:number[]};
export function createGraphicRules(data:ConnectionWorkflow,typology:string,bridgeLines:number[]=[],thickness=10,original:IntersectionPlacement[]=[],editor?:SavedEditor):Promise<Blob>{
 void bridgeLines;
 const ops=data.formation?.operations??[];
 const sentences=ops.flatMap(op=>op.split(/(?<=[.!?])\s+(?=[A-Z0-9])/));
 const sentence=(pattern:RegExp,fallback:string)=>sentences.find(value=>pattern.test(value))||fallback;
 const id=TYPOLOGY_RULES.find(rule=>rule.name===typology)?.id??'';
 const priorityOrder=typologyLetterPriority(id);
 const roles:Record<string,string>={L:'linear spaces',U:'curved spaces',V:'acute spaces'};
 const sequence=data.arrangement?.sequence??[];
 const arrangement=data.arrangement?.placements??[];
 const ordered=sequence.length?sequence.map(i=>arrangement[i]).filter(Boolean):arrangement;
 const orderText=ordered.length?ordered.map(p=>p.letter).join(' → '):'No placement sequence was recorded.';
 const enclosureBox=new THREE.Box3();
 if(data.enclosure?.positions.length)enclosureBox.setFromBufferAttribute(new THREE.Float32BufferAttribute(data.enclosure.positions,3));
 const dimensions=enclosureBox.isEmpty()?null:enclosureBox.getSize(new THREE.Vector3());
 const edited=editor?.rotations.filter(rotation=>rotation.some(value=>Math.abs(value)>1e-6)).length??0;
 const stages:{title:string;caption:string;mesh:Mesh;context?:Mesh;wire?:boolean;lines?:number[]}[]=[
  {title:'LETTER PRIORITY',caption:priorityOrder.map((letter,i)=>['Primary','Secondary','Tertiary'][i]+' '+letter+' — '+roles[letter]).join('; ')+'.',mesh:data.source},
  {title:'LETTER ORDER',caption:'Recorded sequence: '+orderText,mesh:data.arrangedSource??data.source},
  {title:'ROTATION CONSTRAINTS',caption:'Rotation examples follow the selected typology’s orientation rules. The order and actual placement angles are shown separately.',mesh:data.arrangedSource??data.source},
  {title:'VOID',caption:data.protectedVoid?.indices.length?'Blue shows the recorded protected opening.':'Blue is an approximate opening profile; a protected void is not verified.',mesh:data.arrangedSource??data.source,context:data.protectedVoid?.indices.length?data.protectedVoid:centralVoidProfile(data.arrangedSource??data.source)},
  {title:'OVERLAP / INTERSECTION',caption:'Gold shows recorded shared volumes between the arranged letters before connections.',mesh:data.intersections,context:data.arrangedSource??data.source},
  {title:'SCALE',caption:dimensions?'Saved enclosure: '+[dimensions.x,dimensions.y,dimensions.z].map(v=>v.toFixed(1)).join(' × ')+' ft. The displayed form uses the saved module dimensions.':'The form is shown at its saved scale; enclosure dimensions were not recorded.',mesh:data.arrangedSource??data.source,context:data.enclosure},
  {title:'NEW ROTATION',caption:editor?(edited?edited+' letter instance(s) have saved rotation edits in the Form Editor.':'No additional Form Editor rotations are saved.'): 'Saved Form Editor rotation details are not available for this export.',mesh:data.arrangedSource??data.source},
  {title:'FINAL FORM',caption:data.variants.letters.components===1?'The final generated letter form is one connected component.':`The final generated letter form contains ${data.variants.letters.components} separate components.`,mesh:data.variants.letters},
 ];
 const canvas=document.createElement('canvas');canvas.width=15431;canvas.height=4500;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Graphic export is unavailable.');const scale=canvas.width/5144;ctx.scale(scale,scale);ctx.fillStyle='#000000';ctx.fillRect(0,0,5144,1500);
 ctx.fillStyle='#d6ad4f';ctx.font='bold 58px Arial';ctx.fillText('PROCESS STUDY — '+typology.toUpperCase(),100,90);ctx.fillStyle='#ffffff';ctx.font='27px Arial';ctx.fillText('Eight steps from the selected letters to the generated architectural form',102,145);ctx.strokeStyle='#d6ad4f';ctx.beginPath();ctx.moveTo(100,190);ctx.lineTo(5044,190);ctx.stroke();
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,300,false);renderer.setPixelRatio(1);renderer.setClearColor('#000000');
 try{stages.forEach((stage,i)=>{const x=100+(i%4)*1250,y=230+Math.floor(i/4)*575;ctx.fillStyle='#d6ad4f';ctx.font='bold 33px Arial';ctx.fillText(String(i+1).padStart(2,'0')+'  '+stage.title,x,y+35);ctx.strokeStyle='#343a3d';ctx.beginPath();ctx.moveTo(x,y+55);ctx.lineTo(x+1170,y+55);ctx.stroke();
 const placements=data.arrangement?.placements??[], sequence=data.arrangement?.sequence??[];
 if(i===0&&original.length){
  renderer.setSize(1100,300,false);const scene=new THREE.Scene(),box=new THREE.Box3(),resources:{dispose:()=>void}[]=[];
  const id=TYPOLOGY_RULES.find(rule=>rule.name===typology)?.id??'',priorityOrder=typologyLetterPriority(id),colors=['#d6ad4f','#1293c2','#71beda'];
  for(const p of original){const geometry=architecturalLetterGeometry(p.letter,thickness,p.letterRules).clone().applyMatrix4(placementMatrix(p));geometry.computeBoundingBox();if(geometry.boundingBox)box.union(geometry.boundingBox);const material=new THREE.MeshStandardMaterial({color:colors[priorityOrder.indexOf(p.letter)]??'#eeeeea',side:THREE.DoubleSide,roughness:.65});scene.add(new THREE.Mesh(geometry,material));resources.push(geometry,material);}
  scene.add(new THREE.HemisphereLight(0xffffff,0x646b74,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);const center=box.getCenter(new THREE.Vector3()),span=Math.max(box.getSize(new THREE.Vector3()).length(),.001),aspect=1100/300,camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.001,span*20);camera.up.set(0,0,1);const opposite=typology.toLowerCase()==='vertical void lobby'?-1:1;camera.position.copy(center).add(new THREE.Vector3(span*opposite,-span*opposite,span*1.4));camera.lookAt(center);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,x+30,y+75,1100,300);resources.forEach(resource=>resource.dispose());
  priorityOrder.forEach((letter,index)=>{ctx.fillStyle=colors[index];ctx.fillRect(x+35,y+112+index*34,18,18);ctx.font='bold 20px Arial';ctx.fillText(['PRIMARY','SECONDARY','TERTIARY'][index]+' — '+letter,x+65,y+128+index*34);});
 }else if(i===2){
  const id=TYPOLOGY_RULES.find(rule=>rule.name===typology)?.id??'',family=orientationFamily(id),steps=id==='linear-gallery-lobby'?{xy:90,vertical:90}:orientationSteps(family),amphitheater=id==='stepped-amphitheater',voidField=id==='void-field-gathering',flat=id==='flat-deep-plan-plate'||id==='inserted-horizontal-plate'||id==='linear-gallery-lobby',topographical=/topographic|folded-undulating/.test(id),topographicLobby=id==='topographic-ground-field-lobby';
  const examples=id==='open-hall-workspace'?[{title:'XY / Z',letter:'L' as const,axis:'z' as const,angles:[0,90],note:'MIRRORED L PAIRS'},{title:'XZ / Y',letter:'L' as const,axis:'y' as const,angles:[0,90],note:'WALLS ON YZ'},{title:'YZ / X',letter:'L' as const,axis:'x' as const,angles:[0,90],note:'MIRRORED L PAIRS'},{title:'L ROTATION',letter:'L' as const,axis:'z' as const,angles:[0,90],note:'L LETTERS ONLY'}]:topographicLobby?[{title:'XY / Z SPIRAL',letter:'L' as const,axis:'z' as const,angles:[0,15],note:'90° SWEEP · 15° STEPS'},{title:'L FACE TILT',letter:'L' as const,axis:'y' as const,angles:[0,45],note:'0°–45° FROM XY'},{title:'U FACE TILT',letter:'U' as const,axis:'y' as const,angles:[45,90],note:'45°–90° FROM XY'},{title:'V FACE TILT',letter:'V' as const,axis:'y' as const,angles:[90,120],note:'90°–120° FROM XY'}]:[{title:'XY / Z',letter:'U' as const,axis:'z' as const,angles:[0,steps.xy],note:voidField?'RADIAL 15°':steps.xy+'° STEPS'},{title:'XZ / Y',letter:'U' as const,axis:'y' as const,angles:[0,amphitheater||voidField?0:steps.vertical],note:amphitheater||voidField?'LEVEL':steps.vertical?steps.vertical+'° STEPS':'LEVEL'},{title:'YZ / X',letter:'U' as const,axis:'x' as const,angles:[0,flat||amphitheater||voidField?90:steps.vertical],note:amphitheater||voidField?'0° OR ±90°':(flat?90:steps.vertical)+'° STEPS'},{title:'V FACE TILT',letter:'V' as const,axis:(flat||voidField?'x':'y') as 'x'|'y',angles:flat||amphitheater||voidField?[0,90]:topographical?[0,90]:[45,135],note:amphitheater||voidField?'0° OR ±90°':flat?'YZ 90° STEPS':topographical?'FINAL 90°':'45–135° · 45° INITIAL'}];
  renderer.setSize(120,205,false);const rules={yaw:0,level:0,supportZ:0,strokeWidth:.14,footTilt:0,armRoll:0,deviations:[],architectural:true};
  examples.forEach((example,k)=>{const px=x+15+k*285;ctx.fillStyle='#d6ad4f';ctx.font='bold 20px Arial';ctx.fillText(example.title,px+40,y+90);example.angles.forEach((angle,j)=>{const scene=new THREE.Scene(),geometry=architecturalLetterGeometry(example.letter,thickness,rules).clone(),rotation=new THREE.Euler(0,0,0);rotation[example.axis]=THREE.MathUtils.degToRad(angle);geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),span=Math.max(box.getSize(new THREE.Vector3()).length(),.001),aspect=120/205,camera=new THREE.OrthographicCamera(-span*aspect/1.5,span*aspect/1.5,span/1.5,-span/1.5,.001,span*20);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(span,-span,span*1.4));camera.lookAt(center);const material=new THREE.MeshStandardMaterial({color:'#eeeeea',side:THREE.DoubleSide,roughness:.65});scene.add(new THREE.Mesh(geometry,material));scene.add(new THREE.HemisphereLight(0xffffff,0x646b74,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,px+j*140,y+108,120,205);ctx.fillStyle='#d6ad4f';ctx.font='18px Arial';ctx.fillText(example.letter+'  '+angle+'°',px+30+j*140,y+330);geometry.dispose();material.dispose();});ctx.fillStyle='#d6ad4f';ctx.font='bold 16px Arial';ctx.fillText(example.note,px+30,y+365,245);});
 }else if(i===1&&placements.length){
  const order=sequence.length?sequence:placements.map((_,index)=>index);
  const columns=Math.min(6,order.length),rowCount=Math.ceil(order.length/columns),cellWidth=1130/columns,cellHeight=275/rowCount;
  const fontSize=Math.max(8,Math.min(15,cellHeight*.085));
  ctx.fillStyle='#d6ad4f';ctx.font='bold 18px Arial';ctx.fillText('RECORDED LETTER SEQUENCE AND PLACEMENT',x+25,y+87);
  renderer.setSize(Math.max(1,Math.floor(cellWidth)),Math.max(1,Math.floor(cellHeight*.60)),false);
  order.forEach((placementIndex,orderIndex)=>{
   const p=placements[placementIndex];if(!p)return;
   const px=x+20+(orderIndex%columns)*cellWidth,py=y+95+Math.floor(orderIndex/columns)*cellHeight;
   const local={...p,x:0,y:0,z:0};const geometry=architecturalLetterGeometry(p.letter,thickness,p.letterRules).clone().applyMatrix4(placementMatrix(local));geometry.computeBoundingBox();
   const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),span=Math.max(box.getSize(new THREE.Vector3()).length(),.001),imageHeight=Math.max(1,Math.floor(cellHeight*.60)),imageWidth=Math.max(1,Math.floor(cellWidth));
   const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial({color:'#eeeeea',side:THREE.DoubleSide,roughness:.65});scene.add(new THREE.Mesh(geometry,material));scene.add(new THREE.HemisphereLight(0xffffff,0x646b74,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);
   const aspect=imageWidth/imageHeight,camera=new THREE.OrthographicCamera(-span*aspect/1.5,span*aspect/1.5,span/1.5,-span/1.5,.001,span*20);
   camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(span,-span,span*1.4));camera.lookAt(center);renderer.render(scene,camera);const heights=placements.map(item=>item.z),minZ=Math.min(...heights),maxZ=Math.max(...heights),heightRatio=maxZ>minZ?(p.z-minZ)/(maxZ-minZ):0,maxScale=Math.max(...placements.map(item=>item.scale),.001),sizeRatio=Math.max(.25,p.scale/maxScale),drawHeight=imageHeight*.7*sizeRatio,drawWidth=imageWidth*.7*sizeRatio,drawY=py+imageHeight-drawHeight-heightRatio*imageHeight*.25;ctx.drawImage(renderer.domElement,px+(imageWidth-drawWidth)/2,drawY,drawWidth,drawHeight);
   ctx.fillStyle='#d6ad4f';ctx.font='bold '+fontSize+'px Arial';ctx.fillText((orderIndex+1)+'. '+p.letter,px+3,py+imageHeight+fontSize);
   ctx.fillStyle='#ffffff';ctx.font=fontSize+'px Arial';const line='Z '+p.z.toFixed(2)+' ft  S '+p.scale.toFixed(2);
   ctx.fillText(line,px+3,py+imageHeight+fontSize*2.1,cellWidth-5);
   const detail='Rx '+p.rx.toFixed(1)+'°  Ry '+p.ry.toFixed(1)+'°';ctx.fillText(detail,px+3,py+imageHeight+fontSize*3.2,cellWidth-5);
   ctx.fillText('Scale XYZ '+p.scaleX.toFixed(2)+' / '+p.scaleY.toFixed(2)+' / '+p.scaleZ.toFixed(2),px+3,py+imageHeight+fontSize*4.3,cellWidth-5);
   geometry.dispose();material.dispose();
  });
 }else if(stage.mesh.indices.length||stage.context?.indices.length||stage.lines?.length){
 renderer.setSize(1100,300,false);
 const scene=new THREE.Scene(),resources:{dispose:()=>void}[]=[],box=new THREE.Box3();
 const addMesh=(mesh:Mesh,ghost=false,wire=false)=>{if(!mesh.indices.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));geometry.setIndex(mesh.indices);geometry.computeVertexNormals();geometry.computeBoundingBox();if(geometry.boundingBox&&!(data.gatheringOperations&&i===5&&!ghost))box.union(geometry.boundingBox);const material=new THREE.MeshStandardMaterial({color:ghost?(i===3?'#1293c2':'#87abb8'):i===4?'#d6ad4f':'#eeeeea',roughness:.65,side:THREE.DoubleSide,transparent:ghost,opacity:ghost?(data.gatheringOperations&&i===5?.55:.18):1,depthWrite:!ghost,wireframe:wire});scene.add(new THREE.Mesh(geometry,material));resources.push(geometry,material);};
 if(stage.context)addMesh(stage.context,true);addMesh(stage.mesh,false,stage.wire);
 if(stage.lines?.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(stage.lines,3));geometry.computeBoundingBox();if(geometry.boundingBox)box.union(geometry.boundingBox);const material=new THREE.LineBasicMaterial({color:'#d8b96b'});scene.add(new THREE.LineSegments(geometry,material));resources.push(geometry,material);}
 scene.add(new THREE.HemisphereLight(0xffffff,0x646b74,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.length(),.001),aspect=1100/300,camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.001,span*20);camera.up.set(0,0,1);const opposite=typology.toLowerCase()==='vertical void lobby'?-1:1;camera.position.copy(center).add(i===5&&!data.gatheringOperations?new THREE.Vector3(-span*opposite,-span*opposite,span*Math.SQRT2):new THREE.Vector3(span*opposite,-span*opposite,span*1.4));camera.lookAt(center);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,x+30,y+75,1100,300);if(i===4){ctx.fillStyle='#d6ad4f';ctx.font='bold 20px Arial';ctx.fillText('GOLD: SHARED VOLUME',x+35,y+105);const overlaps=data.arrangement?.overlapFractions?.filter(Number.isFinite)??[];if(overlaps.length)ctx.fillText('MINIMUM VERIFIED: '+(Math.min(...overlaps)*100).toFixed(1)+'%',x+35,y+135);ctx.font='18px Arial';ctx.fillText('Recorded intersections before connections',x+35,y+165);}if(i===6&&editor){ctx.fillStyle='#d6ad4f';ctx.font='bold 19px Arial';ctx.fillText('SAVED FORM EDITOR ROTATION CHANGES',x+35,y+105);ctx.font='18px Arial';editor.rotations.map((rotation,index)=>({rotation,index})).filter(item=>item.rotation.some(value=>Math.abs(value)>1e-6)).slice(0,6).forEach((item,row)=>{const name=editor.base[item.index]?.letter??'Copy';ctx.fillText(name+' '+(item.index+1)+'  Δ X '+item.rotation[0]+'°  Y '+item.rotation[1]+'°  Z '+item.rotation[2]+'°',x+35,y+140+row*30,470);});}
 resources.forEach(resource=>resource.dispose());
 }else{ctx.fillStyle='#a0a5a9';ctx.font='24px Arial';ctx.fillText('No separate geometry for this step',x+30,y+220);}
 ctx.fillStyle='#ffffff';ctx.font='28px Arial';let line='',yy=y+425;for(const word of stage.caption.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>1160){ctx.fillText(line,x,yy);yy+=38;line=word;}else line=next;}if(line)ctx.fillText(line,x,yy);
 });}finally{renderer.dispose();renderer.forceContextLoss();}
 ctx.strokeStyle='#d6ad4f';ctx.beginPath();ctx.moveTo(100,1360);ctx.lineTo(5044,1360);ctx.stroke();
 ctx.fillStyle='#d6ad4f';ctx.font='bold 23px Arial';ctx.fillText('REPORTED GENERATION',100,1402);
 const report=[sentence(/^Minimum verified overlap:/i,''),sentence(/^\d+ level rises were reduced/i,''),sentence(/^\d+ mandatory bridges have rounded/i,'')].filter(Boolean).join('   /   ');
 ctx.fillStyle='#ffffff';ctx.font='22px Arial';ctx.fillText(report||'Generation results shown in the steps above.',650,1402,4390);
 ctx.fillStyle='#9ca5aa';ctx.font='19px Arial';ctx.fillText('Placement values describe the generated snapshot. Letter previews are independently scaled; rotation changes use XYZ Euler order.',100,1470);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create the graphic rules image.')),'image/png'));
}
export async function exportGraphicRules(data:ConnectionWorkflow,typology:string,id:string,bridgeLines:number[]=[],thickness=10,original:IntersectionPlacement[]=[]){
 const blob=await createGraphicRules(data,typology,bridgeLines,thickness,original);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id+'-graphic-rules.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
