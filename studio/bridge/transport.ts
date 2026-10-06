import type {IncomingMessage,ServerResponse} from 'node:http';
import path from 'node:path';
import {ProtocolError,errorDetail,errorStatus,validateProtocol} from '../src/protocol';
import {serveFile} from './resources';
import type {BridgeConfig,StudioRunner} from './runner';
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function sendError(res: ServerResponse, error: unknown, stage: string) {
  const detail = errorDetail(error, 'BACKEND_FAILED', stage);
  json(res, errorStatus(detail.code), { schemaVersion: 1, status: 'error', error: detail.message, detail });
}

async function body(req: IncomingMessage, limit = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ProtocolError('REQUEST_SIZE', `Request exceeds ${limit / 1024 / 1024} MB`, 'transport');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** One exclusive CLI gate per workspace bridge; injected runners keep HTTP contracts testable. */
export function createTransport(config:BridgeConfig,runner:StudioRunner){
  const {repo,workspace,port}=config;
  let busy=false;
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
        const pathname = new URL(req.url || '/', `http://127.0.0.1:${port}`).pathname;
        if (pathname === '/live2d-viewer/index.html') {
          const { readFile } = await import('node:fs/promises');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(await readFile(path.join(repo, 'live2d-viewer/index.html')));
          return;
        }
        if (pathname.startsWith('/studio-files/') || pathname.startsWith('/public/vendor/cubism/')) {
          if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Read only' }); return; }
          try {
            const prefix = pathname.startsWith('/studio-files/') ? '/studio-files/' : '/public/vendor/cubism/';
            await serveFile(res, prefix === '/studio-files/' ? workspace : path.join(repo, 'live2d-viewer/public/vendor/cubism'), decodeURIComponent(pathname.slice(prefix.length)));
          } catch { json(res, 404, { error: 'Artifact not found' }); }
          return;
        }
        if (!pathname.startsWith('/api/')) { next(); return; }
        const routes: Record<string, string> = { '/api/open': 'studio-open', '/api/snapshot': 'studio-snapshot', '/api/save': 'studio-save', '/api/rebuild': 'studio-rebuild', '/api/qa': 'studio-qa', '/api/import-preview': 'studio-import-preview', '/api/import-commit': 'studio-import-commit', '/api/build-settings': 'studio-build-settings', '/api/catalog': 'studio-catalog', '/api/project-save':'studio-project-save', '/api/project-restore':'studio-project-restore', '/api/project-revisions':'studio-project-revisions', '/api/project-archive':'studio-project-archive', '/api/poses':'studio-poses', '/api/rig-edit':'studio-rig-edit', '/api/model-export':'studio-model-export' };
        const command = routes[pathname];
        if (!command || req.method !== (command === 'studio-snapshot' ? 'GET' : 'POST')) { sendError(res, new ProtocolError('METHOD_NOT_ALLOWED', 'Unsupported route or method', 'transport'), 'transport'); return; }
        // Reject cross-origin writes and DNS rebinding; no browser input becomes a shell command/path.
        const origin = `http://127.0.0.1:${port}`;
        if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
          sendError(res, new ProtocolError('FORBIDDEN', 'Studio accepts same-origin loopback requests only', 'transport'), 'transport'); return;
        }
        if (busy) { sendError(res, new ProtocolError('BACKEND_BUSY', 'Studio is busy; wait for the active command', 'transport', true), 'transport'); return; }
        busy = true;
        try {
          const input = ['studio-save', 'studio-import-preview', 'studio-import-commit', 'studio-build-settings','studio-catalog','studio-project-save','studio-project-restore','studio-model-export','studio-poses','studio-rig-edit'].includes(command)
            ? await body(req, command === 'studio-catalog' ? 172 * 1024 * 1024 : command === 'studio-import-preview' ? 48 * 1024 * 1024 : undefined) : undefined;
          if (input !== undefined) {
            let value: unknown;
            try { value = JSON.parse(input); } catch { throw new ProtocolError('INVALID_REQUEST', 'Request must be valid JSON', 'protocol'); }
            validateProtocol(command === 'studio-save' ? 'SaveRequest' : command === 'studio-import-preview' ? 'ImportPreviewRequest' : command === 'studio-build-settings' ? 'BuildSettingsRequest' : command === 'studio-catalog' ? 'ProjectCatalogRequest' : command === 'studio-project-save' ? 'ProjectSaveRequest' : command === 'studio-project-restore' ? 'ProjectRestoreRequest' : command === 'studio-poses' ? 'PoseRequest' : command === 'studio-rig-edit' ? 'RigEditRequest' : command === 'studio-model-export' ? 'ModelExportRequest' : 'ImportCommitRequest', value);
          }
          json(res, 200, await runner(command, input));
        }
        catch (error) { sendError(res, error, command); }
        finally { busy = false; }
  };
}
