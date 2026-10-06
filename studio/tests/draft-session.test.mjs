import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-draft-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck',
  '--outDir', output, 'src/editor/DraftController.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
const require = createRequire(import.meta.url);
const { DraftSession } = require(path.join(output, 'DraftSession.js'));
const { DraftController } = require(path.join(output, 'DraftController.js'));
const { applyCommands } = require(path.join(output, 'commands.js'));
const fixture = () => ({ canvas: { width: 100, height: 100 }, metadata: { name: 'keep' },
  parts: ['face', 'hair'].map((id, z) => ({ id, name: id, z,
    asset: { path: `${id}.png`, offset: { left: 0, top: 0 }, size: { width: 100, height: 100 } },
    geometry: { bbox: [0, 0, 100, 100], polygon: [[0, 0], [100, 0], [100, 100]], landmarks: { center: [50, 50] } },
    semantic: { tag: 'FACE', side: 'none' }, rig: { immutable: true } })) });
const hide = { type: 'set_visibility', partId: 'hair', visible: false };
const opacity = { type: 'set_opacity', partId: 'face', opacity: 120 };
const request = (controller, operation, commands) => controller.execute({ schemaVersion: 1, operation,
  ...(['inspect', 'diff'].includes(operation) ? {} : { state: controller.getSnapshot() }), ...(commands ? { commands } : {}) });
function controller(persist = async proposal => ({ ir: proposal.ir, revision: 'saved-2' })) {
  let id = 0; const saved = [];
  const c = new DraftController(persist, value => saved.push(value), () => `draft-${++id}`);
  c.install(fixture(), 'saved-1'); return { c, saved };
}

