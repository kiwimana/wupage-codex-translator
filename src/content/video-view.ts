import { TARGET_LANGUAGES } from "../shared/languages";
import { CHATGPT_BUILD } from "../shared/chatgpt-build";
import type { ExtensionSettings } from "../shared/types";
import { normalizeVideoTranslation, SUBTITLE_FONT_SIZES, type SubtitleFontSize, type VideoTranslationSettings } from "../shared/video";
import { uiIconMarkup } from "../shared/ui-icons";
import type { SubtitleExportFormat, SubtitleExportMode } from "../video/subtitle-export";

let nextView = 0;
export interface VideoViewActions {
  toggle: () => void;
  retry: () => void;
  source: (id: string) => void;
  settings: (patch: Partial<ExtensionSettings>) => void;
  preferences: (patch: Partial<VideoTranslationSettings>) => void;
  import: (file: File) => void;
  offset: (seconds: number) => void;
  panel?: (open: boolean) => void;
  download?: (mode: SubtitleExportMode, format: SubtitleExportFormat) => void;
}

const styles = `
  :host { all: initial !important; position: absolute !important; top: var(--wp-layer-top,0px) !important; left: var(--wp-layer-left,0px) !important; width: var(--wp-layer-width,100%) !important; height: var(--wp-layer-height,100%) !important; z-index: 2147483600 !important; pointer-events: none !important; container-type: inline-size !important; color-scheme: dark !important; direction: ltr; } :host([hidden]) { display: none !important; }
  * { box-sizing: border-box; } [hidden] { display: none !important; }
  .toolbar { position: absolute; right: 14px; top: 14px; display: flex; gap: 1px; align-items: center; color: #fff; background: #1c1928eb; border: 1px solid #ffffff29; border-radius: 9px; box-shadow: 0 3px 12px #0003; opacity: 0; transform: translateY(-3px); transition: opacity .16s,transform .16s; pointer-events: none; }
  :host([data-controls]) .toolbar, .toolbar:hover, .toolbar:focus-within, :host([data-panel]) .toolbar, :host([data-error]) .toolbar, :host([data-waiting]) .toolbar { opacity: 1; transform: none; pointer-events: auto; }
  :host([data-native-controls]:not([data-panel]):not([data-error]):not([data-waiting])) .toolbar { display: none; }
  :host([data-native-controls][data-context-settings]) .toolbar { display: none; }
  /* Shorts reserves its top row for CC, menu and fullscreen controls. */
  :host([data-shorts]) .toolbar { top: 64px; right: 12px; }
  :host([data-shorts]) .notice { top: 108px; right: 12px; }
  @container (max-width: 260px) { .toolbar .label { display: none; } }
  button, select, input { font: inherit; } button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
  .toolbar button { border: 0; color: inherit; background: transparent; min-height: 34px; padding: 7px 10px; font: 500 12px/20px system-ui,sans-serif; }
  .toolbar button:hover { background: #ffffff18; } .toggle { display: flex; gap: 7px; align-items: center; border-radius: 8px 0 0 8px; }
  .mark { display: grid; place-items: center; width: 20px; height: 18px; border: 1px solid #ffffffa8; border-radius: 4px; font-size: 12px; }
  .toggle[aria-busy="true"] .mark { color: transparent; border: 2px solid #d3bfff; border-right-color: transparent; border-radius: 50%; width: 18px; height: 18px; animation: wupage-cc-spin 780ms linear infinite; }
  @keyframes wupage-cc-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .toggle[aria-busy="true"] .mark { animation: none; } }
  :host([data-enabled]) .mark { color: #1c1928; background: #c4adff; border-color: #c4adff; }
  .settings { display: grid; place-items: center; border-left: 1px solid #ffffff1c !important; border-radius: 0 8px 8px 0; } .settings svg { width: 15px; height: 15px; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #c4adff; outline-offset: 2px; }
  .captions { position: absolute; left: 50%; bottom: max(10%, 46px); transform: translateX(-50%); width: 90%; text-align: center; color: #fff; font: 600 clamp(14px,3cqw,var(--wp-video-font,22px))/1.4 system-ui,sans-serif; text-shadow: 0 1px 3px #000,0 0 2px #000; }
  .source,.translation { white-space: pre-line; overflow-wrap: anywhere; } .source { font-size: .78em; font-weight: 500; margin-bottom: 5px; color: #f1f4f3; }
  .source span,.translation span { background: var(--wp-video-bg,#101718bf); box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 3px 8px; border-radius: 4px; }
  .source:has(span:empty),.translation:has(span:empty) { display: none; }
  .panel { position: fixed; inset: auto; left: var(--wp-panel-left,12px); top: var(--wp-panel-top,60px); margin: 0; width: min(304px,calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; padding: 16px; border: 1px solid #ffffff26; border-radius: 18px; color: #f3f6f5; background: #1c1928f7; box-shadow: 0 12px 40px #0006; font: 13px/1.5 system-ui,sans-serif; pointer-events: auto; }
  .panel::backdrop { background: transparent; } .panel header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; } h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .close { color: #c7d2cf; background: none; border: 0; border-radius: 4px; padding: 0 5px; font-size: 21px; line-height: 24px; }
  .field { display: grid; gap: 5px; margin: 12px 0; color: #b4a9c6; font-size: 12px; }
  select { width: 100%; min-width: 0; height: 33px; color: #f3f6f5; background: #272235; border: 1px solid #4b425e; border-radius: 6px; padding: 5px 8px; font-size: 13px; }
  .row { display: flex; gap: 12px; } .row > .field { flex: 1; min-width: 0; margin: 0; }
  .check { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 12px; } input[type=checkbox] { accent-color: #c4adff; margin: 0; width: 14px; height: 14px; }
  .status { color: #b9b0cc; font-size: 12px; margin: 12px 0 0; overflow-wrap: anywhere; } :host([data-error]) .status { color: #ffcfaa; }
  .help { margin: 5px 0 0; color: #aaa0bc; font-size: 11px; }
  .retry { margin-top: 10px; padding: 6px 12px; color: #2b1847; border: 0; border-radius: 6px; background: #c4adff; }
  details { margin-top: 12px; border-top: 1px solid #ffffff1f; padding-top: 10px; } summary { color: #c4d2cd; cursor: pointer; font-size: 12px; }
  .import { margin-top: 10px; color: #e8f1ee; background: #272235; border: 1px solid #4b425e; border-radius: 6px; padding: 6px 10px; }
  .offset { width: 100%; height: 32px; border: 1px solid #4b425e; border-radius: 6px; background: #272235; color: #fff; padding: 5px 8px; }
  .notice { position: absolute; top: 58px; right: 14px; max-width: min(300px,calc(100% - 28px)); padding: 9px 12px; background: #1c1928ed; border: 1px solid #ffffff29; border-radius: 8px; color: #e4eeea; font: 12px/1.5 system-ui,sans-serif; pointer-events: auto; }
  @media (prefers-reduced-motion: reduce) { .toolbar { transition: none; } }
  :host([data-native-controls]) .toolbar { display: none; }
  .captions { display:flex; flex-direction:column; gap:5px; width:max-content; max-width:90%; padding:10px 18px; border-radius:13px; background:var(--wp-video-bg,rgba(0,0,0,.88)); bottom:max(var(--wp-video-bottom,8%),46px); font-family:var(--wp-video-family,system-ui,sans-serif); font-size:clamp(12px,var(--wp-video-font,22px),9cqw); font-weight:var(--wp-video-weight,600); line-height:1.4; }
  .source { order:var(--wp-source-order,0); font-size:clamp(12px,var(--wp-source-font,22px),9cqw); font-weight:inherit; margin:0; color:var(--wp-source-color,#fff); }
  .translation { order:var(--wp-translation-order,1); color:var(--wp-translation-color,#fff); }
  .source span,.translation span { padding:0; border-radius:0; background:transparent; }
  @container(min-width:700px) { :host([data-panel][data-context-settings]) .captions { left:calc((100% - var(--wp-open-panel-width,292px))/2); max-width:calc(100% - var(--wp-open-panel-width,292px) - 40px); } }
  .panel { width:min(292px,calc(100vw - 24px)); padding:14px; border-radius:16px; background:#101010f7; border-color:#ffffff1c; color:#f5f5f5; }
  .panel[data-page="settings"],.panel[data-page="download"] { width:min(336px,calc(100vw - 24px)); }
  .panel header { gap:8px; margin-bottom:8px; } .panel h2 { flex:1; font-size:13px; display:flex; align-items:center; gap:8px; }
  .panel header { position:sticky; top:-14px; z-index:1; padding:5px 0 9px; background:#101010; }
  .panel h2 svg,.menu-row svg { width:17px; height:17px; flex-shrink:0; }
  .back { border:0; border-radius:5px; padding:3px; color:#ddd; background:transparent; } .back svg { width:16px;height:16px;transform:rotate(180deg); }
  .menu-row { display:flex; align-items:center; gap:10px; width:100%; margin:0; padding:11px 6px; min-height:42px; border:0; border-radius:7px; background:transparent; color:inherit; text-align:left; font:12px/1.5 system-ui,sans-serif; cursor:pointer; }
  .menu-row:hover { background:#ffffff0e; } .menu-row .row-label { flex:1; } .menu-row .chevron { width:13px; height:13px; margin-left:auto; }
  .automatic { appearance:none; width:30px!important; height:18px!important; border:0; border-radius:12px; background:#666; position:relative; flex-shrink:0; cursor:pointer; }
  .automatic::after { content:""; position:absolute; width:12px; height:12px; top:3px; left:3px; border-radius:50%; background:#fff; transition:transform .12s; }
  .automatic:checked { background:#bfa7ff; } .automatic:checked::after { transform:translateX(12px); }
  .scope-hint,.download-help { color:#a5a5a5; font:11px/1.6 system-ui,sans-serif; margin:0 6px 6px; }
  .session[aria-busy="true"] svg { animation:wupage-cc-spin 1s linear infinite; }
  .settings-content { border-top:1px solid #ffffff16; padding-top:10px; } .field { color:#bdbdbd; }
  .panel select,.panel input.offset { background:#232323; border-color:#494949; color:#f3f3f3; }
  .settings-content .row { margin-bottom:12px; } .settings-content .row .field { margin:0; }
  .style-preview { display:flex; flex-direction:column; gap:3px; padding:10px; border-radius:10px; text-align:center; background:var(--wp-video-bg,#000c); font:var(--wp-video-weight,600) 13px/1.4 var(--wp-video-family,system-ui,sans-serif); }
  .preview-source { order:var(--wp-source-order,0); color:var(--wp-source-color,#fff); }.preview-translation { order:var(--wp-translation-order,1); color:var(--wp-translation-color,#fff); }
  .panel input[type="range"] { width:100%; accent-color:#c4adff; }.panel input[type="color"] { width:100%; height:32px; border:1px solid #494949; border-radius:6px; background:#232323; }
  .reset-style,.save-subtitles { border:1px solid #555; border-radius:7px; padding:8px 12px; background:#272727; color:#eee; font:12px system-ui,sans-serif; }
  .save-subtitles { width:100%; margin:8px 0; background:#d2c0ff; color:#21182e; border-color:transparent; }.export-status { color:#c4b1ef; overflow-wrap:anywhere; font-size:12px; }
  @media(prefers-reduced-motion:reduce) { .session svg {animation:none!important}.automatic::after {transition:none} }
  :host([data-menu-control]) .toolbar { gap:0; border-radius:20px; background:#171717db; border-color:#ffffff30; backdrop-filter:blur(12px); }
  :host([data-menu-control]) .toolbar .settings { display:none; }
  :host([data-menu-control]) .toolbar .toggle { min-height:38px; padding:7px 12px; border-radius:20px; gap:7px; font-size:12px; }
  :host([data-menu-control]) .mark { border:0; width:18px; height:18px; background:none; color:inherit; }
  :host([data-menu-control]) .mark svg { width:18px; height:18px; }
  :host([data-menu-control][data-enabled]) .toolbar { color:#decfff; border-color:#c4adff77; }
  :host([data-menu-control]) .toggle[aria-busy="true"] .mark svg { visibility:hidden; }
  :host([data-menu-control]) .toggle[aria-busy="true"] .mark { border:2px solid #d3bfff; border-right-color:transparent; }
  :host([data-shorts]) .captions { bottom:max(var(--wp-video-bottom,8%),112px); max-width:calc(100% - 32px); padding:9px 13px; border-radius:10px; }
  .panel { width:min(304px,calc(100vw - 24px)); padding:16px; border-radius:16px; background:#171717fa; border-color:#ffffff20; font-size:13px; box-shadow:0 12px 40px #0007; scrollbar-width:thin; scrollbar-color:#626262 transparent; }
  .panel[data-page="settings"],.panel[data-page="download"] { width:min(352px,calc(100vw - 24px)); }
  .panel header { top:-16px; padding-top:3px; margin-bottom:4px; background:#171717; }
  .panel h2 { font-size:14px; font-weight:600; }
  .close { width:28px; height:28px; display:grid; place-items:center; padding:5px; border-radius:50%; }
  .close svg { width:16px; height:16px; } .close:hover,.back:hover { background:#ffffff15; }
  .service-summary { margin:0 0 12px; color:#aaa; font:11px/1.5 system-ui,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .quick-controls { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(0,1fr); gap:10px; padding:10px; margin:0 0 10px; background:#ffffff08; border:1px solid #ffffff0d; border-radius:10px; }
  .quick-controls .field { margin:0; font-size:11px; color:#aaa; gap:5px; } .quick-controls select { background:#242424; border-color:#424242; height:34px; font-size:12px; }
  .menu-row { min-height:44px; padding:10px 9px; font-size:13px; border-radius:8px; }
  .menu-row:hover { background:#ffffff12; } .session { background:#c8b3ff18; color:#e0d1ff; margin-bottom:5px; }
  .session:hover { background:#c8b3ff28; } .menu-divider { height:1px; margin:8px 0; background:#ffffff12; }
  .scope-hint { margin:0 9px 5px 36px; line-height:1.5; font-size:10px; color:#929292; }
  .settings-content { border-top:0; padding-top:8px; } .settings-content .field { margin:10px 0; }
  .settings-content .row { gap:10px; margin-bottom:10px; } .settings-content select { height:36px; }
  .style-preview { margin-bottom:14px; min-height:66px; justify-content:center; border:1px solid #ffffff12; }
  .advanced-settings { margin:14px 0 8px; padding-top:12px; } .advanced-settings summary { color:#ddd; font-size:12px; }
  .reset-style { display:block; margin:14px auto 0; padding:5px 8px; border:0; background:transparent; color:#bfb1df; }
  .status { padding:0; margin:10px 0 0; color:#aaa; font-size:11px; line-height:1.6; }
  .status:empty { display:none; } :host([data-error]) .status { color:#ffc9b6; }
  .session[aria-busy="true"] svg { animation:none; display:none; } .busy-spinner { display:none; width:17px; height:17px; border:2px solid #dacaff; border-right-color:transparent; border-radius:50%; flex-shrink:0; }
  .session[aria-busy="true"] .busy-spinner { display:block; animation:wupage-cc-spin 780ms linear infinite; }
  @media(prefers-reduced-motion:reduce) { .busy-spinner { animation:none!important; } }
`;

