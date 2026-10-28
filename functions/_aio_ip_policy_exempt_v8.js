/* AIO IP Policy V8: fixed server-side exceptions + optional Cloudflare env setting.
 * Never authorize based on a display name, URL or browser-provided user ID.
 */
export const FIXED_IP_POLICY_EXEMPT_IDS = Object.freeze([]); // strict policy: no test-account bypass
export function isIpPolicyExemptV8(userId,env){
  // Non-owner accounts cannot bypass the IP rule via env or past test exemptions.
  // Owner account is protected separately by a verified server-side ID check.
  return false;
}
