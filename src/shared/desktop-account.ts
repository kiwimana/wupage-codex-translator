import type { ChatGPTDesktopConfig, ExtensionSettings } from "./types";

export type DesktopEngine = "codex" | "gemini" | "claude";
export interface DesktopAccountStatus {
  engine: DesktopEngine;
  installed: boolean;
  login: "unchecked";
  bridgeVersion: number;
  launched?: boolean;
}
export const DESKTOP_ACCOUNTS = {
  codex: { name: "ChatGPT 帳號", app: "Codex", models: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"], login: "codex login", docs: "https://developers.openai.com/codex/cli/reference/" },
  gemini: { name: "Gemini 帳號", app: "Gemini CLI", models: ["auto", "pro", "flash"], login: "gemini → Login with Google", docs: "https://geminicli.com/docs/get-started/authentication/" },
  claude: { name: "Claude 帳號", app: "Claude Code", models: ["sonnet", "opus", "haiku"], login: "claude auth login", docs: "https://code.claude.com/docs/en/cli-reference" }
} as const;

export function desktopEngine(provider: ChatGPTDesktopConfig): DesktopEngine { return provider.engine ?? "codex"; }

/** Preserve legacy Codex CC behavior for non-account providers. */
export function accountVideoProviderId(settings: ExtensionSettings): string {
  return settings.providers.find(p => p.id === settings.activeProviderId)?.type === "chatgpt-desktop"
    ? settings.activeProviderId : "chatgpt-desktop";
}