export class VideoView {
  readonly host = document.createElement("div");
  readonly root = this.host.attachShadow({ mode: "open" });
  readonly id = `wupage-player-${++nextView}`;
  private readonly panel: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly source: HTMLElement;
  private readonly translation: HTMLElement;
  private readonly status: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private panelAnchor?: HTMLElement;
  private cleanups: Array<() => void> = [];

  constructor(private actions: VideoViewActions, label: string) {
    this.host.id = this.id; this.host.dataset.wupageVideo = ""; this.host.setAttribute("translate", "no");
    this.host.toggleAttribute("data-menu-control", CHATGPT_BUILD);
    this.root.innerHTML = `<style>${styles}</style>
      <div class="toolbar" role="group" aria-label="视频字幕翻译">
        <button class="toggle" type="button" aria-pressed="false" title="翻译视频字幕"><span class="mark" aria-hidden="true">${uiIconMarkup("microchip")}</span><span class="label">AI 字幕</span></button>
        <button class="settings" type="button" aria-label="字幕设置" title="字幕设置" aria-expanded="false">${uiIconMarkup("settings")}</button>
      </div>
      <div class="captions" role="region" aria-label="双语字幕" hidden><div class="source" dir="auto"><span></span></div><div class="translation" dir="auto"><span></span></div></div>
      <section class="panel" popover="manual" role="dialog" aria-label="CC 字幕設定" hidden>
        <header><button class="back" type="button" aria-label="返回字幕選單" hidden>${uiIconMarkup("arrow-right")}</button><h2>${uiIconMarkup("microchip")}<span class="panel-title">AI 字幕</span></h2><button class="close" type="button" aria-label="关闭字幕设置">${uiIconMarkup("cross")}</button></header>
        <div class="menu-main">
          <p class="service-summary"></p>
          <div class="quick-controls"><label class="field">翻譯語言<select class="quick-target" aria-label="快速設定字幕翻譯語言"></select></label><label class="field">字幕大小<select class="quick-font" aria-label="快速設定字幕大小"></select></label></div>
          <button class="menu-row session" type="button" aria-pressed="false">${uiIconMarkup("lightning")}<span class="busy-spinner" aria-hidden="true"></span><span class="row-label session-label">僅本次開啟字幕翻譯</span></button>
          <label class="menu-row">${uiIconMarkup("microchip")}<span class="row-label">此網站自動翻譯</span><input class="automatic" type="checkbox" aria-label="記住此網站並自動翻譯字幕"></label>
          <p class="scope-hint">記住此網站，下次開啟影片也會翻譯。</p>
          <div class="menu-divider" role="separator"></div>
          <button class="menu-row open-download" type="button">${uiIconMarkup("document")}<span class="row-label">下載字幕</span>${uiIconMarkup("arrow-right")}</button>
          <button class="menu-row open-settings" type="button">${uiIconMarkup("settings")}<span class="row-label">字幕設定</span>${uiIconMarkup("arrow-right")}</button>
        </div>
        <div class="settings-content" hidden>
        <div class="style-preview" aria-label="字幕樣式預覽"><div class="preview-source">Original subtitles appear here.</div><div class="preview-translation">雙語字幕樣式預覽</div></div>
        <div class="row"><label class="field">译为<select class="target" aria-label="字幕目标语言"></select></label><label class="field">譯文字體大小<select class="font" aria-label="譯文字體大小"></select></label></div>
        <div class="row"><label class="field">原文字體大小<select class="source-font" aria-label="原文字體大小"><option value="0">與譯文相同</option></select></label><label class="field">字幕排列<select class="subtitle-order"><option value="original-first">原文在上</option><option value="translation-first">譯文在上</option></select></label></div>
        <label class="check"><input class="original" type="checkbox" checked>显示原文</label>
        <label class="field">字幕背景<select class="background" aria-label="字幕背景"><option value="soft">圓角黑色底板</option><option value="solid">不透明黑底</option><option value="none">透明</option></select></label>
        <label class="field">背景不透明度 <output class="opacity-value">88%</output><input class="background-opacity" type="range" min="0" max="100" value="88"></label>
        <label class="field">字幕距底部 <output class="bottom-value">8%</output><input class="bottom-offset" type="range" min="0" max="40" value="8"></label>
        <details class="advanced-settings"><summary>字幕來源與進階樣式</summary>
          <label class="field">翻译服务<select class="provider" aria-label="字幕翻译服务"></select></label>
          <label class="field">原字幕<select class="track" aria-label="原字幕语言"><option value="auto">跟随播放器</option></select></label>
          <div class="row"><label class="field">字體<select class="font-family"><option value="system">系統黑體</option><option value="serif">襯線字體</option><option value="monospace">等寬字體</option></select></label><label class="field">字重<select class="font-weight"><option value="normal">一般</option><option value="bold">粗體</option></select></label></div>
          <div class="row"><label class="field">原文字色<input class="source-color" type="color" value="#ffffff"></label><label class="field">譯文字色<input class="translation-color" type="color" value="#ffffff"></label></div>
          <label class="field">时间偏移（秒）<input class="offset" type="number" min="-30" max="30" step="0.5" value="0" aria-label="字幕时间偏移"></label>
          <button class="import" type="button">导入 SRT / VTT</button><input class="file" type="file" accept=".srt,.vtt" hidden>
          <p class="help">仅翻译字幕文本，不采集音频。在线翻译使用所选服务的额度。</p>
        </details>
        <button class="reset-style" type="button">還原字幕外觀</button>
        </div>
        <div class="download-content" hidden>
          <label class="field">字幕內容<select class="download-mode"><option value="bilingual">雙語（已完成部分）</option><option value="translation">譯文（已完成部分）</option><option value="original">原文字幕</option></select></label>
          <label class="field">檔案格式<select class="download-format"><option value="srt">SRT</option><option value="vtt">WebVTT</option></select></label>
          <p class="download-help">下載不會額外啟動翻譯。譯文只包含目前已完成並保留在記憶體中的字幕；即時字幕時間為估計值。</p>
          <button class="save-subtitles" type="button">下載字幕檔</button><p class="export-status" role="status"></p>
        </div>
        <p class="status" role="status"></p><button class="retry" type="button" hidden>重试读取</button>
      </section><div class="notice" role="status" hidden></div>`;
    const query = <T extends Element>(selector: string) => this.root.querySelector<T>(selector)!;
    this.panel = query(".panel"); this.toggle = query(".toggle"); this.label = query(".label"); this.caption = query(".captions");
    this.source = query(".source span"); this.translation = query(".translation span"); this.status = query(".status"); this.notice = query(".notice"); this.retry = query(".retry");
    const target = query<HTMLSelectElement>(".target");
    for (const size of SUBTITLE_FONT_SIZES) { query<HTMLSelectElement>(".font").add(new Option(`${size} px`, String(size))); query<HTMLSelectElement>(".quick-font").add(new Option(`${size} px`, String(size))); query<HTMLSelectElement>(".source-font").add(new Option(`${size} px`, String(size))); }
    target.replaceChildren(...TARGET_LANGUAGES.map(language => new Option(language.label, language.code)));
    query<HTMLSelectElement>(".quick-target").replaceChildren(...TARGET_LANGUAGES.map(language => new Option(language.label, language.code)));
    const openMenu = (toggle = false) => this.setPanel(toggle ? !this.panelOpen : true, this.toggle);
    this.on(this.toggle, "click", () => { if (CHATGPT_BUILD) openMenu(true); else actions.toggle(); });
    this.on(this.toggle, "contextmenu", event => { event.preventDefault(); event.stopPropagation(); openMenu(); });
    this.on(this.toggle, "keydown", event => { const key = event as KeyboardEvent; if (key.key === "ContextMenu" || key.key === "F10" && key.shiftKey) { event.preventDefault(); event.stopPropagation(); openMenu(); } });
    if (CHATGPT_BUILD) { this.toggle.setAttribute("aria-haspopup", "dialog"); this.toggle.setAttribute("aria-expanded", "false"); }
    this.on(query(".session"), "click", () => { actions.toggle(); this.dismissPanel(); });
    this.on(query(".open-settings"), "click", () => this.showPage("settings"));
    this.on(query(".open-download"), "click", () => this.showPage("download"));
    this.on(query(".back"), "click", () => this.showPage("menu"));
    this.on(query(".save-subtitles"), "click", () => actions.download?.(query<HTMLSelectElement>(".download-mode").value as SubtitleExportMode, query<HTMLSelectElement>(".download-format").value as SubtitleExportFormat));
    this.on(query(".settings"), "click", () => this.setPanel(this.panel.hidden));
    this.on(query(".close"), "click", () => this.dismissPanel());
    this.on(this.retry, "click", () => actions.retry());
    this.on(target, "change", () => actions.settings({ targetLang: target.value }));
    const quickTarget = query<HTMLSelectElement>(".quick-target"); this.on(quickTarget, "change", () => actions.settings({ targetLang: quickTarget.value }));
    const provider = query<HTMLSelectElement>(".provider");
    this.on(provider, "change", () => actions.settings({ activeProviderId: provider.value }));
    const track = query<HTMLSelectElement>(".track"); this.on(track, "change", () => actions.source(track.value));
    const font = query<HTMLSelectElement>(".font"); this.on(font, "change", () => actions.preferences({ fontSize: Number(font.value) as SubtitleFontSize }));
    const quickFont = query<HTMLSelectElement>(".quick-font"); this.on(quickFont, "change", () => actions.preferences({ fontSize: Number(quickFont.value) as SubtitleFontSize }));
    const sourceFont = query<HTMLSelectElement>(".source-font"); this.on(sourceFont, "change", () => actions.preferences({ sourceFontSize: Number(sourceFont.value) ? Number(sourceFont.value) as SubtitleFontSize : undefined }));
    for (const [selector, key] of [[".subtitle-order", "subtitleOrder"], [".font-family", "fontFamily"], [".font-weight", "fontWeight"], [".source-color", "sourceColor"], [".translation-color", "translationColor"]] as const) {
      const input = query<HTMLSelectElement | HTMLInputElement>(selector); this.on(input, "change", () => actions.preferences({ [key]: input.value } as Partial<VideoTranslationSettings>));
    }
    for (const [selector, key] of [[".background-opacity", "backgroundOpacity"], [".bottom-offset", "bottomOffset"]] as const) {
      const input = query<HTMLInputElement>(selector); this.on(input, "input", () => {
        this.setText(query(key === "backgroundOpacity" ? ".opacity-value" : ".bottom-value"), `${input.value}%`);
        this.host.style.setProperty(key === "backgroundOpacity" ? "--wp-video-bg" : "--wp-video-bottom", key === "backgroundOpacity" ? `rgba(0,0,0,${Number(input.value) / 100})` : `${input.value}%`);
      });
      this.on(input, "change", () => actions.preferences({ [key]: Number(input.value) }));
    }
    this.on(query(".reset-style"), "click", () => actions.preferences({ fontSize: 26, sourceFontSize: undefined, showOriginal: true, subtitleOrder: "original-first", fontFamily: "system", fontWeight: "bold", sourceColor: "#ffffff", translationColor: "#ffffff", background: "soft", backgroundOpacity: 88, bottomOffset: 8 }));
    const original = query<HTMLInputElement>(".original"); this.on(original, "change", () => actions.preferences({ showOriginal: original.checked }));
    const background = query<HTMLSelectElement>(".background"); this.on(background, "change", () => actions.preferences({ background: background.value as VideoTranslationSettings["background"] }));
    const automatic = query<HTMLInputElement>(".automatic"); this.on(automatic, "change", () => actions.preferences({ ...(automatic.checked ? { enabled: true } : {}), ...(CHATGPT_BUILD ? { accountAutoSites: automatic.checked ? [label] : [] } : { enabledSites: automatic.checked ? [label] : [] }) }));
    const file = query<HTMLInputElement>(".file"); this.on(query(".import"), "click", () => file.click());
    this.on(file, "change", () => { if (file.files?.[0]) actions.import(file.files[0]); file.value = ""; });
    const offset = query<HTMLInputElement>(".offset"); this.on(offset, "change", () => {
      const value = Number(offset.value);
      if (Number.isFinite(value)) { offset.value = String(Math.max(-30, Math.min(30, value))); actions.offset(Number(offset.value)); }
      else offset.value = "0";
    });
    this.on(this.root, "keydown", (event: Event) => { event.stopPropagation(); if ((event as KeyboardEvent).key === "Escape") { event.preventDefault(); this.dismissPanel(); } });
    this.on(this.root, "click", event => event.stopPropagation());
    this.on(document, "pointerdown", event => { const path = event.composedPath(); if (!this.panel.hidden && !path.includes(this.host) && (!this.panelAnchor || !path.includes(this.panelAnchor))) this.setPanel(false); }, true);
    this.on(window, "scroll", () => { if (this.panelOpen) this.positionPanel(); }, true);
    this.on(query(".advanced-settings"), "toggle", () => { if (this.panelOpen) this.positionPanel(); });
  }

