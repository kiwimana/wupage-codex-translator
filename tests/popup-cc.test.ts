// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeRequest } from "../src/shared/types";
import type { SubtitlePhase } from "../src/shared/video";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD: true }));

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals(); document.documentElement.replaceChildren();
});
async function setup(url = "https://www.youtube.com/watch?v=test", initiallyEnabled = false, initialPhase: SubtitlePhase = "active") {
  vi.resetModules(); document.open(); document.write(readFileSync(resolve("popup.html"), "utf8")); document.close();
  const { DEFAULT_SETTINGS } = await import("../src/shared/defaults");
  let settings = structuredClone(DEFAULT_SETTINGS);
  let enabled = initiallyEnabled;
  let phase = initialPhase;
  const sendMessage = vi.fn(async (request: RuntimeRequest) => {
    if (request.type === "GET_SETTINGS") return { ok: true, data: structuredClone(settings) };
    if (request.type === "SAVE_SETTINGS") { settings = structuredClone(request.settings); return { ok: true }; }
    if (request.type === "OPEN_VIDEO_SUBTITLES") {
      if (request.action !== "state") enabled = request.action !== "stop";
      return { ok: true, data: { opened: true, enabled, phase: enabled ? phase : "idle" } };
    }
    if (request.type === "GET_OCR_STATUS") return { ok: true, data: { state: "missing", downloaded: 0, total: 0 } };
    if (request.type === "GET_EXTENSION_UPDATE") return { ok: true, data: { available: false, autoCheck: true, autoInstall: false } };
    return { ok: true };
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "cc-test", getManifest: () => ({ version: "1.0.0" }), openOptionsPage: vi.fn(), sendMessage },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    tabs: { query: async () => [{ id: 4, url }], sendMessage: async () => ({ ok: true, data: { enabled: false, translated: false } }) }
  });
  await import("../src/popup/index");
  const button = document.querySelector<HTMLButtonElement>("#translateCc")!;
  await vi.waitFor(() => expect(button.hidden).toBe(false));
  await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#targetLang")!.options.length).toBeGreaterThan(2));
  return { button, sendMessage, settings: () => settings, phase: (value: SubtitlePhase) => { phase = value; } };
}
describe("manual AI CC action", () => {
  it("preserves the right-click panel's font, original-text and automatic site preferences", async () => {
    const state = await setup();
    state.settings().videoTranslation = { ...state.settings().videoTranslation!, fontSize: 26, showOriginal: false, accountAutoSites: ["youtube"] };
    await vi.waitFor(() => expect(state.button.disabled).toBe(false));
    state.button.click();
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("true"));
    expect(state.settings().videoTranslation).toMatchObject({ enabled: true, fontSize: 26, showOriginal: false, accountAutoSites: ["youtube"] });
  });
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
  it("shows loading immediately, follows AI completion, and still allows stopping while AI is pending", async () => {
    const state = await setup(undefined, false, "loading");
    await vi.waitFor(() => expect(state.button.disabled).toBe(false));
    state.button.click();
    expect(state.button.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("true"));
    expect(state.button.getAttribute("aria-busy")).toBe("true");
    expect(state.button.disabled).toBe(false);
    expect(state.button.textContent).toContain("翻譯中");
    state.phase("active");
    await vi.waitFor(() => expect(state.button.getAttribute("aria-busy")).toBe("false"), { timeout: 3000 });
    state.phase("loading");
    await vi.waitFor(() => expect(state.button.getAttribute("aria-busy")).toBe("true"), { timeout: 3000 });
    state.button.click();
    await vi.waitFor(() => expect(state.button.getAttribute("aria-pressed")).toBe("false"));
    expect(state.button.getAttribute("aria-busy")).toBe("false");
  });
  it("restores the spinner when reopening during AI translation and stops it on an error", async () => {
    const state = await setup(undefined, true, "loading");
    await vi.waitFor(() => expect(state.button.getAttribute("aria-busy")).toBe("true"));
    expect(state.button.disabled).toBe(false);
    state.phase("error");
    await vi.waitFor(() => expect(state.button.getAttribute("aria-busy")).toBe("false"), { timeout: 3000 });
    expect(state.button.textContent).toContain("異常");
  });
  it("clears loading after a failed start request", async () => {
    const state = await setup();
    await vi.waitFor(() => expect(state.button.disabled).toBe(false));
    const original = state.sendMessage.getMockImplementation()!;
    state.sendMessage.mockImplementation(async request => {
      if (request.type === "OPEN_VIDEO_SUBTITLES" && request.action === "start") throw new Error("Bridge disconnected");
      return original(request);
    });
    state.button.click();
    await vi.waitFor(() => expect(document.querySelector("#status")!.textContent).toContain("Bridge disconnected"));
    expect(state.button.getAttribute("aria-busy")).toBe("false");
    expect(state.button.disabled).toBe(false);
  });
});
