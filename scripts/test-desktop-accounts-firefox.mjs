// Model selection/rendering only. Never click detect, connect, test or translate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
import {popupExecute} from './lib/firefox-popup.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/desktop-accounts-firefox');
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>Model settings fixture</title><p>Opening settings must never start translation or login.</p>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
let firefox;const report={passed:false,checks:[]};
async function waitFor(read){for(let i=0;i<120;i++){if(await read())return;await delay(100);}throw new Error('UI not ready');}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'));report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
 const api=async(script,input=null)=>{await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:control});const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1],chrome=window.wrappedJSObject.chrome,input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);const r=JSON.parse(raw);if(r.error)throw new Error(r.error);return r.value;};
 const t=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(t.value??t).handle;await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Navigate',{url});
 for(const [id,model,next] of [['chatgpt-desktop','gpt-6-luna','gpt-6.1-sol'],['gemini-desktop','flash','pro'],['claude-desktop','haiku','sonnet']]){
  await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.activeProviderId=input.id;s.providers.find(p=>p.id===input.id).model=input.model;await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`,{id,model});
  await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
  await waitFor(()=>firefox.execute(`return document.querySelector('#providerForm')?.dataset.providerId===arguments[0]`,[id]));
  const state=await firefox.execute(`const f=document.querySelector('#providerForm'),m=f.querySelector('#providerModel');return {model:m.value,automatic:m.options[0].textContent,status:f.querySelector('[data-role="desktop-account-status"]').textContent,connectDisabled:f.querySelector('[data-action="desktop-connect"]').disabled,overflow:document.documentElement.scrollWidth>innerWidth};`);
  assert.equal(state.model,model);assert.ok(state.automatic.includes('自動'));assert.ok(state.status.includes('尚未偵測'));assert.equal(state.connectDisabled,true);assert.equal(state.overflow,false);
  report.checks.push(`${id}: model settings shown without detection/login`);
  await api(`const tab=(await chrome.tabs.query({})).find(t=>t.url===input);await chrome.tabs.update(tab.id,{active:true});await chrome.action.openPopup();`,url);await delay(500);
  await waitFor(()=>popupExecute(firefox,`return document.querySelector('#desktopModel')?.value===input`,model));
  const popup=await popupExecute(firefox,`const s=document.querySelector('#desktopModel');s.value=input;s.dispatchEvent(new window.Event('change',{bubbles:true}));return {text:document.querySelector('.wupage-provider-name').textContent,overflow:document.documentElement.scrollWidth>window.innerWidth,height:document.documentElement.scrollHeight,viewport:window.innerHeight,mainScroll:document.querySelector('.popup').scrollHeight,padding:window.getComputedStyle(document.querySelector('.popup')).padding,gap:window.getComputedStyle(document.querySelector('.popup')).gap,topGap:window.getComputedStyle(document.querySelector('.popup-top')).gap,scrollClipped:document.querySelector('.popup').scrollHeight>document.querySelector('.popup').clientHeight+1};`,next);
  assert.equal(popup.overflow,false);assert.equal(popup.scrollClipped,false,JSON.stringify(popup));assert.ok(popup.height<=popup.viewport+1,JSON.stringify(popup));await delay(250);
  const encoded=await firefox.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const b=document.querySelector('.webextension-popup-browser'),image=await b.browsingContext.currentWindowGlobal.drawSnapshot(null,1,'rgb(255,255,255)'),canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];})().then(done);`);await fs.writeFile(path.join(output,id+'.png'),Buffer.from(encoded,'base64'));
  await firefox.execute(`document.querySelector('.webextension-popup-browser').closest('panel').hidePopup();`);
  const saved=await api(`return (await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data.providers.find(p=>p.id===input).model;`,id);assert.equal(saved,next);
  report.checks.push(`${id}: popup model selection persists, no clipping`);
 }
 assert.equal((await api(`return chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'});`)).data.tasks.length,0);
 report.translationRequests=0;report.loginActions=0;report.detectionActions=0;report.passed=true;console.log(JSON.stringify(report));
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
