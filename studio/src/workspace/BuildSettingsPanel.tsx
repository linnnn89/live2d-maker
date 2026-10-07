import { useEffect, useState } from 'react';
import { validateProtocol } from '../protocol';
import { useWorkspace } from './WorkspaceContext';
import { createSettingsDraft, receiveSettings, settingsChanged, type SettingsDraft } from './settingsDraft';

export function BuildSettingsPanel() {
  const { saved, dirty, editingLocked, saveBuildSettings, readBuildSettings, setError, setSettingsPending } = useWorkspace();
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const current = saved?.buildSettings;
  const form = saved && current ? receiveSettings(draft, saved.workspaceId, current) : null;
  if (form !== draft) setDraft(form);
  const pending = !!form && settingsChanged(form);
  const conflict = pending && form!.base.revision !== current?.revision;
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
    if (Number.isFinite(value)) setDraft(previous => previous ? {...previous, settings:{...previous.settings,[key]:value}} : previous);
  }
  async function save(rebuild: boolean) {
    try {
      validateProtocol('BuildSettings', form!.settings);
      const result = await saveBuildSettings(form!.settings, form!.base.revision, rebuild);
      if (result) setDraft(createSettingsDraft(form!.workspaceId, result));
    }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <details className="build-settings"><summary>项目构建设置{pending ? ' · 未保存' : ''}</summary>
    <p>{pending ? '设置尚未保存，当前模型使用上次保存的设置。' : saved?.stale.base_rig ? '设置已保存；重建后模型采用。' : '当前模型已采用保存的设置。'} {dirty && '请先保存或放弃美术草稿。'}</p>
    {conflict && <p role="status" className="pending">已保存设置已在其他操作中变化，本页输入仍保留。请核对最新设置；放弃设置修改会采用最新保存值。</p>}
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
      <button disabled={locked || !pending} onClick={()=>setDraft(createSettingsDraft(form.workspaceId, current))}>放弃设置修改</button>
    </div>
    {conflict && <p>最新保存设置：{current.settings.atlasSize}px 贴图 / {current.settings.meshInteriorDensity}px 内部间距 / {current.settings.headTurnStrength} 转向强度</p>}
    {saved?.build?.buildSettings && <p>上次构建采用：{saved.build.buildSettings.atlasSize}px 贴图 / {saved.build.buildSettings.meshInteriorDensity}px 内部间距 / {saved.build.buildSettings.headTurnStrength} 转向强度</p>}
  </details>;
}
