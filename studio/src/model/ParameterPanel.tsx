import {useState} from 'react';
import {api} from '../api';
import type {Snapshot,SavedPose} from '../protocol/generated';
import type {Parameter} from '../viewer/ViewerAdapter';
import {useWorkspace} from '../workspace/WorkspaceContext';

const names:Record<string,string>={ParamAngleX:'头部左右转向',ParamAngleY:'头部上下转向',ParamAngleZ:'头部侧倾',ParamBodyAngleX:'身体左右转向',ParamBodyAngleY:'身体上下转向',ParamBodyAngleZ:'身体侧倾',ParamEyeLOpen:'左眼开合',ParamEyeROpen:'右眼开合',ParamEyeLSmile:'左眼笑意',ParamEyeRSmile:'右眼笑意',ParamEyeBallX:'视线左右',ParamEyeBallY:'视线上下',ParamMouthOpenY:'嘴部开合',ParamMouthForm:'嘴部形状',ParamBreath:'呼吸'};
const groups=[['head','头部'],['eyes','眼睛'],['mouth','嘴部'],['body','身体'],['hair','头发'],['other','其他']] as const;
function group(id:string){return /^ParamAngle/.test(id)?'head':/^ParamEye/.test(id)?'eyes':/^ParamMouth/.test(id)?'mouth':/^ParamBody|^ParamBreath/.test(id)?'body':/^ParamHair/.test(id)?'hair':'other';}
const presets:{name:string;values:Record<string,number>}[]=[{name:'中立姿态',values:{}},{name:'向左转头',values:{ParamAngleX:-30}},{name:'向右转头',values:{ParamAngleX:30}},{name:'闭眼',values:{ParamEyeLOpen:0,ParamEyeROpen:0}},{name:'张嘴',values:{ParamMouthOpenY:1}}];

export function ParameterPanel({parameters,setParameter,reset,applyPose}:{parameters:Parameter[];setParameter:(id:string,value:number)=>void;reset:()=>void;applyPose:(values:Record<string,number>)=>void}){
  const {saved,dirty,editingLocked,settingsPending,editor,applySnapshot,setBusy,setError,setMessage}=useWorkspace();
  const [name,setName]=useState(''),[error,setLocalError]=useState('');
  const locked=editingLocked||dirty||settingsPending;
  function compatible(values:Record<string,number>){return Object.entries(values).every(([id,value])=>parameters.some(p=>p.id===id&&Number.isFinite(value)&&p.min<=value&&value<=p.max));}
  function apply(values:Record<string,number>){try{applyPose(values);setLocalError('');}catch(e){setLocalError(e instanceof Error?e.message:String(e));}}
  async function persist(pose?:SavedPose){
    if(!saved?.poses||locked)return;editor.setBlocked(true);setBusy(pose?'正在删除保存姿态…':'正在保存预览姿态…');setError('');setLocalError('');
    try{
      const payload=pose?{schemaVersion:1,posesRevision:saved.poses.revision,operation:'delete',id:pose.id}
        :{schemaVersion:1,posesRevision:saved.poses.revision,operation:'save',revision:saved.revision,settingsRevision:saved.buildSettings!.revision,overlayRevision:saved.overlayRevision,buildId:saved.build?.modelUrl?.match(/(builds\/[a-f0-9]{32})\//)?.[1],name:name.trim(),values:Object.fromEntries(parameters.map(p=>[p.id,p.value]))};
      applySnapshot(await api<Snapshot>('poses',payload));setMessage(pose?'已删除保存姿态':'预览姿态已保存；模型绑定保持原样');if(!pose)setName('');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{editor.setBlocked(false);setBusy('');}
  }
  async function refresh(){
    if(locked)return;editor.setBlocked(true);setBusy('正在读取姿态库…');setError('');
    try{applySnapshot(await api<Snapshot>('snapshot'));setMessage('姿态库已读取，名称输入保留');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{editor.setBlocked(false);setBusy('');}
  }
  const canSave=!!parameters.length&&!!saved?.build?.parameters?.length&&!saved.stale.moc3&&!locked;
  return <section className="panel parameters-panel"><div className="panel-heading"><h2>参数与姿态</h2><button className="text-button" disabled={!parameters.length||editingLocked} onClick={()=>{reset();setLocalError('');}}>全部重置</button></div>
    <p className="canvas-reference">参数只影响临时预览；保存姿态记录数值，持久模型编辑另行提交。</p>
    <div className="parameters">{groups.map(([key,label])=>{const values=parameters.filter(p=>group(p.id)===key);return values.length?<details className="parameter-group" key={key} open={key==='head'}><summary>{label} · {values.length}</summary>{values.map(p=><label className="parameter" key={p.id}><span>{names[p.id]||p.id}<small>{p.id}</small></span><div><input aria-label={p.id} disabled={editingLocked} type="range" min={p.min} max={p.max} step={(p.max-p.min)/200||.01} value={p.value} onChange={e=>setParameter(p.id,Number(e.target.value))}/><input aria-label={p.id+' 数值'} disabled={editingLocked} type="number" min={p.min} max={p.max} step="any" value={p.value} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))setParameter(p.id,e.target.valueAsNumber);}}/><button type="button" aria-label={p.id+' 重置'} disabled={editingLocked} onClick={()=>setParameter(p.id,p.default)}>↺</button></div></label>)}</details>:null;})}{!parameters.length&&<p className="empty">模型就绪后显示原生参数</p>}</div>
    <details className="pose-panel"><summary>姿态预设与保存</summary><div className="pose-presets">{presets.map(preset=><button key={preset.name} disabled={editingLocked||!parameters.length||!compatible(preset.values)} title={compatible(preset.values)?'重置其他参数后应用':'当前模型缺少参数或范围不兼容'} onClick={()=>apply(preset.values)}>{preset.name}</button>)}</div>
      <div className="pose-save"><input aria-label="姿态名称" maxLength={80} placeholder="姿态名称" disabled={locked} value={name} onChange={e=>setName(e.target.value)}/><button disabled={!canSave||!name.trim()} onClick={()=>void persist()}>保存当前姿态</button><button disabled={locked} onClick={()=>void refresh()}>读取姿态库</button></div>
      {!saved?.build?.parameters?.length&&saved?.build&&<p className="canvas-reference">此旧构建尚无参数范围记录，重建后可保存姿态。</p>}
      <ul className="saved-poses">{saved?.poses?.library.items.map(pose=><li key={pose.id}><button disabled={!parameters.length||editingLocked} onClick={()=>apply(pose.values)}>{pose.name}</button><button disabled={locked} aria-label={'删除姿态 '+pose.name} onClick={()=>void persist(pose)}>删除</button>{!compatible(pose.values)&&<small>当前模型参数不兼容，应用会显示原因。</small>}</li>)}</ul>
    </details>{error&&<p className="notice error" role="alert">{error}</p>}
  </section>;
}