test('batch targets IDs, preserves all other IR fields, and shares one undo step', () => {
  const original = fixture(), s = new DraftSession(original, 'base', 'draft');
  s.apply(s.inspect(), [hide, opacity]);
  const state = s.inspect();
  assert.equal(state.changes.length, 2);
  assert.equal(state.ir.parts[1].appearance.visible, false);
  assert.deepEqual(state.ir.parts[0].asset, original.parts[0].asset);
  assert.deepEqual(state.ir.parts[0].rig, original.parts[0].rig);
  assert.deepEqual(state.ir.parts[0].geometry, original.parts[0].geometry);
  s.undo(state); assert.deepEqual(s.inspect().ir, original); assert.equal(s.inspect().canUndo, false);
  s.redo(s.inspect()); assert.deepEqual(s.inspect().ir, state.ir);
});
test('invalid later commands reject the entire batch without changing history or token', () => {
  const s = new DraftSession(fixture(), 'base', 'draft'), before = s.inspect();
  for (const invalid of [{ ...opacity, opacity: 256 }, { ...hide, partId: 'missing' },
    { ...hide, asset: {} }, { type: 'set_polygon', partId: 'face', points: [[0, 0], [1, 1], [NaN, 2]] },
    { type: 'set_landmark', partId: 'face', name: '__proto__', point: [1, 2] }]) {
    assert.throws(() => s.apply(before, [hide, invalid])); assert.deepEqual(s.inspect(), before);
  }
});
test('stale tokens fail after edits, undo and discard; effective no-op retains token', () => {
  const s = new DraftSession(fixture(), 'base', 'draft'), first = s.inspect();
  s.apply(first, [{ ...hide, visible: true }]); assert.equal(s.inspect().revision, first.revision);
  s.apply(first, [hide]); const edited = s.inspect();
  assert.throws(() => s.undo(first), { code: 'DRAFT_CONFLICT' });
  s.undo(edited); assert.throws(() => s.redo(edited), { code: 'DRAFT_CONFLICT' });
  const undone = s.inspect(); s.discard(undone); assert.throws(() => s.apply(undone, [hide]), { code: 'DRAFT_CONFLICT' });
});
test('landmark add, change, removal and polygon changes produce reversible field diffs', () => {
  const s = new DraftSession(fixture(), 'base', 'draft');
  s.apply(s.inspect(), [{ type: 'set_landmark', partId: 'face', name: 'iris', point: [12, 34] },
    { type: 'remove_landmark', partId: 'face', name: 'center' },
    { type: 'set_polygon', partId: 'face', points: [[1, 2], [40, 2], [40, 50]] }]);
  assert.deepEqual(s.inspect().changes.map(c => c.field), ['geometry.polygon', 'geometry.landmarks.center', 'geometry.landmarks.iris']);
  s.undo(s.inspect()); assert.deepEqual(s.inspect().ir, fixture());
});
test('gesture merges all moves into one undo step and blocks outside editing', () => {
  const s = new DraftSession(fixture(), 'base', 'draft'); s.beginGesture(s.inspect());
  s.updateGesture([opacity]); s.updateGesture([{ ...opacity, opacity: 80 }]);
  assert.throws(() => s.apply(s.inspect(), [hide]), { code: 'BUSY' });
  s.endGesture(false); s.undo(s.inspect()); assert.deepEqual(s.inspect().ir, fixture());
  assert.equal(s.inspect().canUndo, false);
});
test('cancelled gesture restores its start state and preserves redo history', () => {
  const s = new DraftSession(fixture(), 'base', 'draft'); s.apply(s.inspect(), [hide]); s.undo(s.inspect());
  s.beginGesture(s.inspect()); s.updateGesture([opacity]); s.endGesture(true);
  assert.deepEqual(s.inspect().ir, fixture()); assert.equal(s.inspect().canRedo, true);
});
test('inspection is isolated from callers and malformed base IDs are rejected', () => {
  const original = fixture(), s = new DraftSession(original, 'base', 'draft');
  original.parts[0].name = 'outside'; const state = s.inspect(); state.ir.parts[0].name = 'outside';
  assert.equal(s.inspect().ir.parts[0].name, 'face');
  assert.throws(() => new DraftSession({ ...fixture(), parts: [null] }, 'base', 'draft'), { code: 'INVALID_BASE' });
});
test('controller validates requests and returns structured command failures', async () => {
  const { c } = controller();
  for (const input of [null, { schemaVersion: 2, operation: 'inspect' }, { schemaVersion: 1, operation: 'inspect', shell: 'no' }])
    assert.equal((await c.execute(input)).error.code, 'INVALID_REQUEST');
  const failure = await request(c, 'apply', [{ ...hide, partId: 'missing' }]);
  assert.equal(failure.error.code, 'PART_NOT_FOUND'); assert.equal(failure.error.partId, 'missing');
  assert.equal(c.getSnapshot().dirty, false);
});
test('pending save freezes UI and agent writes, then starts a fresh draft after success', async () => {
  let resolve; const { c, saved } = controller(proposal => new Promise(r => { resolve = () => r({ ir: proposal.ir, revision: 'saved-2' }); }));
  await request(c, 'apply', [hide]); const previous = c.getSnapshot();
  const commit = request(c, 'commit'); assert.equal(c.getSnapshot().phase, 'saving');
  assert.equal((await request(c, 'apply', [opacity])).error.code, 'BUSY');
  assert.throws(() => c.edit([opacity]), { code: 'BUSY' });
  resolve(); const result = await commit;
  assert.equal(result.ok, true); assert.equal(result.state.dirty, false); assert.equal(result.state.canUndo, false);
  assert.equal(saved.length, 1); assert.equal(result.state.baseRevision, 'saved-2');
  assert.equal((await c.execute({ schemaVersion: 1, operation: 'undo', state: previous })).error.code, 'DRAFT_CONFLICT');
});
test('failed or mismatched save retains draft and undo; clean commit skips persistence', async () => {
  let calls = 0; const { c } = controller(async () => { calls++; throw new Error('disk failure'); });
  assert.equal((await request(c, 'commit')).ok, true); assert.equal(calls, 0);
  await request(c, 'apply', [hide]); const before = c.getSnapshot().ir;
  assert.equal((await request(c, 'commit')).error.code, 'SAVE_FAILED');
  assert.deepEqual(c.getSnapshot().ir, before); assert.equal(c.getSnapshot().canUndo, true); assert.equal(c.getSnapshot().phase, 'idle');
  const { c: mismatch } = controller(async () => ({ ir: fixture(), revision: 'different' }));
  await request(mismatch, 'apply', [hide]); assert.equal((await request(mismatch, 'commit')).error.code, 'SAVE_MISMATCH');
});
test('same saved base refresh preserves draft; new base invalidates tokens; operation locks allow inspection', async () => {
  const { c } = controller(); await request(c, 'apply', [hide]); const before = c.getSnapshot();
  c.install(fixture(), 'saved-1'); assert.deepEqual(c.getSnapshot(), before);
  c.setBlocked(true); assert.equal((await request(c, 'inspect')).state.phase, 'operation');
  assert.equal((await request(c, 'discard')).error.code, 'BUSY'); c.setBlocked(false);
  c.install(fixture(), 'saved-2'); assert.equal(c.getSnapshot().dirty, false);
  assert.equal((await c.execute({ schemaVersion: 1, operation: 'apply', state: before, commands: [hide] })).error.code, 'DRAFT_CONFLICT');
});
test('offline CLI returns machine JSON with shared diffs and rejects invalid batches', () => {
  const input = { schemaVersion: 1, baseRevision: 'base', ir: fixture(), commands: [hide, opacity] };
  const run = commands => spawnSync(process.execPath, ['scripts/draft-cli.mjs'], { cwd: root, input: JSON.stringify({ ...input, commands }), encoding: 'utf8' });
  const result = run(input.commands); assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout).state;
  assert.equal(state.changes.length, 2); assert.deepEqual(state.ir, applyCommands(input.ir, input.commands));
  const invalid = run([hide, { ...opacity, opacity: -1 }]); assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_COMMAND');
  assert.deepEqual(input.ir, fixture());
});

