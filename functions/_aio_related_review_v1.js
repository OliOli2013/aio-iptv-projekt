/* AIO TunerHub — weryfikacja powiązanych kont V1 (12.11.2026).
 * Imienne, odwracalne ograniczenia, zatwierdzone do wdrożenia przez właściciela.
 * NIE wykrywaj i NIE blokuj automatycznie na podstawie samego IP/nazwy.
 * Nie umieszczaj adresów e-mail ani jawnych IP w repozytorium.
 * Wykonuje seed TYLKO RAZ. Ręczne zdjęcie blokady NIE jest nadpisywane przy kolejnych żądaniach.
 */
const ITEMS = [
  ['5a62b21e-4cd7-44ec-8f2e-9831d1107874','msumik'],
  ['2311c8f1-ed15-4b4d-9bfb-93a1bba2733a','msumik'],
  ['62e87156-a805-4177-8871-edef12681b3b','zielen1'],
  ['8faecf12-8cdc-4c40-a0e1-a5507a09c8c0','zielen1'],
  ['de2e8b93-b368-44f7-92ff-220dceaaa73a','arwady'],
  ['e6e5bbe9-d3c8-4d08-8910-873f0d17bc0d','arwady'],
  ['201cbf6e-afa5-4dcb-84bb-8cbe23363d13','damian1913'],
  ['f21049ed-11db-4ec5-8ca5-e730679aa2cc','damian1913'],
  ['7b05615b-387b-45e2-86f9-38b6d59bd299','adamnogly1975'],
  ['a5a6735a-7989-485e-99bb-9372e5c5fa2a','adamnogly1975'],
  ['588f85e6-4fc8-4326-b5fe-0921f08a2439','szasio'],
  ['aaa1fd1b-e02b-483f-be2d-84272e8bc05e','szasio'],
  ['2785f741-d4fc-4299-9cbc-428dc871b26a','karolewicz'],
  ['56861a01-b321-4153-b944-51a9a3d35fe5','karolewicz'],
  ['65cd7438-00ac-4c5c-b198-836c804e3a37','mariusz_heiden'],
  ['1099cfe7-9571-4098-9f82-52e64db4a546','mariusz_heiden'],
  ['47ae77d8-20f0-4c81-8558-c673a70efffe','msisystem'],
  ['ba259518-73cc-41f7-9fc5-805529675030','msisystem'],
  ['b6a50220-3538-4136-b7d7-955bdc3da384','msisystem'],
 ];
const IDS=new Set(ITEMS.map(x=>x[0]));
const REASON='AIO_REVIEW_V1: Powiązane konta — dostęp wstrzymany do ręcznej weryfikacji. Kontakt: /appeal.html lub aio-iptv@wp.pl';
let initPromise=null;
export function isRelatedReviewTarget(id){return IDS.has(String(id||''));}
export async function ensureRelatedReviewV1(env){
  if(!env?.COMMUNITY_DB)throw new Error('Brak bazy COMMUNITY_DB dla kontroli powiązań.');
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    const db=env.COMMUNITY_DB;
    await db.prepare(`CREATE TABLE IF NOT EXISTS aio_related_account_review_v1 (
      user_id TEXT PRIMARY KEY,group_code TEXT NOT NULL,seeded_at TEXT NOT NULL,
      applied_at TEXT,decision TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`).run();
    const now=new Date().toISOString();
    // Nigdy nie blokuj właściciela ani innych ról. Każde ID jest jawnie wskazane w audycie.
    await db.batch(ITEMS.map(([id,group])=>db.prepare(`INSERT OR IGNORE INTO aio_related_account_review_v1
      (user_id,group_code,seeded_at,decision)
      SELECT ?,?,?, 'pending' WHERE EXISTS (
        SELECT 1 FROM community_profiles p WHERE p.id=? AND p.role='user'
      )`).bind(id,group,now,id)));
    // Atomowo: nadaj blokadę jednorazowo i oznacz seed jako wykonany.
    // Nie nadpisujemy aktywnych wcześniejszych blokad; żadnych zmian w hasłach, sesjach właściciela itd.
    await db.batch([
      db.prepare(`UPDATE community_profiles SET
        banned_until=CASE WHEN banned_until IS NULL OR banned_until<=? THEN '9999-12-31T23:59:59.000Z' ELSE banned_until END,
        ban_reason=CASE WHEN banned_until IS NULL OR banned_until<=? THEN ? ELSE ban_reason END,
        updated_at=?
        WHERE id IN (
          SELECT user_id FROM aio_related_account_review_v1
          WHERE applied_at IS NULL AND decision='pending'
        ) AND role='user'`).bind(now,now,REASON,now),
      db.prepare(`DELETE FROM community_sessions WHERE user_id IN (
        SELECT user_id FROM aio_related_account_review_v1
        WHERE applied_at IS NULL AND decision='pending'
      )`),
      db.prepare(`UPDATE aio_related_account_review_v1 SET applied_at=?
        WHERE applied_at IS NULL AND decision='pending'`).bind(now)
    ]);
    return true;
  })().catch(e=>{initPromise=null;throw e;});
  return initPromise;
}
