// Verify the translated subtitle toolbar does not cover Shorts' own header.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(root,'.npm-cache/shorts-layout-firefox');
const html=`<!doctype html><meta charset="utf-8"><title>Shorts control layout</title><style>
body{margin:24px;background:#111;color:white;font:16px system-ui}#movie_player{position:relative;width:360px;height:640px;background:linear-gradient(#283d43,#152124)}#movie_player:fullscreen{width:100vw;height:100vh}video{width:100%;height:100%}.native-header{position:absolute;top:12px;right:12px;display:flex;gap:4px;height:36px}.native-header button{width:36px;border:0;color:white;background:#1119;border-radius:6px}button{cursor:pointer}.ytp-right-controls{position:absolute;bottom:12px;right:12px;height:40px;display:flex}.ytp-button{height:40px;color:white;background:transparent;border:0}
</style><ytd-reel-video-renderer><div id="movie_player" class="html5-video-player"><video muted playsinline></video><div class="native-header"><button class="native-cc" aria-label="CC">CC</button><button class="native-menu" aria-label="Menu">⋮</button><button class="native-fullscreen" aria-label="Fullscreen">FS</button></div></div></ytd-reel-video-renderer>
<script>document.querySelector('.native-fullscreen').onclick=()=>document.querySelector('#movie_player').requestFullscreen();document.querySelector('.native-cc').onclick=()=>document.body.dataset.ccClicked='true';</script>`;
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={passed:false,checks:[]};let firefox;
const check=name=>{report.checks.push(name);console.log('PASS:',name);};
async function waitFor(script,predicate=Boolean){let value;for(let i=0;i<100;i++){value=await firefox.execute(script);if(predicate(value))return value;await delay(100);}throw new Error(`Layout did not settle: ${JSON.stringify(value)}`);}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'network.dns.localDomains':'www.youtube.com','network.dns.disableIPv6':true,'network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false});
 report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:`http://www.youtube.com:${server.address().port}/shorts/fixture`});
 await waitFor(`return !!document.querySelector('[data-wupage-video][data-shorts]')?.shadowRoot.querySelector('.toolbar')`);
 const click=async(selector,shadow=false)=>{const point=await firefox.execute(`const root=arguments[1]?document.querySelector('[data-wupage-video]').shadowRoot:document;const r=root.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};`,[selector,shadow]);await firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'shorts-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:50,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});};
 const layout=async()=>{await firefox.execute(`document.querySelector('#movie_player').dispatchEvent(new Event('pointerenter'));`);return firefox.execute(`const h=document.querySelector('[data-wupage-video]'),t=h.shadowRoot.querySelector('.toolbar'),r=t.getBoundingClientRect(),p=document.querySelector('#movie_player').getBoundingClientRect();const native=[...document.querySelectorAll('.native-header button')].map(e=>e.getBoundingClientRect());return {toolbar:r.toJSON(),player:p.toJSON(),overlap:native.some(n=>r.left<n.right&&r.right>n.left&&r.top<n.bottom&&r.bottom>n.top),labelHidden:getComputedStyle(h.shadowRoot.querySelector('.label')).display==='none'};`);};
 report.normal=await layout();assert.equal(report.normal.overlap,false);assert.ok(report.normal.toolbar.top>=report.normal.player.top+60);check('Shorts subtitle controls sit below native CC, menu and fullscreen buttons');
 await click('.native-cc');assert.equal(await firefox.execute(`return document.body.dataset.ccClicked`),'true');check('the original Shorts CC button receives a real mouse click');
 await click('.settings',true);await waitFor(`return document.querySelector('[data-wupage-video]').hasAttribute('data-panel')`);check('subtitle settings remain clickable and open normally');await click('.close',true);
 await firefox.execute(`document.querySelector('#movie_player').style.width='180px';document.querySelector('#movie_player').style.height='320px';`);await delay(250);
 report.narrow=await layout();assert.equal(report.narrow.overlap,false);assert.equal(report.narrow.labelHidden,true);assert.ok(report.narrow.toolbar.left>=report.narrow.player.left&&report.narrow.toolbar.right<=report.narrow.player.right);check('a 180-pixel-wide Short keeps compact subtitle controls inside the video without covering native controls');
 await click('.native-fullscreen');await waitFor(`return !!document.fullscreenElement`);report.fullscreen=await layout();assert.equal(report.fullscreen.overlap,false);check('Shorts fullscreen keeps native and translation buttons separate');await firefox.execute('document.exitFullscreen()');await waitFor('return !document.fullscreenElement');
 await layout();const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'shorts-controls.png'),Buffer.from(shot.value,'base64'));
 await firefox.execute(`history.pushState({},'', '/watch?v=normal');const p=document.querySelector('#movie_player');document.body.append(p);document.querySelector('ytd-reel-video-renderer').remove();p.style.width='640px';p.style.height='360px';p.querySelector('.native-header').remove();const controls=document.createElement('div');controls.className='ytp-right-controls';controls.innerHTML='<button class="ytp-button ytp-subtitles-button">CC</button><button class="ytp-button ytp-settings-button">Settings</button>';p.append(controls);document.dispatchEvent(new Event('yt-navigate-finish'));window.dispatchEvent(new Event('resize'));`);
 await waitFor(`return !!document.querySelector('.wupage-ai-cc-button') && !document.querySelector('[data-wupage-video]').hasAttribute('data-shorts')`);
 report.normalVideo=await waitFor(`const h=document.querySelector('[data-wupage-video]');return {attributes:[...h.attributes].map(a=>a.name),display:getComputedStyle(h.shadowRoot.querySelector('.toolbar')).display};`,r=>r.display==='none');check('switching from Shorts to a normal video restores the single native AI control');
 report.passed=true;
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
