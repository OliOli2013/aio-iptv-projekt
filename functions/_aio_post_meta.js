/* AIO SEO V1: public metadata ONLY for published official posts.
 * Ordinary community posts remain private to guests and noindex.
 * Standalone Pages Functions /post and /post.html call this shared handler.
 */
const SITE = 'https://aio-iptv-projekt.pages.dev';
const FALLBACK_IMAGE = SITE + '/assets/branding/aio-iptv-share-20261010.png?v=20261024-tunerhub-v11';
const ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function plain(value, max) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0, max);
}
function meta(value) { return escapeHtml(value); }
function imageFor(row) {
  try {
    const att = JSON.parse(row.attachments || '[]');
    if (!Array.isArray(att)) return FALLBACK_IMAGE;
    const match = att.find(x => x && /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/i.test(String(x.type||''))
      && typeof (x.key||x.path) === 'string' && (x.key||x.path).length <= 500);
    if (!match) return FALLBACK_IMAGE;
    return SITE+'/api/community-media?key='+encodeURIComponent(match.key||match.path);
  }catch (_) { return FALLBACK_IMAGE; }
}
function substitute(html,row,id) {
  const title = plain(row.title, 140) || 'Wpis AIO';
  const content = plain(row.content, 15000);
  const excerpt = content.slice(0,190) || 'Oficjalna publikacja AIO TunerHub — Enigma2, oprogramowanie i poradniki.';
  const canonical = SITE+'/post?id='+encodeURIComponent(id);
  const photo = imageFor(row);
  const pageTitle = title+' — Społeczność AIO TunerHub';
  // All inputs escaped; no hidden/private rows can reach this function.
  const replacements = [
    [/<title>Wpis — Społeczność AIO<\/title>/, '<title>'+meta(pageTitle)+'</title>'],
    [/<meta name="description" content="Wpis i odpowiedzi w Społeczności AIO dla użytkowników Enigma2\."\s*\/?\s*>/, '<meta name="description" content="'+meta(excerpt)+'">'],
    [/<meta property="og:title" content="Wpis — Społeczność AIO"\s*\/?\s*>/, '<meta property="og:title" content="'+meta(pageTitle)+'">'],
    [/<meta property="og:description" content="Wpis i odpowiedzi w Społeczności AIO dla użytkowników Enigma2\."\s*\/?\s*>/, '<meta property="og:description" content="'+meta(excerpt)+'">'],
    [/<link rel="canonical" href="https:\/\/aio-iptv-projekt\.pages\.dev\/post"\s*\/?\s*>/, '<link rel="canonical" href="'+meta(canonical)+'">'],
    [/<meta property="og:url" content="https:\/\/aio-iptv-projekt\.pages\.dev\/post"\s*\/?\s*>/, '<meta property="og:url" content="'+meta(canonical)+'">'],
    [/<meta name="robots" content="noindex,follow"\s*\/?\s*>/, '<meta name="robots" content="index,follow,max-image-preview:large">'],
    [/<meta property="og:image" content="[^"]*"\s*\/?\s*>/, '<meta property="og:image" content="'+meta(photo)+'">'],
    [/<meta property="og:image:secure_url" content="[^"]*"\s*\/?\s*>/, '<meta property="og:image:secure_url" content="'+meta(photo)+'">'],
    [/<meta name="twitter:image" content="[^"]*"\s*\/?\s*>/, '<meta name="twitter:image" content="'+meta(photo)+'">'],
    [/<meta itemprop="image" content="[^"]*"\s*\/?\s*>/, '<meta itemprop="image" content="'+meta(photo)+'">']
  ];
  // Do not accidentally enable indexing if an unexpected revision removes the generic template markers.
  if (!replacements.every(([pattern])=>pattern.test(html)) || !html.includes('<section data-community-post></section>')) return null;
  for (const [pattern,value] of replacements) html = html.replace(pattern,value);
  const schema = {
    '@context':'https://schema.org','@type':'BlogPosting',headline:title,description:excerpt,
    mainEntityOfPage:canonical,url:canonical,image:[photo],publisher:{'@type':'Organization',name:'AIO TunerHub',url:SITE}
  };
  if (row.published_at) schema.datePublished = row.published_at;
  if (row.updated_at) schema.dateModified = row.updated_at;
  const jsonld = JSON.stringify(schema).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  html = html.replace('</head>', '<meta property="og:type" content="article"><script type="application/ld+json">'+jsonld+'</script></head>');
  // Server HTML contains visible post content for crawlers. Existing JS replaces the section after loading.
  html = html.replace('<section data-community-post></section>',
    '<section data-community-post><article class="community-post-card official"><div class="community-post-content"><p class="community-status-pill official">Oficjalne AIO</p><h1>'+escapeHtml(title)+'</h1><div class="community-post-text">'+escapeHtml(content).replace(/\n/g,'<br>')+'</div></div></article></section>');
  return html;
}


