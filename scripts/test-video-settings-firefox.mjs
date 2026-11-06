// Isolated profile, local YouTube-shaped page, no subtitles or AI account calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
const root=path.resolve('.'),output=path.join(root,'.npm-cache/video-settings-firefox');
await fs.mkdir(output,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#151320;color:white}#movie_player{position:relative;width:min(900px,100%);aspect-ratio:16/9;background:linear-gradient(135deg,#292443,#13272f)}video{width:100%;height:100%}.ytp-right-controls{position:absolute;bottom:8px;right:8px;height:44px;display:flex;gap:4px}.ytp-button{height:44px;color:white;background:transparent;border:0}h1{position:absolute;top:20%;left:7%;font:28px system-ui}</style><div id="movie_player"><video muted playsinline></video><h1>CC subtitle settings preview</h1><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button></div></div>`;
const server=createServer((_req,res)=>res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://www.youtube.com:${server.address().port}/watch?v=settings-fixture`;
const report={passed:false,loginActions:0,translationRequests:0,checks:[]};let firefox;
async function waitFor(script){for(let i=0;i<100;i++){const result=await firefox.execute(script);if(result)return result;await delay(100);}throw new Error('Firefox settings UI did not settle');}
async function readSettings(){return JSON.parse(await firefox.executeAsync(`const done=arguments[arguments.length-1];window.wrappedJSObject.chrome.runtime.sendMessage({type:'GET_SETTINGS'}).then(r=>done(JSON.stringify(r.data)));`));}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'network.dns.localDomains':'www.youtube.com','network.dns.disableIPv6':true,'network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false});
 await firefox.command('WebDriver:SetWindowRect',{width:1100,height:900});
 await firefox.command('WebDriver:Navigate',{url});
 await waitFor(`return !!document.querySelector('.wupage-ai-cc-button');`);
 await firefox.execute(`document.querySelector('.wupage-ai-cc-button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));`);
 await waitFor(`return document.querySelector('[data-wupage-video]')?.shadowRoot.querySelector('.panel')?.matches(':popover-open');`);
 const bounds=JSON.parse(await firefox.execute(`const host=document.querySelector('[data-wupage-video]'),root=host.shadowRoot,panel=root.querySelector('.panel'),r=panel.getBoundingClientRect();return JSON.stringify({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,toolbarHidden:getComputedStyle(root.querySelector('.toolbar')).display==='none',automaticOff:!root.querySelector('.automatic').checked,automaticAvailable:!root.querySelector('.automatic').disabled,pressed:document.querySelector('.wupage-ai-cc-button').getAttribute('aria-pressed')});`));
 assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.width&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
 assert.equal(bounds.toolbarHidden,true);assert.equal(bounds.automaticOff,true);assert.equal(bounds.automaticAvailable,true);assert.equal(bounds.pressed,'false');
 report.checks.push('right-click opens the actual Firefox popover with automatic CC off and no duplicate toolbar');
 await firefox.execute(`const root=document.querySelector('[data-wupage-video]').shadowRoot,font=root.querySelector('.font');font.value='26';font.dispatchEvent(new Event('change'));`);
 await waitFor(`return document.querySelector('[data-wupage-video]').style.getPropertyValue('--wp-video-font')==='26px';`);
 const shot=await firefox.command('WebDriver:TakeScreenshot',{full:false});
 await fs.writeFile(path.join(output,'firefox-video-context-settings.png'),Buffer.from(shot.value??shot,'base64'));
 await firefox.execute(`document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.target').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`);
 assert.equal(await firefox.execute(`return document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').hidden;`),true);
 assert.equal(await firefox.execute(`return document.activeElement===document.querySelector('.wupage-ai-cc-button');`),true);
 await firefox.command('WebDriver:SetWindowRect',{width:430,height:760});
 await firefox.execute(`document.querySelector('.wupage-ai-cc-button').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));`);
 const small=JSON.parse(await firefox.execute(`const r=document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').getBoundingClientRect();return JSON.stringify({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight});`));
 assert.ok(small.left>=0&&small.top>=0&&small.right<=small.width&&small.bottom<=small.height,JSON.stringify(small));
 report.checks.push('Shift+F10 opens the panel on a narrow viewport; Escape restores native-button focus');
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
 await waitFor(`return !!window.wrappedJSObject.chrome?.runtime;`);
 const settings=await readSettings();assert.equal(settings.videoTranslation.fontSize,26);assert.equal(settings.videoTranslation.accountAutoSites?.length??0,0);
 const debug=JSON.parse(await firefox.executeAsync(`const done=arguments[arguments.length-1];window.wrappedJSObject.chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'}).then(r=>done(JSON.stringify(r)));`));
 assert.equal(debug.data.tasks.length,0);report.checks.push('font choice persists without enabling automatic translation or making translation requests');
 report.browser=firefox.session.capabilities.browserVersion;report.passed=true;console.log(JSON.stringify(report));
}finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
