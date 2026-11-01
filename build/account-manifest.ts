import { browserManifest } from "./manifest";
import chromeIdentity from "../native-chatgpt/chrome-extension.json";

/** Public key fixes the unpacked Chrome ID; it is not a login credential. */
export function accountManifest(manifest: Parameters<typeof browserManifest>[0], firefox: boolean) {
  const generated = browserManifest(manifest, firefox);
  return { ...generated, name: "WuPage ChatGPT 翻譯", version: manifest.version,
    permissions: [...generated.permissions, "nativeMessaging", "alarms"],
    action: { ...(manifest.action as object), default_title: "WuPage ChatGPT 翻譯" },
    ...(firefox ? { browser_specific_settings: { gecko: { ...generated.browser_specific_settings!.gecko, id: "codex-translator@wupage.local" } } }
      : { key: chromeIdentity.key, minimum_chrome_version: "127" }) };
}
