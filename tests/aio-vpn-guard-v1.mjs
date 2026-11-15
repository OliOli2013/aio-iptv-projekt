#!/usr/bin/env node
/* AIO VPN Guard V1 regression: mocked D1 and provider (NO production data/network). */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const root=resolve(process.argv[2]||'.');
const read=p=>readFileSync(resolve(root,p),'utf8');
const url=txt=>'data:text/javascript;base64,'+Buffer.from(txt).toString('base64');
const vpn=await import(url(read('functions/_aio_vpn_guard_v1.js')));
const secret='a1b2c3d4e5f6'.repeat(6);
const envConfig={AIO_VPN_GUARD_API_KEY:'test-api-key-that-is-long-enough',AIO_VPN_GUARD_HMAC_SECRET:secret,AIO_VPN_GUARD_MODE:'monitor',AIO_VPN_GUARD_DAILY_BUDGET:400};
let n=0;
const check=async(name,fn)=>{await fn();console.log('OK '+(++n)+': '+name)};
function mockDb(accounts=[]){
  const v={budget:0,cache:new Map(),reviews:new Map(),signups:[],statements:[],accounts};
  const db={
    batch:async qs=>{for(const q of qs){if(q.sql.includes('INTO aio_vpn_guard_cache_v1'))await q.run();}return qs.map(()=>({meta:{changes:1}}));},
    prepare(sql){
      const st={sql,args:[],bind(...xs){this.args=xs;return this},
        async first(){
          if(sql.includes('FROM aio_vpn_guard_budget_v1'))return {used:v.budget};
          if(sql.includes("COUNT(*) n FROM community_profiles"))return {n:v.accounts.length};
          if(sql.includes('FROM community_profiles WHERE id=?'))return v.accounts.find(x=>x.id===this.args[0])||null;
          return null;
        },
        async all(){
          if(sql.includes('FROM aio_vpn_guard_cache_v1')){
            const keys=this.args.slice(0,-1),now=this.args.at(-1);
            return {results:keys.map(k=>v.cache.get(k)).filter(x=>x&&x.expires_ms>now)};
          }
          if(sql.includes('FROM community_profiles p WHERE p.role')){
            const limit=this.args.at(-1);
            let selected=v.accounts.filter(x=>x.role==='user');
            if(this.args.length===4){const [created,,id]=this.args;
              selected=selected.filter(x=>x.created_at<created||(x.created_at===created&&x.id<id));}
            return {results:selected.slice(0,limit)};
          }
          if(sql.includes('FROM community_user_ips')&&sql.includes('ORDER BY first_seen_at')){
            const u=v.accounts.find(x=>x.id===this.args[0]);return {results:(u?.ips||[]).map(ip=>({ip_address:ip})).slice(0,8)};
          }
          if(sql.includes('GROUP BY verdict')){
            const map=new Map();for(const r of v.reviews.values())map.set(r.verdict,(map.get(r.verdict)||0)+1);
            return {results:[...map].map(([verdict,n])=>({verdict,n}))};
          }
          if(sql.includes('FROM aio_vpn_guard_reviews_v1 r'))return {results:[]};
          if(sql.includes('FROM aio_vpn_guard_signups_v1'))return {results:[]};
          return {results:[]};
        },
        async run(){
          v.statements.push(sql);
          if(sql.startsWith('UPDATE aio_vpn_guard_budget_v1')){
            const [amount,,amount2,limit]=this.args;
            if(v.budget+amount2>limit)return {meta:{changes:0}};
            v.budget+=amount;return {meta:{changes:1}};
          }
          if(sql.includes('INTO aio_vpn_guard_cache_v1')){
            const [ip_key,verdict,flags,service,checked_at,expires_ms]=this.args;
            v.cache.set(ip_key,{ip_key,verdict,flags,service,checked_at,expires_ms});return {meta:{changes:1}};
          }
          if(sql.includes('INTO aio_vpn_guard_signups_v1')){v.signups.push(this.args);return {meta:{changes:1}};}
          if(sql.includes('INTO aio_vpn_guard_reviews_v1')){
            const [user_id,verdict,flags,service,samples,checked_at]=this.args;
            v.reviews.set(user_id,{user_id,verdict,flags,service,samples,checked_at});return {meta:{changes:1}};
          }
          return {meta:{changes:1}};
        }};
      return st;
    }};
  return {db,v};
}
await check('VPN + proxy + Tor classification',()=>{
  assert.equal(vpn.classifyVpnResponse({is_vpn:true,is_proxy:false,is_tor:false}).kind,'vpn');
  assert.equal(vpn.classifyVpnResponse({is_vpn:false,is_proxy:true,is_tor:false}).kind,'proxy');
  assert.equal(vpn.classifyVpnResponse({is_tor:true,is_vpn:false}).kind,'tor');
});
await check('Datacenter alone is NOT a confirmed VPN',()=>{
  assert.equal(vpn.classifyVpnResponse({is_vpn:false,is_proxy:false,is_tor:false,is_datacenter:true}).kind,'datacenter');
  assert.equal(vpn.verdictForSignup({kind:'datacenter'},'enforce'),'allow');
});
await check('Managed corporate egress or privacy relay never automatically denied',()=>{
  const r=vpn.classifyVpnResponse({is_vpn:true,egress_service:{type:'secure_web_gateway',provider:'Company'},is_proxy:false});
  assert.equal(r.kind,'relay');assert.equal(vpn.verdictForSignup(r,'enforce'),'allow');
});
await check('Missing vendor flags are UNKNOWN, not clean',()=>{
  assert.equal(vpn.classifyVpnResponse({ip:'8.8.8.8',company:{name:'Example'}}).kind,'unknown');
  assert.equal(vpn.classifyVpnResponse({error:'vendor down'}).kind,'unknown');
});
await check('Monitor never blocks; enforce blocks only confirmed VPN, Tor or proxy',()=>{
  for(const k of ['vpn','proxy','tor']){
    assert.equal(vpn.verdictForSignup({kind:k},'monitor'),'allow');
    assert.equal(vpn.verdictForSignup({kind:k},'enforce'),'deny');
  }
  for(const k of ['clean','unknown','datacenter','mobile','relay'])assert.equal(vpn.verdictForSignup({kind:k},'enforce'),'allow');
});
await check('Untrusted/private IPs rejected before provider calls',()=>{
  for(const ip of ['127.0.0.1','192.168.1.7','10.0.0.1','2001:db8:::2','fe80::1','127.0.0.1/8','1.1.1.1@evil'])
    assert.equal(vpn.publicNetworkIp(ip),null,ip);
  assert.equal(vpn.publicNetworkIp('8.8.8.8'),'8.8.8.8');
  assert.equal(vpn.publicNetworkIp('2606:4700:4700::1111'),'2606:4700:4700::1111');
});
await check('Unconfigured provider is fail-open for a valid registration',async()=>{
  const x=await vpn.checkVpnAtRegistration({},{headers:new Headers({'CF-Connecting-IP':'8.8.4.4'})});
  assert.equal(x.deny,false);assert.equal(x.reason,'not_configured');
});
const originalFetch=globalThis.fetch;
try{
  const track={calls:0};
  globalThis.fetch=async(_url,options)=>{
    track.calls++;
    const payload=JSON.parse(options.body);
    assert.ok(Array.isArray(payload.ips));assert.ok(payload.key);assert.ok(!String(_url).includes(payload.key));
    return {ok:true,json:async()=>Object.fromEntries(payload.ips.map(ip=>[ip,
      {ip,is_vpn:true,is_proxy:false,is_tor:false,is_datacenter:true,vpn:{service:'ExampleVPN'}}]))};
  };
  const mock=mockDb(),env={...envConfig,COMMUNITY_DB:mock.db};
  const request={headers:new Headers({'CF-Connecting-IP':'8.8.8.8'})};
  await check('Monitoring does not block confirmed VPN signup',async()=>{
    const r=await vpn.checkVpnAtRegistration(env,request);
    assert.equal(r.deny,false);assert.equal(r.kind,'vpn');assert.equal(track.calls,1);
  });
  await check('VPN IP cached under HMAC — no plaintext IP stored in D1 cache key',async()=>{
    const r=await vpn.checkVpnAtRegistration(env,request);
    assert.equal(r.kind,'vpn');assert.equal(track.calls,1);
    const [k]=mock.v.cache.keys();assert.match(k,/^[a-f\d]{64}$/);assert.ok(!k.includes('8.8.8.8'));
    assert.equal(mock.v.budget,1);
  });
  await check('Enforce requires explicit configuration, then refuses confirmed VPN',async()=>{
    const r=await vpn.checkVpnAtRegistration({...env,AIO_VPN_GUARD_MODE:'enforce'},request);
    assert.equal(r.deny,true);assert.equal(r.kind,'vpn');
  });
  await check('Existing account scan is purely diagnostic and never changes bans',async()=>{
    const a={id:'test-user-1111',display_name:'Konto testowe',role:'user',first_ip:'8.8.8.8',last_ip:'8.8.8.8',ips:['8.8.8.8']};
    const m=mockDb([a,{id:'admin-id',role:'admin',first_ip:'9.9.9.9'}]);
    const result=await vpn.scanVpnAccounts({...envConfig,COMMUNITY_DB:m.db},{processed:0,cursor:null});
    assert.equal(result.total,2);assert.equal(result.processed,1);
    assert.equal(result.results[0].kind,'vpn');
    assert.ok(m.v.statements.every(x=>!/UPDATE community_profiles|DELETE FROM community_profiles|UPDATE aio_access/i.test(x)));
    assert.ok(m.v.reviews.has(a.id));
  });
  await check('Keyset scans pass every account exactly once across two batches',async()=>{
    const accounts=Array.from({length:25},(_,i)=>({
      id:'user-'+String(9999-i).padStart(8,'0'),role:'user',
      display_name:'Test '+i,created_at:new Date(Date.UTC(2026,10,15,0,0,0)-i*60000).toISOString(),
      first_ip:'8.8.8.8',last_ip:'8.8.8.8'}));
    const m=mockDb(accounts),e={...envConfig,COMMUNITY_DB:m.db};
    const a=await vpn.scanVpnAccounts(e,{cursor:null,processed:0});
    assert.equal(a.processed,20);assert.equal(a.complete,false);
    const b=await vpn.scanVpnAccounts(e,{cursor:a.next_cursor,processed:20});
    assert.equal(b.processed,5);assert.equal(b.complete,true);
    assert.equal(new Set([...a.results,...b.results].map(x=>x.id)).size,25);
  });
  await check('Provider failure never turns UNKNOWN into a block',async()=>{
    const f=globalThis.fetch;globalThis.fetch=async()=>({ok:false,status:503});
    try{
      const m=mockDb(),e={...envConfig,COMMUNITY_DB:m.db,AIO_VPN_GUARD_MODE:'enforce'};
      const r=await vpn.checkVpnAtRegistration(e,{headers:new Headers({'CF-Connecting-IP':'9.9.9.9'})});
      assert.equal(r.deny,false);assert.equal(r.kind,'unknown');
    }finally{globalThis.fetch=f;}
  });
  await check('Daily remote-lookup budget is enforced centrally',async()=>{
    const m=mockDb();m.v.budget=20;
    const e={...envConfig,COMMUNITY_DB:m.db,AIO_VPN_GUARD_DAILY_BUDGET:20,AIO_VPN_GUARD_MODE:'enforce'};
    const f=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not call');};
    try{
      const r=await vpn.checkVpnAtRegistration(e,{headers:new Headers({'CF-Connecting-IP':'9.9.9.10'})});
      assert.equal(r.deny,false);assert.equal(r.reason,'budget_exhausted');assert.equal(calls,0);
    }finally{globalThis.fetch=f;}
  });
  await check('Single-account deeper scan is owner-invoked and non-blocking',async()=>{
    const a={id:'test-user-2222',display_name:'Skanowane konto',role:'user',ips:['8.8.8.8','9.9.9.9']};
    const m=mockDb([a]);const r=await vpn.scanVpnOneAccount({...envConfig,COMMUNITY_DB:m.db},a.id);
    assert.equal(r.kind,'vpn');assert.equal(r.samples,2);
    assert.ok(m.v.statements.every(x=>!x.includes('UPDATE community_profiles')));
  });
}finally{globalThis.fetch=originalFetch;}
await check('No permit/ban changes in VPN Guard code',()=>{
  const file=read('functions/_aio_vpn_guard_v1.js');
  assert.ok(!/UPDATE\s+community_profiles|DELETE\s+FROM\s+community_profiles|UPDATE\s+community_sessions/i.test(file));
});
await check('Real registration gate is anchored AFTER existing preflight',()=>{
  const file=read('functions/api/community-auth.js');
  assert.match(file,/const vpnRisk=ownerAccount\?null:await checkVpnAtRegistration\(env,request\)/);
  assert.ok(file.indexOf('const vpnRisk=')>file.indexOf('const netRisk='));
  assert.ok(file.indexOf('const vpnRisk=')<file.indexOf('reserveRegistrationIp(env,request,id)'));
});
await check('Owner API authorizes owner and validates same-origin writes',()=>{
  const api=read('functions/api/aio-vpn-guard.js');
  assert.ok(api.includes('await requireAdmin(request,env,true)'));
  assert.ok(api.includes('if(!sameOrigin(request))'));
});
await check('Owner catalog, simplified navigation and privacy notice installed',()=>{
  assert.ok(read('assets/js/aio-owner-tools-catalog-v1.js').includes("id:'vpn-guard-v1'"));
  assert.ok(read('assets/js/aio-owner-layout-v4.js').includes("navItem('vpn-guard-v1'"));
  assert.ok(read('privacy-community.html').includes('vpn-guard-prywatnosc'));
});
await check('On-demand scan endpoint, page and helper JS exist',()=>{
  for(const p of ['aio-vpn-guard.html','assets/js/aio-vpn-guard-v1.js','functions/api/aio-vpn-guard.js'])assert.ok(existsSync(resolve(root,p)),p);
});
console.log(`AIO VPN Guard V1: ${n}/${n} testów OK`);
