/* Owner Focus V5 — non-destructive smoke checks, no network or D1. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.argv[2]||process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const entry=read('assets/js/aio-owner-account-entry-v1.js');
const catalog=read('assets/js/aio-owner-tools-catalog-v1.js');
const focus=read('assets/js/aio-owner-focus-v5.js');
const css=read('assets/css/aio-owner-focus-v5.css');
const markup=read('functions/_owner_hub_markup.js');
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS',name);};

async function runEntry(pathname,search,user){
  let fetchCount=0,redirect=null,requests=[];
  const context={
    location:{pathname,search,replace:p=>{redirect=p;}},
    fetch:(url,opts)=>{fetchCount++;requests.push({url,method:opts.method});
      return Promise.resolve({ok:true,json:()=>Promise.resolve({ok:true,authenticated:!!user,user:user||{},email_verified:true})});},
    AbortController, setTimeout, clearTimeout, URLSearchParams
  };
  vm.runInNewContext(entry,context,{timeout:1500});
  await new Promise(resolve=>setImmediate(resolve));
  return {fetchCount,redirect,requests};
}

const checks=[
  ['/konto','','owner','/owner-hub'],
  ['/konto.html','','owner','/owner-hub'],
  ['/konto/','','owner','/owner-hub'],
  ['/konto','?widok=konto','owner',null],
  ['/konto.html','?widok=konto','owner',null],
  ['/konto','','user',null],
  ['/kontakt','','owner',null]
];
for(const [pathname,search,kind,expected] of checks){
  const user=kind==='owner'?{is_owner:true}:{is_owner:false};
  const output=await runEntry(pathname,search,user);
  assert.equal(output.redirect,expected,`Wrong redirect for ${pathname}${search} (${kind})`);
  if(expected)assert.equal(output.fetchCount,1);
  console.log('PASS owner routing',pathname+search,kind);
  count++;
}

test('owner tools catalog parses, contains VPN, exports and account search',()=>{
  const obj={window:{},Object};
  vm.runInNewContext(catalog,obj,{timeout:1500});
  const ids=obj.window.AIO_OWNER_TOOLS_CATALOG_V1.map(t=>t.id);
  assert.equal(ids.filter(x=>x==='security-exports-v1').length,1);
  assert.ok(ids.includes('vpn-guard-v1'));
  assert.ok(ids.includes('wyszukiwarka-blokad'));
});

test('owner page includes focus module once and before Layout V4',()=>{
  assert.equal((markup.match(/aio-owner-focus-v5\.js/g)||[]).length,1);
  assert.equal((markup.match(/aio-owner-focus-v5\.css/g)||[]).length,1);
  assert.ok(markup.indexOf('aio-owner-focus-v5.js')<markup.indexOf('aio-owner-layout-v4.js'));
  assert.ok(markup.includes('OWNER_HTML'));
});

test('focus markup includes safety guards, all task counters and important routes',()=>{
  assert.ok(focus.includes("ROOT.dataset.aopV3!=='ready'"));
  for(const id of ['inbox','resets','approvals','pending','reports','lists','users','wyszukiwarka-blokad','security-center-v1','vpn-guard-v1','security-exports-v1','multikonta-audyt','downloads','maintenance']){
    assert.ok(focus.includes(`id:'${id}'`),`Missing item: ${id}`);
  }
  for(const key of ['support','posts','inbox','reports','resets','lists'])assert.ok(focus.includes(`'${key}'`));
  assert.ok(focus.includes('aop4-task'));
  assert.ok(focus.includes('aop4-feature'));
  assert.ok(focus.includes('aop4-hero-actions'));
  assert.ok(focus.includes('aop5-account-link'));
  assert.ok(focus.includes("localStorage.setItem('aio_owner_layout_v4','simple')"));
  assert.ok(!/\.post\(|\.delete\(|method:\s*'POST'|indexedDB/i.test(focus));
});

test('style supports mobile and respects only owner-ready selector',()=>{
  assert.ok(css.includes('data-aop-v3="ready"'));
  assert.ok(css.includes('max-width:480px'));
  assert.ok(css.includes('.aop5-task-grid'));
});

console.log(`AIO Owner One Panel V5: ${count} smoke tests passed`);
