import type { LayerPrefs } from "@vennmeet/shared";
import { DEFAULT_LAYER_PREFS } from "./design";
import type { Platform } from "./platform";

function storageKey(platform: Platform): string {
  return `venn.layerPrefs.${platform}`;
}

export async function loadLayerPrefs(platform: Platform): Promise<LayerPrefs> {
  const key = storageKey(platform);
  const result = await chrome.storage.local.get(key);
  const stored = result[key] as LayerPrefs | undefined;
  return stored ?? { ...DEFAULT_LAYER_PREFS, collapsed: { ...DEFAULT_LAYER_PREFS.collapsed } };
}

export async function saveLayerPrefs(platform: Platform, prefs: LayerPrefs): Promise<void> {
  await chrome.storage.local.set({ [storageKey(platform)]: prefs });
}
