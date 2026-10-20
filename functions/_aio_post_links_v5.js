/* AIO Access V5 — server-side validation and classification of URLs published in posts.
 * External URLs are inherently public at their destination; this gates the handoff,
 * not delivery by third-party hosting. Never store a URL's query string in audit.
 */
let ready;
const LINK_RE=/(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:pl|com|net|org|eu|io|tv|dev|app|info|me)(?:\/[^\s<>"']*)?/gi;
const FILE_EXT=/\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u|m3u8|xml|conf|cfg|backup|sh|py|json|txt|list|tv|radio|bouquet)(?:$|[?#])/i;
const IMAGE_EXT=/\.(?:png|jpe?g|webp|gif|svg|avif)(?:$|[?#])/i;
const DOWNLOAD_HINT=/(?:\/releases\/download\/|\/downloads?\/|\/archives?\/|[?&](?:download|attachment)=|(?:[?&]|^)id_attachment=|controller=attachment)/i;
const EXTERNAL_KEY_PREFIX='/pliki/__aio_post_external_v5__/';

export function normalizePostLink(input){
  try {
    const raw=String(input||'').trim();
    if(!raw||raw.length>2000)return null;
    const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)return null;
    return url;
  }catch(_){return null;}
}
export function linksInPost(content){
  const text=String(content||'');
  const urls=[];LINK_RE.lastIndex=0;
  let m;
  while((m=LINK_RE.exec(text))!==null){
    let match=m[0];
    while(/[.,;:!?\)\]\}]+$/.test(match))match=match.slice(0,-1);
    const url=normalizePostLink(match);
    if(url)urls.push(url.href);
    if(urls.length>250)break;
  }
  return urls;
}
export function classifyPostLink(link,origin){
  const url=normalizePostLink(link);
  if(!url)return {kind:'invalid'};
  const path=url.pathname+url.search;
  if(url.origin===origin&&/^\/pliki\/[^/]/i.test(url.pathname)&&!IMAGE_EXT.test(path))return {kind:'local',url:url.href};
  if(IMAGE_EXT.test(path))return {kind:'info',url:url.href};
  // True external file/archive links, not ordinary editorial pages or GitHub repositories.
  const isFile=FILE_EXT.test(path)||DOWNLOAD_HINT.test(path)||
    (/multi-click\.pl$/i.test(url.hostname)&&/attachment|id_attachment/i.test(path));
  return {kind:isFile?'external':'info',url:url.href};
}
export async function ensurePostLinkSchema(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak bazy COMMUNITY_DB');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_post_link_handoffs (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,post_id TEXT NOT NULL,
      host TEXT NOT NULL,file_name TEXT NOT NULL,reason TEXT NOT NULL,
      created_at TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'external',
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_post_links_time ON aio_post_link_handoffs(created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_post_links_user ON aio_post_link_handoffs(user_id,created_at DESC)')
  ]).catch(e=>{ready=null;throw e;});
  await ready;
}
export function safePostFileName(urlString){
  const url=normalizePostLink(urlString);
  if(!url)return 'Plik z posta';
  let name=url.pathname.split('/').filter(Boolean).pop()||'pobieranie';
  try{name=decodeURIComponent(name)}catch(_){}
  return name.replace(/[\x00-\x1f\x7f<>]/g,'').slice(0,160)||'pobieranie';
}
export async function externalFileKey(link,sha256){
  const url=normalizePostLink(link);
  if(!url)throw new Error('Nieprawidłowy link');
  return EXTERNAL_KEY_PREFIX+(await sha256('aio-post-v5:'+url.href));
}
