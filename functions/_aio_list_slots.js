/* AIO LIST SLOTS V1: satellite positions derived from DVB service references in ZIP.
 * Namespace high 16 bits encode orbital position in tenths of a degree.
 * Ignore bouquet directory refs, terrestrial namespace 0, and IPTV stream refs.
 */
export const SLOT_LABELS = Object.freeze({
  hb13:'Hot Bird 13°E',
  dual:'Hot Bird 13°E + Astra 19,2°E',
  multi:'Multi SAT (13°E + 19,2°E + kolejne)'
});
export function orbitalFromService(line){
  const match=String(line||'').match(/^#SERVICE\s+(\d+):(?:[0-9a-f]+:){5}([0-9a-f]{1,8}):/i);
  if(!match)return null;
  if(![1,25].includes(Number(match[1])))return null;
  const orb=(parseInt(match[2],16)>>>16);
  return orb>=1 && orb<=3599 ? orb : null;
}
export function classifySatellites(values){
  const sats=new Set(values);
  if(sats.size===1&&sats.has(130))return 'hb13';
  if(sats.size===2&&sats.has(130)&&sats.has(192))return 'dual';
  if(sats.size>=3&&sats.has(130)&&sats.has(192))return 'multi';
  return null;
}
/* Historical published records had no slot column. Infer only unambiguous titles,
 * otherwise block creation until an owner resolves the old list by removal.
 */
export function legacySlot(name,description=''){
  const t=String(name||'').toLowerCase().replace(/,/g,'.');
  const positions=[...t.matchAll(/(?:^|[^\d])(13(?:\.0)?|19(?:\.2)?|16(?:\.0)?|23\.5|28\.2)\s*°?\s*e\b/g)].map(x=>x[1]);
  const have13=positions.some(x=>x==='13'||x==='13.0')||/hot\s*bird|hotbird/i.test(t);
  const have192=positions.some(x=>x==='19.2'||x==='19')||/astra\s*19(?:\.2)?/i.test(t);
  const other=positions.some(x=>!['13','13.0','19.2','19'].includes(x));
  if(have13&&have192&&(other||/multi|3x1|4x1|5x1/i.test(t)))return 'multi';
  if(have13&&have192)return 'dual';
  if(have13&&!other)return 'hb13';
  // No guesses from vague words in descriptions: fail closed for old records.
  return null;
}
