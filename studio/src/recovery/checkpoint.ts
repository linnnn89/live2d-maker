import type { DraftState, DraftChange } from '../editor/contracts';
import type { ArtworkIR, EditCommand } from '../protocol';
import type { DraftCheckpoint } from '../protocol/generated';
import { ProtocolError, parseCommands, validateProtocol } from '../protocol';
import { same } from '../editor/commands';
export type { DraftCheckpoint } from '../protocol/generated';
export const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;

export function checkpoint(workspaceId: string, state: DraftState): DraftCheckpoint {
  const value: DraftCheckpoint = { schemaVersion: 1, workspaceId, draftId: state.draftId,
    baseRevision: state.baseRevision, revision: state.revision, updatedAt: Date.now(), changes: structuredClone(state.changes) };
  validateCheckpoint(value); return value;
}

export function validateCheckpoint(value: unknown): asserts value is DraftCheckpoint {
  validateProtocol('DraftCheckpoint', value, 'RECOVERY_FORMAT', 'recovery');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CHECKPOINT_BYTES) {
    throw new ProtocolError('RECOVERY_SIZE', '草稿备份超过 8 MiB，请先导出或保存当前编辑', 'recovery');
  }
}

export function recoveryPlan(value: unknown, ir: ArtworkIR, workspaceId: string): {
  commands: EditCommand[]; conflicts: DraftChange[]; alreadyApplied: number;
} {
  validateCheckpoint(value);
  if (value.workspaceId !== workspaceId) throw new ProtocolError('RECOVERY_WORKSPACE', '草稿属于其他工作区', 'recovery');
  const parts = new Map(ir.parts.map(part => [part.id, part]));
  const commands: EditCommand[] = [], conflicts: DraftChange[] = [], seen = new Set<string>();
  let alreadyApplied = 0;
  for (const change of value.changes) {
    const key = JSON.stringify([change.partId, change.field]);
    if (seen.has(key)) throw new ProtocolError('RECOVERY_FORMAT', '草稿包含重复字段', 'recovery');
    seen.add(key);
    const part = parts.get(change.partId);
    let command: EditCommand, current: unknown;
    if (change.field === 'appearance.visible') {
      command = { type: 'set_visibility', partId: change.partId, visible: change.after as boolean };
      current = part?.appearance?.visible ?? true;
    } else if (change.field === 'appearance.opacity') {
      command = { type: 'set_opacity', partId: change.partId, opacity: change.after as number };
      current = part?.appearance?.opacity ?? 255;
    } else if (change.field === 'geometry.polygon') {
      command = { type: 'set_polygon', partId: change.partId, points: change.after as [number,number][] };
      current = part?.geometry.polygon ?? null;
    } else if (change.field.startsWith('geometry.landmarks.')) {
      const name = change.field.slice('geometry.landmarks.'.length);
      command = change.after === null ? { type:'remove_landmark',partId:change.partId,name }
        : { type:'set_landmark',partId:change.partId,name,point:change.after as [number,number] };
      current = part?.geometry.landmarks?.[name] ?? null;
    } else throw new ProtocolError('RECOVERY_FORMAT', '草稿包含不支持的编辑字段', 'recovery', false, change.partId, change.field);
    parseCommands([command]);
    if (!part) conflicts.push(change);
    else if (same(current,change.after)) alreadyApplied++;
    else if (same(current,change.before)) commands.push(command);
    else conflicts.push(change);
  }
  return { commands, conflicts, alreadyApplied };
}
