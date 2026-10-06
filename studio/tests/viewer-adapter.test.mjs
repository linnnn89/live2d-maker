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
    frame: (elapsed = 0) => { time += elapsed; const work = [...frames.values()]; frames.clear(); for (const fn of work) fn(); },
  };
}

function dynamicFixture() {
  const f=fixture(), steps=[];
  const state={motions:[{id:'turn',name:'Turn',duration:1,loop:false}],motionId:'turn',physicsAvailable:true,physicsEnabled:true,elapsed:0,finished:false};
  f.viewer.dynamics=()=>structuredClone(state);
  f.viewer.step=seconds=>{steps.push(seconds);state.elapsed+=seconds;};
  f.viewer.selectMotion=id=>{state.motionId=id;state.elapsed=0;state.finished=false;};
  f.viewer.setPhysics=enabled=>{state.physicsEnabled=enabled;};
  f.viewer.reset=()=>{state.elapsed=0;state.finished=false;};
  f.adapter.connect(s=>f.states.push(s));
  return {...f,state,steps};
}

test('dynamic playback advances fixed steps, bounds catch-up and preserves paused time until explicit reset',()=>{
  const f=dynamicFixture();assert.equal(f.frames.size,0);assert.equal(f.states.at(-1).playing,false);
  f.adapter.play();f.frame(8);assert.equal(f.steps.length,0);f.frame(9);assert.deepEqual(f.steps,[1/60]);
  f.frame(33);assert.equal(f.steps.length,3);f.frame(5000);assert.equal(f.steps.length,9);assert.ok(f.steps.every(s=>s===1/60));
  f.adapter.pause();const elapsed=f.state.elapsed;assert.equal(f.frames.size,0);f.frame(10000);assert.equal(f.state.elapsed,elapsed);
  f.adapter.step();assert.equal(f.steps.length,10);assert.equal(f.states.at(-1).playing,false);
  f.adapter.play();f.frame(17);assert.equal(f.steps.length,11);f.adapter.selectMotion(null);assert.equal(f.state.elapsed,0);assert.equal(f.frames.size,1);
  f.frame();f.adapter.setPhysics(false);f.adapter.play();assert.equal(f.frames.size,0);
  f.adapter.selectMotion('turn');f.frame();f.adapter.play();f.state.finished=true;f.frame(17);assert.equal(f.states.at(-1).playing,false);assert.equal(f.frames.size,0);
  f.adapter.reset();assert.equal(f.state.elapsed,0);f.frame();assert.equal(f.counts().captures,0);
});

test('replaced or failing dynamic viewers terminate animation without stale callbacks or screenshot encoding',()=>{
  const f=dynamicFixture();f.adapter.play();f.adapter.dispose();const states=f.states.length;f.frame(1000);
  assert.equal(f.frames.size,0);assert.equal(f.steps.length,0);assert.equal(f.states.length,states);f.adapter.play();f.adapter.step();assert.equal(f.steps.length,0);
  const failed=dynamicFixture();failed.viewer.step=()=>{throw new Error('physics failed');};failed.adapter.play();failed.frame(17);
  assert.deepEqual(failed.states.at(-1),{status:'error',message:'physics failed'});assert.equal(failed.frames.size,0);assert.equal(failed.counts().captures,0);
  for(const operation of ['step','selectMotion']){
    const manual=dynamicFixture();manual.viewer[operation]=()=>{throw new Error('invalid resource');};manual.adapter[operation]('turn');
    assert.deepEqual(manual.states.at(-1),{status:'error',message:'invalid resource'});assert.equal(manual.frames.size,0);assert.equal(manual.adapter.reset(),undefined);
  }
});

test('applying a complete pose rejects incompatible parameters before any reset or partial mutation',()=>{
  const f=fixture();f.adapter.connect(()=>{});f.adapter.setParameter('Angle',12);f.frame();
  const before=f.counts();assert.throws(()=>f.adapter.applyPose({Angle:20,Missing:1}),/Missing/);assert.equal(f.viewer.params()[0].value,12);assert.deepEqual(f.counts(),before);assert.equal(f.frames.size,0);
  assert.throws(()=>f.adapter.applyPose({Angle:31}),/当前范围/);assert.throws(()=>f.adapter.applyPose({Angle:NaN}),/不兼容/);
  assert.equal(f.adapter.applyPose({Angle:-20})[0].value,-20);assert.equal(f.frames.size,1);f.frame();assert.equal(f.counts().renders,before.renders+1);assert.equal(f.counts().captures,0);
  assert.equal(f.adapter.applyPose({})[0].value,0);f.adapter.dispose();assert.equal(f.frames.size,0);assert.equal(f.adapter.applyPose({Angle:10}),undefined);
});

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
