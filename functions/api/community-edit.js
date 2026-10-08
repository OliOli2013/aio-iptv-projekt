import {
  json, ensureSchema, requireUser, isAdmin, cleanText, allowedCategory,
  allowedPostType, parseAttachments, errorResponse, isoNow, clientIp,
  moderationLog
} from "../_community.js";

function normalizeAttachment(item){
  if(!item || typeof item!=="object") return null;
  const key=cleanText(item.key||item.path||"",500);
  if(!key) return null;
  return {
    key,
    path:key,
    name:cleanText(item.name||"obraz",180),
    type:cleanText(item.type||"image/jpeg",80),
    size:Math.max(0,Number(item.size||0)||0)
  };
}

function keySet(list){
  return new Set((list||[]).map(x=>String(x?.key||x?.path||"")).filter(Boolean));
}

export async function onRequestPost({request,env}){
  try{
    await ensureSchema(env);
    const s=await requireUser(request,env);

    const type=request.headers.get("content-type")||"";
    if(!type.includes("application/json")) return json({ok:false,error:"Oczekiwano danych JSON."},400);

    const body=await request.json();
    if(String(body.action||"")!=="edit_post") return json({ok:false,error:"Nieznana operacja."},400);

    const id=cleanText(body.id,120);
    const row=await env.COMMUNITY_DB.prepare(`SELECT * FROM community_posts WHERE id=? LIMIT 1`).bind(id).first();
    if(!row) return json({ok:false,error:"Nie znaleziono wpisu."},404);

    const admin=isAdmin(s);
    const owner=row.author_id===s.user.id;
    if(!owner&&!admin) return json({ok:false,error:"Nie masz uprawnień do edycji tego wpisu."},403);

    const title=cleanText(body.title,140);
    const content=cleanText(body.content,50000);
    if(title.length<6) return json({ok:false,error:"Tytuł musi mieć co najmniej 6 znaków."},400);
    if(content.length<20) return json({ok:false,error:"Treść musi mieć co najmniej 20 znaków."},400);

    const oldAttachments=parseAttachments(row.attachments).map(normalizeAttachment).filter(Boolean);
    const oldKeys=keySet(oldAttachments);

    const attachments=(Array.isArray(body.attachments)?body.attachments:[])
      .slice(0,5)
      .map(normalizeAttachment)
      .filter(Boolean);

    if(attachments.length>4) return json({ok:false,error:"Wpis może mieć maksymalnie 4 zdjęcia."},400);

    const seen=new Set();
    for(const item of attachments){
      if(seen.has(item.key)) return json({ok:false,error:"Ten sam załącznik został dodany więcej niż raz."},400);
      seen.add(item.key);

      // Można zachować plik, który już należał do tego wpisu.
      if(oldKeys.has(item.key)) continue;

      // Nowe zdjęcie musi być świeżo wysłane przez aktualnie zalogowanego użytkownika.
      if(!item.key.startsWith(`${s.user.id}/post/`)){
        return json({ok:false,error:"Nieprawidłowy nowy załącznik."},400);
      }
    }

    const now=isoNow();
    const official=admin ? Boolean(body.official) : row.kind==="official";
    let reason=cleanText(body.reason||"",500);
    if(!reason) reason=owner ? "Edycja autora" : "Edycja administratora";

    await env.COMMUNITY_DB.prepare(`
      UPDATE community_posts
      SET title=?,content=?,category=?,post_type=?,kind=?,attachments=?,
          edited_at=?,edited_by=?,edit_reason=?,updated_at=?
      WHERE id=?
    `).bind(
      title,
      content,
      allowedCategory(body.category),
      allowedPostType(body.postType),
      official?"official":"community",
      JSON.stringify(attachments),
      now,
      s.user.id,
      reason,
      now,
      id
    ).run();

    // Dopiero po udanym zapisie bazy usuwamy z R2 zdjęcia usunięte z wpisu.
    const newKeys=keySet(attachments);
    for(const old of oldAttachments){
      if(old.key&&!newKeys.has(old.key)){
        await env.COMMUNITY_MEDIA.delete(old.key).catch(()=>{});
      }
    }

    if(admin&&!owner){
      await moderationLog(env,s.user.id,{
        targetUserId:row.author_id,
        targetType:"post",
        targetId:id,
        action:"edit",
        reason,
        ip:clientIp(request),
        metadata:{attachments:attachments.length}
      });
    }

    return json({ok:true,id,edited_at:now,attachments:attachments.length});
  }catch(e){
    return errorResponse(e);
  }
}
