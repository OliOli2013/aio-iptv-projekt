/* Sitemap contains ONLY published official posts that are public to guests. */
const BASE='https://aio-iptv-projekt.pages.dev/post?id=';
const ID_RE=/^[a-zA-Z0-9_-]{1,100}$/;
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
export async function onRequestGet({env}) {
  if(!env?.COMMUNITY_DB)return new Response('Katalog niedostępny.',{status:503,headers:{'Cache-Control':'no-store'}});
  try {
    const {results=[]}=await env.COMMUNITY_DB.prepare(`SELECT id,COALESCE(updated_at,published_at) AS updated_at
      FROM community_posts WHERE status='published' AND kind='official'
      ORDER BY COALESCE(published_at,created_at) DESC LIMIT 1000`).all();
    const entries=results.filter(row=>ID_RE.test(String(row.id||''))).map(row=>{
      const date=new Date(row.updated_at);
      const lastmod=Number.isFinite(date.getTime())?'<lastmod>'+date.toISOString().slice(0,10)+'</lastmod>':'';
      return '<url><loc>'+esc(BASE+encodeURIComponent(row.id))+'</loc>'+lastmod+'</url>';
    }).join('');
    const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries+'</urlset>';
    return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }catch(error){console.error('AIO sitemap posts',error?.message);return new Response('Chwilowo niedostępne.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
