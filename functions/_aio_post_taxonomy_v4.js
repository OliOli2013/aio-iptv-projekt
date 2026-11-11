/* AIO TOPICS V4 — additive taxonomy, never rewrites legacy community_posts.
   Keep taxonomies synchronised with data/community_config.json. */
const SUBCATEGORIES = {
  pomoc:['awarie','sieci','glowice','inne-problemy'],
  'aio-panel':['wydania','konfiguracja','bledy'],
  iptv:['m3u','xtream','odtwarzacze'],
  kanaly:['sat','dvbt','iptv','aktualizacje'],
  picony:['picony','epg-sat','xmltv'], oscam:['instalacja','diagnostyka'],
  systemy:['openatv','openpli','openvix','hdsatelit','inne'],
  backupy:['gotowy-backup','czysty-image','multiclick','aktualizacja'],
  wtyczki:['wydania','iptv','multimedia','narzedzia','problemy'],
  aplikacje:['android','windows','pilot'], testy:['recenzje','kompatybilnosc','nowosci'],
  porady:['instalacja','konfiguracja','ratowanie','krok-po-kroku'],
  gielda:['sprzedam','kupie','zamienie','oddam'],
  inne:['dyskusja','sugestie','ogloszenia']
};
const MODELS = {
  zgemma:['H7S','H8.2H','H8.2H SE','H9 Twin','H9 Twin SE','H9S','H11S','H17 Combo'],
  octagon:['SF8008','SF8008 Supreme','SX V2 WL 4K'],
  vuplus:['Zero 4K','Uno 4K SE','Duo 4K SE'],
  ustym:['4K Pro','4K Combo'], gigablue:['UHD Quad 4K','UHD Trio 4K'],
  nbox:['BSKA','BZZB'], inne:[]
};
const STATUSES=['dostepne','zarezerwowane','sprzedane'];
const fail = message => {throw Object.assign(new Error(message),{status:400});};
export const taxonomyColumns = `,
  COALESCE(t.subcategory,'') AS subcategory,
  COALESCE(t.brand,'') AS device_brand,
  COALESCE(t.model,'') AS device_model,
  COALESCE(t.listing_status,'') AS listing_status`;
let schemaPromise;
export async function ensureTopicsV4(env){
  // D1 CREATE TABLE IF NOT EXISTS is safe across concurrent Workers / Pages requests.
  if(!schemaPromise) schemaPromise=(async()=>{
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_post_taxonomy_v4 (
        post_id TEXT PRIMARY KEY, subcategory TEXT NOT NULL DEFAULT '',
        brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
        listing_status TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
        FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE)`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_topics_v4_brand_model ON aio_post_taxonomy_v4(brand,model)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_topics_v4_subcategory ON aio_post_taxonomy_v4(subcategory)')
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  await schemaPromise;
}
export function parseTopicV4(category,body={}){
  if(!Object.prototype.hasOwnProperty.call(SUBCATEGORIES,category))fail('Nieprawidłowy dział posta.');
  const subcategory=String(body.subcategory||'').trim();
  if(subcategory&&!SUBCATEGORIES[category].includes(subcategory))fail('Nieprawidłowa podkategoria.');
  let brand=String(body.deviceBrand||'').trim();
  let model=String(body.deviceModel||'').trim();
  if(category!=='backupy'&&category!=='systemy'){brand='';model='';}
  if(brand&&!Object.prototype.hasOwnProperty.call(MODELS,brand))fail('Nieprawidłowa marka tunera.');
  if(model&&(!brand||!MODELS[brand].includes(model)))fail('Nieprawidłowy model tunera.');
  let listing=String(body.listingStatus||'').trim();
  if(category==='gielda'){
    if(!listing)listing='dostepne';
    if(!STATUSES.includes(listing))fail('Nieprawidłowy status ogłoszenia.');
  }else listing='';
  return {subcategory,brand,model,listing};
}
export function topicWriteV4(db,postId,category,body){
  const t=parseTopicV4(category,body);
  return db.prepare(`INSERT INTO aio_post_taxonomy_v4(post_id,subcategory,brand,model,listing_status,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET
    subcategory=excluded.subcategory,brand=excluded.brand,model=excluded.model,
    listing_status=excluded.listing_status,updated_at=excluded.updated_at`)
    .bind(postId,t.subcategory,t.brand,t.model,t.listing,new Date().toISOString());
}
export function validTopicFilterV4(category,key,value){
  if(!value)return '';
  if(key==='subcategory')return SUBCATEGORIES[category]?.includes(value)?value:null;
  if(key==='brand')return (category==='backupy'||category==='systemy')&&Object.hasOwn(MODELS,value)?value:null;
  if(key==='model')return (category==='backupy'||category==='systemy')&&Object.values(MODELS).some(a=>a.includes(value))?value:null;
  if(key==='listingStatus')return category==='gielda'&&STATUSES.includes(value)?value:null;
  return null;
}
