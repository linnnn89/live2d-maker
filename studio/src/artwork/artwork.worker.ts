import { ArtworkRenderer } from './ArtworkRenderer';
import { AssetCache, fetchAsset } from './AssetCache';
import { encodeFrame } from './png';
import type { ArtworkIR } from '../editor/contracts';
import { ArtworkError } from './contracts';

type Job = { id: number; kind: 'render' | 'capture'; ir: ArtworkIR };
const renderer = new ArtworkRenderer(new AssetCache(fetchAsset).get);
let queue: Job[] = [], running = false;
const sendError = (id: number, error: unknown) => postMessage({ id, ok: false, error: {
  code: error instanceof ArtworkError ? error.code : 'RENDER_FAILED',
  message: error instanceof Error ? error.message : String(error),
  partId: error instanceof ArtworkError ? error.partId : undefined,
} });

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      const frame = await renderer.render(job.ir);
      if (job.kind === 'capture') postMessage({ id: job.id, ok: true, value: { width: frame.width, height: frame.height, bounds: frame.bounds, dataUrl: encodeFrame(frame) } });
      else postMessage({ id: job.id, ok: true, value: frame }, { transfer: [frame.data.buffer] });
    } catch (error) { sendError(job.id, error); }
  }
  running = false;
}

onmessage = (event: MessageEvent<Job>) => {
  if (event.data.kind === 'render') {
    // Display needs the latest requested frame; explicit captures keep their place.
    for (const job of queue) if (job.kind === 'render') sendError(job.id, new ArtworkError('ABORTED', '画面已被更新的草稿替代'));
    queue = queue.filter(job => job.kind !== 'render');
  }
  queue.push(event.data);
  void drain();
};
