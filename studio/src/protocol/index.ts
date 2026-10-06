import Ajv, { type ErrorObject } from 'ajv';
import { protocolSchema, type DraftRequest, type EditCommand, type StudioError } from './generated';
export type { ArtworkIR, Bounds, CaptureRequest, DraftRequest, DraftToken, EditCommand, ImportPreview, Part, Point, Snapshot, StudioError } from './generated';

const ajv = new Ajv({ strict: true, allErrors: true });
ajv.addSchema(protocolSchema);

export class ProtocolError extends Error {
  constructor(readonly code: string, message: string, readonly stage: string,
    readonly retryable = false, readonly partId?: string, readonly field?: string) { super(message); }
}

export function errorDetail(error: unknown, code: string, stage: string): StudioError {
  return error instanceof ProtocolError
    ? { code: error.code, message: error.message, stage: error.stage, retryable: error.retryable,
      ...(error.partId === undefined ? {} : { partId: error.partId }), ...(error.field === undefined ? {} : { field: error.field }) }
    : { code, stage, retryable: false, message: error instanceof Error ? error.message : String(error) };
}

function issue(errors: ErrorObject[] | null | undefined): ErrorObject | undefined {
  return errors?.filter(e => !['oneOf', 'anyOf', 'const', 'enum'].includes(e.keyword))
    .sort((a,b) => b.instancePath.length-a.instancePath.length)[0] ?? errors?.[0];
}

export function validateProtocol(name: keyof typeof protocolSchema.definitions, input: unknown,
  code = 'INVALID_REQUEST', stage = 'protocol'): void {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  let pointer: string = name;
  // Select a known discriminator branch from the schema so errors refer to its actual fields.
  if (name === 'EditCommand') {
    const branch = protocolSchema.definitions.EditCommand.oneOf.findIndex(item => item.properties.type.const === value.type);
    if (branch >= 0) pointer += '/oneOf/' + branch;
  } else if (name === 'DraftRequest') {
    const branch = protocolSchema.definitions.DraftRequest.oneOf.findIndex(item => 'const' in item.properties.operation
      ? item.properties.operation.const === value.operation : (item.properties.operation.enum as readonly unknown[]).includes(value.operation));
    if (branch >= 0) pointer += '/oneOf/' + branch;
  }
  const validate = ajv.getSchema(protocolSchema.$id + '#/definitions/' + pointer)!;
  if (validate(input)) return;
  const error = issue(validate.errors);
  const field = error?.keyword === 'additionalProperties' ? String(error.params.additionalProperty)
    : error?.keyword === 'required' ? String(error.params.missingProperty) : error?.instancePath.split('/').filter(Boolean).at(-1);
  throw new ProtocolError(code, `${name}：${error?.instancePath || '/'} ${error?.message || '数据无效'}`, stage,
    false, typeof value.partId === 'string' ? value.partId : undefined, field);
}

export function parseCommands(input: unknown): EditCommand[] {
  if (!Array.isArray(input) || !input.length) throw new ProtocolError('INVALID_COMMAND', 'commands 必须是非空命令数组', 'command');
  for (const command of input) validateProtocol('EditCommand', command, 'INVALID_COMMAND', 'command');
  return input as EditCommand[];
}

export function parseDraftRequest(input: unknown): DraftRequest {
  // Keep command errors distinct from envelope errors, including the offending layer/field.
  if (input && typeof input === 'object' && (input as { operation?: unknown }).operation === 'apply') parseCommands((input as { commands?: unknown }).commands);
  validateProtocol('DraftRequest', input);
  const request = input as DraftRequest;
  if ((request.operation === 'inspect' || request.operation === 'diff') && request.partIds && request.response !== 'parts') {
    throw new ProtocolError('INVALID_REQUEST', 'partIds 仅用于 response: parts', 'protocol', false, undefined, 'partIds');
  }
  return request;
}

/** Adapt old string-only backends in one place; new callers branch only on stable codes. */
export function backendError(input: unknown, status = 400, stage = 'transport'): StudioError {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (data.detail) { validateProtocol('StudioError', data.detail, 'PROTOCOL_ERROR', stage); return data.detail as StudioError; }
  const message = typeof data.error === 'string' ? data.error : '操作失败';
  if (message.includes('IR changed in another editor')) return { code: 'BASE_CONFLICT', stage, message, retryable: false };
  if (status === 409 || message.includes('Studio workspace is busy')) return { code: 'BACKEND_BUSY', stage, message, retryable: true };
  return { code: 'BACKEND_FAILED', stage, message, retryable: false };
}

export function errorStatus(code: string): number {
  if (['BASE_CONFLICT','BACKEND_BUSY','DRAFT_CONFLICT','SETTINGS_CONFLICT','PROJECT_CONFLICT'].includes(code)) return 409;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  if (code === 'REQUEST_SIZE') return 413;
  if (['CLI_START_FAILED','CLI_PROTOCOL_ERROR'].includes(code)) return 502;
  return 400;
}
