import {useState} from 'react';
import {api} from '../api';
import type {Snapshot} from '../protocol';
import type {Parameter} from '../viewer/ViewerAdapter';
import {useWorkspace} from '../workspace/WorkspaceContext';

export function RigEditPanel({parameters}:{parameters:Parameter[]}){
  const {saved,selected,dirty,settingsPending,editingLocked,editor,setBusy,setError,setMessage,applySnapshot,setSelected}=useWorkspace();
  const [target,setTarget]=useState(''),[parameter,setParameter]=useState('ParamAngleX'),[value,setValue]=useState('30'),[opacity,setOpacity]=useState('0.5');
  if(!saved)return null;
  const locked=editingLocked||dirty||settingsPending;
  const meshes=saved.build?.classifications?.filter(c=>c.partId===selected&&c.drawable)??[];
  const targetId=meshes.some(c=>c.drawable===target)?target:meshes[0]?.drawable;
  const available=!!saved.project&&!!saved.build&&!saved.stale.base_rig&&saved.overlay.status!=='broken';
  async function submit(index?:number){
    if(locked)return;editor.setBlocked(true);setBusy('正在保存模型关键形…');setError('');
    try{
      const base={schemaVersion:1,revision:saved!.revision,settingsRevision:saved!.buildSettings!.revision,overlayRevision:saved!.overlayRevision};
      applySnapshot(await api<Snapshot>('rig-edit',index===undefined?{...base,operation:'set-opacity',edit:{targetId,parameterId:parameter,value:Number(value),opacity:Number(opacity)}}:{...base,operation:'remove',index}));
      setMessage('模型修改已保存；上次成功模型保留，更新模型后查看效果。修改前工程已自动保存为修订。');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{editor.setBlocked(false);setBusy('');}
  }
  return <details className="rig-edit-panel"><summary>模型关键形编辑</summary><p>持久修改指定部件在某一参数姿态的透明度。预览参数本身不会保存为关键形；提交后需更新模型，原生检查通过才替换预览。</p>
    {!available&&<p>请打开 Studio 工程，保存输入并更新模型；已有基线冲突时先查看证据，恢复兼容修订。</p>}
    <label>当前图层对应对象 <select aria-label="关键形对象" disabled={locked||!available} value={targetId??''} onChange={e=>setTarget(e.target.value)}>{meshes.map(c=><option key={c.componentId} value={c.drawable!}>{c.semanticTag} · {c.drawable}</option>)}</select></label>
    <label>参数 <select aria-label="关键形参数" value={parameter} disabled={locked||!available} onChange={e=>setParameter(e.target.value)}>{parameters.map(p=><option key={p.id} value={p.id}>{p.id}</option>)}</select></label>
    <label>参数姿态值 <input aria-label="关键形姿态值" type="number" step="any" value={value} disabled={locked||!available} onChange={e=>setValue(e.target.value)}/></label>
    <label>透明度 <input aria-label="关键形透明度" type="number" min="0" max="1" step="0.05" value={opacity} disabled={locked||!available} onChange={e=>setOpacity(e.target.value)}/></label>
    <button disabled={locked||!available||!targetId||!value.trim()||!opacity.trim()||!parameters.some(p=>p.id===parameter&&p.min<=Number(value)&&Number(value)<=p.max)||!(Number(opacity)>=0&&Number(opacity)<=1)} onClick={()=>void submit()}>保存透明度关键形</button>
    <ul>{saved.rigEdits?.edits.map(edit=><li key={edit.index}><strong>{edit.targetId}</strong> · {Object.entries(edit.coordinate).map(([id,value])=>`${id}=${value}`).join(', ')} · 透明度 {edit.opacity}<button disabled={locked} onClick={()=>{const part=saved.build?.classifications?.find(c=>c.drawable===edit.targetId);if(part)setSelected(part.partId);}}>定位图层</button><button disabled={locked} onClick={()=>void submit(edit.index)}>撤回此修改</button></li>)}</ul>
    {saved.rigEdits?.baselineModelSha256&&<p className="asset-hash">基线：{saved.rigEdits.baselineModelSha256}</p>}
    <div className="settings-actions">{saved.rigEdits?.overlayUrl&&<a href={saved.rigEdits.overlayUrl} target="_blank" rel="noreferrer">查看 Overlay</a>}{saved.rigEdits?.baselineUrl&&<a href={saved.rigEdits.baselineUrl} target="_blank" rel="noreferrer">查看原基线</a>}{saved.rigEdits?.failureUrl&&<a href={saved.rigEdits.failureUrl} target="_blank" rel="noreferrer">查看失败证据</a>}</div>
    {!!saved.rigEdits?.changedModelFields.length&&<p>变化字段：{saved.rigEdits.changedModelFields.join(', ')}。旧模型与原基线保留；请恢复兼容输入，或打开独立工程重新建立编辑。</p>}
  </details>;
}
