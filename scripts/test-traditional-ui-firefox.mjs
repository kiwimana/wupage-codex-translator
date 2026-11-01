import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import OpenCC from 'opencc-js';
import { startFirefox } from './lib/firefox.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.npm-cache/traditional-ui-firefox');
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
const report = { passed: false, checks: [], snapshots: [] };
const original = '这是网页原文，软件设置不会被改写。';
const server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' })
  .end(`<!doctype html><meta charset="utf-8"><title>UI localization fixture</title><style>body{margin:48px;font:18px Arial}</style><p id="original">${original}</p>`));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let firefox;
function check(name) { report.checks.push(name); console.log('PASS:', name); }
try {
  firefox = await startFirefox(output, path.join(root, 'dist-firefox-chatgpt'));
  report.browser = firefox.session.capabilities.browserVersion;
  const controlResponse = await firefox.command('WebDriver:GetWindowHandle');
  const control = controlResponse.value ?? controlResponse;
  const select = handle => firefox.command('WebDriver:SwitchToWindow', { handle });
  const api = async (script, input) => {
    await select(control);
    const raw = await firefox.executeAsync(`const done=arguments[arguments.length-1];const input=JSON.parse(arguments[0]);
      const chrome=window.wrappedJSObject.chrome;(async()=>{${script}})().then(value=>done(JSON.stringify({value})),error=>done(JSON.stringify({error:String(error)})));`, [JSON.stringify(input)]);
    const parsed = JSON.parse(raw); if (parsed.error) throw new Error(parsed.error); return parsed.value;
  };
  const runtime = async request => {
    const result = await api('return chrome.runtime.sendMessage(input);', request);
    assert.equal(result?.ok, true, JSON.stringify(result)); return result.data;
  };
  async function waitFor(read, accepts, name) {
    const start = Date.now(); let result;
    do { result = await read(); if (accepts(result)) return result; await delay(100); } while (Date.now() - start < 10000);
    throw new Error(`Timed out ${name}: ${JSON.stringify(result)}`);
  }
  async function audit(name, selector = 'body') {
    const values = await firefox.execute(`const root=document.querySelector(arguments[0]);
      if(!root)throw new Error('Missing audit root');const nodes=[root,...root.querySelectorAll('*')];
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;const text=[];
      while(n=walker.nextNode())if(!n.parentElement.closest('script,style,textarea,code,pre'))text.push(n.textContent);
      for(const el of nodes)for(const a of ['title','aria-label','placeholder'])if(el.hasAttribute(a))text.push(el.getAttribute(a));
      return text.filter(s=>/\\p{Script=Han}/u.test(s));`, [selector]);
    const residual = values.filter(value => converter(value).replaceAll('“', '「').replaceAll('”', '」') !== value);
    assert.deepEqual(residual, [], `${name}: residual Simplified Chinese or unlocalized terminology`);
    report.snapshots.push({ name, chineseStrings: values.length });
  }
  async function screenshot(name) {
    const shot = await firefox.command('WebDriver:TakeScreenshot', { id: null, highlights: [], full: true });
    await fs.writeFile(path.join(output, name), Buffer.from(shot.value, 'base64'));
  }
  await firefox.command('WebDriver:Navigate', { url: `${firefox.base}options.html` });
  let settings = await runtime({ type: 'GET_SETTINGS' });
  assert.equal(settings.activeProviderId, 'chatgpt-desktop');
  assert.equal(await firefox.execute('return document.documentElement.lang'), 'zh-TW');
  await waitFor(() => firefox.execute('return document.querySelectorAll("#targetLang option").length'), n => n > 5, 'language options');
  assert.equal(await firefox.execute('return document.querySelector(arguments[0]).textContent', ['#targetLang option[value="zh-TW"]']), '繁體中文');
  assert.equal(await firefox.execute('return document.querySelector(arguments[0]).textContent', ['#targetLang option[value="zh-CN"]']), '簡體中文');
  await audit('settings-all-static-content');
  const categories = await firefox.execute('return [...document.querySelectorAll(".settings-nav a")].map(a=>a.getAttribute("href"));');
  for (const category of categories) {
    await firefox.execute('document.querySelector(`.settings-nav a[href="${arguments[0]}"]`).click();', [category]);
    await audit(`settings-${category}`);
  }
  await firefox.execute('document.querySelector(arguments[0]).click();', ['.settings-nav a[href="#providerSettings"]']);
  const providerIds = await firefox.execute('return [...document.querySelectorAll("[data-action=select][data-provider-id]")].filter(b=>!b.disabled).map(b=>b.dataset.providerId);');
  for (const id of providerIds) {
    await firefox.execute('document.querySelector(`[data-action=select][data-provider-id="${arguments[0]}"]`).click();', [id]);
    await waitFor(() => firefox.execute('return document.querySelector("#providerForm").dataset.providerId'), value => value === id, `provider ${id}`);
    if (id === 'firefox-local') {
      const status = await waitFor(() => firefox.execute('return document.querySelector("[data-local=status]").textContent'),
        value => !value.includes('正在檢查'), 'local runtime initialization');
      assert.ok(!/undefined|hasDocument|offscreen/i.test(status), status);
    }
    await audit(`provider-${id}`, '#providerForm');
  }
  await firefox.execute('document.querySelector(arguments[0]).click();', ['[data-action=select][data-provider-id="chatgpt-desktop"]']);
  await waitFor(() => firefox.execute('return document.querySelector("#providerForm").dataset.providerId'), id => id === 'chatgpt-desktop', 'ChatGPT provider');
  await screenshot('settings-traditional.png');
  check('all settings categories and provider forms use Traditional Chinese with explicit language labels');
  const old = settings.providers.find(p => p.id === 'microsoft-web-translate'); old.label = 'Microsoft 翻译';
  await runtime({ type: 'SAVE_SETTINGS', settings }); settings = await runtime({ type: 'GET_SETTINGS' });
  assert.equal(settings.providers.find(p => p.id === old.id).label, 'Microsoft 翻譯');
  assert.equal(settings.cacheEnabled, false); assert.equal(settings.autoTranslation.enabled, false);
  check('existing built-in Simplified provider labels migrate without changing no-cache or manual-trigger settings');
  await firefox.command('WebDriver:Navigate', { url: `${firefox.base}popup.html` });
  await waitFor(() => firefox.execute('return document.querySelectorAll("select option").length'), n => n > 5, 'popup initialization');
  await audit('popup'); await screenshot('popup-traditional.png');
  await firefox.command('WebDriver:Navigate', { url: `${firefox.base}pdf.html` });
  await waitFor(() => firefox.execute('return document.querySelectorAll("select option").length'), n => n > 5, 'PDF initialization');
  await audit('pdf-workspace'); await screenshot('pdf-traditional.png');
  check('popup and PDF workspace render localized static text, dynamic controls, tooltips and placeholders');
  await firefox.command('WebDriver:Navigate', { url: `${firefox.base}options.html` });
  const tab = await firefox.command('WebDriver:NewWindow', { type: 'tab' }); const page = (tab.value ?? tab).handle;
  await select(page); await firefox.command('WebDriver:Navigate', { url: origin });
  await waitFor(() => firefox.execute('return !!document.getElementById("wupage-floating-ball")'), Boolean, 'floating UI');
  assert.equal(await firefox.execute('return document.getElementById("wupage-floating-ball").textContent'), '譯');
  await firefox.execute('document.getElementById("wupage-floating-hitbox").dispatchEvent(new PointerEvent("pointerenter",{pointerType:"mouse"}));');
  await delay(650); await audit('floating-menu', '#wupage-floating-menu');
  assert.equal(await firefox.execute('return document.getElementById("original").textContent'), original);
  await screenshot('floating-traditional.png');
  assert.equal((await runtime({ type: 'GET_TRANSLATION_DEBUG' })).tasks.length, 0);
  check('floating controls are Traditional Chinese while page source stays unchanged and no translation is started');
  report.passed = true;
} catch (error) {
  report.error = String(error); throw error;
} finally {
  if (firefox) await firefox.close();
  await new Promise(resolve => server.close(resolve));
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
