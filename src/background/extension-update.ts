import { CHATGPT_BUILD, CHATGPT_HOST } from "../shared/chatgpt-build";
import { UPDATE_API, UPDATE_KEY, UPDATE_ALARM, compareVersions, releaseUpdate, type ExtensionUpdateState, type ExtensionUpdateStatus } from "../shared/extension-update";
import { getTranslationDebugSnapshot } from "./translation";

let checking: Promise<ExtensionUpdateStatus> | undefined;
let installing = false;
let writes = Promise.resolve();
const browser = (): "chrome" | "firefox" => "browser_specific_settings" in chrome.runtime.getManifest() ? "firefox" : "chrome";
async function read(): Promise<ExtensionUpdateState> {
  const saved = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] as Partial<ExtensionUpdateState> | undefined;
  return { ...saved, autoCheck: saved?.autoCheck !== false, autoInstall: browser() === "chrome" && saved?.autoInstall === true };
}
export async function updateStatus(): Promise<ExtensionUpdateStatus> {
  const state = await read(), currentVersion = chrome.runtime.getManifest().version;
  return { ...state, installing, currentVersion, browser: browser(), available: !!state.latestVersion && compareVersions(state.latestVersion, currentVersion) > 0 };
}
async function write(patch: Partial<ExtensionUpdateState>): Promise<void> {
  const next = writes.catch(() => {}).then(async () => { await chrome.storage.local.set({ [UPDATE_KEY]: { ...await read(), ...patch } }); });
  writes = next; await next;
}
function nativeUpdate(type: "extension-update-status" | "extension-update", expectedVersion?: string): Promise<{ configured: boolean; version?: string }> {
  return new Promise((resolve, reject) => {
    let port: chrome.runtime.Port;
    try { port = chrome.runtime.connectNative(CHATGPT_HOST); } catch { reject(new Error("請先安裝新版 Windows 橋接並設定 Chrome 擴充資料夾。")); return; }
    let settled = false;
    const finish = (error?: Error, reply?: { configured: boolean; version?: string }) => {
      if (settled) return; settled = true; clearTimeout(timer); port.disconnect();
      if (error) reject(error); else resolve(reply!);
    };
    const timer = setTimeout(() => finish(new Error("更新逾時，請稍後重試。")), 160_000);
    port.onMessage.addListener(reply => {
      if (reply?.ok !== true || reply.updateProtocol !== 1) { finish(new Error(typeof reply?.error === "string" ? reply.error : "請先更新 Windows 橋接程式。")); return; }
      finish(undefined, reply);
    });
    port.onDisconnect.addListener(() => { const message = chrome.runtime.lastError?.message; finish(new Error(message || "本機更新橋接中斷，請檢查是否已安裝新版橋接。")); });
    try { port.postMessage({ type, expectedVersion }); } catch { finish(new Error("無法傳送更新請求。")); }
  });
}
export async function configureUpdates(autoCheck: boolean, autoInstall: boolean): Promise<ExtensionUpdateStatus> {
  if (typeof autoCheck !== "boolean" || typeof autoInstall !== "boolean") throw new Error("更新設定無效。");
  if (autoInstall && browser() !== "chrome") throw new Error("Firefox 臨時載入版需要手動重新載入。");
  if (autoInstall && !(await read()).autoInstall && !(await nativeUpdate("extension-update-status")).configured) throw new Error("請先執行橋接安裝程式，以 -ChromeExtensionPath 指定目前載入的 Chrome 擴充資料夾。");
  await write({ autoCheck, autoInstall });
  await scheduleUpdates(); return updateStatus();
}
export function checkUpdates(): Promise<ExtensionUpdateStatus> {
  checking ??= (async () => {
    try {
      const response = await fetch(UPDATE_API, { credentials: "omit", cache: "no-store", headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? "GitHub 暫時限制查詢，請稍後重試。" : "無法取得 GitHub 更新資訊。");
      const body = await response.text(); if (body.length > 1_000_000) throw new Error("更新資訊過大。");
      await write({ ...releaseUpdate(JSON.parse(body), browser()), checkedAt: Date.now(), error: undefined });
    } catch (error) { await write({ error: error instanceof Error ? error.message : "更新檢查失敗。" }); }
    return updateStatus();
  })().finally(() => { checking = undefined; });
  return checking;
}
export async function installUpdate(): Promise<ExtensionUpdateStatus> {
  if (browser() !== "chrome") throw new Error("請下載 Firefox 套件，再到 about:debugging 重新載入。");
  if (installing) throw new Error("更新正在進行中。");
  if (getTranslationDebugSnapshot().activeCount > 0) throw new Error("請先停止翻譯，再安裝更新。自動更新會等到沒有翻譯工作時重試。");
  installing = true;
  try {
    const status = await checkUpdates();
    if (status.error) throw new Error(status.error);
    if (!status.available) return status;
    if (getTranslationDebugSnapshot().activeCount > 0) throw new Error("翻譯正在進行，請完成或停止後再更新。");
    const result = await nativeUpdate("extension-update", status.latestVersion);
    if (result.version !== status.latestVersion) throw new Error("更新版本不符，請重新檢查。");
    await write({ autoInstall: (await read()).autoInstall, error: undefined });
    // Finish the UI response before this service worker is unloaded.
    const reloadWhenIdle = () => {
      if (getTranslationDebugSnapshot().activeCount > 0) setTimeout(reloadWhenIdle, 5000);
      else chrome.runtime.reload();
    };
    setTimeout(reloadWhenIdle, 1200);
    return { ...await updateStatus(), installing: true };
  } catch (error) { await write({ error: error instanceof Error ? error.message : "更新失敗。" }); throw error; }
  finally { installing = false; }
}
async function scheduleUpdates(): Promise<void> {
  if (!chrome.alarms) return;
  const state = await read();
  if (state.autoCheck || state.autoInstall) await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
  else await chrome.alarms.clear(UPDATE_ALARM);
}
export function initExtensionUpdates(): void {
  if (!CHATGPT_BUILD) return;
  chrome.alarms?.onAlarm.addListener(alarm => {
    if (alarm.name !== UPDATE_ALARM) return;
    void (async () => {
      const state = await read(); if (!state.autoCheck && !state.autoInstall) return;
      const result = await checkUpdates();
      if (!result.error && result.available && state.autoInstall) await installUpdate();
    })().catch(() => {});
  });
  chrome.runtime.onInstalled?.addListener(() => { void scheduleUpdates().catch(() => {}); });
  chrome.runtime.onStartup?.addListener(() => { void scheduleUpdates().catch(() => {}); });
  // Recreate a lost alarm after a browser restart or service worker wakeup.
  void (async () => { if (chrome.alarms && !await chrome.alarms.get(UPDATE_ALARM)) await scheduleUpdates(); })().catch(() => {});
}
