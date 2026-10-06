import { ArtworkError } from './contracts';

export const ARTWORK_BUDGET_BYTES = 384 * 1024 * 1024;
export const MAX_ASSET_BYTES = 16 * 1024 * 1024;
export const MAX_IR_BYTES = 2 * 1024 * 1024;
export const MAX_CAPTURES = 4;
// Six retained request copies, including the active worker copy, with conservative string overhead.
export const REQUEST_RESERVE_BYTES = 6 * MAX_IR_BYTES * 4;

export type MemoryLease = { release(): void; retain(evict: () => void): void; pin(): () => void };

/** One LRU budget for all raster caches, active buffers, codec workspace and outbound results. */
export class MemoryBudget {
  private entries = new Map<symbol, { bytes: number; pins: number; evict?: () => void }>();
  private used = 0;
  private peak = 0;
  constructor(readonly limit = ARTWORK_BUDGET_BYTES - REQUEST_RESERVE_BYTES) {}
  get stats() { return { usedBytes: this.used, peakBytes: this.peak, limitBytes: this.limit }; }
  reserve(bytes: number): MemoryLease {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.limit) throw new ArtworkError('MEMORY_BUDGET', '图像工作量超过美术内存预算，请缩小画布或素材');
    for (const [key, entry] of this.entries) {
      if (this.used + bytes <= this.limit) break;
      if (!entry.pins && entry.evict) { this.entries.delete(key); this.used -= entry.bytes; entry.evict(); }
    }
    if (this.used + bytes > this.limit) throw new ArtworkError('MEMORY_BUDGET', '美术内存预算不足，请等待当前图像操作完成或缩小素材');
    const key = Symbol(), entry = { bytes, pins: 1, evict: undefined as (() => void) | undefined };
    this.entries.set(key, entry); this.used += bytes; this.peak = Math.max(this.peak, this.used);
    return {
      release: () => { if (this.entries.delete(key)) { this.used -= bytes; entry.evict?.(); } },
      retain: evict => { entry.evict = evict; entry.pins = 0; },
      pin: () => {
        if (!this.entries.has(key)) throw new ArtworkError('ABORTED', '缓存已释放');
        entry.pins++; this.entries.delete(key); this.entries.set(key, entry);
        let released = false;
        return () => { if (!released) { released = true; entry.pins--; } };
      },
    };
  }
}
