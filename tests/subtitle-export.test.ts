import { describe, expect, it } from "vitest";
import { SubtitleArchive, serializeSubtitles } from "../src/video/subtitle-export";
import { parseSubtitles } from "../src/video/subtitles";
import { normalizeVideoTranslation } from "../src/shared/video";

describe("subtitle downloads", () => {
  it.each(["srt", "vtt"] as const)("round-trips bilingual Unicode, timestamps and literal markup in %s", format => {
    const cues = [{ start: 3661.234, end: 3665.678, text: "Fish & chips <3\n繁體中文" }];
    const text = serializeSubtitles(cues, format);
    expect(text).toContain(format === "srt" ? "01:01:01,234 --> 01:01:05,678" : "01:01:01.234 --> 01:01:05.678");
    expect(parseSubtitles(text)).toEqual(cues);
  });
  it("exports only completed translations, keeps repeated phrases at their own times and clears another video's data", () => {
    const archive = new SubtitleArchive();archive.setContext("first-video:zh-TW");
    archive.add([{ start: 0, end: 2, text: "Hello", translation: "你好" }, { start: 8, end: 10, text: "Hello", translation: "你好" }]);
    expect(archive.cues("bilingual")).toEqual([{ start: 0, end: 2, text: "Hello\n你好" }, { start: 8, end: 10, text: "Hello\n你好" }]);
    expect(archive.cues("original")[0].text).toBe("Hello");expect(archive.cues("translation")[0].text).toBe("你好");
    archive.setContext("first-video:zh-TW");expect(archive.cues("translation")).toHaveLength(2);
    archive.setContext("first-video:ja");expect(archive.cues("translation")).toEqual([]);
    archive.add([{start:1,end:2,text:"a",translation:"甲"}]);archive.clear();expect(archive.cues("bilingual")).toEqual([]);
  });
  it("keeps a bounded in-memory archive and estimates continuous live subtitle timing", () => {
    const archive=new SubtitleArchive();archive.live("A sentence", "一句話", 1);archive.live("A sentence", "一句話", 2);
    expect(archive.cues("bilingual")).toHaveLength(1);expect(archive.cues("bilingual")[0]).toMatchObject({start:1,end:2.2});
    archive.live("Something else", "另一句", 6);expect(archive.cues("bilingual")).toHaveLength(2);
    const text="x".repeat(60_000);for(let i=0;i<50;i++)archive.add([{start:100+i,end:101+i,text,translation:text}]);
    expect(archive.cues("translation").length).toBeLessThan(20);
  });
  it("rejects empty output and ignores invalid cue timing", () => {
    expect(()=>serializeSubtitles([],"srt")).toThrow(/尚無可下載/);
    expect(()=>serializeSubtitles([{start:NaN,end:1,text:"x"}],"vtt")).toThrow(/尚無可下載/);
    expect(serializeSubtitles([{start:0,end:.0001,text:"a\n\n1 --> 9"}],"srt")).toContain("00:00:00,000 --> 00:00:00,001");
  });
  it("keeps simultaneous speakers and follows the chosen bilingual order", () => {
    const archive=new SubtitleArchive();archive.add([{start:0,end:3,text:"Hello",translation:"你好"},{start:0,end:3,text:"Welcome",translation:"歡迎"}]);
    expect(archive.cues("bilingual")).toHaveLength(2);expect(archive.cues("bilingual",true)[0].text).toBe("你好\nHello");
  });
});
it("validates appearance choices and clamps sliders without accepting CSS injection", () => {
  expect(normalizeVideoTranslation({fontSize:44,sourceFontSize:32,background:"solid",backgroundOpacity:999,bottomOffset:-3,sourceColor:"#aabbcc",fontFamily:"monospace",subtitleOrder:"translation-first"}))
    .toMatchObject({fontSize:44,sourceFontSize:32,background:"solid",backgroundOpacity:100,bottomOffset:0,sourceColor:"#aabbcc",fontFamily:"monospace",subtitleOrder:"translation-first"});
  const invalid=normalizeVideoTranslation({sourceColor:"url(https://invalid.example)",translationColor:"red;display:none",sourceFontSize:999,fontFamily:"url(x)",backgroundOpacity:NaN});
  expect(invalid.sourceColor).toBeUndefined();expect(invalid.translationColor).toBeUndefined();expect(invalid.sourceFontSize).toBeUndefined();expect(invalid.fontFamily).toBeUndefined();expect(invalid.backgroundOpacity).toBeUndefined();
});
