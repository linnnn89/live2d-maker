import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtempSync,rmSync,symlinkSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const studio=fileURLToPath(new URL('..',import.meta.url)),repo=path.dirname(studio);
const output=mkdtempSync(path.join(tmpdir(),'studio-bridge-test-'));
symlinkSync(path.join(studio,'node_modules'),path.join(output,'node_modules'),'junction');
after(()=>rmSync(output,{recursive:true,force:true}));
const compile=spawnSync(process.execPath,[path.join(studio,'node_modules/typescript/bin/tsc'),'--target','ES2022',
  '--module','commonjs','--esModuleInterop','--strict','--skipLibCheck','--outDir',output,'bridge/runner.ts','bridge/transport.ts','bridge/projects.ts'],{cwd:studio,encoding:'utf8'});
assert.equal(compile.status,0,compile.stdout+compile.stderr);
const require=createRequire(import.meta.url),{createRunner}=require(path.join(output,'bridge/runner.js'));
const {createTransport}=require(path.join(output,'bridge/transport.js'));
const {createProjectTransport}=require(path.join(output,'bridge/projects.js'));
const snapshot={schemaVersion:1,workspaceId:'0'.repeat(32),status:'ok',revision:'base',ir:{canvas:{width:2,height:2},parts:[]},
  stale:{},overlay:{status:'not-loaded',reasons:[]},sourceImage:'/studio-files/source.png',sourceBounds:null,artworkBounds:null,build:null,qa:null};
