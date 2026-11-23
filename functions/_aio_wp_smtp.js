/* Secure WP SMTP adapter for Cloudflare Pages Functions.
 * Credentials are read only from Cloudflare env; never returned to the browser.
 */
import {connect} from 'cloudflare:sockets';
import {smtpSend} from './_aio_smtp_protocol.js';
const validEmail=s=>/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(String(s||''));
export function wpSmtpReady(env){
  if (String(env?.AIO_DISABLE_OUTBOUND_EMAIL || '') === '1') return false;
  return !!(validEmail(String(env.WP_SMTP_EMAIL||'').trim())&&String(env.WP_SMTP_APP_PASSWORD||'').trim());
}
export async function sendWpSmtp(env, {to,subject,text}){
  if(!wpSmtpReady(env))throw Object.assign(new Error('Wysyłka SMTP WP nie jest skonfigurowana.'),{status:503,code:'SMTP_CONFIG'});
  return smtpSend({connect,from:String(env.WP_SMTP_EMAIL).trim(),to,
    password:String(env.WP_SMTP_APP_PASSWORD).trim(),subject,text});
}
