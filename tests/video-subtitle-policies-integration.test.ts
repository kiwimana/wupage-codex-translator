// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerSubtitleController } from "../src/content/video-player";
import { sendRuntimeRequest } from "../src/content/runtime";
import { DEFAULT_SETTINGS } from "../src/shared/defaults";
import { pageSubtitleCatalogue, loadPageSubtitles } from "../src/video/bridge-client";
import { mediaKey, VIDEO_PLATFORMS } from "../src/video/platforms";
import type { ExtensionSettings } from "../src/shared/types";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD: true }));
vi.mock("../src/content/runtime", () => ({ sendRuntimeRequest: vi.fn() }));
vi.mock("../src/video/bridge-client", () => ({ pageSubtitleCatalogue: vi.fn(), loadPageSubtitles: vi.fn() }));
let player: PlayerSubtitleController, settings: ExtensionSettings, video: HTMLVideoElement;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const jobs = () => vi.mocked(sendRuntimeRequest).mock.calls.filter(([r]) => r.type === "TRANSLATE_VIDEO_SUBTITLES").map(([r]) => r);
const catalogue = () => ({ key: mediaKey(), selected: "asr", tracks: [
  { id: "asr", label: "English auto", language: "en", automatic: true },
  { id: "human-source", label: "English", language: "en", automatic: false },
  { id: "human-target", label: "繁體中文", language: "zh-Hant", automatic: false }
] });
beforeEach(async () => {
  vi.useFakeTimers();vi.stubGlobal("location", new URL("https://www.youtube.com/watch?v=policies-fixture"));
  vi.stubGlobal("chrome", { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } });
  settings = { ...structuredClone(DEFAULT_SETTINGS), targetLang: "zh-TW", videoTranslation: { enabled: true, showOriginal: true, fontSize: 22, background: "soft", preferredSource: "auto", enabledSites: [], accountAutoSites: [], dialogueOnly: true } };
  document.body.innerHTML = '<div id="movie_player"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button></div></div>';
  video = document.querySelector("video")!;Object.defineProperty(video, "textTracks", { value: [], configurable: true });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 900, 506));
  vi.mocked(sendRuntimeRequest).mockImplementation(async r => {
    if (r.type === "GET_SETTINGS") return structuredClone(settings);
    if (r.type === "SAVE_SETTINGS") { settings = structuredClone(r.settings); return null; }
    if (r.type === "TRANSLATE_VIDEO_SUBTITLES") return { translations: r.texts.map(() => "AI 模擬譯文"), cached: 0 };
    return null;
  });
  vi.mocked(pageSubtitleCatalogue).mockResolvedValue(catalogue());
  vi.mocked(loadPageSubtitles).mockImplementation(async id => ({ key: mediaKey(), cues: [{ start: 0, end: 5, text: id === "human-target" ? "歡迎。" : id === "human-source" ? "Welcome." : "[Music] hello there" }] }));
  player = new PlayerSubtitleController(video, video.parentElement!, VIDEO_PLATFORMS[0]);await flush();
});
afterEach(() => { player.dispose();vi.useRealTimers();vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllGlobals();document.body.replaceChildren(); });