const config=()=>({repo,workspace:path.join(output,'workspace'),python:path.join(repo,'python/Scripts/python.exe'),port:0,env:{}});
async function serverFor(config,runner){
  let handle;const server=createServer((req,res)=>void handle(req,res,()=>{res.writeHead(404);res.end();}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.port=server.address().port;
  handle=createTransport(config,runner);
  return {url:`http://127.0.0.1:${config.port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('transport validates methods, origin, body and protocol before running, and releases the exclusive gate on failure',async()=>{
  const c=config(),calls=[];let release;
  const service=await serverFor(c,(command,payload)=>{calls.push([command,payload]);return command==='studio-open'
    ?new Promise(resolve=>release=resolve):Promise.resolve(snapshot);});
  const error=async(route,options,code)=>{const response=await fetch(service.url+route,options);assert.equal((await response.json()).detail.code,code);};
  try{
    const open=fetch(service.url+'/api/open',{method:'POST'});while(!release)await new Promise(resolve=>setImmediate(resolve));
    await error('/api/snapshot',{},'BACKEND_BUSY');release(snapshot);assert.equal((await (await open).json()).revision,'base');
    await error('/api/save',{method:'GET'},'METHOD_NOT_ALLOWED');
    await error('/api/save',{method:'POST',headers:{Origin:'https://elsewhere.invalid'},body:'{}'},'FORBIDDEN');
    await error('/api/save',{method:'POST',body:'invalid'},'INVALID_REQUEST');
    await error('/api/save',{method:'POST',body:JSON.stringify({revision:'base',ir:snapshot.ir,extra:true})},'INVALID_REQUEST');
    await error('/api/save',{method:'POST',body:' '.repeat(2*1024*1024+1)},'REQUEST_SIZE');
    assert.equal(calls.length,1);
    const response=await fetch(service.url+'/api/save',{method:'POST',body:JSON.stringify({revision:'base',ir:snapshot.ir})});
    assert.equal(response.status,200);assert.equal(calls[1][0],'studio-save');assert.equal(JSON.parse(calls[1][1]).revision,'base');
    assert.equal((await fetch(service.url+'/api/snapshot')).status,200);
  }finally{await service.close();}
  const failed=await serverFor(config(),async()=>{throw new Error('fixture failed');});
  try{for(let i=0;i<2;i++){const response=await fetch(failed.url+'/api/open',{method:'POST'});assert.equal((await response.json()).detail.code,'BACKEND_FAILED');}}
  finally{await failed.close();}
});

test('resource provider serves real artifacts and HEAD while rejecting traversal, junction escape and unserved file types',async()=>{
  const c=config();mkdirSync(c.workspace);mkdirSync(path.join(output,'outside'));
  writeFileSync(path.join(c.workspace,'ok.json'),'{}');writeFileSync(path.join(c.workspace,'private.txt'),'private');
  writeFileSync(path.join(output,'outside','secret.json'),'secret');
  symlinkSync(path.join(output,'outside'),path.join(c.workspace,'escape'),'junction');
  const service=await serverFor(c,async()=>snapshot);
  try{
    assert.equal(await (await fetch(service.url+'/studio-files/ok.json')).text(),'{}');
    const head=await fetch(service.url+'/studio-files/ok.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    for(const file of ['private.txt','escape/secret.json','%2e%2e%2foutside%2fsecret.json','%ZZ'])assert.equal((await fetch(service.url+'/studio-files/'+file)).status,404,file);
    assert.equal((await fetch(service.url+'/studio-files/ok.json',{method:'POST'})).status,405);
  }finally{await service.close();}
});

test('runner constructs shell-free Windows arguments and checks CLI results, with a real project Python snapshot when available',async()=>{
  const c=config();c.env={STUDIO_IR:'fixture.json'};let child,args,options;
  const launch=(program,a,o)=>{assert.equal(program,c.python);args=a;options=o;child=new EventEmitter();
    child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();return child;};
  const runner=createRunner(c,launch);
  const opening=runner('studio-open');assert.ok(args.includes(path.join(repo,'fixture.json')));assert.equal(options.shell,false);
  assert.equal(options.windowsHide,true);assert.equal(options.env.PYTHONIOENCODING,'utf-8');
  child.stdout.write(JSON.stringify(snapshot));child.emit('close',0);assert.deepEqual(await opening,snapshot);
  assert.throws(()=>runner('arbitrary-command'));
  const failure=runner('studio-save','{}');child.stdout.write(JSON.stringify({error:'conflict',detail:{code:'BASE_CONFLICT',message:'conflict',stage:'save',retryable:false}}));
  child.emit('close',1);await assert.rejects(failure,{code:'BASE_CONFLICT'});
  const malformed=runner('studio-snapshot');child.stdout.write('{}');child.emit('close',0);await assert.rejects(malformed,{code:'CLI_PROTOCOL_ERROR'});
  const cannotStart=runner('studio-snapshot');child.emit('error',new Error('fixture launch'));await assert.rejects(cannotStart,{code:'CLI_START_FAILED'});
  const workspace=path.join(repo,'out/studio-e4-verified');
  if(existsSync(c.python)&&existsSync(path.join(workspace,'studio-state.json'))){const real=await createRunner({...c,workspace})('studio-snapshot');assert.equal(real.status,'ok');assert.equal(real.workspaceId.length,32);}
});

test('build settings transport validates the versioned preference contract and preserves conflict identity',async()=>{
  const {ProtocolError}=require(path.join(output,'src/protocol/index.js'));
  const calls=[];let conflict=false;
  const service=await serverFor(config(),async(command,payload)=>{
    calls.push([command,JSON.parse(payload)]);
    if(conflict)throw new ProtocolError('SETTINGS_CONFLICT','settings changed','build-settings');
    return snapshot;
  });
  const payload={schemaVersion:1,revision:'base',settingsRevision:'1'.repeat(64),settings:{schemaVersion:1,atlasSize:1024,meshInteriorDensity:12,headTurnStrength:0}};
  try{
    for(const invalid of [{...payload,settingsRevision:'bad'},{...payload,settings:{...payload.settings,headTurnStrength:3}},{...payload,settings:{...payload.settings,unknown:true}}]){
      const response=await fetch(service.url+'/api/build-settings',{method:'POST',body:JSON.stringify(invalid)});
      assert.equal(response.status,400);assert.equal((await response.json()).detail.code,'INVALID_REQUEST');
    }
    assert.equal(calls.length,0);
    const response=await fetch(service.url+'/api/build-settings',{method:'POST',body:JSON.stringify(payload)});
    assert.equal(response.status,200);assert.deepEqual(calls,[['studio-build-settings',payload]]);
    conflict=true;
    const denied=await fetch(service.url+'/api/build-settings',{method:'POST',body:JSON.stringify(payload)});
    assert.equal(denied.status,409);assert.equal((await denied.json()).detail.code,'SETTINGS_CONFLICT');
  }finally{await service.close();}
});

test('project transport pins independent page roots and resources and rejects unregistered or redirected projects',async()=>{
  const localRepo=path.join(output,'catalog-repo'), catalog=path.join(localRepo,'out/studio-projects');
  const ids=['a'.repeat(32),'b'.repeat(32)];
  for(const id of ids){const root=path.join(catalog,id);mkdirSync(root,{recursive:true});writeFileSync(path.join(root,'studio-state.json'),JSON.stringify({projectId:id}));writeFileSync(path.join(root,'source.json'),JSON.stringify({id}));}
  let handle;const server=createServer((req,res)=>void handle(req,res,()=>{res.writeHead(404);res.end();}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const c={...config(),repo:localRepo,port:server.address().port};const calls=[];
  handle=createProjectTransport(c,configuration=>async(command,payload)=>{calls.push({workspace:configuration.workspace,command,payload});return command==='studio-catalog'?{schemaVersion:1,projects:[]}:snapshot;});
  const url=`http://127.0.0.1:${c.port}`;
  try{
    const catalogResponse=await fetch(url+'/api/catalog',{method:'POST',body:JSON.stringify({schemaVersion:1,operation:'list'})});assert.equal(catalogResponse.status,200);
    assert.equal(calls[0].workspace,catalog);
    for(const id of [...ids,ids[0]]){
      const response=await fetch(url+`/projects/${id}/api/open`,{method:'POST'});assert.equal(response.status,200);assert.equal(calls.at(-1).workspace,path.join(catalog,id));
      assert.deepEqual(await (await fetch(url+`/projects/${id}/studio-files/source.json`)).json(),{id});
    }
    assert.equal((await fetch(url+'/projects/'+('c'.repeat(32))+'/api/open',{method:'POST'})).status,404);
    const external=path.join(output,'external-project');mkdirSync(external);writeFileSync(path.join(external,'studio-state.json'),JSON.stringify({projectId:'d'.repeat(32)}));symlinkSync(external,path.join(catalog,'d'.repeat(32)),'junction');
    assert.equal((await fetch(url+'/projects/'+('d'.repeat(32))+'/api/open',{method:'POST'})).status,404);
    const rejected=await fetch(url+`/projects/${ids[0]}/api/project-restore`,{method:'POST',body:JSON.stringify({schemaVersion:1,revision:'r',settingsRevision:'0'.repeat(64),head:ids[0],id:'../other'})});assert.equal(rejected.status,400);
    const denied=await fetch(url+`/projects/${ids[0]}/api/open`,{method:'POST',headers:{Origin:'https://example.test'}});assert.equal(denied.status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('model export transport validates selection and input identities and releases the operation gate after native failure',async()=>{
  const {ProtocolError}=require(path.join(output,'src/protocol/index.js'));const calls=[];let fail=false;
  const service=await serverFor(config(),async(command,input)=>{
    if(command==='studio-snapshot')return snapshot;
    calls.push([command,JSON.parse(input)]);
    if(fail)throw new ProtocolError('EXPORT_FAILED','Overlay incompatible; previous delivery retained','export');
    return {schemaVersion:1,target:'playable',url:'/studio-files/downloads/'+('a'.repeat(32))+'.model.zip',filename:'test.model.zip',
      files:[{name:'artwork.moc3',bytes:1,sha256:'1'.repeat(64)}],warnings:['native warning'],cacheId:'a'.repeat(32),reused:false,
      buildSettings:{schemaVersion:1,atlasSize:2048,meshInteriorDensity:40,headTurnStrength:1},physics:false,motions:0,
      modelSha256:'2'.repeat(64),modelInputSignature:'3'.repeat(64),overlayRevision:'4'.repeat(64)};
  });
  const request={schemaVersion:1,revision:'base',settingsRevision:'1'.repeat(64),overlayRevision:'4'.repeat(64),target:'playable',exportMotions:false,generatePhysics:false};
  try{
    for(const invalid of [{...request,target:'unknown'},{...request,generatePhysics:'false'},{...request,overlayRevision:'old'},{...request,unexpected:1}]){
      const response=await fetch(service.url+'/api/model-export',{method:'POST',body:JSON.stringify(invalid)});assert.equal(response.status,400);assert.equal((await response.json()).detail.code,'INVALID_REQUEST');
    }
    assert.equal(calls.length,0);
    const response=await fetch(service.url+'/api/model-export',{method:'POST',body:JSON.stringify(request)});assert.equal(response.status,200);assert.equal((await response.json()).files[0].name,'artwork.moc3');assert.deepEqual(calls,[['studio-model-export',request]]);
    fail=true;const denied=await fetch(service.url+'/api/model-export',{method:'POST',body:JSON.stringify(request)});assert.equal(denied.status,400);assert.equal((await denied.json()).detail.code,'EXPORT_FAILED');
    assert.equal((await fetch(service.url+'/api/snapshot')).status,200);
  }finally{await service.close();}
});
