import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ProjectCatalog, ProjectCreateResult, ProjectIssue } from '../protocol/generated';

export function ProjectStart() {
  const [catalog,setCatalog]=useState<ProjectCatalog|null>(null),[kind,setKind]=useState<'psd'|'archive'>('psd');
  const [file,setFile]=useState<File|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[issues,setIssues]=useState<ProjectIssue[]>([]);
  async function refresh() { setBusy(true);setError('');try{setCatalog(await api<ProjectCatalog>('catalog',{schemaVersion:1,operation:'list'}));}catch(e){setError(String(e));}finally{setBusy(false);} }
  useEffect(()=>{void refresh();},[]);
  async function create() {
    if (!file || !name.trim() || busy) return;
    setBusy(true);setError('');setIssues([]);
    try {
      if (file.size>128*1024*1024) throw new Error('文件超过 128 MiB，请选择较小的 PSD 或工程。');
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('文件读取失败'));reader.readAsDataURL(file);});
      const result=await api<ProjectCreateResult>('catalog',{schemaVersion:1,operation:'create',input:{schemaVersion:1,kind,name:name.trim(),data}});
      if(result.status==='unsupported'){setIssues(result.issues);setError('PSD 包含受限图层，尚未创建工程。请另存平面普通混合像素图层副本后导入。');}
      else if(result.project) window.location.assign('?project='+result.project.id);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <main className="project-start"><h1>Live2D Studio</h1><p>导入自己的 PSD 或打开 Studio 工程，继续美术编辑与模型构建。</p>
    <section className="panel"><h2>新建或打开工程</h2><fieldset disabled={busy}>
      <label>来源 <select aria-label="工程来源" value={kind} onChange={event=>{setKind(event.target.value as 'psd'|'archive');setFile(null);setIssues([]);}}><option value="psd">导入 PSD，新建工程</option><option value="archive">打开 Studio 工程归档</option></select></label>
      <label>{kind==='psd'?'PSD 文件':'Studio 工程文件'} <input key={kind} aria-label="工程文件" type="file" accept={kind==='psd'?'.psd':'.zip'} onChange={event=>{const next=event.target.files?.[0]||null;setFile(next);setName(next?.name.replace(/\.studio-project\.zip$|\.psd$|\.zip$/i,'')||'');setIssues([]);}}/></label>
      <label>工程名称 <input aria-label="工程名称" value={name} maxLength={128} onChange={event=>setName(event.target.value)}/></label>
      <button className="primary" disabled={!file||!name.trim()} onClick={()=>void create()}>{busy?'正在打开…':kind==='psd'?'导入 PSD':'打开工程归档'}</button>
    </fieldset><p>文件上限 128 MiB。PSD 支持平面、普通混合像素层；不会覆盖原文件或自动栅格化。Studio 归档与桌面 .psd2live 格式不同。</p></section>
    {error&&<p role="alert" className="notice error">{error}</p>}
    {!!issues.length&&<section className="panel"><h2>PSD 导入报告 · {issues.length} 项</h2><ul>{issues.map((issue,index)=><li key={index}><strong>{issue.name}</strong> · {issue.location}: {issue.reasons.join('；')}</li>)}</ul></section>}
    <section className="panel"><h2>最近工程</h2><button disabled={busy} onClick={()=>void refresh()}>刷新工程列表</button>
      {!catalog?.projects.length&&<p>尚无工程。选择 PSD 后即可新建。</p>}
      <ul>{catalog?.projects.map(project=><li key={project.id}><a href={'?project='+project.id}>{project.name}</a> · {project.parts} 图层 · {new Date(project.updatedAt).toLocaleString()}</li>)}</ul>
    </section><a href="?legacy=1">打开开发工作区</a>
  </main>;
}
