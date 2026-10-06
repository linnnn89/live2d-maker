import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRunner, type BridgeConfig, type StudioRunner } from './runner';
import { createTransport } from './transport';

/** Each project keeps its own CLI/resource root. Switching one page never redirects another. */
export function createProjectTransport(config: BridgeConfig, runnerFactory:(config:BridgeConfig)=>StudioRunner=createRunner) {
  const catalog = path.join(config.repo, 'out', 'studio-projects');
  const legacy = createTransport(config, runnerFactory(config));
  const catalogConfig = {...config, workspace:catalog};
  const catalogTransport = createTransport(catalogConfig, runnerFactory(catalogConfig));
  const transports = new Map<string, ReturnType<typeof createTransport>>();
  return async (req: IncomingMessage, res: ServerResponse, next:()=>void) => {
    const pathname = new URL(req.url || '/', `http://127.0.0.1:${config.port}`).pathname;
    if (pathname === '/api/catalog') { await catalogTransport(req,res,next); return; }
    if (!pathname.startsWith('/projects/')) { await legacy(req,res,next); return; }
    const match = /^\/projects\/([a-f0-9]{32})(\/.*)$/.exec(pathname);
    try {
      if (!match) throw new Error('Invalid project');
      const workspace = await realpath(path.join(catalog,match[1]));
      if (path.dirname(workspace) !== await realpath(catalog)) throw new Error('Project outside catalog');
      const state = JSON.parse(await readFile(path.join(workspace,'studio-state.json'),'utf8'));
      if (state.projectId !== match[1]) throw new Error('Project identity mismatch');
      let transport = transports.get(match[1]);
      if (!transport) { const projectConfig={...config,workspace}; transport=createTransport(projectConfig,runnerFactory(projectConfig)); transports.set(match[1],transport); }
      const original = req.url;
      req.url = (req.url || '').slice('/projects/'.length + match[1].length);
      await transport(req,res,()=>{req.url=original;next();});
    } catch {
      res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Project not found'}));
    }
  };
}
