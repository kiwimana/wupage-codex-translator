import { describe, expect, it } from "vitest";
import { dialogueText, humanSubtitlePairs, humanTargetTrack, HumanSubtitlePlayback, originalSubtitleTrack, prepareSubtitleCues } from "../src/video/subtitle-policies";
import { normalizeVideoTranslation } from "../src/shared/video";

const automatic = { dialogueOnly: false, optimize: true, automatic: true, language: "en-US" };
describe("free subtitle processing", () => {
  it("prefers a human source in the player's language without switching French to English", () => {
    const catalogue = { key: "video", selected: "fr-asr", tracks: [
      { id: "en", label: "English", language: "en", automatic: false },
      { id: "fr-asr", label: "French auto", language: "fr-FR", automatic: true },
      { id: "fr", label: "French", language: "fr", automatic: false }
    ] };
    expect(originalSubtitleTrack(catalogue, "en", true)?.id).toBe("fr");
    expect(originalSubtitleTrack(catalogue, "en", false)?.id).toBe("fr-asr");
    expect(originalSubtitleTrack({ ...catalogue, selected: undefined }, "en", true)?.id).toBe("en");
  });
  it("only trusts explicit human metadata, keeping Traditional and Simplified Chinese distinct", () => {
    const catalogue = { key: "video", tracks: [
      { id: "unknown", label: "Traditional", language: "zh-TW" },
      { id: "auto", label: "Traditional", language: "zh-TW", automatic: true },
      { id: "simplified", label: "Chinese", language: "zh-CN", automatic: false },
      { id: "human", label: "Traditional", language: "zh-Hant", automatic: false }
    ] };
    expect(humanTargetTrack(catalogue, "zh-TW")?.id).toBe("human");
    expect(humanTargetTrack({ ...catalogue, tracks: catalogue.tracks.slice(0, 3) }, "zh-TW")).toBeUndefined();
  });
  it.each([
    ["[Music] (applause)", ""], ["【音樂】（掌聲）你好。", "你好。"],
    ["[birds chirping] Hello (laughs)", "Hello"], ["♪ Sing these words ♫", "Sing these words"],
    ["(I think so) [Don't go] ALICE: Hello!", "(I think so) [Don't go] ALICE: Hello!"],
    ["The word music is spoken here.", "The word music is spoken here."],
    ["[unknown effect] Hello", "[unknown effect] Hello"], ["[MUSIQUE] Bonjour", "Bonjour"]
  ])("filters known sound annotations conservatively: %s", (source, expected) => expect(dialogueText(source)).toBe(expected));
  it("joins bounded English ASR fragments, removes cumulative repeats and leaves input unchanged", () => {
    const cues = [{ start: 0, end: 1, text: "we are going" }, { start: 1, end: 3, text: "we are going home." }, { start: 5, end: 7, text: "A different sentence." }];
    expect(prepareSubtitleCues(cues, automatic)).toEqual([{ start: 0, end: 3, text: "we are going home." }, cues[2]]);
    expect(cues[0].text).toBe("we are going");
    expect(prepareSubtitleCues(cues, { ...automatic, automatic: false })).toBe(cues);
    expect(prepareSubtitleCues(cues, { ...automatic, optimize: false })).toBe(cues);
    expect(prepareSubtitleCues(cues, { ...automatic, language: "fr" })).toBe(cues);
  });
  it("does not merge speaker changes, long gaps or completed repeated dialogue", () => {
    const cues = [{ start: 0, end: 2, text: "Yes. Yes." }, { start: 3, end: 4, text: "hello there" }, { start: 4, end: 5, text: "BOB: Goodbye." }, { start: 10, end: 11, text: "Later" }];
    const result = prepareSubtitleCues(cues, automatic);
    expect(result.slice(0, 2).map(cue => cue.text)).toEqual(["Yes.", "Yes."]);
    expect(result.some(cue => cue.text === "hello there")).toBe(true);expect(result.some(cue => cue.text === "BOB: Goodbye.")).toBe(true);
    expect(result.at(-1)).toEqual(cues.at(-1));
  });
  it("splits at sentence boundaries without splitting abbreviations and preserves the original interval", () => {
    const result = prepareSubtitleCues([{ start: 10, end: 16, text: "Dr. Jones paid 3.14 dollars. It worked!" }], automatic);
    expect(result.map(cue => cue.text)).toEqual(["Dr. Jones paid 3.14 dollars.", "It worked!"]);
    expect(result[0].start).toBe(10);expect(result.at(-1)!.end).toBe(16);expect(result[0].end).toBe(result[1].start);
    expect(result.every(cue => cue.end > cue.start)).toBe(true);
  });
  it("filters dialogue even with optimization off and bounds expanded cue counts", () => {
    expect(prepareSubtitleCues([{ start: 0, end: 3, text: "[Music]" }], { ...automatic, optimize: false, dialogueOnly: true })).toEqual([]);
    const cues = Array.from({ length: 20_000 }, (_, i) => ({ start: i * 10, end: i * 10 + 2, text: "Hello. Goodbye." }));
    expect(prepareSubtitleCues(cues, automatic)).toHaveLength(20_000);
  });
  it("breaks long unpunctuated ASR into readable timed phrases without inventing words", () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const result = prepareSubtitleCues([{ start: 0, end: 40, text }], automatic);
    expect(result.length).toBeGreaterThan(1);expect(result.map(cue => cue.text).join(" ")).toBe(text);
    expect(result[0].start).toBe(0);expect(result.at(-1)!.end).toBe(40);expect(result.every(cue => cue.text.length <= 180 && cue.end > cue.start)).toBe(true);
  });
  it("pairs different source/target timing for downloads and plays human translations without an AI buffer", () => {
    const source = [{ start: 0, end: 2, text: "Hello" }, { start: 2, end: 4, text: "Welcome" }];
    const target = [{ start: 0, end: 4, text: "你好，歡迎。" }, { start: 6, end: 8, text: "再見。" }];
    expect(humanSubtitlePairs(source, target)).toEqual([{ start: 0, end: 4, text: "Hello\nWelcome", translation: "你好，歡迎。" }, { start: 6, end: 8, text: "", translation: "再見。" }]);
    const playback = new HumanSubtitlePlayback(source, target, () => {});playback.update(3);
    expect(playback.current()).toEqual({ source: "Welcome", translation: "你好，歡迎。" });playback.update(5);expect(playback.current()).toEqual({ source: "", translation: "" });
    playback.dispose();expect(playback.current()).toEqual({ source: "", translation: "" });
  });
  it("only accepts boolean processing preferences", () => {
    expect(normalizeVideoTranslation({ preferHumanSubtitles: false, optimizeSentences: false, dialogueOnly: true })).toMatchObject({ preferHumanSubtitles: false, optimizeSentences: false, dialogueOnly: true });
    expect(normalizeVideoTranslation({ preferHumanSubtitles: "true", dialogueOnly: 1 })).not.toHaveProperty("preferHumanSubtitles");
  });
});
