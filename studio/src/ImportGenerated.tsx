import { useEffect, useMemo, useRef, useState } from 'react';
import { encode } from 'fast-png';
import { api } from './api';
import type { ImportPreview as Preview, ArtworkIR } from './protocol';
import type { AssetOrigin } from './protocol/generated';
import {useWorkspace} from './workspace/WorkspaceContext';
import {decodeAsset} from './artwork/png';
import type {RasterAsset} from './artwork/contracts';
import {ImportCanvas} from './assets/ImportCanvas';
import {blankMask,maskFromPixels,alphaBounds} from './assets/mask';


async function pngContent(file: File | null) {
  if (!file || file.size > 16 * 1024 * 1024) throw new Error('请选择 PNG 文件，每个文件不超过 16 MB');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

export function ImportGenerated({ revision, ir, selectedId, onClose, onCommit }: {
  revision: string; ir: ArtworkIR; selectedId: string;
  onClose: () => void; onCommit: (id: string, revision: string, partId: string) => Promise<void>;
}) {
  const {artwork}=useWorkspace(),{canvas,parts}=ir;
  const selected = parts.find(p => p.id === selectedId) || parts[0];
  const [generated, setGenerated] = useState<File | null>(null);
  const [sprite,setSprite]=useState<{url:string;image:RasterAsset}|null>(null);
  const [loading,setLoading]=useState(false),[gesturing,setGesturing]=useState(false);
  const [mask, setMask] = useState(()=>blankMask(canvas.width,canvas.height));
  const [replace, setReplace] = useState(false);
  const [target, setTarget] = useState(selected?.id || '');
  const [name, setName] = useState('');
  const [origin,setOrigin]=useState<AssetOrigin['kind']>('manual'),[description,setDescription]=useState(''),[prompt,setPrompt]=useState('');
  const [bounds, setBounds] = useState<number[]>(selected?.geometry.bbox || [0, 0, canvas.width, canvas.height]);
  const [fit, setFit] = useState(false);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [crop, setCrop] = useState([0, 0, 0, 0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [focused, setFocused] = useState(true);
  const [comparisonMode,setComparisonMode]=useState<'both'|'before'|'after'>('both');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const maskLoad=useRef(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {maskLoad.current++;previous?.focus();};
  }, []);
  useEffect(()=>{
    let cancelled=false,url='';setSprite(null);
    if(!generated){setLoading(false);return;}
    setLoading(true);
    void (async()=>{
      if(generated.size>16*1024*1024)throw new Error('素材 PNG 不得超过 16 MB');
      const bytes=new Uint8Array(await generated.arrayBuffer());
      if(bytes[25]!==6||bytes[24]!==8)throw new Error('素材须为 8 位 RGBA 透明 PNG');
      const image=decodeAsset(bytes);if(!alphaBounds(image)||!image.data.some((value,index)=>index%4===3&&value===0))throw new Error('素材需有可见像素和透明背景');
      url=URL.createObjectURL(generated);if(!cancelled){setSprite({url,image});setCrop([0,0,image.width,image.height]);}
    })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[generated]);
  const placement=useMemo(()=>{
    if(!sprite)return null;const region=cropEnabled?crop:[0,0,sprite.image.width,sprite.image.height];
    const alpha=alphaBounds(sprite.image,region);const box=alpha?(fit?alpha:region):null;
    return box?{url:sprite.url,width:sprite.image.width,height:sprite.image.height,sourceBox:box,fit}:null;
  },[sprite,fit,cropEnabled,crop]);
  const editable=useMemo(()=>mask.reduce((total,value)=>total+(value===255?1:0),0),[mask]);
  async function loadMask(file:File|null){
    const token=++maskLoad.current;setPreview(null);setError('');setLoading(true);
    try{
      if(!file||file.size>16*1024*1024)throw new Error('请选择不超过 16 MB 的 mask PNG');
      const image=decodeAsset(new Uint8Array(await file.arrayBuffer()));
      const value=maskFromPixels(image,canvas.width,canvas.height);if(maskLoad.current===token)setMask(value);
    }catch(e){if(maskLoad.current===token)setError(e instanceof Error?e.message:String(e));}
    finally{if(maskLoad.current===token)setLoading(false);}
  }
  // Editing any input invalidates the corresponding preflight authorization.
  function changed(update: () => void) { update(); setPreview(null); setError(''); }
  function selectTarget(id: string) {
    setTarget(id);
    const part = parts.find(p => p.id === id);
    if (part) { setName(part.name); setBounds(part.geometry.bbox); }
  }
  async function preflight() {
    setBusy('正在检查素材与保护区…'); setError(''); setPreview(null);
    try {
      if (!name.trim() || !description.trim() || (origin==='ai'&&!prompt.trim())) throw new Error('请填写图层名称、素材来源说明；AI 素材还需生成提示词');
      if(!editable||editable===mask.length)throw new Error('请设置局部可编辑区，mask 须同时保留保护区和可编辑区');
      if (![...bounds, ...(cropEnabled ? crop : [])].every(Number.isInteger)) throw new Error('坐标必须为整数');
      const generatedPng=await pngContent(generated);
      const bytes=encode({width:canvas.width,height:canvas.height,channels:1,depth:8,data:mask});let binary='';
      for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
      const maskPng=btoa(binary);
      const source:AssetOrigin=origin==='ai'?{kind:'ai',description:description.trim(),prompt:prompt.trim()}:{kind:origin,description:description.trim()};
      setPreview(await api<Preview>('import-preview', { revision, generatedPng, maskPng, name, origin:source, bounds,
        replacePart: replace ? target : null, fit, spriteBounds: cropEnabled ? crop : null }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }
  async function commit() {
    if (!preview) return;
    setBusy('正在导入已检查的素材…'); setError('');
    try { await onCommit(preview.id, preview.revision, preview.partId); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setPreview(null); }
    finally { setBusy(''); }
  }
  function coordinates(values: number[], update: (value: number[]) => void, prefix: string) {
    return <div className="import-coordinates">{['左', '上', '右', '下'].map((label, index) => <label key={label}>{label}
      <input aria-label={`${prefix}${label}`} type="number" step="1" value={Number.isNaN(values[index]) ? '' : values[index]} onChange={e => changed(() => update(values.map((value, i) => i === index ? e.target.valueAsNumber : value)))}/>
    </label>)}</div>;
  }
  function comparison(file: string, label: string) {
    const [left, top, right, bottom] = preview!.report.bounds;
    const pad = Math.max(right - left, bottom - top) * 1.5;
    const l = Math.max(0, left - pad), t = Math.max(0, top - pad);
    const viewBox = focused ? `${l} ${t} ${Math.min(canvas.width, right + pad) - l} ${Math.min(canvas.height, bottom + pad) - t}` : `0 0 ${canvas.width} ${canvas.height}`;
    return <figure><div className="checker"><svg viewBox={viewBox} role="img" aria-label={label + '合成图'}><image href={file} width={canvas.width} height={canvas.height}/></svg></div><figcaption>{label} · <a href={file} target="_blank" rel="noreferrer">查看原图</a></figcaption></figure>;
  }
  return <div className="modal-backdrop"><section ref={dialog} className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onKeyDown={event => {
    if (event.key === 'Escape' && !busy && !loading && !gesturing) onClose();
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="panel-heading"><h2 id="import-title">导入素材</h2><button disabled={!!busy||loading||gesturing} onClick={onClose}>关闭</button></div>
    <div className="import-content"><p className="muted">1 选素材 → 2 拖拽放置/缩放 → 3 绘制或载入可编辑区 → 4 对比并确认。原图和来源记录保留；导入后需重建模型。</p>
      <fieldset disabled={!!busy||loading||gesturing} className="import-fields">
        <label>透明素材 PNG<input aria-label="透明素材 PNG" type="file" accept="image/png" onChange={e => changed(() => setGenerated(e.target.files?.[0] || null))}/><small>RGBA，含透明背景；每个文件 ≤ 16 MB。</small></label>
        <label>素材来源<select aria-label="素材来源" value={origin} onChange={e=>changed(()=>setOrigin(e.target.value as AssetOrigin['kind']))}><option value="manual">手绘/人工制作</option><option value="external">外部素材</option><option value="ai">AI 生成</option></select><small>保留原图哈希和来源说明，AI 提示词单独记录。</small></label>
        <label>导入方式<select aria-label="导入方式" value={replace ? 'replace' : 'add'} onChange={e => changed(() => {
          const replacing = e.target.value === 'replace'; setReplace(replacing); if (replacing) selectTarget(target);
        })}><option value="add">新增图层</option><option value="replace">替换现有图层</option></select></label>
        {replace && <label>替换目标<select aria-label="替换目标" value={target} onChange={e => changed(() => selectTarget(e.target.value))}>{parts.map(part => <option key={part.id} value={part.id} disabled={part.appearance?.visible === false}>{part.name}</option>)}</select><small>保留原图层 ID、层序和显示设置。</small></label>}
        <label>图层名称<input aria-label="导入图层名称" maxLength={128} value={name} placeholder="例如 tongue、mouth_open、blush" onChange={e => changed(() => setName(e.target.value))}/><small>名称需匹配工具支持的语义标签。</small></label>
        <div className="import-wide"><ImportCanvas ir={ir} client={artwork} bounds={bounds} onBounds={value=>changed(()=>{if(value[2]-value[0]!==bounds[2]-bounds[0]||value[3]-value[1]!==bounds[3]-bounds[1])setFit(true);setBounds(value);})}
          mask={mask} onMask={value=>changed(()=>{maskLoad.current++;setMask(value);})} placement={placement} replaceId={replace?target:null} disabled={!!busy||loading} onGesture={active=>{setGesturing(active);if(active)setPreview(null);}}/>
          <label className="import-check"><input type="checkbox" checked={fit} onChange={e => changed(() => setFit(e.target.checked))}/>按可见内容等比适配范围</label><small>缩放手柄会启用适配；未勾选时 PNG 尺寸须等于放置范围。精确检查采用 Pillow 的 alpha 裁切/等比缩放。</small>
          <details><summary>精确放置坐标</summary>{coordinates(bounds,setBounds,'画布')}</details>
          <label>载入保护区 mask<input aria-label="保护区 mask" type="file" accept="image/png" onChange={event=>void loadMask(event.target.files?.[0]||null)}/><small>{canvas.width} × {canvas.height} 二值灰度 PNG；0 保护，255 可编辑。</small></label>
          <button type="button" onClick={()=>changed(()=>{maskLoad.current++;setMask(blankMask(canvas.width,canvas.height));})}>重置为全图保护</button><small> · 可编辑 {editable.toLocaleString()} / {mask.length.toLocaleString()} 像素</small>
        </div>
        <details className="import-wide"><summary>源 PNG 裁切（可选）</summary><label className="import-check"><input type="checkbox" checked={cropEnabled} onChange={e => changed(() => setCropEnabled(e.target.checked))}/>仅导入指定矩形内的内容</label>{cropEnabled && coordinates(crop, setCrop, '源图')}</details>
        <label className="import-wide">素材来源说明<textarea aria-label="素材来源说明" maxLength={16000} rows={2} placeholder="作者、制作方式或外部来源，随素材保存" value={description} onChange={e=>changed(()=>setDescription(e.target.value))}/></label>
        {origin==='ai'&&<label className="import-wide">AI 生成提示词<textarea aria-label="AI 生成提示词" maxLength={16000} rows={2} value={prompt} onChange={e=>changed(()=>setPrompt(e.target.value))}/></label>}
      </fieldset>
      {(error || busy) && <p className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error || busy}</p>}
      {preview && <section className="import-result" aria-label="导入预检结果"><div className="panel-heading"><p className="valid"><strong>预检通过 · {preview.name} · {preview.semantic.tag}</strong></p><button aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? '查看全图' : '查看局部'}</button><select aria-label="前后对比显示" value={comparisonMode} onChange={event=>setComparisonMode(event.target.value as typeof comparisonMode)}><option value="both">并排对比</option><option value="before">导入前</option><option value="after">导入后</option></select></div><div className={'import-images '+(comparisonMode==='both'?'':'single')}>
        {comparisonMode!=='after'&&comparison(preview.beforeImage, '导入前')}{comparisonMode!=='before'&&comparison(preview.afterImage, '导入后')}
      </div><dl><div><dt>变化像素</dt><dd>{preview.report.changed_pixels}</dd></div><div><dt>保护区变化像素</dt><dd>{preview.report.outside_changed_pixels}</dd></div><div><dt>保护区可见素材像素</dt><dd>{preview.report.outside_visible_pixels}</dd></div><div><dt>保护区最大差值</dt><dd>{preview.report.outside_max_diff}</dd></div></dl>
        <p className="muted">源图 {preview.report.registration.input_size.join(' × ')}{preview.report.registration.fitted_size && ` · 适配内容 ${preview.report.registration.fitted_size.join(' × ')}`}{preview.report.registration.excluded_visible_pixels !== undefined && ` · 裁切排除 ${preview.report.registration.excluded_visible_pixels} 个可见像素`}。确认后仍需原生重建与 Pose QA。</p>
      </section>}
    </div><div className="import-actions"><button disabled={!!busy||loading||gesturing} onClick={onClose}>取消</button><button disabled={!!busy||loading||gesturing||!sprite} onClick={preflight}>检查导入</button><button className="primary" disabled={!!busy||loading||gesturing||!preview} onClick={commit}>确认导入</button></div>
  </section></div>;
}
