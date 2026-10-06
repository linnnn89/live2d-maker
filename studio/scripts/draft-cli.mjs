// Offline proposal generator: no save, build, asset access or native tooling.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const temporary = mkdtempSync(join(tmpdir(), 'studio-draft-'));
try {
  for (const name of ['contracts', 'commands', 'DraftSession']) {
    const source = readFileSync(fileURLToPath(new URL(`../src/editor/${name}.ts`, import.meta.url)), 'utf8');
    writeFileSync(join(temporary, `${name}.js`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
  }
  const { DraftSession } = createRequire(import.meta.url)(join(temporary, 'DraftSession.js'));
  const request = JSON.parse(readFileSync(0, 'utf8'));
  if (!request || request.schemaVersion !== 1 || Object.keys(request).some(key => !['schemaVersion', 'baseRevision', 'ir', 'commands'].includes(key))) throw Object.assign(new Error('请求版本或字段无效'), { code: 'INVALID_REQUEST' });
  const session = new DraftSession(request.ir, request.baseRevision, randomUUID());
  session.apply(session.inspect(), request.commands);
  process.stdout.write(JSON.stringify({ ok: true, state: session.inspect() }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code || 'INVALID_REQUEST', message: error.message, partId: error.partId, field: error.field } }) + '\n');
  process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
