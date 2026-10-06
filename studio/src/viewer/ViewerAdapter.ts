export type Bounds = [number, number, number, number];
export type Parameter = { id: string; min: number; max: number; default: number; value: number };
export type Dynamics = {
  motions: { id: string; name: string; duration: number; loop: boolean }[];
  motionId: string | null;
  physicsAvailable: boolean;
  physicsEnabled: boolean;
  elapsed: number;
  finished: boolean;
};

export type Viewer = {
  ready: boolean;
  errors: string[];
  params(): Parameter[];
  reset(): void;
  focus(bounds: Bounds): void;
  setParams(values: Record<string, number>): unknown;
  render(): void;
  snapshot(crop?: null, scale?: number): string;
  dynamics?(): Dynamics;
  selectMotion?(id: string | null): void;
  setPhysics?(enabled: boolean): void;
  step?(seconds: number): void;
};

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; parameters: Parameter[]; dynamics?: Dynamics; playing?: boolean }
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
  private playing = false;
  private lastTime = 0;
  private accumulator = 0;
  private lastPublished = 0;
  private onState: ((state: PreviewState) => void) | undefined;

  constructor(private readonly readViewer: () => Viewer | undefined, private readonly scheduler: Scheduler = browserScheduler) {}

  connect(onState: (state: PreviewState) => void, bounds?: Bounds): void {
    if (this.disposed) return;
    this.stopPolling();
    this.pause();
    this.viewer = undefined;
    this.onState = onState;
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
          this.publish();
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
    this.pause();
    this.viewer.reset();
    this.publish();
    this.scheduleRender();
    return this.viewer.params();
  }

  applyPose(values: Record<string, number>): Parameter[] | undefined {
    if (!this.viewer || this.disposed) return;
    const parameters = new Map(this.viewer.params().map(parameter => [parameter.id, parameter]));
    // Validate the entire pose before reset or any mutation; never silently skip an incompatible axis.
    for (const [id, value] of Object.entries(values)) {
      const parameter = parameters.get(id);
      if (!parameter || !Number.isFinite(value) || value < parameter.min || value > parameter.max) {
        throw new Error(`姿态参数不兼容：${id}=${value}${parameter ? `，当前范围 ${parameter.min}–${parameter.max}` : '，当前模型无此参数'}`);
      }
    }
    this.pause();
    this.viewer.reset();
    if (Object.keys(values).length) this.viewer.setParams(values);
    this.scheduleRender();
    return this.viewer.params();
  }

  capture(): string | undefined {
    if (!this.viewer || this.disposed) return;
    return this.viewer.snapshot();
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    this.stopPolling();
    if (this.pendingFrame !== undefined) this.scheduler.cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = undefined;
    this.viewer = undefined;
    this.onState = undefined;
  }

  play(): void {
    if (this.disposed || !this.viewer?.step || this.playing) return;
    const state = this.viewer.dynamics?.();
    if (!state || (!state.physicsEnabled && (!state.motionId || state.finished))) return;
    this.playing = true;
    this.lastTime = this.scheduler.now();
    this.accumulator = 0;
    this.publish();
    this.scheduleRender();
  }

  pause(): void {
    this.playing = false;
    this.accumulator = 0;
    if (this.pendingFrame !== undefined) this.scheduler.cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = undefined;
    this.publish();
  }

  step(): void {
    if (this.disposed || !this.viewer?.step) return;
    try {
      this.pause();
      this.viewer.step(1 / 60);
      this.viewer.render();
      this.publish();
    } catch (error) { this.fail(error); }
  }

  selectMotion(id: string | null): void {
    if (!this.viewer?.selectMotion || this.disposed) return;
    try {
      this.pause();
      this.viewer.selectMotion(id);
      this.scheduleRender();
      this.publish();
    } catch (error) { this.fail(error); }
  }

  setPhysics(enabled: boolean): void {
    if (!this.viewer?.setPhysics || this.disposed) return;
    this.viewer.setPhysics(enabled);
    this.publish();
  }

  private publish(): void {
    if (!this.disposed && this.viewer) {
      this.onState?.({ status: 'ready', parameters: this.viewer.params(),
        ...(this.viewer.dynamics ? { dynamics: this.viewer.dynamics(), playing: this.playing } : {}) });
      this.lastPublished = this.scheduler.now();
    }
  }

  private fail(error: unknown): void {
    this.playing = false;
    if (this.pendingFrame !== undefined) this.scheduler.cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = undefined;
    this.viewer = undefined;
    this.onState?.({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }

  private stopPolling(): void {
    if (this.poll !== undefined) this.scheduler.clearInterval(this.poll);
    this.poll = undefined;
  }

  private scheduleRender(): void {
    if (this.pendingFrame !== undefined) return;
    this.pendingFrame = this.scheduler.requestAnimationFrame(() => {
      this.pendingFrame = undefined;
      if (this.disposed || !this.viewer) return;
      try {
        if (this.playing) {
          const now = this.scheduler.now();
          // Bound catch-up after a suspended/background tab; at most six fixed steps per frame.
          this.accumulator += Math.max(0, Math.min(100, now - this.lastTime));
          this.lastTime = now;
          const steps = Math.min(6, Math.floor((this.accumulator + 1e-8) / (1000 / 60)));
          for (let i = 0; i < steps; i++) this.viewer.step!(1 / 60);
          this.accumulator -= steps * (1000 / 60);
          const state = this.viewer.dynamics?.();
          if (state && !state.physicsEnabled && (!state.motionId || state.finished)) this.playing = false;
          if (!this.playing || now - this.lastPublished >= 100) this.publish();
        }
        this.viewer.render();
        if (this.playing) this.scheduleRender();
      } catch (error) {
        this.fail(error);
      }
    });
  }
}
