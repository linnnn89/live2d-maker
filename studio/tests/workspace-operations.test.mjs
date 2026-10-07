import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-operations-'));
symlinkSync(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'junction');
after(() => rmSync(output, { recursive: true, force: true }));
const compiled = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck',
  '--outDir', output, 'src/workspace/WorkspaceOperations.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const require = createRequire(import.meta.url);
const { WorkspaceOperations } = require(path.join(output, 'workspace/WorkspaceOperations.js'));
const { DraftController } = require(path.join(output, 'editor/DraftController.js'));
const ir = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/artwork.json'))).cases[0].ir;

function host(persist = async proposal => ({ ir: proposal.ir, revision: 'saved' })) {
  const editor = new DraftController(persist, () => {}), messages = [];
  editor.install(ir, 'base');
  return { editor, messages, operations: new WorkspaceOperations(editor, label => messages.push(label)) };
}

test('operation admission is synchronous and respects gestures and an Agent save', async () => {
  let resolve;
  const { editor, messages, operations } = host(proposal => new Promise(yes => { resolve = () => yes({ ...proposal, revision: 'saved' }); }));
  const first = operations.begin('first');
  assert.equal(operations.begin('duplicate'), null);
  assert.equal(editor.getSnapshot().phase, 'operation');
  first.finish(); first.finish(); assert.deepEqual(messages, ['first', '']);
  editor.beginGesture(); assert.equal(operations.begin('during gesture'), null); editor.endGesture(true);
  editor.edit([{ type: 'set_opacity', partId: 'solid', opacity: 80 }]);
  const saving = editor.execute({ schemaVersion: 1, operation: 'commit', state: editor.getSnapshot() });
  assert.equal(operations.begin('during Agent save'), null);
  resolve(); assert.equal((await saving).ok, true); operations.dispose();
});

test('a saving operation keeps the editor blocked across the saved-baseline publication', async () => {
  let resolve;
  const { editor, operations } = host(proposal => new Promise(yes => { resolve = () => yes({ ...proposal, revision: 'saved' }); }));
  editor.edit([{ type: 'set_opacity', partId: 'solid', opacity: 80 }]);
  const operation = operations.begin('save then rebuild', true);
  const saving = editor.execute({ schemaVersion: 1, operation: 'commit', state: editor.getSnapshot() });
  operation.block();
  resolve(); assert.equal((await saving).ok, true);
  const token = editor.getSnapshot(); assert.equal(token.phase, 'operation');
  const competing = await editor.execute({ schemaVersion: 1, operation: 'apply', state: token,
    commands: [{ type: 'set_opacity', partId: 'solid', opacity: 160 }] });
  assert.equal(competing.error.code, 'BUSY');
  operation.finish(); assert.equal(editor.getSnapshot().phase, 'idle'); operations.dispose();
});

test('closed owners and late success, failure, progress or finally cannot change a replacement operation', async () => {
  const { editor, messages, operations } = host();
  const old = operations.begin('old'); operations.dispose(); operations.dispose();
  assert.equal(old.isCurrent(), false); assert.equal(operations.begin('closed'), null);
  const nextOwner = new WorkspaceOperations(editor, label => messages.push(label));
  const next = nextOwner.begin('new');
  const before = [...messages];
  for (const completion of ['success', 'failure', 'progress']) {
    await Promise.resolve();
    if (old.isCurrent()) messages.push(completion);
    old.update(completion); old.block(); old.finish();
    assert.equal(next.isCurrent(), true); assert.equal(editor.getSnapshot().phase, 'operation');
    assert.deepEqual(messages, before);
  }
  next.finish(); assert.equal(editor.getSnapshot().phase, 'idle'); nextOwner.dispose();
});
