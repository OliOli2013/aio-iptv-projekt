/* AIO IP Policy V8: fixed server-side exceptions + optional Cloudflare env setting.
 * Never authorize based on a display name, URL or browser-provided user ID.
 */
export const FIXED_IP_POLICY_EXEMPT_IDS = Object.freeze([
  'c2847d96-0867-4b6c-a53b-700059b1a403', // Klos: owner test account
  '8ff5c4f0-2742-4a10-b4b0-20c9713d708a'  // Beata: owner test account
]);
export function isIpPolicyExemptV8(userId,env){
  if(!userId)return false;
  if(FIXED_IP_POLICY_EXEMPT_IDS.includes(String(userId)))return true;
  // Optional private setting, exact UUIDs, no display names.
  return String(env?.AIO_IP_POLICY_EXEMPT_USER_IDS||'').split(',')
    .map(v=>v.trim()).filter(v=>/^[0-9a-f-]{36}$/i.test(v)).includes(String(userId));
}
