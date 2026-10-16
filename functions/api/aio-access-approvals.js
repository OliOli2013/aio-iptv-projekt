/* AIO Access V4.1 — requests, expedited messages, owner approval. */
import {requireAdmin} from '../_community.js';
import {initAccess,sessionUser,response,fail,SUPPORT_MS} from '../_aio_account_access.js';
import {createListNotice} from '../_aio_list_notice.js';
function sameOrigin(req){
  const origin=req.headers.get('Origin');
  return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function apiError(error){return response({ok:false,error:String(error?.message||'Błąd serwera')},Number(error?.status)||500);}
function uuid(v){return /^[a-f0-9-]{36}$/i.test(String(v||''));}
function textClean(v,max=1500){return String(v||'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);}
export async function onRequestGet({request,env}){
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user)return response({ok:true,authenticated:false,pending:[]});
    const admin=new URL(request.url).searchParams.get('scope')==='admin';
    if(admin){
      await requireAdmin(request,env,true);
      const rows=await env.COMMUNITY_DB.prepare(`SELECT r.id,r.user_id,r.method,r.status,r.created_at,r.priority_message,r.priority_sent_at,
          r.reviewed_at,r.review_reason,p.display_name,a.email
          FROM aio_access_approval_requests r
          JOIN community_profiles p ON p.id=r.user_id
          LEFT JOIN community_auth a ON a.user_id=r.user_id
          ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,
                   CASE WHEN r.priority_sent_at IS NOT NULL THEN 0 ELSE 1 END,
                   r.created_at DESC LIMIT 150`).all();
      return response({ok:true,requests:rows.results||[]});
    }
    const rows=await env.COMMUNITY_DB.prepare(`SELECT id,method,status,created_at,priority_sent_at,reviewed_at,review_reason
      FROM aio_access_approval_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 5`)
      .bind(user.id).all();
    return response({ok:true,authenticated:true,requests:rows.results||[]});
  }catch(e){return apiError(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return response({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user)throw fail(401,'Zaloguj się do AIO, aby kontynuować.');
    if(!(request.headers.get('Content-Type')||'').includes('application/json'))throw fail(415,'Wymagane JSON.');
    const body=await request.json().catch(()=>({}));
    const action=String(body.action||'');
    const id=String(body.id||'');
    if(!uuid(id))throw fail(400,'Nieprawidłowe zgłoszenie.');
    const db=env.COMMUNITY_DB;
    if(action==='expedite'){
      const message=textClean(body.message,1200);
      if(message.length<20)throw fail(400,'Opisz sprawę w co najmniej 20 znakach.');
      const now=new Date().toISOString();
      const result=await db.prepare(`UPDATE aio_access_approval_requests
        SET priority_message=?,priority_sent_at=?
        WHERE id=? AND user_id=? AND status='pending' AND priority_sent_at IS NULL`)
        .bind(message,now,id,user.id).run();
      if(Number(result.meta?.changes||0)!==1)throw fail(409,'Wiadomość została już wysłana albo zgłoszenie rozpatrzono.');
      try{
        await createListNotice(env,{senderId:user.id,kind:'contact',
          subject:'Pilna weryfikacja AIO Access — '+id.slice(0,8),
          body:'Użytkownik prosi o szybszą weryfikację wsparcia. Numer zgłoszenia: '+id+'\n\n'+message});
      }catch(e){console.error('AIO Access: nie udało się powiadomić skrzynki',String(e?.message||e));}
      return response({ok:true,message:'Prośba zapisana. Administrator zobaczy ją w kolejce weryfikacji i skrzynce.'});
    }
    await requireAdmin(request,env,true);
    const row=await db.prepare('SELECT * FROM aio_access_approval_requests WHERE id=?').bind(id).first();
    if(!row)throw fail(404,'Nie znaleziono zgłoszenia.');
    if(row.status!=='pending')throw fail(409,'Zgłoszenie zostało już rozpatrzone.');
    const now=new Date().toISOString();
    const reason=textClean(body.reason,350);
    if(action==='reject'){
      if(reason.length<5)throw fail(400,'Podaj powód odrzucenia (minimum 5 znaków).');
      const result=await db.prepare(`UPDATE aio_access_approval_requests
        SET status='rejected',reviewed_at=?,reviewed_by=?,review_reason=? WHERE id=? AND status='pending'`)
        .bind(now,user.id,reason,id).run();
      if(Number(result.meta?.changes||0)!==1)throw fail(409,'Zgłoszenie zostało już rozpatrzone.');
      return response({ok:true,message:'Zgłoszenie odrzucone. Autor zobaczy powód.'});
    }
    if(action==='approve'){
      if(body.verified!==true)throw fail(400,'Musisz potwierdzić sprawdzenie wpłaty w systemie dostawcy.');
      const expiry=new Date(Date.now()+SUPPORT_MS).toISOString();
      // Atomic D1 batch: never mark a request approved without persisting the entitlement.
      const results=await db.batch([
        db.prepare(`UPDATE aio_access_approval_requests
          SET status='approved',reviewed_at=?,reviewed_by=?,review_reason=?
          WHERE id=? AND status='pending'`).bind(now,user.id,'Potwierdzona wpłata',id),
        db.prepare(`INSERT INTO aio_access_account_grants(user_id,issued_at,expires_at,source,reference,updated_at)
          SELECT user_id,?,?, 'owner_verified_support',?,? FROM aio_access_approval_requests
          WHERE id=? AND status='approved' AND reviewed_at=?
          ON CONFLICT(user_id) DO UPDATE SET issued_at=excluded.issued_at,
          expires_at=excluded.expires_at,source=excluded.source,reference=excluded.reference,
          updated_at=excluded.updated_at
          WHERE excluded.expires_at>aio_access_account_grants.expires_at`)
          .bind(now,expiry,'owner-approval:'+id,now,id,now)
      ]);
      if(Number(results?.[0]?.meta?.changes||0)!==1)throw fail(409,'Zgłoszenie zostało już rozpatrzone.');
      return response({ok:true,expires_at:expiry,message:'Wpłata zatwierdzona. Konto ma aktywny dostęp przez 7 dni.'});
    }
    throw fail(400,'Nieznana operacja.');
  }catch(e){return apiError(e);}
}
