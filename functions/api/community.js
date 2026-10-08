
import {
  json, ensureSchema, getSession, requireUser, requireAdmin, isAdmin, isFullAdmin,
  cleanText, allowedCategory, allowedPostType, allowedReaction, allowedTargetType,
  decoratePost, publicProfile, parseAttachments, bodyJson, errorResponse,
  isoNow, clientIp, recordIp, moderationLog, countRows, randomToken
} from "../_community.js";

async function optionalSession(request, env) {
  try { return await getSession(request, env); } catch (_) { return null; }
}
function authorSelect() {
  return `
    p.*,
    pr.display_name AS author_display_name,
    pr.avatar_url AS author_avatar_url,
    pr.avatar_key AS author_avatar_key,
    pr.tuner_model AS author_tuner_model,
    pr.system_name AS author_system_name,
    pr.role AS author_role
  `;
}
async function addReactions(env, rows, userId) {
  if (!rows.length) return rows;
  const ids = rows.map(x=>x.id);
  const ph = ids.map(()=>"?").join(",");
  const rr = await env.COMMUNITY_DB.prepare(`
    SELECT post_id,type,COUNT(*) AS n
    FROM community_reactions
    WHERE post_id IN (${ph})
    GROUP BY post_id,type
  `).bind(...ids).all();
  const mine = userId ? await env.COMMUNITY_DB.prepare(`
    SELECT post_id,type FROM community_reactions
    WHERE user_id=? AND post_id IN (${ph})
  `).bind(userId,...ids).all() : {results:[]};
  const map = {};
  for (const id of ids) map[id] = {helpful:0,works:0,thanks:0,mine:""};
  for (const r of rr.results || []) if (map[r.post_id]) map[r.post_id][r.type] = Number(r.n||0);
  for (const r of mine.results || []) if (map[r.post_id]) map[r.post_id].mine = r.type;
  return rows.map(row => ({...decoratePost(row), reactions:map[row.id]||{helpful:0,works:0,thanks:0,mine:""}}));
}
async function stats(env) {
  const db=env.COMMUNITY_DB;
  const queries = [
    ["users",`SELECT COUNT(*) AS n FROM community_profiles`],
    ["posts",`SELECT COUNT(*) AS n FROM community_posts WHERE status='published'`],
    ["comments",`SELECT COUNT(*) AS n FROM community_comments WHERE status='published'`],
    ["reactions",`SELECT COUNT(*) AS n FROM community_reactions`],
    ["solved",`SELECT COUNT(*) AS n FROM community_posts WHERE status='published' AND kind='community' AND solved=1`],
    ["unanswered",`SELECT COUNT(*) AS n FROM community_posts WHERE status='published' AND kind='community' AND solved=0 AND comment_count=0`],
    ["new_posts_7d",`SELECT COUNT(*) AS n FROM community_posts WHERE status='published' AND datetime(created_at)>=datetime('now','-7 day')`],
    ["new_comments_7d",`SELECT COUNT(*) AS n FROM community_comments WHERE status='published' AND datetime(created_at)>=datetime('now','-7 day')`],
  ];
  const out={};
  for (const [k,q] of queries) out[k]=await countRows(env,q);
  return out;
}
async function fetchPost(env, id) {
  return env.COMMUNITY_DB.prepare(`
    SELECT ${authorSelect()}
    FROM community_posts p
    LEFT JOIN community_profiles pr ON pr.id=p.author_id
    WHERE p.id=? LIMIT 1
  `).bind(id).first();
}
function canSeePost(row, session) {
  if (!row) return false;
  if (row.status === "published") return row.kind === "official" || Boolean(session?.user);
  return Boolean(session?.user && (session.user.id === row.author_id || isAdmin(session)));
}
async function insertNotification(env, userId, actorId, type, postId, commentId, message) {
  if (!userId || userId === actorId) return;
  await env.COMMUNITY_DB.prepare(`
    INSERT INTO community_notifications(id,user_id,actor_id,type,post_id,comment_id,message,created_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(crypto.randomUUID(),userId,actorId,type,postId||null,commentId||null,cleanText(message,300),isoNow()).run();
}
async function deletePostMedia(env,row) {
  for (const a of parseAttachments(row?.attachments)) {
    const key = String(a?.key || a?.path || "");
    if (key) await env.COMMUNITY_MEDIA.delete(key).catch(()=>{});
  }
}

async function decorateChatRows(env, rows, userId) {
  if (!rows.length) return [];
  const ids=rows.map(x=>x.id);
  const ph=ids.map(()=>"?").join(",");
  const reactionRows=await env.COMMUNITY_DB.prepare(`
    SELECT message_id,type,COUNT(*) AS n FROM community_chat_reactions
    WHERE message_id IN (${ph}) GROUP BY message_id,type
  `).bind(...ids).all();
  const myRows=userId ? await env.COMMUNITY_DB.prepare(`
    SELECT message_id,type FROM community_chat_reactions
    WHERE user_id=? AND message_id IN (${ph})
  `).bind(userId,...ids).all() : {results:[]};
  const reactions={};
  for(const id of ids) reactions[id]={"👍":0,"❤️":0,"😂":0,"💡":0,mine:[]};
  for(const r of reactionRows.results||[]) if(reactions[r.message_id]) reactions[r.message_id][r.type]=Number(r.n||0);
  for(const r of myRows.results||[]) if(reactions[r.message_id]) reactions[r.message_id].mine.push(r.type);
  return rows.map(row=>({
    id:row.id,content:row.status==="deleted"?"":row.content,status:row.status,created_at:row.created_at,
    attachments:row.status==="deleted"?[]:parseAttachments(row.attachments).map(a=>({
      key:String(a?.key||a?.path||""),name:cleanText(a?.name||"Zdjęcie",180),type:cleanText(a?.type||"image/jpeg",80),size:Number(a?.size||0),
      url:`/api/community-media?key=${encodeURIComponent(String(a?.key||a?.path||""))}`
    })).filter(a=>a.key),
    author:{id:row.author_id,display_name:row.author_display_name||"Użytkownik",avatar_url:row.author_avatar_key?`/api/community-media?key=${encodeURIComponent(row.author_avatar_key)}`:(row.author_avatar_url||""),role:row.author_role||"user"},
    reply_preview:row.reply_id?{id:row.reply_id,content:cleanText(row.reply_content||"",180),status:row.reply_status||"published",author_name:row.reply_author_name||"Użytkownik"}:null,
    reactions:reactions[row.id]||{"👍":0,"❤️":0,"😂":0,"💡":0,mine:[]}
  }));
}

async function deleteChatMedia(env,row){
  for(const a of parseAttachments(row?.attachments)){
    const key=String(a?.key||a?.path||"");
    if(key) await env.COMMUNITY_MEDIA.delete(key).catch(()=>{});
  }
}

export async function onRequestGet({request, env}) {
  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "health";
    const session = await optionalSession(request, env);
    if (session?.blocked || session?.banned) {
      return json({ok:false,error:"Dostęp do społeczności jest zablokowany."},403);
    }
    const user = session?.user || null;
    const db = env.COMMUNITY_DB;

    if (action === "health") {
      const tables = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'community_%' ORDER BY name`).all();
      return json({ok:true,backend:"cloudflare",authenticated:Boolean(user),tables:(tables.results||[]).map(x=>x.name)});
    }

    if (action === "stats") return json({ok:true,stats:await stats(env)});

    if (action === "latest") {
      const row = await db.prepare(`
        SELECT p.id,p.kind,p.post_type,p.category,p.title,p.content,p.attachments,p.created_at,p.published_at
        FROM community_posts p
        WHERE p.status='published'
        ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 1
      `).first();
      if (!row) return json({ok:true,post:null});
      const post = decoratePost(row);
      // Dla wpisu społecznościowego nie publikujemy zdjęć anonimowo.
      if (!user && post.kind !== "official") post.attachments = [];
      return json({ok:true,post});
    }

    if (action === "feed") {
      const mode = url.searchParams.get("mode") || "latest";
      const category = url.searchParams.get("category") || "";
      const search = cleanText(url.searchParams.get("search") || "",80);
      const page = Math.max(0,Number(url.searchParams.get("page")||0));
      const pageSize = Math.min(30,Math.max(1,Number(url.searchParams.get("pageSize")||12)));
      const params=[];
      const where=[];
      if (!user) {
        where.push(`p.status='published' AND p.kind='official'`);
      } else if (mode === "official") {
        where.push(`p.status='published' AND p.kind='official'`);
      } else if (mode === "mine") {
        where.push(`p.author_id=?`); params.push(user.id);
      } else {
        where.push(`p.status='published'`);
        if (mode === "questions") where.push(`p.post_type='problem'`);
        if (mode === "unanswered") where.push(`p.post_type='problem' AND p.kind='community' AND p.solved=0 AND p.comment_count=0`);
        if (mode === "solved") where.push(`p.post_type='problem' AND p.kind='community' AND p.solved=1`);
      }
      if (category) { where.push(`p.category=?`); params.push(allowedCategory(category)); }
      if (search) { where.push(`(p.title LIKE ? OR p.content LIKE ?)`); params.push(`%${search}%`,`%${search}%`); }
      let order=`p.pinned DESC, p.created_at DESC`;
      if (mode==="popular") order=`p.pinned DESC,p.reaction_count DESC,p.comment_count DESC,p.created_at DESC`;
      const sql=`
        SELECT ${authorSelect()}
        FROM community_posts p LEFT JOIN community_profiles pr ON pr.id=p.author_id
        WHERE ${where.length?where.join(" AND "):"1=1"}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `;
      params.push(pageSize,page*pageSize);
      const res=await db.prepare(sql).bind(...params).all();
      const rows=await addReactions(env,res.results||[],user?.id);
      return json({ok:true,rows,hasMore:rows.length===pageSize,page,pageSize});
    }

    if (action === "post") {
      const id = cleanText(url.searchParams.get("id")||"",100);
      const row = await fetchPost(env,id);
      if (!canSeePost(row,session)) return json({ok:false,error:user?"Nie znaleziono wpisu.":"Zaloguj się, aby przeczytać ten wpis."},user?404:401);
      const posts=await addReactions(env,[row],user?.id);
      const post=posts[0];
      let comments=[];
      let following=false;
      if (user) {
        const cr=await db.prepare(`
          SELECT c.*, pr.display_name AS author_display_name,pr.avatar_key AS author_avatar_key,
                 pr.avatar_url AS author_avatar_url,pr.role AS author_role
          FROM community_comments c LEFT JOIN community_profiles pr ON pr.id=c.author_id
          WHERE c.post_id=? AND (c.status='published' OR c.author_id=?)
          ORDER BY c.created_at ASC
        `).bind(id,user.id).all();
        comments=(cr.results||[]).map(c=>({
          ...c,
          author:{
            id:c.author_id,
            display_name:c.author_display_name||"Użytkownik",
            avatar_url:c.author_avatar_key?`/api/community-media?key=${encodeURIComponent(c.author_avatar_key)}`:(c.author_avatar_url||""),
            role:c.author_role||"user"
          }
        }));
        following=Boolean(await db.prepare(`SELECT 1 AS x FROM community_subscriptions WHERE post_id=? AND user_id=?`).bind(id,user.id).first());
      }
      post.following=following;
      return json({ok:true,post,comments});
    }

    if (action === "chat") {
      const s=await requireUser(request,env);
      const limit=Math.min(100,Math.max(20,Number(url.searchParams.get("limit")||80)));
      const rr=await db.prepare(`
        SELECT m.*,p.display_name AS author_display_name,p.avatar_url AS author_avatar_url,p.avatar_key AS author_avatar_key,p.role AS author_role,
               r.id AS reply_id,r.content AS reply_content,r.status AS reply_status,rp.display_name AS reply_author_name
        FROM community_chat_messages m
        LEFT JOIN community_profiles p ON p.id=m.author_id
        LEFT JOIN community_chat_messages r ON r.id=m.reply_to
        LEFT JOIN community_profiles rp ON rp.id=r.author_id
        ORDER BY m.created_at DESC LIMIT ?
      `).bind(limit).all();
      const ordered=(rr.results||[]).reverse();
      return json({ok:true,rows:await decorateChatRows(env,ordered,s.user.id)});
    }

    if (action === "profile") {
      const s=await requireUser(request,env);
      const id=cleanText(url.searchParams.get("id")||s.user.id,100);
      const row=await db.prepare(`SELECT * FROM community_profiles WHERE id=? LIMIT 1`).bind(id).first();
      if(!row) return json({ok:false,error:"Nie znaleziono profilu."},404);
      const pr=publicProfile(row);
      const rr=await db.prepare(`
        SELECT id,kind,post_type,category,title,status,solved,comment_count,reaction_count,created_at,published_at
        FROM community_posts
        WHERE author_id=? AND (status='published' OR ?=1)
        ORDER BY created_at DESC LIMIT 40
      `).bind(id,(s.user.id===id||isAdmin(s))?1:0).all();
      return json({ok:true,profile:pr,posts:rr.results||[],own:s.user.id===id});
    }

    if (action === "notifications") {
      const s=await requireUser(request,env);
      const rr=await db.prepare(`
        SELECT n.*,p.title AS post_title,pr.display_name AS actor_name
        FROM community_notifications n
        LEFT JOIN community_posts p ON p.id=n.post_id
        LEFT JOIN community_profiles pr ON pr.id=n.actor_id
        WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 30
      `).bind(s.user.id).all();
      return json({ok:true,rows:rr.results||[]});
    }

    if (action === "admin") {
      const s=await requireAdmin(request,env);
      const tab=url.searchParams.get("tab")||"pending";
      let rows=[];
      if(tab==="pending"||tab==="published"){
        const status=tab==="pending"?"pending":"published";
        const rr=await db.prepare(`
          SELECT ${authorSelect()}
          FROM community_posts p LEFT JOIN community_profiles pr ON pr.id=p.author_id
          WHERE p.status=? ORDER BY p.created_at DESC LIMIT 100
        `).bind(status).all();
        rows=(rr.results||[]).map(decoratePost);
      } else if(tab==="reports"){
        const rr=await db.prepare(`
          SELECT r.*,p.display_name AS reporter_name
          FROM community_reports r LEFT JOIN community_profiles p ON p.id=r.reporter_id
          WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 100
        `).all();
        rows=(rr.results||[]).map(r=>({...r,reporter:{id:r.reporter_id,display_name:r.reporter_name||"Użytkownik"}}));
      } else if(tab==="users"){
        const rr=await db.prepare(`SELECT * FROM community_profiles ORDER BY created_at DESC LIMIT 200`).all();
        rows=[];
        for(const u of rr.results||[]){
          const ips=await db.prepare(`SELECT ip_address,last_seen_at,event_count,last_event FROM community_user_ips WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 5`).bind(u.id).all();
          rows.push({...publicProfile(u),ips:ips.results||[]});
        }
      } else if(tab==="ip"){
        const rr=await db.prepare(`
          SELECT b.*,p.display_name AS target_name
          FROM community_ip_blocks b LEFT JOIN community_profiles p ON p.id=b.target_user_id
          ORDER BY b.created_at DESC LIMIT 200
        `).all();
        rows=(rr.results||[]).map(b=>({...b,permanent:Boolean(b.permanent),active:Boolean(b.active),target:b.target_name?{display_name:b.target_name}:null}));
      } else if(tab==="logs"){
        const rr=await db.prepare(`
          SELECT l.*,p.display_name AS actor_name
          FROM community_moderation_log l LEFT JOIN community_profiles p ON p.id=l.actor_id
          ORDER BY l.created_at DESC LIMIT 200
        `).all();
        rows=rr.results||[];
      } else if(tab==="password-resets"){
        if(!isFullAdmin(s)) return json({ok:false,error:"Tylko administrator może obsługiwać reset haseł."},403);
        const rr=await db.prepare(`
          SELECT r.id,r.user_id,r.email_snapshot,r.status,r.expires_at,r.created_at,r.approved_at,
                 p.display_name
          FROM community_password_reset_requests r
          LEFT JOIN community_profiles p ON p.id=r.user_id
          WHERE r.status IN ('pending','approved')
          ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
          LIMIT 200
        `).all();
        rows=(rr.results||[]).map(r=>({...r,display_name:r.display_name||"Użytkownik"}));
      }
      const st={
        pending:await countRows(env,`SELECT COUNT(*) AS n FROM community_posts WHERE status='pending'`),
        reports:await countRows(env,`SELECT COUNT(*) AS n FROM community_reports WHERE status='open'`),
        users:await countRows(env,`SELECT COUNT(*) AS n FROM community_profiles`),
        password_resets:isFullAdmin(s)
          ? await countRows(env,`SELECT COUNT(*) AS n FROM community_password_reset_requests WHERE status='pending'`)
          : 0
      };
      return json({ok:true,rows,stats:st,role:s.user.role});
    }

    return json({ok:false,error:"Nieznana operacja API."},400);
  } catch(e){ return errorResponse(e); }
}

