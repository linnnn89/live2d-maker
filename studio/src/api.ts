import { backendError, ProtocolError, validateProtocol, type StudioError } from './protocol';

export class ApiError extends ProtocolError {
  constructor(detail: StudioError, readonly status: number) { super(detail.code, detail.message, detail.stage, detail.retryable, detail.partId, detail.field); }
}

export async function api<T>(route: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const project = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('project');
  const prefix = route !== 'catalog' && project && /^[a-f0-9]{32}$/.test(project) ? '/projects/'+project : '';
  const response = await fetch(prefix+'/api/' + route, {
    method: route === 'snapshot' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
    signal,
  });
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ProtocolError('PROTOCOL_ERROR', '服务端返回无效 JSON', 'transport'); }
  if (!response.ok) throw new ApiError(backendError(data, response.status, route), response.status);
  const responseType = route === 'catalog' ? ((payload as {operation:string}).operation === 'list' ? 'ProjectCatalog' : 'ProjectCreateResult')
    : route === 'import-preview' ? 'ImportPreview'
    : ['project-save','project-revisions'].includes(route) ? 'ProjectRevisions'
    : route === 'project-archive' ? 'ProjectDownload' : route === 'model-export' ? 'ModelExportResult' : 'Snapshot';
  validateProtocol(responseType, data, 'PROTOCOL_ERROR', route);
  return data as T;
}