test('stable subscription snapshots isolate mutable responses and survive no-ops and phase changes', async () => {
  const { c } = controller(); let notifications = 0;
  c.subscribe(() => notifications++);
  const first = c.getSnapshot();
  assert.equal(c.getSnapshot(), first);
  assert.throws(() => { first.ir.parts[0].geometry.bbox[0] = 90; }, TypeError);
  c.edit([{ ...hide, visible: true }]);
  c.install(fixture(), 'saved-1');
  assert.equal(c.getSnapshot(), first); assert.equal(notifications, 0);
  const response = await request(c, 'apply', [opacity]);
  const edited = c.getSnapshot();
  response.state.ir.parts[0].appearance.opacity = 1;
  response.state.changes[0].after = 1;
  assert.equal(c.getSnapshot(), edited);
  assert.equal(edited.ir.parts[0].appearance.opacity, 120);
  assert.equal(edited.changes[0].after, 120);
  const inspected = await request(c, 'inspect');
  inspected.state.ir.parts.reverse(); inspected.state.changes.length = 0;
  assert.equal(c.getSnapshot(), edited);
  c.setBlocked(true); assert.equal(c.getSnapshot().phase, 'operation');
  c.setBlocked(false); assert.equal(c.getSnapshot().phase, 'idle');
  assert.deepEqual(c.getSnapshot().changes, edited.changes);
  c.beginGesture(); assert.equal(c.getSnapshot().phase, 'gesture');
  c.updateGesture([{ ...opacity, opacity: 80 }]); c.endGesture(true);
  assert.deepEqual(c.getSnapshot().changes, edited.changes);
  await request(c, 'undo'); assert.equal(c.getSnapshot().dirty, false);
  await request(c, 'redo'); assert.deepEqual(c.getSnapshot().changes, edited.changes);
  const saved = await request(c, 'commit');
  assert.equal(saved.state.dirty, false); assert.equal(saved.state.changes.length, 0);
  assert.equal(saved.state.baseRevision, 'saved-2');
  assert.notEqual(saved.state.draftId, first.draftId);
});

test('indexed thousand-layer sequences preserve ID targeting, order and atomic history', async () => {
  const ir = fixture();
  ir.parts = Array.from({ length: 1000 }, (_, i) => ({ ...structuredClone(ir.parts[0]),
    id: i === 999 ? '__proto__' : `id-${1000 - i}`, name: `layer-${i}`, z: 999 - i }));
  const c = new DraftController(async p => ({ ir: p.ir, revision: 'saved-2' }), () => {}, () => 'large');
  c.install(ir, 'saved-1');
  const batch = [0, 499, 999].map(i => ({ type: 'set_landmark', partId: ir.parts[i].id, name: 'center', point: [i % 100, 30] }));
  const applied = await request(c, 'apply', batch); assert.equal(applied.ok, true);
  assert.deepEqual(applied.state.ir.parts.map(p => [p.id, p.z]), ir.parts.map(p => [p.id, p.z]));
  assert.deepEqual(applied.state.changes.map(change => change.partId), batch.map(command => command.partId));
  for (const command of batch) assert.deepEqual(applied.state.ir.parts.find(p => p.id === command.partId).geometry.landmarks.center, command.point);
  const before = c.getSnapshot();
  const rejected = await request(c, 'apply', [{ type: 'set_opacity', partId: ir.parts[0].id, opacity: 20 }, { type: 'set_opacity', partId: 'missing', opacity: 20 }]);
  assert.equal(rejected.ok, false); assert.equal(c.getSnapshot(), before);
  await request(c, 'undo'); assert.deepEqual(c.getSnapshot().ir, ir);
  await request(c, 'redo'); assert.deepEqual(c.getSnapshot().ir, applied.state.ir);
  c.beginGesture(); c.updateGesture([{ ...batch[2], point: [90, 40] }]); c.endGesture(true);
  assert.deepEqual(c.getSnapshot().ir, applied.state.ir);
  await request(c, 'discard'); assert.deepEqual(c.getSnapshot().ir, ir);
  assert.equal(c.getSnapshot().canUndo, false); assert.equal(c.getSnapshot().canRedo, false);
  const reordered = { ...ir, parts: [...ir.parts].reverse() };
  assert.deepEqual(require(path.join(output, 'commands.js')).diffArtwork(ir, reordered), []);
});
