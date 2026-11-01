import { readFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import ts from "typescript";
import OpenCC from "opencc-js";
import type { Plugin as VitePlugin } from "vite";
import type { Plugin as EsbuildPlugin } from "esbuild";

// Build-only dictionary: none of OpenCC or its dictionaries enter the extension.
const convert = OpenCC.Converter({ from: "cn", to: "twp" });
export function traditionalUiText(text: string): string {
  return convert(text).replaceAll("“", "「").replaceAll("”", "」");
}

export function localizeUiSource(code: string, filename: string): string {
  const file = filename.replaceAll("\\", "/");
  // Keep historical labels in migration predicates exactly as originally stored.
  if (file.endsWith("/shared/settings.ts")) return code;
  if (file.endsWith("/local/catalog.json")) {
    const catalog = JSON.parse(code) as Array<{ label: string }>;
    for (const model of catalog) model.label = traditionalUiText(model.label);
    return JSON.stringify(catalog);
  }
  if (file.endsWith(".css")) {
    return code.replace(/(\bcontent\s*:\s*)(["'])(.*?)\2/g,
      (_match, prefix: string, quote: string, text: string) => prefix + quote + traditionalUiText(text) + quote);
  }
  if (!file.endsWith(".ts")) return code;
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const selectorMethods = new Set(["querySelector", "querySelectorAll", "closest", "matches", "getElementById", "getElementsByClassName"]);
  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const parent = node.parent;
      const selector = parent && ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
        && selectorMethods.has(parent.expression.name.text);
      if (!selector && /\p{Script=Han}/u.test(node.text)) {
        const start = node.getStart(source), end = node.getEnd();
        const raw = code.slice(start, end);
        let text = traditionalUiText(raw);
        if (file.endsWith("/shared/languages.ts")) {
          if (node.text === "中文") text = raw.replace("中文", "簡體中文");
          if (node.text === "繁中") text = raw.replace("繁中", "繁體中文");
        }
        if (text !== raw) replacements.push({ start, end, text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const change of replacements.reverse()) code = code.slice(0, change.start) + change.text + code.slice(change.end);
  return code;
}

function appSource(root: string, file: string): boolean {
  const name = relative(root, file).replaceAll("\\", "/");
  return name.startsWith("src/") && /\.(?:ts|css|json)$/.test(name);
}
export function traditionalUiVitePlugin(root: string): VitePlugin {
  return {
    name: "traditional-taiwan-ui", enforce: "pre",
    transform(code, id) {
      if (id.includes("?") || !appSource(root, id)) return;
      const localized = localizeUiSource(code, id);
      if (localized !== code) return { code: localized, map: null };
    },
    transformIndexHtml: { order: "pre", handler(html) {
      return traditionalUiText(html).replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, '$1"zh-TW"');
    } }
  };
}
export function traditionalUiEsbuildPlugin(root: string): EsbuildPlugin {
  return {
    name: "traditional-taiwan-ui",
    setup(build) {
      build.onLoad({ filter: /\.(?:ts|css|json)$/ }, async args => {
        if (!appSource(root, args.path)) return;
        const code = await readFile(args.path, "utf8");
        return { contents: localizeUiSource(code, args.path), resolveDir: dirname(args.path),
          loader: args.path.endsWith(".json") ? "json" : args.path.endsWith(".css") ? "css" : "ts" };
      });
    }
  };
}
