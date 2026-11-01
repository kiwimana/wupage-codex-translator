declare const __WUPAGE_CHATGPT__: boolean;

export const CHATGPT_BUILD = typeof __WUPAGE_CHATGPT__ !== "undefined" && __WUPAGE_CHATGPT__;
export const CHATGPT_HOST = "org.wupage.codex_bridge";
export const CHATGPT_EXTENSION_ID = "codex-translator@wupage.local";
