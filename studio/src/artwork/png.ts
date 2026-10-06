import { decode, encode, convertIndexedToRgb } from 'fast-png';
import { ArtworkError, dimensions, type PixelFrame, type RasterAsset } from './contracts';

/** Decode unpremultiplied samples rather than reading rounded colors back from Canvas. */
export function decodeAsset(bytes: Uint8Array): RasterAsset {
  // Inspect IHDR before the decoder allocates its image buffer.
  if (bytes.byteLength < 33) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据不完整');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  dimensions(header.getUint32(16), header.getUint32(20));
  const png = decode(bytes, { checkCrc: true });
  dimensions(png.width, png.height);
  // Working PNGs exported by Studio are 8-bit. Do not silently reinterpret 16-bit data.
  if (png.depth === 16) throw new ArtworkError('ASSET_FORMAT', '暂不支持 16 位 PNG 预览，请使用 8 位素材');
  const data = new Uint8ClampedArray(png.width * png.height * 4);
  if (png.palette) {
    const rgb = convertIndexedToRgb(png), channels = png.palette[0].length;
    for (let pixel = 0; pixel < png.width * png.height; pixel++) {
      data.set(rgb.subarray(pixel * channels, pixel * channels + 3), pixel * 4);
      data[pixel * 4 + 3] = channels === 4 ? rgb[pixel * channels + 3] : 255;
    }
  } else {
    const stride = Math.ceil(png.width * png.channels * png.depth / 8), mask = (1 << png.depth) - 1;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const index = (y * png.width + x) * png.channels, offset = (y * png.width + x) * 4;
      const first = png.depth < 8 ? ((png.data[y * stride + Math.floor(x * png.depth / 8)] >> (8 - png.depth - x * png.depth % 8)) & mask) : png.data[index];
      if (png.channels <= 2) data[offset] = data[offset + 1] = data[offset + 2] = Math.round(first * 255 / mask);
      else { data[offset] = first; data[offset + 1] = png.data[index + 1]; data[offset + 2] = png.data[index + 2]; }
      data[offset + 3] = png.channels === 2 ? png.data[index + 1] : png.channels === 4 ? png.data[index + 3] : 255;
      if (png.transparency && (png.channels === 1 ? first === png.transparency[0]
        : first === png.transparency[0] && png.data[index + 1] === png.transparency[1] && png.data[index + 2] === png.transparency[2])) data[offset + 3] = 0;
    }
  }
  return { width: png.width, height: png.height, data };
}

export function encodeFrame(frame: PixelFrame): string {
  const png = encode({ width: frame.width, height: frame.height, channels: 4, depth: 8, data: frame.data });
  let binary = '';
  for (let offset = 0; offset < png.length; offset += 16_384) binary += String.fromCharCode(...png.subarray(offset, offset + 16_384));
  return 'data:image/png;base64,' + btoa(binary);
}
