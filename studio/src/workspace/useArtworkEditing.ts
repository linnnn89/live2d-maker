import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useWorkspace } from './WorkspaceContext';
import type { Point,EditCommand } from '../editor/contracts';
import type { ArtworkSource } from '../artwork/ArtworkCanvas';
import { captureArtwork } from '../artwork/capture';
export type Handle={kind:'polygon';index:number}|{kind:'landmark';name:string};
export function useArtworkEditing(){
  const {saved,ir,editor,draft,artwork,editingLocked,selected,edit,setMessage,setError}=useWorkspace();
  const [artworkSource,setArtworkSource]=useState<ArtworkSource>('draft'),[focused,setFocused]=useState(false);
  const [active,setActive]=useState<Handle|null>(null),[landmarkName,setLandmarkName]=useState('');
  const drawing=useRef<SVGSVGElement>(null),drag=useRef<{handle:Handle;partId:string;pointerId:number}|null>(null);
  const part=ir?.parts.find(p=>p.id===selected);
  const polygon=part?.geometry.polygon||(part?[[part.geometry.bbox[0],part.geometry.bbox[1]],[part.geometry.bbox[2],part.geometry.bbox[1]],[part.geometry.bbox[2],part.geometry.bbox[3]],[part.geometry.bbox[0],part.geometry.bbox[3]]] as Point[]:[]);
  const canvasLocked=editingLocked||artworkSource!=='draft';
  useEffect(()=>setActive(null),[selected,draft?.draftId]);
  async function downloadArtwork() {
    const state = editor.getSnapshot();
    if (!state || artworkSource === 'reference') return;
    const result = await captureArtwork({ schemaVersion: 1, state, source: artworkSource }, editor.getSnapshot, editor.getBase, ir => artwork.capture(ir));
    if (!result.ok) { setError(result.error.message); return; }
    const link = document.createElement('a');
    link.href = result.image.dataUrl;
    link.download = `artwork-${result.image.source}-${result.image.draftId}-${result.image.revision}.png`;
    link.click(); setError(''); setMessage('美术 PNG 已导出');
  }
  function pointCommand(handle: Handle, point: Point, partId = selected): EditCommand {
    const target = editor.getSnapshot()!.ir.parts.find(p => p.id === partId)!;
    const [l, t, r, b] = target.geometry.bbox;
    const points = target.geometry.polygon || [[l, t], [r, t], [r, b], [l, b]] as Point[];
    return handle.kind === 'polygon'
      ? { type: 'set_polygon', partId, points: points.map((v, i) => i === handle.index ? point : v) }
      : { type: 'set_landmark', partId, name: handle.name, point };
  }
  function changePoint(handle: Handle, point: Point) { return edit([pointCommand(handle, point)]); }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const target = editor.getSnapshot()?.ir.parts.find(p => p.id === drag.current!.partId);
    const matrix = drawing.current?.getScreenCTM();
    if (!matrix || !target) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const [l, t, r, b] = target.geometry.bbox;
    const position: Point = [Math.round(Math.max(l, Math.min(r, point.x)) * 100) / 100, Math.round(Math.max(t, Math.min(b, point.y)) * 100) / 100];
    try { editor.updateGesture([pointCommand(drag.current.handle, position, drag.current.partId)]); }
    catch (e) { finishGesture(true); setError(e instanceof Error ? e.message : String(e)); }
  }
  function finishGesture(cancel: boolean, pointerId?: number) {
    if (!drag.current || (pointerId !== undefined && drag.current.pointerId !== pointerId)) return;
    drag.current = null; editor.endGesture(cancel);
  }
  function start(event: PointerEvent<SVGCircleElement>, handle: Handle) {
    if (canvasLocked || !part) return;
    event.preventDefault();
    try {
      editor.beginGesture(); drag.current = { handle, partId: part.id, pointerId: event.pointerId }; setActive(handle); setMessage(''); setError('');
      drawing.current?.setPointerCapture(event.pointerId);
    } catch (e) { finishGesture(true); setError(e instanceof Error ? e.message : String(e)); }
  }
  const currentPoint = active?.kind === 'polygon' ? polygon[active.index] : active?.kind === 'landmark' ? part?.geometry.landmarks?.[active.name] : null;
  let viewBox = ir ? `0 0 ${ir.canvas.width} ${ir.canvas.height}` : '0 0 1280 1280';
  let viewWidth = ir?.canvas.width || 1280;
  if (saved?.artworkBounds) {
    const [l, t, r, b] = saved.artworkBounds;
    const pad = Math.max(r - l, b - t) * 0.025;
    viewWidth = r - l + 2 * pad;
    viewBox = `${l - pad} ${t - pad} ${viewWidth} ${b - t + 2 * pad}`;
  }
  if (focused && part) {
    const [l, t, r, b] = part.geometry.bbox;
    const pad = Math.max(r - l, b - t) * 0.15;
    viewWidth = r - l + 2 * pad;
    viewBox = `${l - pad} ${t - pad} ${viewWidth} ${b - t + 2 * pad}`;
  }
  return {artworkSource,setArtworkSource,focused,setFocused,active,setActive,landmarkName,setLandmarkName,
    drawing,part,polygon,canvasLocked,currentPoint,viewBox,viewWidth,downloadArtwork,changePoint,move,finishGesture,start};
}
