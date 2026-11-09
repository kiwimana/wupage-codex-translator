export interface VideoBox { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface CaptionInsets { toolbarTop: number; bottom: number; left: number; right: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
const intersects = (a: VideoBox, b: VideoBox) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
  && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Rectangles are viewport pixels; callers convert distances for CSS transforms. */
export function subtitleInsets(player: VideoBox, shorts: boolean, headers: VideoBox[], metadata: VideoBox[], rails: VideoBox[], controls: VideoBox[]): CaptionInsets {
  const result = { toolbarTop: shorts ? 64 : 14, bottom: Math.min(shorts ? 112 : 64, player.height * .32), left: 5, right: 5 };
  if (player.width <= 0 || player.height <= 0) return result;
  for (const rect of controls) if (intersects(player, rect) && rect.top > player.top + player.height * .6) {
    result.bottom = Math.max(result.bottom, Math.min(player.height * .45, player.bottom - rect.top + 12));
  }
  if (!shorts) return result;
  for (const rect of headers) if (intersects(player, rect) && rect.top < player.top + player.height * .3) {
    result.toolbarTop = Math.max(result.toolbarTop, rect.bottom - player.top + 10);
  }
  result.toolbarTop = clamp(result.toolbarTop, 12, player.height - 52);
  for (const rect of metadata) if (intersects(player, rect) && rect.top >= player.top + player.height * .45) {
    result.bottom = Math.max(result.bottom, Math.min(player.height * .45, player.bottom - rect.top + 12));
  }
  for (const rect of rails) if (intersects(player, rect) && rect.left >= player.left + player.width * .6 && rect.height >= 64) {
    result.right = Math.max(result.right, Math.min(35, (player.right - rect.left + 12) / player.width * 100));
  }
  return result;
}

export function subtitleMenuPlacement(input: {
  player: VideoBox; anchor: VideoBox; viewport: VideoBox; width: number; contentHeight: number;
  shorts: boolean; fullscreen: boolean; fallback: boolean;
  caption?: VideoBox;
  avoid?: VideoBox[];
}): { left: number; top: number; width: number; height: number; maxHeight: number; side: "inside" | "left" | "right" } {
  const { player, anchor, viewport, shorts, fullscreen, fallback } = input;
  const width = Math.min(input.width, Math.max(0, viewport.width - 24));
  let maxHeight = Math.max(0, Math.min(viewport.height - 24, shorts && player.height > 144 ? player.height - 24 : viewport.height - 24));
  let height = Math.min(input.contentHeight, maxHeight);
  let left = anchor.right - width, top = fallback ? anchor.bottom + 8 : anchor.top - height - 10;
  let side: "inside" | "left" | "right" = "inside";
  if (!fullscreen && (shorts || player.width > 0 && player.width < 640)) {
    const y = clamp(anchor.top, viewport.top + 12, viewport.bottom - height - 12);
    const candidate = (x: number): VideoBox => ({ left: x, top: y, width, height, right: x + width, bottom: y + height });
    let rightStart = player.right + 12, leftStart = player.left - width - 12;
    for (const rect of [...(input.avoid ?? [])].sort((a, b) => a.left - b.left)) if (intersects(candidate(rightStart), rect)) rightStart = rect.right + 12;
    for (const rect of [...(input.avoid ?? [])].sort((a, b) => b.right - a.right)) if (intersects(candidate(leftStart), rect)) leftStart = rect.left - width - 12;
    if (rightStart + width <= viewport.right - 12) { left = rightStart; top = y; side = "right"; }
    else if (leftStart >= viewport.left + 12) { left = leftStart; top = y; side = "left"; }
  }
  if (side === "inside" && !fallback && player.width > width) left = Math.min(viewport.right, player.right) - width - 12;
  if (shorts && side === "inside" && input.caption && fallback) {
    const room = input.caption.top - top - 12;
    if (room >= 140) { maxHeight = Math.min(maxHeight, room); height = Math.min(height, maxHeight); }
  }
  return { left: clamp(left, viewport.left + 12, viewport.right - width - 12), top: clamp(top, viewport.top + 12, viewport.bottom - height - 12), width, height, maxHeight, side };
}

/** Move subtitles only when a menu really covers their reading area. */
export function subtitleReadingArea(player: VideoBox, panel: VideoBox | undefined, caption: VideoBox, left = 5, right = 5): { center: number; width: number } {
  const base = { center: (left + 100 - right) / 2, width: 100 - left - right };
  if (player.width <= 0 || !panel || !intersects(panel, caption)) return base;
  const start = player.left + player.width * left / 100, end = player.right - player.width * right / 100;
  const before = Math.max(0, Math.min(end, panel.left - 12) - start);
  const after = Math.max(0, end - Math.max(start, panel.right + 12));
  const available = Math.max(before, after);
  if (available < Math.min(240, (end - start) * .65)) return base;
  const x = before >= after ? start : end - after;
  return { center: (x + available / 2 - player.left) / player.width * 100, width: available / player.width * 100 };
}