it("waits for human tracks and displays the target translation without any AI request or playback pause", async () => {
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  let resolve!: (value: ReturnType<typeof catalogue>) => void;
  vi.mocked(pageSubtitleCatalogue).mockImplementation(() => new Promise(done => { resolve = done; }));
  const starting = player.start();await flush();expect(jobs()).toEqual([]);resolve(catalogue());await starting;await flush();
  expect(loadPageSubtitles).toHaveBeenCalledWith("human-source", expect.any(AbortSignal));expect(loadPageSubtitles).toHaveBeenCalledWith("human-target", expect.any(AbortSignal));
  expect(player.view.root.querySelector(".source span")?.textContent).toBe("Welcome.");expect(player.view.root.querySelector(".translation span")?.textContent).toBe("歡迎。");
  expect(player.view.host.dataset.subtitleTranslation).toBe("human");expect(jobs()).toEqual([]);expect(pause).not.toHaveBeenCalled();
});
it("falls back once when a target human track fails instead of cancelling AI at every catalogue poll", async () => {
  const original = vi.mocked(loadPageSubtitles).getMockImplementation()!;
  vi.mocked(loadPageSubtitles).mockImplementation((id, signal) => id === "human-target" ? Promise.reject(new Error("Unavailable")) : original(id, signal));
  await player.start();await flush();expect(jobs()).toHaveLength(1);await vi.advanceTimersByTimeAsync(4100);await flush();
  expect(jobs()).toHaveLength(1);expect(vi.mocked(loadPageSubtitles).mock.calls.filter(([id]) => id === "human-target")).toHaveLength(1);
  expect(player.view.host.dataset.subtitleTranslation).toBe("ai");
});
it("filters sound-only captions before the scheduler can send any model work", async () => {
  vi.mocked(pageSubtitleCatalogue).mockResolvedValue({ key: mediaKey(), selected: "asr", tracks: [catalogue().tracks[0]] });
  vi.mocked(loadPageSubtitles).mockResolvedValue({ key: mediaKey(), cues: [{ start: 0, end: 3, text: "[Music] (applause)" }] });
  await player.start();await flush();await vi.advanceTimersByTimeAsync(3000);expect(jobs()).toEqual([]);expect(player.subtitlePhase).toBe("active");
});
it("does not pause or wait for AI during a gap in a human translation", async () => {
  const original = vi.mocked(loadPageSubtitles).getMockImplementation()!;
  vi.mocked(loadPageSubtitles).mockImplementation((id, signal) => id === "human-target" ? Promise.resolve({ key: mediaKey(), cues: [{ start: 1, end: 3, text: "歡迎。" }] }) : original(id, signal));
  Object.defineProperty(video, "paused", { configurable: true, get: () => false });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  await player.start();await flush();expect(jobs()).toEqual([]);expect(pause).not.toHaveBeenCalled();expect(player.subtitlePhase).toBe("active");
});
it("does not guess that a target is human when the metadata is missing", async () => {
  vi.mocked(pageSubtitleCatalogue).mockResolvedValue({ ...catalogue(), tracks: catalogue().tracks.map(track => track.id === "human-target" ? { id: track.id, label: track.label, language: track.language } : track) });
  await player.start();await flush();expect(jobs()).toHaveLength(1);expect(loadPageSubtitles).not.toHaveBeenCalledWith("human-target", expect.anything());
});
it("respects disabling human preference and uses the selected ASR source", async () => {
  player.dispose();settings.videoTranslation!.preferHumanSubtitles = false;player = new PlayerSubtitleController(video, video.parentElement!, VIDEO_PLATFORMS[0]);await flush();
  await player.start();await flush();expect(loadPageSubtitles).toHaveBeenCalledWith("asr", expect.any(AbortSignal));expect(loadPageSubtitles).not.toHaveBeenCalledWith("human-target", expect.anything());expect(jobs()).toHaveLength(1);
});
it("filters rendered captions too, distinguishing sound-only captions from missing CC", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList);
  const caption = document.createElement("div");caption.className = "ytp-caption-window-container";caption.innerHTML = '<span class="caption-visual-line">[Music]</span>';video.parentElement!.append(caption);
  vi.mocked(pageSubtitleCatalogue).mockResolvedValue({ key: mediaKey(), tracks: [] });
  await player.start();await vi.advanceTimersByTimeAsync(3000);expect(jobs()).toEqual([]);expect(player.view.root.querySelector(".status")?.textContent).toContain("等待對話");
  caption.querySelector("span")!.textContent = "[Applause] Hello (I think so)";await vi.advanceTimersByTimeAsync(700);await flush();
  expect(jobs()).toHaveLength(1);expect(jobs()[0]).toMatchObject({ texts: ["Hello (I think so)"] });
});
it("stopping during catalogue loading prevents late translation and human captions", async () => {
  let resolve!: (value: ReturnType<typeof catalogue>) => void;vi.mocked(pageSubtitleCatalogue).mockImplementation(() => new Promise(done => { resolve = done; }));
  const starting = player.start();await flush();player.stop();resolve(catalogue());await starting;await flush();
  expect(player.enabled).toBe(false);expect(jobs()).toEqual([]);expect(loadPageSubtitles).not.toHaveBeenCalled();
});
it("saves independent switches while idle without enabling translation, and appearance reset preserves them", async () => {
  for (const selector of [".prefer-human", ".optimize-sentences", ".dialogue-only"]) { const input = player.view.root.querySelector<HTMLInputElement>(selector)!;input.checked = !input.checked;input.dispatchEvent(new Event("change"));await flush(); }
  expect(settings.videoTranslation).toMatchObject({ preferHumanSubtitles: false, optimizeSentences: false, dialogueOnly: false });
  player.view.root.querySelector<HTMLButtonElement>(".reset-style")!.click();await flush();
  expect(settings.videoTranslation).toMatchObject({ preferHumanSubtitles: false, optimizeSentences: false, dialogueOnly: false });expect(player.enabled).toBe(false);expect(jobs()).toEqual([]);
});
