/* Owner-only similarity queue — never public account enumeration or automatic account bans. */
import {requireAdmin,json,moderationLog,clientIp} from '../_community.js';
import {scanAccountSimilarity,listSimilarityReviews,reviewSimilarity} from '../_aio_account_similarity_v1.js';
const headers={'cache-control':'private, no-store','x-robots-tag':'noindex,nofollow','x-content-type-options':'nosniff'};
const reply=(obj,code=200)=>json(obj,code,headers);
const failure=e=>reply({ok:false,error:e?.status>=400&&e?.status<500?String(e.message||'Błąd.'):'Błąd analizy powiązań. Sprawdź logi serwera.'},e?.status>=400&&e?.status<500?e.status:500);
function sameOrigin(req){return req.headers.get('Origin')===new URL(req.url).origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site';}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const q=new URL(request.url).searchParams;
    return reply(await listSimilarityReviews(env,{status:q.get('status')||'pending',q:q.get('q')||'',limit:80}));
  }catch(e){console.error('[AIO similarity GET]',String(e?.status||e?.message||'error').slice(0,150));return failure(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return reply({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!/application\/json/i.test(request.headers.get('content-type')||''))return reply({ok:false,error:'Oczekiwano JSON.'},415);
  try{
    const session=await requireAdmin(request,env,true);
    const data=await request.json().catch(()=>null);
    if(!data||typeof data!=='object')return reply({ok:false,error:'Nieprawidłowe dane.'},400);
    if(data.action==='scan'){
      const result=await scanAccountSimilarity(env);
      try{await moderationLog(env,session.user.id,{targetUserId:session.user.id,targetType:'user',targetId:session.user.id,
        action:'aio_similarity_scan_v1',reason:'Ręczne skanowanie podobnych kont',ip:clientIp(request),metadata:{findings:result.findings,accounts:result.accounts_scanned}});}catch(_){/* audit already in D1 queue */}
      return reply({ok:true,...result,message:'Skan zakończony. Nie zablokowano żadnego konta.'});
    }
    const result=await reviewSimilarity(env,{pairId:data.pair_id,action:data.action,ownerId:session.user.id,note:data.note});
    try{await moderationLog(env,session.user.id,{targetUserId:session.user.id,targetType:'user',targetId:session.user.id,
      action:'aio_similarity_'+data.action+'_v1',reason:'Weryfikacja powiązania kont',ip:clientIp(request),metadata:{pair_id:data.pair_id}});}catch(_){/* queue contains review */}
    return reply(result);
  }catch(e){console.error('[AIO similarity POST]',String(e?.status||e?.message||'error').slice(0,150));return failure(e);}
}
