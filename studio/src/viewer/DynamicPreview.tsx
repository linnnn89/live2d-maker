import { useEffect } from 'react';
import { useModelPreview } from './useModelPreview';

/** Inspects one immutable delivery bundle independently of the authoring pose/QA. */
export function DynamicPreview({modelUrl, canvas, current, onClose}: {
  modelUrl: string; canvas: {width: number; height: number}; current: boolean; onClose: () => void;
}) {
  const preview = useModelPreview(modelUrl, null, true);
  const {dynamics, playing, parameters} = preview;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  const active = !!dynamics && (dynamics.physicsEnabled || (!!dynamics.motionId && !dynamics.finished));
  return <div className="modal-backdrop"><section className="dynamic-modal" role="dialog" aria-modal="true" aria-label="交付包动态预览">
    <div className="panel-heading"><h2>交付包动态预览</h2><button autoFocus onClick={onClose}>关闭动态预览</button></div>
    <p>{current ? '对应当前已保存输入' : '历史交付包 · 当前输入已改变'} · {preview.previewStatus}</p>
    <div className="dynamic-layout"><div className="preview checker">
      <iframe ref={preview.attachFrame} title="Cubism 动态预览" onLoad={preview.onLoad} src={'/live2d-viewer/index.html?' + new URLSearchParams({model: modelUrl, vendor: '/public/vendor/cubism/', canvaspx: `${canvas.width},${canvas.height}`, w: '640', h: '760', embed: '1', dynamics: '1'})}/>
    </div><div className="dynamic-controls">
      <label>动作预设 <select aria-label="动态动作预设" disabled={!dynamics} value={dynamics?.motionId ?? ''} onChange={event => preview.selectMotion(event.target.value || null)}>
        <option value="">无动作（手动参数 / 仅物理）</option>
        {dynamics?.motions.map(motion => <option key={motion.id} value={motion.id}>{motion.name} · {motion.duration}s{motion.loop ? ' · 循环' : ''}</option>)}
      </select></label>
      <label><input type="checkbox" aria-label="启用预览物理" disabled={!dynamics?.physicsAvailable} checked={!!dynamics?.physicsEnabled} onChange={event => preview.setPhysics(event.target.checked)}/>启用包内物理</label>
      <div className="dynamic-actions"><button disabled={!active || playing} onClick={preview.play}>播放</button><button disabled={!playing} onClick={preview.pause}>暂停</button><button disabled={!active || playing} onClick={preview.step}>前进一帧</button><button disabled={!dynamics} onClick={preview.reset}>重置到开头</button></div>
      <p role="status" className="dynamic-time">{playing ? '播放中' : '已暂停'} · {(dynamics?.elapsed ?? 0).toFixed(2)}s{dynamics?.finished ? ' · 动作已结束' : ''}</p>
      <p>固定 1/60 秒推进。参数只影响本次预览；关闭后停止播放，重新打开从默认姿态开始。</p>
      {dynamics && !dynamics.physicsAvailable && <p>包内未包含物理；生成交付包时可选择“生成默认物理”。</p>}
      {dynamics && !dynamics.motions.length && <p>包内未包含动作；生成交付包时可选择“包含动作示例”。</p>}
      <details><summary>预览参数 · {parameters.length}</summary><p>动作播放时由预设驱动；选择“无动作”可手动改变输入，观察物理响应。</p>
        {parameters.map(parameter => <label className="dynamic-parameter" key={parameter.id}><span>{parameter.id} · {parameter.value.toFixed(3)}</span><input aria-label={'动态 '+parameter.id} type="range" min={parameter.min} max={parameter.max} step={(parameter.max-parameter.min)/200 || .01} value={parameter.value} disabled={!!dynamics?.motionId} onChange={event => preview.setParameter(parameter.id, Number(event.target.value))}/></label>)}
      </details>
    </div></div>
  </section></div>;
}
