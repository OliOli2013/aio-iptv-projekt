/* AIO Audit Fix V1 — isolated behavioral regressions, Node >=18.
   Uses actual function bodies from the repository. No network or database calls. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function testGuestOfficial(){
  const s=read('functions/api/community.js');
  const section=s.split('if (action === "feed")')[1].split('if (action === "post")')[0];
  const match=section.match(/if \(!user\) \{([\s\S]*?)\}\s*else if \(mode === "official"\)/);
  assert.ok(match,'Guest filter branch should be present');
  const fn=new Function('mode',`const where=[];${match[1]}\nreturn where;`);
  const official=fn('official').join(' ');
  assert.match(official,/p\.status='published'/);
  assert.match(official,/p\.kind='official'/);
  assert.doesNotMatch(fn('latest').join(' '),/kind='official'/);
  assert.match(fn('mine').join(' '),/1=0/);
}

async function testLatestResponseWins(){
  const s=read('assets/js/community-feed.js');
  const match=s.match(/  async function load\(reset\)\{[\s\S]*?\n  \}\n  function render\(\)\{/);
  assert.ok(match,'Community load function should be found');
  const source=match[0].replace(/\n  function render\(\)\{$/,'');
  const state={page:0,search:'',category:'',mode:'latest',loading:false,rows:[],pageSize:12,requestSeq:0,activeController:null};
  const feed={innerHTML:''},more={hidden:false};
  const q=key=>key==='[data-community-feed]'?feed:key==='[data-community-more]'?more:null;
  const pending=[];
  const AIOCommunity={apiGet:(type,params,options)=>new Promise((resolve,reject)=>pending.push({type,params,options,resolve,reject})),escape:x=>x,friendlyError:x=>String(x)};
  let renders=0;
  const load=new Function('state','q','AIOCommunity','render','AbortController',`return (${source});`)(state,q,AIOCommunity,()=>renders++,AbortController);

  // The user switches category while the previous backend request is still running.
  const first=load(true);
  assert.equal(pending.length,1);
  state.category='wtyczki';
  const second=load(true);
  assert.equal(pending.length,2,'second query should start immediately');
  assert.equal(pending[0].options.signal.aborted,true,'previous request must be aborted');
  pending[1].resolve({rows:[{id:'newer'}],hasMore:false});
  await second;
  pending[0].resolve({rows:[{id:'older'}],hasMore:true});
  await first;
  assert.equal(state.rows[0].id,'newer','stale result must not overwrite latest');
  assert.equal(state.loading,false);
  assert.equal(state.page,0);
  assert.equal(renders,1,'only the latest result may render');
  assert.equal(more.hidden,true);

  // Paging must not duplicate the same page when users click "more" twice.
  const third=load(true);
  pending[2].resolve({rows:[{id:'one'}],hasMore:true});
  await third;
  assert.equal(state.page,1);
  const fourth=load(false);
  await load(false); // same page is in flight => ignored
  assert.equal(pending.length,4);
  pending[3].resolve({rows:[{id:'two'}],hasMore:false});
  await fourth;
  assert.deepEqual(state.rows.map(x=>x.id),['one','two']);
}

(async()=>{
  testGuestOfficial();
  await testLatestResponseWins();
  console.log('AIO AUDIT FIX V1: test trybu oficjalnego i wyścigów wyszukiwania: OK.');
})().catch(err=>{console.error(err);process.exitCode=1;});
