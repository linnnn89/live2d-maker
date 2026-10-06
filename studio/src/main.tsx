import React, { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { api, ApiError } from './api';
import { ImportGenerated } from './ImportGenerated';
import { useModelPreview } from './viewer/useModelPreview';
import type { Parameter } from './viewer/ViewerAdapter';

type Point = [number, number];
type Bounds = [number, number, number, number];
type Part = {
  id: string; name: string; z: number;
  asset: { path: string; offset: { left: number; top: number }; size: { width: number; height: number } };
  geometry: { bbox: [number, number, number, number]; polygon?: Point[]; landmarks?: Record<string, Point> };
  appearance?: { visible: boolean; opacity: number };
  semantic: { tag: string; side: string };
};
type IR = { canvas: { width: number; height: number }; parts: Part[]; metadata?: { name?: string } };
type Snapshot = {
  ir: IR; revision: string; sourceImage: string; artworkImage?: string; sourceBounds: Bounds | null; artworkBounds: Bounds | null; stale: Record<string, boolean>;
  overlay: { status: string; reasons: string[] };
  build: null | { modelUrl: string; modelBounds: Bounds | null; revision: string; modelSha256: string; labelCount: number; warnings: string[] };
  qa: null | { status: string; contactSheet: string; reviewUrl: string; revision: string; poses: number };
};
type Handle = { kind: 'polygon'; index: number } | { kind: 'landmark'; name: string };

function Icon({ name }: { name: 'save' | 'rebuild' | 'play' | 'search' | 'eye' | 'full' | 'focus' }) {
  const paths = {
    save: <><path d="M4 3h13l3 3v15H4z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/></>,
    rebuild: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/></>,
    play: <path d="m7 3 13 9-13 9z"/>, search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
    full: <path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>,
    focus: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="4"/></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [ir, setIr] = useState<IR | null>(null);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<Handle | null>(null);
  const [busy, setBusy] = useState('正在打开工作区…');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [landmarkName, setLandmarkName] = useState('');
  const [showQa, setShowQa] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [openAttempt, setOpenAttempt] = useState(0);
  const drawing = useRef<SVGSVGElement>(null);
  const drag = useRef<Handle | null>(null);
  const dirty = !!(saved && ir && JSON.stringify(ir) !== JSON.stringify(saved.ir));
  const part = ir?.parts.find(p => p.id === selected);
  const polygon = part?.geometry.polygon || (part ? [[part.geometry.bbox[0], part.geometry.bbox[1]], [part.geometry.bbox[2], part.geometry.bbox[1]], [part.geometry.bbox[2], part.geometry.bbox[3]], [part.geometry.bbox[0], part.geometry.bbox[3]]] as Point[] : []);
  const modelUrl = saved?.build?.modelUrl;
  const { attachFrame, onLoad, parameters, previewStatus, setParameter, reset } = useModelPreview(modelUrl, saved?.build?.modelBounds, !!saved);
  const apply = (snapshot: Snapshot) => { setSaved(snapshot); setIr(snapshot.ir); };

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();
    async function open() {
      setError(''); setBusy('正在打开工作区…');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await api<Snapshot>('open', undefined, controller.signal);
          if (cancelled) return;
          apply(result);
          setSelected(result.ir.parts.find(p => p.semantic.tag === 'FACE')?.id || result.ir.parts[0]?.id || '');
          setBusy(''); return;
        } catch (e) {
          if (cancelled) return;
          if (e instanceof ApiError && e.status === 409 && attempt < 2) {
            setBusy(`工作区忙，正在重试（${attempt + 1}/2）…`);
            await new Promise<void>(resolve => { timer = window.setTimeout(resolve, (attempt + 1) * 1000); });
            if (cancelled) return;
          } else {
            setError(e instanceof Error ? e.message : String(e)); setBusy(''); return;
          }
        }
      }
    }
    void open();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [openAttempt]);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);

  async function action(route: 'save' | 'rebuild' | 'qa') {
    if (!saved || !ir || busy) return;
    setBusy(route === 'save' ? '正在保存 IR…' : route === 'rebuild' ? '正在重建 PSD / moc3…' : '正在渲染 Pose QA…');
    setError(''); setMessage('');
    let gateAttempted = false;
    try {
      let current = saved;
      if (dirty) { current = await api<Snapshot>('save', { revision: saved.revision, ir }); apply(current); }
      if (route !== 'save') { gateAttempted = true; current = await api<Snapshot>(route); apply(current); }
      setMessage(route === 'save' ? 'IR 已保存' : route === 'rebuild' ? '重建完成，预览已刷新' : `Pose QA 完成 · ${current.qa?.poses} 个姿态`);
      if (route === 'qa') setShowQa(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Keep the displayed gate in sync with native failures while retaining the successful model.
      if (gateAttempted) { try { apply(await api<Snapshot>('snapshot')); } catch { /* Keep the original failure visible. */ } }
    }
    finally { setBusy(''); }
  }

  function updatePart(change: (p: Part) => Part) {
    setIr(current => current ? { ...current, parts: current.parts.map(p => p.id === selected ? change(p) : p) } : current);
    setMessage('');
  }
  function changePoint(handle: Handle, point: Point) {
    updatePart(p => ({ ...p, geometry: { ...p.geometry, ...(handle.kind === 'polygon'
      ? { polygon: (p.geometry.polygon || polygon).map((v, i) => i === handle.index ? point : v) }
      : { landmarks: { ...p.geometry.landmarks, [handle.name]: point } }) } }));
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || !part) return;
    const matrix = drawing.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const [l, t, r, b] = part.geometry.bbox;
    changePoint(drag.current, [Math.round(Math.max(l, Math.min(r, point.x)) * 100) / 100, Math.round(Math.max(t, Math.min(b, point.y)) * 100) / 100]);
  }
  function start(event: PointerEvent<SVGCircleElement>, handle: Handle) {
    if (busy) return;
    event.preventDefault();
    drag.current = handle; setActive(handle);
    drawing.current?.setPointerCapture(event.pointerId);
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
  const stale = (stage: string) => dirty || saved?.stale[stage];
  const overlayStatus = dirty && saved?.overlay.status !== 'not-loaded' ? 'needs-review' : saved?.overlay.status;
  const previewSource = !saved?.build ? '尚未生成模型'
    : dirty ? '上次生成模型 · 当前有未保存修改'
    : saved.stale.moc3 ? '上次生成模型 · 已保存修改尚未更新'
    : '当前已保存版本的模型';
  const orderedParts = ir ? [...ir.parts].sort((a, b) => b.z - a.z).filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : [];
  const visibleParams = [...parameters].sort((a, b) => {
    const preferred = ['ParamAngleX', 'ParamAngleY', 'ParamMouthOpenY', 'ParamEyeLOpen', 'ParamEyeROpen'];
    const score = (p: Parameter) => preferred.includes(p.id) ? preferred.indexOf(p.id) : 99;
    return score(a) - score(b);
  });

  return <div className="app">
    <header className="topbar"><h1>Live2D <span>Studio</span></h1><div className="document-name">{ir?.metadata?.name || '工作区'} · {ir?.parts.length || 0} 图层</div><div className="actions">
      <button disabled={!!busy || !ir || dirty} title={dirty ? '请先保存 IR 再导入素材' : '导入外部生成的透明 PNG'} onClick={() => setShowImport(true)}>导入生成素材</button>
      <button disabled={!!busy || !dirty} onClick={() => action('save')}><Icon name="save"/>保存 IR</button>
      <button className="primary" disabled={!!busy || !ir} onClick={() => action('rebuild')}><Icon name="rebuild"/>Rebuild</button>
      <button className="primary" disabled={!!busy || !saved?.build || !!stale('moc3')} onClick={() => action('qa')}><Icon name="play"/>Run Pose QA</button>
    </div></header>
    {(busy || error || message) && <div className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error || busy || message}{!saved && !busy && <button onClick={() => { setError(''); setBusy('正在打开工作区…'); setOpenAttempt(value => value + 1); }}>重新打开工作区</button>}</div>}
    <main className="workspace">
      <aside className="panel parts-panel"><h2>图层</h2><label className="search"><Icon name="search"/><input aria-label="搜索图层" placeholder="搜索图层" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="part-list">{orderedParts.map(p => <div className={'part-row ' + (selected === p.id ? 'selected' : '')} key={p.id}>
          <button className={'visibility ' + (p.appearance?.visible === false ? 'hidden' : '')} disabled={!!busy} aria-label={`${p.appearance?.visible === false ? '显示' : '隐藏'} ${p.name}`} onClick={() => {
            setIr(current => current ? { ...current, parts: current.parts.map(item => item.id === p.id ? { ...item, appearance: { visible: item.appearance?.visible === false, opacity: item.appearance?.opacity ?? 255 } } : item) } : current);
          }}><Icon name="eye"/></button>
          <button className="part-select" onClick={() => { setSelected(p.id); setActive(null); }} aria-pressed={selected === p.id}><img src={'/studio-files/' + p.asset.path} alt=""/><span>{p.name}</span><span className="chevron">›</span></button>
        </div>)}{ir && !orderedParts.length && <p className="empty">没有匹配的图层</p>}</div>
      </aside>
      <section className="panel artwork-panel"><div className="panel-heading"><h2>美术画布</h2><div className="view-actions"><button onClick={() => setFocused(false)} aria-pressed={!focused}><Icon name="full"/>全图</button><button disabled={!part} onClick={() => setFocused(true)} aria-pressed={focused}><Icon name="focus"/>聚焦图层</button></div></div>
        {saved && <p className="canvas-reference">背景：{saved.artworkImage ? '上次导入合成图' : '原始参照图'}。当前裁切和显示效果请查看重建后的 Cubism 预览。</p>}
        <div className="artboard checker"><svg ref={drawing} viewBox={viewBox} aria-label="可编辑美术画布" onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {ir && saved && <image href={saved.artworkImage || saved.sourceImage} x="0" y="0" width={ir.canvas.width} height={ir.canvas.height}/>}
          {part && <g><polygon points={polygon.map(p => p.join(',')).join(' ')} fillRule="evenodd" fill="rgba(0,97,255,.035)" stroke="#0864ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            {polygon.map((point, i) => <circle key={i} data-handle={`polygon-${i}`} aria-label={`多边形顶点 ${i + 1}`} cx={point[0]} cy={point[1]} r={viewWidth / 115} fill="#0864ff" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={e => start(e, { kind: 'polygon', index: i })}/>)}
            {Object.entries(part.geometry.landmarks || {}).map(([name, point]) => <g key={name}><circle aria-label={`关键点 ${name}`} data-handle={`landmark-${name}`} cx={point[0]} cy={point[1]} r={viewWidth / 115} fill="#f19b28" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={e => start(e, { kind: 'landmark', name })}/><text x={point[0] + viewWidth / 60} y={point[1]} fontSize={viewWidth / 55} fill="#674514">{name}</text></g>)}
          </g>}
        </svg></div>
        <div className="inspector"><span className="muted">已选图层</span>{part && <><img src={'/studio-files/' + part.asset.path} alt=""/><strong>{part.name}</strong></>}
          <label>X <input aria-label="顶点 X" type="number" step="0.01" disabled={!!busy || !currentPoint} value={currentPoint?.[0] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [e.target.valueAsNumber, currentPoint[1]]); }}/></label>
          <label>Y <input aria-label="顶点 Y" type="number" step="0.01" disabled={!!busy || !currentPoint} value={currentPoint?.[1] ?? ''} onChange={e => { if (active && currentPoint && Number.isFinite(e.target.valueAsNumber)) changePoint(active, [currentPoint[0], e.target.valueAsNumber]); }}/></label>
        </div>
        <details className="landmark-editor"><summary>关键点注记</summary><p>关键点保存到 IR；重建时不驱动绑定。拖动蓝色顶点可裁切图层。</p><div><input aria-label="关键点名称" placeholder="例如 iris_center" value={landmarkName} onChange={e => setLandmarkName(e.target.value)}/><button disabled={!!busy || !part || !landmarkName.trim()} onClick={() => {
          if (!part) return;
          const name = landmarkName.trim();
          if (['__proto__', 'constructor', 'prototype', 'parameter', 'parameters', 'deformer', 'keyform', 'physics'].includes(name.toLowerCase())) { setError('关键点名称不可使用保留字段'); return; }
          const [l, t, r, b] = part.geometry.bbox;
          changePoint({ kind: 'landmark', name }, [(l + r) / 2, (t + b) / 2]); setActive({ kind: 'landmark', name }); setLandmarkName('');
        }}>添加关键点</button></div></details>
      </section>
      <aside className="preview-column"><section className="panel preview-panel"><div className="panel-heading"><h2>Cubism 预览</h2><span className="preview-status">{previewStatus}</span></div><p className="canvas-reference" role="status">{previewSource}</p><div className="preview checker">
        {modelUrl && ir ? <iframe key={modelUrl} ref={attachFrame} title="Cubism 实时预览" onLoad={onLoad} src={'/live2d-viewer/index.html?' + new URLSearchParams({ model: modelUrl, vendor: '/public/vendor/cubism/', canvaspx: `${ir.canvas.width},${ir.canvas.height}`, w: '640', h: '760', embed: '1' })}/> : <div className="empty">点击 Rebuild 生成预览</div>}
      </div></section>
      <section className="panel parameters-panel"><div className="panel-heading"><h2>参数</h2><button className="text-button" disabled={!parameters.length} onClick={reset}>重置</button></div><div className="parameters">{visibleParams.map(p => <label className="parameter" key={p.id}><span>{p.id}</span><div><input aria-label={p.id} type="range" min={p.min} max={p.max} step={(p.max - p.min) / 200 || 0.01} value={p.value} onChange={e => setParameter(p.id, Number(e.target.value))}/><output>{p.value.toFixed(2)}</output></div></label>)}{!parameters.length && <p className="empty">模型就绪后显示原生参数</p>}</div></section>
      {saved?.qa && <button className="qa-result" onClick={() => setShowQa(true)}>查看 Pose QA · {saved.qa.poses} 个姿态</button>}
      {saved?.build && <details className="build-notes"><summary>导出审计 · {saved.build.labelCount} 层 · {saved.build.warnings.length} 条警告</summary><p>未知标签 0；原生警告保留供复核。</p><ul>{saved.build.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      </aside>
    </main>
    {showImport && saved && ir && <ImportGenerated revision={saved.revision} canvas={ir.canvas} parts={ir.parts} selectedId={selected} onClose={() => setShowImport(false)} onCommit={async (id, revision, partId) => {
      const imported = await api<Snapshot>('import-commit', { id, revision });
      apply(imported); setSelected(partId); setActive(null); setShowImport(false); setError('');
      setMessage('素材已导入；请 Rebuild 更新模型，再运行 Pose QA');
    }}/>}
    <footer><span className={!saved ? 'muted' : dirty ? 'pending' : ''}>● {!saved ? 'IR 未加载' : dirty ? 'IR 未保存' : 'IR 已保存'}</span><div>{[['psd', 'PSD'], ['base_rig', '模型'], ['review', 'Pose QA']].map(([stage, label]) => <span key={stage} className={!saved ? 'muted' : stale(stage) ? 'pending' : 'valid'}>● {label} {!saved ? '状态未知' : stale(stage) ? '待更新' : '已更新'}</span>)}<span className={overlayStatus === 'broken' ? 'invalid' : overlayStatus === 'ok' ? 'valid' : overlayStatus === 'needs-review' ? 'pending' : 'muted'} title={dirty ? 'IR 未保存，Overlay 需重新核对' : saved?.overlay.reasons.join('\n')}>● Overlay {!saved ? '未加载' : overlayStatus === 'not-loaded' ? '未载入' : overlayStatus}</span></div></footer>
    {showQa && saved?.qa && <div className="modal-backdrop"><section className="qa-modal" role="dialog" aria-modal="true" aria-label="Pose QA 结果"><div className="panel-heading"><h2>Pose QA · {saved.qa.poses} 个姿态{stale('review') ? '（旧版本）' : ''}</h2><div><a href={saved.qa.reviewUrl} target="_blank" rel="noreferrer">review.json</a><button onClick={() => setShowQa(false)}>关闭</button></div></div><img src={saved.qa.contactSheet} alt="Pose QA 姿态联系表"/></section></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
