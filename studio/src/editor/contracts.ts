export type Point = [number, number];
export type Bounds = [number, number, number, number];
export type Part = {
  id: string; name: string; z: number;
  asset: { path: string; offset: { left: number; top: number }; size: { width: number; height: number }; [key: string]: unknown };
  geometry: { bbox: Bounds; polygon?: Point[]; landmarks?: Record<string, Point>; [key: string]: unknown };
  appearance?: { visible: boolean; opacity: number };
  semantic: { tag: string; side: string; [key: string]: unknown };
  [key: string]: unknown;
};
export type ArtworkIR = { canvas: { width: number; height: number }; parts: Part[]; metadata?: { name?: string }; [key: string]: unknown };
export type SavedArtwork = { ir: ArtworkIR; revision: string };
export type DraftToken = { draftId: string; revision: number };
export type EditCommand =
  | { type: 'set_visibility'; partId: string; visible: boolean }
  | { type: 'set_opacity'; partId: string; opacity: number }
  | { type: 'set_polygon'; partId: string; points: Point[] }
  | { type: 'set_landmark'; partId: string; name: string; point: Point }
  | { type: 'remove_landmark'; partId: string; name: string };
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
export type DraftRequest =
  | { schemaVersion: 1; operation: 'inspect' | 'diff' }
  | { schemaVersion: 1; operation: 'apply'; state: DraftToken; commands: EditCommand[] }
  | { schemaVersion: 1; operation: 'undo' | 'redo' | 'discard' | 'commit'; state: DraftToken };
export type DraftFailure = { code: string; message: string; partId?: string; field?: string };
export type DraftResult<T extends SavedArtwork = SavedArtwork> =
  | { ok: true; state: DraftState; saved?: T }
  | { ok: false; error: DraftFailure; state: DraftState | null };

export class DraftError extends Error {
  constructor(readonly code: string, message: string, readonly partId?: string, readonly field?: string) { super(message); }
}

export function failure(error: unknown): DraftFailure {
  return error instanceof DraftError ? { code: error.code, message: error.message, partId: error.partId, field: error.field }
    : { code: 'SAVE_FAILED', message: error instanceof Error ? error.message : String(error) };
}
