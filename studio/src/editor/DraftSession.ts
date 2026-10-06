import { applyCommands, diffArtwork, indexArtwork, same } from './commands';
import { DraftError, type ArtworkIR, type DraftChange, type DraftState, type DraftToken } from './contracts';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export class DraftSession {
  private base: ArtworkIR;
  private current: ArtworkIR;
  private revision = 0;
  private past: ArtworkIR[] = [];
  private future: ArtworkIR[] = [];
  private gesture: ArtworkIR | null = null;
  private saving = false;
  private index: ReadonlyMap<string, number>;
  private diffCache: { ir: ArtworkIR; changes: DraftChange[] } | null = null;
  private snapshot: DraftState | null = null;

  constructor(ir: ArtworkIR, readonly baseRevision: string, readonly draftId: string) {
    if (!ir || !Array.isArray(ir.parts) || !ir.canvas || typeof baseRevision !== 'string' || !baseRevision) throw new DraftError('INVALID_BASE', '缺少 IR 或保存版本');
    if (ir.parts.some(p => !p || typeof p.id !== 'string' || !p.id || !p.geometry || !Array.isArray(p.geometry.bbox) || p.geometry.bbox.length !== 4 || !p.geometry.bbox.every(v => Number.isFinite(v)))) throw new DraftError('INVALID_BASE', '图层 ID 或 geometry 无效');
    const ids = ir.parts.map(p => p.id);
    if (new Set(ids).size !== ids.length) throw new DraftError('INVALID_BASE', '图层 ID 必须唯一');
    this.base = structuredClone(ir);
    this.current = structuredClone(ir);
    // Commands cannot add, remove or reorder parts, so the index also serves history states.
    this.index = indexArtwork(this.base);
  }

  inspect(): DraftState {
    return structuredClone(this.getSnapshot());
  }

  token(): DraftToken { return { draftId: this.draftId, revision: this.revision }; }
  get phase(): DraftState['phase'] { return this.saving ? 'saving' : this.gesture ? 'gesture' : 'idle'; }
  get dirty(): boolean { return this.changes().length > 0; }

  /** One isolated, frozen snapshot per version for React; public inspect returns a mutable copy. */
  getSnapshot(): DraftState {
    if (this.snapshot) return this.snapshot;
    const changes = this.changes();
    this.snapshot = freeze(structuredClone({ schemaVersion: 1, draftId: this.draftId, revision: this.revision,
      baseRevision: this.baseRevision, ir: this.current, changes, dirty: changes.length > 0,
      canUndo: this.past.length > 0, canRedo: this.future.length > 0,
      phase: this.phase } as DraftState));
    return this.snapshot;
  }

  private changes(): DraftChange[] {
    if (this.diffCache?.ir !== this.current) this.diffCache = { ir: this.current, changes: diffArtwork(this.base, this.current, this.index) };
    return this.diffCache.changes;
  }

  hasBase(ir: ArtworkIR, revision: string): boolean { return revision === this.baseRevision && same(ir, this.base); }
  inspectBase(): { ir: ArtworkIR; revision: string } { return { ir: structuredClone(this.base), revision: this.baseRevision }; }
  touch(): void { this.revision++; this.snapshot = null; }

  apply(token: unknown, commands: unknown): void {
    this.check(token);
    const candidate = applyCommands(this.current, commands, this.index);
    if (diffArtwork(this.current, candidate, this.index).length === 0) return;
    this.past.push(this.current); this.future = []; this.current = candidate; this.touch();
  }

  undo(token: unknown): void {
    this.check(token);
    const previous = this.past.pop();
    if (previous) { this.future.push(this.current); this.current = previous; this.touch(); }
  }

  redo(token: unknown): void {
    this.check(token);
    const next = this.future.pop();
    if (next) { this.past.push(this.current); this.current = next; this.touch(); }
  }

  discard(token: unknown): void {
    this.check(token);
    if (!this.past.length && !this.future.length && !this.dirty) return;
    this.current = structuredClone(this.base); this.past = []; this.future = []; this.touch();
  }

  beginGesture(token: unknown): void { this.check(token); this.gesture = this.current; this.touch(); }
  updateGesture(commands: unknown): void {
    if (!this.gesture || this.saving) throw new DraftError('BUSY', '没有可编辑的拖拽事务');
    const candidate = applyCommands(this.current, commands, this.index);
    if (diffArtwork(this.current, candidate, this.index).length) { this.current = candidate; this.touch(); }
  }
  endGesture(cancel: boolean): void {
    if (!this.gesture) return;
    if (cancel) this.current = this.gesture;
    else if (diffArtwork(this.gesture, this.current, this.index).length) { this.past.push(this.gesture); this.future = []; }
    this.gesture = null; this.touch();
  }

  prepareSave(token: unknown): { revision: string; ir: ArtworkIR } {
    this.check(token); this.saving = true; this.touch();
    return { revision: this.baseRevision, ir: structuredClone(this.current) };
  }
  releaseSave(): void { this.saving = false; this.touch(); }

  private check(token: unknown): void {
    if (this.saving || this.gesture) throw new DraftError('BUSY', '草稿正在保存或拖拽');
    const expected = token as Partial<DraftToken> | null;
    if (!expected || expected.draftId !== this.draftId || expected.revision !== this.revision) {
      throw new DraftError('DRAFT_CONFLICT', '草稿版本已变化，请重新读取状态');
    }
  }
}
