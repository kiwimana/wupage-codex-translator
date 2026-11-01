// Native YouTube control placement with real Firefox pointer events and ChatGPT.
// DNS overrides apply only to this isolated profile; no system hosts are changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/youtube-control-firefox');
const html=`<!doctype html><meta charset="utf-8"><title>YouTube control fixture</title><style>
body{margin:32px;background:#152329;color:white;font:18px Arial}#movie_player{position:relative;width:960px;height:540px}#movie_player:fullscreen{width:100vw;height:100vh}video{width:100%;height:100%}.ytp-chrome-bottom{position:absolute;bottom:0;left:0;right:0;height:48px;background:#101010c9}.ytp-right-controls{float:right;height:48px;display:flex;align-items:center}.ytp-button{height:48px;background:none;color:white;border:0;cursor:pointer;padding:0 12px}.ytp-right-controls .wupage-ai-cc-button{align-self:stretch}
</style><h1>YouTube AI CC control</h1><div id="movie_player" class="html5-video-player"><video muted playsinline></video><div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="true">CC</button><button class="ytp-settings-button">Settings</button><button class="ytp-fullscreen-button">Fullscreen</button></div></div></div>
<script>const v=document.querySelector('video'),p=document.querySelector('#movie_player'),c=document.createElement('canvas');c.width=960;c.height=540;const ctx=c.getContext('2d');setInterval(()=>{ctx.fillStyle='#20383e';ctx.fillRect(0,0,960,540);ctx.fillStyle='#a9ead3';ctx.font='28px Arial';ctx.fillText('YouTube AI CC control verification',220,220)},100);v.srcObject=c.captureStream(10);
const en=v.addTextTrack('captions','English','en');en.addCue(new VTTCue(0,90,'Welcome. This video explains how subtitles are translated.'));en.mode='showing';
const fr=v.addTextTrack('captions','Français','fr');fr.addCue(new VTTCue(0,90,'Bienvenue. Cette vidéo explique la traduction des sous-titres.'));fr.mode='disabled';window.selectFrench=()=>{en.mode='hidden';fr.mode='showing'};
document.addEventListener('click',e=>{if(e.target.closest('.ytp-fullscreen-button')){if(document.fullscreenElement)document.exitFullscreen();else p.requestFullscreen()}if(e.target===p)document.body.dataset.playerClicks=String(Number(document.body.dataset.playerClicks||0)+1)});</script>`;
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://www.youtube.com:${server.address().port}/watch?v=fixture`;
let firefox;const report={passed:false,checks:[]};const check=name=>{report.checks.push(name);console.log('PASS:',name);};
async function waitFor(read,accept,label,timeout=180000){let value;const start=Date.now();let nextLog=start+15000;do{value=await read();if(accept(value))return value;if(Date.now()>nextLog){console.log('WAIT:',label,JSON.stringify(value));nextLog=Date.now()+15000;}await delay(250);}while(Date.now()-start<timeout);throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'network.dns.localDomains':'www.youtube.com','network.dns.disableIPv6':true,'network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false,'media.autoplay.default':0});
 report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
 const api=async(script,input=null)=>{await firefox.command('WebDriver:SwitchToWindow',{handle:control});const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1];const chrome=window.wrappedJSObject.chrome;const input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);const r=JSON.parse(raw);if(r.error)throw new Error(r.error);return r.value;};
 await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.targetLang='ja';await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`);
 const tab=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(tab.value??tab).handle;const select=()=>firefox.command('WebDriver:SwitchToWindow',{handle:page});await select();await firefox.command('WebDriver:Navigate',{url});
 await waitFor(()=>firefox.execute(`return !!document.querySelector('.ytp-right-controls .wupage-ai-cc-button')`),Boolean,'native AI control');
 const placement=await firefox.execute(`const b=document.querySelector('.wupage-ai-cc-button');return {parent:b.parentElement.className,next:b.nextElementSibling.className,pressed:b.getAttribute('aria-pressed'),title:b.title};`);assert.equal(placement.next,'ytp-settings-button');assert.equal(placement.pressed,'false');
 assert.equal((await api(`return chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'});`)).data.tasks.length,0);await select();
 check('the idle AI button appears in the right controls before Settings even when the subtitle feature is off, with no AI requests');
 const click=async selector=>{const p=await firefox.execute(`const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};`,[selector]);await firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'youtube-controls-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:50,...p},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});};
 const caption=()=>firefox.execute(`const h=document.querySelector('[data-wupage-video]'),r=h?.shadowRoot;return {source:r?.querySelector('.source span')?.textContent,translation:r?.querySelector('.translation span')?.textContent,sourceBottom:r?.querySelector('.source')?.getBoundingClientRect().bottom,translationTop:r?.querySelector('.translation')?.getBoundingClientRect().top,pressed:document.querySelector('.wupage-ai-cc-button')?.getAttribute('aria-pressed'),status:r?.querySelector('.status')?.textContent,error:h?.hasAttribute('data-error')};`).then(r=>{if(r.error)throw new Error(r.status);return r;});
 await firefox.execute('void document.querySelector("video").play()');await click('.wupage-ai-cc-button');
 report.japanese=await waitFor(caption,r=>/[\u3040-\u30ff]/u.test(r.translation||''),'English CC to Japanese');assert.ok(report.japanese.translationTop>=report.japanese.sourceBottom-1);check('a physical control-bar click translates English CC through ChatGPT into the saved Japanese target with original above translation');
 await click('.ytp-fullscreen-button');await waitFor(()=>firefox.execute('return !!document.fullscreenElement'),Boolean,'fullscreen',15000);
 assert.equal(await firefox.execute(`return document.fullscreenElement.contains(document.querySelector('.wupage-ai-cc-button'))`),true);check('the same native AI button remains available in fullscreen');
 await click('.ytp-fullscreen-button');await waitFor(()=>firefox.execute('return !document.fullscreenElement'),Boolean,'exit fullscreen',15000);
 await firefox.execute(`const old=document.querySelector('.ytp-right-controls');const n=old.cloneNode(false);n.innerHTML='<button class="ytp-subtitles-button" aria-pressed="true">CC</button><button class="ytp-settings-button">Settings</button><button class="ytp-fullscreen-button">Fullscreen</button>';old.replaceWith(n);`);
 await waitFor(()=>firefox.execute('return document.querySelectorAll(".ytp-right-controls .wupage-ai-cc-button").length'),n=>n===1,'redrawn controls');check('replacing the YouTube control bar reattaches exactly one AI button');
 await click('.wupage-ai-cc-button');await waitFor(caption,r=>r.pressed==='false'&&!r.translation,'stop');
 await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.targetLang='de';await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`);await select();await firefox.execute('window.wrappedJSObject.selectFrench()');await click('.wupage-ai-cc-button');
 report.german=await waitFor(caption,r=>/Willkommen|Übersetz|Untertitel/u.test(r.translation||''),'French CC to German');assert.match(report.german.source,/Bienvenue/);check('French CC translates into the newly saved German target without hardcoded English or Traditional Chinese');
 await click('.wupage-ai-cc-button');await waitFor(caption,r=>r.pressed==='false'&&!r.translation,'final stop');
 assert.deepEqual(await api(`return Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith('wupage.cache.'));`),[]);await select();check('a second click stops translation and no persistent subtitle cache is created');
 const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'youtube-native-ai-control.png'),Buffer.from(shot.value,'base64'));report.passed=true;
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
