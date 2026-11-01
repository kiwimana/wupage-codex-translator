// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerSubtitleController } from "../src/content/video-player";
import { sendRuntimeRequest } from "../src/content/runtime";
import { DEFAULT_SETTINGS } from "../src/shared/defaults";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD: true }));
vi.mock("../src/content/runtime", () => ({ sendRuntimeRequest: vi.fn() }));
const flush = async () => { for (let i=0;i<40;i++) await Promise.resolve(); };
let player: PlayerSubtitleController;
let video: HTMLVideoElement;
let paused: boolean;
let finish: (value: unknown) => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("chrome", { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } });
  document.body.innerHTML = '<div style="position:relative"><video></video></div>';
  video = document.querySelector("video")!; paused = false;
  Object.defineProperty(video, "paused", { configurable:true, get: () => paused });
  Object.defineProperty(video, "textTracks", { configurable:true, value:[{ kind:"captions",language:"en",mode:"showing",cues:[{startTime:0,endTime:5,text:"Hello"}]}] });
  vi.spyOn(video,"pause").mockImplementation(() => { paused=true;video.dispatchEvent(new Event("pause")); });
  vi.spyOn(video,"play").mockImplementation(async () => { paused=false; });
  vi.spyOn(video,"getBoundingClientRect").mockReturnValue(new DOMRect(0,0,640,360));
  vi.spyOn(video.parentElement!,"getBoundingClientRect").mockReturnValue(new DOMRect(0,0,640,360));
  vi.mocked(sendRuntimeRequest).mockImplementation(async request => {
    if (request.type === "GET_SETTINGS") return {...structuredClone(DEFAULT_SETTINGS),videoTranslation:{...DEFAULT_SETTINGS.videoTranslation!,enabled:true},activeProviderId:"google-web-translate"};
    if (request.type === "TRANSLATE_VIDEO_SUBTITLES") return new Promise(resolve => { finish=resolve; });
    return null;
  });
  player=new PlayerSubtitleController(video,video.parentElement!);
});
afterEach(() => { player.dispose();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(sendRuntimeRequest).mockReset();document.body.replaceChildren(); });
describe("AI CC playback buffering", () => {
  it("holds playback until a matching translation arrives and uses the ChatGPT account", async () => {
    await player.start();await flush();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==="TRANSLATE_VIDEO_SUBTITLES"&&r.providerId==="chatgpt-desktop")).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    finish({translations:["你好"],cached:0});await flush();
    expect(video.play).toHaveBeenCalledOnce();
    expect(player.view.root.querySelector(".translation span")!.textContent).toBe("你好");
  });
  it("keeps a video paused when the user had already paused it", async () => {
    paused=true;await player.start();await flush();
    finish({translations:["你好"],cached:0});await flush();
    expect(video.pause).not.toHaveBeenCalled();expect(video.play).not.toHaveBeenCalled();
  });
  it("stopping cancels the pending session and ignores its late response", async () => {
    await player.start();await flush();player.stop();
    expect(video.play).toHaveBeenCalledOnce();
    finish({translations:["你好"],cached:0});await flush();
    expect(player.enabled).toBe(false);
    expect(player.view.root.querySelector(".translation span")!.textContent).toBe("");
    expect(video.play).toHaveBeenCalledOnce();
  });
});
