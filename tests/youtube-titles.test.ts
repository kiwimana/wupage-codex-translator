// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTranslations, collectAdditionalTextSegments, collectTextSegments,
  invalidateStaleSegments, renderTranslationPlaceholders, renderTranslations,
  setTranslationDisplayMode } from "../src/content/dom";

describe("YouTube bilingual titles", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      display: "inline", visibility: "visible", opacity: "1", whiteSpace: "nowrap",
      overflow: "hidden", overflowX: "hidden", textOverflow: "ellipsis"
    } as CSSStyleDeclaration);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 300, height: 20, top: 0, left: 0, right: 300, bottom: 20,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect);
  });
  afterEach(() => { clearTranslations(); vi.restoreAllMocks(); document.body.innerHTML = ""; });

  it.each([
    '<ytd-watch-metadata><h1><yt-formatted-string>Great Video</yt-formatted-string></h1></ytd-watch-metadata>',
    '<yt-lockup-view-model><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=other"><span>Great Video</span></a></h3></yt-lockup-view-model>',
    '<ytd-watch-metadata><h1><yt-formatted-string>Great <b>Video</b></yt-formatted-string></h1></ytd-watch-metadata>',
    '<ytd-video-primary-info-renderer><h1><yt-formatted-string>Great <b>Video</b></yt-formatted-string></h1></ytd-video-primary-info-renderer>',
    '<ytd-compact-video-renderer><a href="/watch?v=other"><h3><yt-formatted-string id="video-title">Great <b>Video</b></yt-formatted-string></h3></a></ytd-compact-video-renderer>',
    '<ytd-video-renderer><a id="video-title" href="/watch?v=other">Great <b>Video</b></a></ytd-video-renderer>',
    '<yt-lockup-view-model><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=other"><span>Great <b>Video</b></span></a></h3></yt-lockup-view-model>'
  ])("keeps one block translation inside the original title and restores it: %s", html => {
    document.body.innerHTML = html;
    const original = document.body.innerHTML;
    const [segment, ...rest] = collectTextSegments();
    expect(rest).toEqual([]);
    expect(segment.text).toBe("Great Video");
    renderTranslationPlaceholders([segment]);
    expect(document.querySelector(".wupage-translation")?.getAttribute("data-wupage-mode")).toBe("block");
    renderTranslations([{ id: segment.id, text: "精彩影片" }]);
    for (const mode of ["bilingual", "bilingual-accent", "replace", "bilingual"] as const) {
      setTranslationDisplayMode(mode);
      const result = document.querySelector<HTMLElement>(".wupage-translation")!;
      expect(result.parentElement).toBe(segment.element);
      expect(result.dataset.wupageMode).toBe("block");
      // Replacement results are appended without an active layout marker.
      if (mode !== "replace") expect(result.dataset.wupageContainer).toBe("youtube-title");
      expect(document.querySelectorAll(".wupage-translation")).toHaveLength(1);
      expect(collectAdditionalTextSegments(segment.element)).toEqual([]);
      expect(invalidateStaleSegments()).toEqual([]);
    }
    clearTranslations();
    expect(document.body.innerHTML).toBe(original);
  });

  it("recollects a title changed during YouTube navigation without duplicating results", () => {
    document.body.innerHTML = '<ytd-watch-metadata><h1><yt-formatted-string>First video</yt-formatted-string></h1></ytd-watch-metadata>';
    const [first] = collectTextSegments();
    renderTranslations([{ id: first.id, text: "第一支影片" }]);
    document.querySelector("yt-formatted-string")!.textContent = "Next video";
    expect(invalidateStaleSegments()).toContain(first.id);
    const [next] = collectAdditionalTextSegments(document.body);
    expect(next.text).toBe("Next video");
    renderTranslations([{ id: next.id, text: "下一支影片" }]);
    expect(document.querySelectorAll(".wupage-translation")).toHaveLength(1);
    expect(document.querySelector(".wupage-translation")!.textContent).toBe("下一支影片");
  });
});