  private on(target: EventTarget, type: string, callback: EventListener, capture = false): void {
    target.addEventListener(type, callback, capture); this.cleanups.push(() => target.removeEventListener(type, callback, capture));
  }

  setControls(show: boolean): void { this.host.toggleAttribute("data-controls", show); }
  focus(): void { this.setControls(true); this.toggle.focus(); }
  get panelOpen(): boolean { return !this.panel.hidden; }

  setPanel(open: boolean, anchor?: HTMLElement): void {
    if (open && (anchor || !this.panelOpen)) this.showPage("menu");
    if (open) this.panelAnchor = anchor ?? this.panelAnchor ?? this.toggle;
    this.host.toggleAttribute("data-context-settings", open && this.panelAnchor !== this.toggle);
    if (open === !this.panel.hidden) { if (open) this.positionPanel(); return; }
    if (open) {
      this.panel.hidden = false;
      try { this.panel.showPopover?.(); } catch { /* Fallback works in older embedded viewers. */ }
      this.positionPanel();
      if (anchor) this.panel.querySelector<HTMLButtonElement>(".session")?.focus({ preventScroll: true });
    } else {
      try { this.panel.hidePopover?.(); } catch { /* The panel may be outside the top layer after navigation. */ }
      this.panel.hidden = true;
      this.panelAnchor = undefined;
    }
    this.host.toggleAttribute("data-panel", open);
    this.root.querySelector(".settings")!.setAttribute("aria-expanded", String(open));
    if (CHATGPT_BUILD) this.toggle.setAttribute("aria-expanded", String(open));
    this.actions.panel?.(open);
  }

