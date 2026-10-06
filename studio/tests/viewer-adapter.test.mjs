import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-viewer-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
// Use the existing TypeScript compiler, with no new test dependencies or generated repo files.
const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck',
  '--outDir', output, 'src/viewer/ViewerAdapter.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
const { ViewerAdapter } = createRequire(import.meta.url)(path.join(output, 'ViewerAdapter.js'));

function fixture() {
  let time = 0, sequence = 0, renders = 0, captures = 0, focus;
  let value = 0;
  const polls = new Map(), frames = new Map();
  const scheduler = {
    now: () => time,
    setInterval: callback => { const id = ++sequence; polls.set(id, callback); return id; },
    clearInterval: id => polls.delete(id),
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const viewer = {
    ready: true, errors: [],
    params: () => [{ id: 'Angle', min: -30, max: 30, default: 0, value }],
    setParams: params => { value = Math.max(-30, Math.min(30, params.Angle)); },
    reset: () => { value = 0; },
    focus: bounds => { focus = bounds; },
    render: () => { renders++; },
    snapshot: () => { captures++; return 'data:image/png;base64,fixture'; },
  };
  const states = [];
  const adapter = new ViewerAdapter(() => viewer, scheduler);
  return {
    adapter, viewer, states, frames, polls,
    counts: () => ({ renders, captures }), focus: () => focus,
    poll: elapsed => { time += elapsed; for (const fn of [...polls.values()]) fn(); },
    frame: () => { const work = [...frames.values()]; frames.clear(); for (const fn of work) fn(); },
  };
}

test('ready models are framed and rendered without encoding a screenshot', () => {
  const f = fixture();
  f.adapter.connect(state => f.states.push(state), [10, 20, 110, 220]);
  assert.deepEqual(f.focus(), [2, 12, 118, 228]);
  assert.deepEqual(f.states.map(s => s.status), ['loading', 'ready']);
  assert.equal(f.states[1].parameters[0].value, 0);
  assert.deepEqual(f.counts(), { renders: 1, captures: 0 });
  assert.equal(f.polls.size, 0);
});

test('rapid parameter updates read actual clamped values and share one frame', () => {
  const f = fixture();
  f.adapter.connect(() => {});
  f.adapter.setParameter('Angle', 5);
  f.adapter.setParameter('Angle', 20);
  assert.equal(f.adapter.setParameter('Angle', 99)[0].value, 30);
  assert.equal(f.frames.size, 1);
  assert.deepEqual(f.counts(), { renders: 1, captures: 0 });
  f.frame();
  assert.deepEqual(f.counts(), { renders: 2, captures: 0 });
  assert.equal(f.adapter.reset()[0].value, 0);
  f.frame();
  assert.deepEqual(f.counts(), { renders: 3, captures: 0 });
});

test('PNG capture only happens on an explicit capture request', () => {
  const f = fixture();
  f.adapter.connect(() => {});
  assert.equal(f.adapter.capture(), 'data:image/png;base64,fixture');
  assert.equal(f.counts().captures, 1);
});

test('loading models cannot be edited and readiness is observed later', () => {
  const f = fixture();
  f.viewer.ready = false;
  f.adapter.connect(state => f.states.push(state));
  assert.equal(f.adapter.setParameter('Angle', 5), undefined);
  assert.equal(f.adapter.capture(), undefined);
  f.poll(100);
  assert.equal(f.states.length, 1);
  f.viewer.ready = true;
  f.poll(100);
  assert.equal(f.states.at(-1).status, 'ready');
  assert.equal(f.polls.size, 0);
});

test('viewer errors and timeouts terminate polling with useful status', () => {
  for (const reason of ['load-error', 'timeout']) {
    const f = fixture();
    f.viewer.ready = false;
    f.adapter.connect(state => f.states.push(state));
    if (reason === 'load-error') f.viewer.errors.push('missing model');
    f.poll(reason === 'timeout' ? 60000 : 100);
    assert.deepEqual(f.states.at(-1), { status: 'error', message: reason === 'timeout' ? '预览加载超时' : 'missing model' });
    assert.equal(f.polls.size, 0);
    assert.equal(f.counts().renders, 0);
  }
});

test('disposing a replaced model cancels queued rendering and further edits', () => {
  const f = fixture();
  f.adapter.connect(() => {});
  f.adapter.setParameter('Angle', 10);
  f.adapter.dispose();
  assert.equal(f.frames.size, 0);
  f.frame();
  assert.deepEqual(f.counts(), { renders: 1, captures: 0 });
  assert.equal(f.adapter.reset(), undefined);
  assert.equal(f.adapter.capture(), undefined);
});

test('disposing a loading model prevents late readiness from updating its owner', () => {
  const f = fixture();
  f.viewer.ready = false;
  f.adapter.connect(state => f.states.push(state));
  f.adapter.dispose();
  f.viewer.ready = true;
  f.poll(100);
  assert.deepEqual(f.states, [{ status: 'loading' }]);
  assert.equal(f.polls.size, 0);
});
