import type { DraftController } from '../editor/DraftController';

export type WorkspaceOperation = {
  isCurrent(): boolean;
  block(): void;
  update(label: string): void;
  finish(): void;
};

/** Synchronous admission and owner-only cleanup; no queue or automatic retries. */
export class WorkspaceOperations {
  private active: WorkspaceOperation | null = null;
  private closed = false;
  constructor(private editor: Pick<DraftController, 'getSnapshot' | 'setBlocked'> | null, private busy: ((label: string) => void) | null) {}

  begin(label: string, deferBlock = false): WorkspaceOperation | null {
    if (this.closed || !this.editor) return null;
    const phase = this.editor.getSnapshot()?.phase;
    if (this.active || (phase && phase !== 'idle')) return null;
    const operation: WorkspaceOperation = {
      isCurrent: () => !this.closed && this.active === operation,
      block: () => { if (operation.isCurrent()) this.editor?.setBlocked(true); },
      update: label => { if (operation.isCurrent()) this.busy?.(label); },
      finish: () => {
        if (!operation.isCurrent()) return;
        this.active = null;
        this.editor?.setBlocked(false);
        this.busy?.('');
      },
    };
    this.active = operation;
    if (!deferBlock) operation.block();
    operation.update(label);
    return operation;
  }

  dispose(): void {
    this.closed = true;
    if (this.active) { this.active = null; this.editor?.setBlocked(false); }
    this.editor = null;
    this.busy = null;
  }
}
