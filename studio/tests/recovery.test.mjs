import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync, symlinkSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),repo=path.dirname(root);
const output=mkdtempSync(path.join(tmpdir(),'studio-recovery-test-'));
symlinkSync(path.join(root,'node_modules'),path.join(output,'node_modules'),'junction');
after(()=>rmSync(output,{recursive:true,force:true}));
const compile=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),
  '--target','ES2022','--module','commonjs','--lib','ES2022,DOM','--strict','--skipLibCheck','--outDir',output,
  'src/recovery/DraftBackup.ts','src/editor/DraftSession.ts'],{cwd:root,encoding:'utf8'});
assert.equal(compile.status,0,compile.stdout+compile.stderr);
const require=createRequire(import.meta.url);
const { checkpoint,recoveryPlan }=require(path.join(output,'recovery/checkpoint.js'));
const { DraftBackup }=require(path.join(output,'recovery/DraftBackup.js'));
const { DraftSession }=require(path.join(output,'editor/DraftSession.js'));
const workspaceId='1'.repeat(32);
const fixture=()=>({canvas:{width:4,height:4},parts:[{id:'face',name:'face',z:0,
  asset:{path:'face.png',size:{width:4,height:4},offset:{left:0,top:0}},geometry:{bbox:[0,0,4,4]},semantic:{tag:'FACE',side:'none'}}]});
