import type { ConnectionWorkflow } from './letterIntersectionSpaces';
export async function readWorkflowProgress(response:Response,onProgress:(percent:number,label:string)=>void):Promise<ConnectionWorkflow>{
 if(!response.ok)throw new Error(await response.text());
 if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return response.json();
 if(!response.body)throw new Error('Generation response was empty.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result:ConnectionWorkflow|undefined;
 const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw new Error(event.message);if(event.type==='progress')onProgress(event.percent,event.label);if(event.type==='result')result=event.data;};
 try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});let newline:number;while((newline=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}if(done)break;}consume(buffer);}
 finally{reader.releaseLock();}
 if(!result)throw new Error('Generation ended before the model was ready.');
 return result;
}
