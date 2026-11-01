// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/defaults";
import type { RuntimeRequest } from "../src/shared/types";

let finishPageProbe: (() => void) | undefined;
afterEach(async () => {
  finishPageProbe?.(); await new Promise(resolve => setTimeout(resolve, 20));
  window.dispatchEvent(new Event("pagehide")); vi.unstubAllGlobals(); document.documentElement.replaceChildren();
});
async function pendingPage() {
  vi.resetModules(); document.open(); document.write(readFileSync(resolve("popup.html"), "utf8")); document.close();
  let settings = structuredClone(DEFAULT_SETTINGS);
  const openOptionsPage = vi.fn(async () => undefined);
  const pageProbe = new Promise<unknown>(done => { finishPageProbe = () => done({ ok: true, data: { enabled: false } }); });
  vi.stubGlobal("chrome", {
    runtime: { id: "startup-test", openOptionsPage, sendMessage: async (request: RuntimeRequest) => {
      if (request.type === "GET_SETTINGS") return { ok: true, data: structuredClone(settings) };
      if (request.type === "SAVE_SETTINGS") { settings = structuredClone(request.settings); return { ok: true }; }
      if (request.type === "GET_OCR_STATUS") return { ok: true, data: { state: "missing", downloaded: 0, total: 0 } };
      return { ok: true };
    } },
    storage: { local: { get: vi.fn(async () => ({})) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    tabs: { query: async () => [{ id: 4, url: "https://example.com/slow-page" }],
      sendMessage: async (_id: number, request: RuntimeRequest) => request.type === "GET_PARAGRAPH_MODE"
        ? pageProbe : { ok: true, data: { translated: false } } }
  });
  await import("../src/popup/index");
  await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#targetLang")!.options.length).toBeGreaterThan(2));
  return { settings: () => settings, openOptionsPage };
}
describe("popup settings independent of page responsiveness", () => {
  it("saves language and display selections while the page has not answered its initial probe", async () => {
    const state = await pendingPage();
    const language = document.querySelector<HTMLSelectElement>("#targetLang")!;
    language.value = "ja"; language.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(state.settings().targetLang).toBe("ja"), { timeout: 500 });
    const mode = document.querySelector<HTMLSelectElement>("#translationDisplayMode")!;
    expect(mode.disabled).toBe(false); mode.value = "replace"; mode.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(state.settings().translationDisplayMode).toBe("replace"));
  });
  it("opens full settings without waiting for the active webpage", async () => {
    const state = await pendingPage(); document.querySelector<HTMLButtonElement>("#openOptions")!.click();
    expect(state.openOptionsPage).toHaveBeenCalledOnce();
  });
});
