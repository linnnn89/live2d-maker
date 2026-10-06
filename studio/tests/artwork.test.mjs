import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'studio-artwork-test-'));
symlinkSync(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'junction');
after(() => rmSync(output, { recursive: true, force: true }));
const compiled = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck',
  '--outDir', output, 'src/artwork/ArtworkRenderer.ts', 'src/artwork/capture.ts', 'src/editor/DraftController.ts', 'src/project/paths.ts', 'src/assets/mask.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
const require = createRequire(import.meta.url);
const { ArtworkRenderer } = require(path.join(output, 'artwork/ArtworkRenderer.js'));
const { captureArtwork } = require(path.join(output, 'artwork/capture.js'));
const { DraftController } = require(path.join(output, 'editor/DraftController.js'));
const {blankMask,rectangleMask,brushMask,moveBounds,resizeBounds,maskFromPixels,alphaBounds}=require(path.join(output,'assets/mask.js'));
// Codec is ESM; resolve its dependency from the installed project, not the temp folder.
for (const name of ['png', 'AssetCache', 'ArtworkClient']) {
  const source = readFileSync(path.join(root, `src/artwork/${name}.ts`), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll("from './contracts'", "from './contracts.js'")
    .replaceAll("from './png'", "from './png.mjs'")
    .replaceAll("from './MemoryBudget'", "from './MemoryBudget.js'")
    .replaceAll("from './content'", "from './content.js'")
    .replaceAll("from '../protocol'", "from '../protocol/index.js'")
    .replaceAll("from '../project/paths'", "from '../project/paths.js'")
    .replaceAll("from 'fflate'", `from ${JSON.stringify(pathToFileURL(path.join(root, 'node_modules/fflate/esm/index.mjs')).href)}`)
    .replaceAll("from 'fast-png'", `from ${JSON.stringify(pathToFileURL(path.join(root, 'node_modules/fast-png/lib/index.js')).href)}`);
  writeFileSync(path.join(output, `artwork/${name}.mjs`), code);
}
const { decodeAsset, encodeFrame } = await import(pathToFileURL(path.join(output, 'artwork/png.mjs')));
const { AssetCache } = await import(pathToFileURL(path.join(output, 'artwork/AssetCache.mjs')));
const { ArtworkClient } = await import(pathToFileURL(path.join(output, 'artwork/ArtworkClient.mjs')));
const { MemoryBudget } = require(path.join(output,'artwork/MemoryBudget.js'));
const { artworkKey } = require(path.join(output,'artwork/content.js'));
const fixtures = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/artwork.json')));
const bytes = value => Buffer.from(value, 'base64');

test('local editable masks use binary pixel-centre strokes and placement stays inside the canvas',()=>{
  const mask=blankMask(8,6);assert.deepEqual([...mask],Array(48).fill(0));
  rectangleMask(mask,8,6,[1,1,4,3],true);
  assert.deepEqual([...mask.entries()].filter(([,v])=>v===255).map(([i])=>i),[9,10,11,17,18,19]);
  const stroke=blankMask(8,6);brushMask(stroke,8,6,[2,3],[6,3],1,true);
  assert.deepEqual([...stroke.entries()].filter(([,v])=>v===255).map(([i])=>i),[17,18,19,20,21,22,25,26,27,28,29,30]);
  brushMask(stroke,8,6,[4,3],[4,3],1,false);assert.equal(stroke[19],0);assert.equal(stroke[20],0);assert.equal(stroke[17],255);
  assert.ok([...stroke].every(v=>v===0||v===255));
  assert.deepEqual(moveBounds([2,1,5,4],100,-100,8,6),[5,0,8,3]);
  assert.deepEqual(resizeBounds([2,1,5,4],2,[100,100],8,6),[2,1,8,6]);
  assert.deepEqual(resizeBounds([2,1,5,4],0,[100,100],8,6),[4,3,5,4]);
  const image={width:8,height:6,data:new Uint8ClampedArray(8*6*4)};
  for(let i=0;i<mask.length;i++)image.data.set([mask[i],mask[i],mask[i],255],i*4);
  assert.deepEqual(maskFromPixels(image,8,6),mask);image.data[0]=128;assert.throws(()=>maskFromPixels(image,8,6),/二值/);
  assert.throws(()=>maskFromPixels(image,7,6),/尺寸/);
  const sprite={width:4,height:4,data:new Uint8ClampedArray(64)};sprite.data[3]=255;sprite.data[(2*4+2)*4+3]=255;
  assert.deepEqual(alphaBounds(sprite),[0,0,3,3]);assert.deepEqual(alphaBounds(sprite,[1,1,4,4]),[2,2,3,3]);assert.equal(alphaBounds(sprite,[3,3,4,4]),null);
});

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

test('pixel identities reuse complete frames, isolate outputs and cancel obsolete work at a deterministic boundary', async () => {
  const ir=structuredClone(fixtures.cases[0].ir), original=structuredClone(ir);
  let reads=0, inFlight=0, maximum=0;
  const renderer=new ArtworkRenderer(async part=>{
    reads++;inFlight++;maximum=Math.max(maximum,inFlight);await Promise.resolve();inFlight--;
    return decodeAsset(bytes(fixtures.assets[part.asset.path]));
  });
  const frame=await renderer.render(ir); frame.data.fill(0);
  ir.parts[0].geometry.landmarks={note:[1,2]};
  assert.equal(artworkKey(ir),artworkKey(original));
  assert.deepEqual(Buffer.from((await renderer.render(ir)).data),bytes(fixtures.cases[0].rgba));
  assert.equal(renderer.stats.compositions,1);assert.equal(reads,1);
  ir.parts[0].appearance.opacity=80;await renderer.render(ir);
  assert.equal(renderer.stats.compositions,2);
  await renderer.render(original);assert.equal(renderer.stats.compositions,2);
  assert.equal(maximum,1);
  const controller=new AbortController();let yields=0;
  const memory=new MemoryBudget(1024*1024);
  const large={...original,canvas:{width:256,height:256},parts:[{...original.parts[0],asset:{...original.parts[0].asset,size:{width:256,height:256}},geometry:{bbox:[0,0,256,256]}}]};
  const cancelling=new ArtworkRenderer(async()=>({width:256,height:256,data:new Uint8ClampedArray(256*256*4)}),memory,
    async()=>{if(++yields===2)controller.abort();},0);
  await assert.rejects(cancelling.render(large,controller.signal),{code:'ABORTED'});
  assert.equal(cancelling.stats.compositions,0);assert.equal(memory.stats.usedBytes,0);
  await cancelling.render(large);assert.equal(cancelling.stats.compositions,1);
  assert.ok(memory.stats.peakBytes<=memory.stats.limitBytes);
});

test('one memory budget accounts pinned work and evicts caches; PNG inflation and failed decoding stay bounded', async () => {
  const memory=new MemoryBudget(64);let evicted=0;
  const cached=memory.reserve(32);cached.retain(()=>evicted++);
  const unpin=cached.pin();const active=memory.reserve(32);
  assert.throws(()=>memory.reserve(1),{code:'MEMORY_BUDGET'});
  active.release();unpin();
  const replacement=memory.reserve(40);assert.equal(evicted,1);assert.equal(memory.stats.usedBytes,40);
  replacement.release();assert.equal(memory.stats.usedBytes,0);assert.equal(memory.stats.peakBytes,64);
  const actual=new MemoryBudget(64*1024*1024), part=structuredClone(fixtures.cases[0].ir.parts[0]);
  let broken=true;
  const cache=new AssetCache(async()=>{
    const png=new Uint8Array(bytes(fixtures.assets[part.asset.path]));
    if(broken)new DataView(png.buffer).setUint32(16,1);
    return png;
  },actual);
  await assert.rejects(cache.acquire(part),{code:'ASSET_SIZE'});assert.equal(actual.stats.usedBytes,0);
  const bomb=new Uint8Array(bytes(fixtures.assets[part.asset.path]));
  new DataView(bomb.buffer).setUint32(16,1);new DataView(bomb.buffer).setUint32(20,1);
  assert.throws(()=>decodeAsset(bomb),{code:'ASSET_FORMAT'});
  broken=false;
  const renderer=new ArtworkRenderer(cache.acquire,actual);
  const frame=await renderer.render(fixtures.cases[0].ir);
  assert.deepEqual(Buffer.from(frame.data),bytes(fixtures.cases[0].rgba));
  assert.ok(actual.stats.peakBytes<=actual.stats.limitBytes);
  assert.ok(actual.stats.peakBytes>48*1024*1024);
  await assert.rejects(new ArtworkRenderer(async()=>{},new MemoryBudget(128)).render({canvas:{width:100,height:100},parts:[]}),{code:'MEMORY_BUDGET'});
});

test('client keeps one active task, coalesces display updates, bounds captures and acknowledges transfer ownership', async () => {
  const sent=[];const port={onmessage:null,onerror:null,postMessage:value=>sent.push(value),terminate:()=>{}};
  const client=new ArtworkClient(()=>port), ir=fixtures.cases[0].ir;
  const first=client.render(ir).catch(error=>error.code);
  const displays=[];
  for(let i=0;i<100;i++)displays.push(client.render(ir).catch(error=>error.code));
  const captures=Array.from({length:4},()=>client.capture(ir));
  await assert.rejects(client.capture(ir),{code:'QUEUE_FULL'});
  assert.equal(client.stats.activeJobs,1);assert.equal(client.stats.queuedJobs,5);
  assert.equal(sent.filter(value=>value.kind==='render').length,1);
  assert.equal(sent.filter(value=>value.kind==='cancel').length,1);
  const reply=()=>{const job=sent.filter(value=>value.kind==='render'||value.kind==='capture').at(-1);port.onmessage({data:{id:job.id,ok:true,value:{width:1,height:1,bounds:null,data:new Uint8ClampedArray(4),dataUrl:'fixture'},metrics:{compositions:1}}});return job;};
  reply();assert.equal(await first,'ABORTED');
  assert.equal(reply().kind,'render');
  for(let i=0;i<4;i++)assert.equal(reply().kind,'capture');
  assert.equal((await Promise.all(displays)).filter(value=>value==='ABORTED').length,99);
  assert.equal((await Promise.all(captures)).length,4);
  assert.equal(client.stats.queuedJobs,0);assert.equal(client.stats.activeJobs,0);
  assert.equal(sent.filter(value=>value.kind==='ack').length,6);
  await assert.rejects(client.capture({...ir,metadata:{name:'x'.repeat(2*1024*1024)}}),{code:'MEMORY_BUDGET'});
  const closing=client.capture(ir);client.dispose();await assert.rejects(closing,{code:'ABORTED'});
});
