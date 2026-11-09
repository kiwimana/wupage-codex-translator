import { sameVideoLanguage } from "../shared/video";
import type { PageSubtitleCatalogue, PageSubtitleTrack } from "./site-cues";
import type { SubtitleCue, SubtitlePlayback } from "./subtitles";
import type { TranslatedSubtitleCue } from "./subtitle-export";

/** Preserve the player's language; human preference never silently switches it. */
export function originalSubtitleTrack(catalogue: PageSubtitleCatalogue, preferred: string, preferHuman: boolean): PageSubtitleTrack | undefined {
  const tracks = catalogue.tracks;
  const selected = tracks.find(track => track.id === catalogue.selected)
    ?? tracks.find(track => preferred !== "auto" && sameVideoLanguage(track.language, preferred))
    ?? tracks.find(track => sameVideoLanguage(track.language, "en") && track.automatic === false)
    ?? tracks.find(track => sameVideoLanguage(track.language, "en")) ?? tracks[0];
  return selected && preferHuman ? tracks.find(track => track.automatic === false && sameVideoLanguage(track.language, selected.language)) ?? selected : selected;
}

export function humanTargetTrack(catalogue: PageSubtitleCatalogue, language: string): PageSubtitleTrack | undefined {
  return catalogue.tracks.find(track => track.automatic === false && sameVideoLanguage(track.language, language));
}

// Deliberately recognize known effects, rather than deleting every parenthesis.
const EFFECT = /^(?:(?:(?:soft|quiet|loud|dramatic|upbeat|sad|background|instrumental|ominous)\s+)*(?:music(?:\s+playing)?|applause|clapping|laugh(?:ter|s|ing)?|chuckl(?:e|es|ing)|sigh(?:s|ing)?|gasp(?:s|ing)?|sob(?:s|bing)?|crying|cough(?:s|ing)?|scream(?:s|ing)?|cheering|silence|inaudible|thunder|wind|birds?\s+(?:singing|chirping)|dogs?\s+barking|phone\s+ringing|door\s+(?:creaks?|slams?)|sound\s+of\s+thunder)|(?:背景)?(?:音樂|音乐|配樂|配乐|掌聲|掌声|笑聲|笑声|大笑|嘆氣|叹气|雷聲|雷声|風聲|风声|鳥叫|鸟叫|狗吠|電話鈴聲|电话铃声|聽不清|听不清)|音楽|拍手|笑い|ため息|musique|applaudissements|rires|música|aplausos|risas|musik|applaus|gelächter|음악|박수|웃음|[♪♫♬\s]+)[.!…]*$/iu;

export function dialogueText(value: string): string {
  return value.replace(/\[([^\[\]\n]{1,160})\]|\(([^()\n]{1,160})\)|【([^【】\n]{1,160})】|（([^（）\n]{1,160})）/gu,
    (whole, ...parts: unknown[]) => EFFECT.test(String(parts.slice(0, 4).find(part => typeof part === "string") ?? "").trim()) ? " " : whole)
    .replace(/[♪♫♬]/gu, "").split("\n").map(line => line.replace(/[\t ]+/gu, " ").trim()).filter(Boolean).join("\n").trim();
}

