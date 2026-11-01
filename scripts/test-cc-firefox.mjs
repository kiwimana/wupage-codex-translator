// Native Firefox popup -> CC timeline -> installed ChatGPT host -> bilingual overlay.
// --live additionally exercises YouTube's actual player and caption authorization.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFirefox } from './lib/firefox.mjs';
import { popupExecute, popupClick } from './lib/firefox-popup.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const live = process.argv.includes('--live');
const output = path.join(root, '.npm-cache', live ? 'cc-youtube-firefox' : 'cc-firefox');
const html = `<!doctype html><meta charset="utf-8"><title>CC bilingual test</title>
<style>body{margin:32px;background:#152329;color:#fff;font:18px Arial}.player{position:relative;width:900px;height:506px}video{width:100%;height:100%}</style>
<h1>AI bilingual CC</h1><div class="player"><video muted playsinline></video></div>
<script>const c=document.createElement('canvas');c.width=900;c.height=506;const x=c.getContext('2d');
setInterval(()=>{x.fillStyle='#1e363e';x.fillRect(0,0,900,506);x.fillStyle='#afdecf';x.font='28px Arial';x.fillText('CC translation verification',250,210)},100);
const v=document.querySelector('video');v.srcObject=c.captureStream(10);
const t=v.addTextTrack('captions','English','en');t.addCue(new VTTCue(0,60,'Welcome. This video explains how bilingual subtitles work.'));
t.addCue(new VTTCue(65,90,'The original caption appears above its translation.'));t.mode='showing';</script>`;
const server = createServer((_q,r)=>r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url = live ? 'https://www.youtube.com/watch?v=FgIwWAS08wg' : `http://127.0.0.1:${server.address().port}/video`;
const report = { passed:false, live, url, checks:[] };let firefox;
const check = name => {report.checks.push(name);console.log('PASS:',name);};
async function waitFor(read,predicate,label,timeout=180000){const start=Date.now();let value;do{value=await read();if(predicate(value))return value;await delay(1000);}while(Date.now()-start<timeout);throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);}
try {
  firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'),{'media.autoplay.default':0});
  report.browser=firefox.session.capabilities.browserVersion;
  await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
  const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
  const api=async(script,input=null)=>{
    await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:control});
    const result=JSON.parse(await firefox.executeAsync(`const done=arguments[arguments.length-1];const chrome=window.wrappedJSObject.chrome;const input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]));
    if(result.error)throw new Error(result.error);return result.value;
  };
  const tab=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(tab.value??tab).handle;
  const select=async()=>{await firefox.command('Marionette:SetContext',{value:'content'});await firefox.command('WebDriver:SwitchToWindow',{handle:page});};
  await select();await firefox.command('WebDriver:Navigate',{url});
  console.log('Loaded player page');
  await waitFor(()=>firefox.execute('return !!document.querySelector("video") && !!document.getElementById("wupage-floating-ball")'),Boolean,'player');
  await firefox.execute(`const v=document.querySelector('video');v.muted=true;${live ? "if(v.paused)document.querySelector('#movie_player .ytp-large-play-button,#movie_player .ytp-play-button')?.click();" : "void v.play();"}`);
  if(live){
    await waitFor(()=>firefox.execute(`const p=document.querySelector('#movie_player');const v=p?.querySelector('video');
      if(p?.classList.contains('ad-showing')){
        const skip=p.querySelector('.ytp-skip-ad-button,.ytp-skip-ad-button-modern')||[...p.querySelectorAll('button')].find(b=>/^(?:略過|Skip)(?:廣告| Ad)?$/i.test(b.textContent.trim()));
        if(skip?.getBoundingClientRect().width)skip.click();
      }
      return {ready:!p?.classList.contains('ad-showing')&&v?.duration>100&&v.readyState>=2&&v.currentTime>0,time:v?.currentTime,paused:v?.paused,duration:String(v?.duration),error:v?.error?.message};`),v=>v.ready,'main video after advertisement',90000);
  }
  await delay(2500);
  const idle=await api(`return chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'});`);
  assert.equal(idle.data.tasks.length,0);check('playing a video sends no AI requests before the CC button is clicked');
  const open=async()=>{await api(`const tab=(await chrome.tabs.query({})).find(t=>t.url===input);await chrome.tabs.update(tab.id,{active:true});await chrome.action.openPopup();return true;`,url);await delay(800);};
  const close=async()=>{await firefox.command('Marionette:SetContext',{value:'chrome'});await firefox.execute(`document.querySelector('.webextension-popup-browser').closest('panel').hidePopup()`);await select();};
  await open();
  assert.equal(await popupExecute(firefox,`return document.querySelector('#translateCc').textContent`),'AI 翻譯 CC 字幕');
  await popupClick(firefox,'#translateCc');
  await waitFor(()=>popupExecute(firefox,`return document.querySelector('#translateCc').getAttribute('aria-pressed')`),v=>v==='true','CC starts from popup');
  check('a real mouse click on the popup AI CC button starts the current player');await close();
  const inspect=()=>firefox.execute(`const h=[...document.querySelectorAll('[data-wupage-video]')].find(n=>n.hasAttribute('data-enabled'));
    const r=h?.shadowRoot;const s=r?.querySelector('.source'),t=r?.querySelector('.translation');const v=document.querySelector('video');
    const e=document.querySelector('.ytp-error-content-wrap');
    return {enabled:!!h,source:s?.textContent,translation:t?.textContent,hidden:r?.querySelector('.captions')?.hidden,sourceBottom:s?.getBoundingClientRect().bottom,translationTop:t?.getBoundingClientRect().top,status:r?.querySelector('.status')?.textContent,subtitleSource:h?.dataset.subtitleSource,paused:v.paused,time:v.currentTime,playerError:e?.getClientRects().length?e.textContent.trim():''};`).then(value=>{if(live&&value.playerError)throw new Error('YouTube player failed before CC could be read: '+value.playerError);return value;});
  if(!live){await waitFor(inspect,v=>v.paused&&v.enabled,'AI buffering pauses playing video');check('the player waits for slow AI translation instead of running past the caption');}
  report.caption=await waitFor(inspect,v=>v.source&&/[\u4e00-\u9fff]/u.test(v.translation||'')&&!v.hidden,'real ChatGPT bilingual CC');
  assert.ok(report.caption.translationTop>=report.caption.sourceBottom-1,JSON.stringify(report.caption));
  check('real ChatGPT returns Traditional Chinese CC below the original caption');
  if(!live){await waitFor(inspect,v=>!v.paused,'playback resumes');check('playback resumes after the caption is ready');}
  const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'cc-bilingual.png'),Buffer.from(shot.value,'base64'));
  await open();await waitFor(()=>popupExecute(firefox,`return document.querySelector('#translateCc').textContent`),v=>v.includes('停止'),'reopen shows stop');
  await popupClick(firefox,'#translateCc');await waitFor(()=>popupExecute(firefox,`return document.querySelector('#translateCc').getAttribute('aria-pressed')`),v=>v==='false','CC stop');await close();
  assert.equal((await inspect()).enabled,false);check('reopening the popup reflects the running state and a second click stops CC translation');
  const keys=await api(`return Object.keys(await chrome.storage.local.get(null)).filter(k=>k.startsWith('wupage.cache.'));`);assert.deepEqual(keys,[]);
  check('subtitle translations create no persistent extension cache');report.passed=true;
}catch(error){report.error=String(error);
  if(firefox){try{
    await firefox.command('Marionette:SetContext',{value:'content'});
    report.page=await firefox.execute(`const p=document.querySelector('#movie_player');return {url:location.href,text:document.body.innerText.slice(0,1200),playerClass:p?.className,videos:[...document.querySelectorAll('video')].map(v=>({duration:String(v.duration),time:v.currentTime,paused:v.paused,ready:v.readyState,error:v.error?.message})),cc:document.querySelector('.ytp-subtitles-button')?.outerHTML};`);
    const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'failure.png'),Buffer.from(shot.value,'base64'));
  }catch{}}
  throw error;}
finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
