import { describe, expect, it } from "vitest";
import { localizeUiSource } from "../build/traditional-ui";

describe("Traditional Chinese UI build boundaries", () => {
  it("localizes static and interpolated UI while keeping language codes and recognition patterns", () => {
    const input = 'const code="zh-CN"; const status=`正在加载第 ${page} 页，缓存命中`; const source=/设置|简体中文/;';
    const output = localizeUiSource(input, "/src/pdf/index.ts");
    expect(output).toContain('code="zh-CN"');
    expect(output).toContain('`正在載入第 ${page} 頁，快取命中`');
    expect(output).toContain('/设置|简体中文/');
  });
  it("preserves host selectors and migration comparisons instead of changing their matching behavior", () => {
    const selector = 'document.querySelector("[title=设置]"); button.title="设置";';
    expect(localizeUiSource(selector, "/src/content/video-player.ts"))
      .toBe('document.querySelector("[title=设置]"); button.title="設定";');
    const migration = 'if (provider.label === "Microsoft 翻译") provider.label = defaults.label;';
    expect(localizeUiSource(migration, "/src/shared/settings.ts")).toBe(migration);
  });
  it("changes only model display labels and keeps model identifiers, hashes and URLs intact", () => {
    const input = JSON.stringify([{ id: "en-zh-Hans", label: "英语 → 简体中文", sha256: "abc", url: "https://example.com/zh-CN" }]);
    expect(JSON.parse(localizeUiSource(input, "/src/local/catalog.json")))
      .toEqual([{ id: "en-zh-Hans", label: "英語 → 簡體中文", sha256: "abc", url: "https://example.com/zh-CN" }]);
  });
});
