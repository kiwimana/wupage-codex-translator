/** Scoped rules keep page typography and layout independent of the controls. */
export const floatingRefreshStyles = `
  #wupage-floating-hitbox[data-quick-settings] .wupage-floating-tools {
    all: initial;
    position: absolute;
    left: 0;
    top: calc(var(--wp-floating-padding) + var(--wp-floating-size));
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 8px 0;
    pointer-events: auto;
    animation: wupage-floating-tools-enter 140ms ease-out;
  }
  #wupage-floating-hitbox[data-quick-settings] .wupage-floating-tools[hidden] { display: none; }
  #wupage-floating-hitbox[data-tools-placement="above"] .wupage-floating-tools {
    top: auto;
    bottom: calc(var(--wp-floating-padding) + var(--wp-floating-size));
  }
  #wupage-floating-settings {
    all: initial;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--wp-border, #45434d);
    border-radius: 50%;
    color: var(--wp-foreground, #f4f2fa);
    background: var(--wp-surface, #24222b);
    box-shadow: 0 4px 14px #0003;
    cursor: pointer;
    touch-action: manipulation;
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  #wupage-floating-settings svg { width: 19px; height: 19px; }
  #wupage-floating-settings:hover, #wupage-floating-settings[aria-expanded="true"] {
    color: var(--wp-accent, #c9afff);
    background: var(--wp-selected, #35303f);
    box-shadow: 0 5px 18px #0004;
  }
  #wupage-floating-settings:focus-visible { outline: 3px solid var(--wp-accent, #c9afff); outline-offset: 3px; }
  @keyframes wupage-floating-tools-enter { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) {
    #wupage-floating-settings { transition: none; }
    #wupage-floating-hitbox[data-quick-settings] .wupage-floating-tools { animation: none; }
  }
  #wupage-floating-ball {
    border: 1px solid color-mix(in srgb, var(--wp-floating-foreground) 20%, transparent);
    border-radius: 50%;
    background: linear-gradient(145deg, color-mix(in srgb, var(--wp-floating-background) 88%, #fff), var(--wp-floating-background));
    box-shadow: 0 5px 18px #17112730, inset 0 1px 0 #ffffff30;
  }
  #wupage-floating-ball > .wupage-floating-label {
    font-family: "Microsoft JhengHei UI", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
    font-size: 20px; font-weight: 650;
  }
  #wupage-floating-ball:hover { box-shadow: 0 6px 22px #17112740, inset 0 1px 0 #ffffff40; }
  #wupage-floating-menu {
    width: 328px; grid-template-columns: minmax(0, 1fr); padding: 18px; gap: 14px; border-radius: 20px;
    box-shadow: 0 16px 60px #17112726, 0 3px 12px #17112712;
    font: 13px/1.5 "Microsoft JhengHei UI", "PingFang TC", system-ui, sans-serif;
    scrollbar-width: thin;
  }
  #wupage-floating-menu > * { min-width: 0; }
  #wupage-floating-menu .wupage-menu-top { gap: 16px; order: 0; }
  #wupage-floating-menu > .wupage-menu-field { order: 1; }
  #wupage-floating-menu .wupage-menu-header { min-height: 40px; }
  #wupage-floating-menu .wupage-brand { display: flex; align-items: center; gap: 10px; }
  #wupage-floating-menu .wupage-brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; color: var(--wp-on-accent); background: var(--wp-accent); }
  #wupage-floating-menu .wupage-brand-mark svg { width: 22px; height: 22px; }
  #wupage-floating-menu .wupage-menu-header strong { display: block; font-size: 18px; letter-spacing: -.5px; }
  #wupage-floating-menu .wupage-brand-description { display: block; margin-top: 3px; color: var(--wp-muted); font: 10px/1.3 system-ui,sans-serif; letter-spacing: .8px; }
  #wupage-floating-menu .wupage-menu-header button { width: 34px; min-height: 34px; border: 1px solid var(--wp-border); border-radius: 11px; background: var(--wp-surface); }
  #wupage-floating-menu .wupage-menu-header button svg { width: 17px; height: 17px; }
  #wupage-floating-menu .wupage-language-pair { display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr) max-content; padding: 4px; gap: 4px; border: 1px solid var(--wp-border); border-radius: 14px; background: var(--wp-soft); }
  #wupage-floating-menu .wupage-language-select { flex: 1 1 0; min-width: 0; }
  #wupage-floating-menu .wupage-language-select select { border-radius: 10px; background: transparent; }
  #wupage-floating-menu .wupage-language-value { font-weight: 600; }
  #wupage-floating-menu .wupage-language-automatic { margin-left: 0; }
  #wupage-floating-menu .wupage-language-automatic .wupage-language-auto { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; flex: none; min-height: 28px; min-width: 44px; width: auto; padding: 0 8px; gap: 0; border: 0; border-radius: 8px; font-size: 11px; line-height: 1.4; white-space: nowrap; background: var(--wp-surface); color: var(--wp-muted); }
  #wupage-floating-menu .wupage-provider-select { height: 38px; }
  #wupage-floating-menu .wupage-field-label { font-size: 11px; margin-bottom: 7px; }
  #wupage-floating-menu select[data-role="display-mode"] { min-height: 38px; border-radius: 10px; }
  #wupage-floating-menu .wupage-translation-actions { order: 2; gap: 8px; }
  #wupage-floating-menu button[data-action="page-toggle"] { flex: 1.6; min-height: 44px; border-radius: 12px; font-size: 14px; font-weight: 650; letter-spacing: .5px; }
  #wupage-floating-menu .wupage-feature-buttons { order: 3; gap: 7px; }
  #wupage-floating-menu .wupage-feature-button { justify-content: space-between; min-height: 38px; padding: 0 10px; border: 1px solid var(--wp-border); border-radius: 10px; font-size: 12px; font-weight: 500; }
  #wupage-floating-menu .wupage-feature-button[aria-pressed="true"] { border: 1px solid var(--wp-border); background: var(--wp-surface); box-shadow: none; color: var(--wp-foreground); }
  #wupage-floating-menu .wupage-feature-indicator { visibility: visible; width: 25px; height: 15px; border-radius: 99px; background: var(--wp-border); }
  #wupage-floating-menu .wupage-feature-indicator::after { inset: 3px auto auto 3px; width: 9px; height: 9px; border: 0; background: var(--wp-surface); box-shadow: 0 1px 2px #0002; }
  #wupage-floating-menu .wupage-feature-button[aria-pressed="true"] .wupage-feature-indicator { background: var(--wp-accent); }
  #wupage-floating-menu .wupage-feature-button[aria-pressed="true"] .wupage-feature-indicator::after { transform: translateX(10px); background: var(--wp-on-accent); }
  #wupage-floating-menu .image-feature-row { border: 1px solid var(--wp-border); border-radius: 10px; min-height: 38px; padding-right: 5px; }
  #wupage-floating-menu .image-feature-row:has([aria-pressed="true"]) { border: 1px solid var(--wp-border); box-shadow: none; }
  #wupage-floating-menu .image-feature-row .wupage-feature-button { justify-content: center; border: 0; background: transparent; }
  #wupage-floating-menu button[data-action="paragraph-mode"] { justify-content: center; }
  #wupage-floating-menu button[data-action="paragraph-mode"] .wupage-feature-indicator { display: none; }
  #wupage-floating-menu button[data-action="paragraph-mode"][aria-pressed="true"] { background: var(--wp-selected); color: var(--wp-accent); }
  #wupage-floating-menu .wupage-translation-feedback { order: 4; }
  #wupage-floating-menu [data-role="translation-status"] { color: var(--wp-muted); font-size: 11px; line-height: 1.6; }
  #wupage-floating-menu .wupage-menu-hint { order: 5; }
  #wupage-floating-menu .wupage-session-note { order: 6; border-top: 1px solid var(--wp-border); margin: 0; padding-top: 10px; color: var(--wp-muted); text-align: center; font: 10px/1.5 system-ui,sans-serif; }
`;
