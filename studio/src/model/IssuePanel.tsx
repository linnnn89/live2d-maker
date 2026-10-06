import {useWorkspace} from '../workspace/WorkspaceContext';
export function IssuePanel(){
  const {saved,setSelected,editingLocked,action}=useWorkspace();
  if(!saved)return null;
  function locate(){const panel=document.querySelector<HTMLDetailsElement>('.rig-edit-panel');if(panel){panel.open=true;panel.scrollIntoView({block:'nearest'});}}
  return <details className="issue-panel" open={!!saved.issues?.length}><summary>模型问题 · {saved.issues?.length??0} 项</summary><ul>{saved.issues?.map((issue,index)=><li key={index}><strong>{issue.severity==='error'?'错误':issue.severity==='warning'?'警告':'提示'} · {issue.stage}</strong><p>{issue.message}</p>{issue.field&&<p>参数/字段：{issue.field}</p>}<button disabled={editingLocked} onClick={()=>issue.action==='select-part'&&issue.partId?setSelected(issue.partId):issue.action==='show-overlay'?locate():void action('rebuild')}>{issue.action==='select-part'?'定位图层与部件设置':issue.action==='show-overlay'?'查看模型修改与证据':'更新模型'}</button></li>)}</ul>{!saved.issues?.length&&<p>当前无分类或模型编辑阻断项；导出警告和姿态图仍需复核。</p>}</details>;
}
