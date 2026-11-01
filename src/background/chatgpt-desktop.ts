import { CHATGPT_HOST } from "../shared/chatgpt-build";
import type { ChatGPTDesktopConfig, TranslateBatchRequest, TranslatorProvider } from "../shared/types";

/** Open a native connection only for an explicitly requested translation. */
export class ChatGPTDesktopProvider implements TranslatorProvider {
  readonly id: string;
  readonly label: string;
  constructor(config: ChatGPTDesktopConfig) { this.id = config.id; this.label = config.label; }
  validateConfig() { return { ok: true }; }

  async translateBatch(request: TranslateBatchRequest, signal?: AbortSignal): Promise<string[]> {
    signal?.throwIfAborted();
    if (!request.texts.length) return [];
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
      const timer = setTimeout(() => finish(new Error("ChatGPT 翻譯逾時，請稍後手動重試。")), 180_000);
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
          ? `本機橋接連線中斷：${error}。請確認已安裝橋接程式並登入 ChatGPT。`
          : "本機橋接已結束，請確認 ChatGPT 登入狀態。"));
      });
      if (signal?.aborted) { abort(); return; }
      try { port.postMessage({ type: "translate", texts: request.texts,
        sourceLang: request.sourceLang ?? "auto", targetLang: request.targetLang,
        context: request.context, preservePlaceholders: request.preservePlaceholders === true }); }
      catch (error) { finish(error); }
    });
  }
}
