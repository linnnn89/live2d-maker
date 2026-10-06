import { useCallback, useRef, useState } from 'react';
import { ViewerAdapter, type Bounds, type PreviewState, type Viewer } from './ViewerAdapter';

export function useModelPreview(modelUrl: string | undefined, modelBounds: Bounds | null | undefined, workspaceReady: boolean) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const adapter = useRef<ViewerAdapter | null>(null);
  const [connection, setConnection] = useState<{ modelUrl: string; state: PreviewState } | null>(null);

  // A new iframe owns a new adapter. Detaching also cancels queued old-model renders.
  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    adapter.current?.dispose();
    adapter.current = null;
    frame.current = element;
    if (element) setConnection(null);
  }, []);

  const onLoad = () => {
    const element = frame.current;
    if (!element || !modelUrl) return;
    adapter.current?.dispose();
    const current = new ViewerAdapter(() => (element.contentWindow as (Window & { viewer?: Viewer }) | null)?.viewer);
    adapter.current = current;
    current.connect(state => setConnection({ modelUrl, state }), modelBounds || undefined);
  };

  const current = connection && connection.modelUrl === modelUrl ? connection.state : undefined;
  const parameters = current?.status === 'ready' ? current.parameters : [];
  const previewStatus = !modelUrl ? (workspaceReady ? '等待重建' : '未加载工作区')
    : current?.status === 'error' ? '预览失败：' + current.message
    : current?.status === 'ready' ? 'Cubism 已就绪' : '正在加载 Cubism…';

  function setParameter(id: string, value: number) {
    const parameters = adapter.current?.setParameter(id, value);
    if (parameters && modelUrl) setConnection({ modelUrl, state: { status: 'ready', parameters } });
  }

  function reset() {
    const parameters = adapter.current?.reset();
    if (parameters && modelUrl) setConnection({ modelUrl, state: { status: 'ready', parameters } });
  }
  function applyPose(values: Record<string, number>) {
    const parameters = adapter.current?.applyPose(values);
    if (parameters && modelUrl) setConnection({ modelUrl, state: { status: 'ready', parameters } });
  }

  return { attachFrame, onLoad, parameters, previewStatus, setParameter, reset, applyPose };
}
