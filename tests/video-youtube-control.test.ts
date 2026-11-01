// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayerSubtitleController } from "../src/content/video-player";
import { initVideoSubtitles, VideoSubtitleManager } from "../src/content/video-subtitles";
import { sendRuntimeRequest } from "../src/content/runtime";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/shared/defaults";
import { VIDEO_PLATFORMS } from "../src/video/platforms";
import type { ExtensionSettings } from "../src/shared/types";
import { YouTubeAiControl } from "../src/content/youtube-ai-control";
vi.mock("../src/shared/chatgpt-build", () => ({ CHATGPT_BUILD: true }));
vi.mock("../src/content/runtime", () => ({ sendRuntimeRequest: vi.fn() }));
vi.mock("../src/video/bridge-client", () => ({ pageSubtitleCatalogue: vi.fn(async()=>undefined), loadPageSubtitles: vi.fn() }));
let player: PlayerSubtitleController;
let settings: ExtensionSettings;
let video: HTMLVideoElement;
let english: TextTrack;
let french: TextTrack;
type SettingsListener=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>void;
const changed=new Set<SettingsListener>();
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const button=()=>document.querySelector<HTMLButtonElement>('.ytp-right-controls .wupage-ai-cc-button')!;
beforeEach(async()=>{
  vi.useFakeTimers();settings={...structuredClone(DEFAULT_SETTINGS),targetLang:'ja'};
  vi.stubGlobal('location',new URL('https://www.youtube.com/watch?v=fixture'));
  vi.stubGlobal('chrome',{storage:{onChanged:{addListener:(fn:SettingsListener)=>changed.add(fn),removeListener:(fn:SettingsListener)=>changed.delete(fn)}}});
  document.body.innerHTML='<div id="movie_player" style="position:relative"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="true">CC</button><button class="ytp-settings-button">Settings</button><button class="ytp-fullscreen-button">Fullscreen</button></div></div>';
  video=document.querySelector('video')!;
  english={kind:'captions',label:'English',language:'en',mode:'showing',cues:[{startTime:0,endTime:60,text:'Welcome to this video.'}]} as unknown as TextTrack;
  french={kind:'captions',label:'French',language:'fr',mode:'disabled',cues:[{startTime:0,endTime:60,text:'Bienvenue dans cette vidéo.'}]} as unknown as TextTrack;
  Object.defineProperty(video,'textTracks',{configurable:true,value:[english,french]});
  vi.spyOn(video,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,900,506));
  vi.spyOn(video.parentElement!,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,900,506));
  vi.mocked(sendRuntimeRequest).mockImplementation(async request=>{
    if(request.type==='GET_SETTINGS')return structuredClone(settings);
    if(request.type==='SAVE_SETTINGS'){settings=structuredClone(request.settings);return null;}
    if(request.type==='TRANSLATE_VIDEO_SUBTITLES')return {translations:request.texts.map(()=>request.targetLang==='de'?'Deutsche Untertitel':'日本語の字幕'),cached:0};
    return null;
  });
  player=new PlayerSubtitleController(video,video.parentElement!,VIDEO_PLATFORMS[0]);await flush();
});
afterEach(()=>{
  player.dispose();window.dispatchEvent(new Event('pagehide'));changed.clear();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(sendRuntimeRequest).mockReset();document.body.replaceChildren();
});
it('shows one idle button before the gear and starts no translation on discovery',()=>{
  expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  expect(button().nextElementSibling?.className).toBe('ytp-settings-button');
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES')).toBe(false);
});
it('enables CC directly and translates English to the saved target, then stops',async()=>{
  const playerClick=vi.fn();video.parentElement!.addEventListener('click',playerClick);
  button().click();await flush();
  expect(settings.videoTranslation).toMatchObject({enabled:true,showOriginal:true,enabledSites:[]});
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES'&&r.sourceLang==='en'&&r.targetLang==='ja'&&r.providerId==='chatgpt-desktop')).toBe(true);
  expect(player.view.root.querySelector('.source span')!.textContent).toBe('Welcome to this video.');
  expect(player.view.root.querySelector('.translation span')!.textContent).toBe('日本語の字幕');
  expect(button().getAttribute('aria-pressed')).toBe('true');expect(playerClick).not.toHaveBeenCalled();
  button().click();await flush();expect(player.enabled).toBe(false);expect(button().getAttribute('aria-pressed')).toBe('false');
});
it('starts subtitles on HTTP pages where crypto.randomUUID is unavailable',async()=>{
  const getRandomValues=crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto',{getRandomValues});
  button().click();await flush();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES')).toBe(true);
  expect(player.view.root.querySelector('.translation span')!.textContent).toBe('日本語の字幕');
});
it('keeps loading visible through a delayed AI response, then clears it on completion and stop',async()=>{
  let finish!:(value:unknown)=>void;
  const original=vi.mocked(sendRuntimeRequest).getMockImplementation()!;
  vi.mocked(sendRuntimeRequest).mockImplementation(request=>request.type==='TRANSLATE_VIDEO_SUBTITLES'?new Promise(resolve=>{finish=resolve;}):original(request));
  button().click();
  expect(button().getAttribute('aria-busy')).toBe('true');
  await flush();
  expect(player.subtitlePhase).toBe('loading');
  expect(button().getAttribute('aria-busy')).toBe('true');
  expect(player.view.root.querySelector('.toggle')!.getAttribute('aria-busy')).toBe('true');
  finish({translations:['日本語の字幕'],cached:0});await flush();
  expect(button().getAttribute('aria-busy')).toBe('false');
  expect(player.view.root.querySelector('.toggle')!.getAttribute('aria-busy')).toBe('false');
  button().click();await flush();
  expect(player.subtitlePhase).toBe('idle');
  expect(button().getAttribute('aria-busy')).toBe('false');
});
it('follows another CC language and a changed target language',async()=>{
  button().click();await flush();
  english.mode='hidden';french.mode='showing';await vi.advanceTimersByTimeAsync(240);await flush();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES'&&r.sourceLang==='fr'&&r.targetLang==='ja')).toBe(true);
  settings={...settings,targetLang:'de'};changed.forEach(fn=>fn({[SETTINGS_KEY]:{newValue:settings}},'local'));await flush();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES'&&r.sourceLang==='fr'&&r.targetLang==='de')).toBe(true);
  expect(player.view.root.querySelector('.translation span')!.textContent).toBe('Deutsche Untertitel');
});
it('uses the selected desktop account and its model for CC instead of forcing Codex',async()=>{
  settings={...settings,activeProviderId:'claude-desktop',providers:[...settings.providers,{id:'claude-desktop',type:'chatgpt-desktop',engine:'claude',model:'haiku',label:'Claude'}]};
  changed.forEach(fn=>fn({[SETTINGS_KEY]:{newValue:settings}},'local'));await flush();
  button().click();await flush();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES'&&r.providerId==='claude-desktop')).toBe(true);
  expect(player.view.root.querySelector<HTMLSelectElement>('.provider')!.disabled).toBe(false);
});
it('captures the selected CC before restoring tracks during a restart',async()=>{
  button().click();await flush();
  english.mode='hidden';french.mode='showing';
  await player.start();await flush();
  expect(player.view.root.querySelector('.source span')!.textContent).toBe('Bienvenue dans cette vidéo.');
  expect(vi.mocked(sendRuntimeRequest).mock.calls.at(-1)?.[0]).toMatchObject({type:'TRANSLATE_VIDEO_SUBTITLES',sourceLang:'fr'});
});
it('reattaches once when YouTube replaces the controls and removes itself on disposal',async()=>{
  const controls=document.querySelector('.ytp-right-controls')!;const replacement=controls.cloneNode(false) as Element;
  replacement.innerHTML='<button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button>';controls.replaceWith(replacement);await flush();
  expect(replacement.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  expect(button().nextElementSibling?.className).toBe('ytp-settings-button');
  player.dispose();replacement.append(document.createElement('span'));await flush();expect(document.querySelector('.wupage-ai-cc-button')).toBeNull();
});
it('removes a cloned AI button when YouTube clones the whole control bar', async()=>{
  const controls=document.querySelector('.ytp-right-controls')!;
  controls.replaceWith(controls.cloneNode(true)); await flush();
  expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  expect(button().nextElementSibling?.className).toBe('ytp-settings-button');
  button().click(); await flush();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.filter(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES')).toHaveLength(1);
});
it('supersedes an earlier control without observers fighting over the same player', async()=>{
  const toggle=vi.fn(), container=video.parentElement!;
  const replacement=new YouTubeAiControl(container,toggle,()=>{}); await flush();
  expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  expect(document.querySelectorAll('style[data-wupage-video-style="youtube-control"]')).toHaveLength(1);
  for(let i=0;i<4;i++){document.querySelector('.ytp-right-controls')!.append(document.createElement('span'));await flush();}
  button().click(); expect(toggle).toHaveBeenCalledTimes(1);
  player.dispose(); expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  replacement.dispose(); expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(0);
});
it('creates one controller for multiple YouTube video elements sharing a player', async()=>{
  player.dispose();
  const second=document.createElement('video');video.parentElement!.prepend(second);
  vi.spyOn(second,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,900,506));
  const manager=new VideoSubtitleManager(); await flush();
  try {
    for(let i=0;i<3;i++){manager.refresh();await flush();expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);expect(document.querySelectorAll('[data-wupage-video]')).toHaveLength(1);}
    video.remove();manager.refresh();await flush();expect(document.querySelectorAll('.wupage-ai-cc-button')).toHaveLength(1);
  }finally{manager.dispose();}
});
it('inserts beside CC and Settings in the new nested YouTube controls',async()=>{
  const controls=document.querySelector('.ytp-right-controls')!;
  controls.innerHTML='<div class="ytp-right-controls-left"><button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button></div><div class="ytp-right-controls-right"><button>Fullscreen</button></div>';await flush();
  expect(button().parentElement?.className).toBe('ytp-right-controls-left');
  expect(button().previousElementSibling?.className).toBe('ytp-subtitles-button');
  expect(button().nextElementSibling?.className).toBe('ytp-settings-button');
});
it('can cancel while enabling the feature without starting a late translation',async()=>{
  let save!:()=>void;const original=vi.mocked(sendRuntimeRequest).getMockImplementation()!;
  vi.mocked(sendRuntimeRequest).mockImplementation(request=>request.type==='SAVE_SETTINGS'?new Promise(resolve=>{save=()=>{settings=request.settings;resolve(null);};}):original(request));
  button().click();await flush();expect(button().getAttribute('aria-pressed')).toBe('true');
  button().click();save();await flush();
  expect(player.enabled).toBe(false);expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES')).toBe(false);
});
it('discovers the native entry even while the saved subtitle feature is off',async()=>{
  player.dispose();initVideoSubtitles();await flush();
  expect(settings.videoTranslation?.enabled).toBe(false);expect(button()).not.toBeNull();
  expect(vi.mocked(sendRuntimeRequest).mock.calls.some(([r])=>r.type==='TRANSLATE_VIDEO_SUBTITLES')).toBe(false);
});
