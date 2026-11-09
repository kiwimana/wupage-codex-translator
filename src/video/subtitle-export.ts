import type { SubtitleCue } from "./subtitles";

export type SubtitleExportMode = "original" | "translation" | "bilingual";
export type SubtitleExportFormat = "srt" | "vtt";
export interface TranslatedSubtitleCue extends SubtitleCue { translation: string }

/** Per-video memory only. Nothing is written until the user downloads a file. */
export class SubtitleArchive {
  private records = new Map<string, TranslatedSubtitleCue>();
  private size = 0;
  private liveKey?: string;
  private serial = 0;
  private context = "";
  setContext(value: string): void { if (this.context !== value) { this.clear(); this.context = value; } }
  clear(): void { this.records.clear(); this.size = 0; this.liveKey = undefined; }
  add(cues: TranslatedSubtitleCue[]): void {
    for (const cue of cues) this.store(`cue:${cue.start}:${cue.end}:${cue.text}`, cue);
  }
  live(source: string, translation: string, time: number): void {
    if (!source || !translation || !Number.isFinite(time) || time < 0) return;
    const previous = this.liveKey ? this.records.get(this.liveKey) : undefined;
    if (previous && (previous.text === source || source.startsWith(previous.text)) && time >= previous.start && time <= previous.end + 1.5) {
      this.store(this.liveKey!, { ...previous, text: source, translation, end: Math.max(previous.end, time + .2) });
    } else {
      this.liveKey = `live:${++this.serial}`;
      this.store(this.liveKey, { start: time, end: time + .5, text: source, translation });
    }
  }
  private store(key: string, cue: TranslatedSubtitleCue): void {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || !cue.text || !cue.translation) return;
    const count = cue.text.length + cue.translation.length;
    if (count > 2 * 1024 * 1024) return;
    const previous = this.records.get(key);
    if (previous) this.size -= previous.text.length + previous.translation.length;
    this.records.delete(key); this.records.set(key, { ...cue }); this.size += count;
    while (this.records.size > 20_000 || this.size > 2 * 1024 * 1024) {
      const first = this.records.keys().next().value!;
      const entry = this.records.get(first)!; this.size -= entry.text.length + entry.translation.length; this.records.delete(first);
    }
  }
  cues(mode: SubtitleExportMode, translationFirst = false): SubtitleCue[] {
    return [...this.records.values()].sort((a, b) => a.start - b.start).map(cue => ({ start: cue.start, end: cue.end,
      text: mode === "original" ? cue.text : mode === "translation" ? cue.translation : translationFirst ? `${cue.translation}\n${cue.text}` : `${cue.text}\n${cue.translation}` }));
  }
}

export function serializeSubtitles(cues: SubtitleCue[], format: SubtitleExportFormat): string {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000), hours = Math.floor(ms / 3600000), minutes = Math.floor(ms / 60000) % 60, rest = Math.floor(ms / 1000) % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}${format === "srt" ? "," : "."}${String(ms % 1000).padStart(3, "0")}`;
  };
  const blocks: string[] = []; let size = 0;
  for (const cue of [...cues].sort((a, b) => a.start - b.start)) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > Number.MAX_SAFE_INTEGER / 1000 || !cue.text.trim()) continue;
    const text = cue.text.replace(/\r/gu, "").replace(/\n\s*\n/gu, "\n").replaceAll("-->", "→").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    size += text.length;
    if (blocks.length >= 20_000 || size > 4 * 1024 * 1024) throw new Error("字幕檔案過大，請改為分段下載。");
    const start = Math.round(cue.start * 1000) / 1000, end = Math.max(Math.round(cue.end * 1000), Math.round(cue.start * 1000) + 1) / 1000;
    blocks.push(`${blocks.length + 1}\n${stamp(start)} --> ${stamp(end)}\n${text}`);
  }
  if (!blocks.length) throw new Error("尚無可下載的字幕。請先開啟 CC；譯文及雙語下載只包含已完成的部分。");
  return (format === "vtt" ? "WEBVTT\n\n" : "") + blocks.join("\n\n") + "\n";
}
