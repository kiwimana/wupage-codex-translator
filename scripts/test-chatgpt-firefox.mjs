import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFirefox } from './lib/firefox.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.npm-cache/chatgpt-firefox');
const extension = path.join(root, 'dist-firefox-chatgpt');
const server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }).end(
  '<!doctype html><meta charset="utf-8"><title>Desktop translation test</title><style>body{margin:48px;font:18px/1.8 Arial;max-width:800px}</style>'
  + '<main><p>Translate this page only when I click the translation button.</p><p>Close the page to discard these translations.</p></main>'
  + '<script>setTimeout(()=>{const p=document.createElement("p");p.textContent="New text should not be translated before the button is clicked.";document.querySelector("main").append(p)},500)</script>'
));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { passed: false, checks: [] };
let firefox;
const check = name => { report.checks.push(name); console.log('PASS:', name); };
try {
  firefox = await startFirefox(output, extension);
  report.browser = firefox.session.capabilities.browserVersion;
  const controlResponse = await firefox.command('WebDriver:GetWindowHandle');
  const control = controlResponse.value ?? controlResponse;
  const select = handle => firefox.command('WebDriver:SwitchToWindow', { handle });
  const api = async (script, args = []) => {
    await select(control);
    const result = await firefox.executeAsync(`const done=arguments[arguments.length-1];
      const input=JSON.parse(arguments[0]);const chrome=window.wrappedJSObject.chrome;
      (async()=>{${script}})().then(value=>done(JSON.stringify({value})),error=>done(JSON.stringify({error:String(error)})));`, [JSON.stringify(args)]);
    const parsed = JSON.parse(result); if (parsed.error) throw new Error(parsed.error); return parsed.value;
  };
  const runtime = async request => {
    const result = await api('return chrome.runtime.sendMessage(input[0]);', [request]);
    assert.equal(result?.ok, true, JSON.stringify(result)); return result.data;
  };
  const waitFor = async (read, accepts, label, timeout = 30000) => {
    const start = Date.now(); let value;
    do { value = await read(); if (accepts(value)) return value; await delay(100); } while (Date.now() - start < timeout);
    throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);
  };
  await firefox.command('WebDriver:Navigate', { url: `${firefox.base}options.html` });
  let settings = await runtime({ type: 'GET_SETTINGS' });
  assert.equal(settings.activeProviderId, 'chatgpt-desktop'); assert.equal(settings.targetLang, 'zh-TW');
  assert.equal(settings.cacheEnabled, false); assert.equal(settings.autoTranslation.enabled, false);
  assert.equal(settings.videoTranslation.enabled, false); assert.equal(settings.selectionTranslation.enabled, false);
  assert.equal(await firefox.execute('return document.querySelector("#cacheEnabled").disabled'), true);
  await runtime({ type: 'SAVE_SETTINGS', settings: { ...settings, cacheEnabled: true,
    autoTranslation: { enabled: true, nonTargetLanguage: true, presetSites: [], customSites: [] } } });
  settings = await runtime({ type: 'GET_SETTINGS' });
  assert.equal(settings.cacheEnabled, false); assert.equal(settings.autoTranslation.enabled, false);
  check('Traditional Chinese defaults, no persistent cache, automatic translation disabled even after settings changes');
  const tab = await firefox.command('WebDriver:NewWindow', { type: 'tab' });
  const page = (tab.value ?? tab).handle;
  await select(page); await firefox.command('WebDriver:Navigate', { url: `${origin}/page` });
  await waitFor(() => firefox.execute('return !!document.getElementById("wupage-floating-ball")'), Boolean, 'floating button');
  await delay(2500);
  assert.equal((await runtime({ type: 'GET_TRANSLATION_DEBUG' })).tasks.length, 0);
  await select(page);
  assert.equal(await firefox.execute('return document.querySelectorAll(".wupage-translation").length'), 0);
  check('loading a page and adding text while idle send no translation work');
  await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => firefox.execute('return [...document.querySelectorAll(".wupage-translation:not(.wupage-translation-pending)")].map(n=>n.textContent)'),
    texts => texts.length === 3 && texts.every(text => /[\u4e00-\u9fff]/u.test(text)), 'real desktop account translation', 180000);
  await waitFor(() => runtime({ type: 'GET_TRANSLATION_DEBUG' }), value => value.activeCount === 0 && value.queuedCount === 0, 'translation finished');
  await select(page);
  const shot = await firefox.command('WebDriver:TakeScreenshot', { id: null, highlights: [], full: true });
  await fs.writeFile(path.join(output, 'translated-page.png'), Buffer.from(shot.value, 'base64'));
  const cacheKeys = await api('return Object.keys(await chrome.storage.local.get(null)).filter(key=>key.startsWith("wupage.cache."));');
  assert.deepEqual(cacheKeys, []);
  check('one button click returns real Traditional Chinese translations through the installed native host with no persisted translation cache');
  await select(page); await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => firefox.execute('return document.querySelectorAll(".wupage-translation").length'), count => count === 0, 'restore original');
  const completed = (await runtime({ type: 'GET_TRANSLATION_DEBUG' })).tasks.length;
  await select(page); await firefox.command('WebDriver:Navigate', { url: `${origin}/cancel` });
  await waitFor(() => firefox.execute('return !!document.getElementById("wupage-floating-ball")'), Boolean, 'new page');
  await delay(1200);
  assert.equal((await runtime({ type: 'GET_TRANSLATION_DEBUG' })).tasks.length, completed);
  check('restoring the original and opening another page do not automatically start another translation');
  await select(page); await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => runtime({ type: 'GET_TRANSLATION_DEBUG' }), value => value.activeCount > 0, 'pending translation');
  await select(page); await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => runtime({ type: 'GET_TRANSLATION_DEBUG' }), value => value.activeCount === 0 && value.queuedCount === 0, 'stop request');
  await delay(7000); await select(page);
  assert.equal(await firefox.execute('return document.querySelectorAll(".wupage-translation").length'), 0);
  check('a second click stops pending work and late results cannot appear');
  report.passed = true;
} catch (error) { report.error = String(error); throw error; }
finally {
  if (firefox) await firefox.close();
  await new Promise(resolve => server.close(resolve));
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
