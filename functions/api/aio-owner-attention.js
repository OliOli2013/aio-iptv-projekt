/* AIO Owner Attention V1 — read-only, owner-only aggregated pending queue.
 * No payout is marked verified by this endpoint; it does not alter business status.
 */
import {requireAdmin} from '../_community.js';
import {ensureV6} from '../_aio_security_v6.js';
import {ensureIpPolicy} from '../_aio_ip_one_account_v7.js';

const HEADERS = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'vary':'Cookie'
};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});

// Never accept SQL, links, or identity from the browser. All queries are static.
const DEFINITIONS = [
  {
    id:'reported-support', title:'Wpłaty zgłoszone do weryfikacji',
    detail:'Deklaracje użytkowników — sprawdź wpłatę przed zatwierdzeniem.',
    href:'/owner-support-intents.html', icon:'♡', priority:'high',
    sql:"SELECT COUNT(*) n,MAX(reported_at) latest FROM aio_support_intents WHERE status='reported'"
  },
  {
    id:'access-approvals', title:'Zgłoszenia dostępu 7 dni',
    detail:'Wnioski oczekujące na decyzję; samo zgłoszenie nie potwierdza płatności.',
    href:'/owner-hub#panel=approvals', icon:'◷', priority:'high',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM aio_access_approval_requests WHERE status='pending'"
  },
  {
    id:'messages', title:'Nowe wiadomości użytkowników',
    detail:'Nieprzeczytane wiadomości ze Skrzynki AIO.',
    href:'/owner-hub#panel=inbox', icon:'✉', priority:'high',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM aio_list_inbox WHERE status='new'"
  },
  {
    id:'posts', title:'Posty do zatwierdzenia',
    detail:'Wpisy oczekujące na moderację.',
    href:'/owner-hub#panel=pending', icon:'▤', priority:'normal',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM community_posts WHERE status='pending'"
  },
  {
    id:'reports', title:'Zgłoszenia naruszeń',
    detail:'Otwarte zgłoszenia dotyczące treści lub użytkowników.',
    href:'/owner-hub#panel=reports', icon:'⚑', priority:'high',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM community_reports WHERE status='open'"
  },
  {
    id:'resets', title:'Prośby o reset hasła',
    detail:'Nierozpatrzone prośby o przywrócenie dostępu.',
    href:'/owner-hub#panel=resets', icon:'⚿', priority:'normal',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM community_password_reset_requests WHERE status='pending'"
  },
  {
    id:'lists', title:'Listy kanałów do moderacji',
    detail:'Wnioski o publikację lub aktualizację list ZIP.',
    href:'/aio-list-upload.html#aluAdmin', icon:'▦', priority:'normal',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM aio_list_submissions WHERE status='pending'"
  },
  {
    id:'list-errors', title:'Błędy publikacji list ZIP',
    detail:'Publikacja nie powiodła się — wymaga wyjaśnienia lub ponowienia.',
    href:'/aio-list-upload.html#aluAdmin', icon:'!', priority:'high',
    sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM aio_list_submissions WHERE status='publish_failed'"
  },
  {
    id:'security-holds', title:'Aktywne blokady bezpieczeństwa',
    detail:'Sprawdź ograniczenia pobierania i ewentualne odwołania.',
    href:'/owner-hub#panel=security-journal', icon:'⛨', priority:'normal',
    sql:`SELECT
      (SELECT COUNT(*) FROM aio_security_shared_holds WHERE status='active' AND expires_at>?) +
      (SELECT COUNT(*) FROM aio_security_paid_holds WHERE status='active' AND expires_at>?) AS n,
      (SELECT MAX(created_at) FROM (
        SELECT created_at FROM aio_security_shared_holds WHERE status='active' AND expires_at>?
        UNION ALL SELECT created_at FROM aio_security_paid_holds WHERE status='active' AND expires_at>?
      )) AS latest`, params:now=>[now,now,now,now]
  }
];

DEFINITIONS.push({id:'v6-blocks',title:'Nowe blokady Security V6',
  detail:'Automatyczne lub ręczne blokady wymagające przeglądu.',
  href:'/owner-hub#panel=v6-blocks',icon:'⛨',priority:'high',
  sql:"SELECT COUNT(*) n,MAX(created_at) latest FROM aio_v6_blocks WHERE status='active' AND expires_at>? AND reviewed_at IS NULL",
  params:now=>[now]});
// V8.1 IP-policy holds require explicit owner review. Merely viewing the bell does not acknowledge them.
DEFINITIONS.push({id:'ip-policy-blocks',title:'Nowe blokady — wspólny IP',
  detail:'Blokady V8.1 wymagające przejrzenia. Konta pozostają zablokowane do odrębnej decyzji.',
  href:'/owner-hub#panel=ip-policy-v7',icon:'⛨',priority:'high',
  sql:`SELECT COUNT(*) n,MAX(h.created_at) latest FROM aio_ip_policy_holds_v8 h
    WHERE h.status='active' AND NOT EXISTS (
      SELECT 1 FROM aio_ip_policy_hold_reviews_v9 r
      WHERE r.user_id=h.user_id AND r.ip_key=h.ip_key AND r.hold_created_at=h.created_at)`});
export async function onRequestGet({request,env}){
  try{
    // Validates the CURRENT session and the configured owner ID server-side.
    await requireAdmin(request,env,true);
    await ensureV6(env);
    await ensureIpPolicy(env);
    const db=env.COMMUNITY_DB;
    if(!db)return response({ok:false,error:'Baza danych niedostępna.'},503);
    const now=new Date().toISOString();
    const results=await Promise.allSettled(DEFINITIONS.map(async item=>{
      const stmt=db.prepare(item.sql);
      const r=await (item.params?stmt.bind(...item.params(now)):stmt).first();
      return {id:item.id,title:item.title,detail:item.detail,href:item.href,
        icon:item.icon,priority:item.priority,count:Math.max(0,Number(r?.n)||0),
        latest:r?.latest||null};
    }));
    const items=[],unavailable=[];
    results.forEach((result,index)=>{
      if(result.status==='fulfilled')items.push(result.value);
      else {
        unavailable.push(DEFINITIONS[index].title);
        console.error('[AIO owner attention] source',DEFINITIONS[index].id,String(result.reason?.message||'error').slice(0,160));
      }
    });
    const total=items.reduce((n,item)=>n+item.count,0);
    return response({ok:true,total,items:items.filter(x=>x.count>0),unavailable,
      complete:unavailable.length===0,checked_at:now,
      note:'Zdarzenia wymagające decyzji, w tym nowe blokady V6 i IP V8.1. Nie obejmuje całych logów Cloudflare.'});
  }catch(error){
    const status=error?.status===401?401:error?.status===403?403:500;
    if(status===500)console.error('[AIO owner attention] request failed',String(error?.message||error).slice(0,160));
    return response({ok:false,error:status===500?'Nie można sprawdzić powiadomień właściciela.':'Brak dostępu.'},status);
  }
}
