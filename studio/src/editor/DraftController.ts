import { DraftSession } from './DraftSession';
import { same } from './commands';
import { DraftError, failure, type ArtworkIR, type DraftResult, type DraftReadResult, type DraftReadRequest, type DraftState, type EditCommand, type SavedArtwork } from './contracts';
import { parseDraftRequest } from '../protocol';

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
    if (this.session?.phase === 'saving') throw new DraftError('BUSY', '正在保存草稿');
    if (!this.session?.hasBase(ir, revision)) this.session = new DraftSession(ir, revision, this.id());
    this.publish();
  }
  setBlocked(blocked: boolean): void {
    if (this.blocked !== blocked) { this.blocked = blocked; this.session?.touch(); this.publish(); }
  }
  edit(commands: EditCommand[]): void { const session = this.ready(); session.apply(session.token(), commands); this.publish(); }
  beginGesture(): void { const session = this.ready(); session.beginGesture(session.token()); this.publish(); }
  updateGesture(commands: EditCommand[]): void { this.ready().updateGesture(commands); this.publish(); }
  endGesture(cancel: boolean): void { this.session?.endGesture(cancel); this.publish(); }

  execute(input: DraftReadRequest): Promise<DraftReadResult>;
  execute(input: unknown): Promise<DraftResult<T>>;
  async execute(input: unknown): Promise<DraftResult<T> | DraftReadResult> {
    let compact = false;
    try {
      const request = parseDraftRequest(input);
      const operation = request.operation;
      compact = 'response' in request && (request.response === 'summary' || request.response === 'parts');
      if (!this.session) throw new DraftError('NOT_LOADED', '请先打开工作区');
      if (request.operation === 'inspect' || request.operation === 'diff') {
        if (!compact) return this.result();
        const { ir, ...state } = this.snapshot!;
        const parts = request.response === 'parts' ? ir.parts.filter(part => !request.partIds || request.partIds.includes(part.id)) : undefined;
        const missing = request.partIds?.find(id => !ir.parts.some(part => part.id === id));
        if (missing !== undefined) throw new DraftError('PART_NOT_FOUND', '读取的图层不存在', missing);
        return { ok: true, state: structuredClone({ ...state, response: request.response as 'summary' | 'parts', ...(parts ? { parts } : {}) }) };
      }
      if (!('state' in request)) throw new DraftError('INVALID_REQUEST', '写命令缺少 state');
      const session = this.ready();
      if (operation === 'apply') session.apply(request.state, request.commands);
      else if (operation === 'undo') session.undo(request.state);
      else if (operation === 'redo') session.redo(request.state);
      else if (operation === 'discard') session.discard(request.state);
      else {
        // Even a clean commit validates its token before returning.
        const proposal = session.prepareSave(request.state);
        this.publish();
        if (!session.dirty) { session.releaseSave(); this.publish(); return this.result(); }
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
    } catch (error) { return { ok: false, error: failure(error), state: compact ? null : this.read() }; }
  }
  private ready(): DraftSession {
    if (!this.session) throw new DraftError('NOT_LOADED', '请先打开工作区');
    if (this.blocked) throw new DraftError('BUSY', '工作区正在执行操作');
    return this.session;
  }
  private read(): DraftState | null { return this.snapshot ? structuredClone(this.snapshot) : null; }
  private result(): DraftResult<T> { return { ok: true, state: this.read()! }; }
  private publish(): void {
    const state = this.session?.getSnapshot() ?? null;
    if (state === this.snapshot) return;
    this.snapshot = state && this.blocked ? Object.freeze({ ...state, phase: 'operation' }) : state;
    for (const listener of this.listeners) listener();
  }
}
