/* AIO Security Core V1 — owner-only, read-only operational status.
 * No IP, email, individual account IDs, tokens or detection thresholds exposed.
 */
import {requireAdmin} from '../_community.js';
import {AIO_SECURITY_CORE_VERSION} from '../_aio_security_core_v1.js';
import {privateStorageEnabled} from '../_aio_private_files.js';
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'};
const send=(x,code=200)=>new Response(JSON.stringify(x),{status:code,headers:HEAD});
const sources=[
  {key:'profiles',sql:'SELECT COUNT(*) n FROM community_profiles WHERE banned_until>?',date:true},
  {key:'strict_v4',sql:"SELECT COUNT(DISTINCT user_id) n FROM aio_strict_ip_holds_v4 WHERE status='active'"},
  {key:'ip_v8',sql:"SELECT COUNT(DISTINCT user_id) n FROM aio_ip_policy_holds_v8 WHERE status='active'"},
  {key:'v6',sql:"SELECT COUNT(DISTINCT user_id) n FROM aio_v6_blocks WHERE status='active' AND expires_at>?",date:true},
  {key:'multikonta',sql:"SELECT COUNT(*) n FROM aio_multikonta_reviews_v2 WHERE status='pending'"},
  {key:'manual_related',sql:"SELECT COUNT(*) n FROM aio_related_account_review_v1 WHERE decision='pending'"}
];
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const db=env.COMMUNITY_DB;
    const counts={},unavailable=[];
    const now=new Date().toISOString();
    for(const source of sources){
      try{const stmt=db.prepare(source.sql),row=await (source.date?stmt.bind(now):stmt).first();
        counts[source.key]=Number(row?.n||0);
      }catch(e){unavailable.push(source.key);console.error('[AIO Core status]',source.key,String(e?.message||e).slice(0,80));}
    }
    const r2Mode=privateStorageEnabled(env),binding=Boolean(env.AIO_PRIVATE_FILES&&typeof env.AIO_PRIVATE_FILES.get==='function');
    return send({ok:true,version:AIO_SECURITY_CORE_VERSION,generated_at:now,
      policies:{single_account_network:'existing_v4_v8_unchanged',monthly_free_limit:3,
        free_reset:'calendar_month_from_third',public_aio_panel_ipk:true,captcha_on_normal_downloads:false,
        quota_engine:'existing_atomic_aio_monthly_access',normal_download_ui_unchanged:true},
      protected_paths:['/pliki/*','/api/aio-post-link (external file handoffs)','/api/aio-account-access (legacy consume)'],
      storage:{mode:r2Mode?'r2':'legacy',private_binding_present:binding,
        externally_accessible_r2_endpoints_verified:false},
      warnings:[
        ...(!r2Mode?['PRIVATE_STORAGE_OFF: wydawanie prywatnych plików jest wstrzymane do włączenia trybu r2.']:[]),
        ...(r2Mode&&!binding?['MISSING_R2_BINDING: magazyn prywatny niedostępny.']:[]),
        'EXTERNAL_FILES: po przekazaniu linku nie kontrolujemy pobrania u zewnętrznego dostawcy.',
        'R2_PUBLIC_ACCESS: zweryfikuj ręcznie ustawienia r2.dev i domen niestandardowych.',
        'UNIQUE_PERSON: IP i e-mail nie stanowią jednoznacznego dowodu tożsamości.'
      ],
      active_holds_by_source:counts,unavailable_sources:unavailable});
  }catch(e){
    const status=e?.status===401?401:e?.status===403?403:503;
    return send({ok:false,error:status===503?'Nie można odczytać statusu.': 'Brak uprawnień.'},status);
  }
}
export async function onRequestPost(){return send({ok:false,error:'Operacje zapisu są wyłączone.'},405)}
