/* Public metadata for registration form only; never exposes secrets. */
import {json} from '../_community.js';
import {guardConfiguration} from '../_aio_multikonta_guard_v2.js';
export async function onRequestGet({env}){
  const cfg=guardConfiguration(env);
  return json({ok:true,turnstile_enabled:cfg.turnstile_enabled,site_key:cfg.site_key});
}
