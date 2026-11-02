import { DEFAULT_FACE_BRIDGES, typologyBridgeSettings, type FaceBridgeSettings } from "@/components/faceBridges";
import { TYPOLOGY_RULES } from "@/components/amphitheaterPrototype";
import { NextResponse } from "next/server";
import { DEFAULT_GATHERING_OPERATIONS, defaultGatheringBoundaryRoles, type GatheringOperations } from "@/components/gatheringOperations";
import { DEFAULT_GATHERING_ANGLES, type GatheringAngleLimits } from "@/components/typologyLetterArrangement";
import { buildConnectionWorkflow, buildBridgeSpaceMesh, buildArchitecturalSpaceMesh, buildLetterIntersectionSpaces, type ArchitecturalSpaceBehaviors, type ArchitecturalSpaceMode, type IntersectionPlacement } from "@/components/letterIntersectionSpaces";
import type { Letter } from "@/components/letterTypes";

export const runtime = "nodejs";

const LETTERS = new Set<Letter>(["V", "U", "L"]);

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function validPlacement(value: unknown): value is IntersectionPlacement {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<IntersectionPlacement>;
  return LETTERS.has(item.letter as Letter)
    && finite(item.x) && finite(item.y) && finite(item.z)
    && finite(item.rx) && finite(item.ry) && finite(item.rz)
    && finite(item.scale) && finite(item.scaleX) && finite(item.scaleY) && finite(item.scaleZ);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as { thickness?: unknown; placements?: unknown; mode?: unknown; behaviors?: unknown; faceBridges?: Partial<FaceBridgeSettings>; typology?: string; workflow?: boolean; gatheringAngles?: unknown; gatheringOperations?: unknown };
  if (!finite(payload.thickness) || (payload.thickness as number) <= 0) {
    return NextResponse.json({ error: "Thickness must be greater than 0." }, { status: 400 });
  }
  if (!Array.isArray(payload.placements) || payload.placements.length > 240 || !payload.placements.every(validPlacement)) {
    return NextResponse.json({ error: "Placements must be a list of original letter transforms." }, { status: 400 });
  }
  let gatheringAngles:GatheringAngleLimits=DEFAULT_GATHERING_ANGLES;
  if(payload.gatheringAngles!==undefined){
   if(!payload.gatheringAngles||typeof payload.gatheringAngles!=="object")return NextResponse.json({error:"Invalid gathering rotation limits."},{status:400});
   const limits=payload.gatheringAngles as GatheringAngleLimits;
   if(!(['xMin','xMax','yMin','yMax','zMin','zMax'] as const).every(key=>finite(limits[key]))||limits.xMin < -180||limits.xMax > 180||limits.yMin < -180||limits.yMax > 180||limits.zMin < 0||limits.zMax > 360||limits.xMin>limits.xMax||limits.yMin>limits.yMax||limits.zMin>limits.zMax)return NextResponse.json({error:"Rotation limits must be ordered and within X/Y −180° to 180° and Z 0° to 360°."},{status:400});
   gatheringAngles=limits;
  }
  let gatheringOperations:GatheringOperations={...DEFAULT_GATHERING_OPERATIONS,boundaryRoles:defaultGatheringBoundaryRoles(payload.typology??'')};
  if(payload.gatheringOperations!==undefined){
   if(!payload.gatheringOperations||typeof payload.gatheringOperations!=="object")return NextResponse.json({error:"Invalid gathering operation settings."},{status:400});
   const raw=payload.gatheringOperations as Partial<GatheringOperations>;
   const c:GatheringOperations={...DEFAULT_GATHERING_OPERATIONS,...raw,boundaryRoles:raw.boundaryRoles??defaultGatheringBoundaryRoles(payload.typology??'')};
   const staggerMin=payload.typology==='stepped-amphitheater'||payload.typology==='linear-edge-gallery'?15:payload.typology==='void-field-gathering'||payload.typology==='inserted-horizontal-plate'?10:0;
   const staggerMax=payload.typology==='stepped-amphitheater'?40:payload.typology==='void-field-gathering'?30:payload.typology==='inserted-horizontal-plate'?25:payload.typology==='linear-edge-gallery'?35:payload.typology==='contained-room-within-volume'?15:100;
   const secondaryBoundary=['stepped-amphitheater','void-field-gathering','inserted-horizontal-plate','contained-room-within-volume','linear-edge-gallery'].includes(payload.typology??'');
   if(!(['levelRise','staggerPercent','staggerDirection','boundaryRotation','alcoveDepthPercent','alcoveWidthPercent','protectedVoidRadius','protectedVoidOffsetX','protectedVoidOffsetY','minimumClearance'] as const).every(k=>finite(c[k]))||c.levelRise<0||c.staggerPercent<staggerMin||c.staggerPercent>staggerMax||Math.abs(c.staggerDirection)>360||Math.abs(c.boundaryRotation)>180||c.alcoveDepthPercent<(payload.typology==='stepped-amphitheater'?15:0)||c.alcoveDepthPercent>(payload.typology==='stepped-amphitheater'?35:100)||c.alcoveWidthPercent<=0||c.alcoveWidthPercent>100||c.protectedVoidRadius<0||c.minimumClearance<0||typeof c.requireConnectivity!=="boolean")return NextResponse.json({error:"Invalid gathering operation values."},{status:400});
   if(!c.boundaryRoles||!(['L','U','V'] as const).every(letter=>['floor','wall','edge','enclosure','void'].includes(c.boundaryRoles[letter])))return NextResponse.json({error:'Invalid letter boundary designation.'},{status:400});
   const boundaryStep=secondaryBoundary?15:90;
   if((secondaryBoundary&&Math.abs(c.boundaryRotation)>15)||Math.abs(c.boundaryRotation/boundaryStep-Math.round(c.boundaryRotation/boundaryStep))>1e-8)return NextResponse.json({error:"Boundary rotation is outside the selected typology’s allowed increments."},{status:400});
   gatheringOperations=c;
  }
  const modes = new Set<ArchitecturalSpaceMode>(["letters", "voids", "combined"]);
  const mode = payload.mode === undefined ? undefined : modes.has(payload.mode as ArchitecturalSpaceMode) ? payload.mode as ArchitecturalSpaceMode : null;
  if (mode === null) return NextResponse.json({ error: "Mode must be letters, voids, or combined." }, { status: 400 });
  const behaviorSource = payload.behaviors && typeof payload.behaviors === "object" ? payload.behaviors as Partial<ArchitecturalSpaceBehaviors> : undefined;
  try {
    if (payload.faceBridges) {
      const rule=TYPOLOGY_RULES.find(r=>r.id===payload.typology);
      if(!rule)return NextResponse.json({error:"Unknown bridge typology."},{status:400});
      const base={...DEFAULT_FACE_BRIDGES,...payload.faceBridges};
      for(const key of ["gridDivisions","maxDistance","width","thickness","curvature","smoothness","maxConnections"] as const)if(!finite(base[key]))return NextResponse.json({error:"Invalid bridge settings."},{status:400});
      if(payload.workflow){
       const placements=payload.placements,thickness=payload.thickness as number,settings=typologyBridgeSettings(base,rule.behaviors);
       if(request.headers.get("accept")?.includes("application/x-ndjson")){
        const encoder=new TextEncoder();let cancelled=false;
        const stream=new ReadableStream({
         start(controller){
          const send=(event:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(event)+"\n"));};
          void (async()=>{
           try{
            const data=await buildConnectionWorkflow(placements,thickness,settings,rule.id,async(percent,label)=>{
             if(cancelled||request.signal.aborted)throw new Error("Generation cancelled");
             send({type:"progress",percent:Math.round(percent),label});
             await new Promise(resolve=>setTimeout(resolve,0));
            },gatheringAngles,gatheringOperations);
            send({type:"result",data});
           }catch(error){send({type:"error",message:error instanceof Error?error.message:"Generation failed"});}
           finally{if(!cancelled)controller.close();}
          })();
         },cancel(){cancelled=true;}
        });
        return new Response(stream,{headers:{"Content-Type":"application/x-ndjson","Cache-Control":"no-store","X-Accel-Buffering":"no"}});
       }
       return NextResponse.json(await buildConnectionWorkflow(placements,thickness,settings,rule.id,undefined,gatheringAngles,gatheringOperations));
      }
      const mesh=await buildBridgeSpaceMesh(payload.placements,payload.thickness as number,mode??"combined",typologyBridgeSettings(base,rule.behaviors));
      return NextResponse.json(mesh);
    }
    const mesh = mode
      ? await buildArchitecturalSpaceMesh(payload.placements, payload.thickness as number, mode, behaviorSource)
      : await buildLetterIntersectionSpaces(payload.placements, payload.thickness as number);
    return NextResponse.json(mesh);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intersection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