function sentences(value: string): string[] {
  const result: string[] = []; let start = 0;
  for (const match of value.matchAll(/[.!?]+["'”’)]*(?=\s+\S|$)/gu)) {
    const end = match.index! + match[0].length;
    const prefix = value.slice(0, end);
    if (match[0] === "." && /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|a\.m|p\.m)|\b[A-Z]|\b(?:[A-Za-z]\.)+[A-Za-z])\.$/iu.test(prefix)) continue;
    result.push(value.slice(start, end).trim()); start = end;
  }
  if (value.slice(start).trim()) result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function readableParts(text: string, limit: number): string[] {
  const result: string[] = []; let current = ""; let count = 0;
  for (const word of text.split(/\s+/u)) {
    if (current && (current.length + word.length + 1 > limit || count >= 28)) { result.push(current); current = ""; count = 0; }
    current += `${current ? " " : ""}${word}`; count++;
  }
  if (current) result.push(current);
  return result;
}

export interface SubtitleProcessing { dialogueOnly: boolean; optimize: boolean; automatic: boolean; language: string }

/** One pass per changed cue list, never on every playback tick. No model calls. */
export function prepareSubtitleCues(input: SubtitleCue[], options: SubtitleProcessing): SubtitleCue[] {
  const filtered = options.dialogueOnly ? input.map(cue => ({ ...cue, text: dialogueText(cue.text) })).filter(cue => cue.text) : input;
  if (!options.optimize || !options.automatic || !/^en(?:-|$)/iu.test(options.language)) return filtered;
  const merged: SubtitleCue[] = [];
  for (const cue of filtered) {
    const previous = merged.at(-1);
    const continuing = previous && !/[.!?…]["'”’)]*$/u.test(previous.text) && !/^\s*(?:[-–—]|[A-Z][A-Z\s]{1,24}:)/u.test(cue.text)
      && cue.start >= previous.start && cue.start - previous.end <= .35 && Math.max(cue.end, previous.end) - previous.start <= 8;
    let text = cue.text;
    if (continuing) {
      // Cumulative ASR repeats the preceding words. Do not strip isolated words
      // or completed sentences, which may be intentional repeated dialogue.
      text = previous.text.split(/\s+/u).length >= 3 && cue.text.toLowerCase().startsWith(previous.text.toLowerCase() + " ")
        ? cue.text : `${previous.text} ${cue.text}`;
    }
    if (continuing && text.length <= 220) { previous.text = text; previous.end = Math.max(previous.end, cue.end); }
    else merged.push({ ...cue });
  }
  const result: SubtitleCue[] = []; let extra = Math.max(0, 20_000 - merged.length);
  for (const cue of merged) {
    const limit = Math.min(180, Math.max(48, Math.ceil(cue.text.length / Math.max(1, Math.ceil((cue.end - cue.start) / 8)))));
    const parts = sentences(cue.text).flatMap(text => readableParts(text, limit));
    if (parts.length < 2 || parts.length > 64 || cue.end - cue.start < parts.length * .25 || parts.length - 1 > extra) { result.push(cue); continue; }
    extra -= parts.length - 1;
    const total = parts.reduce((sum, text) => sum + text.length, 0); let length = 0;
    for (const text of parts) {
      const start = cue.start + (cue.end - cue.start) * length / total; length += text.length;
      result.push({ start, end: cue.start + (cue.end - cue.start) * length / total, text });
    }
  }
  return result;
}

/** Align independent human/source timings without assuming matching cue counts. */
export function humanSubtitlePairs(source: SubtitleCue[], target: SubtitleCue[]): TranslatedSubtitleCue[] {
  let cursor = 0; let active: SubtitleCue[] = [];
  return target.map(cue => {
    active = active.filter(item => item.end > cue.start);
    while (cursor < source.length && source[cursor].start < cue.end) {
      const item = source[cursor++]; if (item.end > cue.start) active.push(item);
    }
    if (active.length > 128) active = active.slice(-128);
    return { ...cue, text: [...new Set(active.filter(item => item.start < cue.end && item.end > cue.start).slice(0, 8).map(item => item.text))].join("\n"), translation: cue.text };
  });
}

/** A site's human translation is displayed directly, with no AI buffer or job. */
export class HumanSubtitlePlayback implements SubtitlePlayback {
  error = "";
  private time = 0;
  private disposed = false;
  constructor(private source: SubtitleCue[], private target: SubtitleCue[], private changed: () => void) {}
  update(time: number): void { if (!this.disposed) { this.time = time; this.changed(); } }
  current(): { source: string; translation: string } {
    const at = (cues: SubtitleCue[]) => [...new Set(cues.filter(cue => cue.start <= this.time && cue.end > this.time).slice(0, 8).map(cue => cue.text))].join("\n");
    return { source: at(this.source), translation: at(this.target) };
  }
  retry(): void { this.update(this.time); }
  dispose(): void { this.disposed = true; this.source = []; this.target = []; }
}
