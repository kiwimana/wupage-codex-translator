// Rendering checks complement delayed-response/cancellation tests in Vitest.
// Set visual states directly; this test must never invoke ChatGPT.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
import {popupExecute} from './lib/firefox-popup.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/cc-loading-firefox');
const html=`<!doctype html><meta charset="utf-8"><title>CC loading rendering</title><style>body{margin:20px;background:#20202a;color:white}#movie_player{position:relative;width:900px;height:506px}video{width:100%;height:100%}.ytp-right-controls{position:absolute;bottom:0;right:0;display:flex;height:48px;background:#171720}.ytp-button{border:0;background:none;color:white;padding:0 12px}</style><div id="movie_player" class="html5-video-player"><video muted playsinline></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button><button class="ytp-fullscreen-button">Fullscreen</button></div></div><script>const v=document.querySelector('video'),c=document.createElement('canvas');c.width=900;c.height=506;v.srcObject=c.captureStream(1);setInterval(()=>{const x=c.getContext('2d');x.fillStyle='#242439';x.fillRect(0,0,900,506)},100);</script>`;
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://www.youtube.com:${server.address().port}/watch?v=loading-fixture`;
let firefox;const report={passed:false,checks:[]};
async function waitFor(read){for(let i=0;i<120;i++){if(await read())return;await delay(100);}throw new Error('UI not ready');}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'network.dns.localDomains':'www.youtube.com','network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false,'ui.prefersReducedMotion':0});
 report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
 const api=async(script,input=null)=>{await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:control});const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1],chrome=window.wrappedJSObject.chrome,input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);const r=JSON.parse(raw);if(r.error)throw new Error(r.error);return r.value;};
 const t=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(t.value??t).handle;
 await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Navigate',{url});
 await waitFor(()=>firefox.execute(`return !!document.querySelector('.wupage-ai-cc-button')`));
 for(const tone of ['light','dark']){
  await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.appearance.mode=input;await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`,tone);
  await api(`const tab=(await chrome.tabs.query({})).find(t=>t.url===input);await chrome.tabs.update(tab.id,{active:true});await chrome.action.openPopup();`,url);await delay(500);
  await waitFor(()=>popupExecute(firefox,`return document.querySelector('#translateCc')?.disabled===false;`));
  const first=await popupExecute(firefox,`const b=document.querySelector('#translateCc');b.setAttribute('aria-busy','true');b.setAttribute('aria-pressed','true');b.textContent='AI 字幕翻譯中 · 停止';const s=window.getComputedStyle(b,'::after');return {name:s.animationName,content:s.content,width:s.width,color:s.borderTopColor,transform:s.transform,overflow:document.documentElement.scrollWidth>window.innerWidth};`);
  assert.equal(first.name,'popup-spin',JSON.stringify(first));assert.equal(first.width,'14px');assert.equal(first.overflow,false);
  await delay(180);const transform=await popupExecute(firefox,`return window.getComputedStyle(document.querySelector('#translateCc'),'::after').transform;`);assert.notEqual(transform,first.transform);
  const encoded=await firefox.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const b=document.querySelector('.webextension-popup-browser'),image=await b.browsingContext.currentWindowGlobal.drawSnapshot(null,1,'rgb(255,255,255)'),canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];})().then(done);`);await fs.writeFile(path.join(output,`cc-loading-${tone}.png`),Buffer.from(encoded,'base64'));
  await popupExecute(firefox,`document.querySelector('#translateCc').setAttribute('aria-busy','false');return true;`);
  assert.equal(await popupExecute(firefox,`return window.getComputedStyle(document.querySelector('#translateCc'),'::after').animationName;`),'none');
  report.checks.push(`${tone} popup: visible animated ring, no overflow, disappears when idle`);
  await firefox.execute(`document.querySelector('.webextension-popup-browser').closest('panel').hidePopup();`);
 }
 await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:page});
 const native=await firefox.execute(`const b=document.querySelector('.wupage-ai-cc-button');b.setAttribute('aria-busy','true');b.setAttribute('aria-pressed','true');const s=window.getComputedStyle(b,'::before'),r=b.getBoundingClientRect(),next=b.nextElementSibling.getBoundingClientRect();return {name:s.animationName,width:s.width,transform:s.transform,overlap:r.right>next.left+.5};`);
 assert.equal(native.name,'wupage-ai-cc-spin');assert.equal(native.width,'16px');assert.equal(native.overlap,false);
 await delay(180);assert.notEqual(await firefox.execute(`return window.getComputedStyle(document.querySelector('.wupage-ai-cc-button'),'::before').transform;`),native.transform);
 const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'cc-loading-player.png'),Buffer.from(shot.value,'base64'));
 await firefox.execute(`document.querySelector('.wupage-ai-cc-button').setAttribute('aria-busy','false');`);
 assert.equal(await firefox.execute(`return window.getComputedStyle(document.querySelector('.wupage-ai-cc-button'),'::before').animationName;`),'none');
 report.checks.push('YouTube player: animated ring without overlap; removed when idle');
 const debug=await api(`return chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'});`);assert.equal(debug.data.tasks.length,0);
 report.translationRequests=0;report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
