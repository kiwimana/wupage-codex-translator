// Measure actual text bounds: an unclipped row alone does not prove its badge fits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
import {popupExecute} from './lib/firefox-popup.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/manual-label-firefox');
const server=createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>Manual label layout</title><p>Translation starts only on a deliberate click.</p>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
let firefox;const report={passed:false,cases:[]};
async function waitFor(read){for(let i=0;i<100;i++){if(await read())return;await delay(100);}throw new Error('UI did not settle');}
const measure=`const floating=input.floating,host=document.querySelector(floating?'#wupage-floating-menu':'.popup');host.style.width=input.width+'px';const row=host.querySelector(floating?'.wupage-language-pair':'.language-pair'),button=host.querySelector(floating?'.wupage-language-auto':'.language-auto');button.style.fontSize=input.font+'px';const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),b=button.getBoundingClientRect(),r=row.getBoundingClientRect(),s=window.getComputedStyle(button);const target=host.querySelector(floating?'[data-role="target-lang"]':'#targetLang').getBoundingClientRect();return {text:button.textContent,button:b.toJSON(),glyphs:text.toJSON(),row:r.toJSON(),lines:range.getClientRects().length,insideButton:text.left>=b.left+parseFloat(s.paddingLeft)-.5&&text.right<=b.right-parseFloat(s.paddingRight)+.5,insideRow:b.right<=r.right-3&&b.left>=r.left+3,afterLanguage:target.right<=b.left,scrollClipped:button.scrollWidth>button.clientWidth};`;
function verify(metrics,input){assert.equal(metrics.text,'手動');assert.equal(metrics.insideButton,true,JSON.stringify(metrics));assert.equal(metrics.insideRow,true,JSON.stringify(metrics));assert.equal(metrics.afterLanguage,true);assert.equal(metrics.scrollClipped,false);assert.equal(metrics.lines,1);report.cases.push({...input,metrics});}
try{
 firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'));report.browser=firefox.session.capabilities.browserVersion;
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
 const api=async(script,input=null)=>{await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:control});const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1],chrome=window.wrappedJSObject.chrome,input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);const r=JSON.parse(raw);if(r.error)throw new Error(r.error);return r.value;};
 const t=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(t.value??t).handle;await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.command('WebDriver:Navigate',{url});await waitFor(()=>firefox.execute(`return document.getElementById('wupage-floating-hitbox')?.hidden===false`));
 for(const tone of ['light','dark']){
  await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.appearance.mode=input;await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});`,tone);
  await api(`const tab=(await chrome.tabs.query({})).find(t=>t.url===input);await chrome.tabs.update(tab.id,{active:true});await chrome.action.openPopup();`,url);await delay(700);await waitFor(()=>popupExecute(firefox,`return document.getElementById('floatingBall')?.disabled===false;`));
  for(const width of [352,320])for(const font of [11,14]){const input={floating:false,tone,width,font};verify(await popupExecute(firefox,measure,input),input);}
  await popupExecute(firefox,`document.querySelector('.popup').style.width='';document.getElementById('autoTranslation').style.fontSize='';return true;`);await delay(150);
  const encoded=await firefox.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const b=document.querySelector('.webextension-popup-browser'),image=await b.browsingContext.currentWindowGlobal.drawSnapshot(null,1,'rgb(255,255,255)'),canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];})().then(done);`);await fs.writeFile(path.join(output,`manual-popup-${tone}.png`),Buffer.from(encoded,'base64'));
  await firefox.execute(`document.querySelector('.webextension-popup-browser').closest('panel').hidePopup();`);await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:page});await firefox.execute(`document.getElementById('wupage-floating-hitbox').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));`);await waitFor(()=>firefox.execute(`return document.getElementById('wupage-floating-menu')?.hidden===false`));
  for(const width of [328,280])for(const font of [11,14]){const input={floating:true,tone,width,font};verify(await firefox.execute('const input=arguments[0];'+measure,[input]),input);}
  await firefox.execute(`const m=document.getElementById('wupage-floating-menu');m.style.width='328px';m.querySelector('.wupage-language-auto').style.fontSize='';document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
 }
 const debug=await api(`return chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'});`);assert.equal(debug.data.tasks.length,0);report.translationRequests=0;report.passed=true;console.log(JSON.stringify({passed:true,cases:report.cases.length,browser:report.browser,translationRequests:0}));
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
