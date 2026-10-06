import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import type {ServerResponse} from 'node:http';
export async function serveFile(res: ServerResponse, root: string, relative: string) {
  const base = await realpath(root);
  const file = await realpath(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep)) throw new Error('File outside allowed directory');
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = { '.png': 'image/png', '.json': 'application/json', '.moc3': 'application/octet-stream', '.js': 'text/javascript', '.vert': 'text/plain', '.frag': 'text/plain' };
  if (/^downloads\/[a-f0-9]{32}\.studio-project\.zip$/.test(relative)) types['.zip'] = 'application/zip';
  if (!types[extension] || !(await stat(file)).isFile()) throw new Error('File type is not served');
  res.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

