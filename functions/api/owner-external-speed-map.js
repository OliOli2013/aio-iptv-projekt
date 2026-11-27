import {requireAdmin,getOwnerId,json} from '../_community.js';
import {normalizePostLink,classifyPostLink,linksInPost} from '../_aio_post_links_v5.js';
import {isOfficialAioPanelIpkUrl} from '../_aio_panel_public_v1.js';
import {r2KeyFromPath,privateStorageEnabled} from '../_aio_private_files.js';
import {sourceHash,validMapPath,directSource,externalPolicy} from '../_aio_external_speed_v1.js';
const out=(o,s=200)=>json(o,s,{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
async function owner(req,env){const s=await requireAdmin(req,env,true);if(s.user.id!==await getOwnerId(env)||s.user.role!=='admin')throw Object.assign(Error('Tylko właściciel'),{status:403});return s.user.id;}
export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return out({ok:false,error:'Niedozwolone źródło żądania.'},403);
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))return out({ok:false,error:'Wymagany JSON.'},415);
 try{
  const id=await owner(request,env),b=await request.json(),origin=new URL(request.url).origin,db=env.COMMUNITY_DB;
  if(b.action==='policy')return out({ok:true,enabled:await externalPolicy(env)});
  if(b.action==='set_policy'){
   if(b.confirm!==true||typeof b.enabled!=='boolean')return out({ok:false,error:'Potwierdź zmianę polityki.'},400);
   const now=new Date().toISOString();await db.batch([db.prepare('UPDATE aio_external_speed_policy_v1 SET enabled=?,updated_at=? WHERE id=1').bind(+b.enabled,now),db.prepare(`INSERT INTO community_moderation_log(id,actor_id,target_user_id,target_type,target_id,action,reason,ip_address,metadata,created_at) VALUES(?,?,NULL,'external_file','policy','owner_external_speed_policy','Kontrola linków zewnętrznych',NULL,?,?)`).bind(crypto.randomUUID(),id,JSON.stringify({enabled:b.enabled}),now)]);
   return out({ok:true,enabled:await externalPolicy(env),message:'Zapisano ustawienie.'});
  }
  if(b.action==='report'){
   // Bounded page of recent publications; no remote fetching and no raw link persistence.
   const offset=Number(b.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return out({ok:false,error:'Nieprawidłowa strona.'},400);
   const rows=(await db.prepare(`SELECT id,content,'post' AS source,created_at FROM community_posts WHERE status='published' UNION ALL SELECT id,content,'comment' AS source,created_at FROM community_comments WHERE status='published' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).bind(offset).all()).results||[];
   const found=new Map();for(const row of rows)for(const href of linksInPost(row.content)){if(classifyPostLink(href,origin).kind==='external'&&!isOfficialAioPanelIpkUrl(href,origin))found.set(href,{href,host:new URL(href).hostname,source:row.source});if(found.size>500)break;}
   const list=[...found.values()].slice(0,500);for(const item of list)item.hash=await sourceHash(item.href);
   const maps=new Set();for(let i=0;i<list.length;i+=50){const chunk=list.slice(i,i+50);const matches=(await db.prepare('SELECT source_hash FROM aio_external_speed_maps_v1 WHERE source_hash IN ('+chunk.map(()=>'?').join(',')+')').bind(...chunk.map(x=>x.hash)).all()).results||[];for(const m of matches)maps.add(m.source_hash);}
   return out({ok:true,checked:rows.length,more:rows.length===50,items:list.map(x=>({href:x.href,host:x.host,source:x.source,mode:maps.has(x.hash)?'mapped':directSource(x.href)?'direct':'needs_copy'}))});
  }
  const url=normalizePostLink(b.href);
  if(!url||url.origin===origin||classifyPostLink(url.href,origin).kind!=='external'||isOfficialAioPanelIpkUrl(url.href,origin))return out({ok:false,error:'Podaj pełny, rozpoznany zewnętrzny link do pliku.'},400);
  const hash=await sourceHash(url.href);
  if(b.action==='lookup'){const row=await db.prepare('SELECT r2_path,updated_at FROM aio_external_speed_maps_v1 WHERE source_hash=?').bind(hash).first();return out({ok:true,mapping:row||null});}
  if(b.confirm!==true||!['save','remove'].includes(b.action))return out({ok:false,error:'Potwierdź operację.'},400);
  const path=String(b.path||'').trim();
  if(b.action==='save'&&(!validMapPath(path)||!privateStorageEnabled(env)||!await env.AIO_PRIVATE_FILES?.head(r2KeyFromPath(path))))return out({ok:false,error:'Nie znaleziono dozwolonego pliku w prywatnym R2. Podaj ścieżkę /pliki/nazwa.zip.'},400);
  const now=new Date().toISOString(),meta=JSON.stringify({source_hash:hash,host:url.hostname,r2_path:b.action==='save'?path:null});
  const op=b.action==='save'?db.prepare(`INSERT INTO aio_external_speed_maps_v1(source_hash,r2_path,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(source_hash) DO UPDATE SET r2_path=excluded.r2_path,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(hash,path,now,id):db.prepare('DELETE FROM aio_external_speed_maps_v1 WHERE source_hash=?').bind(hash);
  const audit=db.prepare(`INSERT INTO community_moderation_log(id,actor_id,target_user_id,target_type,target_id,action,reason,ip_address,metadata,created_at) VALUES(?,?,NULL,'external_file',?,?,?,NULL,?,?)`).bind(crypto.randomUUID(),id,hash,'owner_external_speed_'+b.action,'Mapowanie pliku do prywatnego R2',meta,now);
  await db.batch([op,audit]);return out({ok:true,message:b.action==='save'?'Przypisano kopię AIO.':'Usunięto przypisanie.',mapping:b.action==='save'?{r2_path:path,updated_at:now}:null});
 }catch(e){console.error('[AIO external map]',String(e?.message||e).slice(0,100));return out({ok:false,error:'Nie można obsłużyć przypisania.'},[401,403].includes(e?.status)?e.status:503);}
}
