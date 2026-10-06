import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { ImportPreview as Preview, Part } from './protocol';


async function pngContent(file: File | null) {
  if (!file || file.size > 16 * 1024 * 1024) throw new Error('请选择 PNG 文件，每个文件不超过 16 MB');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

export function ImportGenerated({ revision, canvas, parts, selectedId, onClose, onCommit }: {
  revision: string; canvas: { width: number; height: number }; parts: Part[]; selectedId: string;
  onClose: () => void; onCommit: (id: string, revision: string, partId: string) => Promise<void>;
}) {
  const selected = parts.find(p => p.id === selectedId) || parts[0];
  const [generated, setGenerated] = useState<File | null>(null);
  const [mask, setMask] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [target, setTarget] = useState(selected?.id || '');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [bounds, setBounds] = useState<number[]>(selected?.geometry.bbox || [0, 0, canvas.width, canvas.height]);
  const [fit, setFit] = useState(false);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [crop, setCrop] = useState([0, 0, 0, 0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [focused, setFocused] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus();
  }, []);
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
      if (!name.trim() || !prompt.trim()) throw new Error('请填写图层名称和素材生成说明');
      if (![...bounds, ...(cropEnabled ? crop : [])].every(Number.isInteger)) throw new Error('坐标必须为整数');
      const [generatedPng, maskPng] = await Promise.all([pngContent(generated), pngContent(mask)]);
      setPreview(await api<Preview>('import-preview', { revision, generatedPng, maskPng, name, prompt, bounds,
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
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []).filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="panel-heading"><h2 id="import-title">导入生成素材</h2><button disabled={!!busy} onClick={onClose}>关闭</button></div>
    <div className="import-content"><p className="muted">选择外部生成的透明 PNG 与保护区 mask，检查合成结果后再导入。源文件保留；模型需重新 Rebuild。</p>
      <fieldset disabled={!!busy} className="import-fields">
        <label>透明素材 PNG<input aria-label="透明素材 PNG" type="file" accept="image/png" onChange={e => changed(() => setGenerated(e.target.files?.[0] || null))}/><small>RGBA，含透明背景；每个文件 ≤ 16 MB。</small></label>
        <label>保护区 mask<input aria-label="保护区 mask" type="file" accept="image/png" onChange={e => changed(() => setMask(e.target.files?.[0] || null))}/><small>{canvas.width} × {canvas.height} 灰度 PNG；0 保护，255 可编辑。</small></label>
        <label>导入方式<select aria-label="导入方式" value={replace ? 'replace' : 'add'} onChange={e => changed(() => {
          const replacing = e.target.value === 'replace'; setReplace(replacing); if (replacing) selectTarget(target);
        })}><option value="add">新增图层</option><option value="replace">替换现有图层</option></select></label>
        {replace && <label>替换目标<select aria-label="替换目标" value={target} onChange={e => changed(() => selectTarget(e.target.value))}>{parts.map(part => <option key={part.id} value={part.id} disabled={part.appearance?.visible === false}>{part.name}</option>)}</select><small>保留原图层 ID、层序和显示设置。</small></label>}
        <label>图层名称<input aria-label="导入图层名称" maxLength={128} value={name} placeholder="例如 tongue、mouth_open、blush" onChange={e => changed(() => setName(e.target.value))}/><small>名称需匹配工具支持的语义标签。</small></label>
        <div className="import-wide"><strong>画布放置范围</strong>{coordinates(bounds, setBounds, '画布')}
          <label className="import-check"><input type="checkbox" checked={fit} onChange={e => changed(() => setFit(e.target.checked))}/>按可见内容等比适配范围</label><small>未勾选时，PNG 尺寸必须等于放置范围；勾选后裁去透明边并等比缩放。</small></div>
        <details className="import-wide"><summary>源 PNG 裁切（可选）</summary><label className="import-check"><input type="checkbox" checked={cropEnabled} onChange={e => changed(() => setCropEnabled(e.target.checked))}/>仅导入指定矩形内的内容</label>{cropEnabled && coordinates(crop, setCrop, '源图')}</details>
        <label className="import-wide">素材生成说明<textarea aria-label="素材生成说明" maxLength={16000} rows={2} placeholder="记录生成要求或来源，随素材保存" value={prompt} onChange={e => changed(() => setPrompt(e.target.value))}/></label>
      </fieldset>
      {(error || busy) && <p className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error || busy}</p>}
      {preview && <section className="import-result" aria-label="导入预检结果"><div className="panel-heading"><p className="valid"><strong>预检通过 · {preview.name} · {preview.semantic.tag}</strong></p><button aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? '查看全图' : '查看局部'}</button></div><div className="import-images">
        {comparison(preview.beforeImage, '导入前')}{comparison(preview.afterImage, '导入后')}
      </div><dl><div><dt>变化像素</dt><dd>{preview.report.changed_pixels}</dd></div><div><dt>保护区变化像素</dt><dd>{preview.report.outside_changed_pixels}</dd></div><div><dt>保护区可见素材像素</dt><dd>{preview.report.outside_visible_pixels}</dd></div><div><dt>保护区最大差值</dt><dd>{preview.report.outside_max_diff}</dd></div></dl>
        <p className="muted">源图 {preview.report.registration.input_size.join(' × ')}{preview.report.registration.fitted_size && ` · 适配内容 ${preview.report.registration.fitted_size.join(' × ')}`}{preview.report.registration.excluded_visible_pixels !== undefined && ` · 裁切排除 ${preview.report.registration.excluded_visible_pixels} 个可见像素`}。确认后仍需原生重建与 Pose QA。</p>
      </section>}
    </div><div className="import-actions"><button disabled={!!busy} onClick={onClose}>取消</button><button disabled={!!busy || !generated || !mask} onClick={preflight}>检查导入</button><button className="primary" disabled={!!busy || !preview} onClick={commit}>确认导入</button></div>
  </section></div>;
}
