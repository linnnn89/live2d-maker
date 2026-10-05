import { defineConfig, type Plugin } from 'vite';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(repo, process.env.STUDIO_WORKSPACE || 'out/studio');
const python = path.join(repo, 'python/Scripts/python.exe');
const port = 5173;
const allowed = new Set(['studio-open', 'studio-snapshot', 'studio-save', 'studio-rebuild', 'studio-qa', 'studio-import-preview', 'studio-import-commit']);

function run(command: string, payload?: string): Promise<unknown> {
  if (!allowed.has(command)) throw new Error('Unsupported Studio command');
  const args = ['-m', 'tools.authoring_rig', command, '--workspace', workspace];
  if (command === 'studio-open') {
    for (const [key, option] of [['STUDIO_IR', '--ir'], ['STUDIO_PSD', '--psd'], ['STUDIO_OVERLAY', '--overlay'], ['STUDIO_OVERLAY_BASELINE', '--overlay-baseline']]) {
      if (process.env[key]) args.push(option, path.resolve(repo, process.env[key]!));
    }
  }
  if (command === 'studio-qa') args.push('--port', String(port));
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd: repo, shell: false, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.on('error', reject);
    child.on('close', code => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0) reject(new Error(result.error || stderr || 'CLI failed'));
        else resolve(result);
      } catch (error) { reject(new Error(`CLI returned invalid JSON: ${stderr || String(error)}`)); }
    });
    child.stdin.end(payload || '');
  });
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage, limit = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error(`Request exceeds ${limit / 1024 / 1024} MB`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function serveFile(res: ServerResponse, root: string, relative: string) {
  const base = await realpath(root);
  const file = await realpath(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep)) throw new Error('File outside allowed directory');
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = { '.png': 'image/png', '.json': 'application/json', '.moc3': 'application/octet-stream', '.js': 'text/javascript', '.vert': 'text/plain', '.frag': 'text/plain' };
  if (!types[extension] || !(await stat(file)).isFile()) throw new Error('File type is not served');
  res.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function studioBridge(): Plugin {
  let busy = false;
  return {
    name: 'local-studio-cli',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
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
        const routes: Record<string, string> = { '/api/open': 'studio-open', '/api/snapshot': 'studio-snapshot', '/api/save': 'studio-save', '/api/rebuild': 'studio-rebuild', '/api/qa': 'studio-qa', '/api/import-preview': 'studio-import-preview', '/api/import-commit': 'studio-import-commit' };
        const command = routes[pathname];
        if (!command || req.method !== (command === 'studio-snapshot' ? 'GET' : 'POST')) { json(res, 405, { error: 'Unsupported route or method' }); return; }
        // Reject cross-origin writes and DNS rebinding; no browser input becomes a shell command/path.
        const origin = `http://127.0.0.1:${port}`;
        if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
          json(res, 403, { error: 'Studio accepts same-origin loopback requests only' }); return;
        }
        if (busy) { json(res, 409, { error: 'Studio is busy; wait for the active command' }); return; }
        busy = true;
        try {
          const input = ['studio-save', 'studio-import-preview', 'studio-import-commit'].includes(command)
            ? await body(req, command === 'studio-import-preview' ? 48 * 1024 * 1024 : undefined) : undefined;
          json(res, 200, await run(command, input));
        }
        catch (error) { json(res, 400, { status: 'error', error: error instanceof Error ? error.message : String(error) }); }
        finally { busy = false; }
      });
    },
  };
}

export default defineConfig({ plugins: [studioBridge()], server: { host: '127.0.0.1', port, strictPort: true, fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url))] } } });
