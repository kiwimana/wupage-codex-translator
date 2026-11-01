import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startFirefox } from './lib/firefox.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'.npm-cache/floating-firefox');
let requests=0;
const server=createServer(async(q,r)=>{
  if(q.method==='POST'){
    let body='';for await(const chunk of q)body+=chunk;requests++;
    r.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'}).end(JSON.stringify({translations:JSON.parse(body).texts.map(t=>t.includes('⟪WUPAGESEGMENT')?t.replace(/(⟪WUPAGESEGMENT\d+⟫\n)/g,'$1譯文：'):'譯文：'+t)}));
  }else r.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>Floating target</title><style>body{margin:40px;font:18px Arial}#behind{position:fixed;right:0;top:330px;width:110px;height:120px;z-index:2147483646}</style><p>Translate this paragraph only when the floating ball is clicked.</p><button id="behind" onclick="document.body.dataset.pageClicks=String(Number(document.body.dataset.pageClicks||0)+1)">Page control</button>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
let firefox;const report={passed:false,checks:[]};const check=name=>{report.checks.push(name);console.log('PASS:',name);};
async function waitFor(read,accept,label){let value;const start=Date.now();do{value=await read();if(accept(value))return value;await delay(100);}while(Date.now()-start<15000);throw new Error(`Timed out ${label}: ${JSON.stringify(value)}`);}
try{
  firefox=await startFirefox(output,path.join(root,'dist-firefox-chatgpt'));report.browser=firefox.session.capabilities.browserVersion;
  await firefox.command('WebDriver:Navigate',{url:firefox.base+'options.html'});
  const control=(await firefox.command('WebDriver:GetWindowHandle')).value;
  const api=async(script,input=null)=>{
    await firefox.command('WebDriver:SwitchToWindow',{handle:control});
    const raw=await firefox.executeAsync(`const done=arguments[arguments.length-1];const chrome=window.wrappedJSObject.chrome;const input=JSON.parse(arguments[0]);(async()=>{${script}})().then(value=>done(JSON.stringify({value})),e=>done(JSON.stringify({error:String(e)})));`,[JSON.stringify(input)]);
    const r=JSON.parse(raw);if(r.error)throw new Error(r.error);return r.value;
  };
  await api(`const s=(await chrome.runtime.sendMessage({type:'GET_SETTINGS'})).data;s.activeProviderId='http-template';Object.assign(s.providers.find(p=>p.id==='http-template'),{url:input,bodyTemplate:'{"texts":{{json texts}}}',responsePath:'translations'});await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:s});await chrome.storage.local.set({'wupage.floating.position':{left:9999,top:350,edge:'right'}});`,url);
  const tab=await firefox.command('WebDriver:NewWindow',{type:'tab'}),page=(tab.value??tab).handle;
  const select=()=>firefox.command('WebDriver:SwitchToWindow',{handle:page});await select();await firefox.command('WebDriver:Navigate',{url});
  const metrics=()=>firefox.execute(`const b=document.getElementById('wupage-floating-ball'),h=document.getElementById('wupage-floating-hitbox');return {ball:b?.getBoundingClientRect().toJSON(),hitbox:h?.getBoundingClientRect().toJSON(),hidden:h?.hidden,width:innerWidth,edge:b?.dataset.edge,menu:!document.getElementById('wupage-floating-menu')?.hidden};`);
  await waitFor(metrics,v=>v.ball?.width>0&&!v.hidden,'ball ready');
  let m=await metrics();assert.equal(m.ball.width,52);assert.equal(m.hitbox.width,72);assert.ok(m.ball.right<=m.width-12);report.initial=m;
  check('legacy right-edge position becomes a fully visible 52px ball with a 72px click target');
  const move=async(x,y,duration=50)=>firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'ball-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration,x:Math.round(x),y:Math.round(y)}]}]});
  const click=async(x,y,jitter=0)=>firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'ball-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:50,x:Math.round(x),y:Math.round(y)},{type:'pointerDown',button:0},{type:'pointerMove',duration:60,x:Math.round(x+jitter),y:Math.round(y)},{type:'pointerUp',button:0}]}]});
  const translated=()=>firefox.execute('return [...document.querySelectorAll(".wupage-translation:not(.wupage-translation-pending)")].some(n=>n.textContent.includes("譯文："));');
  const x=m.ball.left-6,y=m.ball.top+26;
  await click(x,y);await waitFor(translated,Boolean,'padding click translation');assert.equal(requests,1);
  check('a physical mouse click outside the visible circle starts translation exactly once');
  await click(x,y);await waitFor(translated,v=>!v,'restore original');
  await move(100,100);await move(x,y);await delay(650);const hovered=await metrics();
  assert.equal(hovered.ball.left,m.ball.left);assert.equal(hovered.ball.top,m.ball.top);assert.equal(hovered.menu,true);
  await click(x,y);await waitFor(translated,Boolean,'padding while menu open');
  check('hover and the open settings menu do not move the ball or disable the outer target');
  await click(x,y);await waitFor(translated,v=>!v,'restore before drag');
  await firefox.command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'ball-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:50,x:Math.round(x),y:Math.round(y)},{type:'pointerDown',button:0},{type:'pointerMove',duration:300,x:Math.round(x-250),y:Math.round(y)},{type:'pointerUp',button:0}]}]});
  const dragged=await metrics();assert.ok(dragged.ball.left<m.ball.left-200);assert.equal(await translated(),false);assert.equal(requests,1);
  check('dragging from the outer target moves the ball without translating');
  await click(dragged.ball.left+22,dragged.ball.top+26,8);await waitFor(translated,Boolean,'jitter click');
  check('eight pixels of mouse jitter still counts as a click');
  await click(dragged.ball.left+22,dragged.ball.top+26);await waitFor(translated,v=>!v,'restore before left edge');
  await api(`await chrome.storage.local.set({'wupage.floating.position':{left:-20,top:350,edge:'left'}});`);await select();
  await waitFor(metrics,v=>v.ball.left===12,'left edge remap');m=await metrics();assert.ok(m.hitbox.left>=0);
  await click(m.ball.left+26,m.ball.top+26);await waitFor(translated,Boolean,'left edge click');
  check('legacy left-edge positions remain fully visible and clickable');
  await api(`await chrome.storage.local.set({'wupage.floating.position':{left:9999,top:350,edge:'right'}});`);await select();await waitFor(metrics,v=>v.edge==='right','right edge restore');m=await metrics();
  await click(m.hitbox.left-3,m.ball.top+26);assert.equal(await firefox.execute('return Number(document.body.dataset.pageClicks||0)'),1);
  check('nearby page controls outside the target remain clickable');
  const shot=await firefox.command('WebDriver:TakeScreenshot',{id:null,highlights:[],full:false});await fs.writeFile(path.join(output,'floating-visible.png'),Buffer.from(shot.value,'base64'));
  report.passed=true;
}catch(error){report.error=String(error);throw error;}
finally{if(firefox)await firefox.close();await new Promise(resolve=>server.close(resolve));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
