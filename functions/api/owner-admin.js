import {
  json, ensureSchema, requireAdmin, cleanText, bodyJson, errorResponse,
  isoNow, clientIp, moderationLog, getOwnerId, parseAttachments, countRows
} from "../_community.js";

function safeUa(value){
  return cleanText(value || "", 300);
}

async function exportTable(db, sql, limit = 10000){
  const rr = await db.prepare(`${sql} LIMIT ?`).bind(limit).all();
  return rr.results || [];
}

export async function onRequestGet({request, env}) {
  try {
    await ensureSchema(env);
    const s = await requireAdmin(request, env, true);
    const db = env.COMMUNITY_DB;
    const url = new URL(request.url);
    const tab = String(url.searchParams.get("tab") || "security");
    const ownerId = await getOwnerId(env);

    if (tab === "security") {
      const privileged = await db.prepare(`
        SELECT id,display_name,role,trusted,created_at,updated_at
        FROM community_profiles
        WHERE role IN ('admin','moderator')
        ORDER BY datetime(created_at) ASC
        LIMIT 100
      `).all();
      const activeSessions = await countRows(env, `
        SELECT COUNT(*) AS n FROM community_sessions
        WHERE datetime(expires_at) > datetime('now')
      `);
      const otherPrivileged = (privileged.results || []).filter(x => x.id !== ownerId);
      return json({
        ok:true,
        role:"admin",
        rows:[{
          owner_id: ownerId,
          current_user_id: s.user.id,
          lock_configured: Boolean(String(env.COMMUNITY_OWNER_USER_ID || "").trim()),
          owner_email_configured: Boolean(String(env.COMMUNITY_OWNER_EMAIL || "").trim()),
          active_sessions: activeSessions,
          privileged_accounts: privileged.results || [],
          other_privileged_count: otherPrivileged.length
        }],
        stats:{}
      });
    }

    if (tab === "sessions") {
      const rr = await db.prepare(`
        SELECT s.token_hash,s.user_id,s.expires_at,s.created_at,s.last_seen_at,s.ip_address,s.user_agent,
               p.display_name,p.role
        FROM community_sessions s
        JOIN community_profiles p ON p.id=s.user_id
        WHERE datetime(s.expires_at) > datetime('now')
        ORDER BY datetime(s.last_seen_at) DESC
        LIMIT 300
      `).all();
      const rows = (rr.results || []).map(x => ({
        id:x.token_hash,
        user_id:x.user_id,
        display_name:x.display_name || "Użytkownik",
        role:x.role || "user",
        expires_at:x.expires_at,
        created_at:x.created_at,
        last_seen_at:x.last_seen_at,
        ip_address:x.ip_address || "",
        user_agent:safeUa(x.user_agent),
        current:x.token_hash === s.tokenHash,
        owner:x.user_id === ownerId
      }));
      return json({ok:true,role:"admin",rows,stats:{}});
    }

    if (tab === "comments") {
      const rr = await db.prepare(`
        SELECT c.id,c.post_id,c.author_id,c.content,c.status,c.created_at,c.updated_at,
               p.display_name AS author_name, po.title AS post_title
        FROM community_comments c
        LEFT JOIN community_profiles p ON p.id=c.author_id
        LEFT JOIN community_posts po ON po.id=c.post_id
        ORDER BY datetime(c.created_at) DESC
        LIMIT 300
      `).all();
      return json({ok:true,role:"admin",rows:rr.results || [],stats:{}});
    }

    if (tab === "chat") {
      const rr = await db.prepare(`
        SELECT m.id,m.author_id,m.content,m.status,m.created_at,m.edited_at,m.deleted_at,m.attachments,
               p.display_name AS author_name,p.role AS author_role
        FROM community_chat_messages m
        LEFT JOIN community_profiles p ON p.id=m.author_id
        ORDER BY datetime(m.created_at) DESC
        LIMIT 300
      `).all();
      const rows=(rr.results||[]).map(x=>({
        ...x,
        attachments:parseAttachments(x.attachments),
        content:x.status==='deleted'?'':x.content
      }));
      return json({ok:true,role:"admin",rows,stats:{}});
    }

    if (tab === "export") {
      const exportedAt = isoNow();
      const data = {
        meta:{
          site:"AIO-IPTV.pl",
          exported_at:exportedAt,
          owner_id:ownerId,
          note:"Eksport właściciela nie zawiera haseł, hashy haseł ani tokenów sesji."
        },
        profiles:await exportTable(db,`SELECT id,email,display_name,avatar_url,avatar_key,tuner_model,system_name,system_version,python_version,bio,role,trusted,banned_until,ban_reason,created_at,updated_at FROM community_profiles ORDER BY datetime(created_at) ASC`),
        posts:await exportTable(db,`SELECT * FROM community_posts ORDER BY datetime(created_at) ASC`),
        comments:await exportTable(db,`SELECT * FROM community_comments ORDER BY datetime(created_at) ASC`),
        reports:await exportTable(db,`SELECT * FROM community_reports ORDER BY datetime(created_at) ASC`),
        ip_blocks:await exportTable(db,`SELECT * FROM community_ip_blocks ORDER BY datetime(created_at) ASC`),
        moderation_log:await exportTable(db,`SELECT * FROM community_moderation_log ORDER BY datetime(created_at) ASC`),
        chat_messages:await exportTable(db,`SELECT id,author_id,content,attachments,reply_to,status,created_at,edited_at,deleted_at,deleted_by FROM community_chat_messages ORDER BY datetime(created_at) ASC`)
      };
      return json({ok:true,export:data});
    }

    return json({ok:false,error:"Nieznana sekcja panelu właściciela."},400);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function onRequestPost({request, env}) {
  try {
    await ensureSchema(env);
    const s = await requireAdmin(request, env, true);
    const db = env.COMMUNITY_DB;
    const body = await bodyJson(request);
    const action = String(body.action || "");
    const ownerId = await getOwnerId(env);
    const now = isoNow();

    if (action === "revoke_session") {
      const tokenHash = cleanText(body.id || "", 200);
      if (!tokenHash) return json({ok:false,error:"Brak identyfikatora sesji."},400);
      if (tokenHash === s.tokenHash) return json({ok:false,error:"Nie można zakończyć bieżącej sesji z tego przycisku."},400);
      await db.prepare(`DELETE FROM community_sessions WHERE token_hash=?`).bind(tokenHash).run();
      await moderationLog(env,s.user.id,{targetType:"user",targetId:"session",action:"session_revoked",reason:"Właściciel zakończył sesję.",ip:clientIp(request)});
      return json({ok:true});
    }

    if (action === "revoke_other_sessions") {
      await db.prepare(`DELETE FROM community_sessions WHERE token_hash<>?`).bind(s.tokenHash).run();
      await moderationLog(env,s.user.id,{targetType:"user",targetId:ownerId,action:"all_other_sessions_revoked",reason:"Właściciel zakończył wszystkie pozostałe sesje.",ip:clientIp(request)});
      return json({ok:true});
    }

    if (action === "cleanup_privileged_roles") {
      await db.prepare(`
        UPDATE community_profiles
        SET role='user',updated_at=?
        WHERE id<>? AND role IN ('admin','moderator')
      `).bind(now,ownerId).run();
      await moderationLog(env,s.user.id,{targetType:"user",targetId:ownerId,action:"privileged_roles_cleaned",reason:"Usunięto role admin/moderator ze wszystkich kont poza właścicielem.",ip:clientIp(request)});
      return json({ok:true});
    }

    if (action === "delete_comment") {
      const id=cleanText(body.id||"",120);
      const c=await db.prepare(`SELECT * FROM community_comments WHERE id=?`).bind(id).first();
      if(!c) return json({ok:false,error:"Nie znaleziono komentarza."},404);
      await db.prepare(`DELETE FROM community_comments WHERE id=? OR parent_id=?`).bind(id,id).run();
      await db.prepare(`UPDATE community_posts SET comment_count=(SELECT COUNT(*) FROM community_comments WHERE post_id=? AND status='published') WHERE id=?`).bind(c.post_id,c.post_id).run();
      await moderationLog(env,s.user.id,{targetUserId:c.author_id,targetType:"comment",targetId:id,action:"delete",reason:"Usunięto komentarz z panelu właściciela.",ip:clientIp(request)});
      return json({ok:true});
    }

    if (action === "delete_chat") {
      const id=cleanText(body.id||"",120);
      const msg=await db.prepare(`SELECT * FROM community_chat_messages WHERE id=?`).bind(id).first();
      if(!msg) return json({ok:false,error:"Nie znaleziono wiadomości."},404);
      if(env.COMMUNITY_MEDIA){
        for(const a of parseAttachments(msg.attachments)){
          const key=String(a?.key||a?.path||"");
          if(key) await env.COMMUNITY_MEDIA.delete(key).catch(()=>{});
        }
      }
      await db.batch([
        db.prepare(`DELETE FROM community_chat_reactions WHERE message_id=?`).bind(id),
        db.prepare(`UPDATE community_chat_messages SET content='',attachments='[]',status='deleted',deleted_at=?,deleted_by=? WHERE id=?`).bind(now,s.user.id,id)
      ]);
      await moderationLog(env,s.user.id,{targetUserId:msg.author_id,targetType:"comment",targetId:id,action:"chat_delete",reason:"Usunięto wiadomość czatu z panelu właściciela.",ip:clientIp(request)});
      return json({ok:true});
    }

    return json({ok:false,error:"Nieznana operacja panelu właściciela."},400);
  } catch (e) {
    return errorResponse(e);
  }
}
