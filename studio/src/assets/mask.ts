import { dimensions, type RasterAsset } from '../artwork/contracts';

export type Point = [number, number];
export function blankMask(width: number, height: number): Uint8Array {
  dimensions(width, height); return new Uint8Array(width * height);
}
export function maskFromPixels(image: RasterAsset, width: number, height: number): Uint8Array {
  if(image.width!==width||image.height!==height)throw new Error('mask 尺寸必须与画布一致');
  const mask=blankMask(width,height);
  for(let i=0;i<mask.length;i++){
    const offset=i*4,value=image.data[offset];
    if((value!==0&&value!==255)||image.data[offset+1]!==value||image.data[offset+2]!==value||image.data[offset+3]!==255)
      throw new Error('mask 必须为不透明的二值灰度图，0 保护、255 可编辑');
    mask[i]=value;
  }
  return mask;
}
export function rectangleMask(mask:Uint8Array,width:number,height:number,bounds:number[],editable:boolean):void{
  const [l,t,r,b]=bounds.map(Math.round),value=editable?255:0;
  for(let y=Math.max(0,t);y<Math.min(height,b);y++)mask.fill(value,y*width+Math.max(0,l),y*width+Math.min(width,r));
}
/** A continuous capsule sampled at pixel centres, without antialiasing or gaps between events. */
export function brushMask(mask:Uint8Array,width:number,height:number,from:Point,to:Point,radius:number,editable:boolean):void{
  const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy,value=editable?255:0;
  for(let y=Math.max(0,Math.floor(Math.min(from[1],to[1])-radius));y<Math.min(height,Math.ceil(Math.max(from[1],to[1])+radius));y++){
    for(let x=Math.max(0,Math.floor(Math.min(from[0],to[0])-radius));x<Math.min(width,Math.ceil(Math.max(from[0],to[0])+radius));x++){
      const u=length?Math.max(0,Math.min(1,((x+.5-from[0])*dx+(y+.5-from[1])*dy)/length)):0;
      if((x+.5-from[0]-u*dx)**2+(y+.5-from[1]-u*dy)**2<=radius*radius)mask[y*width+x]=value;
    }
  }
}
export function moveBounds(bounds:number[],dx:number,dy:number,width:number,height:number):number[]{
  const x=Math.round(Math.max(-bounds[0],Math.min(width-bounds[2],dx))),y=Math.round(Math.max(-bounds[1],Math.min(height-bounds[3],dy)));
  return [bounds[0]+x,bounds[1]+y,bounds[2]+x,bounds[3]+y];
}
export function resizeBounds(bounds:number[],corner:number,point:Point,width:number,height:number):number[]{
  const next=[...bounds],left=corner===0||corner===3,top=corner===0||corner===1;
  next[left?0:2]=Math.round(Math.max(left?0:bounds[0]+1,Math.min(left?bounds[2]-1:width,point[0])));
  next[top?1:3]=Math.round(Math.max(top?0:bounds[1]+1,Math.min(top?bounds[3]-1:height,point[1])));
  return next;
}
export function alphaBounds(image:RasterAsset,crop:number[]=[0,0,image.width,image.height]):number[]|null{
  const [l,t,r,b]=crop;let left=r,top=b,right=l,bottom=t;
  if(!crop.every(Number.isInteger)||l<0||t<0||r>image.width||b>image.height||r<=l||b<=t)return null;
  for(let y=t;y<b;y++)for(let x=l;x<r;x++)if(image.data[(y*image.width+x)*4+3]){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  return right>left?[left,top,right,bottom]:null;
}
