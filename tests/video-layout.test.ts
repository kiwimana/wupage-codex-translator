import { describe, expect, it } from "vitest";
import { subtitleInsets, subtitleMenuPlacement, subtitleReadingArea } from "../src/content/video-layout";
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = box(0, 0, 1200, 900);
const base = { player: box(420, 40, 360, 640), anchor: box(680, 110, 88, 38), viewport, width: 288, contentHeight: 430, shorts: true, fullscreen: false, fallback: true };
describe("responsive subtitle placement", () => {
  it("reserves wrapped Shorts headers, bottom metadata and an inside action rail", () => {
    const p = base.player;
    const result = subtitleInsets(p, true, [box(600, 52, 160, 76)], [box(430, 480, 330, 120)], [box(732, 260, 48, 180)], []);
    expect(result.toolbarTop).toBe(98);expect(result.bottom).toBe(212);expect(result.right).toBeCloseTo(60 / 360 * 100);
  });
  it("ignores full-player wrappers, offscreen controls and action bars outside the video", () => {
    const result = subtitleInsets(base.player, true, [], [base.player], [box(800, 200, 48, 180)], [box(0, 0, 0, 0)]);
    expect(result).toMatchObject({ bottom: 112, left: 5, right: 5 });
  });
  it("keeps long-video subtitles above the native progress/control area", () => {
    expect(subtitleInsets(box(20, 20, 900, 506), false, [], [], [], [box(20, 456, 900, 70)]).bottom).toBe(82);
  });
  it("scales the default safe space for very small players", () => {
    expect(subtitleInsets(box(0, 0, 180, 160), true, [], [], [], []).bottom).toBeCloseTo(51.2);
  });
  it("puts a portrait menu beside the video when there is room", () => {
    const result = subtitleMenuPlacement(base);expect(result.side).toBe("right");expect(result.left).toBe(792);expect(result.top).toBe(110);
  });
  it("uses the left side when the right side is too narrow", () => {
    const result = subtitleMenuPlacement({ ...base, player: box(900, 40, 280, 640) });expect(result.side).toBe("left");expect(result.left).toBe(600);
  });
  it("places the outside menu beyond native Shorts actions rather than on top of them", () => {
    const rail = box(792, 260, 48, 180), result = subtitleMenuPlacement({ ...base, avoid: [rail] });
    expect(result.side).toBe("right");expect(result.left).toBe(852);
  });
  it("switches sides when the native actions leave insufficient room on the right", () => {
    const rail = box(792, 260, 48, 180), result = subtitleMenuPlacement({ ...base, viewport: box(0, 0, 1100, 900), avoid: [rail] });
    expect(result.side).toBe("left");expect(result.left + result.width).toBeLessThan(base.player.left);
  });
  it("also frees a small long-video player instead of covering it with settings", () => {
    expect(subtitleMenuPlacement({ ...base, player: box(20, 20, 500, 280), shorts: false, fallback: false }).side).toBe("right");
  });
  it("keeps fullscreen menus inside and aligns long-video menus with the player edge", () => {
    const result = subtitleMenuPlacement({ ...base, player: viewport, shorts: false, fullscreen: true, fallback: false, anchor: box(1000, 850, 44, 40) });
    expect(result.side).toBe("inside");expect(result.left).toBe(900);expect(result.top + result.height).toBeLessThan(850);
  });
  it("fits the visible viewport, including a zoomed or keyboard-offset viewport", () => {
    const visible = box(70, 130, 320, 240), result = subtitleMenuPlacement({ ...base, viewport: visible, fullscreen: true });
    expect(result.left).toBeGreaterThanOrEqual(82);expect(result.top).toBeGreaterThanOrEqual(142);
    expect(result.left + result.width).toBeLessThanOrEqual(378);expect(result.top + result.height).toBeLessThanOrEqual(358);
  });
  it("does not force a 120px panel beyond an unusually short viewport", () => {
    const result = subtitleMenuPlacement({ ...base, viewport: box(0, 0, 320, 100), fullscreen: true });expect(result.maxHeight).toBe(76);expect(result.top + result.height).toBeLessThanOrEqual(88);
  });
  it("scrolls a narrow Shorts menu above the current subtitle reading area", () => {
    const result = subtitleMenuPlacement({ ...base, player: box(35, 24, 360, 640), viewport: box(0, 0, 430, 760), anchor: box(295, 90, 88, 38), caption: box(60, 440, 290, 112) });
    expect(result.side).toBe("inside");expect(result.top + result.height).toBeLessThanOrEqual(428);expect(result.height).toBeGreaterThanOrEqual(140);
  });
  it("keeps captions centered when the menu is outside or does not overlap", () => {
    const p = box(20, 20, 900, 506), caption = box(300, 410, 330, 70);
    expect(subtitleReadingArea(p, box(940, 30, 288, 430), caption)).toEqual({ center: 50, width: 90 });
    expect(subtitleReadingArea(p, box(600, 30, 288, 200), caption)).toEqual({ center: 50, width: 90 });
  });
  it("moves captions into the free side of an overlapping menu, respecting the action rail", () => {
    const p = box(20, 20, 900, 506), result = subtitleReadingArea(p, box(620, 40, 288, 430), box(65, 390, 810, 85));
    expect(result.center).toBeLessThan(50);expect(p.left + p.width * (result.center + result.width / 2) / 100).toBeLessThanOrEqual(608.001);
    expect(subtitleReadingArea(base.player, undefined, box(440, 450, 300, 80), 5, 20)).toEqual({ center: 42.5, width: 75 });
  });
});
