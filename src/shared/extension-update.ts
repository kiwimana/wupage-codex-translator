export const UPDATE_API = "https://api.github.com/repos/kiwimana/wupage-codex-translator/releases/latest";
export const RELEASES_URL = "https://github.com/kiwimana/wupage-codex-translator/releases/latest";
export const UPDATE_KEY = "wupage.extensionUpdate.v1";
export const UPDATE_ALARM = "wupage-extension-update";
export interface ExtensionUpdateState {
  autoCheck: boolean; autoInstall: boolean; checkedAt?: number; latestVersion?: string;
  releaseUrl?: string; downloadUrl?: string; error?: string; installing?: boolean;
}
export interface ExtensionUpdateStatus extends ExtensionUpdateState {
  currentVersion: string; browser: "chrome" | "firefox"; available: boolean;
}
export function compareVersions(a: string, b: string): number {
  if (![a, b].every(value => /^\d{1,5}(?:\.\d{1,5}){1,3}$/u.test(value))) throw new Error("更新版本格式無效。");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) { const delta = (left[i] ?? 0) - (right[i] ?? 0); if (delta) return Math.sign(delta); }
  return 0;
}
export function releaseUpdate(value: unknown, browser: "chrome" | "firefox"): Pick<ExtensionUpdateState, "latestVersion" | "releaseUrl" | "downloadUrl"> {
  const data = value as { tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: { name?: string; browser_download_url?: string; size?: number }[] };
  if (!data || data.draft !== false || data.prerelease !== false || !/^v\d+(?:\.\d+){1,3}$/u.test(data.tag_name ?? "")) throw new Error("找不到有效的穩定版本。");
  const version = data.tag_name!.slice(1); compareVersions(version, version);
  const name = `wupage-codex-${version}-${browser}.zip`;
  const url = `https://github.com/kiwimana/wupage-codex-translator/releases/download/v${version}/${name}`;
  const asset = Array.isArray(data.assets) ? data.assets.find(item => item.name === name) : undefined;
  if (!asset || asset.browser_download_url !== url || !asset.size || asset.size >= 10_000_000) throw new Error("更新套件不存在或來源不符。");
  return { latestVersion: version, releaseUrl: `https://github.com/kiwimana/wupage-codex-translator/releases/tag/v${version}`, downloadUrl: url };
}
