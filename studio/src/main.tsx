import { createRoot } from 'react-dom/client';
import './style.css';
import { ImportGenerated } from './ImportGenerated';
import { useModelPreview } from './viewer/useModelPreview';
import {ParameterPanel} from './model/ParameterPanel';
import { RecoveryPanel } from './recovery/RecoveryPanel';
import { WorkspaceProvider,useWorkspace } from './workspace/WorkspaceContext';
import { ArtworkWorkspace } from './workspace/ArtworkWorkspace';
import { LayerList } from './workspace/LayerList';
import { Icon } from './workspace/Icon';
import { BuildSettingsPanel } from './workspace/BuildSettingsPanel';
import { ProjectStart } from './project/ProjectStart';
import { ProjectPanel } from './project/ProjectPanel';
import { ModelExportPanel } from './project/ModelExportPanel';
function App(){
  const {saved,editor,draft,ir,dirty,selected,busy,message,error,editingLocked,showQa,setShowQa,showImport,
    openImport,closeImport,commitImport,retryOpen,action,history}=useWorkspace();
  const modelUrl=saved?.build?.modelUrl;
  const {attachFrame,onLoad,parameters,previewStatus,setParameter,reset,applyPose}=useModelPreview(modelUrl,saved?.build?.modelBounds,!!saved);
  const stale = (stage: string) => dirty || saved?.stale[stage];
  const overlayStatus = dirty && saved?.overlay.status !== 'not-loaded' ? 'needs-review' : saved?.overlay.status;
  const previewSource = !saved?.build ? '尚未生成模型'
    : dirty ? '上次生成模型 · 当前有未保存修改'
    : saved.stale.moc3 ? '上次生成模型 · 已保存修改尚未更新'
    : '当前已保存版本的模型';

  return <div className="app">
    <header className="topbar"><h1>Live2D <span>Studio</span></h1><div className="document-name">{saved?.project?.name || ir?.metadata?.name || '工作区'} · {ir?.parts.length || 0} 图层</div><div className="actions">
      <button disabled={editingLocked || !ir || dirty} title={dirty ? '请先保存 IR 再导入素材' : '放置透明 PNG、设置可编辑区并检查导入'} onClick={openImport}>导入素材</button>
      <button disabled={editingLocked || !draft?.canUndo} onClick={() => history('undo')}>撤销</button>
      <button disabled={editingLocked || !draft?.canRedo} onClick={() => history('redo')}>重做</button>
      <button disabled={editingLocked || !dirty} onClick={() => history('discard')}>放弃草稿</button>
      <button disabled={editingLocked || !dirty} onClick={() => action('save')}><Icon name="save"/>保存 IR</button>
      <button className="primary" disabled={editingLocked || !ir} onClick={() => action('rebuild')}><Icon name="rebuild"/>Rebuild</button>
      <button className="primary" disabled={editingLocked || !saved?.build || !!stale('moc3')} onClick={() => action('qa')}><Icon name="play"/>Run Pose QA</button>
    </div></header>
    {(busy || error || message) && <div className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error || busy || message}{!saved && !busy && <button onClick={retryOpen}>重新打开工作区</button>}</div>}
    <RecoveryPanel key={saved?.workspaceId??'unloaded'} saved={saved} editor={editor} locked={editingLocked}/>
    <main className="workspace">
      <LayerList/><ArtworkWorkspace/>
      <aside className="preview-column"><section className="panel preview-panel"><div className="panel-heading"><h2>Cubism 预览</h2><span className="preview-status">{previewStatus}</span></div><p className="canvas-reference" role="status">{previewSource}</p><div className="preview checker">
        {modelUrl && ir ? <iframe key={modelUrl} ref={attachFrame} title="Cubism 实时预览" onLoad={onLoad} src={'/live2d-viewer/index.html?' + new URLSearchParams({ model: modelUrl, vendor: '/public/vendor/cubism/', canvaspx: `${ir.canvas.width},${ir.canvas.height}`, w: '640', h: '760', embed: '1' })}/> : <div className="empty">点击 Rebuild 生成预览</div>}
      </div></section>
      <ParameterPanel parameters={parameters} setParameter={setParameter} reset={reset} applyPose={applyPose}/>
      <BuildSettingsPanel/>
      <ProjectPanel/>
      <ModelExportPanel/>
      {saved?.qa && <button className="qa-result" onClick={() => setShowQa(true)}>查看 Pose QA · {saved.qa.poses} 个姿态</button>}
      {saved?.build && <details className="build-notes"><summary>导出审计 · {saved.build.labelCount ?? '未知'} 层 · {(saved.build.warnings ?? []).length} 条警告</summary><p>原生导出审计与警告保留供复核。</p><ul>{(saved.build.warnings ?? []).map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      </aside>
    </main>
    {showImport && saved && ir && <ImportGenerated revision={saved.revision} ir={ir} selectedId={selected} onClose={closeImport} onCommit={commitImport}/>}
    <footer><span className={!saved ? 'muted' : dirty ? 'pending' : ''}>● {!saved ? 'IR 未加载' : dirty ? 'IR 未保存' : 'IR 已保存'}</span><div>{[['psd', 'PSD'], ['base_rig', '模型'], ['review', 'Pose QA']].map(([stage, label]) => <span key={stage} className={!saved ? 'muted' : stale(stage) ? 'pending' : 'valid'}>● {label} {!saved ? '状态未知' : stale(stage) ? '待更新' : '已更新'}</span>)}<span className={overlayStatus === 'broken' ? 'invalid' : overlayStatus === 'ok' ? 'valid' : overlayStatus === 'needs-review' ? 'pending' : 'muted'} title={dirty ? 'IR 未保存，Overlay 需重新核对' : saved?.overlay.reasons.join('\n')}>● Overlay {!saved ? '未加载' : overlayStatus === 'not-loaded' ? '未载入' : overlayStatus}</span></div></footer>
    {showQa && saved?.qa && <div className="modal-backdrop"><section className="qa-modal" role="dialog" aria-modal="true" aria-label="Pose QA 结果"><div className="panel-heading"><h2>Pose QA · {saved.qa.poses} 个姿态{stale('review') ? '（旧版本）' : ''}</h2><div><a href={saved.qa.reviewUrl} target="_blank" rel="noreferrer">review.json</a><button onClick={() => setShowQa(false)}>关闭</button></div></div><img src={saved.qa.contactSheet} alt="Pose QA 姿态联系表"/></section></div>}
  </div>;
}

const entry=new URLSearchParams(window.location.search);
createRoot(document.getElementById('root')!).render(entry.has('project')||entry.has('legacy')?<WorkspaceProvider><App/></WorkspaceProvider>:<ProjectStart/>);
