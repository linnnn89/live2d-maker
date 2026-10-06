import { useState } from 'react';
import { api } from '../api';
import type { ModelExportResult, Snapshot } from '../protocol/generated';
import { useWorkspace } from '../workspace/WorkspaceContext';

export function ModelExportPanel() {
  const {saved,dirty,settingsPending,editingLocked,editor,applySnapshot,setError,setMessage,setBusy}=useWorkspace();
  const [target,setTarget]=useState<'playable'|'editor'>('playable'),[motions,setMotions]=useState(true),[physics,setPhysics]=useState(false);
  const locked=editingLocked||dirty||settingsPending;
  async function run(){
    if(!saved||locked||!saved.buildSettings||!saved.overlayRevision)return;
    editor.setBlocked(true);setBusy('正在生成模型交付包…');setError('');setMessage('');
    try{
      const result=await api<ModelExportResult>('model-export',{schemaVersion:1,revision:saved.revision,settingsRevision:saved.buildSettings.revision,overlayRevision:saved.overlayRevision,target,exportMotions:motions,generatePhysics:physics});
      applySnapshot(await api<Snapshot>('snapshot'));setMessage(result.reused?'已复用验证产物生成交付包':'交付包已生成，请检查文件与警告后下载');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{editor.setBlocked(false);setBusy('');}
  }
  const delivery=saved?.export;
  return <details className="project-panel"><summary>导出模型</summary><p>请先保存美术和构建设置。独立生成交付产物，当前预览保留；仅更换文件选择会复用同一设置下的验证产物。</p>
    <fieldset disabled={locked}><label>交付目标 <select aria-label="交付目标" value={target} onChange={event=>setTarget(event.target.value as 'playable'|'editor')}><option value="playable">可播放模型包（moc3）</option><option value="editor">可编辑工程（cmo3）</option></select></label>
      <label><input type="checkbox" checked={motions} onChange={event=>setMotions(event.target.checked)}/>包含动作示例</label>
      <label><input type="checkbox" checked={physics} onChange={event=>setPhysics(event.target.checked)}/>生成默认物理</label>
      <button className="primary" disabled={!saved} onClick={()=>void run()}>生成交付包</button>
    </fieldset><p>显式物理编辑仍保留。cmo3 包含重建 PSD 和运行时参考；实际美术及动态效果仍需检查。</p>
    {delivery&&<section aria-label="交付结果"><p>{delivery.current?'对应当前已保存输入':'历史交付包 · 当前输入已改变'} · {delivery.result.target==='editor'?'cmo3 工程':'可播放模型'} · {delivery.result.motions} 个动作 · {delivery.result.physics?'含物理':'无物理'}</p>
      <a href={delivery.result.url} download={delivery.result.filename}>下载模型交付包</a>
      <details><summary>文件清单 · {delivery.result.files.length} 项</summary><ul>{delivery.result.files.map(file=><li key={file.name}>{file.name} · {file.bytes.toLocaleString()} bytes</li>)}</ul></details>
      <details><summary>原生警告 · {delivery.result.warnings.length} 项</summary><ul>{delivery.result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>
    </section>}
  </details>;
}
