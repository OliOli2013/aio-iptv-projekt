#!/usr/bin/env node
/* AIO Topics V4 — offline contract tests, no production D1/R2 requests. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]||'.');
const get=p=>readFileSync(resolve(root,p),'utf8');
const module=await import('data:text/javascript;base64,'+Buffer.from(get('functions/_aio_post_taxonomy_v4.js')).toString('base64'));
const config=JSON.parse(get('data/community_config.json'));
let checks=0;
function check(name,fn){fn();console.log('OK '+(++checks)+': '+name)}
check('Nowe działy i dotychczasowe kategorie zachowane',()=>{
  const ids=new Set(config.categories.map(x=>x.id));
  for(const id of ['pomoc','wtyczki','systemy','backupy','porady','gielda','inne'])assert.ok(ids.has(id),id);
});
check('Definicje kategorii i podkategorii zgodne z API',()=>{
  for(const [cat,subs] of Object.entries(config.topicHierarchy.subcategories)){
    for(const s of subs)assert.equal(module.parseTopicV4(cat,{subcategory:s.id}).subcategory,s.id);
  }
});
check('Model należy do wybranej marki, nie do dowolnej marki',()=>{
  assert.equal(module.parseTopicV4('backupy',{deviceBrand:'zgemma',deviceModel:'H7S'}).model,'H7S');
  assert.throws(()=>module.parseTopicV4('backupy',{deviceBrand:'octagon',deviceModel:'H7S'}));
  assert.equal(module.parseTopicV4('wtyczki',{deviceBrand:'zgemma',deviceModel:'H7S'}).brand,'');
});
check('Dział ogłoszeń wymaga legalnego statusu',()=>{
  assert.equal(module.parseTopicV4('gielda',{}).listing,'dostepne');
  assert.throws(()=>module.parseTopicV4('gielda',{listingStatus:'rozdane-za-darmo-scam'}));
  assert.equal(module.parseTopicV4('porady',{listingStatus:'sprzedane'}).listing,'');
});
check('Nieprawidłowe podkategorie i marki są odrzucane',()=>{
  assert.throws(()=>module.parseTopicV4('wtyczki',{subcategory:'admin'}));
  assert.throws(()=>module.parseTopicV4('backupy',{deviceBrand:'unknown'}));
  assert.equal(module.validTopicFilterV4('backupy','brand','zgemma'),'zgemma');
  assert.equal(module.validTopicFilterV4('gielda','brand','zgemma'),null);
});
check('Feed ma filtry serwerowe, a edycja i tworzenie zapisują klasyfikację atomowo',()=>{
  const api=get('functions/api/community.js'),edit=get('functions/api/community-edit.js');
  for(const s of ['topicWriteV4(db,id','t.${column}=?','topic_counts','aio_post_taxonomy_v4'])assert.ok(api.includes(s),s);
  assert.match(api,/await db\.batch\(\[db\.prepare\(`/);
  assert.match(edit,/await env\.COMMUNITY_DB\.batch\(/);
  assert.match(edit,/topicWriteV4\(env\.COMMUNITY_DB/);
});
check('Pola w publikacji i edycji, bez zmiany archiwalnych identyfikatorów',()=>{
  for(const path of ['assets/js/community-feed.js','assets/js/community-post.js','assets/js/community-admin.js'])
    assert.ok(get(path).includes('AIOTopicsV4'),path);
  assert.ok(get('community.html').includes('aio-community-topics-v4.js'));
  assert.ok(get('post.html').includes('aio-community-topics-v4.js'));
});
check('Statystyka działów liczy wyłącznie opublikowane wpisy',()=>{
  assert.match(get('functions/api/community.js'),/WHERE status='published' GROUP BY category/);
});
console.log(`PASS: AIO Topics V4 — ${checks} kontroli zakończonych.`);
