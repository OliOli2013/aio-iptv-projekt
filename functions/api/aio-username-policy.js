/* Owner-friendly mandatory name change, without enabling banned/blocked accounts. */
import {getSession,moderationLog,json} from '../_community.js';
import {usernameRenameReview,checkUsername,claimUsernameStatement,completeRenameStatement} from '../_aio_username_policy_v1.js';
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const respond=(value,status=200)=>json(value,status,HEAD);
const sameOrigin=request=>{
  const origin=request.headers.get('origin');
  return (!origin||origin===new URL(request.url).origin)&&request.headers.get('sec-fetch-site')!=='cross-site';
};
async function session(request,env){
  // Existing account, IP and global holds still take precedence. Only ordinary content gate is bypassed.
  const s=await getSession(request,env,{touch:false,allowUnverified:true,allowRename:true});
  if(!s||s.banned||s.blocked)return null;
  return s;
}
export async function onRequestGet({request,env}){
  try{
    const s=await session(request,env);
    if(!s)return respond({ok:true,required:false,authenticated:false});
    const review=await usernameRenameReview(env,s.user.id,s.user.display_name,s.user.role);
    if(!review)return respond({ok:true,required:false,authenticated:true});
    // AIO_USERNAME_PROTECTION_V1_2_20261118: dostępność nazwy tylko dla zalogowanego konta z obowiązkiem zmiany.
    const candidate=new URL(request.url).searchParams.get('check');
    if(candidate!==null){
      if(candidate.length>120)return respond({ok:true,required:true,available:false,message:'Nazwa jest za długa.'});
      const verdict=await checkUsername(env,candidate,s.user.id,false);
      return respond({ok:true,required:true,available:!!verdict.ok,
        message:verdict.ok?'Nazwa jest dostępna. Możesz ją zapisać.':(verdict.error||'Nazwa niedostępna.')});
    }
    return respond({ok:true,required:true,authenticated:true,current_name:s.user.display_name,
      deadline_at:review.deadline_at,grace_used:!!review.grace_used_at,
      reason:'Nazwa konta jest zastrzeżona albo już wykorzystywana przez inne konto.'});
  }catch(e){console.error('AIO Username GET',String(e?.message||e));return respond({ok:false,error:'Nie można sprawdzić nazwy konta.'},503)}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return respond({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').includes('application/json'))return respond({ok:false,error:'Wymagany JSON.'},415);
  try{
    const s=await session(request,env);
    if(!s)return respond({ok:false,error:'Zaloguj się, aby zmienić nazwę konta.'},401);
    const review=await usernameRenameReview(env,s.user.id,s.user.display_name,s.user.role);
    if(!review)return respond({ok:false,error:'To konto nie wymaga obowiązkowej zmiany nazwy.'},409);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='rename')return respond({ok:false,error:'Nieznana operacja.'},400);
    const verdict=await checkUsername(env,body.displayName,s.user.id,false);
    if(!verdict.ok)return respond({ok:false,code:verdict.code||'invalid',error:verdict.error},409);
    const now=new Date().toISOString();
    // D1 batch is transactional: failed name claim cannot leave a renamed profile.
    await env.COMMUNITY_DB.batch([
      claimUsernameStatement(env,s.user.id,verdict.key),
      env.COMMUNITY_DB.prepare(`UPDATE community_profiles
        SET display_name=?,updated_at=? WHERE id=? AND role='user'`)
        .bind(verdict.name,now,s.user.id),
      completeRenameStatement(env,s.user.id,verdict.name)
    ]);
    await moderationLog(env,s.user.id,{targetUserId:s.user.id,targetType:'user',targetId:s.user.id,
      action:'username_required_rename',reason:'Obowiązkowa zmiana nazwy konta.'}).catch(()=>{});
    return respond({ok:true,renamed:true,new_name:verdict.name,message:'Nowa nazwa została zapisana. Konto może ponownie korzystać z serwisu.'});
  }catch(e){
    console.error('AIO Username POST',String(e?.message||e).slice(0,180));
    if(/UNIQUE constraint|aio_username_claims_v1/i.test(String(e?.message||'')))
      return respond({ok:false,error:'Ten login jest już zajęty. Wybierz inny.'},409);
    return respond({ok:false,error:'Nie udało się zmienić nazwy. Spróbuj ponownie lub skontaktuj się z administracją.'},503);
  }
}
