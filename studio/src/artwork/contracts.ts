import type { Bounds, DraftFailure, DraftToken } from '../editor/contracts';

export type PixelFrame = { width: number; height: number; data: Uint8ClampedArray; bounds: Bounds | null };
export type RasterAsset = Pick<PixelFrame, 'width' | 'height' | 'data'>;
export type PngFrame = Omit<PixelFrame, 'data'> & { dataUrl: string };
export type CaptureRequest = { schemaVersion: 1; state: DraftToken; source?: 'draft' | 'saved' };
export type ArtworkImage = PngFrame & DraftToken & {
  mimeType: 'image/png'; source: 'draft' | 'saved'; baseRevision: string; renderVersion: 1;
};
export type CaptureResult = { ok: true; image: ArtworkImage } | { ok: false; error: DraftFailure };
export class ArtworkError extends Error {
  constructor(readonly code: string, message: string, readonly partId?: string) { super(message); }
}
// Bound individual allocations; this does not change or truncate the source IR.
export const MAX_PIXELS = 16_777_216;
export function dimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new ArtworkError('IMAGE_SIZE', '图像尺寸无效或超过 16777216 像素的预览上限');
  }
}
