/* Authenticated 7-day access and one free item per account/day. */
import {requireAdmin} from '../_community.js';
import {initAccess,sessionUser,getStatus,consumeFree,startFlow,flowOpened,flowComplete,registerReceipt,response,fail,ROLLOUT,LEGACY_END,guestState,consumeGuest,applyGuestCookie} from '../_aio_account_access.js';
function sameOrigin(req){const origin=req.headers.get('Origin');if(origin && origin!==new URL(req.url).origin)return false;return req.headers.get('Sec-Fetch-Site')!=='cross-site';}
function err(e){return response({ok:false,error:String(e.message||'Błąd serwera.')},Number(e.status)||500);}
export async function onRequestGet({request,env}){
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user){const guest=await guestState(env,request);return applyGuestCookie(response({ok:true,authenticated:false,active:false,free_remaining:0,guest_remaining:guest.guest_remaining}),guest.cookie);}
    return response({ok:true,...await getStatus(env,user.id)});
  }catch(e){return err(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return response({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    const body=await request.json().catch(()=>({}));const action=String(body.action||'');
    if(!user){
      if(action!=='guest_consume')throw fail(401,'Zaloguj się lub zarejestruj, aby pobierać kolejne materiały.');
      const result=await consumeGuest(env,request);
      return applyGuestCookie(response({ok:result.allowed,allowed:result.allowed,guest_remaining:0,authentication_required:!result.allowed},result.allowed?200:429),result.cookie);
    }
    if(action==='consume'){
      const r=await consumeFree(env,user.id);
      return response({ok:r.allowed,...r},r.allowed?200:429);
    }
    if(action==='start')return response({ok:true,...await startFlow(env,user.id,String(body.method||''))});
    if(action==='opened')return response(await flowOpened(env,user.id,String(body.flow_id||'')));
    if(action==='complete')return response(await flowComplete(env,user.id,String(body.flow_id||'')));
    if(action==='receipt'){
      await requireAdmin(request,env,true);
      return response(await registerReceipt(env,body.email,body.paid_at,body.reference));
    }
    if(action==='history'){
      await requireAdmin(request,env,true);
      const rr=await env.COMMUNITY_DB.prepare(`SELECT e.user_id,p.display_name,a.email,
        MAX(e.created_at) AS unlocked_at FROM aio_access_events e
        LEFT JOIN community_profiles p ON p.id=e.user_id
        LEFT JOIN community_auth a ON a.user_id=e.user_id
        WHERE e.event_type='access_unlocked' AND e.user_id IS NOT NULL
        AND e.created_at>=? AND e.created_at<=?
        GROUP BY e.user_id,p.display_name,a.email ORDER BY unlocked_at DESC LIMIT 100`).bind(ROLLOUT,LEGACY_END).all();
      const grants=await env.COMMUNITY_DB.prepare(`SELECT g.user_id,p.display_name,g.expires_at,g.source FROM aio_access_account_grants g
        LEFT JOIN community_profiles p ON p.id=g.user_id ORDER BY g.expires_at DESC LIMIT 100`).all();
      const receipts=await env.COMMUNITY_DB.prepare('SELECT COUNT(*) AS n FROM aio_access_receipts').first();
      return response({ok:true,history:rr.results||[],grants:grants.results||[],receipts_count:Number(receipts?.n||0),notice:'Stare zdarzenie access_unlocked potwierdza przejście ścieżki AIO Access, NIE płatność.'});
    }
    throw fail(400,'Nieznana operacja.');
  }catch(e){return err(e);}
}
