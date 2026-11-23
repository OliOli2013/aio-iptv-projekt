/* OAuth callback. No user IDs or tokens are placed into redirect URLs. */
import {finishSocial,redirectSocial} from '../_aio_social_v1.js';
export async function onRequestGet({request,env}){
  try{
    const result=await finishSocial(request,env);
    return redirectSocial(result.code,result.sessionToken||null);
  }catch(e){
    // Never log OAuth code, state, provider tokens or email.
    console.error('AIO Social callback failure',String(e?.code||e?.status||'ERROR'));
    if(e?.code==='AIO_VPN_CONNECTION')return redirectSocial('vpn_connection');
    if(e?.code==='AIO_NETWORK_RETRY')return redirectSocial('network_retry');
    return redirectSocial(e?.status===409?'conflict':e?.status===404?'not_linked':e?.status===403?'needs_review':e?.status===400?'cancelled':'failed');
  }
}
