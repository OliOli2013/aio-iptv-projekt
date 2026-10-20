import {json,getSession} from '../_community.js';
import {activeSharedHold} from '../_aio_security_journal.js';
export async function onRequestGet({request,env}){
  try{
    const s=await getSession(request,env,{touch:false,allowUnverified:true});
    if(!s||s.blocked||s.banned)return json({ok:true,authenticated:false,restricted:false},200,{'Cache-Control':'no-store'});
    const hold=s.user.is_owner?null:await activeSharedHold(env,request,s.user.id);
    return json({ok:true,authenticated:true,restricted:!!hold,expires_at:hold?.expires_at||null,message:hold?.message||null},200,{'Cache-Control':'no-store'});
  }catch(_){return json({ok:false,error:'Nie udało się zweryfikować ochrony.'},503,{'Cache-Control':'no-store'});}
}
