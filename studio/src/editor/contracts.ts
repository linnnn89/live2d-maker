import { ProtocolError, errorDetail } from '../protocol';
import type { ArtworkIR, DraftToken, Part, StudioError } from '../protocol';
export type { ArtworkIR, Bounds, DraftRequest, DraftToken, EditCommand, Part, Point } from '../protocol';
export type SavedArtwork = { ir: ArtworkIR; revision: string };
export type DraftChange = { partId: string; field: string; before: unknown; after: unknown };
export type HistoryStatus = {
  undoSteps: number; redoSteps: number; retainedBytes: number;
  maxSteps: number; maxBytes: number; droppedSteps: number;
};
export type DraftState = DraftToken & {
  schemaVersion: 1; baseRevision: string; ir: ArtworkIR;
  dirty: boolean; changes: DraftChange[]; canUndo: boolean; canRedo: boolean;
  phase: 'idle' | 'gesture' | 'saving' | 'operation';
  history: HistoryStatus;
};
export type DraftFailure = StudioError;
export type DraftReadState = Omit<DraftState, 'ir'> & { response: 'summary' | 'parts'; parts?: Part[] };
export type DraftReadResult = { ok: true; state: DraftReadState } | { ok: false; error: DraftFailure; state: null };
export type DraftReadRequest = { schemaVersion: 1; operation: 'inspect' | 'diff'; response: 'summary' | 'parts'; partIds?: string[] };
export type DraftResult<T extends SavedArtwork = SavedArtwork> =
  | { ok: true; state: DraftState; saved?: T }
  | { ok: false; error: DraftFailure; state: DraftState | null };

export class DraftError extends ProtocolError {
  constructor(code: string, message: string, partId?: string, field?: string) { super(code, message, 'draft', code === 'BUSY', partId, field); }
}

export function failure(error: unknown): DraftFailure {
  return errorDetail(error, 'SAVE_FAILED', 'save');
}
