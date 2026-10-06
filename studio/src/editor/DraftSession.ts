import { applyCommands, diffArtwork, same } from './commands';
import { DraftError, type ArtworkIR, type DraftState, type DraftToken } from './contracts';

export class DraftSession {
  private base: ArtworkIR;
  private current: ArtworkIR;
  private revision = 0;
  private past: ArtworkIR[] = [];
  private future: ArtworkIR[] = [];
  private gesture: ArtworkIR | null = null;
  private saving = false;

  constructor(ir: ArtworkIR, readonly baseRevision: string, readonly draftId: string) {
    if (!ir || !Array.isArray(ir.parts) || !ir.canvas || typeof baseRevision !== 'string' || !baseRevision) throw new DraftError('INVALID_BASE', '缺少 IR 或保存版本');
    if (ir.parts.some(p => !p || typeof p.id !== 'string' || !p.id || !p.geometry || !Array.isArray(p.geometry.bbox) || p.geometry.bbox.length !== 4 || !p.geometry.bbox.every(v => Number.isFinite(v)))) throw new DraftError('INVALID_BASE', '图层 ID 或 geometry 无效');
    const ids = ir.parts.map(p => p.id);
    if (new Set(ids).size !== ids.length) throw new DraftError('INVALID_BASE', '图层 ID 必须唯一');
    this.base = structuredClone(ir);
    this.current = structuredClone(ir);
  }

  inspect(): DraftState {
    const changes = diffArtwork(this.base, this.current);
    return structuredClone({ schemaVersion: 1, draftId: this.draftId, revision: this.revision,
      baseRevision: this.baseRevision, ir: this.current, changes, dirty: changes.length > 0,
      canUndo: this.past.length > 0, canRedo: this.future.length > 0,
      phase: this.saving ? 'saving' : this.gesture ? 'gesture' : 'idle' });
  }

  hasBase(ir: ArtworkIR, revision: string): boolean { return revision === this.baseRevision && same(ir, this.base); }
  inspectBase(): { ir: ArtworkIR; revision: string } { return { ir: structuredClone(this.base), revision: this.baseRevision }; }
  touch(): void { this.revision++; }

  apply(token: unknown, commands: unknown): void {
    this.check(token);
    const candidate = applyCommands(this.current, commands);
    if (diffArtwork(this.current, candidate).length === 0) return;
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
    if (!this.past.length && !this.future.length && diffArtwork(this.base, this.current).length === 0) return;
    this.current = structuredClone(this.base); this.past = []; this.future = []; this.touch();
  }

  beginGesture(token: unknown): void { this.check(token); this.gesture = this.current; this.touch(); }
  updateGesture(commands: unknown): void {
    if (!this.gesture || this.saving) throw new DraftError('BUSY', '没有可编辑的拖拽事务');
    const candidate = applyCommands(this.current, commands);
    if (diffArtwork(this.current, candidate).length) { this.current = candidate; this.touch(); }
  }
  endGesture(cancel: boolean): void {
    if (!this.gesture) return;
    if (cancel) this.current = this.gesture;
    else if (diffArtwork(this.gesture, this.current).length) { this.past.push(this.gesture); this.future = []; }
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
