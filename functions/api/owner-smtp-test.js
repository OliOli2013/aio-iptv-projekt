/* Owner-only, rate-limited SMTP delivery test. No arbitrary recipients. */
import {requireAdmin,json,ensureSchema} from '../_community.js';
import {sendWpSmtp,wpSmtpReady} from '../_aio_wp_smtp.js';
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  return (!origin||origin===new URL(request.url).origin)&&request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Nieprawidłowe źródło żądania.'},403);
  try{
    const s=await requireAdmin(request,env,true);
    await ensureSchema(env);
    if(!wpSmtpReady(env))return json({ok:false,error:'Brakuje WP_SMTP_EMAIL lub WP_SMTP_APP_PASSWORD.'},503);
    const recipient=await env.COMMUNITY_DB.prepare('SELECT email FROM community_auth WHERE user_id=?').bind(s.user.id).first();
    if(!recipient?.email)return json({ok:false,error:'Brak adresu e-mail administratora w bazie.'},404);
    await env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_smtp_owner_tests (
      user_id TEXT PRIMARY KEY, last_sent_at TEXT NOT NULL)`).run();
    const now=new Date().toISOString(), allowed=new Date(Date.now()-90000).toISOString();
    const r=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_smtp_owner_tests(user_id,last_sent_at)
      VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_sent_at=excluded.last_sent_at
      WHERE aio_smtp_owner_tests.last_sent_at<=?`).bind(s.user.id,now,allowed).run();
    if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:'Odczekaj 90 sekund przed następnym testem.'},429);
    try{
      await sendWpSmtp(env,{to:recipient.email,subject:'AIO-IPTV.pl — test poczty WP SMTP',
        text:'To testowa wiadomość systemu AIO-IPTV.pl.\n\nJeżeli dotarła, wysyłka z Cloudflare Pages przez SMTP WP działa.\nNie musisz odpowiadać na tę wiadomość.'});
    }catch(e){
      const code=/^SMTP_[A-Z0-9_]+$/.test(String(e?.code||''))?String(e.code):'SMTP_UNKNOWN';
      return json({ok:false,error:'WP SMTP nie zaakceptowało wysyłki lub połączenie nie powiodło się.',code},502);
    }
    return json({ok:true,message:'Serwer SMTP przyjął wiadomość. Sprawdź skrzynkę administratora (również Spam).'});
  }catch(e){return json({ok:false,error:e?.status===401||e?.status===403?'Tylko zalogowany właściciel strony może uruchomić test.':'Nie można uruchomić testu.'},e?.status===401?401:e?.status===403?403:500);}
}
