/* AIO IA V1 — pure catalog helpers, usable by browser and Node tests. */
export const PROJECT_CATEGORIES = [
  ['all','Wszystkie'],['Wtyczki','Wtyczki Enigma2'],['Skórki','Skórki'],
  ['Android','Android'],['Windows','Windows'],['Listy kanałów','Listy AIO Team']
];
export const DOWNLOAD_CATEGORIES = [
  ['Systemy','Systemy'],['Wtyczki','Wtyczki'],['Skórki','Skórki'],
  ['Listy kanałów','Listy kanałów'],['Android','Android'],['Windows','Windows'],
  ['Poradniki','Poradniki'],['Dodatki','Dodatki']
];
// Explicit curated AIO project IDs. Inclusion does NOT infer ownership from a title.
export const AIO_PROJECT_IDS = new Set([
  'e2-security','aio-panel','aiohd-next','iptv-dream','pp-channel-sync',
  'e2-doctor','aio-channel-editor','aio-remote','cambridge-android','cambridge-windows',
  'picon-updater','neoradio','opencamview','simple-iptv-epg','channel-lists'
]);
export function projectCategory(raw) {
  switch (String(raw || '')) {
    case 'Wtyczka Enigma2': return 'Wtyczki';
    case 'Skin Enigma2': return 'Skórki';
    case 'Android': return 'Android';
    case 'Windows': return 'Windows';
    case 'Listy kanałów': return 'Listy kanałów';
    case 'Systemy': return 'Systemy';
    default: return 'Inne';
  }
}
export function isAioProject(p) { return AIO_PROJECT_IDS.has(String(p?.id || '')); }
export function safePage(value) {
  const s=String(value||'');
  return /^(?:[a-z0-9][a-z0-9._-]*\.html)(?:#[a-z0-9._-]+)?$/i.test(s) && !s.includes('..') ? s : '';
}
export function downloadIdentity({category='',title='',page=''}) {
  const cat=String(category||'');
  const normalizedTitle=String(title||'').trim().toLowerCase().replace(/\s+/g,' ');
  const normalizedPage=safePage(page).split('#')[0].toLowerCase();
  // Different tuner images must never collapse into one "Systems" card.
  if (cat==='Systemy' || cat==='Dodatki' || !normalizedPage ||
      (cat==='Android' && normalizedPage==='index.html')) {
    return cat+'|title|'+normalizedTitle;
  }
  return cat+'|page|'+normalizedPage;
}
export function latestProjectFirst(a,b) {
  function day(p){
    const s=String(p.updated||'');
    const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    const pl=/^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
    return iso?Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`):pl?Date.parse(`${pl[3]}-${pl[2]}-${pl[1]}T00:00:00Z`):0;
  }
  return (day(b)||0)-(day(a)||0) || String(a.name||'').localeCompare(String(b.name||''),'pl');
}
