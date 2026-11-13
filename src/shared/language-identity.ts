/** Locale differences do not require translation; script differences do. */
export function languageIdentity(value: string | undefined): { language: string; script: string } | undefined {
  if (!value || /^(auto|und)$/iu.test(value)) return undefined;
  try {
    const locale = new Intl.Locale(value.trim().replaceAll("_", "-"));
    const language = locale.language;
    // Bare zh does not identify either Chinese script. Never assume Simplified.
    const script = locale.script ?? (language === "zh" && !locale.region ? "" : locale.maximize().script ?? "");
    return { language, script };
  } catch { return undefined; }
}

export function sameTranslationLanguage(a: string | undefined, b: string | undefined): boolean {
  const left = languageIdentity(a), right = languageIdentity(b);
  return !!left && !!right && left.language === right.language && left.script === right.script;
}
