import { DraftError, type ArtworkIR, type DraftChange, type EditCommand, type Point } from './contracts';

const reservedNames = new Set(['__proto__', 'constructor', 'prototype', 'parameter', 'parameters', 'deformer', 'keyform', 'physics']);
const fields: Record<EditCommand['type'], string[]> = {
  set_visibility: ['visible'], set_opacity: ['opacity'], set_polygon: ['points'],
  set_landmark: ['name', 'point'], remove_landmark: ['name'],
};

function point(value: unknown, partId: string, field: string): asserts value is Point {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(v => typeof v === 'number' && Number.isFinite(v))) {
    throw new DraftError('INVALID_COMMAND', '坐标必须是两个有限数值', partId, field);
  }
}

function landmarkName(value: unknown, partId: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || reservedNames.has(value.toLowerCase())) {
    throw new DraftError('INVALID_COMMAND', '关键点名称不能为空或使用保留字段', partId, 'name');
  }
}

export function indexArtwork(ir: ArtworkIR): ReadonlyMap<string, number> {
  return new Map(ir.parts.map((part, index) => [part.id, index]));
}

/** Validates the entire batch on a private candidate; caller's IR is never mutated. */
export function applyCommands(ir: ArtworkIR, input: unknown, index = indexArtwork(ir)): ArtworkIR {
  if (!Array.isArray(input) || input.length === 0) throw new DraftError('INVALID_COMMAND', 'commands 必须是非空命令数组');
  const candidate = structuredClone(ir);
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(fields, raw.type)) {
      throw new DraftError('INVALID_COMMAND', '不支持的编辑命令');
    }
    const allowed = ['type', 'partId', ...fields[raw.type as EditCommand['type']]];
    if (Object.keys(raw).some(key => !allowed.includes(key)) || typeof raw.partId !== 'string') {
      throw new DraftError('INVALID_COMMAND', '命令包含未知字段或缺少 partId');
    }
    const position = index.get(raw.partId);
    const part = position === undefined ? undefined : candidate.parts[position];
    if (!part) throw new DraftError('PART_NOT_FOUND', '目标图层不存在', raw.partId);
    switch (raw.type) {
      case 'set_visibility':
        if (typeof raw.visible !== 'boolean') throw new DraftError('INVALID_COMMAND', 'visible 必须是布尔值', part.id, 'visible');
        part.appearance = { visible: raw.visible, opacity: part.appearance?.opacity ?? 255 };
        break;
      case 'set_opacity':
        if (!Number.isInteger(raw.opacity) || raw.opacity < 0 || raw.opacity > 255) throw new DraftError('INVALID_COMMAND', 'opacity 必须是 0–255 的整数', part.id, 'opacity');
        part.appearance = { visible: part.appearance?.visible ?? true, opacity: raw.opacity };
        break;
      case 'set_polygon':
        if (!Array.isArray(raw.points) || raw.points.length < 3) throw new DraftError('INVALID_COMMAND', '轮廓至少需要三个点', part.id, 'points');
        for (const value of raw.points) point(value, part.id, 'points');
        part.geometry.polygon = structuredClone(raw.points);
        break;
      case 'set_landmark':
        landmarkName(raw.name, part.id); point(raw.point, part.id, 'point');
        part.geometry.landmarks = { ...part.geometry.landmarks, [raw.name]: [...raw.point] };
        break;
      case 'remove_landmark':
        landmarkName(raw.name, part.id);
        if (!part.geometry.landmarks || !Object.hasOwn(part.geometry.landmarks, raw.name)) {
          throw new DraftError('LANDMARK_NOT_FOUND', '目标关键点不存在', part.id, raw.name);
        }
        delete part.geometry.landmarks[raw.name];
        break;
    }
  }
  return candidate;
}

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
}

/** Reports only fields owned by artwork commands; names/assets/rig fields stay immutable. */
export function diffArtwork(base: ArtworkIR, draft: ArtworkIR, index = indexArtwork(base)): DraftChange[] {
  const changes: DraftChange[] = [];
  for (const part of draft.parts) {
    const position = index.get(part.id);
    if (position === undefined) throw new DraftError('PART_NOT_FOUND', '目标图层不存在', part.id);
    const previous = base.parts[position];
    const add = (field: string, before: unknown, after: unknown) => {
      if (!same(before, after)) changes.push({ partId: part.id, field, before: before ?? null, after: after ?? null });
    };
    add('appearance.visible', previous.appearance?.visible ?? true, part.appearance?.visible ?? true);
    add('appearance.opacity', previous.appearance?.opacity ?? 255, part.appearance?.opacity ?? 255);
    add('geometry.polygon', previous.geometry.polygon, part.geometry.polygon);
    const before = previous.geometry.landmarks || {}, after = part.geometry.landmarks || {};
    for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) add(`geometry.landmarks.${name}`, before[name], after[name]);
  }
  return changes;
}
