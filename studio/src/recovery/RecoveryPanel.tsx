import { useEffect, useRef, useState } from 'react';
import type { DraftController } from '../editor/DraftController';
import type { Snapshot } from '../protocol';
import { IndexedDraftPersistence } from './IndexedDraftPersistence';
import { DraftBackup } from './DraftBackup';
import { recoveryPlan, type DraftCheckpoint } from './checkpoint';

function download(value: DraftCheckpoint) {
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  link.href=url;link.download=`studio-draft-${value.draftId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function RecoveryPanel({saved,editor,locked}:{saved:Snapshot|null;editor:DraftController<Snapshot>;locked:boolean}) {
  const [storage]=useState(()=>new IndexedDraftPersistence());
  const [records,setRecords]=useState<DraftCheckpoint[]>([]);
  const [status,setStatus]=useState({message:'',failed:false});
  const [actionError,setActionError]=useState('');
  const [loading,setLoading]=useState(false);
  const backupRef=useRef<DraftBackup|null>(null);
  const workspaceId=saved?.workspaceId;
  useEffect(()=>{
    if(!workspaceId)return()=>storage.close();
    let disposed=false,timer:number|undefined;
    const backup=new DraftBackup(workspaceId,storage,(message,failed)=>{if(!disposed)setStatus({message,failed});});
    backupRef.current=backup;
    const refresh=()=>{void storage.list(workspaceId).then(values=>{if(!disposed)setRecords(values);}).catch(error=>{
      if(!disposed)setStatus({message:'草稿存储不可用：'+String(error),failed:true});
    });};
    const update=()=>{
      const state=editor.getSnapshot();if(!state || state.phase!=='idle')return;
      backup.update(state);window.clearTimeout(timer);timer=window.setTimeout(()=>void backup.flush(),200);
    };
    const leave=()=>{window.clearTimeout(timer);void backup.flush();};
    const unsubscribe=editor.subscribe(update),unlisten=storage.subscribe(refresh);
    window.addEventListener('focus',refresh);window.addEventListener('pagehide',leave);
    refresh();update();
    return()=>{disposed=true;unsubscribe();unlisten();window.clearTimeout(timer);window.removeEventListener('focus',refresh);window.removeEventListener('pagehide',leave);void backup.flush().finally(()=>storage.close());backupRef.current=null;};
  },[workspaceId,editor,storage]);
  if(!saved)return null;
  const current=editor.getSnapshot();
  const candidates=records.filter(record=>record.draftId!==current?.draftId);
  async function remove(record:DraftCheckpoint){
    setLoading(true);setActionError('');
    try{await storage.remove(record);}catch(error){setActionError(String(error));}finally{setLoading(false);}
  }
  return <section className="recovery-panel" aria-label="草稿恢复">
    <p className={status.failed?'invalid':'muted'} role="status" data-backup-state={status.failed?'error':status.message.startsWith('正在')?'saving':'ready'}>{status.message}</p>
    {status.failed&&<button disabled={locked} onClick={()=>{const state=editor.getSnapshot();if(state&&state.phase==='idle'){backupRef.current?.update(state);void backupRef.current?.flush();}}}>重试草稿备份</button>}
    {actionError&&<p role="alert" className="invalid">{actionError}</p>}
    {!!candidates.length&&<details open><summary>发现 {candidates.length} 份未保存草稿</summary><p>恢复或重放只修改当前草稿，仍需“保存 IR”。旧记录保留供导出；多个标签页各自备份。</p>
      {candidates.map(record=>{
        let plan:ReturnType<typeof recoveryPlan>|null=null,problem='';
        try{plan=recoveryPlan(record,saved.ir,saved.workspaceId);}catch(error){problem=String(error);}
        const sameBase=record.baseRevision===saved.revision;
        return <article key={record.draftId} className="recovery-record"><strong>{new Date(record.updatedAt).toLocaleString()} · {sameBase?'保存基线相同':'保存基线已变化'}</strong>
          <p>{record.changes.length} 项旧修改；{plan?.commands.length??0} 项可重放，{plan?.conflicts.length??0} 项冲突，{plan?.alreadyApplied??0} 项已存在。</p>
          {problem&&<p className="invalid">{problem}</p>}
          <details><summary>查看旧修改与冲突</summary><ul>{record.changes.map(change=><li key={JSON.stringify([change.partId,change.field])}>{saved.ir.parts.find(part=>part.id===change.partId)?.name??change.partId} · {change.field}{plan?.conflicts.includes(change)?' · 冲突':''}<pre>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}</pre></li>)}</ul></details>
          <div className="recovery-actions"><button disabled={locked||loading||!!current?.dirty||!plan?.commands.length} onClick={()=>{
            setActionError('');try{editor.edit(plan!.commands);}catch(error){setActionError(String(error));}
          }}>{sameBase?'恢复草稿':'重放兼容修改'}</button><button onClick={()=>download(record)}>导出旧草稿</button><button disabled={loading} onClick={()=>{
            if(window.confirm('删除这份浏览器恢复记录？未导出的旧修改将无法从此记录恢复。'))void remove(record);
          }}>删除恢复记录</button></div>
          {!!current?.dirty&&<p className="muted">请先保存或放弃当前草稿，再选择恢复记录。</p>}
        </article>;
      })}
    </details>}
  </section>;
}