/* Published community posts expose only title and first image in server HTML.
 * They remain NOINDEX and their body/attachments never appear in HTML or SEO data.
 */
function substituteTeaser(html,row,id){
  const title=plain(row.title,140)||'Wpis Społeczności AIO';
  const pageTitle=title+' — Społeczność AIO TunerHub';
  const description='Zarejestruj się lub zaloguj do Społeczności AIO, aby przeczytać pełną treść i komentarze.';
  const canonical=SITE+'/post?id='+encodeURIComponent(id);
  const photo=imageFor(row);
  const replacements=[
    [/<title>Wpis — Społeczność AIO<\/title>/,'<title>'+meta(pageTitle)+'</title>'],
    [/<meta name="description" content="Wpis i odpowiedzi w Społeczności AIO dla użytkowników Enigma2\."\s*\/?\s*>/,'<meta name="description" content="'+meta(description)+'">'],
    [/<meta property="og:title" content="Wpis — Społeczność AIO"\s*\/?\s*>/,'<meta property="og:title" content="'+meta(pageTitle)+'">'],
    [/<meta property="og:description" content="Wpis i odpowiedzi w Społeczności AIO dla użytkowników Enigma2\."\s*\/?\s*>/,'<meta property="og:description" content="'+meta(description)+'">'],
    [/<link rel="canonical" href="https:\/\/aio-iptv-projekt\.pages\.dev\/post"\s*\/?\s*>/,'<link rel="canonical" href="'+meta(canonical)+'">'],
    [/<meta property="og:url" content="https:\/\/aio-iptv-projekt\.pages\.dev\/post"\s*\/?\s*>/,'<meta property="og:url" content="'+meta(canonical)+'">'],
    [/<meta property="og:image" content="[^"]*"\s*\/?\s*>/,'<meta property="og:image" content="'+meta(photo)+'">'],
    [/<meta property="og:image:secure_url" content="[^"]*"\s*\/?\s*>/,'<meta property="og:image:secure_url" content="'+meta(photo)+'">'],
    [/<meta name="twitter:image" content="[^"]*"\s*\/?\s*>/,'<meta name="twitter:image" content="'+meta(photo)+'">'],
    [/<meta itemprop="image" content="[^"]*"\s*\/?\s*>/,'<meta itemprop="image" content="'+meta(photo)+'">']
  ];
  if(!replacements.every(([p])=>p.test(html))||!html.includes('<section data-community-post></section>'))return null;
  for(const [p,v] of replacements)html=html.replace(p,v);
  const imageHtml='<img src="'+meta(photo)+'" alt="Grafika wpisu" loading="lazy" style="max-width:100%;height:auto;border-radius:12px">';
  html=html.replace('<section data-community-post></section>',
    '<section data-community-post><article class="community-post-card aio-community-teaser"><div class="community-post-content"><h1>'+escapeHtml(title)+'</h1>'+imageHtml+
    '<p>🔒 Zarejestruj się lub zaloguj, aby przeczytać cały wpis.</p><a href="/community">Dołącz do Społeczności AIO →</a></div></article></section>');
  return html;
}

export async function handleOfficialPost(context) {
  const {request,env} = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  // Preserve normal behavior and noindex when no explicit post identifier exists.
  const fallback = async () => {
    const base = await context.next();
    if (base.status !== 200) return base;
    const headers = new Headers(base.headers);
    headers.set('X-Robots-Tag','noindex, follow');
    headers.set('Cache-Control','private, no-store');
    return new Response(base.body,{status:base.status,statusText:base.statusText,headers});
  };
  if (!ID_RE.test(id) || !env?.COMMUNITY_DB) return fallback();
  let row;
  try {
    row = await env.COMMUNITY_DB.prepare(`SELECT title,content,attachments,published_at,updated_at,kind
      FROM community_posts WHERE id=? AND status='published' AND kind IN ('official','community') LIMIT 1`).bind(id).first();
  }catch (error) {
    console.error('AIO SEO V1: D1 lookup failed:',error?.message);
    return fallback();
  }
  if (!row) return fallback();
  const base = await context.next();
  if (base.status !== 200 || !String(base.headers.get('content-type')||'').toLowerCase().includes('text/html')) return base;
  let html = await base.text();
  const updated = row.kind==='official' ? substitute(html,row,id) : substituteTeaser(html,row,id);
  if (!updated) {
    console.error('AIO SEO V1: unexpected post.html template, keeping noindex.');
    return new Response(html,{status:base.status,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, follow','Cache-Control':'private, no-store'}});
  }
  const headers = new Headers(base.headers);
  headers.delete('Content-Length');headers.delete('ETag');headers.delete('Content-Encoding');
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control',row.kind==='official'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0');
  headers.set('X-Robots-Tag',row.kind==='official'?'index, follow':'noindex, follow');
  headers.set('Vary','Accept-Encoding');
  return new Response(updated,{status:200,headers});
}
