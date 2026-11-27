import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../assets/js/user-premium.js',import.meta.url),'utf8');
const code=src.slice(src.indexOf('  async function confirmLocalFreeDownload('),src.indexOf(' async function accountDownload(item,kind){'));
assert.ok(code.includes('AIO')||code.includes('aio-free-speed-dialog'));
function fixture(state={authenticated:true,active:false,free_remaining:2},config={ok:true,enabled:true,kbps:25}){
  const nodes=[];let calls=0,limit=0,restricted=0,guest=0;let navigation=null;
  function el(tag){return {tag,style:{},children:[],handlers:{},append(...a){this.children.push(...a);},setAttribute(){},addEventListener(k,f){this.handlers[k]=f;},showModal(){},close(){this.handlers.close?.();},remove(){this.removed=true;}};}
  const ctx=vm.createContext({document:{createElement:el,getElementById:()=>nodes.find(n=>!n.removed),body:{append(n){nodes.push(n);}}},location:{assign:url=>{navigation=url;}},accountApi:async()=>state,fetch:async()=>{calls++;return {ok:true,json:async()=>config};},guestDownloadDialog:()=>guest++,showAioRestriction:()=>restricted++,openSupportModal:()=>limit++,alert:()=>{},fileNameFromUrl:()=> 'test.zip'});
  vm.runInContext(code,ctx);
  const run=(kind='local')=>ctx.confirmLocalFreeDownload({href:'/pliki/test.zip',label:'test.zip'},{kind});
  return {run,nodes,stats:()=>({calls,limit,restricted,guest,navigation})};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('FREE local: confirmation uses current config; cancel or upgrade never opens transfer',async()=>{
 for(const [index,answer] of [[0,false],[1,true],[2,false]]){
  const f=fixture(undefined,{ok:true,enabled:true,kbps:37});const pending=f.run();await tick();const d=f.nodes[0];assert.ok(d);assert.equal(d.children[2].textContent,'37 KB/s');const btn=d.children.at(-1).children[index];if(index===0)assert.equal(btn.href,'/support.html#wesprzyj-projekt');btn.handlers.click({preventDefault(){}});assert.equal(await pending,answer);if(index===0)assert.equal(f.stats().navigation,btn.href);assert.equal(d.removed,true);
 }
});
test('paid, owner, disabled, public, external and informational links skip modal',async()=>{
 for(const state of [{authenticated:true,active:true},{authenticated:true,owner:true},{authenticated:true,active:true,vip:true}]){const f=fixture(state);assert.equal(await f.run(),true);assert.equal(f.nodes.length,0);assert.equal(f.stats().calls,0);}
 const f=fixture(undefined,{ok:true,enabled:false,kbps:25});assert.equal(await f.run(),true);
 for(const kind of ['public','external','info']){const f=fixture();assert.equal(await f.run(kind),true);assert.equal(f.stats().calls,0);}
});
test('zero quota and restricted accounts retain existing flow',async()=>{
 const f=fixture({authenticated:true,active:false,free_remaining:0});assert.equal(await f.run(),false);assert.equal(f.stats().limit,1);
 const g=fixture({authenticated:true,restricted:true});assert.equal(await g.run(),false);assert.equal(g.stats().restricted,1);
});
test('two existing handoff paths gate the actual GET; no new debit endpoint',()=>{
 assert.equal(src.split('if(!await confirmLocalFreeDownload(item,info))return;').length-1,2);
 assert.ok(!code.includes('consumeFree'));assert.ok(!code.includes("method:'POST'"));
});

test('individual speed is displayed; unlimited FREE retains monthly quota and explicit confirmation',async()=>{
 for(const config of [{ok:true,enabled:true,kbps:250,individual:true},{ok:true,enabled:true,kbps:null,individual:true,unlimited:true}]){const f=fixture(undefined,config),p=f.run();await tick();const d=f.nodes[0];assert.equal(d.children[2].textContent,config.unlimited?'Pełna dostępna prędkość':'250 KB/s');assert.match(d.children[3].textContent,/2 z 3/);assert.match(d.children[3].textContent,/indywidualnie/);d.children.at(-1).children[1].handlers.click();assert.equal(await p,true);}
});
