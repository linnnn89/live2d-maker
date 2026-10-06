import type { DraftState, SavedArtwork, ArtworkIR } from '../editor/contracts';
import { ArtworkError, type CaptureResult, type PngFrame } from './contracts';
import { validateProtocol, errorDetail, type CaptureRequest } from '../protocol';

/** Optimistic read: never label asynchronously rendered pixels with a newer token. */
export async function captureArtwork(input: unknown,
  read: () => DraftState | null,
  base: () => SavedArtwork | null,
  capture: (ir: ArtworkIR) => Promise<PngFrame>,
): Promise<CaptureResult> {
  try {
    validateProtocol('CaptureRequest', input);
    const request = input as CaptureRequest;
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
    return { ok: false, error: errorDetail(error, 'RENDER_FAILED', 'artwork') };
  }
}
