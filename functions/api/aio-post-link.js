/* AIO Access V5: verified post links, same rolling quota for local and external files.
 * Locally served files are debited by /pliki/ only on a successful 200/206 GET.
 * For external files, a debit means URL handoff, not third-party delivery.
 */
import {json,ensureSchema,sha256} from '../_community.js';
import {initAccess,sessionUser,getStatus,consumeFree} from '../_aio_account_access.js';
import {activeSharedHold,logSecurity} from '../_aio_security_journal.js';
import {linksInPost,normalizePostLink,classifyPostLink,ensurePostLinkSchema,safePostFileName,externalFileKey} from '../_aio_post_links_v5.js';
const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function result(obj,code=200){return json(obj,code,HEADERS)}
function sameOrigin(req){const origin=req.headers.get('Origin');return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site'}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return result({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return result({ok:false,error:'Wymagany JSON.'},415);
  try{
    await ensureSchema(env);
    const body=await request.json().catch(()=>({}));
    const postId=String(body.post_id||'');
    const commentId=String(body.comment_id||'');
    const input=String(body.href||'');
    if(postId.length<8||postId.length>100||commentId.length>100||input.length>2000)return result({ok:false,error:'Nieprawidłowy link posta.'},400);
    const clicked=normalizePostLink(input);
    if(!clicked)return result({ok:false,error:'Nieprawidłowy adres URL.'},400);
    const post=await env.COMMUNITY_DB.prepare(`SELECT id,content,status,kind FROM community_posts WHERE id=? AND status='published' LIMIT 1`).bind(postId).first();
    if(!post)return result({ok:false,error:'Nie znaleziono opublikowanego posta.'},404);
    // Fail closed: verify the current published post OR an approved comment under it.
    let sourceContent=post.content;
    if(commentId){
      const comment=await env.COMMUNITY_DB.prepare("SELECT content FROM community_comments WHERE id=? AND post_id=? AND status='published' LIMIT 1").bind(commentId,postId).first();
      if(!comment)return result({ok:false,error:'Nie znaleziono opublikowanego komentarza.'},404);
      sourceContent=comment.content;
    }
    if(!linksInPost(sourceContent).includes(clicked.href))return result({ok:false,error:'Link nie występuje w aktualnej treści posta.'},403);
    const classified=classifyPostLink(clicked.href,new URL(request.url).origin);
    if(classified.kind==='invalid')return result({ok:false,error:'Nieprawidłowy link.'},400);
    // Editorial links are navigation, never a download. No quota, login or audit.
    if(classified.kind==='info')return result({ok:true,kind:'info',href:clicked.href,counted:false});
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user)return result({ok:false,login_required:true,error:'Pobieranie wymaga zalogowania do AIO.'},401);
    const hold=await activeSharedHold(env,request,user.id);
    if(hold)return result({ok:false,restricted:true,error:hold.message},403);
    const status=await getStatus(env,user.id);
    if(status.email_verified===false)return result({ok:false,email_verification_required:true,error:'Najpierw potwierdź e-mail.'},403);
    if(classified.kind==='local'){
      // No debit here: the actual Cloudflare /pliki/ handler validates and debits on GET.
      const local=new URL(clicked.href);local.searchParams.set('aio_post',postId);
      return result({ok:true,kind:'local',href:local.href,counted:false,accounted_by:'file_server'});
    }
    const fileKey=await externalFileKey(clicked.href,sha256);
    const permit=await consumeFree(env,user.id,fileKey);
    if(!permit.allowed){
      await logSecurity(env,request,'download_denied',user.id,'Limit: link do pliku w poście');
      return result({ok:false,limit_reached:true,error:'Wykorzystano 3 darmowe pobrania na 168 godzin.'},429);
    }
    try {await ensurePostLinkSchema(env);
    await env.COMMUNITY_DB.prepare(`INSERT INTO aio_post_link_handoffs
      (id,user_id,post_id,host,file_name,reason,created_at,kind)
      VALUES(?,?,?,?,?,?,?,'external')`).bind(
        crypto.randomUUID(),user.id,postId,clicked.hostname.slice(0,160),
        safePostFileName(clicked.href),String(permit.reason||'free').slice(0,24),new Date().toISOString()
      ).run();
    await env.COMMUNITY_DB.prepare('DELETE FROM aio_post_link_handoffs WHERE created_at<?')
      .bind(new Date(Date.now()-90*86400000).toISOString()).run();
    }catch(auditError){console.error('AIO post link audit:',String(auditError?.message||auditError).slice(0,130));}
    await logSecurity(env,request,'post_link_handoff',user.id,'Przekazano plik z posta do zewnętrznego serwera');
    return result({ok:true,kind:'external',href:clicked.href,counted:permit.reason==='free',reason:permit.reason,
      note:'Otwarcie linku zewnętrznego; AIO nie potwierdza ukończenia pobierania.'});
  }catch(e){
    console.error('AIO post link V5',String(e?.message||e).slice(0,200));
    return result({ok:false,error:'Nie udało się zweryfikować linku z posta.'},503);
  }
}
export async function onRequestGet(){return result({ok:false,error:'Wymagane żądanie POST.'},405)}
