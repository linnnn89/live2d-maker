import type { DraftState, SavedArtwork, ArtworkIR } from '../editor/contracts';
import { ArtworkError, type CaptureResult, type PngFrame } from './contracts';

/** Optimistic read: never label asynchronously rendered pixels with a newer token. */
export async function captureArtwork(input: unknown,
  read: () => DraftState | null,
  base: () => SavedArtwork | null,
  capture: (ir: ArtworkIR) => Promise<PngFrame>,
): Promise<CaptureResult> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ArtworkError('INVALID_REQUEST', '图像请求必须是对象');
    const request = input as Record<string, unknown>;
    if (request.schemaVersion !== 1 || Object.keys(request).some(key => !['schemaVersion', 'state', 'source'].includes(key)) || (request.source !== undefined && request.source !== 'draft' && request.source !== 'saved')) throw new ArtworkError('INVALID_REQUEST', '图像请求版本、来源或字段无效');
    const initial = read();
    if (!initial) throw new ArtworkError('NOT_LOADED', '请先打开工作区');
    const token = request.state as Partial<DraftState> | null;
    if (!token || token.draftId !== initial.draftId || token.revision !== initial.revision) throw new ArtworkError('DRAFT_CONFLICT', '草稿版本已变化，请重新读取状态');
    if (initial.phase !== 'idle') throw new ArtworkError('BUSY', '请等待当前编辑或工作区操作完成');
    const source = request.source === 'saved' ? 'saved' : 'draft';
    const saved = source === 'saved' ? base() : null;
    if (source === 'saved' && (!saved || saved.revision !== initial.baseRevision)) throw new ArtworkError('BASE_CONFLICT', '保存基线已变化，请重新读取状态');
    const frame = await capture(structuredClone(saved?.ir ?? initial.ir));
    const latest = read();
    if (!latest || latest.draftId !== initial.draftId || latest.revision !== initial.revision) throw new ArtworkError('DRAFT_CONFLICT', '图像生成期间草稿已变化，请重新读取状态');
    return { ok: true, image: { ...frame, mimeType: 'image/png', renderVersion: 1, source,
      draftId: initial.draftId, revision: initial.revision, baseRevision: initial.baseRevision } };
  } catch (error) {
    return { ok: false, error: { code: error instanceof ArtworkError ? error.code : 'RENDER_FAILED',
      message: error instanceof Error ? error.message : String(error), partId: error instanceof ArtworkError ? error.partId : undefined } };
  }
}
