// AIO Links/Session/Range V1 regression: pure decision cases + route invariants.
// Run after install: node --test tests/aio-links-session-range-v1.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
// Środowisko testowe nie otwiera gniazd Cloudflare SMTP. Stub dotyczy tylko Node test.
registerHooks({
  resolve(specifier,context,nextResolve){
    if(specifier==='cloudflare:sockets')return {
      url:'data:text/javascript,export%20const%20connect%3D()%3D%3E%7Bthrow%20new%20Error(%22SMTP%20unavailable%20in%20unit%20tests%22)%7D',
      shortCircuit:true
    };
    return nextResolve(specifier,context);
  }
});
const [{rangeIssueDecision},{accessNetworkDecision},{classifyPostLink}] = await Promise.all([
  import('../functions/_aio_range_issue_v1.js'),
  import('../functions/_aio_session_network_v1.js'),
  import('../functions/_aio_post_links_v5.js')
]);
const code=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('range 206: one issued lease, pending lease not permitted',()=>{
  const now=2000000;
  assert.equal(rangeIssueDecision(null,now),'new');
  assert.equal(rangeIssueDecision({state:'pending',expires_ms:now+500},now),'pending');
  assert.equal(rangeIssueDecision({state:'issued',expires_ms:now+500},now),'reuse');
  assert.equal(rangeIssueDecision({state:'issued',expires_ms:now},now),'new');
});
test('session: only explicit VPN/proxy/Tor deny, unknown is retry, ordinary networks allow',()=>{
  for(const kind of ['vpn','proxy','tor']){
    const decision=accessNetworkDecision(kind);
    assert.equal(decision.status,403);assert.equal(decision.allowed,false);
  }
  assert.equal(accessNetworkDecision('unknown').status,503);
  for(const kind of ['clean','mobile','datacenter','relay'])
    assert.equal(accessNetworkDecision(kind).allowed,true);
});
test('link classifier: local file, external file, editorial page',()=>{
  const root='https://aio-iptv-projekt.pages.dev';
  assert.equal(classifyPostLink(root+'/pliki/x.deb',root).kind,'local');
  assert.equal(classifyPostLink('https://example.org/downloads/x.zip',root).kind,'external');
  assert.equal(classifyPostLink('https://example.org/article',root).kind,'info');
});
test('all three browser sources use gateway, chat is no longer public-bypassed',()=>{
  const premium=code('assets/js/user-premium.js');
  assert.match(premium,/source:'catalog'/);
  assert.match(premium,/source:'chat',message_id:item.chatId/);
  assert.match(premium,/fetch\(fromChat\?'\/api\/aio-link-handoff':'\/api\/aio-post-link'/);
  assert.match(code('assets/js/community-chat.js'),/formatText\(m\.content\|\|'',null,false\)/);
  assert.match(code('assets/js/community-core.js'),/const chatId=anchor\?\.closest/);
});
test('download and middleware still explicitly distinguish public IPK and protected files',()=>{
  const pliki=code('functions/pliki/[[path]].js');
  assert.match(pliki,/isAioPanelIpkAlias/);
  assert.match(pliki,/asset\.status===206\s*\?await authorizeRange/);
  assert.match(pliki,/if\(!permit\.range_chunk\)/);
  const mw=code('functions/_middleware.js');
  assert.match(mw,/checkProtectedSessionNetwork/);
  assert.match(mw,/if\(path===PUBLIC_IPK_PATH\|\|isAioPanelIpkAlias/);
});
