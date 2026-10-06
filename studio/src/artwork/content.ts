import type { ArtworkIR } from '../editor/contracts';
import { ArtworkError } from './contracts';

/** Only data that contributes pixels. Editor tokens and annotations remain independent. */
export function artworkKey(ir: ArtworkIR): string {
  return JSON.stringify([ir.canvas.width, ir.canvas.height,
    [...ir.parts].sort((a, b) => a.z - b.z)
      .filter(part => part.appearance?.visible !== false && part.appearance?.opacity !== 0)
      .map(part => [part.id, part.asset.path, part.asset.sha256, part.asset.size, part.asset.offset,
        part.geometry.polygon, part.appearance?.opacity ?? 255])]);
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ArtworkError('ABORTED', '画面已被更新的草稿替代');
}

export function renderControl(signal?: AbortSignal, yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0)), sliceMs = 8) {
  let last = performance.now();
  return async () => {
    checkCancelled(signal);
    if (performance.now() - last >= sliceMs) { await yieldTask(); last = performance.now(); checkCancelled(signal); }
  };
}
