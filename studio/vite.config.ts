import {defineConfig,type Plugin} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {type BridgeConfig} from './bridge/runner';
import {createProjectTransport} from './bridge/projects';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config:BridgeConfig={repo,workspace:path.resolve(repo,process.env.STUDIO_WORKSPACE||'out/studio'),
  python:path.join(repo,'python/Scripts/python.exe'),port:5173,env:process.env};
function studioBridge():Plugin{
  return {name:'local-studio-cli',configureServer(server){server.middlewares.use(createProjectTransport(config));}};
}
export default defineConfig({plugins:[studioBridge()],server:{host:'127.0.0.1',port:config.port,strictPort:true,
  fs:{strict:true,allow:[fileURLToPath(new URL('.',import.meta.url))]}}});
