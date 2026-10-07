import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { DraftController } from '../editor/DraftController';
import type { EditCommand } from '../editor/contracts';
import type { Snapshot } from '../protocol';
import type { ProjectRevisions } from '../protocol/generated';
import type { BuildSettings, BuildSettingsState } from '../protocol/generated';
import type { ModelExportResult } from '../protocol/generated';
import { WorkspaceOperations, type WorkspaceOperation } from './WorkspaceOperations';

/** Owns open/save/native-operation gates; views use the same editor and saved baseline. */
export function useWorkspaceActions() {
  const [saved,setSaved]=useState<Snapshot|null>(null);
  const [editor]=useState(()=>new DraftController<Snapshot>(proposal=>api<Snapshot>('save',proposal),setSaved));
  const draft=useSyncExternalStore(editor.subscribe,editor.getSnapshot),ir=draft?.ir,dirty=draft?.dirty??false;
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState('正在打开工作区…');
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [settingsPending,setSettingsPending]=useState(false);
  const operations=useRef<WorkspaceOperations|null>(null);
  const importOperation=useRef<WorkspaceOperation|null>(null);
  const [showQa,setShowQa]=useState(false),[showImport,setShowImport]=useState(false),[openAttempt,setOpenAttempt]=useState(0);
  const editingLocked=!!busy||draft?.phase!=='idle';
  const apply=(snapshot:Snapshot)=>{setSaved(snapshot);editor.install(snapshot.ir,snapshot.revision);};
  useEffect(() => {
    const owner = new WorkspaceOperations(editor, setBusy);
    operations.current = owner;
    return () => {
      owner.dispose();
      if (operations.current === owner) operations.current = null;
      importOperation.current = null;
    };
  }, [editor]);
  const beginOperation=(label:string,deferBlock=false)=>operations.current?.begin(label,deferBlock)??null;
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();
    async function open() {
      editor.setBlocked(true); setError(''); setBusy('正在打开工作区…');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await api<Snapshot>('open', undefined, controller.signal);
          if (cancelled) return;
          apply(result);
          setSelected(result.ir.parts.find(p => p.semantic.tag === 'FACE')?.id || result.ir.parts[0]?.id || '');
          editor.setBlocked(false); setBusy(''); return;
        } catch (e) {
          if (cancelled) return;
          if (e instanceof ApiError && e.code === 'BACKEND_BUSY' && e.retryable && attempt < 2) {
            setBusy(`工作区忙，正在重试（${attempt + 1}/2）…`);
            await new Promise<void>(resolve => { timer = window.setTimeout(resolve, (attempt + 1) * 1000); });
            if (cancelled) return;
          } else {
            setError(e instanceof Error ? e.message : String(e)); editor.setBlocked(false); setBusy(''); return;
          }
        }
      }
    }
    void open();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [openAttempt, editor]);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);

  async function action(route: 'save' | 'rebuild' | 'qa') {
    if (!saved || !ir || editingLocked) return;
    const operation=beginOperation(route === 'save' ? '正在保存 IR…' : route === 'rebuild' ? '正在重建 PSD / moc3…' : '正在渲染 Pose QA…',dirty);
    if(!operation)return;
    setError(''); setMessage('');
    let gateAttempted = false;
    try {
      let current = saved;
      if (dirty) {
        const saving = editor.execute({ schemaVersion: 1, operation: 'commit', state: draft! });
        operation.block();
        const result = await saving;
        if(!operation.isCurrent())return;
        if (!result.ok) throw new Error(result.error.message);
        current = result.saved || current;
      }
      if (route !== 'save') { gateAttempted = true; current = await api<Snapshot>(route); if(!operation.isCurrent())return; apply(current); }
      setMessage(route === 'save' ? 'IR 已保存' : route === 'rebuild' ? '重建完成，预览已刷新' : `Pose QA 完成 · ${current.qa?.poses} 个姿态`);
      if (route === 'qa') setShowQa(true);
    } catch (e) {
      if(!operation.isCurrent())return;
      setError(e instanceof Error ? e.message : String(e));
      // Keep the displayed gate in sync with native failures while retaining the successful model.
      if (gateAttempted) { try { const latest=await api<Snapshot>('snapshot');if(operation.isCurrent())apply(latest); } catch { /* Keep the original failure visible. */ } }
    }
    finally { operation.finish(); }
  }

  function edit(commands: EditCommand[]) {
    try { editor.edit(commands); setMessage(''); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
  }
  async function history(operation: 'undo' | 'redo' | 'discard') {
    if (!draft || editingLocked) return;
    const result = await editor.execute({ schemaVersion: 1, operation, state: draft });
    if (!result.ok) setError(result.error.message);
    else { setError(''); setMessage(operation === 'discard' ? '已放弃草稿，恢复已保存 IR' : ''); }
  }

  function openImport(){if(editingLocked||!ir||dirty)return;const operation=beginOperation('');if(!operation)return;importOperation.current=operation;setShowImport(true);}
  function closeImport(){const operation=importOperation.current;if(!operation?.isCurrent())return;setShowImport(false);operation.finish();importOperation.current=null;}
  async function commitImport(id:string,revision:string,partId:string){
    const operation=importOperation.current;if(!operation?.isCurrent())return;
    const imported=await api<Snapshot>('import-commit',{id,revision});
    if(!operation.isCurrent())return;
    apply(imported);setSelected(partId);closeImport();setError('');
    setMessage('素材已导入；请 Rebuild 更新模型，再运行 Pose QA');
  }
  function retryOpen(){setError('');setBusy('正在打开工作区…');setOpenAttempt(value=>value+1);}
  async function saveBuildSettings(settings: BuildSettings, settingsRevision: string, rebuild: boolean): Promise<BuildSettingsState | null> {
    if (!saved || editingLocked || dirty) return null;
    const operation=beginOperation('正在保存构建设置…');if(!operation)return null;
    setError(''); setMessage('');
    let settingsSaved: BuildSettingsState | null = null;
    try {
      const result = await api<Snapshot>('build-settings', {schemaVersion:1, revision:saved.revision, settingsRevision, settings});
      if(!operation.isCurrent())return null;
      apply(result); settingsSaved = result.buildSettings!;
      if (rebuild) { operation.update('正在按新设置重建模型…');const built=await api<Snapshot>('rebuild');if(!operation.isCurrent())return null;apply(built); }
      setMessage(rebuild ? '构建设置已保存并采用，预览已刷新' : '构建设置已保存；重建后采用');
    } catch (failure) {
      if(!operation.isCurrent())return null;
      setError(failure instanceof Error ? failure.message : String(failure));
      if (settingsSaved) { try { const latest=await api<Snapshot>('snapshot');if(operation.isCurrent())apply(latest); } catch { /* Preserve the failure and last successful snapshot. */ } }
    } finally { operation.finish(); }
    return settingsSaved;
  }
  async function readBuildSettings() {
    if (editingLocked || dirty) return;
    const operation=beginOperation('正在读取构建设置…');if(!operation)return;setError('');
    try { const result=await api<Snapshot>('snapshot');if(!operation.isCurrent())return;apply(result); setMessage('已读取当前构建设置'); }
    catch (failure) { if(operation.isCurrent())setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { operation.finish(); }
  }
  function applyProjectRevisions(revisions: ProjectRevisions) {
    setSaved(previous => {
      if (!previous?.project || previous.project.head === revisions.head) return previous;
      return { ...previous, project: { ...previous.project, head: revisions.head } };
    });
  }
  function applyExport(result: ModelExportResult) {
    setSaved(previous => previous ? { ...previous, export: { result, current: true } } : previous);
  }
  async function saveProject(head:string,message:string):Promise<ProjectRevisions|null> {
    if(!saved||editingLocked||settingsPending)return null;
    const operation=beginOperation('正在保存工程修订…',dirty);if(!operation)return null;setError('');
    try {
      let current=saved;
      if(dirty){const saving=editor.execute({schemaVersion:1,operation:'commit',state:draft!});operation.block();const result=await saving;if(!operation.isCurrent())return null;if(!result.ok)throw new Error(result.error.message);current=result.saved||current;}
      const result=await api<ProjectRevisions>('project-save',{schemaVersion:1,revision:current.revision,settingsRevision:current.buildSettings!.revision,overlayRevision:current.overlayRevision,posesRevision:current.poses?.revision,head,message});
      if(!operation.isCurrent())return null;
      applyProjectRevisions(result);
      setMessage('工程修订已保存');return result;
    }catch(e){if(operation.isCurrent())setError(e instanceof Error?e.message:String(e));return null;}finally{operation.finish();}
  }
  async function restoreProject(head:string,id:string):Promise<boolean> {
    if(!saved||editingLocked||dirty||settingsPending)return false;
    const operation=beginOperation('正在恢复工程修订…');if(!operation)return false;setError('');
    try{const result=await api<Snapshot>('project-restore',{schemaVersion:1,revision:saved.revision,settingsRevision:saved.buildSettings!.revision,overlayRevision:saved.overlayRevision,posesRevision:saved.poses?.revision,head,id});if(!operation.isCurrent())return false;apply(result);setMessage('已恢复修订；恢复前状态保留为新修订');return true;}
    catch(e){if(operation.isCurrent())setError(e instanceof Error?e.message:String(e));return false;}finally{operation.finish();}
  }
  return {saved,applySnapshot:apply,editor,draft,ir,dirty,selected,setSelected,busy,message,error,setMessage,setError,editingLocked,
    showQa,setShowQa,showImport,openImport,closeImport,commitImport,retryOpen,action,edit,history,saveBuildSettings,readBuildSettings,
    settingsPending,setSettingsPending,beginOperation,saveProject,restoreProject,applyProjectRevisions,applyExport};
}
