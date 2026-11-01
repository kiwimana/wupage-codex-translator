// Isolated Firefox; local YouTube-shaped fixture and no AI account calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFirefox} from './lib/firefox.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/youtube-idle-firefox');
await fs.mkdir(output,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:30px;background:#151320;color:white}#movie_player{position:relative;width:900px;height:506px}video{width:100%;height:100%}.ytp-right-controls{position:absolute;bottom:0;right:0;height:48px;display:flex}.ytp-button{height:48px}</style><div id="movie_player" class="html5-video-player"><video muted autoplay playsinline></video><div class="ytp-caption-window-container"></div><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button><button class="wupage-ai-cc-button" id="legacy-ai">AI (old)</button><button class="ytp-settings-button">Settings</button></div></div><script>
window.idlePerf={repairs:0,buttonMutations:0,captionChanges:0,heartbeats:0};const perf=window.idlePerf,player=document.querySelector('#movie_player'),legacy=document.querySelector('#legacy-ai');
const previous=new MutationObserver(()=>{const controls=player.querySelector('.ytp-right-controls'),gear=controls.querySelector('.ytp-settings-button');if(legacy.parentElement===controls&&legacy.nextElementSibling===gear)return;if(++perf.repairs>=60){previous.disconnect();return;}controls.insertBefore(legacy,gear);});previous.observe(player,{childList:true,subtree:true});
const mutations=new MutationObserver(records=>{for(const record of records)for(const node of [...record.addedNodes,...record.removedNodes])if(node.nodeType===1&&node.matches('.wupage-ai-cc-button'))perf.buttonMutations++;});mutations.observe(player,{childList:true,subtree:true});
const canvas=document.createElement('canvas');canvas.width=900;canvas.height=506;const context=canvas.getContext('2d');const video=document.querySelector('video');video.srcObject=canvas.captureStream(30);video.play().catch(()=>{});
setInterval(()=>{context.fillStyle='#241f36';context.fillRect(0,0,900,506);context.fillStyle='#c4adff';context.font='24px sans-serif';context.fillText('Playback fixture '+perf.captionChanges,80,180);document.querySelector('.ytp-caption-window-container').textContent='Existing caption '+(++perf.captionChanges);},33);setInterval(()=>perf.heartbeats++,100);
</script>`;
const server=createServer((_req,res)=>res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://www.youtube.com:${server.address().port}/watch?v=idle-fixture`;
const report={passed:false,limitations:'Local canvas fixture in headless Firefox. Not a live YouTube video, whole-browser CPU or network benchmark.',translationRequests:0,loginActions:0};
let firefox;
async function run(label,extension){
 firefox=await startFirefox(path.join(output,label),extension,{'network.dns.localDomains':'www.youtube.com','network.dns.disableIPv6':true,'network.stricttransportsecurity.preloadlist':false,'network.proxy.type':0,'dom.security.https_only_mode':false,'media.autoplay.default':0});
 await firefox.command('WebDriver:Navigate',{url});await delay(2500);
 const read=()=>firefox.execute(`const p=window.wrappedJSObject.idlePerf,v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return {repairs:p.repairs,buttonMutations:p.buttonMutations,captionChanges:p.captionChanges,heartbeats:p.heartbeats,visibleButtons:[...document.querySelectorAll('.wupage-ai-cc-button')].filter(b=>getComputedStyle(b).display!=='none').length,playing:!v.paused,frames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames};`);
 const start=await read();await delay(2500);const end=await read();
 const result={start,end,idleButtonMutations:end.buttonMutations-start.buttonMutations};
 if(label==='fixed'){
  assert.ok(end.repairs<3,JSON.stringify(result));assert.equal(end.visibleButtons,1);assert.equal(result.idleButtonMutations,0);assert.ok(end.heartbeats>start.heartbeats+10);assert.ok(end.captionChanges>start.captionChanges+20);assert.equal(end.playing,true);
  for(let i=0;i<3;i++){
   await firefox.execute(`const bar=document.querySelector('.ytp-right-controls');bar.replaceWith(bar.cloneNode(true));document.dispatchEvent(new Event('yt-navigate-finish'));`);await delay(200);
   const state=await read();assert.equal(state.visibleButtons,1);assert.ok(state.repairs<10);
  }
 }
 await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
 const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1];window.wrappedJSObject.chrome.runtime.sendMessage({type:'GET_TRANSLATION_DEBUG'}).then(r=>done(JSON.stringify(r)));`);
 assert.equal(JSON.parse(raw).data.tasks.length,0);result.noTranslationTasks=true;result.browser=firefox.session.capabilities.browserVersion;
 await firefox.close();firefox=undefined;return result;
}
try{
 const baseline=process.env.YOUTUBE_IDLE_BASELINE;if(baseline)report.baseline=await run('baseline',path.resolve(baseline));
 report.fixed=await run('fixed',path.join(root,'dist-firefox-chatgpt'));
 if(report.baseline)assert.ok(report.baseline.end.repairs>=40,'Baseline must reproduce legacy button contention');
 report.passed=true;console.log(JSON.stringify(report));
}finally{if(firefox)await firefox.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
