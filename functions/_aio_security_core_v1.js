/* AIO SECURITY CORE V1 — shared, server-side admission gate for counted downloads.
 * No browser fingerprint, no CAPTCHA, no second quota counter, no new IP ban.
 * The existing monthly quota remains the only atomic debit authority.
 * This gate rechecks the authenticated identity and currently active holds just
 * before EACH debit, including legacy 'consume' and external file handoffs.
 */
import {getSession} from './_community.js';
import {checkProtectedSessionNetwork} from './_aio_session_network_v1.js';
import {activeSharedHold} from './_aio_security_journal.js';
import {strictGlobalHold} from './_aio_strict_ip_v4.js';
import {activeIpHold} from './_aio_ip_one_account_v7.js';

export const AIO_SECURITY_CORE_VERSION='AIO_SECURITY_CORE_V1_20261114';

const deny=(reason)=>({allowed:false,reason});
export function coreDecision({authenticated=false,accountBlocked=false,strictHold=false,ipHold=false,sharedHold=false,status=null}={}){
  if(!authenticated)return deny('session');
  if(accountBlocked||strictHold||ipHold||sharedHold)return deny('restricted');
  if(!status||status.authenticated!==true)return deny('unavailable');
  if(status.email_verified===false||status.email_verification_required===true)return deny('email');
  if(status.active===true)return {allowed:true,reason:'access'};
  if(status.review_pending===true)return deny('review');
  if(!Number.isFinite(Number(status.free_remaining))||Number(status.free_remaining)<1)return deny('limit');
  return {allowed:true,reason:'free'};
}

/**
 * Called by _aio_account_access.consumeFree for every metered entry point.
 * No fallback to authorizing on error: callers handle D1 failure as HTTP 503.
 * Re-verify the live session even when the route obtained one earlier; a recent
 * administrative ban must not be bypassed by a stale status or open browser tab.
 */
export async function coreAdmitDownload(env,request,userId,status){
  if(!request||!request.headers||!userId)return deny('session');
  const session=await getSession(request,env,{touch:false,allowUnverified:true});
  const authenticated=Boolean(session&&session.user?.id===userId);
  const accountBlocked=Boolean(session?.blocked||session?.banned);
  // V1.2: ONLY the authenticated server-verified site owner is exempt from
  // inherited anti-abuse holds. A claimed role or client-provided status alone
  // is never sufficient; all three independent server flags must agree.
  const verifiedOwner=authenticated&&session.user?.is_owner===true&&
    session.user?.role==='admin'&&status?.owner===true&&
    status?.unlimited===true&&status?.active===true;
  if(verifiedOwner)return {allowed:true,reason:'owner'};
  if(!authenticated||accountBlocked)return coreDecision({authenticated,accountBlocked,status});
  const network=await checkProtectedSessionNetwork(env,request,session);
  if(!network.allowed)return {allowed:false,reason:'network',network_status:network.status};
  // All three existing policies are enforced, without adding new restrictions.
  const strict=await strictGlobalHold(env,userId);
  if(strict)return coreDecision({authenticated:true,strictHold:true,status});
  const ip=await activeIpHold(env,userId,request);
  if(ip)return coreDecision({authenticated:true,ipHold:true,status});
  const shared=await activeSharedHold(env,request,userId);
  return coreDecision({authenticated:true,sharedHold:Boolean(shared),status});
}

/* Intentional exclusions: the public AIO Panel IPK never enters this core, and
 * external providers are only controlled until the URL is handed off. */
