// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeRequest } from "../src/shared/types";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD: true }));

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals(); document.documentElement.replaceChildren();
});
async function setup(url = "https://www.youtube.com/watch?v=test", initiallyEnabled = false) {
  vi.resetModules(); document.open(); document.write(readFileSync(resolve("popup.html"), "utf8")); document.close();
  const { DEFAULT_SETTINGS } = await import("../src/shared/defaults");
  let settings = structuredClone(DEFAULT_SETTINGS);
  let enabled = initiallyEnabled;
  const sendMessage = vi.fn(async (request: RuntimeRequest) => {
    if (request.type === "GET_SETTINGS") return { ok: true, data: structuredClone(settings) };
    if (request.type === "SAVE_SETTINGS") { settings = structuredClone(request.settings); return { ok: true }; }
    if (request.type === "OPEN_VIDEO_SUBTITLES") {
      if (request.action !== "state") enabled = request.action !== "stop";
      return { ok: true, data: { opened: true, enabled } };
    }
    if (request.type === "GET_OCR_STATUS") return { ok: true, data: { state: "missing", downloaded: 0, total: 0 } };
    return { ok: true };
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "cc-test", openOptionsPage: vi.fn(), sendMessage },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    tabs: { query: async () => [{ id: 4, url }], sendMessage: async () => ({ ok: true, data: { enabled: false, translated: false } }) }
  });
  await import("../src/popup/index");
  const button = document.querySelector<HTMLButtonElement>("#translateCc")!;
  await vi.waitFor(() => expect(button.hidden).toBe(false));
  await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#targetLang")!.options.length).toBeGreaterThan(2));
  return { button, sendMessage, settings: () => settings };
}
describe("manual AI CC action", () => {
  it("stays idle at startup and starts bilingual CC directly for the current tab on click", async () => {
    const state = await setup();
    await vi.waitFor(() => expect(state.button.disabled).toBe(false));
    expect(document.querySelector<HTMLButtonElement>("#videoTranslation")!.hidden).toBe(true);
    expect(state.sendMessage.mock.calls.some(([r]) => r.type === "OPEN_VIDEO_SUBTITLES" && r.action !== "state")).toBe(false);
    state.button.click();
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("true"));
    expect(state.sendMessage).toHaveBeenCalledWith({ type: "OPEN_VIDEO_SUBTITLES", tabId: 4, action: "start" });
    expect(state.settings().videoTranslation).toMatchObject({ enabled: true, showOriginal: true, enabledSites: [] });
    expect(state.button.textContent).toContain("停止");
    state.button.click();
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("false"));
    expect(state.sendMessage).toHaveBeenCalledWith({ type: "OPEN_VIDEO_SUBTITLES", tabId: 4, action: "stop" });
  });
  it("reads the running page state when reopening without starting another session", async () => {
    const state = await setup(undefined, true);
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("true"));
    expect(state.sendMessage.mock.calls.every(([r]) => r.type !== "OPEN_VIDEO_SUBTITLES" || r.action === "state")).toBe(true);
  });
  it("disables CC actions on browser settings pages", async () => {
    const state = await setup("about:preferences");
    expect(state.button.disabled).toBe(true);
    expect(state.sendMessage.mock.calls.some(([r]) => r.type === "OPEN_VIDEO_SUBTITLES")).toBe(false);
  });
});
