import { DraftSession } from './DraftSession';
import { same } from './commands';
import { DraftError, failure, type ArtworkIR, type DraftResult, type DraftState, type EditCommand, type SavedArtwork } from './contracts';

/** Shared boundary for UI and structured callers. Subscribers receive immutable snapshots. */
export class DraftController<T extends SavedArtwork = SavedArtwork> {
  private session: DraftSession | null = null;
  private snapshot: DraftState | null = null;
  private blocked = false;
  private listeners = new Set<() => void>();
  constructor(
    private persist: (proposal: { revision: string; ir: ArtworkIR }) => Promise<T>,
    private onSaved: (saved: T) => void,
    private id: () => string = () => crypto.randomUUID(),
  ) {}
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = (): DraftState | null => this.snapshot;
  getBase = (): SavedArtwork | null => this.session?.inspectBase() ?? null;
  install(ir: ArtworkIR, revision: string): void {
    if (this.session?.inspect().phase === 'saving') throw new DraftError('BUSY', '正在保存草稿');
    if (!this.session?.hasBase(ir, revision)) this.session = new DraftSession(ir, revision, this.id());
    this.publish();
  }
  setBlocked(blocked: boolean): void {
    if (this.blocked !== blocked) { this.blocked = blocked; this.session?.touch(); this.publish(); }
  }
  edit(commands: EditCommand[]): void { const session = this.ready(); session.apply(session.inspect(), commands); this.publish(); }
  beginGesture(): void { const session = this.ready(); session.beginGesture(session.inspect()); this.publish(); }
  updateGesture(commands: EditCommand[]): void { this.ready().updateGesture(commands); this.publish(); }
  endGesture(cancel: boolean): void { this.session?.endGesture(cancel); this.publish(); }

  async execute(input: unknown): Promise<DraftResult<T>> {
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DraftError('INVALID_REQUEST', '请求必须是对象');
      const request = input as Record<string, unknown>;
      const operation = request.operation;
      const operations = ['inspect', 'diff', 'apply', 'undo', 'redo', 'discard', 'commit'];
      const allowed = ['schemaVersion', 'operation', ...(['inspect', 'diff'].includes(String(operation)) ? [] : ['state']), ...(operation === 'apply' ? ['commands'] : [])];
      if (request.schemaVersion !== 1 || typeof operation !== 'string' || !operations.includes(operation) || Object.keys(request).some(key => !allowed.includes(key))) throw new DraftError('INVALID_REQUEST', '请求版本、操作或字段无效');
      if (!this.session) throw new DraftError('NOT_LOADED', '请先打开工作区');
      if (operation === 'inspect' || operation === 'diff') return this.result();
      const session = this.ready();
      if (operation === 'apply') session.apply(request.state, request.commands);
      else if (operation === 'undo') session.undo(request.state);
      else if (operation === 'redo') session.redo(request.state);
      else if (operation === 'discard') session.discard(request.state);
      else {
        // Even a clean commit validates its token before returning.
        const proposal = session.prepareSave(request.state);
        this.publish();
        if (!session.inspect().dirty) { session.releaseSave(); this.publish(); return this.result(); }
        try {
          const saved = await this.persist(proposal);
          if (!same(saved.ir, proposal.ir)) throw new DraftError('SAVE_MISMATCH', '保存响应与提交的 IR 不一致，请重新打开工作区核对');
          const next = new DraftSession(saved.ir, saved.revision, this.id());
          this.session = next;
          this.onSaved(saved);
          this.publish();
          return { ok: true, state: next.inspect(), saved };
        } catch (error) { session.releaseSave(); this.publish(); throw error; }
      }
      this.publish();
      return this.result();
    } catch (error) { return { ok: false, error: failure(error), state: this.read() }; }
  }
  private ready(): DraftSession {
    if (!this.session) throw new DraftError('NOT_LOADED', '请先打开工作区');
    if (this.blocked) throw new DraftError('BUSY', '工作区正在执行操作');
    return this.session;
  }
  private read(): DraftState | null {
    const state = this.session?.inspect() ?? null;
    if (state && this.blocked) state.phase = 'operation';
    return state;
  }
  private result(): DraftResult<T> { return { ok: true, state: this.read()! }; }
  private publish(): void { this.snapshot = this.read(); for (const listener of this.listeners) listener(); }
}
