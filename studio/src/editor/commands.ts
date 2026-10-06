import { DraftError, type ArtworkIR, type DraftChange, type EditCommand, type Part, type Point } from './contracts';
import { parseCommands } from '../protocol';

const reservedNames = new Set(['__proto__', 'constructor', 'prototype', 'parameter', 'parameters', 'deformer', 'keyform', 'physics']);

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
  // Standalone callers may mutate the result; only the session uses structural sharing.
  return structuredClone(applyCommandBatch(ir, input, index).ir);
}

export type LayerPatch = { index: number; before: Part; after: Part };

/** Internal immutable batch: copy only targeted parts and edited fields. */
export function applyCommandBatch(ir: ArtworkIR, input: unknown, index = indexArtwork(ir)): { ir: ArtworkIR; patches: LayerPatch[] } {
  const commands = parseCommands(input);
  const candidate = { ...ir, parts: [...ir.parts] };
  const touched = new Set<number>();
  for (const raw of commands) {
    const position = index.get(raw.partId);
    if (position === undefined || candidate.parts[position]?.id !== raw.partId) throw new DraftError('PART_NOT_FOUND', '目标图层不存在', raw.partId);
    if (!touched.has(position)) { candidate.parts[position] = { ...candidate.parts[position] }; touched.add(position); }
    const part = candidate.parts[position];
    switch (raw.type) {
      case 'set_visibility':
        part.appearance = { visible: raw.visible, opacity: part.appearance?.opacity ?? 255 };
        break;
      case 'set_opacity':
        part.appearance = { visible: part.appearance?.visible ?? true, opacity: raw.opacity };
        break;
      case 'set_polygon':
        part.geometry = { ...part.geometry, polygon: structuredClone(raw.points) };
        break;
      case 'set_landmark':
        landmarkName(raw.name, part.id);
        part.geometry = { ...part.geometry, landmarks: { ...part.geometry.landmarks, [raw.name]: [...raw.point] } };
        break;
      case 'remove_landmark':
        landmarkName(raw.name, part.id);
        if (!part.geometry.landmarks || !Object.hasOwn(part.geometry.landmarks, raw.name)) {
          throw new DraftError('LANDMARK_NOT_FOUND', '目标关键点不存在', part.id, raw.name);
        }
        part.geometry = { ...part.geometry, landmarks: { ...part.geometry.landmarks } };
        delete part.geometry.landmarks![raw.name];
        break;
    }
  }
  for (const position of touched) {
    if (sameArtworkPart(ir.parts[position], candidate.parts[position])) candidate.parts[position] = ir.parts[position];
  }
  const patches = [...touched].sort((a, b) => a - b)
    .filter(position => ir.parts[position] !== candidate.parts[position])
    .map(position => ({ index: position, before: ir.parts[position], after: candidate.parts[position] }));
  return { ir: patches.length ? candidate : ir, patches };
}

export function sameArtworkPart(left: Part, right: Part): boolean {
  return (left.appearance?.visible ?? true) === (right.appearance?.visible ?? true)
    && (left.appearance?.opacity ?? 255) === (right.appearance?.opacity ?? 255)
    && same(left.geometry.polygon, right.geometry.polygon)
    && same(left.geometry.landmarks ?? {}, right.geometry.landmarks ?? {});
}

export function replayPatches(ir: ArtworkIR, patches: LayerPatch[], direction: 'before' | 'after'): ArtworkIR {
  const parts = [...ir.parts];
  for (const patch of patches) parts[patch.index] = patch[direction];
  return { ...ir, parts };
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