export async function onRequestPost({request,env}) {
  try {
    await ensureSchema(env);
    const body=await bodyJson(request);
    const action=String(body.action||"");
    const db=env.COMMUNITY_DB;

    if(action==="chat_send"){
      const s=await requireUser(request,env);
      const content=cleanText(body.content||"",2000);
      const attachments=Array.isArray(body.attachments)?body.attachments.slice(0,2):[];
      const replyTo=cleanText(body.replyTo||"",120)||null;
      if(!content&&!attachments.length) return json({ok:false,error:"Napisz wiadomość lub dodaj zdjęcie."},400);
      for(const a of attachments){const key=String(a?.key||"");if(!key.startsWith(`${s.user.id}/chat/`)) return json({ok:false,error:"Nieprawidłowy załącznik czatu."},400);}
      if(replyTo){const parent=await db.prepare(`SELECT id FROM community_chat_messages WHERE id=? LIMIT 1`).bind(replyTo).first();if(!parent) return json({ok:false,error:"Wiadomość, na którą odpowiadasz, już nie istnieje."},400);}
      const last=await db.prepare(`SELECT created_at FROM community_chat_messages WHERE author_id=? ORDER BY created_at DESC LIMIT 1`).bind(s.user.id).first();
      if(last?.created_at && Date.now()-Date.parse(last.created_at)<3000) return json({ok:false,error:"Odczekaj chwilę przed wysłaniem kolejnej wiadomości."},429);
      const id=crypto.randomUUID();
      await db.prepare(`INSERT INTO community_chat_messages (id,author_id,content,attachments,reply_to,status,created_at) VALUES(?,?,?,?,?,'published',?)`).bind(id,s.user.id,content,JSON.stringify(attachments),replyTo,isoNow()).run();
      await recordIp(env,s.user.id,clientIp(request),"chat");
      return json({ok:true,id},201);
    }

    if(action==="chat_reaction"){
      const s=await requireUser(request,env),id=cleanText(body.id||"",120),type=String(body.type||"");
      if(!["👍","❤️","😂","💡"].includes(type)) return json({ok:false,error:"Nieprawidłowa reakcja."},400);
      const msg=await db.prepare(`SELECT id,status FROM community_chat_messages WHERE id=? LIMIT 1`).bind(id).first();
      if(!msg||msg.status!=="published") return json({ok:false,error:"Nie znaleziono wiadomości."},404);
      const current=await db.prepare(`SELECT 1 AS x FROM community_chat_reactions WHERE message_id=? AND user_id=? AND type=?`).bind(id,s.user.id,type).first();
      if(current) await db.prepare(`DELETE FROM community_chat_reactions WHERE message_id=? AND user_id=? AND type=?`).bind(id,s.user.id,type).run();
      else await db.prepare(`INSERT INTO community_chat_reactions(message_id,user_id,type,created_at) VALUES(?,?,?,?)`).bind(id,s.user.id,type,isoNow()).run();
      return json({ok:true,active:!current});
    }

    if(action==="chat_delete"){
      const s=await requireUser(request,env),id=cleanText(body.id||"",120);
      const msg=await db.prepare(`SELECT * FROM community_chat_messages WHERE id=? LIMIT 1`).bind(id).first();
      if(!msg) return json({ok:false,error:"Nie znaleziono wiadomości."},404);
      if(msg.author_id!==s.user.id&&!isAdmin(s)) return json({ok:false,error:"Brak uprawnień."},403);
      await deleteChatMedia(env,msg);
      await db.batch([
        db.prepare(`DELETE FROM community_chat_reactions WHERE message_id=?`).bind(id),
        db.prepare(`UPDATE community_chat_messages SET content='',attachments='[]',status='deleted',deleted_at=?,deleted_by=? WHERE id=?`).bind(isoNow(),s.user.id,id)
      ]);
      return json({ok:true});
    }

    if(action==="create_post"){
      const s=await requireUser(request,env);
      const title=cleanText(body.title,140), content=cleanText(body.content,50000);
      if(title.length<6||content.length<20) return json({ok:false,error:"Tytuł lub treść są za krótkie."},400);
      const attachments=Array.isArray(body.attachments)?body.attachments.slice(0,4):[];
      for(const a of attachments){
        const key=String(a?.key||"");
        if(!key.startsWith(`${s.user.id}/`)) return json({ok:false,error:"Nieprawidłowy załącznik."},400);
      }
      const id=crypto.randomUUID();
      const official=Boolean(body.official)&&isAdmin(s);
      const status=(isAdmin(s)||s.user.trusted)?"published":"pending";
      const now=isoNow();
      await db.prepare(`
        INSERT INTO community_posts
        (id,author_id,kind,post_type,category,title,content,status,pinned,featured,locked,attachments,solved,comment_count,reaction_count,created_at,updated_at,published_at)
        VALUES(?,?,?,?,?,?,?,?,0,0,0,?,0,0,0,?,?,?)
      `).bind(id,s.user.id,official?"official":"community",allowedPostType(body.postType),allowedCategory(body.category),
        title,content,status,JSON.stringify(attachments),now,now,status==="published"?now:null).run();
      await recordIp(env,s.user.id,clientIp(request),"post");
      return json({ok:true,id,status});
    }

    if(action==="create_comment"){
      const s=await requireUser(request,env);
      const postId=cleanText(body.postId,100), content=cleanText(body.content,10000), parentId=cleanText(body.parentId||"",100)||null;
      if(content.length<2) return json({ok:false,error:"Komentarz jest za krótki."},400);
      const post=await fetchPost(env,postId);
      if(!post||post.status!=="published") return json({ok:false,error:"Nie znaleziono wpisu."},404);
      if(post.locked&&!isAdmin(s)) return json({ok:false,error:"Komentarze do tego wpisu są zablokowane."},403);
      if(parentId){
        const p=await db.prepare(`SELECT post_id FROM community_comments WHERE id=?`).bind(parentId).first();
        if(!p||p.post_id!==postId) return json({ok:false,error:"Nieprawidłowa odpowiedź."},400);
      }
      const id=crypto.randomUUID(),now=isoNow();
      await db.batch([
        db.prepare(`INSERT INTO community_comments(id,post_id,author_id,parent_id,content,status,created_at,updated_at) VALUES(?,?,?,?,?,'published',?,?)`)
          .bind(id,postId,s.user.id,parentId,content,now,now),
        db.prepare(`UPDATE community_posts SET comment_count=(SELECT COUNT(*) FROM community_comments WHERE post_id=? AND status='published'),updated_at=? WHERE id=?`)
          .bind(postId,now,postId)
      ]);
      await insertNotification(env,post.author_id,s.user.id,"comment",postId,id,`${s.user.display_name} odpowiedział w: ${post.title}`);
      const subs=await db.prepare(`SELECT user_id FROM community_subscriptions WHERE post_id=? AND user_id<>?`).bind(postId,s.user.id).all();
      for(const x of subs.results||[]) if(x.user_id!==post.author_id) await insertNotification(env,x.user_id,s.user.id,"comment",postId,id,`${s.user.display_name} dodał odpowiedź w obserwowanym wpisie.`);
      await recordIp(env,s.user.id,clientIp(request),"comment");
      return json({ok:true,id});
    }

    if(action==="reaction"){
      const s=await requireUser(request,env);
      const postId=cleanText(body.postId,100),type=allowedReaction(body.type);
      if(!type) return json({ok:false,error:"Nieprawidłowa reakcja."},400);
      const current=await db.prepare(`SELECT type FROM community_reactions WHERE post_id=? AND user_id=?`).bind(postId,s.user.id).first();
      if(current?.type===type){
        await db.prepare(`DELETE FROM community_reactions WHERE post_id=? AND user_id=?`).bind(postId,s.user.id).run();
      }else{
        await db.prepare(`
          INSERT INTO community_reactions(post_id,user_id,type,created_at) VALUES(?,?,?,?)
          ON CONFLICT(post_id,user_id) DO UPDATE SET type=excluded.type,created_at=excluded.created_at
        `).bind(postId,s.user.id,type,isoNow()).run();
      }
      await db.prepare(`UPDATE community_posts SET reaction_count=(SELECT COUNT(*) FROM community_reactions WHERE post_id=?) WHERE id=?`).bind(postId,postId).run();
      await recordIp(env,s.user.id,clientIp(request),"reaction");
      return json({ok:true});
    }

    if(action==="subscribe"){
      const s=await requireUser(request,env);
      const postId=cleanText(body.postId,100);
      const cur=await db.prepare(`SELECT 1 AS x FROM community_subscriptions WHERE post_id=? AND user_id=?`).bind(postId,s.user.id).first();
      if(cur) await db.prepare(`DELETE FROM community_subscriptions WHERE post_id=? AND user_id=?`).bind(postId,s.user.id).run();
      else await db.prepare(`INSERT INTO community_subscriptions(post_id,user_id,created_at) VALUES(?,?,?)`).bind(postId,s.user.id,isoNow()).run();
      return json({ok:true,following:!cur});
    }

    if(action==="report"){
      const s=await requireUser(request,env);
      const targetType=allowedTargetType(body.targetType),targetId=cleanText(body.targetId,120),reason=cleanText(body.reason,120),details=cleanText(body.details||"",1200);
      if(!targetType||!targetId||reason.length<3) return json({ok:false,error:"Uzupełnij zgłoszenie."},400);
      await db.prepare(`
        INSERT INTO community_reports(id,reporter_id,target_type,target_id,reason,details,status,created_at)
        VALUES(?,?,?,?,?,?,'open',?)
      `).bind(crypto.randomUUID(),s.user.id,targetType,targetId,reason,details||null,isoNow()).run();
      await recordIp(env,s.user.id,clientIp(request),"report");
      return json({ok:true});
    }

    if(action==="update_profile"){
      const s=await requireUser(request,env);
      const display=cleanText(body.display_name,60);
      if(display.length<2) return json({ok:false,error:"Nazwa użytkownika jest za krótka."},400);
      const avatarKey=cleanText(body.avatar_key||s.user.avatar_key||"",500);
      if(avatarKey&&!avatarKey.startsWith(`${s.user.id}/`)) return json({ok:false,error:"Nieprawidłowy avatar."},400);
      await db.prepare(`
        UPDATE community_profiles SET display_name=?,tuner_model=?,system_name=?,system_version=?,python_version=?,bio=?,avatar_key=?,updated_at=?
        WHERE id=?
      `).bind(display,cleanText(body.tuner_model,80),cleanText(body.system_name,50),cleanText(body.system_version,30),
        cleanText(body.python_version,20),cleanText(body.bio,600),avatarKey||null,isoNow(),s.user.id).run();
      return json({ok:true});
    }

    if(action==="delete_post"){
      const s=await requireUser(request,env);
      const id=cleanText(body.id,100),row=await fetchPost(env,id);
      if(!row) return json({ok:false,error:"Nie znaleziono wpisu."},404);
      if(row.author_id!==s.user.id&&!isAdmin(s)) return json({ok:false,error:"Brak uprawnień."},403);
      await deletePostMedia(env,row);
      await db.batch([
        db.prepare(`DELETE FROM community_notifications WHERE post_id=?`).bind(id),
        db.prepare(`DELETE FROM community_subscriptions WHERE post_id=?`).bind(id),
        db.prepare(`DELETE FROM community_reactions WHERE post_id=?`).bind(id),
        db.prepare(`DELETE FROM community_comments WHERE post_id=?`).bind(id),
        db.prepare(`DELETE FROM community_posts WHERE id=?`).bind(id)
      ]);
      return json({ok:true});
    }

    if(action==="delete_comment"){
      const s=await requireUser(request,env);
      const id=cleanText(body.id,100);
      const c=await db.prepare(`SELECT * FROM community_comments WHERE id=?`).bind(id).first();
      if(!c) return json({ok:false,error:"Nie znaleziono komentarza."},404);
      if(c.author_id!==s.user.id&&!isAdmin(s)) return json({ok:false,error:"Brak uprawnień."},403);
      await db.prepare(`DELETE FROM community_comments WHERE id=? OR parent_id=?`).bind(id,id).run();
      await db.prepare(`UPDATE community_posts SET comment_count=(SELECT COUNT(*) FROM community_comments WHERE post_id=? AND status='published') WHERE id=?`).bind(c.post_id,c.post_id).run();
      return json({ok:true});
    }

    if(action==="toggle_solved"){
      const s=await requireUser(request,env);
      const id=cleanText(body.id,100),row=await fetchPost(env,id);
      if(!row) return json({ok:false,error:"Nie znaleziono wpisu."},404);
      if(row.author_id!==s.user.id&&!isAdmin(s)) return json({ok:false,error:"Brak uprawnień."},403);
      const solved=row.solved?0:1;
      await db.prepare(`UPDATE community_posts SET solved=?,solved_at=?,solved_by=?,best_comment_id=CASE WHEN ?=0 THEN NULL ELSE best_comment_id END,updated_at=? WHERE id=?`)
        .bind(solved,solved?isoNow():null,solved?s.user.id:null,solved,isoNow(),id).run();
      return json({ok:true,solved:Boolean(solved)});
    }

    if(action==="best_answer"){
      const s=await requireUser(request,env);
      const postId=cleanText(body.postId,100),commentId=cleanText(body.commentId,100),row=await fetchPost(env,postId);
      if(!row) return json({ok:false,error:"Nie znaleziono wpisu."},404);
      if(row.author_id!==s.user.id&&!isAdmin(s)) return json({ok:false,error:"Brak uprawnień."},403);
      const c=await db.prepare(`SELECT id FROM community_comments WHERE id=? AND post_id=?`).bind(commentId,postId).first();
      if(!c) return json({ok:false,error:"Nie znaleziono komentarza."},404);
      await db.prepare(`UPDATE community_posts SET solved=1,best_comment_id=?,solved_at=?,solved_by=?,updated_at=? WHERE id=?`)
        .bind(commentId,isoNow(),s.user.id,isoNow(),postId).run();
      return json({ok:true});
    }

    if(action==="mark_notifications"){
      const s=await requireUser(request,env);
      await db.prepare(`UPDATE community_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`).bind(isoNow(),s.user.id).run();
      return json({ok:true});
    }

    if(action==="admin_action"){
      const s=await requireAdmin(request,env);
      const target=String(body.target||""),op=String(body.op||""),id=cleanText(body.id,120),reason=cleanText(body.reason||"",500),now=isoNow();
      if(target==="post"){
        const row=await fetchPost(env,id); if(!row) return json({ok:false,error:"Nie znaleziono wpisu."},404);
        if(op==="approve") await db.prepare(`UPDATE community_posts SET status='published',published_at=COALESCE(published_at,?),updated_at=? WHERE id=?`).bind(now,now,id).run();
        else if(op==="reject") await db.prepare(`UPDATE community_posts SET status='rejected',updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="hide") await db.prepare(`UPDATE community_posts SET status='hidden',updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="pin") await db.prepare(`UPDATE community_posts SET pinned=CASE pinned WHEN 1 THEN 0 ELSE 1 END,updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="lock") await db.prepare(`UPDATE community_posts SET locked=CASE locked WHEN 1 THEN 0 ELSE 1 END,updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="official") await db.prepare(`UPDATE community_posts SET kind=CASE kind WHEN 'official' THEN 'community' ELSE 'official' END,updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="edit"){
          const title=cleanText(body.title,140),content=cleanText(body.content,50000);
          if(title.length<6||content.length<20||reason.length<3) return json({ok:false,error:"Uzupełnij tytuł, treść i powód edycji."},400);
          await db.prepare(`UPDATE community_posts SET title=?,content=?,category=?,post_type=?,kind=?,edited_at=?,edited_by=?,edit_reason=?,updated_at=? WHERE id=?`)
            .bind(title,content,allowedCategory(body.category),allowedPostType(body.postType),body.official?"official":"community",now,s.user.id,reason,now,id).run();
        } else return json({ok:false,error:"Nieznana akcja wpisu."},400);
        await moderationLog(env,s.user.id,{targetUserId:row.author_id,targetType:"post",targetId:id,action:op,reason,ip:clientIp(request)});
        return json({ok:true});
      }
      if(target==="report"){
        if(!["resolved","dismissed"].includes(op)) return json({ok:false,error:"Nieprawidłowy status zgłoszenia."},400);
        await db.prepare(`UPDATE community_reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?`).bind(op,s.user.id,now,id).run();
        await moderationLog(env,s.user.id,{targetType:"report",targetId:id,action:op,reason,ip:clientIp(request)});
        return json({ok:true});
      }
      if(target==="password_reset"){
        if(!isFullAdmin(s)) return json({ok:false,error:"Tylko administrator może obsługiwać reset haseł."},403);

        const req=await db.prepare(
          `SELECT * FROM community_password_reset_requests WHERE id=? LIMIT 1`
        ).bind(id).first();
        if(!req) return json({ok:false,error:"Nie znaleziono prośby o reset hasła."},404);

        if(op==="approve"){
          if(req.status!=="pending" && req.status!=="approved"){
            return json({ok:false,error:"Ta prośba nie jest już aktywna."},400);
          }

          const code=randomToken(9);
          const raw=new TextEncoder().encode(code);
          const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
          let packed="";
          for(const b of digest) packed+=String.fromCharCode(b);
          const codeHash=btoa(packed).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
          const expires=new Date(Date.now()+24*60*60*1000).toISOString();

          await db.prepare(`
            UPDATE community_password_reset_requests
            SET status='approved',code_hash=?,expires_at=?,approved_at=?,approved_by=?,
                used_at=NULL,cancelled_at=NULL
            WHERE id=?
          `).bind(codeHash,expires,now,s.user.id,id).run();

          await moderationLog(env,s.user.id,{
            targetUserId:req.user_id,
            targetType:"user",
            targetId:req.user_id,
            action:"password_reset_approved",
            reason:"Wygenerowano jednorazowy kod resetu hasła.",
            ip:clientIp(request)
          });

          return json({ok:true,resetCode:code,expiresAt:expires});
        }

        if(op==="cancel"){
          await db.prepare(`
            UPDATE community_password_reset_requests
            SET status='cancelled',cancelled_at=?,code_hash=NULL,expires_at=NULL
            WHERE id=?
          `).bind(now,id).run();

          await moderationLog(env,s.user.id,{
            targetUserId:req.user_id,
            targetType:"user",
            targetId:req.user_id,
            action:"password_reset_cancelled",
            reason:"Anulowano prośbę o reset hasła.",
            ip:clientIp(request)
          });

          return json({ok:true});
        }

        return json({ok:false,error:"Nieznana akcja resetu hasła."},400);
      }

      if(target==="user"){
        const u=await db.prepare(`SELECT * FROM community_profiles WHERE id=?`).bind(id).first();
        if(!u) return json({ok:false,error:"Nie znaleziono użytkownika."},404);
        if(id===s.user.id) return json({ok:false,error:"Nie możesz wykonać tej operacji na własnym koncie."},400);
        if(op==="trust") await db.prepare(`UPDATE community_profiles SET trusted=CASE trusted WHEN 1 THEN 0 ELSE 1 END,updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="unban") await db.prepare(`UPDATE community_profiles SET banned_until=NULL,ban_reason=NULL,banned_by=NULL,banned_at=NULL,updated_at=? WHERE id=?`).bind(now,id).run();
        else if(op==="ban"){
          let until=null; const duration=String(body.duration||"7d");
          if(duration==="24h") until=new Date(Date.now()+86400000).toISOString();
          else if(duration==="30d") until=new Date(Date.now()+30*86400000).toISOString();
          else if(duration==="permanent"&&isFullAdmin(s)) until="9999-12-31T23:59:59.000Z";
          else until=new Date(Date.now()+7*86400000).toISOString();
          await db.prepare(`UPDATE community_profiles SET banned_until=?,ban_reason=?,banned_by=?,banned_at=?,updated_at=? WHERE id=?`)
            .bind(until,reason||"Naruszenie zasad społeczności",s.user.id,now,now,id).run();
          await db.prepare(`DELETE FROM community_sessions WHERE user_id=?`).bind(id).run();
        } else if(op==="moderator"){
          if(!isFullAdmin(s)) return json({ok:false,error:"Tylko administrator może nadawać rolę moderatora."},403);
          await db.prepare(`UPDATE community_profiles SET role=CASE role WHEN 'moderator' THEN 'user' ELSE 'moderator' END,updated_at=? WHERE id=? AND role<>'admin'`).bind(now,id).run();
        } else if(op==="hide_content"){
          await db.prepare(`UPDATE community_posts SET status='hidden',updated_at=? WHERE author_id=?`).bind(now,id).run();
          await db.prepare(`UPDATE community_comments SET status='hidden',updated_at=? WHERE author_id=?`).bind(now,id).run();
        } else if(op==="delete"){
          if(!isFullAdmin(s)) return json({ok:false,error:"Tylko administrator może usunąć konto."},403);
          const posts=await db.prepare(`SELECT * FROM community_posts WHERE author_id=?`).bind(id).all();
          for(const p of posts.results||[]) await deletePostMedia(env,p);
          await db.batch([
            db.prepare(`DELETE FROM community_sessions WHERE user_id=?`).bind(id),
            db.prepare(`DELETE FROM community_auth WHERE user_id=?`).bind(id),
            db.prepare(`DELETE FROM community_comments WHERE author_id=?`).bind(id),
            db.prepare(`DELETE FROM community_reactions WHERE user_id=?`).bind(id),
            db.prepare(`DELETE FROM community_subscriptions WHERE user_id=?`).bind(id),
            db.prepare(`DELETE FROM community_posts WHERE author_id=?`).bind(id),
            db.prepare(`DELETE FROM community_profiles WHERE id=?`).bind(id)
          ]);
        } else return json({ok:false,error:"Nieznana akcja użytkownika."},400);
        await moderationLog(env,s.user.id,{targetUserId:id,targetType:"user",targetId:id,action:op,reason,ip:clientIp(request)});
        return json({ok:true});
      }
      if(target==="ip"){
        if(op==="unblock"){
          await db.prepare(`UPDATE community_ip_blocks SET active=0,updated_at=? WHERE id=?`).bind(now,id).run();
          await moderationLog(env,s.user.id,{targetType:"ip",targetId:id,action:"unblock",reason,ip:clientIp(request)});
          return json({ok:true});
        }
        if(op==="block"){
          const address=cleanText(body.ip,100);
          if(!address) return json({ok:false,error:"Brak adresu IP."},400);
          const duration=String(body.duration||"7d");
          const permanent=duration==="permanent"&&isFullAdmin(s);
          let expires=permanent?null:new Date(Date.now()+(duration==="24h"?1:duration==="30d"?30:7)*86400000).toISOString();
          await db.prepare(`
            INSERT INTO community_ip_blocks(id,ip_address,reason,permanent,expires_at,active,target_user_id,created_by,created_at,updated_at)
            VALUES(?,?,?,?,?,1,?,?,?,?)
            ON CONFLICT(ip_address) DO UPDATE SET reason=excluded.reason,permanent=excluded.permanent,expires_at=excluded.expires_at,
              active=1,target_user_id=excluded.target_user_id,created_by=excluded.created_by,updated_at=excluded.updated_at
          `).bind(crypto.randomUUID(),address,reason||"Naruszenie zasad społeczności",permanent?1:0,expires,body.userId||null,s.user.id,now,now).run();
          await moderationLog(env,s.user.id,{targetUserId:body.userId||null,targetType:"ip",targetId:address,action:"block",reason,ip:clientIp(request)});
          return json({ok:true});
        }
      }
      return json({ok:false,error:"Nieznana operacja administracyjna."},400);
    }

    return json({ok:false,error:"Nieznana operacja API."},400);
  } catch(e){ return errorResponse(e); }
}
