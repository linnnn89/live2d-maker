import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { DraftController } from '../editor/DraftController';
import type { EditCommand } from '../editor/contracts';
import type { Snapshot } from '../protocol';
import type { ProjectRevisions } from '../protocol/generated';
import type { BuildSettings, BuildSettingsState } from '../protocol/generated';

/** Owns open/save/native-operation gates; views use the same editor and saved baseline. */
export function useWorkspaceActions() {
  const [saved,setSaved]=useState<Snapshot|null>(null);
  const [editor]=useState(()=>new DraftController<Snapshot>(proposal=>api<Snapshot>('save',proposal),setSaved));
  const draft=useSyncExternalStore(editor.subscribe,editor.getSnapshot),ir=draft?.ir,dirty=draft?.dirty??false;
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState('正在打开工作区…');
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [settingsPending,setSettingsPending]=useState(false);
  const [showQa,setShowQa]=useState(false),[showImport,setShowImport]=useState(false),[openAttempt,setOpenAttempt]=useState(0);
  const editingLocked=!!busy||draft?.phase!=='idle';
  const apply=(snapshot:Snapshot)=>{setSaved(snapshot);editor.install(snapshot.ir,snapshot.revision);};
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
    setBusy(route === 'save' ? '正在保存 IR…' : route === 'rebuild' ? '正在重建 PSD / moc3…' : '正在渲染 Pose QA…');
    setError(''); setMessage('');
    let gateAttempted = false;
    try {
      let current = saved;
      if (dirty) {
        const result = await editor.execute({ schemaVersion: 1, operation: 'commit', state: draft! });
        if (!result.ok) throw new Error(result.error.message);
        current = result.saved || current;
      }
      if (route !== 'save') { editor.setBlocked(true); gateAttempted = true; current = await api<Snapshot>(route); apply(current); }
      setMessage(route === 'save' ? 'IR 已保存' : route === 'rebuild' ? '重建完成，预览已刷新' : `Pose QA 完成 · ${current.qa?.poses} 个姿态`);
      if (route === 'qa') setShowQa(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Keep the displayed gate in sync with native failures while retaining the successful model.
      if (gateAttempted) { try { apply(await api<Snapshot>('snapshot')); } catch { /* Keep the original failure visible. */ } }
    }
    finally { editor.setBlocked(false); setBusy(''); }
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

  function openImport(){if(editingLocked||!ir||dirty)return;editor.setBlocked(true);setShowImport(true);}
  function closeImport(){setShowImport(false);editor.setBlocked(false);}
  async function commitImport(id:string,revision:string,partId:string){
    const imported=await api<Snapshot>('import-commit',{id,revision});
    apply(imported);setSelected(partId);closeImport();setError('');
    setMessage('素材已导入；请 Rebuild 更新模型，再运行 Pose QA');
  }
  function retryOpen(){setError('');setBusy('正在打开工作区…');setOpenAttempt(value=>value+1);}
  async function saveBuildSettings(settings: BuildSettings, settingsRevision: string, rebuild: boolean): Promise<BuildSettingsState | null> {
    if (!saved || editingLocked || dirty) return null;
    editor.setBlocked(true); setBusy('正在保存构建设置…'); setError(''); setMessage('');
    let settingsSaved: BuildSettingsState | null = null;
    try {
      const result = await api<Snapshot>('build-settings', {schemaVersion:1, revision:saved.revision, settingsRevision, settings});
      apply(result); settingsSaved = result.buildSettings!;
      if (rebuild) { setBusy('正在按新设置重建模型…'); apply(await api<Snapshot>('rebuild')); }
      setMessage(rebuild ? '构建设置已保存并采用，预览已刷新' : '构建设置已保存；重建后采用');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      if (settingsSaved) { try { apply(await api<Snapshot>('snapshot')); } catch { /* Preserve the failure and last successful snapshot. */ } }
    } finally { editor.setBlocked(false); setBusy(''); }
    return settingsSaved;
  }
  async function readBuildSettings() {
    if (editingLocked || dirty) return;
    editor.setBlocked(true); setBusy('正在读取构建设置…'); setError('');
    try { apply(await api<Snapshot>('snapshot')); setMessage('已读取当前构建设置'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { editor.setBlocked(false); setBusy(''); }
  }
  function applyProjectRevisions(revisions: ProjectRevisions) {
    setSaved(previous => {
      if (!previous?.project || previous.project.head === revisions.head) return previous;
      return { ...previous, project: { ...previous.project, head: revisions.head } };
    });
  }
  async function saveProject(head:string,message:string):Promise<ProjectRevisions|null> {
    if(!saved||editingLocked||settingsPending)return null;
    setBusy('正在保存工程修订…');setError('');
    try {
      let current=saved;
      if(dirty){const result=await editor.execute({schemaVersion:1,operation:'commit',state:draft!});if(!result.ok)throw new Error(result.error.message);current=result.saved||current;}
      editor.setBlocked(true);
      const result=await api<ProjectRevisions>('project-save',{schemaVersion:1,revision:current.revision,settingsRevision:current.buildSettings!.revision,overlayRevision:current.overlayRevision,posesRevision:current.poses?.revision,head,message});
      applyProjectRevisions(result);
      setMessage('工程修订已保存');return result;
    }catch(e){setError(e instanceof Error?e.message:String(e));return null;}finally{editor.setBlocked(false);setBusy('');}
  }
  async function restoreProject(head:string,id:string):Promise<boolean> {
    if(!saved||editingLocked||dirty||settingsPending)return false;
    editor.setBlocked(true);setBusy('正在恢复工程修订…');setError('');
    try{apply(await api<Snapshot>('project-restore',{schemaVersion:1,revision:saved.revision,settingsRevision:saved.buildSettings!.revision,overlayRevision:saved.overlayRevision,posesRevision:saved.poses?.revision,head,id}));setMessage('已恢复修订；恢复前状态保留为新修订');return true;}
    catch(e){setError(e instanceof Error?e.message:String(e));return false;}finally{editor.setBlocked(false);setBusy('');}
  }
  return {saved,applySnapshot:apply,editor,draft,ir,dirty,selected,setSelected,busy,message,error,setMessage,setError,editingLocked,
    showQa,setShowQa,showImport,openImport,closeImport,commitImport,retryOpen,action,edit,history,saveBuildSettings,readBuildSettings,
    settingsPending,setSettingsPending,setBusy,saveProject,restoreProject,applyProjectRevisions};
}
