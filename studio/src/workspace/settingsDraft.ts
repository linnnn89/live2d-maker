import type { BuildSettings, BuildSettingsState } from '../protocol/generated';

export type SettingsDraft = {
  workspaceId: string;
  base: BuildSettingsState;
  settings: BuildSettings;
};

export function createSettingsDraft(workspaceId: string, base: BuildSettingsState): SettingsDraft {
  return { workspaceId, base: structuredClone(base), settings: structuredClone(base.settings) };
}

export function settingsChanged(draft: SettingsDraft): boolean {
  const before = draft.base.settings, after = draft.settings;
  return before.atlasSize !== after.atlasSize
    || before.meshInteriorDensity !== after.meshInteriorDensity
    || before.headTurnStrength !== after.headTurnStrength;
}

/** Server refreshes update clean forms; dirty forms retain their original CAS baseline. */
export function receiveSettings(draft: SettingsDraft | null, workspaceId: string,
  current: BuildSettingsState): SettingsDraft {
  if (!draft || draft.workspaceId !== workspaceId) return createSettingsDraft(workspaceId, current);
  if (draft.base.revision === current.revision || settingsChanged(draft)) return draft;
  return createSettingsDraft(workspaceId, current);
}
