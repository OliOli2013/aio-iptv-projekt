/* AIO Review — odwołanie od blokady, właściciel otrzymuje wiadomość w Skrzynce AIO.
   Uwierzytelnianie: poprawne hasło -> sesja ograniczona, nie umożliwia pobierania.
   Brak jawnych IP i e-maili w odpowiedziach i logach. */
import {json,getSession,cleanText,isoNow,errorResponse} from '../_community.js';
import {ensureListInbox,sendListNoticeEmail} from '../_aio_list_notice.js';
import {ensureRelatedReviewV1,isRelatedReviewTarget} from '../_aio_related_review_v1.js';
import {strictGlobalHold} from '../_aio_strict_ip_v4.js'; // V4.2

const SUBJECT='[ODWOŁANIE AIO] Weryfikacja powiązanych kont';
function sameOrigin(req){
  const o=req.headers.get('Origin');
  if(o){try{if(new URL(o).origin!==new URL(req.url).origin)return false;}catch(_){return false;}}
  return req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
async function reviewSession(req,env){
  await ensureRelatedReviewV1(env);
  const session=await getSession(req,env,{touch:false,allowUnverified:true});
  const p=session?.user;
  if(!p)return null;
  const oldReview=isRelatedReviewTarget(p.id)&&
    !!(p.banned_until&&Date.parse(p.banned_until)>Date.now());
  const ipReview=!!(await strictGlobalHold(env,p.id));
  if(!oldReview&&!ipReview)return null;
  // Nawet przy aktywnej sesji nie udzielaj normalnych uprawnień.
  return {id:p.id,name:String(p.display_name||'Użytkownik').slice(0,60)};
}
export async function onRequestGet({request,env}){
  try{
    const u=await reviewSession(request,env);
    if(!u)return json({ok:true,eligible:false,message:'Aby wysłać odwołanie, zaloguj się na zablokowane konto lub napisz e-mail.'});
    await ensureListInbox(env);
    const rows=await env.COMMUNITY_DB.prepare(`SELECT id,created_at,status,admin_reply,replied_at
      FROM aio_list_inbox WHERE sender_id=? AND subject=? ORDER BY created_at DESC LIMIT 20`)
      .bind(u.id,SUBJECT).all();
    return json({ok:true,eligible:true,account_name:u.name,items:rows.results||[]});
  }catch(e){return errorResponse(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!String(request.headers.get('Content-Type')||'').includes('application/json'))
    return json({ok:false,error:'Wymagany format JSON.'},415);
  try{
    const u=await reviewSession(request,env);
    if(!u)return json({ok:false,error:'Brak ważnej sesji odwołania. Zaloguj się ponownie na zablokowane konto.'},401);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='send')return json({ok:false,error:'Nieprawidłowa operacja.'},400);
    const message=cleanText(body.message,2000);
    if(message.length<20)return json({ok:false,error:'Opisz sprawę w co najmniej 20 znakach.'},400);
    await ensureListInbox(env);
    const now=isoNow(),since=new Date(Date.now()-24*3600000).toISOString(),short=new Date(Date.now()-5*60000).toISOString();
    const id=crypto.randomUUID(),db=env.COMMUNITY_DB;
    const fullBody='Odwołanie dotyczące blokady powiązanych kont.\nID konta: '+u.id+ '\nNazwa: '+u.name+'\n\n'+message;
    const inserted=await db.prepare(`INSERT INTO aio_list_inbox
      (id,sender_id,kind,subject,body,status,created_at,email_status)
      SELECT ?,?,'contact',?,?,'new',?,'disabled'
      WHERE (SELECT COUNT(*) FROM aio_list_inbox WHERE sender_id=? AND kind='contact' AND created_at>=?)<3
        AND NOT EXISTS (SELECT 1 FROM aio_list_inbox WHERE sender_id=? AND kind='contact' AND created_at>=?)`)
      .bind(id,u.id,SUBJECT,fullBody,now,u.id,since,u.id,short).run();
    if(!Number(inserted.meta?.changes||0))return json({ok:false,error:'Limit wiadomości: 3 na dobę i co najmniej 5 minut przerwy.'},429);
    const emailStatus=await sendListNoticeEmail(env,{id,kind:'contact',subject:SUBJECT,body:fullBody})
      .catch(()=> 'error');
    await db.prepare('UPDATE aio_list_inbox SET email_status=? WHERE id=?')
      .bind(String(emailStatus).slice(0,40),id).run().catch(()=>{});
    return json({ok:true,message:'Odwołanie zapisano w Skrzynce AIO. Odpowiedź pojawi się tutaj po rozpatrzeniu.'});
  }catch(e){return errorResponse(e);}
}
