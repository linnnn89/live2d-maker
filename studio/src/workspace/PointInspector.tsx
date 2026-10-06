import type { useArtworkEditing } from './useArtworkEditing';
import { SemanticInspector } from './SemanticInspector';
export function PointInspector({editing}:{editing:ReturnType<typeof useArtworkEditing>}){
  const {part,canvasLocked,currentPoint,active,setActive,changePoint,landmarkName,setLandmarkName}=editing;
  return <><div className="inspector"><span className="muted">已选图层</span>{part && <><img src={'/studio-files/' + part.asset.path} alt=""/><strong>{part.name}</strong></>}
          <label>X <input aria-label="顶点 X" type="number" step="0.01" disabled={canvasLocked || !currentPoint} value={currentPoint?.[0] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [e.target.valueAsNumber, currentPoint[1]]); }}/></label>
          <label>Y <input aria-label="顶点 Y" type="number" step="0.01" disabled={canvasLocked || !currentPoint} value={currentPoint?.[1] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [currentPoint[0], e.target.valueAsNumber]); }}/></label>
        </div><SemanticInspector/>
        <details className="landmark-editor"><summary>关键点注记</summary><p>关键点保存到 IR；重建时不驱动绑定。拖动蓝色顶点可裁切图层。</p><div><input aria-label="关键点名称" placeholder="例如 iris_center" value={landmarkName} onChange={e => setLandmarkName(e.target.value)}/><button disabled={canvasLocked || !part || !landmarkName.trim()} onClick={() => {
          if (!part) return;
          const name = landmarkName.trim();
          const [l, t, r, b] = part.geometry.bbox;
          if (changePoint({ kind: 'landmark', name }, [(l + r) / 2, (t + b) / 2])) { setActive({ kind: 'landmark', name }); setLandmarkName(''); }
        }}>添加关键点</button></div></details></>;
}
