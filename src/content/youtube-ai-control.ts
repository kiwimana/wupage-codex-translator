import { uiIconMarkup } from "../shared/ui-icons";

/** Lives in YouTube's own control bar, including theater mode and fullscreen. */
export class YouTubeAiControl {
  readonly button = document.createElement("button");
  private readonly style = document.createElement("style");
  private readonly observer: MutationObserver;
  private disposed = false;

  constructor(private player: HTMLElement, toggle: () => void, private attached: (value: boolean) => void) {
    this.button.type = "button";
    this.button.className = "ytp-button wupage-ai-cc-button";
    this.button.setAttribute("data-wupage-video-control", "");
    this.button.innerHTML = `${uiIconMarkup("microchip")}<span aria-hidden="true">AI</span>`;
    this.button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); toggle(); });
    this.button.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
    this.style.setAttribute("data-wupage-video-style", "youtube-control");
    this.style.textContent = `
      .ytp-right-controls .wupage-ai-cc-button {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        gap: 3px !important; width: 52px !important; min-width: 44px !important; height: 100% !important;
        box-sizing: border-box !important; padding: 0 4px !important; border: 0 !important;
        position: relative !important; vertical-align: top !important; cursor: pointer !important;
        color: #fff !important; background: transparent !important; opacity: 1 !important;
        font: 700 13px/1 system-ui,sans-serif !important; text-shadow: 0 1px 2px #000;
      }
      .wupage-ai-cc-button > svg { position: static !important; width: 19px !important; height: 19px !important; box-sizing: border-box !important; padding: 0 !important; border: 0 !important; margin: 0 !important; transform: none !important; flex: 0 0 19px !important; fill: currentColor !important; }
      .wupage-ai-cc-button > span { position: static !important; display: inline-block !important; width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; transform: none !important; color: inherit !important; font: inherit !important; white-space: nowrap !important; pointer-events: none; }
      .ytp-right-controls .wupage-ai-cc-button[aria-pressed="true"] { color: #d3bfff !important; }
      .wupage-ai-cc-button[aria-pressed="true"]::after {
        content: ""; position: absolute; bottom: 8%; left: 18%; right: 18%; height: 2px; border-radius: 2px; background: currentColor;
      }
      .wupage-ai-cc-button[aria-busy="true"]::after { animation: wupage-ai-cc-pulse 1s ease-in-out infinite; }
      .wupage-ai-cc-button:focus-visible { outline: 2px solid #d3bfff !important; outline-offset: -3px; }
      @keyframes wupage-ai-cc-pulse { 50% { opacity: .3; } }
      @media (prefers-reduced-motion: reduce) { .wupage-ai-cc-button::after { animation: none !important; } }
    `;
    player.append(this.style);
    this.observer = new MutationObserver(() => this.mount());
    this.observer.observe(player, { childList: true, subtree: true });
    this.update(false, false, "");
    this.mount();
  }

  private mount(): void {
    if (this.disposed) return;
    const controls = this.player.querySelector<HTMLElement>(".ytp-right-controls");
    if (!controls) { this.attached(false); return; }
    const before = controls.querySelector(".ytp-settings-button");
    const parent = before?.parentElement ?? controls;
    if (this.button.parentElement !== parent || (before && this.button.nextElementSibling !== before)) {
      parent.insertBefore(this.button, before);
    }
    if (!this.style.isConnected) this.player.append(this.style);
    this.attached(true);
  }

  update(enabled: boolean, loading: boolean, target: string): void {
    const label = target || "設定的語言";
    const title = enabled ? `停止 AI CC 字幕翻譯（目標：${label}）` : `AI 翻譯 CC 字幕為${label}`;
    if (this.button.title !== title) { this.button.title = title; this.button.setAttribute("aria-label", title); }
    if (this.button.getAttribute("aria-pressed") !== String(enabled)) this.button.setAttribute("aria-pressed", String(enabled));
    if (this.button.getAttribute("aria-busy") !== String(loading)) this.button.setAttribute("aria-busy", String(loading));
  }

  dispose(): void {
    this.disposed = true; this.observer.disconnect(); this.button.remove(); this.style.remove(); this.attached(false);
  }
}
