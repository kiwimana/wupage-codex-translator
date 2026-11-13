import type { TranslateBatchRequest } from "../shared/types";
import { languageIdentity, sameTranslationLanguage } from "../shared/language-identity";
import characters from "../shared/chinese-script-data.json";

const hans = new Set(characters.hans), hant = new Set(characters.hant);
const MAX_SAMPLE = 12000;
const TIMEOUT_MS = 1200;

/** Remove opaque page/PDF placeholders from evidence, without touching returned text. */
function languageSample(text: string): string {
  return text.replace(/[⟪《〈<【\[{«「『]+\s*WUPAGE[^\n]*?[⟫》〉>】\]}»」』]+/giu, " ")
    .replace(/https?:\/\/\S+/giu, " ").trim();
}

function compatibleScript(text: string, language: string, script: string): boolean {
  if (language === "zh") {
    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(text)) return false;
    // Leave meaningful English fragments available for translation, even when
    // a Chinese majority made the detector report Chinese for the paragraph.
    if (/[a-z]{3,}/u.test(text)) return false;
    if (script !== "Hans" && script !== "Hant") return false;
    const other = script === "Hant" ? hans : hant;
    return /\p{Script=Han}/u.test(text) && ![...text].some(character => other.has(character));
  }
  const scripts = ["Han", "Hiragana", "Katakana", "Hangul", "Cyrillic", "Arabic", "Devanagari", "Greek", "Hebrew", "Thai", "Latin"];
  const allowed = script === "Jpan" ? ["Han", "Hiragana", "Katakana", "Latin"] : script === "Kore" ? ["Hangul", "Han", "Latin"]
    : [({ Latn: "Latin", Cyrl: "Cyrillic", Arab: "Arabic", Deva: "Devanagari", Grek: "Greek", Hebr: "Hebrew", Thai: "Thai" } as Record<string, string>)[script]];
  return scripts.every(candidate => allowed.includes(candidate) || !new RegExp(`\\p{Script=${candidate}}`, "u").test(text));
}

async function detectedSameLanguage(text: string, target: string, signal?: AbortSignal): Promise<boolean> {
  const sample = languageSample(text);
  // A truncated sample must not hide foreign text later in the same segment.
  if (sample.length > MAX_SAMPLE || !/\p{L}/u.test(sample) || typeof chrome === "undefined" || !chrome.i18n?.detectLanguage) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const result = await Promise.race([
      chrome.i18n.detectLanguage(sample),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), TIMEOUT_MS); }),
      ...(signal ? [new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      })] : [])
    ]);
    signal?.throwIfAborted();
    if (!result?.isReliable) return false;
    const candidates = [...result.languages].sort((a, b) => b.percentage - a.percentage);
    const best = candidates[0], identity = languageIdentity(best?.language), destination = languageIdentity(target);
    if (!best || !Number.isFinite(best.percentage) || best.percentage < 90 || !identity || !destination || identity.language !== destination.language) return false;
    if (identity.language === "zh") {
      if (identity.script && identity.script !== destination.script) return false;
    } else if (!sameTranslationLanguage(best.language, target)) return false;
    return compatibleScript(sample, destination.language, destination.script);
  } catch (error) {
    signal?.throwIfAborted();
    // Missing, unreliable or failed detection never prevents ordinary translation.
    return false;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

/** Per-item checks preserve mixed-language batches and their original order. */
export async function sameLanguageIndexes(request: TranslateBatchRequest, signal?: AbortSignal): Promise<number[]> {
  signal?.throwIfAborted();
  if (request.sourceLang && request.sourceLang !== "auto") {
    if (sameTranslationLanguage(request.sourceLang, request.targetLang)) return request.texts.map((_text, index) => index);
    const source = languageIdentity(request.sourceLang), target = languageIdentity(request.targetLang);
    // Some CC tracks declare Chinese without a script. Use their actual text
    // rather than assuming every bare zh track is Simplified.
    if (source?.language === "zh" && !source.script && target?.language === "zh") {
      return request.texts.flatMap((text, index) => compatibleScript(languageSample(text), "zh", target.script) ? [index] : []);
    }
    return [];
  }
  const skipped: number[] = [];
  const memo = new Map<string, Promise<boolean>>();
  const deadline = Date.now() + 1600;
  let cursor = 0;
  const worker = async () => {
    while (cursor < request.texts.length) {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) return;
      const index = cursor++, text = request.texts[index];
      let result = memo.get(text);
      if (!result) { result = detectedSameLanguage(text, request.targetLang, signal); memo.set(text, result); }
      if (await result) skipped.push(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, request.texts.length) }, worker));
  signal?.throwIfAborted();
  return skipped.sort((a, b) => a - b);
}
