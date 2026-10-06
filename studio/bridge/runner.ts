import {spawn} from 'node:child_process';
import path from 'node:path';
import {ProtocolError,backendError,validateProtocol} from '../src/protocol';
export type BridgeConfig={repo:string;workspace:string;python:string;port:number;env:NodeJS.ProcessEnv};
export type StudioRunner=(command:string,payload?:string)=>Promise<unknown>;
const allowed=new Set(['studio-open','studio-snapshot','studio-save','studio-rebuild','studio-qa','studio-import-preview','studio-import-commit']);
export function createRunner(config:BridgeConfig,launch:typeof spawn=spawn):StudioRunner {
 const {repo,workspace,python,port,env}=config;
 return function run(command: string, payload?: string): Promise<unknown> {
  if (!allowed.has(command)) throw new Error('Unsupported Studio command');
  const args = ['-m', 'tools.authoring_rig', command, '--workspace', workspace];
  if (command === 'studio-open') {
    for (const [key, option] of [['STUDIO_IR', '--ir'], ['STUDIO_PSD', '--psd'], ['STUDIO_OVERLAY', '--overlay'], ['STUDIO_OVERLAY_BASELINE', '--overlay-baseline']]) {
      if (env[key]) args.push(option, path.resolve(repo, env[key]!));
    }
  }
  if (command === 'studio-qa') args.push('--port', String(port));
  return new Promise((resolve, reject) => {
    const child = launch(python, args, { cwd: repo, shell: false, windowsHide: true, env: { ...env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.on('error', error => reject(new ProtocolError('CLI_START_FAILED', error.message, command)));
    child.on('close', code => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0) {
          const detail = backendError(result, 400, command);
          reject(new ProtocolError(detail.code, detail.message, detail.stage, detail.retryable, detail.partId, detail.field));
        } else {
          validateProtocol(command === 'studio-import-preview' ? 'ImportPreview' : 'Snapshot', result, 'CLI_PROTOCOL_ERROR', command);
          resolve(result);
        }
      } catch (error) { reject(error instanceof ProtocolError ? error : new ProtocolError('CLI_PROTOCOL_ERROR', `CLI returned invalid JSON: ${stderr || String(error)}`, command)); }
    });
    child.stdin.end(payload || '');
  });
}

}
