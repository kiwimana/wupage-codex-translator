// Opt-in live regression: uses the installed ChatGPT native host and account.
// Run after building firefox-chatgpt; all browser state lives in a test profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFirefox } from './lib/firefox.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.npm-cache/youtube-firefox');
const url = process.env.WUPAGE_YOUTUBE_TEST_URL || 'https://www.youtube.com/watch?v=FgIwWAS08wg';
const report = { passed: false, url, checks: [] };
let firefox;
const check = name => { report.checks.push(name); console.log('PASS:', name); };
async function waitFor(read, accepts, label, timeout = 180000) {
  const start = Date.now(); let value;
  do { value = await read(); if (accepts(value)) return value; await delay(1000); } while (Date.now() - start < timeout);
  throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);
}
try {
  firefox = await startFirefox(output, path.join(root, 'dist-firefox-chatgpt'));
  report.browser = firefox.session.capabilities.browserVersion;
  await firefox.command('WebDriver:Navigate', { url: firefox.base + 'options.html' });
  const control = (await firefox.command('WebDriver:GetWindowHandle')).value;
  const api = async script => {
    await firefox.command('WebDriver:SwitchToWindow', { handle: control });
    const raw = await firefox.executeAsync(`const done=arguments[arguments.length-1];const chrome=window.wrappedJSObject.chrome;
      (async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`);
    const result = JSON.parse(raw); if (result.error) throw new Error(result.error); return result.value;
  };
  const settings = (await api('return chrome.runtime.sendMessage({type:"GET_SETTINGS"});')).data;
  assert.equal(settings.translationDisplayMode, 'bilingual');
  assert.equal(settings.activeProviderId, 'chatgpt-desktop');
  const tab = await firefox.command('WebDriver:NewWindow', { type: 'tab' });
  const page = (tab.value ?? tab).handle;
  const select = () => firefox.command('WebDriver:SwitchToWindow', { handle: page });
  await select(); await firefox.command('WebDriver:Navigate', { url });
  await waitFor(() => firefox.execute('return !!document.querySelector("ytd-watch-metadata h1") && !!document.getElementById("wupage-floating-ball")'), Boolean, 'watch page');
  await delay(5000);
  assert.equal((await api('return chrome.runtime.sendMessage({type:"GET_TRANSLATION_DEBUG"});')).data.tasks.length, 0);
  check('live YouTube watch page stays idle until the floating button is clicked');
  await select(); await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => firefox.execute(`return !!document.querySelector('ytd-watch-metadata h1 .wupage-translation:not(.wupage-translation-pending)');`), Boolean, 'translated title');
  const title = await firefox.execute(`const h=document.querySelector('ytd-watch-metadata h1');
    const t=h.querySelector('.wupage-translation');const s=h.querySelector('yt-formatted-string');
    return {original:s.textContent,translation:t.textContent,mode:t.dataset.wupageMode,display:getComputedStyle(t).display,
      sourceBottom:s.getBoundingClientRect().bottom,translationTop:t.getBoundingClientRect().top};`);
  report.title = title;
  assert.match(title.translation, /[\u4e00-\u9fff]/u);
  assert.equal(title.mode, 'block'); assert.equal(title.display, 'block');
  assert.ok(title.translationTop >= title.sourceBottom - 1, JSON.stringify(title));
  check('real ChatGPT translation appears below the complete original video title');
  await firefox.execute('document.querySelector("ytd-watch-metadata h1").scrollIntoView({block:"start"})');
  await waitFor(() => firefox.execute(`return [...document.querySelectorAll('.ytLockupMetadataViewModelTitle .wupage-translation:not(.wupage-translation-pending),ytd-compact-video-renderer #video-title .wupage-translation:not(.wupage-translation-pending)')].filter(n=>n.getBoundingClientRect().width>0).map(n=>({text:n.textContent,display:getComputedStyle(n).display,clamp:getComputedStyle(n.parentElement).webkitLineClamp,overflow:getComputedStyle(n.parentElement).overflow}));`), value => value.length > 0 && value.every(n => n.display === 'block' && n.clamp === 'none' && n.overflow === 'visible'), 'unclipped recommendation titles');
  check('recommendation title translations occupy their own line and are not hidden by line clamping');
  await waitFor(() => firefox.execute(`return !!document.querySelector('#description-inline-expander .wupage-translation:not(.wupage-translation-pending)')`), Boolean, 'description translation');
  const snippet = await firefox.execute(`const n=document.querySelector('#description-inline-expander #snippet');return {maxHeight:getComputedStyle(n).maxHeight,mask:getComputedStyle(n).maskImage};`);
  assert.equal(snippet.maxHeight, 'none'); assert.equal(snippet.mask, 'none');
  check('collapsed description has space for original text and its translation');
  await firefox.execute(`document.querySelector('#description-inline-expander #expand').click()`);
  await waitFor(() => firefox.execute(`return !!document.querySelector('#description-inline-expander #expanded .wupage-translation:not(.wupage-translation-pending)')`), Boolean, 'expanded description dynamically translated');
  check('expanding the description translates newly revealed text without a second start click');
  await firefox.execute(`document.querySelector('ytd-watch-metadata h1').scrollIntoView({block:'start'})`);
  await delay(1500);
  const shot = await firefox.command('WebDriver:TakeScreenshot', { id: null, highlights: [], full: false });
  await fs.writeFile(path.join(output, 'youtube-bilingual.png'), Buffer.from(shot.value, 'base64'));
  const keys = await api('return Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith("wupage.cache."));');
  assert.deepEqual(keys, []);
  check('translation results create no persistent extension cache');
  await select(); await firefox.execute('document.getElementById("wupage-floating-ball").click()');
  await waitFor(() => firefox.execute('return document.querySelectorAll(".wupage-translation").length'), n => n === 0, 'restore original');
  check('a second floating-button click removes results and restores the original page');
  report.passed = true;
} catch (error) { report.error = String(error); throw error; }
finally {
  if (firefox) await firefox.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