  private showPage(page: "menu" | "settings" | "download"): void {
    this.panel.dataset.page = page;
    this.panel.scrollTop = 0;
    this.root.querySelector<HTMLElement>(".menu-main")!.hidden = page !== "menu";
    this.root.querySelector<HTMLElement>(".settings-content")!.hidden = page !== "settings";
    this.root.querySelector<HTMLElement>(".download-content")!.hidden = page !== "download";
    this.root.querySelector<HTMLElement>(".back")!.hidden = page === "menu";
    this.setText(this.root.querySelector(".panel-title")!, page === "menu" ? "AI 字幕" : page === "settings" ? "字幕設定" : "下載字幕");
    if (this.panelOpen) {
      this.positionPanel();
      this.root.querySelector<HTMLElement>(page === "menu" ? ".session" : page === "settings" ? ".target" : ".download-mode")?.focus({ preventScroll: true });
    }
  }

  downloadState(busy: boolean, message: string): void {
    this.root.querySelector<HTMLButtonElement>(".save-subtitles")!.disabled = busy;
    this.setText(this.root.querySelector(".export-status")!, message);
  }

  private dismissPanel(): void {
    const anchor = this.panelAnchor ?? this.toggle;
    this.setPanel(false);
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  positionPanel(): void {
    const anchor = this.panelAnchor?.isConnected ? this.panelAnchor : this.toggle;
    const button = anchor.getBoundingClientRect();
    const width = Math.min(this.panel.dataset.page === "menu" ? 304 : 352, innerWidth - 24);
    this.host.style.setProperty("--wp-open-panel-width", `${width}px`);
    const player = this.host.getBoundingClientRect(), shorts = this.host.hasAttribute("data-shorts");
    const maxHeight = Math.max(120, Math.min(innerHeight - 24, shorts && player.height > 144 ? player.height - 24 : innerHeight - 24));
    this.panel.style.maxHeight = `${maxHeight}px`;
    const height = Math.min(this.panel.scrollHeight || 430, maxHeight);
    let top = anchor !== this.toggle ? button.top - height - 8 : button.bottom + 8;
    let left = button.right - width;
    if (shorts && !document.fullscreenElement) {
      // Keep a portrait video readable when the page has room beside it.
      if (innerWidth - player.right >= width + 24) { left = player.right + 12; top = button.top; }
      else if (player.left >= width + 24) { left = player.left - width - 12; top = button.top; }
    }
    this.panel.style.setProperty("--wp-panel-left", `${Math.max(12, Math.min(innerWidth - width - 12, left))}px`);
    this.panel.style.setProperty("--wp-panel-top", `${Math.max(12, Math.min(innerHeight - height - 12, top))}px`);
  }

  setState(enabled: boolean, phase: "idle" | "loading" | "active" | "waiting" | "error", message: string): void {
    this.host.toggleAttribute("data-enabled", enabled); this.host.toggleAttribute("data-error", phase === "error");
    this.host.toggleAttribute("data-waiting", enabled && phase === "waiting");
    this.toggle.setAttribute("aria-pressed", String(enabled));
    this.toggle.setAttribute("aria-busy", String(enabled && phase === "loading"));
    const session = this.root.querySelector<HTMLButtonElement>(".session")!;
    if (session.getAttribute("aria-pressed") !== String(enabled)) session.setAttribute("aria-pressed", String(enabled));
    if (session.getAttribute("aria-busy") !== String(enabled && phase === "loading")) session.setAttribute("aria-busy", String(enabled && phase === "loading"));
    this.setText(this.root.querySelector(".session-label")!, enabled ? "停止本次字幕翻譯" : "僅本次開啟字幕翻譯");
    this.toggle.title = CHATGPT_BUILD ? "AI 字幕；左鍵或右鍵開啟字幕設定" : enabled ? "停止字幕翻译" : "翻译视频字幕";
    this.setText(this.label, CHATGPT_BUILD ? phase === "loading" ? "載入中" : phase === "error" ? "重試字幕" : "AI 字幕" : !enabled ? "字幕翻译" : phase === "loading" ? "读取字幕…" : phase === "error" ? "字幕需重试" : phase === "waiting" ? "等待原字幕" : "双语已开");
    this.setText(this.status, message); this.retry.hidden = !enabled || !["waiting", "error"].includes(phase);
  }

  settings(settings: ExtensionSettings, site: string): void {
    const preferences = normalizeVideoTranslation(settings.videoTranslation);
    const target = this.root.querySelector<HTMLSelectElement>(".target")!;
    if (![...target.options].some(option => option.value === settings.targetLang)) target.add(new Option(settings.targetLang, settings.targetLang));
    target.value = settings.targetLang;
    const quickTarget = this.root.querySelector<HTMLSelectElement>(".quick-target")!;
    if (![...quickTarget.options].some(option => option.value === settings.targetLang)) quickTarget.add(new Option(settings.targetLang, settings.targetLang));
    quickTarget.value = settings.targetLang;
    const provider = this.root.querySelector<HTMLSelectElement>(".provider")!;
    const signature = JSON.stringify(settings.providers.filter(entry => entry.enabled !== false).map(entry => [entry.id, entry.label]));
    if (provider.dataset.options !== signature) {
      provider.replaceChildren(...settings.providers.filter(entry => entry.enabled !== false).map(entry => new Option(entry.label, entry.id)));
      provider.dataset.options = signature;
    }
    provider.value = settings.activeProviderId;
    const label = settings.providers.find(entry => entry.id === settings.activeProviderId)?.label ?? "";
    this.setText(this.root.querySelector(".service-summary")!, label.replace(/（[^）]*）|\([^)]*\)/gu, "").trim());
    if (CHATGPT_BUILD) {
      for (const option of provider.options) option.disabled = settings.providers.find(p => p.id === option.value)?.type !== "chatgpt-desktop";
      provider.title = "AI CC 字幕使用所選本機帳號與該服務設定的模型。";
    }
    this.root.querySelector<HTMLSelectElement>(".font")!.value = String(preferences.fontSize);
    this.root.querySelector<HTMLSelectElement>(".quick-font")!.value = String(preferences.fontSize);
    this.root.querySelector<HTMLSelectElement>(".background")!.value = preferences.background;
    this.root.querySelector<HTMLInputElement>(".original")!.checked = preferences.showOriginal;
    this.root.querySelector<HTMLInputElement>(".automatic")!.checked = (CHATGPT_BUILD ? preferences.accountAutoSites ?? [] : preferences.enabledSites).includes(site);
    this.host.style.setProperty("--wp-video-font", `${preferences.fontSize}px`);
    this.host.style.setProperty("--wp-source-font", `${preferences.sourceFontSize ?? preferences.fontSize}px`);
    this.host.style.setProperty("--wp-source-color", preferences.sourceColor ?? "#ffffff"); this.host.style.setProperty("--wp-translation-color", preferences.translationColor ?? "#ffffff");
    this.host.style.setProperty("--wp-source-order", preferences.subtitleOrder === "translation-first" ? "1" : "0"); this.host.style.setProperty("--wp-translation-order", preferences.subtitleOrder === "translation-first" ? "0" : "1");
    this.host.style.setProperty("--wp-video-family", preferences.fontFamily === "serif" ? "Georgia,serif" : preferences.fontFamily === "monospace" ? "ui-monospace,monospace" : "system-ui,sans-serif");
    this.host.style.setProperty("--wp-video-weight", preferences.fontWeight === "normal" ? "400" : "600");
    this.host.style.setProperty("--wp-video-bottom", `${preferences.bottomOffset ?? 8}%`);
    this.host.style.setProperty("--wp-video-bg", preferences.background === "none" ? "transparent" : `rgba(0,0,0,${preferences.background === "solid" ? 1 : (preferences.backgroundOpacity ?? 88) / 100})`);
    const opacity = preferences.background === "none" ? 0 : preferences.background === "solid" ? 100 : preferences.backgroundOpacity ?? 88;
    const values: Record<string, string> = { ".source-font": String(preferences.sourceFontSize ?? 0), ".subtitle-order": preferences.subtitleOrder ?? "original-first", ".font-family": preferences.fontFamily ?? "system", ".font-weight": preferences.fontWeight ?? "bold", ".source-color": preferences.sourceColor ?? "#ffffff", ".translation-color": preferences.translationColor ?? "#ffffff", ".background-opacity": String(opacity), ".bottom-offset": String(preferences.bottomOffset ?? 8) };
    for (const [selector, value] of Object.entries(values)) this.root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!.value = value;
    this.root.querySelector<HTMLInputElement>(".background-opacity")!.disabled = preferences.background !== "soft";
    this.setText(this.root.querySelector(".opacity-value")!, `${opacity}%`); this.setText(this.root.querySelector(".bottom-value")!, `${preferences.bottomOffset ?? 8}%`);
    this.root.querySelector<HTMLElement>(".preview-source")!.hidden = !preferences.showOriginal;
  }

  tracks(tracks: Array<{ id: string; label: string }>, selected = "auto"): void {
    const select = this.root.querySelector<HTMLSelectElement>(".track")!;
    select.replaceChildren(new Option("跟随播放器", "auto"), ...tracks.map(track => new Option(track.label, track.id)));
    select.value = [...select.options].some(option => option.value === selected) ? selected : "auto";
  }

  render(source: string, translation: string, preferences: VideoTranslationSettings): void {
    this.setText(this.source, preferences.showOriginal && source !== translation ? source : "");
    this.setText(this.translation, translation);
    this.caption.hidden = !translation;
  }

  tell(message: string): void {
    clearTimeout(this.noticeTimer); this.setControls(true); this.notice.hidden = false; this.setText(this.notice, message);
    this.noticeTimer = setTimeout(() => { this.notice.hidden = true; }, 5000);
  }

  private setText(element: Element, value: string): void { if (element.textContent !== value) element.textContent = value; }
  dispose(): void { this.setPanel(false); clearTimeout(this.noticeTimer); for (const cleanup of this.cleanups) cleanup(); this.cleanups = []; this.host.remove(); }
}
