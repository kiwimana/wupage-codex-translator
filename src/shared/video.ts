export type SubtitlePhase = "idle" | "loading" | "active" | "waiting" | "error";
export interface VideoSubtitleState {
  opened: boolean;
  enabled: boolean;
  phase?: SubtitlePhase;
}

export const SUBTITLE_FONT_SIZES = [18, 22, 26, 32, 38, 44] as const;
export type SubtitleFontSize = typeof SUBTITLE_FONT_SIZES[number];
export interface VideoTranslationSettings {
  enabled: boolean;
  showOriginal: boolean;
  fontSize: SubtitleFontSize;
  background: "soft" | "none" | "solid";
  preferredSource: string;
  enabledSites: string[];
  /** Account builds require a fresh per-site opt-in; legacy rules stay manual. */
  accountAutoSites?: string[];
  sourceFontSize?: SubtitleFontSize;
  subtitleOrder?: "original-first" | "translation-first";
  fontFamily?: "system" | "serif" | "monospace";
  fontWeight?: "normal" | "bold";
  sourceColor?: string;
  translationColor?: string;
  backgroundOpacity?: number;
  bottomOffset?: number;
}

/** Playback breaks close size ties without allowing a small autoplay ad to win. */
export function videoPriority(area: number, playing: boolean): number { return area * (playing ? 1.5 : 1); }

export function normalizeVideoTranslation(value: unknown): VideoTranslationSettings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sites = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((site): site is string => typeof site === "string" && /^[\w.-]{1,200}$/u.test(site)))].slice(0, 100) : [];
  return {
    enabled: data.enabled !== false,
    showOriginal: data.showOriginal !== false,
    fontSize: SUBTITLE_FONT_SIZES.includes(data.fontSize as SubtitleFontSize) ? data.fontSize as SubtitleFontSize : 22,
    background: data.background === "none" || data.background === "solid" ? data.background : "soft",
    preferredSource: typeof data.preferredSource === "string" && /^[\w-]{1,32}$/u.test(data.preferredSource) ? data.preferredSource : "auto",
    enabledSites: sites(data.enabledSites),
    ...(Array.isArray(data.accountAutoSites) ? { accountAutoSites: sites(data.accountAutoSites) } : {}),
    ...(SUBTITLE_FONT_SIZES.includes(data.sourceFontSize as SubtitleFontSize) ? { sourceFontSize: data.sourceFontSize as SubtitleFontSize } : {}),
    ...(data.subtitleOrder === "original-first" || data.subtitleOrder === "translation-first" ? { subtitleOrder: data.subtitleOrder } : {}),
    ...(data.fontFamily === "system" || data.fontFamily === "serif" || data.fontFamily === "monospace" ? { fontFamily: data.fontFamily } : {}),
    ...(data.fontWeight === "normal" || data.fontWeight === "bold" ? { fontWeight: data.fontWeight } : {}),
    ...(typeof data.sourceColor === "string" && /^#[\da-f]{6}$/iu.test(data.sourceColor) ? { sourceColor: data.sourceColor } : {}),
    ...(typeof data.translationColor === "string" && /^#[\da-f]{6}$/iu.test(data.translationColor) ? { translationColor: data.translationColor } : {}),
    ...(typeof data.backgroundOpacity === "number" && Number.isFinite(data.backgroundOpacity) ? { backgroundOpacity: Math.round(Math.min(100, Math.max(0, data.backgroundOpacity))) } : {}),
    ...(typeof data.bottomOffset === "number" && Number.isFinite(data.bottomOffset) ? { bottomOffset: Math.round(Math.min(40, Math.max(0, data.bottomOffset))) } : {})
  };
}

export function sameVideoLanguage(a: string, b: string): boolean {
  const family = (value: string) => {
    const normalized = value.toLowerCase().replaceAll("_", "-");
    if (/^zh(?:-(?:tw|hk|mo|hant))/.test(normalized)) return "zh-Hant";
    if (/^zh(?:-|$)/.test(normalized)) return "zh-Hans";
    return normalized.split("-")[0];
  };
  return a !== "auto" && b !== "auto" && family(a) === family(b);
}
