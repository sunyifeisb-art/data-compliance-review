// src/storage/settings.ts
function normalizeSettings(raw) {
  return {
    aiEnabled: raw?.aiEnabled !== false,
    deepseekApiKey: raw?.deepseekApiKey?.trim() || "sk-9695b956c56f4d05a583be745076cd4c",
    deepseekBaseUrl: raw?.deepseekBaseUrl?.trim() || "https://api.deepseek.com",
    deepseekModel: raw?.deepseekModel?.trim() || "deepseek-chat"
  };
}
async function loadSettings() {
  if (!globalThis.chrome?.storage?.local) {
    return normalizeSettings({});
  }
  const raw = await chrome.storage.local.get("settings");
  return normalizeSettings(raw.settings);
}
async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ settings: normalized });
  }
  return normalized;
}

// src/ui/options.ts
var aiEnabledInput = document.querySelector("#aiEnabled");
var apiKeyInput = document.querySelector("#apiKey");
var baseUrlInput = document.querySelector("#baseUrl");
var modelInput = document.querySelector("#model");
var saveButton = document.querySelector("#saveSettingsButton");
var statusBox = document.querySelector("#settingsStatus");
function setStatus(message) {
  statusBox.textContent = message;
}
async function init() {
  const settings = await loadSettings();
  aiEnabledInput.checked = settings.aiEnabled;
  apiKeyInput.value = settings.deepseekApiKey;
  baseUrlInput.value = settings.deepseekBaseUrl;
  modelInput.value = settings.deepseekModel;
}
saveButton.addEventListener("click", async () => {
  await saveSettings({
    aiEnabled: aiEnabledInput.checked,
    deepseekApiKey: apiKeyInput.value,
    deepseekBaseUrl: baseUrlInput.value,
    deepseekModel: modelInput.value
  });
  setStatus("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
});
init().catch((error) => setStatus(String(error)));
//# sourceMappingURL=options.js.map
