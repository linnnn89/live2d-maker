// Offline proposal generator: no save, build, asset access or native tooling.
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const temporary = mkdtempSync(join(tmpdir(), 'studio-draft-'));
try {
  writeFileSync(join(temporary, 'package.json'), '{"type":"commonjs"}');
  const require = createRequire(import.meta.url);
  for (const name of ['editor/contracts', 'editor/commands', 'editor/DraftSession', 'protocol/index', 'protocol/generated']) {
    mkdirSync(join(temporary, name.split('/')[0]), { recursive: true });
    const source = readFileSync(fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
      .replaceAll('require("ajv")', `require(${JSON.stringify(require.resolve('ajv'))})`);
    writeFileSync(join(temporary, `${name}.js`), code);
  }
  const { DraftSession } = require(join(temporary, 'editor/DraftSession.js'));
  const { validateProtocol, parseCommands } = require(join(temporary, 'protocol/index.js'));
  const request = JSON.parse(readFileSync(0, 'utf8'));
  parseCommands(request?.commands);
  validateProtocol('OfflineRequest', request);
  const session = new DraftSession(request.ir, request.baseRevision, randomUUID());
  session.apply(session.inspect(), request.commands);
  process.stdout.write(JSON.stringify({ ok: true, state: session.inspect() }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code || 'INVALID_REQUEST', message: error.message,
    stage: error.stage || 'protocol', retryable: error.retryable || false, partId: error.partId, field: error.field } }) + '\n');
  process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
