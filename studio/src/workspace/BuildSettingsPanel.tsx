import { useEffect, useState } from 'react';
import type { BuildSettingsState } from '../protocol/generated';
import { validateProtocol } from '../protocol';
import { useWorkspace } from './WorkspaceContext';

export function BuildSettingsPanel() {
  const { saved, dirty, editingLocked, saveBuildSettings, readBuildSettings, setError, setSettingsPending } = useWorkspace();
  const [form, setForm] = useState<BuildSettingsState | null>(null);
  const current = saved?.buildSettings;
  useEffect(() => { setForm(current ? structuredClone(current) : null); }, [saved?.workspaceId, current?.revision]);
  const pending = !!form && JSON.stringify(form.settings) !== JSON.stringify(current?.settings);
  useEffect(()=>{setSettingsPending(pending);return()=>setSettingsPending(false);},[pending,setSettingsPending]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  if (!form || !current) return null;
  const locked = editingLocked || dirty;
  function change(key: 'atlasSize' | 'meshInteriorDensity' | 'headTurnStrength', value: number) {
    if (Number.isFinite(value)) setForm(previous => previous ? {...previous, settings:{...previous.settings,[key]:value}} : previous);
  }
  function save(rebuild: boolean) {
    try { validateProtocol('BuildSettings', form!.settings); void saveBuildSettings(form!.settings, form!.revision, rebuild); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <details className="build-settings"><summary>项目构建设置{pending ? ' · 未保存' : ''}</summary>
    <p>{pending ? '设置尚未保存，当前模型使用上次保存的设置。' : saved?.stale.base_rig ? '设置已保存；重建后模型采用。' : '当前模型已采用保存的设置。'} {dirty && '请先保存或放弃美术草稿。'}</p>
    <fieldset disabled={locked}>
      <label>贴图尺寸 <select aria-label="贴图尺寸" value={form.settings.atlasSize} onChange={e=>change('atlasSize',Number(e.target.value))}>
        {[1024,2048,4096].map(value=><option key={value} value={value}>{value} × {value}</option>)}
      </select></label>
      <label>网格内部间距 <input aria-label="网格内部间距" type="number" min="12" max="80" step="1" value={form.settings.meshInteriorDensity} onChange={e=>change('meshInteriorDensity',e.target.valueAsNumber)}/> px</label>
      <label>头部转向强度 <input aria-label="头部转向强度" type="number" min="0" max="2" step="0.1" value={form.settings.headTurnStrength} onChange={e=>change('headTurnStrength',e.target.valueAsNumber)}/></label>
    </fieldset>
    <p>间距越小网格越密，部件按原生规则调整；0 表示关闭头部转向位移。保存设置会让模型和 QA 待更新，美术像素不变。</p>
    <div className="settings-actions">
      <button disabled={locked || !pending} onClick={()=>save(false)}>保存设置</button>
      <button disabled={locked || !pending} onClick={()=>save(true)}>保存并重建</button>
      <button disabled={locked} onClick={()=>void readBuildSettings()}>重新读取设置</button>
      <button disabled={locked || !pending} onClick={()=>setForm(structuredClone(current))}>放弃设置修改</button>
    </div>
    {saved?.build?.buildSettings && <p>上次构建采用：{saved.build.buildSettings.atlasSize}px 贴图 / {saved.build.buildSettings.meshInteriorDensity}px 内部间距 / {saved.build.buildSettings.headTurnStrength} 转向强度</p>}
  </details>;
}
