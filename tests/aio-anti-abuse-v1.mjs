import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {assessRecentAccountSignals,similarAccountName,recentAccountSignal} from '../functions/_aio_anti_abuse_v1.js';
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='cloudflare:sockets')return {url:'data:text/javascript,export%20const%20connect%3D()%3D%3E%7Bthrow%20new%20Error(%22SMTP%20unavailable%22)%7D',shortCircuit:true};
  return nextResolve(specifier,context);
}});
const {classifyVpnResponse}=await import('../functions/_aio_vpn_guard_v1.js');
const {checkProtectedSessionNetwork}=await import('../functions/_aio_session_network_v1.js');
const row=(event,name='Zkam',blocked=1,detail='')=>({user_id:'old',event,display_name:name,profile_blocked:blocked,detail});
test('blocked login + similar name is owner-review signal, not profile ban',()=>{
  assert.equal(assessRecentAccountSignals([row('login_failed')],'zkam89').score,5);
  assert.equal(assessRecentAccountSignals([row('login_review_blocked')],'zkam89').score,5);
  assert.equal(assessRecentAccountSignals([row('login_review_blocked')],'inna-nazwa').score,5);
  assert.equal(assessRecentAccountSignals([row('download_denied','Zkam',0,'Limit: link')],'zkam89').score,5);
  assert.equal(assessRecentAccountSignals([row('download_denied','Zkam',0,'Limit: link')],'inna-nazwa').score,5);
});
test('weak signals remain observations; wrong password on unblocked profile ignored',()=>{
  assert.equal(assessRecentAccountSignals([row('login_failed')],'inny').score,3);
  assert.equal(assessRecentAccountSignals([row('login_failed','Zkam',0)],'zkam89').score,0);
  assert.equal(assessRecentAccountSignals([row('download_denied','Zkam',0,'E-mail niezweryfikowany')],'zkam89').score,0);
  assert.equal(assessRecentAccountSignals([row('login_ok')],'zkam89').score,0);
  assert.equal(similarAccountName('Rob','Rob99'),false);
  assert.equal(similarAccountName('Żółw_2025','zolw2026'),true);
});
test('SQL matches exact network and time; ignores unrelated/expired attempts',async()=>{
  const raw=new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE community_profiles(id TEXT,display_name TEXT,role TEXT,banned_until TEXT);
    CREATE TABLE aio_security_journal(id TEXT,user_id TEXT,event TEXT,detail TEXT,ip_fingerprint TEXT,created_at TEXT);`);
  const now=Date.parse('2026-11-26T20:00:00Z');
  raw.prepare('INSERT INTO community_profiles VALUES(?,?,?,?)').run('old','Zkam','user','9999-12-31T23:59:59Z');
  const put=(id,ip,offset)=>raw.prepare('INSERT INTO aio_security_journal VALUES(?,?,?,?,?,?)').run(id,'old','login_failed','Błędne hasło',ip,new Date(now+offset).toISOString());
  put('a','ip',-3600000);put('b','other',-1000);put('c','ip',1000);
  const db={prepare:sql=>({bind:(...args)=>({all:async()=>({results:raw.prepare(sql).all(...args)})})})};
  assert.equal((await recentAccountSignal(db,'ip','zkam89',now)).score,0);
  put('d','ip',-5000);
  assert.equal((await recentAccountSignal(db,'ip','zkam89',now)).score,5);
  assert.equal((await recentAccountSignal(db,null,'zkam89',now)).score,0);
  raw.close();
});
test('managed egress cannot override explicit high-risk provider flags',()=>{
  const base={is_vpn:false,is_proxy:false,is_tor:false,egress_service:{type:'private_relay'}};
  assert.equal(classifyVpnResponse(base).kind,'relay');
  for(const flag of ['vpn','proxy','tor'])assert.equal(classifyVpnResponse({...base,['is_'+flag]:true}).kind,flag);
  assert.equal(classifyVpnResponse({...base,is_vpn:'false'}).kind,'unknown');
});
function fixture(verdict,flags=[]){
 const calls=[];
 const db={prepare(sql){const stmt={sql,args:[],bind(...args){this.args=args;return this;},async first(){calls.push(sql);if(sql.includes('FROM community_sessions'))return {ip_address:'8.8.8.8'};if(sql.includes('FROM aio_session_network_checks_v1'))return null;throw Error('Unexpected first: '+sql);},async all(){calls.push(sql);if(sql.includes('FROM aio_vpn_guard_cache_v1'))return {results:[{ip_key:this.args[0],verdict,flags:JSON.stringify(flags),service:'test'}]};throw Error('Unexpected all: '+sql);},async run(){calls.push(sql);return {meta:{changes:1}};}};return stmt;},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 const env={COMMUNITY_DB:db,AIO_VPN_GUARD_MODE:'enforce',AIO_VPN_LOGIN_MODE:'enforce',AIO_VPN_GUARD_API_KEY:'test-key-long-enough',AIO_VPN_GUARD_HMAC_SECRET:'x'.repeat(40)};
 const req=new Request('https://fixture.invalid/api/test',{headers:{'CF-Connecting-IP':'8.8.8.8'}});
 return {env,req,calls};
}
test('same-IP old sessions get checked; corrected historical VPN cache is denied',async()=>{
 const {env,req,calls}=fixture('relay',['managed_egress','vpn']);
 const session={tokenHash:'fixture',user:{id:'u',is_owner:false}};
 const result=await checkProtectedSessionNetwork(env,req,session);
 assert.equal(result.status,403);assert.equal(result.allowed,false);
 assert.ok(calls.some(s=>s.includes('FROM aio_vpn_guard_cache_v1')));
});
test('ordinary unchanged-IP session is allowed; owner exempt; monitor remains monitor',async()=>{
 const {env,req,calls}=fixture('clean');
 const session={tokenHash:'fixture',user:{id:'u',is_owner:false}};
 assert.equal((await checkProtectedSessionNetwork(env,req,session)).allowed,true);
 const count=calls.length;
 assert.equal((await checkProtectedSessionNetwork(env,req,{user:{is_owner:true}})).allowed,true);
 assert.equal((await checkProtectedSessionNetwork({...env,AIO_VPN_LOGIN_MODE:'monitor'},req,session)).allowed,true);
 assert.equal(calls.length,count);
});
test('both registration paths still use shared preflight; old guards remain wired',()=>{
 const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 for(const p of ['functions/api/community-auth.js','functions/_aio_social_v1.js'])assert.match(src(p),/await registrationPreflight\(/);
 assert.match(src('functions/_aio_multikonta_guard_v2.js'),/await recentAccountSignal\(/);
 assert.match(src('functions/_aio_multikonta_guard_v2.js'),/hold:mode==='enforce'&&score>=5/);
 assert.match(src('functions/_aio_session_network_v1.js'),/aio-session-network-v2:/);
 assert.doesNotMatch(src('functions/_aio_session_network_v1.js'),/if\(publicNetworkIp\(original\.ip_address\)===ip\)/);
 assert.match(src('functions/_middleware.js'),/rename_required/);
 assert.match(src('functions/_aio_security_core_v1.js'),/checkProtectedSessionNetwork/);
 const legacy=src('functions/api/aio-account-access.js');
 assert.match(legacy,/if\(action==='consume'\)[\s\S]*?await reviewPaidSessionSharing[\s\S]*?await consumeFree/);
});
