import type { ArtworkIR, DraftFailure } from '../editor/contracts';
import { ArtworkError, type PixelFrame, type PngFrame } from './contracts';
import { MAX_CAPTURES, MAX_IR_BYTES } from './MemoryBudget';

type Job = { id: number; kind: 'render' | 'capture'; ir: ArtworkIR; cancelled?: boolean;
  resolve(value: PixelFrame | PngFrame): void; reject(error: unknown): void };

/** Heavy pixel work stays off the UI thread. Only captures encode PNG. */
export class ArtworkClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private active: Job | null = null;
  private queue: Job[] = [];
  private metrics: Record<string, number> = {};
  constructor(private createWorker = () => new Worker(new URL('./artwork.worker.ts', import.meta.url), { type: 'module' })) {}
  get stats() { return { ...this.metrics, activeJobs: this.active ? 1 : 0, queuedJobs: this.queue.length }; }
  render(ir: ArtworkIR): Promise<PixelFrame> { return this.request('render', ir) as Promise<PixelFrame>; }
  capture(ir: ArtworkIR): Promise<PngFrame> { return this.request('capture', ir) as Promise<PngFrame>; }
  dispose(): void {
    this.worker?.terminate(); this.worker = null;
    this.rejectAll(new ArtworkError('ABORTED', '预览已关闭'));
  }
  private request(kind: 'render' | 'capture', ir: ArtworkIR): Promise<PixelFrame | PngFrame> {
    if (kind==='capture' && this.queue.filter(job=>job.kind==='capture').length + (this.active?.kind==='capture'?1:0) >= MAX_CAPTURES) return Promise.reject(new ArtworkError('QUEUE_FULL','最多允许四个并发图像捕获，请等待当前任务完成'));
    if (new TextEncoder().encode(JSON.stringify(ir)).byteLength > MAX_IR_BYTES) return Promise.reject(new ArtworkError('MEMORY_BUDGET','美术请求超过 2 MiB，请减少本次工程数据'));
    if (!this.worker) {
      this.worker = this.createWorker();
      this.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; value: PixelFrame | PngFrame; error: DraftFailure; metrics: Record<string,number> }>) => {
        this.worker?.postMessage({ kind: 'ack', id:event.data.id });
        this.metrics=event.data.metrics ?? this.metrics;
        const job = this.active;
        if (!job || job.id!==event.data.id) return;
        this.active=null;
        if (job.cancelled) job.reject(new ArtworkError('ABORTED','画面已被更新的草稿替代'));
        else if (event.data.ok) job.resolve(event.data.value);
        else job.reject(new ArtworkError(event.data.error.code,event.data.error.message,event.data.error.partId));
        this.pump();
      };
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.rejectAll(new ArtworkError('RENDER_FAILED', '美术渲染线程发生错误，请重试')); };
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      if (kind==='render') {
        for (const job of this.queue) if(job.kind==='render') job.reject(new ArtworkError('ABORTED','画面已被更新的草稿替代'));
        this.queue=this.queue.filter(job=>job.kind!=='render');
        if (this.active?.kind==='render' && !this.active.cancelled) {
          this.active.cancelled=true; this.worker!.postMessage({kind:'cancel',id:this.active.id});
        }
      }
      this.queue.push({id,kind,ir,resolve,reject});this.pump();
    });
  }
  private pump(): void {
    if (this.active || !this.queue.length || !this.worker) return;
    this.active=this.queue.shift()!;
    try { this.worker.postMessage({ id:this.active.id,kind:this.active.kind,ir:this.active.ir }); }
    catch(error) { this.active.reject(error);this.active=null;this.pump(); }
  }
  private rejectAll(error: Error): void { this.active?.reject(error); for(const job of this.queue)job.reject(error); this.active=null;this.queue=[]; }
}
