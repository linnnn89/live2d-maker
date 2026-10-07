import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, symlinkSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url)), repo = path.dirname(root);
const output = mkdtempSync(path.join(tmpdir(), 'studio-protocol-test-'));
symlinkSync(path.join(root,'node_modules'),path.join(output,'node_modules'),'junction');
after(() => rmSync(output, { recursive:true,force:true }));
const compiled = spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),
  '--target','ES2022','--module','commonjs','--lib','ES2022,DOM','--strict','--skipLibCheck','--outDir',output,
  'src/editor/DraftController.ts','src/api.ts'], {cwd:root,encoding:'utf8'});
assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
const require=createRequire(import.meta.url);
const { DraftController }=require(path.join(output,'editor/DraftController.js'));
const { validateProtocol, parseCommands, backendError, ProtocolError }=require(path.join(output,'protocol/index.js'));
const { api }=require(path.join(output,'api.js'));
const fixture=()=>({canvas:{width:2,height:2},parts:[{id:'face',name:'face',z:0,
  asset:{path:'face.png',offset:{left:0,top:0},size:{width:2,height:2}},
  geometry:{bbox:[0,0,2,2]},semantic:{tag:'FACE',side:'none'}}]});
const snapshot=()=>({schemaVersion:1,workspaceId:'0'.repeat(32),status:'ok',ir:fixture(),revision:'base',stale:{psd:true},
  overlay:{status:'not-loaded',reasons:[]},sourceImage:'/studio-files/source.png',sourceBounds:null,artworkBounds:null,build:null,qa:null});

test('shared command schema and optional reads preserve v1 full state, isolation and token semantics',async()=>{
  const c=new DraftController(async proposal=>({ir:proposal.ir,revision:'new'}),()=>{},()=> 'draft');
  c.install(fixture(),'base');
  const full=await c.execute({schemaVersion:1,operation:'inspect'});
  assert.ok(full.state.ir); assert.equal('response' in full.state,false);
  const summary=await c.execute({schemaVersion:1,operation:'inspect',response:'summary'});
  assert.equal('ir' in summary.state,false);assert.equal('parts' in summary.state,false);
  assert.equal(summary.state.draftId,full.state.draftId);assert.equal(summary.state.revision,full.state.revision);
  const parts=await c.execute({schemaVersion:1,operation:'diff',response:'parts',partIds:['face']});
  parts.state.parts[0].name='mutated';assert.equal(c.getSnapshot().ir.parts[0].name,'face');
  const bad=await c.execute({schemaVersion:1,operation:'apply',state:summary.state,
    commands:[{type:'set_opacity',partId:'face',opacity:256}]});
  assert.equal(bad.error.code,'INVALID_COMMAND');assert.equal(bad.error.partId,'face');assert.equal(bad.error.field,'opacity');
  assert.equal(bad.error.stage,'command');assert.equal(bad.error.retryable,false);assert.equal(c.getSnapshot().revision,0);
  assert.throws(()=>parseCommands([{type:'set_landmark',partId:'face',name:'a',point:[NaN,2]}]),{code:'INVALID_COMMAND'});
  assert.throws(()=>parseCommands([{type:'set_landmark',partId:'face',name:'a',point:[0,2],extra:true}]),{code:'INVALID_COMMAND',field:'extra'});
  assert.equal((await c.execute({schemaVersion:1,operation:'inspect',partIds:['face']})).error.code,'INVALID_REQUEST');
  assert.equal((await c.execute({schemaVersion:1,operation:'inspect',response:'parts',partIds:['missing']})).error.code,'PART_NOT_FOUND');
  const saved=await c.execute({schemaVersion:1,operation:'apply',state:summary.state,commands:[{type:'set_visibility',partId:'face',visible:false}]});
  assert.equal(saved.ok,true);summary.state.changes.push({partId:'outside'});assert.equal(c.getSnapshot().changes.length,1);
});

