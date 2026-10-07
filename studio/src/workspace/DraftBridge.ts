import type { DraftController } from '../editor/DraftController';
import type { ArtworkIR, DraftReadRequest, DraftReadResult, DraftRequest, DraftResult, SavedArtwork } from '../editor/contracts';
import { captureArtwork } from '../artwork/capture';
import type { CaptureRequest, CaptureResult, PngFrame } from '../artwork/contracts';

/** One mounted host owns one bridge. Closing it also releases retained editor/render references. */
export function createDraftBridge<T extends SavedArtwork>(editor: DraftController<T>, capture: (ir: ArtworkIR) => Promise<PngFrame>) {
  let owner: DraftController<T> | null = editor;
  let render: typeof capture | null = capture;
  const closed = { code: 'ABORTED', message: '工作区已关闭，请使用当前工作区入口', stage: 'draft', retryable: false };

  function execute(request: DraftReadRequest): Promise<DraftReadResult>;
  function execute(request: DraftRequest): Promise<DraftResult<T>>;
  async function execute(request: unknown): Promise<DraftResult<T> | DraftReadResult> {
    const current = owner;
    if (!current) return { ok: false, error: closed, state: null };
    const result = await current.execute(request);
    return owner === current ? result : { ok: false, error: closed, state: null };
  }

  const bridge = { schemaVersion: 1 as const, execute,
    async capture(request: CaptureRequest): Promise<CaptureResult> {
      const current = owner, renderer = render;
      if (!current || !renderer) return { ok: false, error: closed };
      const result = await captureArtwork(request, current.getSnapshot, current.getBase, renderer);
      return owner === current ? result : { ok: false, error: closed };
    },
  };
  return { bridge, dispose() { owner = null; render = null; } };
}
