import { useWorkspace } from './WorkspaceContext';
export function DraftDiff(){const {ir,draft}=useWorkspace();return <><details className="draft-diff"><summary>草稿修改 · {draft?.changes.length || 0} 项</summary>
          {draft?.changes.length ? <ul>{draft.changes.map(change => <li key={change.partId + ':' + change.field}>
            <strong>{ir?.parts.find(p => p.id === change.partId)?.name} · {change.partId}</strong><code>{change.field}</code>
            <span>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}</span>
          </li>)}</ul> : <p>与已保存 IR 一致。</p>}
        </details>
        {!!draft?.history.droppedSteps && <p className="canvas-reference" role="status">历史保留上限已生效，较早或超出预算的步骤未保留。当前可撤销 {draft.history.undoSteps} 步、重做 {draft.history.redoSteps} 步；放弃草稿仍可恢复已保存版本。</p>}</>;}