test('HTTP parser validates successful DTOs and preserves structured error identity independently of message',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>Response.json(snapshot());assert.equal((await api('open')).schemaVersion,1);
    globalThis.fetch=async()=>Response.json({...snapshot(),schemaVersion:2});await assert.rejects(api('open'),{code:'PROTOCOL_ERROR'});
    const detail={code:'BASE_CONFLICT',stage:'save',message:'保存基线已变化',retryable:false};
    globalThis.fetch=async()=>Response.json({schemaVersion:1,status:'error',error:'different text',detail},{status:409});
    await assert.rejects(api('save',{}),{code:'BASE_CONFLICT',stage:'save',retryable:false,status:409,message:detail.message});
    globalThis.fetch=async()=>new Response('broken JSON',{status:400});await assert.rejects(api('save',{}),{code:'PROTOCOL_ERROR'});
    assert.equal(backendError({error:'IR changed in another editor; reload before saving'}).code,'BASE_CONFLICT');
    assert.equal(backendError({error:'busy'},409).retryable,true);
    const error=new ProtocolError('EDIT_SCOPE','scope','save',false,'face','geometry.bbox');
    const c=new DraftController(async()=>{throw error;},()=>{});c.install(fixture(),'base');
    await c.execute({schemaVersion:1,operation:'apply',state:c.getSnapshot(),commands:[{type:'set_opacity',partId:'face',opacity:100}]});
    const result=await c.execute({schemaVersion:1,operation:'commit',state:c.getSnapshot()});
    assert.equal(result.error.field,'geometry.bbox');assert.equal(result.error.code,'EDIT_SCOPE');assert.equal(c.getSnapshot().canUndo,true);
  } finally {globalThis.fetch=original;}
});

const python=process.env.STUDIO_TEST_PYTHON?path.resolve(process.env.STUDIO_TEST_PYTHON):path.join(repo,'python/Scripts/python.exe');
if(process.env.STUDIO_TEST_PYTHON)assert.ok(existsSync(python),'STUDIO_TEST_PYTHON must name an installed Python interpreter');
test('real Python CLI shares schema validation and preserves workspace on conflict and busy errors',
  {skip: !existsSync(python) && 'project Windows Python is unavailable'},()=>{
  const examples=[{type:'set_visibility',partId:'face',visible:false},{type:'set_opacity',partId:'face',opacity:256},
    {type:'set_polygon',partId:'face',points:[[0,0],[1,1]]},{type:'set_landmark',partId:'face',name:'a',point:[0,1],extra:true}];
  const expected=examples.map(value=>{try{validateProtocol('EditCommand',value);return true;}catch{return false;}});
  const program=`import json,sys\nfrom pathlib import Path\nfrom tools.authoring_rig.studio_protocol import validator\nfrom tools.authoring_rig.tests.test_studio import StudioPersistence\nvalues=json.loads(sys.stdin.read())\nwork,first,payload=StudioPersistence().import_fixture(Path(sys.argv[1]))\nprint(json.dumps({'valid':[validator('EditCommand').is_valid(v) for v in values],'workspace':str(work),'snapshot':first}))`;
  const result=spawnSync(python,['-c',program,output],{cwd:repo,input:JSON.stringify(examples),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const setup=JSON.parse(result.stdout);
  assert.deepEqual(setup.valid,expected);validateProtocol('Snapshot',setup.snapshot);
  const irFile=path.join(setup.workspace,'authoring-rig.json'),before=readFileSync(irFile);
  const cli=(command,payload)=>spawnSync(python,['-m','tools.authoring_rig',command,'--workspace',setup.workspace],{cwd:repo,input:JSON.stringify(payload),encoding:'utf8'});
  const opened=cli('studio-snapshot',{});assert.equal(opened.status,0,opened.stderr);
  validateProtocol('Snapshot',JSON.parse(opened.stdout));
  let response=cli('studio-save',{revision:'obsolete',ir:setup.snapshot.ir});assert.equal(response.status,1);
  const conflict=JSON.parse(response.stdout);validateProtocol('StudioError',conflict.detail);assert.equal(conflict.detail.code,'BASE_CONFLICT');
  assert.deepEqual(readFileSync(irFile),before);
  response=cli('studio-save',{revision:setup.snapshot.revision,ir:setup.snapshot.ir,unexpected:true});assert.equal(JSON.parse(response.stdout).detail.code,'INVALID_REQUEST');
  const lock=spawnSync(python,['-c',`from pathlib import Path\nimport sys\nPath(sys.argv[1]).write_text('test')`,path.join(setup.workspace,'.studio.lock')],{encoding:'utf8'});assert.equal(lock.status,0);
  response=cli('studio-save',{revision:setup.snapshot.revision,ir:setup.snapshot.ir});
  const busy=JSON.parse(response.stdout);assert.equal(busy.detail.code,'BACKEND_BUSY');assert.equal(busy.detail.retryable,true);assert.deepEqual(readFileSync(irFile),before);
});
