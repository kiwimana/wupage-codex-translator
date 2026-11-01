import { CHATGPT_BUILD } from "./chatgpt-build";
import { sendRuntimeMessage } from "./messaging";
import { RELEASES_URL, type ExtensionUpdateStatus } from "./extension-update";

export function setupExtensionUpdateUI(root: HTMLElement | null, compact = false): void {
  if (!root) return;
  root.hidden = !CHATGPT_BUILD;
  if (!CHATGPT_BUILD) return;
  if (compact) {
    const button = document.createElement("button"); button.type = "button"; button.className = "extension-update-summary";
    button.textContent = `v${chrome.runtime.getManifest().version} 更新`;
    button.title = "前往擴充更新設定";
    button.addEventListener("click", () => { void chrome.tabs.create({ url: chrome.runtime.getURL("options.html#extensionUpdates") }); });
    root.replaceChildren(button);
    void sendRuntimeMessage<ExtensionUpdateStatus>({ type: "GET_EXTENSION_UPDATE" }).then(state => {
      if (state.available) button.textContent = `新版 v${state.latestVersion}`;
    }).catch(() => {}); return;
  }
  root.innerHTML = `<div class="settings-panel-heading"><h2>擴充更新</h2><p>從本專案的 GitHub 穩定版本取得更新，保留你的翻譯設定。</p></div>
    <p data-update-version></p>
    <label class="update-toggle"><input type="checkbox" data-update-check>每 6 小時自動檢查新版本</label>
    <label class="update-toggle" data-update-auto-label><input type="checkbox" data-update-auto>自動安裝 Chrome 更新（需要新版本機橋接）</label>
    <p class="update-help" data-update-help></p>
    <div class="update-actions"><button type="button" data-update-now>立即檢查</button><button type="button" data-update-install disabled>安裝更新</button><a href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub 下載／說明</a></div>
    <p role="status" aria-live="polite" data-update-status>正在讀取更新設定…</p>`;
  const q = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const check = q<HTMLInputElement>("[data-update-check]"), automatic = q<HTMLInputElement>("[data-update-auto]");
  const now = q<HTMLButtonElement>("[data-update-now]"), install = q<HTMLButtonElement>("[data-update-install]");
  const status = q<HTMLParagraphElement>("[data-update-status]");
  let state: ExtensionUpdateStatus | undefined;
  function render(value: ExtensionUpdateStatus): void {
    state = value; check.checked = value.autoCheck; automatic.checked = value.autoInstall;
    q("[data-update-version]").textContent = `目前版本 v${value.currentVersion}${value.latestVersion ? ` · 最新穩定版 v${value.latestVersion}` : ""}`;
    q("[data-update-auto-label]").hidden = value.browser !== "chrome";
    q("[data-update-help]").textContent = value.browser === "chrome"
      ? "第一次請在新版橋接資料夾執行 install.ps1 -Browser Chrome -ChromeExtensionPath \"擴充資料夾完整路徑\"。開啟自動安裝後會更新這個指定資料夾並重新載入擴充；已開啟的網頁請重新整理。更新不會登入 AI 帳號。"
      : "Firefox 臨時載入版會自動檢查並提示新版。請下載、解壓覆蓋原擴充資料夾，再到 about:debugging 重新載入；目前未提供商店簽署版的自動安裝。";
    install.hidden = value.browser !== "chrome"; install.disabled = !value.available || value.installing === true;
    status.textContent = value.error || (value.installing ? "更新已安裝，正在重新載入擴充；請重新整理原本的網頁。" : value.available ? `發現新版 v${value.latestVersion}，可${value.browser === "chrome" ? "安裝更新" : "前往 GitHub 下載"}。` : value.checkedAt ? "目前已是最新版本。" : "尚未檢查更新。");
    if (value.checkedAt && !value.error && !value.installing) status.textContent += ` 上次檢查：${new Date(value.checkedAt).toLocaleString("zh-TW")}`;
  }
  async function action(run: () => Promise<ExtensionUpdateStatus>, message: string): Promise<void> {
    check.disabled = automatic.disabled = now.disabled = install.disabled = true; status.textContent = message;
    try { render(await run()); } catch (error) {
      if (state) render(state);
      status.textContent = error instanceof Error ? error.message : "更新操作失敗。";
    } finally { check.disabled = automatic.disabled = now.disabled = false; }
  }
  check.addEventListener("change", () => { void action(() => sendRuntimeMessage({ type: "CONFIGURE_EXTENSION_UPDATE", autoCheck: check.checked, autoInstall: automatic.checked }), "正在儲存…"); });
  automatic.addEventListener("change", () => { void action(() => sendRuntimeMessage({ type: "CONFIGURE_EXTENSION_UPDATE", autoCheck: check.checked, autoInstall: automatic.checked }), "正在確認本機更新設定…"); });
  now.addEventListener("click", () => { void action(() => sendRuntimeMessage({ type: "CHECK_EXTENSION_UPDATE" }), "正在檢查 GitHub 穩定版本…"); });
  install.addEventListener("click", () => { void action(() => sendRuntimeMessage({ type: "INSTALL_EXTENSION_UPDATE" }), "正在下載、驗證並安裝更新…"); });
  void action(() => sendRuntimeMessage({ type: "GET_EXTENSION_UPDATE" }), "正在讀取更新設定…");
}
