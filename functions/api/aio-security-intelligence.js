/* Owner-only latest scheduled report; acknowledgment does not release or ban accounts. */
import {requireAdmin,getOwnerId} from '../_community.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','vary':'Cookie'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function owner(request,env){const s=await requireAdmin(request,env,true);const id=await getOwnerId(env);if(!id||s.user.id!==id||s.user.role!=='admin')throw Object.assign(Error('Tylko właściciel'),{status:403});return id;}
async function latest(db){const r=await db.prepare('SELECT checked_at,payload FROM aio_security_intelligence_report_v1 WHERE id=1').first();if(!r)return null;const p=JSON.parse(r.payload);if(p.version!==1||p.checked_at!==r.checked_at||!Array.isArray(p.cases)||!p.metrics||!Array.isArray(p.warnings))throw Error('Invalid report');return p;}
function err(e){if([401,403].includes(e?.status))return out({ok:false,error:'Dostęp wyłącznie dla właściciela.'},e.status);return out({ok:false,error:'Raport niedostępny. Sprawdź migrację D1 i ostatnie uruchomienie Actions.'},503);}
export async function onRequestGet({request,env}){try{await owner(request,env);const db=env.COMMUNITY_DB;const p=await latest(db);if(!p)return out({ok:true,report:null});
 // Join only bounded keys belonging to this snapshot, not historical unrelated acknowledgments.
 const seen=await db.prepare(`SELECT case_key,reviewed_at FROM aio_security_intelligence_seen_v1 WHERE case_key IN (SELECT json_extract(j.value,'$.key') FROM aio_security_intelligence_report_v1 r,json_each(r.payload,'$.cases') j WHERE r.id=1 AND r.checked_at=?)`).bind(p.checked_at).all();
 const map=new Map((seen.results||[]).map(x=>[x.case_key,x.reviewed_at]));
 return out({ok:true,report:{...p,cases:p.cases.map(x=>({...x,reviewed_at:map.get(x.key)||null}))},stale:!Number.isFinite(Date.parse(p.checked_at))||Date.now()-Date.parse(p.checked_at)>30*3600000});
}catch(e){return err(e);}}
export async function onRequestPost({request,env}){try{const id=await owner(request,env);if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return out({ok:false,error:'Niedozwolone źródło'},403);
 if(!String(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return out({ok:false,error:'Wymagany JSON'},415);
 const b=await request.json().catch(()=>null);if(b?.action!=='review'||!/^[a-f0-9]{64}$/.test(b?.key||'')||typeof b.checked_at!=='string')return out({ok:false,error:'Niepoprawne potwierdzenie'},400);
 const db=env.COMMUNITY_DB;const r=await db.prepare(`INSERT INTO aio_security_intelligence_seen_v1(case_key,reviewed_at,actor_id)
 SELECT ?,?,? FROM aio_security_intelligence_report_v1 r WHERE r.id=1 AND r.checked_at=? AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.cases') WHERE json_extract(value,'$.key')=?) ON CONFLICT(case_key) DO UPDATE SET reviewed_at=excluded.reviewed_at,actor_id=excluded.actor_id RETURNING case_key`).bind(b.key,new Date().toISOString(),id,b.checked_at,b.key).all();
 if(r.results?.length!==1)return out({ok:false,error:'Raport się zmienił. Odśwież.'},409);return out({ok:true});
}catch(e){return err(e);}}
