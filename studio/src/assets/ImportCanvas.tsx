import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {ArtworkIR} from '../editor/contracts';
import type {ArtworkClient} from '../artwork/ArtworkClient';
import {ArtworkCanvas} from '../artwork/ArtworkCanvas';
import {brushMask,rectangleMask,moveBounds,resizeBounds,type Point} from './mask';

export type Placement={url:string;width:number;height:number;sourceBox:number[];fit:boolean}|null;
type Tool='place'|'rectangle'|'brush'|'erase';
type Gesture={id:number;start:Point;last:Point;bounds:number[];mask:Uint8Array;corner:number|null;tool:Tool};
export function ImportCanvas({ir,client,bounds,onBounds,mask,onMask,placement,replaceId,disabled,onGesture}:{
  ir:ArtworkIR;client:ArtworkClient;bounds:number[];onBounds:(value:number[])=>void;
  mask:Uint8Array;onMask:(value:Uint8Array)=>void;placement:Placement;replaceId:string|null;disabled:boolean;onGesture:(active:boolean)=>void;
}){
  const {width,height}=ir.canvas,svg=useRef<SVGSVGElement>(null),overlay=useRef<HTMLCanvasElement>(null),gesture=useRef<Gesture|null>(null);
  const validBounds=bounds.every(Number.isFinite)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<=width&&bounds[3]<=height&&bounds[2]>bounds[0]&&bounds[3]>bounds[1];
  const [tool,setTool]=useState<Tool>('place'),[diameter,setDiameter]=useState(40),[version,setVersion]=useState(0),[rect,setRect]=useState<number[]|null>(null);
  const base=replaceId?{...ir,parts:ir.parts.map(part=>part.id===replaceId?{...part,appearance:{...part.appearance,opacity:part.appearance?.opacity??255,visible:false}}:part)}:ir;
  const target=ir.parts.find(part=>part.id===replaceId),targetBox=target?.geometry.bbox;
  const working=useRef(mask);if(!gesture.current)working.current=mask;
  useEffect(()=>{
    const node=overlay.current;if(!node)return;const scale=Math.min(1,1024/Math.max(width,height));
    node.width=Math.max(1,Math.round(width*scale));node.height=Math.max(1,Math.round(height*scale));
    const ctx=node.getContext('2d');if(!ctx)return;const image=ctx.createImageData(node.width,node.height);
    for(let y=0;y<node.height;y++)for(let x=0;x<node.width;x++){
      const i=(y*node.width+x)*4,enabled=working.current[Math.min(height-1,Math.floor((y+.5)*height/node.height))*width+Math.min(width-1,Math.floor((x+.5)*width/node.width))]===255;
      image.data.set(enabled?[16,190,140,85]:[28,42,65,45],i);
    }
    ctx.putImageData(image,0,0);
  },[mask,version,width,height]);
  function point(event:PointerEvent):Point{
    const matrix=svg.current?.getScreenCTM();if(!matrix)return [0,0];
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return [Math.max(0,Math.min(width,p.x)),Math.max(0,Math.min(height,p.y))];
  }
  function start(event:PointerEvent,corner:number|null=null){
    if(disabled||gesture.current||event.button!==0||(tool==='place'&&!validBounds))return;event.preventDefault();event.stopPropagation();
    const p=point(event);gesture.current={id:event.pointerId,start:p,last:p,bounds:[...bounds],mask,corner,tool};
    onGesture(true);
    svg.current?.setPointerCapture(event.pointerId);
    if(tool==='brush'||tool==='erase'){working.current=mask.slice();brushMask(working.current,width,height,p,p,diameter/2,tool==='brush');setVersion(v=>v+1);}
  }
  function move(event:PointerEvent){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;const p=point(event);
    if(g.tool==='place')onBounds(g.corner===null?moveBounds(g.bounds,p[0]-g.start[0],p[1]-g.start[1],width,height):resizeBounds(g.bounds,g.corner,p,width,height));
    else if(g.tool==='rectangle')setRect([Math.min(p[0],g.start[0]),Math.min(p[1],g.start[1]),Math.max(p[0],g.start[0]),Math.max(p[1],g.start[1])]);
    else{brushMask(working.current,width,height,g.last,p,diameter/2,g.tool==='brush');setVersion(v=>v+1);}
    g.last=p;
  }
  function finish(event:PointerEvent,cancel=false){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    // Include the final pointer even if the browser coalesced its last move.
    if(!cancel)move(event);gesture.current=null;
    if(cancel){working.current=g.mask;if(g.tool==='place')onBounds(g.bounds);}
    else if(g.tool==='rectangle'){
      const p=point(event),next=g.mask.slice();rectangleMask(next,width,height,[Math.min(g.start[0],p[0]),Math.min(g.start[1],p[1]),Math.max(g.start[0],p[0]),Math.max(g.start[1],p[1])],true);working.current=next;onMask(next);
    }else if(g.tool==='brush'||g.tool==='erase')onMask(working.current);
    setRect(null);setVersion(v=>v+1);onGesture(false);if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);
  }
  const [l,t,r,b]=validBounds?bounds:[0,0,width,height],corners=[[l,t],[r,t],[r,b],[l,b]],radius=Math.max(width,height)/100;
  let destination=[l,t,r,b];
  if(placement?.fit){const [sl,st,sr,sb]=placement.sourceBox,s=Math.min((r-l)/(sr-sl),(b-t)/(sb-st));const w=(sr-sl)*s,h=(sb-st)*s;destination=[l+((r-l)-w)/2,t+((b-t)-h)/2,l+((r-l)+w)/2,t+((b-t)+h)/2];}
  return <section className="import-stage" aria-label="素材放置与可编辑区"><div className="import-tools" role="group" aria-label="素材画布工具">
    {([['place','放置/缩放'],['rectangle','矩形可编辑区'],['brush','画笔可编辑区'],['erase','恢复保护区']] as const).map(([value,label])=><button type="button" disabled={disabled} key={value} aria-pressed={tool===value} onClick={()=>setTool(value)}>{label}</button>)}
    <label>画笔直径 <input aria-label="mask 画笔直径" disabled={disabled} type="number" min={1} max={Math.max(width,height)} value={diameter} onChange={event=>setDiameter(Math.max(1,Math.min(Math.max(width,height),event.target.valueAsNumber||1)))}/></label>
  </div><p>绿色为可编辑区，其余受保护。默认全图保护；可用矩形或画笔开放局部。放置示意使用浏览器缩放，最终像素与保护区检查以预检结果为准。</p>
    <div className="checker import-artboard"><svg ref={svg} viewBox={`0 0 ${width} ${height}`} aria-label="素材放置画布" onPointerDown={event=>{if(tool!=='place')start(event);}} onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}>
      <ArtworkCanvas ir={base} client={client} source="saved"/>
      {targetBox&&<rect x={targetBox[0]} y={targetBox[1]} width={targetBox[2]-targetBox[0]} height={targetBox[3]-targetBox[1]} fill="none" stroke="#f19b28" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      {placement&&validBounds&&<svg x={destination[0]} y={destination[1]} width={destination[2]-destination[0]} height={destination[3]-destination[1]} viewBox={`${placement.sourceBox[0]} ${placement.sourceBox[1]} ${placement.sourceBox[2]-placement.sourceBox[0]} ${placement.sourceBox[3]-placement.sourceBox[1]}`} preserveAspectRatio="none" overflow="hidden" opacity={(target?.appearance?.opacity??255)/255} pointerEvents="none"><image href={placement.url} width={placement.width} height={placement.height}/></svg>}
      <foreignObject x={0} y={0} width={width} height={height} pointerEvents="none"><canvas className="mask-overlay" ref={overlay} aria-label="可编辑区示意"/></foreignObject>
      {validBounds&&<rect data-handle="placement" x={l} y={t} width={r-l} height={b-t} fill="transparent" stroke="#0864ff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents={tool==='place'?'all':'none'} onPointerDown={event=>start(event)}/>}
      {tool==='place'&&validBounds&&corners.map(([x,y],i)=><circle key={i} data-handle={`placement-${i}`} aria-label={`素材缩放角 ${i+1}`} cx={x} cy={y} r={radius} fill="#0864ff" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={event=>start(event,i)}/>)}
      {rect&&<rect x={rect[0]} y={rect[1]} width={rect[2]-rect[0]} height={rect[3]-rect[1]} fill="rgba(16,190,140,.4)" stroke="#10be8c" pointerEvents="none"/>}
    </svg></div></section>;
}
