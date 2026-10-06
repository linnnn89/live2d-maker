export type Bounds = [number, number, number, number];
export type Parameter = { id: string; min: number; max: number; default: number; value: number };

export type Viewer = {
  ready: boolean;
  errors: string[];
  params(): Parameter[];
  reset(): void;
  focus(bounds: Bounds): void;
  setParams(values: Record<string, number>): unknown;
  render(): void;
  snapshot(crop?: null, scale?: number): string;
};

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; parameters: Parameter[] }
  | { status: 'error'; message: string };

type Scheduler = {
  now(): number;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
};

const browserScheduler: Scheduler = {
  now: () => Date.now(),
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: id => window.clearInterval(id),
  requestAnimationFrame: callback => window.requestAnimationFrame(callback),
  cancelAnimationFrame: id => window.cancelAnimationFrame(id),
};

/** Owns one iframe's readiness and rendering lifecycle; PNG encoding is explicit. */
export class ViewerAdapter {
  private poll: number | undefined;
  private pendingFrame: number | undefined;
  private viewer: Viewer | undefined;
  private disposed = false;

  constructor(private readonly readViewer: () => Viewer | undefined, private readonly scheduler: Scheduler = browserScheduler) {}

  connect(onState: (state: PreviewState) => void, bounds?: Bounds): void {
    if (this.disposed) return;
    this.stopPolling();
    this.viewer = undefined;
    const started = this.scheduler.now();
    onState({ status: 'loading' });
    const check = () => {
      try {
        const viewer = this.readViewer();
        if (viewer?.errors.length) throw new Error(viewer.errors.join('; '));
        if (viewer?.ready) {
          this.stopPolling();
          this.viewer = viewer;
          if (bounds) {
            const [l, t, r, b] = bounds;
            const pad = Math.max(r - l, b - t) * 0.04;
            viewer.focus([l - pad, t - pad, r + pad, b + pad]);
          }
          viewer.render();
          onState({ status: 'ready', parameters: viewer.params() });
        } else if (this.scheduler.now() - started >= 60000) {
          throw new Error('预览加载超时');
        }
      } catch (error) {
        this.viewer = undefined;
        this.stopPolling();
        onState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    this.poll = this.scheduler.setInterval(check, 100);
    check();
  }

  setParameter(id: string, value: number): Parameter[] | undefined {
    if (!this.viewer || this.disposed) return;
    this.viewer.setParams({ [id]: value });
    this.scheduleRender();
    return this.viewer.params();
  }

  reset(): Parameter[] | undefined {
    if (!this.viewer || this.disposed) return;
    this.viewer.reset();
    this.scheduleRender();
    return this.viewer.params();
  }

  capture(): string | undefined {
    if (!this.viewer || this.disposed) return;
    return this.viewer.snapshot();
  }

  dispose(): void {
    this.disposed = true;
    this.stopPolling();
    if (this.pendingFrame !== undefined) this.scheduler.cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = undefined;
    this.viewer = undefined;
  }

  private stopPolling(): void {
    if (this.poll !== undefined) this.scheduler.clearInterval(this.poll);
    this.poll = undefined;
  }

  private scheduleRender(): void {
    if (this.pendingFrame !== undefined) return;
    this.pendingFrame = this.scheduler.requestAnimationFrame(() => {
      this.pendingFrame = undefined;
      if (!this.disposed) this.viewer?.render();
    });
  }
}
