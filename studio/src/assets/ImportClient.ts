import { ArtworkError, dimensions } from '../artwork/contracts';
import { MAX_ASSET_BYTES } from '../artwork/MemoryBudget';
import { ProtocolError, type StudioError } from '../protocol';
import type { ImportJob, ImportValue, SpriteInfo, PreparedImport } from './importTasks';

/** No retained raster cache or queue: completion/cancellation terminates the task's Worker. */
export class ImportClient {
  private closed = false;
  private active: { cancel(): void } | null = null;
  constructor(private createWorker = () => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })) {}
  inspect(file: Blob, crop?: number[], signal?: AbortSignal): Promise<SpriteInfo> {
    return this.run({ kind: 'inspect', file, crop }, signal) as Promise<SpriteInfo>;
  }
  mask(file: Blob, width: number, height: number): Promise<Uint8Array> {
    return this.run({ kind: 'mask', file, width, height }) as Promise<Uint8Array>;
  }
  prepare(file: Blob, mask: Uint8Array, width: number, height: number): Promise<PreparedImport> {
    return this.run({ kind: 'prepare', file, mask, width, height }) as Promise<PreparedImport>;
  }
  dispose(): void { this.closed = true; this.active?.cancel(); }
  private run(job: ImportJob, signal?: AbortSignal): Promise<ImportValue> {
    if (this.closed || signal?.aborted) return Promise.reject(new ArtworkError('ABORTED', '素材任务已关闭'));
    if (this.active) return Promise.reject(new ArtworkError('BUSY', '请等待当前素材任务完成'));
    if (!job.file.size || job.file.size > MAX_ASSET_BYTES) return Promise.reject(new ArtworkError('ASSET_FORMAT', '请选择不超过 16 MB 的 PNG'));
    if (job.kind !== 'inspect') {
      dimensions(job.width, job.height);
      if (job.kind === 'prepare' && job.mask.length !== job.width * job.height) return Promise.reject(new ArtworkError('ASSET_SIZE', 'mask 尺寸必须与画布一致'));
    }
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      const finish = (value?: ImportValue, error?: unknown) => {
        if (this.active !== task) return;
        this.active = null;
        signal?.removeEventListener('abort', task.cancel);
        worker.onmessage = null; worker.onerror = null; worker.terminate();
        if (error) reject(error); else resolve(value!);
      };
      const task = { cancel: () => finish(undefined, new ArtworkError('ABORTED', '素材任务已关闭')) };
      this.active = task;
      signal?.addEventListener('abort', task.cancel, { once: true });
      worker.onmessage = (event: MessageEvent<{ ok: boolean; value: ImportValue; error: StudioError }>) => {
        const { ok, value, error } = event.data;
        finish(value, ok ? undefined : new ProtocolError(error.code, error.message, error.stage, error.retryable));
      };
      worker.onerror = () => finish(undefined, new ArtworkError('ASSET_LOAD', '素材处理线程失败，请重新选择素材'));
      try {
        // Preserve the editable mask; only this bounded copy is transferred to the codec task.
        const mask = job.kind === 'prepare' ? job.mask.slice() : null;
        worker.postMessage(mask ? { ...job, mask } : job, mask ? [mask.buffer] : []);
      } catch (error) { finish(undefined, error); }
    });
  }
}
