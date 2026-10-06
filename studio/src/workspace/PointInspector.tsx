import type { useArtworkEditing } from './useArtworkEditing';
import { SemanticInspector } from './SemanticInspector';
import { assetUrl } from '../project/paths';
export function PointInspector({editing}:{editing:ReturnType<typeof useArtworkEditing>}){
  const {part,canvasLocked,currentPoint,active,setActive,changePoint,landmarkName,setLandmarkName}=editing;
  const provenance=part?.provenance as {source?:string;description?:string;prompt?:string;upstreamHash?:string}|undefined;
  return <><div className="inspector"><span className="muted">已选图层</span>{part && <><img src={assetUrl(part.asset.path)} alt=""/><strong>{part.name}</strong></>}
          <label>X <input aria-label="顶点 X" type="number" step="0.01" disabled={canvasLocked || !currentPoint} value={currentPoint?.[0] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [e.target.valueAsNumber, currentPoint[1]]); }}/></label>
          <label>Y <input aria-label="顶点 Y" type="number" step="0.01" disabled={canvasLocked || !currentPoint} value={currentPoint?.[1] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [currentPoint[0], e.target.valueAsNumber]); }}/></label>
        </div><SemanticInspector/>
        {provenance&&<details className="landmark-editor"><summary>素材来源</summary><p>{({manual:'手绘/人工制作',external:'外部素材',imagegen:'AI 生成','psd-import':'PSD 导入'} as Record<string,string>)[provenance.source||'']||provenance.source}</p>{provenance.description&&<p>{provenance.description}</p>}{provenance.prompt&&<p>AI 提示词：{provenance.prompt}</p>}{provenance.upstreamHash&&<p className="asset-hash">原图 SHA-256：{provenance.upstreamHash}</p>}</details>}
        <details className="landmark-editor"><summary>关键点注记</summary><p>关键点保存到 IR；重建时不驱动绑定。拖动蓝色顶点可裁切图层。</p><div><input aria-label="关键点名称" placeholder="例如 iris_center" value={landmarkName} onChange={e => setLandmarkName(e.target.value)}/><button disabled={canvasLocked || !part || !landmarkName.trim()} onClick={() => {
          if (!part) return;
          const name = landmarkName.trim();
          const [l, t, r, b] = part.geometry.bbox;
          if (changePoint({ kind: 'landmark', name }, [(l + r) / 2, (t + b) / 2])) { setActive({ kind: 'landmark', name }); setLandmarkName(''); }
        }}>添加关键点</button></div></details></>;
}
