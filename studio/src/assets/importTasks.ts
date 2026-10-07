import { encode } from 'fast-png';
import { decodeAsset } from '../artwork/png';
import { ArtworkError, dimensions } from '../artwork/contracts';
import { MemoryBudget, MAX_ASSET_BYTES } from '../artwork/MemoryBudget';
import { alphaBounds, maskFromPixels } from './mask';

export const IMPORT_BUDGET_BYTES = 384 * 1024 * 1024;
export type SpriteInfo = { width: number; height: number; alpha: number[] | null };
export type ImportJob =
  | { kind: 'inspect'; file: Blob; crop?: number[] }
  | { kind: 'mask'; file: Blob; width: number; height: number }
  | { kind: 'prepare'; file: Blob; mask: Uint8Array; width: number; height: number };
export type PreparedImport = { generatedPng: string; maskPng: string };
export type ImportValue = SpriteInfo | Uint8Array | PreparedImport;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}

/** One task per disposable Worker. This budget accounts codec work, not total browser/GPU memory. */
export async function processImport(job: ImportJob, memory = new MemoryBudget(IMPORT_BUDGET_BYTES)): Promise<ImportValue> {
  if (!job.file.size || job.file.size > MAX_ASSET_BYTES) throw new ArtworkError('ASSET_FORMAT', '请选择不超过 16 MB 的 PNG');
  const input = memory.reserve(3 * MAX_ASSET_BYTES);
  try {
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    if (job.kind === 'prepare') {
      dimensions(job.width, job.height);
      const pixels = job.width * job.height;
      if (job.mask.length !== pixels) throw new ArtworkError('ASSET_SIZE', 'mask 尺寸必须与画布一致');
      const codec = memory.reserve(pixels * 16 + 512 * 1024);
      try {
        const mask = encode({ width: job.width, height: job.height, channels: 1, depth: 8, data: job.mask });
        return { generatedPng: base64(bytes), maskPng: base64(mask) };
      } finally { codec.release(); }
    }
    if (bytes.length < 33) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据不完整');
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = header.getUint32(16), height = header.getUint32(20);
    dimensions(width, height);
    if (job.kind === 'inspect' && (bytes[25] !== 6 || bytes[24] !== 8)) throw new ArtworkError('ASSET_FORMAT', '素材须为 8 位 RGBA 透明 PNG');
    if (job.kind === 'mask' && (width !== job.width || height !== job.height)) throw new ArtworkError('ASSET_SIZE', 'mask 尺寸必须与画布一致');
    const codec = memory.reserve(width * height * 20 + 512 * 1024);
    try {
      const image = decodeAsset(bytes);
      if (job.kind === 'mask') return maskFromPixels(image, job.width, job.height);
      let visible = false, transparent = false;
      for (let offset = 3; offset < image.data.length; offset += 4) {
        visible ||= image.data[offset] > 0;
        transparent ||= image.data[offset] === 0;
      }
      if (!visible || !transparent) throw new ArtworkError('ASSET_FORMAT', '素材需有可见像素和透明背景');
      return { width, height, alpha: alphaBounds(image, job.crop) };
    } finally { codec.release(); }
  } finally { input.release(); }
}
