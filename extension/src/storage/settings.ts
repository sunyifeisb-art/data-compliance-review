import type { ExtensionSettings } from '../shared/types';

export function normalizeSettings(
  raw: Partial<ExtensionSettings> | null | undefined
): ExtensionSettings {
  return {
    aiEnabled: raw?.aiEnabled !== false,
    deepseekApiKey: raw?.deepseekApiKey?.trim() || 'sk-9695b956c56f4d05a583be745076cd4c',
    deepseekBaseUrl: raw?.deepseekBaseUrl?.trim() || 'https://api.deepseek.com',
    deepseekModel: raw?.deepseekModel?.trim() || 'deepseek-chat'
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  if (!globalThis.chrome?.storage?.local) {
    return normalizeSettings({});
  }
  const raw = await chrome.storage.local.get('settings');
  return normalizeSettings(raw.settings);
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const normalized = normalizeSettings(settings);
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ settings: normalized });
  }
  return normalized;
}
