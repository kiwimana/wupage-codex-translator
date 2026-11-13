import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sameTranslationLanguage } from "../src/shared/language-identity";
import { normalizeSettings } from "../src/shared/settings";
import { sameLanguageIndexes } from "../src/background/same-language";
import { translateWithSettings, getTranslationDebugSnapshot } from "../src/background/translation";
import { createProvider } from "../src/background/providers";
import { VideoRequests } from "../src/content/video-requests";
import { sendRuntimeRequest } from "../src/content/runtime";
vi.mock("../src/background/providers", () => ({ createProvider: vi.fn() }));
vi.mock("../src/content/runtime", () => ({ sendRuntimeRequest: vi.fn() }));
const translate = vi.fn(async (request: { texts: string[] }) => request.texts.map(text => `translation: ${text}`));
const detect = vi.fn(async (_text: string) => ({ isReliable: true, languages: [{ language: "zh", percentage: 100 }] }));
const settings = () => normalizeSettings({ cacheEnabled: false });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", { i18n: { detectLanguage: detect }, storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } } });
  detect.mockResolvedValue({ isReliable: true, languages: [{ language: "zh", percentage: 100 }] });
  vi.mocked(createProvider).mockReturnValue({ id: "test", label: "Test", translateBatch: translate, validateConfig: () => ({ ok: true }) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([
  ["en-US", "en-GB", true], ["EN_us", "en", true], ["zh-TW", "zh-Hant-HK", true],
  ["zh-CN", "zh-Hans", true], ["zh-TW", "zh-CN", false], ["zh", "zh-TW", false],
  ["auto", "en", false], ["und", "en", false], ["", "", false],
  ["sr-Latn", "sr-Cyrl", false], ["not a locale", "en", false]
])("compares locale identity %s to %s without merging scripts", (source, target, expected) => {
  expect(sameTranslationLanguage(String(source), String(target))).toBe(expected);
});

it("defaults old settings to enabled and preserves an explicit opt-out", () => {
  expect(settings().skipSameLanguage).toBe(true);
  expect(normalizeSettings({ skipSameLanguage: false }).skipSameLanguage).toBe(false);
  expect(normalizeSettings({ skipSameLanguage: "false" }).skipSameLanguage).toBe(true);
});

it("short-circuits exact source languages before creating a provider, cache or debug task", async () => {
  const before = getTranslationDebugSnapshot().tasks.length;
  const result = await translateWithSettings(settings(), { texts: ["Hello", "A second item"], sourceLang: "en-US", targetLang: "en" });
  expect(result).toEqual({ translations: ["Hello", "A second item"], cached: 0, skippedIndexes: [0, 1] });
  expect(createProvider).not.toHaveBeenCalled(); expect(detect).not.toHaveBeenCalled();
  expect(chrome.storage.local.get).not.toHaveBeenCalled();
  expect(getTranslationDebugSnapshot().tasks.length).toBe(before);
});

it("can disable the rule, including explicit equal languages", async () => {
  await translateWithSettings({ ...settings(), skipSameLanguage: false }, { texts: ["Hello"], sourceLang: "en", targetLang: "en" });
  expect(translate).toHaveBeenCalledOnce(); expect(detect).not.toHaveBeenCalled();
});

it("filters each mixed-batch item, preserves order and never caches skipped text", async () => {
  detect.mockImplementation(async text => ({ isReliable: true, languages: [{ language: text.includes("Hello") ? "en" : "zh", percentage: 100 }] }));
  const texts = ["這是繁體中文內容。", "Hello from the foreign paragraph.", "这是简体中文内容。", "這是另一個段落。"];
  const result = await translateWithSettings(settings(), { texts, sourceLang: "auto", targetLang: "zh-TW" });
  expect(translate.mock.calls[0][0].texts).toEqual([texts[1], texts[2]]);
  expect(result).toEqual({ translations: [texts[0], `translation: ${texts[1]}`, `translation: ${texts[2]}`, texts[3]], cached: 0, skippedIndexes: [0, 3] });
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it("keeps meaningful foreign text within a Chinese paragraph available for translation", async () => {
  expect(await sameLanguageIndexes({ texts: ["這個功能 supports bilingual subtitles.", "これは日本語です。", "한국어 자막입니다."], targetLang: "zh-TW" })).toEqual([]);
});

it("does not skip Simplified to Traditional or Traditional to Simplified", async () => {
  expect(await sameLanguageIndexes({ texts: ["这是简体字幕。"], targetLang: "zh-TW" })).toEqual([]);
  expect(await sameLanguageIndexes({ texts: ["這是繁體字幕。"], targetLang: "zh-CN" })).toEqual([]);
  await translateWithSettings(settings(), { texts: ["这是简体字幕。"], sourceLang: "zh-CN", targetLang: "zh-TW" });
  expect(translate).toHaveBeenCalledOnce();
});

it("uses actual script evidence when a Chinese CC track only declares bare zh", async () => {
  expect(await sameLanguageIndexes({ texts: ["這是繁體字幕。", "这是简体字幕。"], sourceLang: "zh", targetLang: "zh-TW" })).toEqual([0]);
  expect(await sameLanguageIndexes({ texts: ["這是繁體字幕。", "这是简体字幕。"], sourceLang: "zh", targetLang: "zh-CN" })).toEqual([1]);
});

it("ignores opaque protected markers when detecting, but returns the original marker text", async () => {
  const text = "這是完整的繁體中文說明 ⟪WUPAGE0⟫。";
  const result = await translateWithSettings(settings(), { texts: [text], targetLang: "zh-TW", preservePlaceholders: true });
  expect(result.translations).toEqual([text]);
  expect(detect.mock.calls[0][0]).not.toContain("WUPAGE"); expect(createProvider).not.toHaveBeenCalled();
});

it("falls back to translation on unavailable, unreliable or failed detection", async () => {
  for (const value of [undefined, { isReliable: false, languages: [{ language: "zh", percentage: 100 }] }, { isReliable: true, languages: [{ language: "zh", percentage: 70 }] }]) {
    detect.mockResolvedValue(value as never);
    await translateWithSettings(settings(), { texts: ["這是測試文字。"], targetLang: "zh-TW" });
  }
  detect.mockRejectedValue(new Error("Unavailable"));
  await translateWithSettings(settings(), { texts: ["這是測試文字。"], targetLang: "zh-TW" });
  vi.stubGlobal("chrome", {});
  await translateWithSettings(settings(), { texts: ["這是測試文字。"], targetLang: "zh-TW" });
  expect(translate).toHaveBeenCalledTimes(5);
});

it("times out a stalled detector and continues without hanging a page", async () => {
  vi.useFakeTimers(); detect.mockImplementation(() => new Promise(() => {}));
  const result = translateWithSettings(settings(), { texts: ["這是測試文字。"], targetLang: "zh-TW" });
  await vi.advanceTimersByTimeAsync(1200);
  expect((await result).translations[0]).toContain("translation:"); expect(vi.getTimerCount()).toBe(0);
});

it("stops waiting immediately on abort and ignores late detector results", async () => {
  let finish!: (value: Awaited<ReturnType<typeof detect>>) => void;
  detect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const result = sameLanguageIndexes({ texts: ["這是測試文字。"], targetLang: "zh-TW" }, controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await rejected;
  finish({ isReliable: true, languages: [{ language: "zh", percentage: 100 }] });
  expect(createProvider).not.toHaveBeenCalled();
});

it("bounds detector concurrency and shares repeated items inside a batch", async () => {
  let active = 0, max = 0;
  detect.mockImplementation(async () => { active++; max=Math.max(max,active); await Promise.resolve(); active--; return { isReliable: true, languages: [{ language: "en", percentage: 100 }] }; });
  await sameLanguageIndexes({ texts: Array.from({ length: 30 }, (_, i) => `English paragraph ${i % 6}`), targetLang: "en" });
  expect(max).toBeLessThanOrEqual(4); expect(detect).toHaveBeenCalledTimes(6);
});

it("keeps the video's early same-language check consistent with the opt-out", async () => {
  vi.mocked(sendRuntimeRequest).mockResolvedValue({ translations: ["Forced result"], cached: 0 });
  expect(await new VideoRequests({ ...settings(), targetLang: "en" }, "en-US").translate(["Original"])).toEqual(["Original"]);
  expect(sendRuntimeRequest).not.toHaveBeenCalled();
  expect(await new VideoRequests({ ...settings(), targetLang: "en", skipSameLanguage: false }, "en-US").translate(["Original"])).toEqual(["Forced result"]);
  expect(sendRuntimeRequest).toHaveBeenCalledOnce();
});
