/* Owner-only latest scheduled report; acknowledgment does not release or ban accounts. */
import {requireAdmin,getOwnerId} from '../_community.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','vary':'Cookie'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function owner(request,env){const s=await requireAdmin(request,env,true);const id=await getOwnerId(env);if(!id||s.user.id!==id||s.user.role!=='admin')throw Object.assign(Error('Tylko właściciel'),{status:403});return id;}
async function latest(db){const r=await db.prepare('SELECT checked_at,payload FROM aio_security_intelligence_report_v1 WHERE id=1').first();if(!r)return null;const p=JSON.parse(r.payload);if(p.version!==1||p.checked_at!==r.checked_at||!Array.isArray(p.cases)||!p.metrics||!Array.isArray(p.warnings))throw Error('Invalid report');return p;}
function err(e){if([401,403].includes(e?.status))return out({ok:false,error:'Dostęp wyłącznie dla właściciela.'},e.status);return out({ok:false,error:'Raport niedostępny. Sprawdź migrację D1 i ostatnie uruchomienie Actions.'},503);}
// Identity data is read only after owner authentication, never persisted in the audit.
const ACCOUNT_ID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ORPHAN_ID=/^Przypisanie sieci bez profilu: ([0-9a-f-]{36}) \(/i;
function orphanId(x){const id=x.kind==='orphan_claim'?(x.orphan_id||ORPHAN_ID.exec(String(x.detail||''))?.[1]):null;return ACCOUNT_ID.test(String(id||''))?id:null;}
export async function resolveReportAccounts(db,report,ownerId){
 const ids=new Set();
 for(const c of report.cases){for(const u of (Array.isArray(c.users)?c.users:[])){if(ACCOUNT_ID.test(String(u?.id||''))&&u.id!==ownerId)ids.add(u.id);}const id=orphanId(c);if(id&&id!==ownerId)ids.add(id);}
 const selected=[...ids].slice(0,1500),accounts=Object.create(null);
 if(!selected.length)return {accounts,incomplete:false};
 // One bound JSON parameter rather than many SQL placeholders. Never accept IDs from the client.
 const live=await db.prepare(`SELECT p.id,p.role,p.display_name,p.banned_until,COALESCE(NULLIF(a.email,''),NULLIF(p.email,'')) AS email
   FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
   WHERE p.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(selected)).all();
 const remaining=new Set(selected);
 for(const p of live.results||[]){if(!remaining.has(p.id))continue;remaining.delete(p.id);
   accounts[p.id]=p.role==='user'?{state:'live',name:p.display_name||'',email:p.email||null,blocked:Number.isFinite(Date.parse(p.banned_until))&&Date.parse(p.banned_until)>Date.now()}:{state:'protected'};
 }
 if(remaining.size){
  const archived=await db.prepare(`WITH ranked AS (
    SELECT m.target_id AS id,CASE WHEN json_valid(m.metadata) THEN json_extract(m.metadata,'$.display_name') END AS name,
      ROW_NUMBER() OVER(PARTITION BY m.target_id ORDER BY m.created_at DESC,m.id DESC) AS rn
    FROM community_moderation_log m WHERE m.target_type='user' AND m.action='owner_archive_no_ip_v1'
      AND m.target_id IN (SELECT value FROM json_each(?)))
    SELECT id,name FROM ranked WHERE rn=1`).bind(JSON.stringify([...remaining])).all();
  for(const a of archived.results||[]){if(!remaining.has(a.id))continue;accounts[a.id]={state:'archived',name:typeof a.name==='string'?a.name.slice(0,100):null};remaining.delete(a.id);}
  for(const id of remaining)accounts[id]={state:'missing'};
 }
 return {accounts,incomplete:selected.length<ids.size};
}
export async function onRequestGet({request,env}){try{const ownerId=await owner(request,env);const db=env.COMMUNITY_DB;const p=await latest(db);if(!p)return out({ok:true,report:null});
 // Join only bounded keys belonging to this snapshot, not historical unrelated acknowledgments.
 const seen=await db.prepare(`SELECT case_key,reviewed_at FROM aio_security_intelligence_seen_v1 WHERE case_key IN (SELECT json_extract(j.value,'$.key') FROM aio_security_intelligence_report_v1 r,json_each(r.payload,'$.cases') j WHERE r.id=1 AND r.checked_at=?)`).bind(p.checked_at).all();
 const map=new Map((seen.results||[]).map(x=>[x.case_key,x.reviewed_at]));
 let identity={accounts:Object.create(null),incomplete:true};
 try{identity=await resolveReportAccounts(db,p,ownerId);}catch(_){/* Do not confuse an unavailable lookup with a missing profile. */}
 return out({ok:true,accounts:identity.accounts,identity_incomplete:identity.incomplete,report:{...p,cases:p.cases.map(x=>({...x,reviewed_at:map.get(x.key)||null}))},stale:!Number.isFinite(Date.parse(p.checked_at))||Date.now()-Date.parse(p.checked_at)>30*3600000});
}catch(e){return err(e);}}
export async function onRequestPost({request,env}){try{const id=await owner(request,env);if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return out({ok:false,error:'Niedozwolone źródło'},403);
 if(!String(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return out({ok:false,error:'Wymagany JSON'},415);
 const b=await request.json().catch(()=>null);if(b?.action!=='review'||!/^[a-f0-9]{64}$/.test(b?.key||'')||typeof b.checked_at!=='string')return out({ok:false,error:'Niepoprawne potwierdzenie'},400);
 const db=env.COMMUNITY_DB;const r=await db.prepare(`INSERT INTO aio_security_intelligence_seen_v1(case_key,reviewed_at,actor_id)
 SELECT ?,?,? FROM aio_security_intelligence_report_v1 r WHERE r.id=1 AND r.checked_at=? AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.cases') WHERE json_extract(value,'$.key')=?) ON CONFLICT(case_key) DO UPDATE SET reviewed_at=excluded.reviewed_at,actor_id=excluded.actor_id RETURNING case_key`).bind(b.key,new Date().toISOString(),id,b.checked_at,b.key).all();
 if(r.results?.length!==1)return out({ok:false,error:'Raport się zmienił. Odśwież.'},409);return out({ok:true});
}catch(e){return err(e);}}
