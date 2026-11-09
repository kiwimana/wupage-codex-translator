import { uiIconMarkup } from "../shared/ui-icons";

/** Lives in YouTube's own control bar, including theater mode and fullscreen. */
export class YouTubeAiControl {
  readonly button = document.createElement("button");
  private readonly style = document.createElement("style");
  private readonly observer: MutationObserver;
  private disposed = false;
  private controls?: HTMLElement;
  private settingsButton?: Element;
  private nativeAttached?: boolean;
  private shorts = false;
  // A DOM event also reaches an older copy of the module after reinjection.
  private readonly superseded = () => this.dispose();

  constructor(private player: HTMLElement, private attached: (value: boolean) => void, openSettings: (toggle?: boolean) => void) {
    player.dispatchEvent(new Event("wupage-ai-cc-takeover"));
    player.addEventListener("wupage-ai-cc-takeover", this.superseded);
    player.querySelectorAll('.wupage-ai-cc-button,style[data-wupage-video-style="youtube-control"]').forEach(node => node.remove());
    this.button.type = "button";
    this.button.className = "ytp-button wupage-ai-cc-button";
    this.button.setAttribute("data-wupage-video-control", "");
    this.button.setAttribute("data-wupage-ai-managed", "");
    this.button.setAttribute("aria-haspopup", "dialog");
    this.button.setAttribute("aria-expanded", "false");
    this.button.innerHTML = `${uiIconMarkup("microchip")}<span aria-hidden="true">AI</span>`;
    this.button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openSettings(true); });
    this.button.addEventListener("contextmenu", event => {
      event.preventDefault(); event.stopPropagation(); openSettings();
    });
    this.button.addEventListener("keydown", event => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault(); event.stopPropagation(); openSettings(); return;
      }
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    this.style.setAttribute("data-wupage-video-style", "youtube-control");
    this.style.textContent = `
      .ytp-right-controls .wupage-ai-cc-button {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        gap: 3px !important; width: 44px !important; min-width: 44px !important; height: 100% !important;
        box-sizing: border-box !important; padding: 0 4px !important; border: 0 !important;
        position: relative !important; vertical-align: top !important; cursor: pointer !important;
        color: #fff !important; background: transparent !important; opacity: 1 !important;
        font: 600 11px/1 system-ui,sans-serif !important; text-shadow: 0 1px 2px #000;
      }
      .wupage-ai-cc-button > svg { position: static !important; width: 17px !important; height: 17px !important; box-sizing: border-box !important; padding: 0 !important; border: 0 !important; margin: 0 !important; transform: none !important; flex: 0 0 17px !important; fill: currentColor !important; }
      .wupage-ai-cc-button > span { position: static !important; display: inline-block !important; width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; transform: none !important; color: inherit !important; font: inherit !important; white-space: nowrap !important; pointer-events: none; }
      .ytp-right-controls .wupage-ai-cc-button[aria-pressed="true"] { color: #d3bfff !important; }
      .ytp-right-controls .wupage-ai-cc-button[data-wupage-ai-retired] { display: none !important; pointer-events: none !important; }
      .wupage-ai-cc-button[aria-pressed="true"]::after {
        content: ""; position: absolute; bottom: 8%; left: 18%; right: 18%; height: 2px; border-radius: 2px; background: currentColor;
      }
      .wupage-ai-cc-button[aria-busy="true"] > svg { visibility: hidden !important; }
      .wupage-ai-cc-button[aria-busy="true"]::before { content: ""; position: absolute; left: calc(50% - 17px); top: calc(50% - 8px); box-sizing: border-box; width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: wupage-ai-cc-spin 780ms linear infinite; pointer-events: none; }
      .wupage-ai-cc-button:focus-visible { outline: 2px solid #d3bfff !important; outline-offset: -3px; }
      @keyframes wupage-ai-cc-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .wupage-ai-cc-button::before { animation: none !important; } }
    `;
    player.append(this.style);
    this.observer = new MutationObserver(records => {
      if (this.disposed || this.shorts) return;
      if (!this.controls?.isConnected || this.button.parentElement !== (this.settingsButton?.parentElement ?? this.controls)
        || this.style.parentElement !== this.player || records.some(record => this.controls!.contains(record.target)
          && [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element
            && (node.matches('.wupage-ai-cc-button,.ytp-settings-button') || !!node.querySelector('.wupage-ai-cc-button,.ytp-settings-button'))))) this.mount();
    });
    this.observer.observe(player, { childList: true, subtree: true });
    this.update(false, false, "");
    this.mount();
  }

  private mount(): void {
    if (this.disposed) return;
    if (this.shorts) { this.button.remove(); this.controls = undefined; this.settingsButton = undefined; this.setAttached(false); return; }
    const controls = this.player.querySelector<HTMLElement>(".ytp-right-controls");
    if (!controls) { this.setAttached(false); return; }
    const replaced = controls !== this.controls;
    this.controls = controls;
    // YouTube can clone an existing bar, including our button and its old state.
    this.player.querySelectorAll<HTMLButtonElement>(".wupage-ai-cc-button").forEach(button => {
      if (button === this.button) return;
      if (replaced || button.hasAttribute("data-wupage-ai-managed")) button.remove();
      else {
        // A pre-1.9 content script may still own this node after reload. Removing
        // it repeatedly would make both MutationObservers reinsert forever.
        button.setAttribute("data-wupage-ai-retired", "");
        button.setAttribute("aria-hidden", "true"); button.disabled = true;
      }
    });
    const before = controls.querySelector(".ytp-settings-button");
    this.settingsButton = before ?? undefined;
    const parent = before?.parentElement ?? controls;
    if (this.button.parentElement !== parent || (before && !(this.button.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING))) {
      parent.insertBefore(this.button, before);
    }
    if (!this.style.isConnected) this.player.append(this.style);
    this.setAttached(true);
  }

  private setAttached(value: boolean): void {
    if (this.nativeAttached === value) return;
    this.nativeAttached = value; this.attached(value);
  }

  setShorts(value: boolean): void {
    if (this.shorts === value) return;
    this.shorts = value; this.mount();
  }

  update(enabled: boolean, loading: boolean, target: string, human = false): void {
    const label = target || "設定的語言";
    const title = (human && enabled ? `人工雙語字幕（目標：${label}，未使用 AI）` : loading ? `AI 正在翻譯 CC 字幕（目標：${label}）` : enabled ? `AI CC 字幕翻譯中（目標：${label}）` : `AI 字幕（目標：${label}）`) + "；左鍵或右鍵開啟字幕設定";
    if (this.button.title !== title) { this.button.title = title; this.button.setAttribute("aria-label", title); }
    if (this.button.getAttribute("aria-pressed") !== String(enabled)) this.button.setAttribute("aria-pressed", String(enabled));
    if (this.button.getAttribute("aria-busy") !== String(loading)) this.button.setAttribute("aria-busy", String(loading));
  }

  setSettingsOpen(open: boolean): void { this.button.setAttribute("aria-expanded", String(open)); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.observer.disconnect(); this.player.removeEventListener("wupage-ai-cc-takeover", this.superseded);
    this.button.remove(); this.style.remove(); this.setAttached(false);
  }
}
