import type { Part } from '../editor/contracts';
import type { RasterAsset } from './contracts';
import { ArtworkError, dimensions } from './contracts';
import { decodeAsset } from './png';
import { MemoryBudget, MAX_ASSET_BYTES, type MemoryLease } from './MemoryBudget';
import { checkCancelled } from './content';

/** All raster storage shares one budget; rendering acquires one asset at a time. */
export class AssetCache {
  private entries = new Map<string, { asset: RasterAsset; lease: MemoryLease }>();
  private pending = new Map<string, Promise<RasterAsset>>();
  constructor(private fetchBytes: (part: Part, signal?: AbortSignal) => Promise<Uint8Array>, readonly memory = new MemoryBudget()) {}
  get = (part: Part, signal?: AbortSignal): Promise<RasterAsset> => {
    checkCancelled(signal);
    const key = JSON.stringify([part.asset.path, part.asset.sha256]);
    const previous = this.entries.get(key);
    if (previous) return Promise.resolve(previous.asset);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const entry = (async () => {
      const input = this.memory.reserve(3 * MAX_ASSET_BYTES);
      try {
        dimensions(part.asset.size.width, part.asset.size.height);
        const bytes = await this.fetchBytes(part, signal); checkCancelled(signal);
        if (bytes.length > MAX_ASSET_BYTES || bytes.length < 33) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据不完整或超过 16 MiB');
        const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const width = header.getUint32(16), height = header.getUint32(20); dimensions(width, height);
        if (width !== part.asset.size.width || height !== part.asset.size.height) throw new ArtworkError('ASSET_SIZE', '素材尺寸与 IR 不一致');
        const workspace = this.memory.reserve(width * height * 20 + 512 * 1024);
        let asset: RasterAsset;
        try { asset = decodeAsset(bytes); checkCancelled(signal); }
        finally { workspace.release(); }
        const decoded = this.memory.reserve(asset.data.byteLength);
        this.entries.set(key, { asset, lease: decoded });
        decoded.retain(() => this.entries.delete(key));
        return asset;
      } finally { input.release(); }
    })().catch(error => {
      if (signal?.aborted || (error as { code?: string })?.code === 'ABORTED') throw new ArtworkError('ABORTED', '画面已被更新的草稿替代', part.id);
      if (error instanceof ArtworkError) throw new ArtworkError(error.code, `${part.name}：${error.message}`, error.partId ?? part.id);
      throw new ArtworkError('ASSET_LOAD', `素材加载失败：${part.name} · ${error instanceof Error ? error.message : String(error)}`, part.id);
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, entry);
    return entry;
  };
  acquire = async (part: Part, signal?: AbortSignal): Promise<RasterAsset & { release(): void }> => {
    const asset = await this.get(part, signal);
    const entry = this.entries.get(JSON.stringify([part.asset.path, part.asset.sha256]));
    if (!entry) throw new ArtworkError('ABORTED', '素材缓存已释放，请重试', part.id);
    return { ...asset, release: entry.lease.pin() };
  };
}

export async function fetchAsset(part: Part, signal?: AbortSignal): Promise<Uint8Array> {
  const path = part.asset.path;
  if (path.includes('\\') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw new ArtworkError('ASSET_PATH', '素材路径必须是工作区内相对路径', part.id);
  const response = await fetch('/studio-files/' + path.split('/').map(encodeURIComponent).join('/'), { signal });
  if (!response.ok) throw new ArtworkError('ASSET_LOAD', `素材读取失败（${response.status}）：${part.name}`, part.id);
  if (Number(response.headers.get('content-length')) > MAX_ASSET_BYTES) { await response.body?.cancel(); throw new ArtworkError('ASSET_FORMAT', 'PNG 超过 16 MiB', part.id); }
  const reader = response.body?.getReader();
  if (!reader) throw new ArtworkError('ASSET_LOAD', '无法读取素材响应', part.id);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      checkCancelled(signal); const value = await reader.read(); if (value.done) break;
      length += value.value.byteLength;
      if (length > MAX_ASSET_BYTES) throw new ArtworkError('ASSET_FORMAT', 'PNG 超过 16 MiB', part.id);
      chunks.push(value.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (typeof part.asset.sha256 === 'string') {
    const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== part.asset.sha256) throw new ArtworkError('ASSET_HASH', '素材与 IR 记录的哈希不一致', part.id);
  }
  return bytes;
}
