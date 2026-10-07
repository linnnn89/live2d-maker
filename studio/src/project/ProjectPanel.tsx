import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ProjectDownload, ProjectRevisions } from '../protocol/generated';
import { useWorkspace } from '../workspace/WorkspaceContext';

export function ProjectPanel() {
  const { saved, dirty, editingLocked, settingsPending, setError, beginOperation,
    saveProject, restoreProject, applyProjectRevisions } = useWorkspace();
  const [history, setHistory] = useState<ProjectRevisions | null>(null);
  const [message, setMessage] = useState('保存项目');
  const [historyError, setHistoryError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const project = new URLSearchParams(window.location.search).get('project');
  const readKey = useRef('');
  const keyFor = (head: string | null | undefined) => `${project}:${saved?.workspaceId}:${head}:${refreshVersion}`;
  const key = keyFor(saved?.project?.head);

  async function refresh() {
    if (editingLocked) return;
    const operation = beginOperation('正在读取工程修订…');
    if (!operation) return;
    // Record attempts too: a failed read is retried explicitly, never in an effect loop.
    readKey.current = key;
    setHistoryError('');
    try {
      const result = await api<ProjectRevisions>('project-revisions');
      if (!operation.isCurrent()) return;
      readKey.current = keyFor(result.head);
      setHistory(result);
      applyProjectRevisions(result);
    } catch (failure) {
      if (!operation.isCurrent()) return;
      setHistory(null);
      setHistoryError('修订列表读取失败；已完成的工程操作仍然有效，请重试读取：'
        + (failure instanceof Error ? failure.message : String(failure)));
    } finally {
      operation.finish();
    }
  }

  useEffect(() => {
    if (project && saved && !editingLocked && readKey.current !== key) void refresh();
  }, [key, editingLocked]);

  if (!project || !saved) return null;
  const locked = editingLocked || settingsPending;

  async function save() {
    if (!history) return;
    const result = await saveProject(history.head, message);
    if (result) {
      readKey.current = keyFor(result.head);
      setHistory(result);
      setHistoryError('');
    }
  }

  async function restore(id: string) {
    if (!history || !await restoreProject(history.head, id)) return;
    // Restoring HEAD itself still appends the backup revision, so a head-only key is insufficient.
    setHistory(null);
    setRefreshVersion(value => value + 1);
  }

  async function download() {
    if (locked || dirty) return;
    const operation = beginOperation('正在归档工程…');
    if (!operation) return;
    setError('');
    try {
      const result = await api<ProjectDownload>('project-archive');
      if (!operation.isCurrent()) return;
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.click();
    } catch (failure) {
      if (operation.isCurrent()) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      operation.finish();
    }
  }

  return <details className="project-panel"><summary>工程保存与修订</summary>
    <p>保存项目生成独立修订；恢复前自动保存当前状态，原素材和旧修订保留。</p>
    {settingsPending && <p>请先保存或放弃构建设置输入。</p>}
    {historyError && <p role="alert" className="invalid">{historyError}</p>}
    <label>修订说明 <input aria-label="修订说明" value={message} maxLength={1000} disabled={locked}
      onChange={event => setMessage(event.target.value)}/></label>
    <div className="settings-actions">
      <button disabled={locked || !history} onClick={() => void save()}>保存项目修订</button>
      <button disabled={locked || dirty} onClick={() => void download()}>下载 Studio 工程</button>
      <button disabled={locked} onClick={() => void refresh()}>读取修订记录</button>
      <a href="?">返回项目列表</a>
    </div>
    <ul>{history?.revisions.map(record => <li key={record.id}>
      <strong>{record.message || '未填写说明'}</strong> · {new Date(record.createdAt).toLocaleString()}
      {record.id === history.head ? ' · 当前保存修订' : ''}
      <button disabled={locked || dirty} onClick={() => void restore(record.id)}>恢复此修订</button>
    </li>)}</ul>
  </details>;
}
