import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFirefox } from './lib/firefox.mjs';
import { popupExecute, popupClick, popupSelect } from './lib/firefox-popup.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)), output = path.join(root, '.npm-cache/popup-firefox');
let requests = 0;
const server = createServer(async (request, response) => {
  if (request.method === 'POST') {
    let body='';for await(const chunk of request)body+=chunk;
    requests++;const data=JSON.parse(body);response.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'}).end(JSON.stringify({translations:data.texts.map(text=>text.includes('⟪WUPAGESEGMENT')?text.replace(/(⟪WUPAGESEGMENT\d+⟫\n)/g,'$1譯文：'):'譯文：'+text)}));
  } else response.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>Popup interactions</title><style>body{margin:40px;font:18px Arial}</style><p>This paragraph is translated by a local test service.</p>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/page`;
const report={passed:false,checks:[]};let firefox;
const check=name=>{report.checks.push(name);console.log('PASS:',name);};
async function waitFor(read,predicate,label,timeout=10000){const start=Date.now();let value;do{value=await read();if(predicate(value))return value;await delay(100);}while(Date.now()-start<timeout);throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);}
try {
  firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'));
  report.browser=firefox.session.capabilities.browserVersion;
  await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
  const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
  const api=async(script,input=null)=>{
    await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:control});
    const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1];const input=JSON.parse(arguments[0]);const chrome=window.wrappedJSObject.chrome;
      (async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);
    const value=JSON.parse(raw);if(value.error)throw new Error(value.error);return value.value;
  };
  const tab=await firefox.command('WebDriver:NewWindow',{type:'tab'});const page=(tab.value??tab).handle;
  await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Navigate',{url});
  await waitFor(()=>firefox.execute('return !!document.getElementById("wupage-floating-ball")'),Boolean,'content script');
  const open=async()=>{await api(`const tab=(await chrome.tabs.query({})).find(t=>t.url===input);await chrome.tabs.update(tab.id,{active:true});await chrome.action.openPopup();return true;`,url);await delay(700);
    await waitFor(()=>popupExecute(firefox,'return !document.getElementById("floatingBall").disabled'),Boolean,'popup initialization');};
  const settings=()=>popupExecute(firefox,'return (await window.wrappedJSObject.chrome.runtime.sendMessage({type:"GET_SETTINGS"})).data;');
  await open();
  assert.deepEqual(await popupExecute(firefox,'return {label:document.getElementById("autoTranslation").textContent,disabled:document.getElementById("autoTranslation").disabled};'),{label:'手動',disabled:true});
  await popupExecute(firefox,`window.addEventListener('resize',()=>{const list=JSON.parse(document.documentElement.dataset.testEvents||'[]');list.push({type:'resize',height:window.innerHeight});document.documentElement.dataset.testEvents=JSON.stringify(list.slice(-15));});for(const type of ['pointerdown','pointerup','click','change'])document.addEventListener(type,e=>{
    const node=e.target.closest?.('button,select');const list=JSON.parse(document.documentElement.dataset.testEvents||'[]');
    list.push({type,trusted:e.isTrusted,id:node?.id,cls:node?.className,value:node?.dataset.value||node?.value});
    document.documentElement.dataset.testEvents=JSON.stringify(list.slice(-15));},true);return true;`);
  report.popupSize=await popupExecute(firefox,'return {width:window.innerWidth,height:window.innerHeight};');
  assert.equal(await popupSelect(firefox,'#sourceLang','en'),'en');
  await waitFor(settings,s=>s.sourceLang==='en','source language save');
  assert.equal(await popupSelect(firefox,'#targetLang','ja'),'ja');
  await waitFor(settings,s=>s.targetLang==='ja','target language save');
  assert.equal(await popupSelect(firefox,'#translationDisplayMode','replace'),'replace');
  await waitFor(settings,s=>s.translationDisplayMode==='replace','display mode save');
  check('native keyboard changes source, target and display mode and saves them from the real toolbar popup');
  await popupClick(firefox,'.wupage-provider-trigger');
  await delay(200);const dropdown=await popupExecute(firefox,'return {events:JSON.parse(document.documentElement.dataset.testEvents||"[]"),open:!document.querySelector(".wupage-provider-list").hidden};');
  assert.equal(dropdown.open,true);report.resizeEventsWhileMenuOpen=dropdown.events.filter(e=>e.type==='resize').length;
  await popupClick(firefox,'.wupage-provider-choice[data-value="google-web-translate"]');
  await waitFor(async()=>(await settings()).activeProviderId,id=>id==='google-web-translate','provider save');
  await popupClick(firefox,'.wupage-provider-trigger');await popupClick(firefox,'.wupage-provider-choice[data-value="chatgpt-desktop"]');
  await waitFor(settings,s=>s.activeProviderId==='chatgpt-desktop','ChatGPT provider save');
  check('real mouse clicks open the service dropdown and save the chosen provider');
  for(const [id,field]of [['floatingBall','floatingBallEnabled'],['contextMenuTranslation','contextMenuTranslationEnabled']]){
    const before=(await settings())[field];await popupClick(firefox,'#'+id);await waitFor(settings,s=>s[field]===!before,id+' off');await popupClick(firefox,'#'+id);await waitFor(settings,s=>s[field]===before,id+' restore');
  }
  const selected=(await settings()).selectionTranslation.enabled;await popupClick(firefox,'#selectionTranslation');await waitFor(settings,s=>s.selectionTranslation.enabled===!selected,'selection toggle');
  await popupClick(firefox,'#selectionTranslation');await waitFor(settings,s=>s.selectionTranslation.enabled===selected,'selection restore');
  check('floating-ball, right-click and selection switches save and restore their values');
  assert.equal(await popupExecute(firefox,'return !document.getElementById("translateCc").hidden && document.getElementById("videoTranslation").hidden'),true);
  await popupClick(firefox,'#paragraphMode');await waitFor(()=>popupExecute(firefox,'return document.getElementById("paragraphMode").getAttribute("aria-pressed")'),s=>s==='true','paragraph enable');
  await popupClick(firefox,'#paragraphMode');await waitFor(()=>popupExecute(firefox,'return document.getElementById("paragraphMode").getAttribute("aria-pressed")'),s=>s==='false','paragraph restore');
  await popupClick(firefox,'#clearCache');await waitFor(()=>popupExecute(firefox,'return document.getElementById("status").textContent'),s=>s.includes('已清除'),'clear cache');
  check('AI CC action is visible; paragraph switches and clear-cache action work; automatic translation is explicitly marked manual');
  await firefox.command('Marionette:SetContext',{value:'chrome'});
  const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:true});await fs.writeFile(path.join(output,'toolbar-popup.png'),Buffer.from(shot.value,'base64'));
  await firefox.execute('document.querySelector(".webextension-popup-browser").closest("panel").hidePopup();');
  await open();const persisted=await settings();assert.equal(persisted.sourceLang,'en');assert.equal(persisted.targetLang,'ja');assert.equal(persisted.translationDisplayMode,'replace');
  check('saved popup selections remain after closing and reopening the toolbar popup');
  await firefox.command('Marionette:SetContext',{value:'chrome'});await firefox.execute('document.querySelector(".webextension-popup-browser").closest("panel").hidePopup();');
  await api(`let r=await chrome.runtime.sendMessage({type:'GET_SETTINGS'});const s=r.data;s.activeProviderId='http-template';s.targetLang='zh-TW';s.translationDisplayMode='bilingual';Object.assign(s.providers.find(p=>p.id==='http-template'),{url:input,bodyTemplate:'{"texts":{{json texts}}}',responsePath:'translations'});return chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`,url);
  const configured=await api(`const r=await chrome.runtime.sendMessage({type:'GET_SETTINGS'});return r.data.activeProviderId;`);assert.equal(configured,'http-template');
  await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Refresh');
  await waitFor(()=>firefox.execute('return document.getElementById("wupage-floating-ball")?.getBoundingClientRect().width>0&&!document.getElementById("wupage-floating-hitbox").hidden'),Boolean,'floating ready');
  await firefox.execute(`for(const type of ['pointerdown','pointerup','lostpointercapture','pointercancel','click'])document.addEventListener(type,e=>{
    const events=JSON.parse(document.documentElement.dataset.ballEvents||'[]');events.push({type,id:e.target.id,tag:e.target.tagName,x:e.clientX,y:e.clientY});document.documentElement.dataset.ballEvents=JSON.stringify(events.slice(-12));},true);`);
  const point=await firefox.execute('const r=document.getElementById("wupage-floating-ball").getBoundingClientRect();return {x:Math.round(Math.min(innerWidth-8,r.left+r.width/2)),y:Math.round(r.top+r.height/2)};');
  await firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,...point},{type:'pause',duration:650},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
  await waitFor(()=>firefox.execute('return document.body.textContent'),text=>text?.includes('譯文：'),'physical floating button click');
  report.floatingClickEvents=await firefox.execute('return JSON.parse(document.documentElement.dataset.ballEvents||"[]").map(e=>e.type);');
  assert.equal(requests,1);check('a physical pointer click on the floating ball triggers translation once');
  await open();await popupClick(firefox,'#pageToggle');await waitFor(()=>popupExecute(firefox,'return document.getElementById("status").textContent'),s=>s.includes('原文'),'popup restore original');
  await popupClick(firefox,'#pageToggle');await waitFor(()=>popupExecute(firefox,'return document.getElementById("status").textContent'),s=>s.includes('已翻譯'),'popup translate');
  assert.equal(requests,1);check('the popup page-translation button restores original text and reuses completed in-page translations');
  await popupClick(firefox,'#openPdfWorkspace');
  await waitFor(()=>api('return (await chrome.tabs.query({})).some(t=>t.url===chrome.runtime.getURL("pdf.html"));'),Boolean,'PDF workspace');
  await open();await popupClick(firefox,'#openOptions');
  await waitFor(()=>api('return (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.url;'),s=>s===firefox.base+'options.html','options button');
  check('PDF workspace and full settings open directly from the toolbar popup');
  report.passed=true;
}catch(error){report.error=String(error);throw error;}finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
