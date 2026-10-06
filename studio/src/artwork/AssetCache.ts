import type { Part } from '../editor/contracts';
import type { RasterAsset } from './contracts';
import { ArtworkError } from './contracts';
import { decodeAsset } from './png';

/** Assets are immutable by hash. Rejected requests are removed so a retry can recover. */
export class AssetCache {
  private entries = new Map<string, Promise<RasterAsset>>();
  private bytes = new Map<string, number>();
  constructor(private fetchBytes: (part: Part) => Promise<Uint8Array>) {}
  get = (part: Part): Promise<RasterAsset> => {
    const key = JSON.stringify([part.asset.path, part.asset.sha256]);
    const previous = this.entries.get(key);
    if (previous) { this.entries.delete(key); this.entries.set(key, previous); return previous; }
    const entry = this.fetchBytes(part).then(bytes => {
      const asset = decodeAsset(bytes);
      this.bytes.set(key, asset.data.byteLength);
      let total = [...this.bytes.values()].reduce((a, b) => a + b, 0);
      for (const oldest of this.entries.keys()) {
        if (total <= 128 * 1024 * 1024) break;
        if (!this.bytes.has(oldest)) continue;
        total -= this.bytes.get(oldest) || 0; this.bytes.delete(oldest); this.entries.delete(oldest);
      }
      return asset;
    }).catch(error => {
      this.entries.delete(key); this.bytes.delete(key);
      if (error instanceof ArtworkError) throw new ArtworkError(error.code, `${part.name}：${error.message}`, error.partId ?? part.id);
      throw new ArtworkError('ASSET_LOAD', `素材加载失败：${part.name} · ${error instanceof Error ? error.message : String(error)}`, part.id);
    });
    this.entries.set(key, entry);
    return entry;
  };
}

export async function fetchAsset(part: Part): Promise<Uint8Array> {
  const path = part.asset.path;
  if (path.includes('\\') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw new ArtworkError('ASSET_PATH', '素材路径必须是工作区内相对路径', part.id);
  const response = await fetch('/studio-files/' + path.split('/').map(encodeURIComponent).join('/'));
  if (!response.ok) throw new ArtworkError('ASSET_LOAD', `素材读取失败（${response.status}）：${part.name}`, part.id);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (typeof part.asset.sha256 === 'string') {
    const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== part.asset.sha256) throw new ArtworkError('ASSET_HASH', '素材与 IR 记录的哈希不一致', part.id);
  }
  return bytes;
}
