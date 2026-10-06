import type { ArtworkIR, DraftFailure } from '../editor/contracts';
import { ArtworkError, type PixelFrame, type PngFrame } from './contracts';

/** Heavy pixel work stays off the UI thread. Only captures encode PNG. */
export class ArtworkClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve(value: PixelFrame | PngFrame): void; reject(error: Error): void }>();
  render(ir: ArtworkIR): Promise<PixelFrame> { return this.request('render', ir) as Promise<PixelFrame>; }
  capture(ir: ArtworkIR): Promise<PngFrame> { return this.request('capture', ir) as Promise<PngFrame>; }
  dispose(): void {
    this.worker?.terminate(); this.worker = null;
    this.rejectAll(new ArtworkError('ABORTED', '预览已关闭'));
  }
  private request(kind: 'render' | 'capture', ir: ArtworkIR): Promise<PixelFrame | PngFrame> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./artwork.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; value: PixelFrame | PngFrame; error: DraftFailure }>) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        this.pending.delete(event.data.id);
        if (event.data.ok) pending.resolve(event.data.value);
        else pending.reject(new ArtworkError(event.data.error.code, event.data.error.message, event.data.error.partId));
      };
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.rejectAll(new ArtworkError('RENDER_FAILED', '美术渲染线程发生错误，请重试')); };
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.worker!.postMessage({ id, kind, ir }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  private rejectAll(error: Error): void { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
}
