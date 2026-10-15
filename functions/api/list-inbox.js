/* AIO List V1.4 — private user messages and owner's inbox. */
import {json,requireUser,requireAdmin,errorResponse,cleanText,isoNow} from '../_community.js';
import {ensureListInbox,createListNotice,mailConfigured,sendListNoticeEmail} from '../_aio_list_notice.js';
function err(code,message){return Object.assign(new Error(message),{status:code});}
function sameOrigin(req){const o=req.headers.get('Origin');return (!o||o===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';}
function goodId(s){return /^[a-f0-9-]{36}$/.test(String(s||''));}
export async function onRequestGet({request,env}){
  try{
    await ensureListInbox(env);
    const session=await requireUser(request,env);
    const admin=new URL(request.url).searchParams.get('scope')==='admin';
    if(admin){
      await requireAdmin(request,env,true);
      const r=await env.COMMUNITY_DB.prepare(`SELECT m.*,p.display_name AS sender_name FROM aio_list_inbox m
        JOIN community_profiles p ON p.id=m.sender_id
        ORDER BY CASE WHEN m.status='new' THEN 0 ELSE 1 END,m.created_at DESC LIMIT 150`).all();
      const count=await env.COMMUNITY_DB.prepare("SELECT COUNT(*) AS n FROM aio_list_inbox WHERE status='new'").first();
      return json({ok:true,items:r.results||[],unread:Number(count?.n||0),email_configured:mailConfigured(env)});
    }
    const rr=await env.COMMUNITY_DB.prepare(`SELECT id,kind,subject,body,list_id,status,admin_reply,created_at,replied_at
       FROM aio_list_inbox WHERE sender_id=? ORDER BY created_at DESC LIMIT 50`).bind(session.user.id).all();
    return json({ok:true,items:rr.results||[]});
  }catch(e){return errorResponse(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{
    await ensureListInbox(env);
    const session=await requireUser(request,env);
    if(!(request.headers.get('content-type')||'').includes('application/json'))throw err(415,'Oczekiwano JSON.');
    const payload=await request.json().catch(()=>({}));
    const action=String(payload.action||'');
    const db=env.COMMUNITY_DB;
    if(action==='send'){
      const subject=cleanText(payload.subject,120),body=cleanText(payload.body,2000);
      if(subject.length<5||body.length<15)throw err(400,'Temat min. 5 znaków, wiadomość min. 15 znaków.');
      const since=new Date(Date.now()-24*60*60*1000).toISOString();
      const shortSince=new Date(Date.now()-5*60*1000).toISOString();
      // Atomic INSERT ... WHERE protects against concurrent, multi-IP submissions.
      const id=crypto.randomUUID(),now=isoNow();
      const inserted=await db.prepare(`INSERT INTO aio_list_inbox
        (id,sender_id,kind,subject,body,status,created_at,email_status)
        SELECT ?,?,'contact',?,?,'new',?,'disabled'
        WHERE (SELECT COUNT(*) FROM aio_list_inbox WHERE sender_id=? AND kind='contact' AND created_at>=?)<3
        AND NOT EXISTS (SELECT 1 FROM aio_list_inbox WHERE sender_id=? AND kind='contact' AND created_at>=?)`
      ).bind(id,session.user.id,subject,body,now,session.user.id,since,session.user.id,shortSince).run();
      if(!inserted.meta?.changes)throw err(429,'Możesz wysłać do 3 wiadomości dziennie, minimum 5 minut między wiadomościami.');
      const email_status=await sendListNoticeEmail(env,{id,kind:'contact',subject,body});
      await db.prepare('UPDATE aio_list_inbox SET email_status=? WHERE id=?').bind(email_status,id).run().catch(()=>{});
      return json({ok:true,message:'Wiadomość dotarła do skrzynki właściciela AIO. Odpowiedź zobaczysz w sekcji Moje wiadomości.'});
    }
    await requireAdmin(request,env,true);
    const id=String(payload.id||'');if(!goodId(id))throw err(400,'Nieprawidłowe ID wiadomości.');
    const record=await db.prepare('SELECT * FROM aio_list_inbox WHERE id=?').bind(id).first();
    if(!record)throw err(404,'Nie znaleziono wiadomości.');
    if(action==='read'){
      await db.prepare("UPDATE aio_list_inbox SET status=CASE WHEN status='new' THEN 'read' ELSE status END,admin_read_at=COALESCE(admin_read_at,?) WHERE id=?")
        .bind(isoNow(),id).run();
      return json({ok:true});
    }
    if(action==='reply'){
      const reply=cleanText(payload.reply,2000);if(reply.length<2)throw err(400,'Odpowiedź jest zbyt krótka.');
      await db.prepare("UPDATE aio_list_inbox SET admin_reply=?,replied_at=?,status='replied',admin_read_at=COALESCE(admin_read_at,?) WHERE id=?")
        .bind(reply,isoNow(),isoNow(),id).run();
      return json({ok:true,message:'Odpowiedź zapisana i widoczna na koncie autora.'});
    }
    throw err(400,'Nieznana akcja.');
  }catch(e){return errorResponse(e);}
}
