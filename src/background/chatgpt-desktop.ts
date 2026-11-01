import { CHATGPT_HOST } from "../shared/chatgpt-build";
import type { ChatGPTDesktopConfig, TranslateBatchRequest, TranslatorProvider } from "../shared/types";
import { DESKTOP_ACCOUNTS, desktopEngine, type DesktopAccountStatus, type DesktopEngine } from "../shared/desktop-account";

/** A local-only check; connecting an account requires a separate explicit click. */
export function desktopAccountAction(engine: DesktopEngine, connect = false): Promise<DesktopAccountStatus> {
  return new Promise((resolve, reject) => {
    let port: chrome.runtime.Port;
    try { port = chrome.runtime.connectNative(CHATGPT_HOST); }
    catch { reject(new Error("本機橋接未安裝，請先執行新版橋接安裝程式。")); return; }
    let settled = false;
    const finish = (error?: Error, status?: DesktopAccountStatus) => {
      if (settled) return; settled = true; clearTimeout(timer); port.disconnect();
      if (error) reject(error); else resolve(status!);
    };
    const timer = setTimeout(() => finish(new Error("本機偵測逾時，請更新橋接程式後重試。")), 15000);
    port.onMessage.addListener(reply => {
      if (reply?.ok !== true || reply.engine !== engine || typeof reply.installed !== "boolean" || reply.bridgeVersion !== 2) {
        finish(new Error("請先更新橋接程式。" + (typeof reply?.error === "string" ? reply.error : "目前版本不支援偵測與連結。"))); return;
      }
      finish(undefined, { engine, installed: reply.installed, login: "unchecked", bridgeVersion: 2, launched: reply.launched === true });
    });
    port.onDisconnect.addListener(() => finish(new Error("無法偵測本機工具，請先安裝或更新橋接程式。")));
    try { port.postMessage({ type: connect ? "connect" : "detect", engine }); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}

/** Open a native connection only for an explicitly requested translation. */
export class ChatGPTDesktopProvider implements TranslatorProvider {
  readonly id: string;
  readonly label: string;
  constructor(private config: ChatGPTDesktopConfig) { this.id = config.id; this.label = config.label; }
  validateConfig() { return { ok: true }; }

  async translateBatch(request: TranslateBatchRequest, signal?: AbortSignal): Promise<string[]> {
    signal?.throwIfAborted();
    if (!request.texts.length) return [];
    // Older hosts ignore extra fields and would silently run Codex instead.
    // Verify the protocol before passing a different engine or explicit model.
    if (desktopEngine(this.config) !== "codex" || this.config.model) {
      const state = await desktopAccountAction(desktopEngine(this.config));
      signal?.throwIfAborted();
      if (!state.installed) throw new Error(`未偵測到 ${DESKTOP_ACCOUNTS[desktopEngine(this.config)].app}，請先安裝並更新橋接程式。`);
    }
    return new Promise((resolve, reject) => {
      let port: chrome.runtime.Port;
      try { port = chrome.runtime.connectNative(CHATGPT_HOST); }
      catch { reject(new Error("請先執行隨包附上的安裝橋接程式，再重新載入擴充套件。")); return; }
      let settled = false;
      const finish = (error?: unknown, translations?: string[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        port.disconnect();
        if (error) reject(error); else resolve(translations!);
      };
      const abort = () => finish(signal?.reason ?? new DOMException("翻譯已停止", "AbortError"));
      const account = DESKTOP_ACCOUNTS[desktopEngine(this.config)];
      const timer = setTimeout(() => finish(new Error(`${account.app} 翻譯逾時，請稍後手動重試。`)), 180_000);
      signal?.addEventListener("abort", abort, { once: true });
      port.onMessage.addListener((message: unknown) => {
        const reply = message as { ok?: boolean; translations?: unknown; error?: unknown } | null;
        if (reply?.ok !== true) {
          finish(new Error(typeof reply?.error === "string" ? reply.error : "桌面翻譯回應無效。"));
          return;
        }
        const texts = reply.translations;
        if (!Array.isArray(texts) || texts.length !== request.texts.length
          || texts.some(text => typeof text !== "string" || !text.trim())) {
          finish(new Error("桌面翻譯的段落數量或格式不符，請手動重試。")); return;
        }
        finish(undefined, texts);
      });
      port.onDisconnect.addListener(() => {
        const error = (port as chrome.runtime.Port & { error?: { message?: string } }).error?.message
          ?? chrome.runtime.lastError?.message;
        if (!settled) finish(new Error(error
          ? `本機橋接連線中斷：${error}。請確認已更新橋接程式並登入 ${account.app}。`
          : `本機橋接已結束，請確認 ${account.app} 登入狀態。`));
      });
      if (signal?.aborted) { abort(); return; }
      try { port.postMessage({ type: "translate", texts: request.texts,
        engine: desktopEngine(this.config), model: this.config.model || undefined,
        sourceLang: request.sourceLang ?? "auto", targetLang: request.targetLang,
        context: request.context, preservePlaceholders: request.preservePlaceholders === true }); }
      catch (error) { finish(error); }
    });
  }
}
