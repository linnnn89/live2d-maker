import { ArtworkRenderer } from './ArtworkRenderer';
import { AssetCache, fetchAsset } from './AssetCache';
import { encodeFrame } from './png';
import type { ArtworkIR } from '../editor/contracts';
import { ArtworkError } from './contracts';
import { MemoryBudget } from './MemoryBudget';
import { checkCancelled } from './content';
import { errorDetail } from '../protocol';

type Job = { id: number; kind: 'render' | 'capture' | 'cancel' | 'ack'; ir: ArtworkIR };
const memory=new MemoryBudget(), renderer=new ArtworkRenderer(new AssetCache(fetchAsset,memory).acquire,memory);
let active: {id:number;controller:AbortController}|null=null;
const outbound=new Map<number,()=>void>();
const sendError=(id:number,error:unknown)=>postMessage({id,ok:false,metrics:renderer.stats,error:errorDetail(error,'RENDER_FAILED','artwork')});

onmessage=(event:MessageEvent<Job>)=>{
  const job=event.data;
  if(job.kind==='ack'){outbound.get(job.id)?.();outbound.delete(job.id);return;}
  if(job.kind==='cancel'){if(active?.id===job.id)active.controller.abort();return;}
  if(active){sendError(job.id,new ArtworkError('BACKEND_BUSY','美术合成正在执行'));return;}
  const controller=new AbortController();active={id:job.id,controller};
  void (async()=>{
    let image:Awaited<ReturnType<ArtworkRenderer['acquire']>>|undefined;
    let workspace:ReturnType<MemoryBudget['reserve']>|undefined;
    try{
      image=await renderer.acquire(job.ir,controller.signal);
      workspace=memory.reserve(image.frame.data.byteLength*(job.kind==='capture'?12:2)+1024*1024);
      checkCancelled(controller.signal);
      const frame=image.frame;
      const value=job.kind==='capture'?{width:frame.width,height:frame.height,bounds:frame.bounds,dataUrl:encodeFrame(frame)}:frame;
      checkCancelled(controller.signal);
      const ownedImage=image,ownedWorkspace=workspace;
      outbound.set(job.id,()=>{ownedImage.release();ownedWorkspace.release();});image=undefined;workspace=undefined;
      if(job.kind==='capture')postMessage({id:job.id,ok:true,value,metrics:renderer.stats});
      else postMessage({id:job.id,ok:true,value,metrics:renderer.stats},{transfer:[frame.data.buffer]});
    }catch(error){outbound.get(job.id)?.();outbound.delete(job.id);sendError(job.id,error);}
    finally{image?.release();workspace?.release();active=null;}
  })();
};
