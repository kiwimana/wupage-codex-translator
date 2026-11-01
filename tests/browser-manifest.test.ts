import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";
import { browserManifest } from "../build/manifest";
import { accountManifest } from "../build/account-manifest";
import chromeIdentity from "../native-chatgpt/chrome-extension.json";
import { createHash } from "node:crypto";

describe("browser package boundaries", () => {
  it("builds the account version for Chrome with a fixed ID, native messaging and module service worker", () => {
    const result = accountManifest(manifest, false);
    expect(result.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(result.permissions).toContain("nativeMessaging");expect(result.permissions).toContain("offscreen");
    expect(result).not.toHaveProperty("browser_specific_settings");expect(result).toHaveProperty("key", chromeIdentity.key);
    const id = [...createHash("sha256").update(Buffer.from(chromeIdentity.key,"base64")).digest("hex").slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join("");
    expect(id).toBe(chromeIdentity.extensionId);
    const firefox = accountManifest(manifest, true);
    expect(firefox).not.toHaveProperty("key");expect(firefox.browser_specific_settings?.gecko.id).toBe("codex-translator@wupage.local");
    expect(firefox.permissions).not.toContain("offscreen");expect(manifest).not.toHaveProperty("key");
  });
  it("preserves the Chromium manifest and leaves the shared source untouched", () => {
    const snapshot = structuredClone(manifest);
    expect(browserManifest(manifest, false)).toEqual(snapshot);
    const firefox = browserManifest(manifest, true);
    expect(manifest).toEqual(snapshot);
    expect(firefox.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(firefox.permissions).not.toContain("offscreen");
    expect(firefox.permissions).toContain("declarativeNetRequestWithHostAccess");
    expect(firefox.content_security_policy.sandbox).toContain("moz-extension:");
    expect(firefox.content_security_policy.sandbox).not.toContain("chrome-extension:");
    expect(firefox.browser_specific_settings?.gecko).toMatchObject({
      strict_min_version: "154.0", data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] }
    });
    expect(firefox.version).toBe(manifest.version);
  });
});
