import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-artwork-test-'));
after(() => rmSync(output, { recursive: true, force: true }));
const compiled = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck',
  '--outDir', output, 'src/artwork/ArtworkRenderer.ts', 'src/artwork/capture.ts', 'src/editor/DraftController.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const require = createRequire(import.meta.url);
const { ArtworkRenderer } = require(path.join(output, 'artwork/ArtworkRenderer.js'));
const { captureArtwork } = require(path.join(output, 'artwork/capture.js'));
const { DraftController } = require(path.join(output, 'editor/DraftController.js'));
// Codec is ESM; resolve its dependency from the installed project, not the temp folder.
for (const name of ['png', 'AssetCache']) {
  const source = readFileSync(path.join(root, `src/artwork/${name}.ts`), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll("from './contracts'", "from './contracts.js'")
    .replaceAll("from './png'", "from './png.mjs'")
    .replaceAll("from 'fast-png'", `from ${JSON.stringify(pathToFileURL(path.join(root, 'node_modules/fast-png/lib/index.js')).href)}`);
  writeFileSync(path.join(output, `artwork/${name}.mjs`), code);
}
const { decodeAsset, encodeFrame } = await import(pathToFileURL(path.join(output, 'artwork/png.mjs')));
const { AssetCache } = await import(pathToFileURL(path.join(output, 'artwork/AssetCache.mjs')));
const fixtures = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/artwork.json')));
const bytes = value => Buffer.from(value, 'base64');

for (const format of fixtures.formats) test(`PNG ${format.mode} preserves unpremultiplied pixels and transparency`, () => {
  const asset = decodeAsset(bytes(format.png));
  assert.deepEqual(Buffer.from(asset.data), bytes(format.rgba));
});
for (const fixture of fixtures.cases) test(`pixels match Python oracle: ${fixture.name}`, async () => {
  const renderer = new ArtworkRenderer(async part => decodeAsset(bytes(fixtures.assets[part.asset.path])));
  const frame = await renderer.render(fixture.ir);
  assert.deepEqual(Buffer.from(frame.data), bytes(fixture.rgba));
  assert.deepEqual(frame.bounds, fixture.bounds);
  assert.deepEqual(Buffer.from(decodeAsset(bytes(encodeFrame(frame).split(',')[1])).data), bytes(fixture.rgba));
});
test('render cache invalidates polygon and opacity but ignores annotations; source assets stay untouched', async () => {
  const ir = structuredClone(fixtures.cases[0].ir), raw = decodeAsset(bytes(fixtures.assets['solid.png']));
  const original = Buffer.from(raw.data), renderer = new ArtworkRenderer(async () => raw);
  const before = await renderer.render(ir);
  ir.parts[0].geometry.landmarks = { iris: [2, 2] };
  assert.deepEqual((await renderer.render(ir)).data, before.data);
  ir.parts[0].appearance.opacity = 100;
  assert.notDeepEqual((await renderer.render(ir)).data, before.data);
  ir.parts[0].geometry.polygon = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.deepEqual((await renderer.render(ir)).bounds, [0, 0, 1, 1]);
  assert.deepEqual(Buffer.from(raw.data), original);
});
test('dimension or missing asset failure rejects the image instead of drawing a partial composite', async () => {
  const ir = fixtures.cases[0].ir;
  await assert.rejects(new ArtworkRenderer(async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) })).render(ir), { code: 'ASSET_SIZE' });
  await assert.rejects(new ArtworkRenderer(async () => { throw new Error('missing'); }).render(ir), /missing/);
  await assert.rejects(new ArtworkRenderer(async () => {}).render({ canvas: { width: 1e9, height: 1e9 }, parts: [] }), { code: 'IMAGE_SIZE' });
});
test('asset loading deduplicates immutable hashes and recovers after a failed request', async () => {
  let calls = 0, fail = true;
  const cache = new AssetCache(async () => { calls++; if (fail) throw new Error('offline'); return bytes(fixtures.assets['solid.png']); });
  const part = structuredClone(fixtures.cases[0].ir.parts[0]);
  await assert.rejects(cache.get(part), { code: 'ASSET_LOAD' }); fail = false;
  const [first, second] = await Promise.all([cache.get(part), cache.get(part)]);
  assert.equal(first, second); assert.equal(calls, 2);
  part.asset.sha256 = 'new'; await cache.get(part); assert.equal(calls, 3);
});
function editor() {
  let sequence = 0;
  const c = new DraftController(async p => ({ ir: p.ir, revision: 'base-2' }), () => {}, () => `draft-${++sequence}`);
  c.install(fixtures.cases[0].ir, 'base-1'); return c;
}
test('draft and saved capture share the renderer but identify their respective IR and revision', async () => {
  const c = editor(); c.edit([{ type: 'set_visibility', partId: 'solid', visible: false }]);
  const renderer = new ArtworkRenderer(async part => decodeAsset(bytes(fixtures.assets[part.asset.path])));
  const capture = async ir => { const frame = await renderer.render(ir); return { width: frame.width, height: frame.height, bounds: frame.bounds, dataUrl: encodeFrame(frame) }; };
  const request = { schemaVersion: 1, state: c.getSnapshot() };
  const draft = await captureArtwork(request, c.getSnapshot, c.getBase, capture);
  const saved = await captureArtwork({ ...request, source: 'saved' }, c.getSnapshot, c.getBase, capture);
  assert.equal(draft.ok, true); assert.equal(saved.ok, true);
  assert.equal(draft.image.bounds, null); assert.deepEqual(saved.image.bounds, fixtures.cases[0].bounds);
  assert.equal(draft.image.revision, c.getSnapshot().revision); assert.equal(draft.image.baseRevision, 'base-1');
  assert.equal(draft.image.source, 'draft'); assert.equal(saved.image.source, 'saved');
  assert.notEqual(saved.image.dataUrl, draft.image.dataUrl);
  const base = c.getBase(); base.ir.parts[0].name = 'outside'; assert.equal(c.getBase().ir.parts[0].name, 'solid');
});
test('capture rejects stale/malformed/busy requests before rendering', async () => {
  const c = editor(); let renders = 0;
  const capture = async () => { renders++; };
  assert.equal((await captureArtwork({ schemaVersion: 1, state: { draftId: 'old', revision: 0 } }, c.getSnapshot, c.getBase, capture)).error.code, 'DRAFT_CONFLICT');
  for (const request of [null, { schemaVersion: 2 }, { schemaVersion: 1, state: c.getSnapshot(), source: 'reference' }])
    assert.equal((await captureArtwork(request, c.getSnapshot, c.getBase, capture)).error.code, 'INVALID_REQUEST');
  c.beginGesture(); assert.equal((await captureArtwork({ schemaVersion: 1, state: c.getSnapshot() }, c.getSnapshot, c.getBase, capture)).error.code, 'BUSY');
  c.endGesture(true); assert.equal(renders, 0);
});
test('capture never assigns an old image to a version edited or saved while rendering', async () => {
  const c = editor(); let resolve;
  const pending = captureArtwork({ schemaVersion: 1, state: c.getSnapshot() }, c.getSnapshot, c.getBase,
    () => new Promise(r => { resolve = r; }));
  c.edit([{ type: 'set_visibility', partId: 'solid', visible: false }]);
  resolve({ width: 8, height: 7, bounds: null, dataUrl: 'fixture' });
  assert.equal((await pending).error.code, 'DRAFT_CONFLICT');
  const saving = captureArtwork({ schemaVersion: 1, state: c.getSnapshot(), source: 'saved' }, c.getSnapshot, c.getBase,
    () => new Promise(r => { resolve = r; }));
  await c.execute({ schemaVersion: 1, operation: 'commit', state: c.getSnapshot() });
  resolve({ width: 8, height: 7, bounds: null, dataUrl: 'fixture' });
  assert.equal((await saving).error.code, 'DRAFT_CONFLICT');
});
