import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-settings-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
const compiled = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', output,
  'src/workspace/settingsDraft.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const require = createRequire(import.meta.url);
const { createSettingsDraft, receiveSettings, settingsChanged } = require(path.join(output, 'workspace/settingsDraft.js'));
const saved = (revision, atlasSize = 2048) => ({ revision,
  settings: { schemaVersion: 1, atlasSize, meshInteriorDensity: 40, headTurnStrength: 1 } });

test('clean settings follow server revisions without changing unchanged form identity', () => {
  const initial = saved('A'), draft = receiveSettings(null, 'workspace', initial);
  assert.equal(settingsChanged(draft), false);
  assert.equal(receiveSettings(draft, 'workspace', structuredClone(initial)), draft);
  const changed = receiveSettings(draft, 'workspace', saved('B', 4096));
  assert.equal(changed.settings.atlasSize, 4096);
  assert.equal(changed.base.revision, 'B');
  assert.equal(settingsChanged(changed), false);
});

test('dirty settings retain inputs and the original CAS baseline across server refreshes', () => {
  const base = createSettingsDraft('workspace', saved('A'));
  const draft = { ...base, settings: { ...base.settings, atlasSize: 1024 } };
  for (const remote of [saved('B', 4096), saved('C', 1024)]) {
    const next = receiveSettings(draft, 'workspace', remote);
    assert.equal(next, draft);
    assert.equal(next.settings.atlasSize, 1024);
    assert.equal(next.base.revision, 'A');
    assert.equal(settingsChanged(next), true);
  }
});

test('reverting local inputs lets a clean form adopt the latest server values', () => {
  const draft = createSettingsDraft('workspace', saved('A'));
  draft.settings.headTurnStrength = 0.5;
  assert.equal(settingsChanged(draft), true);
  draft.settings.headTurnStrength = 1;
  const next = receiveSettings(draft, 'workspace', saved('B', 4096));
  assert.equal(next.base.revision, 'B');
  assert.equal(next.settings.atlasSize, 4096);
});

test('confirmed save or explicit discard creates a clean isolated baseline', () => {
  const incoming = saved('B', 1024), draft = createSettingsDraft('workspace', incoming);
  assert.equal(settingsChanged(draft), false);
  draft.settings.meshInteriorDensity = 12;
  assert.equal(draft.base.settings.meshInteriorDensity, 40);
  assert.equal(incoming.settings.meshInteriorDensity, 40);
  incoming.settings.atlasSize = 4096;
  assert.equal(draft.base.settings.atlasSize, 1024);
});

test('a different workspace resets dirty settings even when revision values match', () => {
  const draft = createSettingsDraft('first', saved('A'));
  draft.settings.atlasSize = 1024;
  const next = receiveSettings(draft, 'second', saved('A'));
  assert.equal(next.workspaceId, 'second');
  assert.equal(next.settings.atlasSize, 2048);
  assert.equal(settingsChanged(next), false);
});