test('incremental checkpoint restores atomically and separates compatible, conflicting, missing and already-applied fields',()=>{
  const ir=fixture(),session=new DraftSession(ir,'base','old');
  session.apply(session.token(),[{type:'set_opacity',partId:'face',opacity:120},{type:'set_landmark',partId:'face',name:'center',point:[2,2]}]);
  const record=checkpoint(workspaceId,session.inspect());assert.equal('ir' in record,false);assert.equal(record.changes.length,2);
  const plan=recoveryPlan(record,ir,workspaceId);assert.equal(plan.commands.length,2);assert.equal(plan.conflicts.length,0);
  const restored=new DraftSession(ir,'base','new');restored.apply(restored.token(),plan.commands);
  assert.deepEqual(restored.inspect().ir,session.inspect().ir);restored.undo(restored.token());assert.deepEqual(restored.inspect().ir,ir);
  const changed=structuredClone(ir);changed.parts[0].appearance={visible:true,opacity:180};
  const partial=recoveryPlan(record,changed,workspaceId);assert.equal(partial.commands.length,1);assert.equal(partial.conflicts[0].field,'appearance.opacity');
  assert.equal(recoveryPlan(record,session.inspect().ir,workspaceId).alreadyApplied,2);
  assert.equal(recoveryPlan(record,{...ir,parts:[]},workspaceId).conflicts.length,2);
  assert.throws(()=>recoveryPlan(record,ir,'2'.repeat(32)),{code:'RECOVERY_WORKSPACE'});
  assert.throws(()=>recoveryPlan({...record,changes:[...record.changes,record.changes[0]]},ir,workspaceId),{code:'RECOVERY_FORMAT'});
  assert.equal(record.changes.length,2);assert.equal(session.inspect().ir.parts[0].appearance.opacity,120);
});
test('backup coalesces completed edits, serializes pending writes, retains failed work and clears only this page records',async()=>{
  const session=new DraftSession(fixture(),'base','tab-a'),entries=new Map([['tab-b',{draftId:'tab-b'}]]),messages=[];
  let fail=false,release=null;
  const storage={list:async()=>[...entries.values()],put:async value=>{if(fail)throw new Error('quota');if(release)await release.promise;entries.set(value.draftId,structuredClone(value));},
    remove:async value=>{entries.delete(value.draftId);}};
  const backup=new DraftBackup(workspaceId,storage,(message,failed)=>messages.push({message,failed}));
  backup.update(session.inspect());await backup.flush(); // Empty cleanup must not permanently pin a resolved running promise.
  session.apply(session.token(),[{type:'set_opacity',partId:'face',opacity:120}]);backup.update(session.inspect());await backup.flush();
  assert.equal(entries.get('tab-a').changes[0].after,120);
  release={promise:null,resolve:null};release.promise=new Promise(resolve=>{release.resolve=resolve;});
  session.apply(session.token(),[{type:'set_opacity',partId:'face',opacity:100}]);backup.update(session.inspect());const pending=backup.flush();
  await Promise.resolve();session.apply(session.token(),[{type:'set_opacity',partId:'face',opacity:80}]);backup.update(session.inspect());
  release.resolve();release=null;await pending;assert.equal(entries.get('tab-a').changes[0].after,80);
  fail=true;session.apply(session.token(),[{type:'set_opacity',partId:'face',opacity:60}]);backup.update(session.inspect());await backup.flush();
  assert.equal(entries.get('tab-a').changes[0].after,80);assert.equal(messages.at(-1).failed,true);assert.equal(session.inspect().ir.parts[0].appearance.opacity,60);
  fail=false;backup.update(session.inspect());await backup.flush();assert.equal(entries.get('tab-a').changes[0].after,60);
  session.beginGesture(session.token());session.updateGesture([{type:'set_opacity',partId:'face',opacity:20}]);backup.update(session.inspect());await backup.flush();
  assert.equal(entries.get('tab-a').changes[0].after,60);session.endGesture(true);
  session.discard(session.token());backup.update(session.inspect());await backup.flush();assert.equal(entries.has('tab-a'),false);assert.equal(entries.has('tab-b'),true);
});
const python=process.env.STUDIO_TEST_PYTHON?path.resolve(process.env.STUDIO_TEST_PYTHON):path.join(repo,'python/Scripts/python.exe');
if(process.env.STUDIO_TEST_PYTHON)assert.ok(existsSync(python),'STUDIO_TEST_PYTHON must name an installed Python interpreter');
test('legacy workspace migration keeps one persisted identity and leaves source, IR and revisions unchanged',
  {skip:!existsSync(python)&&'project Windows Python is unavailable'},()=>{
  const script=`import json,sys\nfrom pathlib import Path\nfrom tools.authoring_rig.tests.test_studio import StudioPersistence\nfrom tools.authoring_rig.studio import write\nw,s,p=StudioPersistence().import_fixture(Path(sys.argv[1]))\nstate=json.loads((w/'studio-state.json').read_text())\nstate.pop('workspaceId')\nwrite(w/'studio-state.json',state)\nprint(json.dumps({'workspace':str(w),'snapshot':s}))`;
  const setup=spawnSync(python,['-c',script,output],{cwd:repo,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
  const {workspace,snapshot}=JSON.parse(setup.stdout),ir=readFileSync(path.join(workspace,'authoring-rig.json')),source=readFileSync(path.join(workspace,'source.png'));
  const read=()=>{const result=spawnSync(python,['-m','tools.authoring_rig','studio-snapshot','--workspace',workspace],{cwd:repo,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const migrated=read(),again=read();assert.match(migrated.workspaceId,/^[a-f0-9]{32}$/);assert.equal(migrated.workspaceId,again.workspaceId);
  assert.equal(migrated.revision,snapshot.revision);assert.deepEqual(readFileSync(path.join(workspace,'authoring-rig.json')),ir);assert.deepEqual(readFileSync(path.join(workspace,'source.png')),source);
  assert.equal(JSON.parse(readFileSync(path.join(workspace,'studio-state.json'),'utf8')).workspaceId,migrated.workspaceId);
});

test('semantic overrides preserve import estimates and support atomic history and recovery', () => {
  const ir=fixture(), session=new DraftSession(ir,'base','semantic');
  const original=structuredClone(ir.parts[0].semantic),partId=ir.parts[0].id;
  session.apply(session.token(),[{type:'set_semantic',partId,tag:'TAIL',side:'left'}]);
  const edited=session.inspect();
  assert.equal(edited.changes[0].field,'semantic.override');
  assert.deepEqual(edited.ir.parts[0].semantic,{...original,override:{tag:'TAIL',side:'left'}});
  const record=checkpoint(workspaceId,edited),plan=recoveryPlan(record,ir,workspaceId);
  const restored=new DraftSession(ir,'base','restored'); restored.apply(restored.token(),plan.commands);
  assert.deepEqual(restored.inspect().ir,edited.ir);
  const before=session.inspect();
  assert.throws(()=>session.apply(session.token(),[{type:'reset_semantic',partId},{type:'set_semantic',partId,tag:'TYPO',side:'left'}]));
  assert.deepEqual(session.inspect(),before);
  session.apply(session.token(),[{type:'set_semantic',partId,tag:'TAIL',side:'left'}]);
  assert.equal(session.inspect().revision,before.revision);
  session.undo(session.token());assert.deepEqual(session.inspect().ir,ir);
  session.redo(session.token());assert.deepEqual(session.inspect().ir,edited.ir);
  session.apply(session.token(),[{type:'reset_semantic',partId}]);assert.deepEqual(session.inspect().ir,ir);
  const reset=checkpoint(workspaceId,{...session.inspect(),changes:[{partId,field:'semantic.override',before:{tag:'TAIL',side:'left'},after:null}]});
  assert.deepEqual(recoveryPlan(reset,edited.ir,workspaceId).commands,[{type:'reset_semantic',partId}]);
});
