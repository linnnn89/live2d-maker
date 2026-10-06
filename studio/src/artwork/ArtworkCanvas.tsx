import { useEffect, useRef, useState } from 'react';
import type { ArtworkIR } from '../editor/contracts';
import type { ArtworkClient } from './ArtworkClient';
import { artworkKey } from './content';

export type ArtworkSource = 'draft' | 'saved' | 'reference';
type Props = { ir: ArtworkIR; client: ArtworkClient; source: ArtworkSource };

/** Pixels fit the same SVG coordinates as edit handles; no PNG encoding per drag. */
export function ArtworkCanvas({ ir, client, source }: Props) {
  const identity=artworkKey(ir);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<{ identity: string; message: string; failed: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const scheduled = requestAnimationFrame(() => {
      void client.render(ir).then(frame => {
        if (cancelled || !canvas.current) return;
        const context = canvas.current.getContext('2d');
        if (!context) throw new Error('浏览器无法显示美术画布');
        canvas.current.width = frame.width; canvas.current.height = frame.height;
        const pixels = context.createImageData(frame.width, frame.height); pixels.data.set(frame.data);
        context.putImageData(pixels, 0, 0);
        setResult({ identity, message: '美术合成已就绪', failed: false });
      }).catch(error => {
        if (!cancelled) {
          canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height);
          setResult({ identity, message: error instanceof Error ? error.message : String(error), failed: true });
        }
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(scheduled); };
  // A new editor token or annotation does not alter pixels; captures still validate their token separately.
  }, [client, identity]);
  const current = result?.identity === identity ? result : null;
  return <foreignObject x="0" y="0" width={ir.canvas.width} height={ir.canvas.height} pointerEvents="none">
    <div className="artwork-raster" data-source={source} data-render-state={current ? current.failed ? 'error' : 'ready' : 'loading'}>
      <canvas ref={canvas} aria-label={source === 'draft' ? '当前草稿合成图' : '已保存美术合成图'}/>
      {(!current || current.failed) && <div className={'artwork-render-notice ' + (current?.failed ? 'error' : '')} role={current?.failed ? 'alert' : 'status'}>{current?.message || '正在合成美术…'}</div>}
    </div>
  </foreignObject>;
}
