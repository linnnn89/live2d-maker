import { decode, encode, convertIndexedToRgb } from 'fast-png';
import { Unzlib } from 'fflate';
import { ArtworkError, dimensions, type PixelFrame, type RasterAsset } from './contracts';
import { MAX_ASSET_BYTES } from './MemoryBudget';

/** Bound IDAT expansion before fast-png collects inflated chunks; ignore non-pixel metadata. */
function checkedPng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 33 || bytes.length > MAX_ASSET_BYTES) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据不完整或超过 16 MiB');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw new ArtworkError('ASSET_FORMAT', 'PNG 文件头无效');
  const width = header.getUint32(16), height = header.getUint32(20), depth = bytes[24], color = bytes[25], interlace = bytes[28];
  dimensions(width, height);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  if (!channels || ![1, 2, 4, 8].includes(depth) || ((color === 2 || color === 4 || color === 6) && depth !== 8) || interlace > 1) throw new ArtworkError('ASSET_FORMAT', '暂不支持该 PNG 像素格式（包括 16 位素材）');
  const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  let expected = 0;
  for (const [x,y,dx,dy] of passes) {
    const w = Math.max(0, Math.ceil((width-x)/dx)), h = Math.max(0, Math.ceil((height-y)/dy));
    if (w && h) expected += (Math.ceil(w*channels*depth/8)+1)*h;
  }
  let inflated = 0, ended = false;
  const unique = new Set<string>();
  const inflator = new Unzlib(chunk => { inflated += chunk.length; if (inflated > expected) throw new ArtworkError('ASSET_FORMAT', 'PNG 解压数据超过声明的像素尺寸'); });
  const chunks = [bytes.subarray(0,8)];
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据块不完整');
    const length = header.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据块长度无效');
    const name = String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if (['IHDR','PLTE','tRNS','IEND'].includes(name)) {
      if (unique.has(name) || (name === 'IHDR' && offset !== 8) || (name === 'PLTE' && length > 768) || (name === 'tRNS' && length > 256) || (name === 'IEND' && length !== 0)) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据块结构无效');
      unique.add(name);
    }
    if (name === 'IDAT') for (let start = offset+8; start < end-4; start += 256) inflator.push(bytes.subarray(start,Math.min(start+256,end-4)),false);
    if (['IHDR','PLTE','tRNS','IDAT','IEND'].includes(name)) chunks.push(bytes.subarray(offset,end));
    else if (/^[A-Z]/.test(name)) throw new ArtworkError('ASSET_FORMAT', 'PNG 含不支持的必要数据块');
    offset = end;
    if (name === 'IEND') { ended = true; break; }
  }
  inflator.push(new Uint8Array(),true);
  if (!ended || inflated !== expected) throw new ArtworkError('ASSET_FORMAT', 'PNG 解压数据与声明尺寸不一致');
  const result = new Uint8Array(chunks.reduce((total,chunk)=>total+chunk.length,0));
  let position=0; for (const chunk of chunks) { result.set(chunk,position); position+=chunk.length; }
  return result;
}

/** Decode unpremultiplied samples rather than reading rounded colors back from Canvas. */
export function decodeAsset(bytes: Uint8Array): RasterAsset {
  // Inspect IHDR before the decoder allocates its image buffer.
  if (bytes.byteLength < 33) throw new ArtworkError('ASSET_FORMAT', 'PNG 数据不完整');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  dimensions(header.getUint32(16), header.getUint32(20));
  const png = decode(checkedPng(bytes), { checkCrc: true });
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
