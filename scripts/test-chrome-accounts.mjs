// Isolated Chrome/Chromium profile. No login, detection or real AI translation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {applyExtensionUpdate} from '../native-chatgpt/extension-update.mjs';
import {runProcess} from '../native-chatgpt/host.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(root,'.npm-cache/chrome-accounts');await fs.mkdir(output,{recursive:true});
const identity=JSON.parse(await fs.readFile(path.join(root,'native-chatgpt/chrome-extension.json'),'utf8'));
const base=`chrome-extension://${identity.extensionId}/`;
const binary=process.env.CHROME_TEST_BROWSER||path.join(root,'.npm-cache/chrome-test/chrome-win64/chrome.exe');
const profile=await fs.mkdtemp(path.join(output,'profile-'));
const extensionCopy=await fs.mkdtemp(path.join(output,'extension-'));await fs.cp(path.join(root,'dist-chrome-chatgpt'),extensionCopy,{recursive:true});
const report={passed:false,checks:[]};let browser,socket,serial=0;const pending=new Map(),listeners=new Map();
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><p>Manual translation only.</p>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const fixture=`http://127.0.0.1:${server.address().port}/`;
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function evaluate(sessionId,expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(read){for(let i=0;i<150;i++){const value=await read();if(value)return value;await delay(100);}throw new Error('Chrome UI did not settle');}
async function attach(targetId){const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);return sessionId;}
async function page(url){const {targetId}=await send('Target.createTarget',{url});const session=await attach(targetId);return {targetId,session};}
const check=name=>report.checks.push(name);
try{
 browser=spawn(binary,['--headless=new','--screen-info={1600x1200}','--window-size=1400,1000','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let launchLog='';browser.stderr.on('data',b=>{launchLog=(launchLog+b).slice(-6000);});browser.stdout.on('data',()=>{});let launchError;browser.on('error',e=>{launchError=e;});
 const port=await waitFor(async()=>{if(launchError)throw launchError;if(browser.exitCode!==null)throw new Error(launchLog);try{return (await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return false;}});
 const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();report.browser=version.Browser;
 socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const value=JSON.parse(String(event.data));if(value.id){const task=pending.get(value.id);if(!task)return;pending.delete(value.id);clearTimeout(task.timer);if(value.error)task.reject(new Error(JSON.stringify(value.error)));else task.resolve(value.result);}else for(const handler of listeners.get(value.method)||[])handler(value);});
 // Match manual installation: CDP can initially load an unpacked extension
 // without Developer mode, but Chrome then refuses runtime.reload().
 const developerPage=await page('chrome://extensions/');
 await waitFor(()=>evaluate(developerPage.session,`!!globalThis.chrome?.developerPrivate`));
 await evaluate(developerPage.session,`chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true});true`);await delay(200);
 await send('Target.closeTarget',{targetId:developerPage.targetId});
 const loaded=await send('Extensions.loadUnpacked',{path:extensionCopy});assert.equal(loaded.id,identity.extensionId);
 const worker=await waitFor(async()=>{const {targetInfos}=await send('Target.getTargets');return targetInfos.find(t=>t.type==='service_worker'&&t.url.startsWith(base));});
 const workerSession=await attach(worker.targetId);
 await waitFor(()=>evaluate(workerSession,`typeof chrome!=='undefined'&&!!chrome.runtime?.connectNative`));
 await evaluate(workerSession,`globalThis.__accountTestNativeCalls=0;chrome.runtime.connectNative=()=>{globalThis.__accountTestNativeCalls++;throw new Error('Native calls disabled in UI test');};true`);
 const options=await page(base+'options.html');
 await waitFor(()=>evaluate(options.session,`document.querySelector('#providerForm')?.dataset.providerId==='chatgpt-desktop'`));
 const manifest=await evaluate(options.session,`chrome.runtime.getManifest()`);assert.ok(manifest.permissions.includes('nativeMessaging'));assert.equal(manifest.background.service_worker,'background.js');assert.equal(manifest.browser_specific_settings,undefined);
 check('Chrome loads the MV3 account extension with its fixed public identity and module service worker');
 const api=script=>evaluate(options.session,`(async()=>{${script}})()`);
 const current=await api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;`);assert.equal(current.cacheEnabled,false);assert.equal(current.autoTranslation.enabled,false);
 assert.equal(current.skipSameLanguage,true);
 const equalLanguage=await api(`const r=await chrome.runtime.sendMessage({type:'TRANSLATE_BATCH',texts:['Already English.'],sourceLang:'en-US',targetLang:'en'});if(!r.ok)throw new Error(r.error);return r.data;`);
 assert.deepEqual(equalLanguage,{translations:['Already English.'],cached:0,skippedIndexes:[0]});
 await evaluate(options.session,`document.getElementById('skipSameLanguage').checked=false;document.querySelector('#save').click();true`);
 await waitFor(()=>api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.skipSameLanguage===false;`));
 await evaluate(options.session,`document.getElementById('skipSameLanguage').checked=true;document.querySelector('#save').click();true`);
 await waitFor(()=>api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.skipSameLanguage===true;`));
 check('same-language translation is skipped before native work and the general settings switch persists');
 for(const [id,model] of [['chatgpt-desktop','gpt-6-luna'],['gemini-desktop','flash'],['claude-desktop','haiku']]){
  await evaluate(options.session,`document.querySelector('#providerTrigger').click();document.querySelector('[data-action="select"][data-provider-id="${id}"]').click();true`);
  await waitFor(()=>evaluate(options.session,`document.querySelector('#providerForm')?.dataset.providerId==='${id}'`));
  const state=await evaluate(options.session,`(()=>{const m=document.querySelector('#providerModel');return {automatic:m.options[0].textContent,status:document.querySelector('[data-role="desktop-account-status"]').textContent,connectDisabled:document.querySelector('[data-action="desktop-connect"]').disabled};})()`);
  assert.ok(state.automatic.includes('自動'));assert.ok(state.status.includes('尚未偵測'));assert.equal(state.connectDisabled,true);
  await evaluate(options.session,`document.querySelector('#providerModel').value='${model}';document.querySelector('#providerModel').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#save').click();true`);
  await waitFor(()=>api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.providers.find(p=>p.id==='${id}').model==='${model}';`));
  check(`${id}: model saved with manual-only detection and connection`);
 }
 const content=await page(fixture);await waitFor(()=>evaluate(content.session,`document.querySelector('#wupage-floating-hitbox')?.hidden===false`));
 await send('Page.bringToFront',{},content.session);
 const floating=()=>evaluate(content.session,`(()=>{const b=document.getElementById('wupage-floating-ball'),t=document.querySelector('.wupage-floating-tools'),g=document.getElementById('wupage-floating-settings');return {ball:b.getBoundingClientRect().toJSON(),gear:g.getBoundingClientRect().toJSON(),hidden:t.hidden,count:t.querySelectorAll('button').length,menu:!document.getElementById('wupage-floating-menu').hidden};})()`);
 const mouse=async(type,x,y)=>send('Input.dispatchMouseEvent',{type,x,y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},content.session);
 const tap=async(x,y)=>{await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);};
 let f=await floating();assert.equal(f.hidden,true);
 await mouse('mouseMoved',f.ball.left+26,f.ball.top+26);await delay(650);f=await floating();
 assert.equal(f.hidden,false);assert.equal(f.count,1);assert.equal(f.gear.width,40);assert.equal(f.menu,false);
 await tap(f.gear.left+20,f.gear.top+20);assert.equal((await floating()).menu,true);
 await mouse('mouseMoved',20,20);await delay(650);assert.equal((await floating()).menu,true);
 const floatingShot=await send('Page.captureScreenshot',{format:'png'},content.session);await fs.writeFile(path.join(output,'chrome-floating-settings.png'),Buffer.from(floatingShot.data,'base64'));
 await tap(20,20);f=await floating();assert.equal(f.menu,false);assert.equal(f.hidden,true);
 check('floating hover reveals one 40px settings gear; physical clicks keep its panel open until dismissed without AI work');
 const tabId=await api(`return (await chrome.tabs.query({})).find(t=>t.url===${JSON.stringify(fixture)}).id;`);
 await api(`await chrome.tabs.update(${tabId},{active:true});await chrome.action.openPopup();return true;`);
 const popupTarget=await waitFor(async()=>{const {targetInfos}=await send('Target.getTargets');return targetInfos.find(t=>t.url===base+'popup.html');});
 const popup=await attach(popupTarget.targetId);await waitFor(()=>evaluate(popup,`document.querySelector('#desktopModel')?.value==='haiku'`));
 const popupState=await evaluate(popup,`(()=>{const p=document.querySelector('.popup');return {label:document.querySelector('.wupage-provider-name').textContent,mainHeight:p.scrollHeight,clientHeight:p.clientHeight,viewport:innerHeight,horizontal:p.scrollWidth>p.clientWidth};})()`);
 assert.ok(popupState.label.includes('Claude'));assert.equal(popupState.horizontal,false);assert.ok(popupState.mainHeight<=popupState.clientHeight+1&&popupState.mainHeight<=popupState.viewport+1,JSON.stringify(popupState));
 await evaluate(popup,`document.querySelector('#desktopModel').value='sonnet';document.querySelector('#desktopModel').dispatchEvent(new Event('change',{bubbles:true}));true`);await delay(250);
 const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:352,height:popupState.clientHeight,scale:1}},popup);await fs.writeFile(path.join(output,'chrome-popup.png'),Buffer.from(shot.data,'base64'));
 await send('Target.closeTarget',{targetId:popupTarget.targetId});
 assert.equal(await api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.providers.find(p=>p.id==='claude-desktop').model;`),'sonnet');
 check('actual Chrome toolbar popup saves the model and shows all controls without clipping');
 const updateParts=manifest.version.split('.').map(Number);updateParts[2]=(updateParts[2]??0)+1;const updateVersion=updateParts.join('.');
 await evaluate(workerSession,`globalThis.__originalUpdateFetch=globalThis.fetch;globalThis.fetch=(url,options)=>String(url)==='https://api.github.com/repos/kiwimana/wupage-codex-translator/releases/latest'?Promise.resolve(new Response(JSON.stringify({draft:false,prerelease:false,tag_name:'v${updateVersion}',assets:[{name:'wupage-codex-${updateVersion}-chrome.zip',size:100,browser_download_url:'https://github.com/kiwimana/wupage-codex-translator/releases/download/v${updateVersion}/wupage-codex-${updateVersion}-chrome.zip'}]}))):globalThis.__originalUpdateFetch(url,options);true`);
 await evaluate(options.session,`document.querySelector('a[href="#extensionUpdates"]').click();true`);
 await waitFor(()=>evaluate(options.session,`!document.querySelector('#extensionUpdates').hidden&&!document.querySelector('[data-update-now]').disabled`));
 assert.equal(await evaluate(options.session,`document.querySelector('[data-update-auto]').checked`),false);
 await evaluate(options.session,`document.querySelector('[data-update-now]').click();true`);
 await waitFor(()=>evaluate(options.session,`document.querySelector('[data-update-status]').textContent.includes('發現新版 v${updateVersion}')`));
 assert.equal(await evaluate(options.session,`document.querySelector('[data-update-install]').disabled`),false);
 const updateScreenshot=await send('Page.captureScreenshot',{format:'png'},options.session);await fs.writeFile(path.join(output,'chrome-update-settings.png'),Buffer.from(updateScreenshot.data,'base64'));
 check('update settings check a fixture release, show the new version and leave native auto-install off by default');
 const video=await page('about:blank');await send('Page.enable',{},video.session);await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},video.session);await send('Fetch.enable',{patterns:[{urlPattern:'https://www.youtube.com/*',requestStage:'Request'}]},video.session);
 const videoHtml=`<!doctype html><style>#movie_player{position:relative;width:900px;height:506px}video{width:100%;height:100%}.ytp-right-controls{position:absolute;bottom:0;right:0;display:flex;height:48px}.ytp-button{height:48px}</style><div id="movie_player"><video muted playsinline></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button><button class="ytp-settings-button">Settings</button></div></div><script>const c=document.createElement('canvas');c.width=900;c.height=506;document.querySelector('video').srcObject=c.captureStream(1);setInterval(()=>c.getContext('2d').fillRect(0,0,900,506),100);</script>`;
 listeners.set('Fetch.requestPaused',[event=>{if(event.sessionId===video.session)void send('Fetch.fulfillRequest',{requestId:event.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html;charset=utf-8'}],body:Buffer.from(videoHtml).toString('base64')},video.session);}]);
 await send('Page.navigate',{url:'https://www.youtube.com/watch?v=local-fixture'},video.session);
 await waitFor(()=>evaluate(video.session,`!!document.querySelector('.wupage-ai-cc-button')`));
 const control=await evaluate(video.session,`(()=>{const b=document.querySelector('.wupage-ai-cc-button');b.setAttribute('aria-busy','true');return {next:b.nextElementSibling.className,animation:getComputedStyle(b,'::before').animationName};})()`);
 assert.equal(control.next,'ytp-settings-button');assert.equal(control.animation,'wupage-ai-cc-spin');
 check('YouTube player AI button is mounted before Settings and its loading circle renders in Chrome');
 await evaluate(video.session,`document.querySelector('.wupage-ai-cc-button').click();true`);
 await waitFor(()=>evaluate(video.session,`document.querySelector('[data-wupage-video]')?.shadowRoot.querySelector('.panel')?.matches(':popover-open')`));
 const contextMenu=await evaluate(video.session,`(()=>{const host=document.querySelector('[data-wupage-video]'),root=host.shadowRoot,panel=root.querySelector('.panel'),r=panel.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,toolbarHidden:getComputedStyle(root.querySelector('.toolbar')).display==='none',automaticOff:!root.querySelector('.automatic').checked,automaticAvailable:!root.querySelector('.automatic').disabled};})()`);
 assert.ok(contextMenu.left>=0&&contextMenu.right<=contextMenu.width&&contextMenu.top>=0&&contextMenu.bottom<=contextMenu.height,JSON.stringify(contextMenu));
 assert.equal(contextMenu.toolbarHidden,true);assert.equal(contextMenu.automaticOff,true);assert.equal(contextMenu.automaticAvailable,true);
 await evaluate(video.session,`(()=>{const root=document.querySelector('[data-wupage-video]').shadowRoot;root.querySelector('.open-settings').click();const font=root.querySelector('.font');font.value='26';font.dispatchEvent(new Event('change'));return true;})()`);
 await waitFor(()=>api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.videoTranslation.fontSize===26;`));
 const settingsShot=await send('Page.captureScreenshot',{format:'png'},video.session);await fs.writeFile(path.join(output,'chrome-video-context-settings.png'),Buffer.from(settingsShot.data,'base64'));
 await evaluate(video.session,`document.querySelector('[data-wupage-video]').shadowRoot.querySelector('.close').click();true`);
 assert.equal(await evaluate(video.session,`document.querySelector('.wupage-ai-cc-button').getAttribute('aria-expanded')`),'false');
 check('left-click opens the compact menu; its settings dialog saves font size without translating');
 for(let i=0;i<4;i++){
  await evaluate(video.session,`(()=>{const bar=document.querySelector('.ytp-right-controls');bar.replaceWith(bar.cloneNode(true));document.dispatchEvent(new Event('yt-navigate-finish'));return true;})()`);
  await waitFor(()=>evaluate(video.session,`document.querySelectorAll('.wupage-ai-cc-button').length===1`));await delay(200);
  assert.equal(await evaluate(video.session,`document.querySelectorAll('.wupage-ai-cc-button').length`),1);
 }
 await evaluate(video.session,`(()=>{const original=document.querySelector('video');const extra=original.cloneNode(false);extra.srcObject=original.srcObject;original.parentElement.prepend(extra);return true;})()`);await delay(500);
 assert.equal(await evaluate(video.session,`document.querySelectorAll('.wupage-ai-cc-button').length`),1);
 check('repeated YouTube navigation, cloned controls and additional video elements keep exactly one AI button');
 assert.equal(await evaluate(workerSession,'globalThis.__accountTestNativeCalls'),0);
 assert.equal((await api(`return (await chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'})).data;`)).tasks.length,0);
 if(process.platform==='win32'){
  const archive=path.join(profile,'update-fixture.zip');
  const makeArchive=await runProcess('python',['-c',`from pathlib import Path\nimport zipfile,json,sys\nroot=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as archive:\n for file in root.rglob('*'):\n  if file.is_file():\n   data=file.read_bytes()\n   if file.name=='manifest.json':\n    manifest=json.loads(data);manifest['version']=sys.argv[3];data=json.dumps(manifest).encode()\n   archive.writestr(file.relative_to(root).as_posix(),data)`,extensionCopy,archive,updateVersion]);assert.equal(makeArchive.code,0,makeArchive.stderr);
  const bytes=await fs.readFile(archive);
  await applyExtensionUpdate(extensionCopy,{version:updateVersion,size:bytes.length},bytes,createHash('sha256').update(bytes).digest('hex'),async(file,destination,signal)=>{
   const extracted=await runProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'native-chatgpt/extract-update.ps1'),'-Archive',file,'-Destination',destination],{signal});assert.equal(extracted.code,0,extracted.stderr);
  });
  await evaluate(workerSession,'chrome.runtime.reload();true').catch(error=>{if(!/closed|detached|context|target/i.test(String(error)))throw error;});
  await delay(800);
  const reopened=await page(base+'options.html');await delay(500);
  report.reloadState=await evaluate(reopened.session,`({version:globalThis.chrome?.runtime?.getManifest().version,provider:document.querySelector('#providerForm')?.dataset.providerId})`);
  await waitFor(()=>evaluate(reopened.session,`!!document.querySelector('#providerForm')?.dataset.providerId`));
  assert.equal(await evaluate(reopened.session,`chrome.runtime.getManifest().version`),updateVersion);
  const retained=await evaluate(reopened.session,`(async()=>{const r=await chrome.runtime.sendMessage({type:'GET_SETTINGS'});return r.data.providers.find(p=>p.id==='claude-desktop').model;})()`);assert.equal(retained,'sonnet');
  report.installedFixtureVersion=updateVersion;check('real staged update of a loaded Chrome extension reloads the new version and retains model settings');
 }
 report.nativeCalls=0;report.translationRequests=0;report.loginActions=0;report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.error=String(error);throw error;}
finally{
 if(socket){try{await send('Browser.close');}catch{}socket.close();}
 for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Test closed'));}pending.clear();
 if(browser&&browser.exitCode===null)browser.kill();
 await new Promise(r=>server.close(r));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
