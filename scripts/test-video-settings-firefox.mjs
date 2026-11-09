// Isolated profile, local captions and downloads; no AI account calls.
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
const downloadDirectory=await fs.mkdtemp(path.join(output,'downloads-'));
async function waitFor(script){for(let i=0;i<100;i++){const result=await firefox.execute(script);if(result)return result;await delay(100);}throw new Error('Firefox settings UI did not settle');}
async function readSettings(){return JSON.parse(await firefox.executeAsync(`const done=arguments[arguments.length-1];window.wrappedJSObject.chrome.runtime.sendMessage({type:'GET_SETTINGS'}).then(r=>done(JSON.stringify(r.data)));`));}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'network.dns.localDomains':'www.youtube.com','network.dns.disableIPv6':true,'network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false,'browser.download.folderList':2,'browser.download.dir':downloadDirectory,'browser.download.useDownloadDir':true,'browser.download.always_ask_before_handling_new_types':false,'browser.helperApps.neverAsk.saveToDisk':'application/x-subrip,text/vtt,text/plain'});
 await firefox.command('WebDriver:SetWindowRect',{width:1100,height:900});
 await firefox.command('WebDriver:Navigate',{url});
 await waitFor(`return !!document.querySelector('.wupage-ai-cc-button');`);
 const clickNative=async(selector='.wupage-ai-cc-button')=>{const point=await firefox.execute(`const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};`,[selector]);await firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'long-menu-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:50,...point},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});};
 await firefox.execute(`const track=document.querySelector('video').addTextTrack('captions','English','en');track.mode='hidden';track.addCue(new VTTCue(0,4,'Hello from original CC.'));`);await clickNative();
 await waitFor(`return document.querySelector('[data-wupage-video]')?.shadowRoot.querySelector('.panel')?.matches(':popover-open');`);
 await clickNative();assert.equal(await firefox.execute(`return document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').hidden;`),true);await clickNative();
 const bounds=JSON.parse(await firefox.execute(`const host=document.querySelector('[data-wupage-video]'),root=host.shadowRoot,panel=root.querySelector('.panel'),r=panel.getBoundingClientRect();return JSON.stringify({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,toolbarHidden:getComputedStyle(root.querySelector('.toolbar')).display==='none',automaticOff:!root.querySelector('.automatic').checked,automaticAvailable:!root.querySelector('.automatic').disabled,pressed:document.querySelector('.wupage-ai-cc-button').getAttribute('aria-pressed')});`));
 assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.width&&bounds.bottom<=bounds.height,JSON.stringify(bounds));
 assert.equal(bounds.toolbarHidden,true);assert.equal(bounds.automaticOff,true);assert.equal(bounds.automaticAvailable,true);assert.equal(bounds.pressed,'false');
 report.checks.push('real pointer clicks open and close the native menu without translating or showing duplicate controls');
 await firefox.execute(`document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').style.width='220px';`);await waitFor(`const r=document.querySelector('[data-wupage-video]').shadowRoot;return r.querySelector('.quick-font').getBoundingClientRect().top>r.querySelector('.quick-target').getBoundingClientRect().bottom;`);await firefox.execute(`window.dispatchEvent(new Event('resize'));`);report.checks.push('narrow menus stack language and size controls instead of clipping their labels');

 await firefox.execute(`const root=document.querySelector('[data-wupage-video]').shadowRoot;root.querySelector('.source span').textContent='Would you like to take a seat?';root.querySelector('.translation span').textContent='你想坐下來休息一下嗎？';root.querySelector('.captions').hidden=false;window.dispatchEvent(new Event('resize'));`);
 const reading=await firefox.execute(`const r=document.querySelector('[data-wupage-video]').shadowRoot,c=r.querySelector('.captions').getBoundingClientRect(),m=r.querySelector('.panel').getBoundingClientRect();return {overlap:c.left<m.right&&c.right>m.left&&c.top<m.bottom&&c.bottom>m.top};`);assert.equal(reading.overlap,false);report.checks.push('the long-video menu leaves the bilingual reading area unobstructed');
 const menuShot=await firefox.command('WebDriver:TakeScreenshot',{full:false});await fs.writeFile(path.join(output,'firefox-video-main-menu.png'),Buffer.from(menuShot.value??menuShot,'base64'));
 await firefox.execute(`const root=document.querySelector('[data-wupage-video]').shadowRoot;const font=root.querySelector('.quick-font');font.value='32';font.dispatchEvent(new Event('change'));`);
 await waitFor(`return document.querySelector('[data-wupage-video]').style.getPropertyValue('--wp-video-font')==='32px';`);
 assert.equal(await firefox.execute(`return document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.font').value;`),'32');await firefox.execute(`document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.open-settings').click();`);
 const shot=await firefox.command('WebDriver:TakeScreenshot',{full:false});
 await fs.writeFile(path.join(output,'firefox-video-context-settings.png'),Buffer.from(shot.value??shot,'base64'));
 await firefox.execute(`const root=document.querySelector('[data-wupage-video]').shadowRoot;root.querySelector('.back').click();root.querySelector('.open-download').click();root.querySelector('.download-mode').value='original';root.querySelector('.save-subtitles').click();`);
 let downloaded;
 for(let i=0;i<100;i++){const names=await fs.readdir(downloadDirectory);const file=names.find(name=>name.endsWith('.srt'));if(file){downloaded=await fs.readFile(path.join(downloadDirectory,file),'utf8');if(downloaded.includes('Hello from original CC.'))break;}await delay(100);}
 assert.ok(downloaded?.includes('00:00:00,000 --> 00:00:04,000'),String(downloaded));
 report.checks.push('original SRT downloads to the isolated test folder with valid timestamps and no translation');
 await firefox.execute(`document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.download-mode').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`);
 assert.equal(await firefox.execute(`return document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').hidden;`),true);
 assert.equal(await firefox.execute(`return document.activeElement===document.querySelector('.wupage-ai-cc-button');`),true);
 await firefox.execute(`const p=document.querySelector('#movie_player'),b=document.createElement('button');b.className='ytp-button fullscreen-fixture';b.textContent='Fullscreen';b.onclick=()=>p.requestFullscreen();p.querySelector('.ytp-right-controls').append(b);`);
 await clickNative('.fullscreen-fixture');await waitFor(`return !!document.fullscreenElement;`);await clickNative();
 const fullscreenMenu=await firefox.execute(`const b=document.querySelector('.wupage-ai-cc-button'),r=document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').getBoundingClientRect();return document.fullscreenElement.contains(b)&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;`);assert.equal(fullscreenMenu,true);await clickNative();await firefox.execute('document.exitFullscreen()');await waitFor('return !document.fullscreenElement;');report.checks.push('the same long-video menu opens and closes inside fullscreen without covering native controls');
 await firefox.execute(`const p=document.querySelector('#movie_player');p.style.width='380px';p.style.height='214px';const r=document.querySelector('[data-wupage-video]').shadowRoot;r.querySelector('.source span').textContent='Would you like to take a seat?';r.querySelector('.translation span').textContent='你想坐下來休息一下嗎？';r.querySelector('.captions').hidden=false;window.dispatchEvent(new Event('resize'));`);await clickNative();
 const smallPlayer=await firefox.execute(`const h=document.querySelector('[data-wupage-video]'),r=h.shadowRoot.querySelector('.panel').getBoundingClientRect(),p=h.getBoundingClientRect(),c=h.shadowRoot.querySelector('.captions').getBoundingClientRect();return {outside:r.left>=p.right,captionInside:c.top>=p.top-1&&c.bottom<=p.bottom+1,player:{top:p.top,bottom:p.bottom,width:p.width,height:p.height},caption:{top:c.top,bottom:c.bottom,width:c.width,height:c.height},font:getComputedStyle(h.shadowRoot.querySelector('.captions')).fontSize,container:getComputedStyle(h).containerType};`);assert.equal(smallPlayer.outside,true);assert.equal(smallPlayer.captionInside,true,JSON.stringify(smallPlayer));await clickNative();
 await firefox.execute(`const p=document.querySelector('#movie_player');p.style.width='';p.style.height='';document.body.style.minHeight='1800px';window.dispatchEvent(new Event('resize'));`);await clickNative();await firefox.execute('window.scrollTo(0,800)');await waitFor(`return document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').hidden;`);await firefox.execute(`window.scrollTo(0,0);document.body.style.minHeight='';`);report.checks.push('small long-video menus sit outside the player; scrolling away closes an unanchored menu');
 await firefox.command('WebDriver:SetWindowRect',{width:430,height:760});
 await firefox.execute(`document.querySelector('.wupage-ai-cc-button').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));`);
 const small=JSON.parse(await firefox.execute(`const r=document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.panel').getBoundingClientRect();return JSON.stringify({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight});`));
 assert.ok(small.left>=0&&small.top>=0&&small.right<=small.width&&small.bottom<=small.height,JSON.stringify(small));
 report.checks.push('Shift+F10 opens the panel on a narrow viewport; Escape restores native-button focus');
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
 await waitFor(`return !!window.wrappedJSObject.chrome?.runtime;`);
 const settings=await readSettings();assert.equal(settings.videoTranslation.fontSize,32);assert.equal(settings.videoTranslation.accountAutoSites?.length??0,0);
 const debug=JSON.parse(await firefox.executeAsync(`const done=arguments[arguments.length-1];window.wrappedJSObject.chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'}).then(r=>done(JSON.stringify(r)));`));
 assert.equal(debug.data.tasks.length,0);report.checks.push('font choice persists without enabling automatic translation or making translation requests');
 report.browser=firefox.session.capabilities.browserVersion;report.passed=true;console.log(JSON.stringify(report));
}finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
