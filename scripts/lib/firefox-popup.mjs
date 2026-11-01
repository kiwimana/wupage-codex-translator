// Operate the actual toolbar popup in an isolated Marionette test browser.
let serial = 0;
export async function popupExecute(firefox, script, input = null) {
  await firefox.command('Marionette:SetContext', { value: 'chrome' });
  const channel = `WuPagePopupTest${++serial}`;
  const child = `(async()=>{try{const value=await(async(window,document,input)=>{${script}})(content,content.document,${JSON.stringify(input)});
    sendAsyncMessage(${JSON.stringify(channel)},JSON.stringify({value}));}catch(error){sendAsyncMessage(${JSON.stringify(channel)},JSON.stringify({error:String(error)}));}})();`;
  const raw = await firefox.executeAsync(`const done=arguments[arguments.length-1];const b=document.querySelector('.webextension-popup-browser');
    if(!b){done(JSON.stringify({error:'Toolbar popup is closed'}));return;}const mm=b.messageManager;
    const timer=setTimeout(()=>{mm.removeMessageListener(arguments[1],listener);done(JSON.stringify({error:'Popup command timed out'}));},10000);
    const listener=m=>{clearTimeout(timer);mm.removeMessageListener(arguments[1],listener);done(m.data);};
    mm.addMessageListener(arguments[1],listener);mm.loadFrameScript('data:application/javascript,'+encodeURIComponent(arguments[0]),false);`, [child, channel]);
  const result = JSON.parse(raw); if (result.error) throw new Error(result.error); return result.value;
}
export async function popupClick(firefox, selector) {
  const point = await popupExecute(firefox, `const el=document.querySelector(input);if(!el)throw new Error('Missing '+input);
    const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;
    if(document.elementFromPoint(x,y)!==el&&!el.contains(document.elementFromPoint(x,y)))throw new Error('Control is covered: '+input);
    return {x,y};`, selector);
  const rect = await firefox.execute('const r=document.querySelector(".webextension-popup-browser").getBoundingClientRect();return {x:r.left,y:r.top};');
  await firefox.command('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'popup-mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', duration: 0, x: Math.round(rect.x + point.x), y: Math.round(rect.y + point.y) },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }
  ] }] });
}
export async function popupSelect(firefox, selector, value) {
  return popupExecute(firefox, `const el=document.querySelector(input.selector);el.focus();
    const tip=Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    if(!tip.beginInputTransactionForTests(window))throw new Error('Cannot start native keyboard input');
    const key=(key,code,keyCode)=>{const init={key,code,keyCode,bubbles:true};tip.keydown(new window.KeyboardEvent('keydown',init));tip.keyup(new window.KeyboardEvent('keyup',init));};
    key('Home','Home',36);const index=[...el.options].findIndex(o=>o.value===input.value);if(index<0)throw new Error('Missing option');
    for(let i=0;i<index;i++)key('ArrowDown','ArrowDown',40);key('Enter','Enter',13);return el.value;`, { selector, value });
}
