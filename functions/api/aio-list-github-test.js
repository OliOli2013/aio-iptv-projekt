/* AIO Listy — test publikacji GitHub na tymczasowej gałęzi (nie dotyka main). */
import {json, requireAdmin, errorResponse} from '../_community.js';

const REPO = 'OliOli2013/PanelAIO-Lists';
const API = `https://api.github.com/repos/${REPO}`;
const ZIP_FIXTURE_B64 = 'UEsDBBQAAAAIAD2gT137pOGXPAAAAEQAAAAGAAAAbGFtZWRiS3UJc1IoTi0qy0xOLVbQN9HnKilKzCsuyM9LSS0q5krNS+GCyYI5HollqQqJCjn5JQr5aQpJpenFilwAUEsDBBQAAAAIAD2gT12JrL2TXgAAAHEAAAALAAAAYm91cXVldHMudHZT9nP0dVVwyi8tLE0tKVbQCAnT5FIOdg0K83R2VTC0MrcytDJAgW5B/r4KTv6hgaGuIQpKpcWpRUkQzXqJmfnxefl5BUX5KfElqcUleiVlSgr+QS6uQQpOkQpQVVwAUEsDBBQAAAAIAD2gT12PrPooZwAAAHQAAAAfAAAAdXNlcmJvdXF1ZXQuYWlvX25vbnByb2RfdGVzdC50dlP2c/R1VQhxDQ4BEs4efp7OUX6RChp+nq4Knn7BIY4+/uGOR9o0uZSDXYPCPJ1dFQytzEysDNAgl7KLa7BzkGdAiKe/n0JIvkJeZqpCVmpxiUJ2Yl7i0SaFktSc1PLMqsqsvEo9LgBQSwECFAMUAAAACAA9oE9d+6ThlzwAAABEAAAABgAAAAAAAAAAAAAAgAEAAAAAbGFtZWRiUEsBAhQDFAAAAAgAPaBPXYmsvZNeAAAAcQAAAAsAAAAAAAAAAAAAAIABYAAAAGJvdXF1ZXRzLnR2UEsBAhQDFAAAAAgAPaBPXY+s+ihnAAAAdAAAAB8AAAAAAAAAAAAAAIAB5wAAAHVzZXJib3VxdWV0LmFpb19ub25wcm9kX3Rlc3QudHZQSwUGAAAAAAMAAwC6AAAAiwEAAAAA';
const isSha = s => /^[a-f0-9]{40}$/i.test(s || '');

function sameOrigin(req) {
  const origin = req.headers.get('Origin');
  if (origin && origin !== new URL(req.url).origin) return false;
  return req.headers.get('Sec-Fetch-Site') !== 'cross-site';
}
function plainBase64(text) {
  const bytes = new TextEncoder().encode(text), chunks=[];
  for (let i=0;i<bytes.length;i+=32768)
    chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return btoa(chunks.join(''));
}
function decodedJson(content) {
  const data = Uint8Array.from(atob((content || '').replace(/\s/g,'')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(data));
}
function assert(condition, detail) {
  if (!condition) throw new Error(detail);
}
async function github(env, method, path, body, stage) {
  const headers = {
    'Accept':'application/vnd.github+json',
    'Authorization':`Bearer ${env.AIO_LISTS_GITHUB_TOKEN}`,
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'AIO-Lists-Safe-Test/1.2'
  };
  if (body !== undefined) headers['Content-Type']='application/json';
  const response=await fetch(`${API}${path}`,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'
  });
  if (!response.ok) throw new Error(`${stage}: GitHub HTTP ${response.status}. Sprawdź uprawnienie Contents (Read and write) i dostęp tokenu do PanelAIO-Lists.`);
  return response.status === 204 ? {} : await response.json();
}

export async function onRequestPost({request,env}) {
  if (!sameOrigin(request)) return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try { await requireAdmin(request,env,true); }
  catch(e) { return errorResponse(e); }
  if (!env.AIO_LISTS_GITHUB_TOKEN)
    return json({ok:false,error:'Brak sekretu AIO_LISTS_GITHUB_TOKEN w środowisku Production.'},503);

  const branch = 'aio-list-test-' + crypto.randomUUID().replace(/-/g,'');
  const path = `archives/Community_TEST_${branch.slice(-16)}.zip`;
  let created=false, failed='', cleanupError='', mainChanged=false;
  try {
    const origin=await github(env,'GET','/git/ref/heads/main',undefined,'Odczyt gałęzi main');
    const parent=origin.object?.sha;
    assert(isSha(parent),'GitHub nie zwrócił prawidłowego SHA main.');
    const [commit,manifestFile]=await Promise.all([
      github(env,'GET',`/git/commits/${parent}`,undefined,'Odczyt commita'),
      github(env,'GET','/contents/manifest.json?ref=main',undefined,'Odczyt manifestu')
    ]);
    assert(isSha(commit.tree?.sha),'GitHub nie zwrócił drzewa commita.');
    const current=decodedJson(manifestFile.content);
    assert(Array.isArray(current),'manifest.json w repozytorium nie jest tablicą.');
    // Gałąź jest odrębna od main. AIO Panel korzysta wyłącznie z main.
    await github(env,'POST','/git/refs',{ref:`refs/heads/${branch}`,sha:parent},'Utworzenie gałęzi testowej');
    created=true;
    const zip=await github(env,'POST','/git/blobs',{content:ZIP_FIXTURE_B64,encoding:'base64'},'Zapis testowego ZIP');
    assert(isSha(zip.sha),'Nie uzyskano identyfikatora archiwum.');
    const testId='community_safe_test_'+branch.slice(-16);
    const testEntry={
      id:testId,
      name:'AIO TEST TECHNICZNY — GAŁĄŹ TYMCZASOWA',
      author:'AIO / test automatyczny',
      version:new Date().toISOString().slice(0,10),
      description:'Test uprawnień zapisu. Nie publikować ani nie instalować.',
      url:`https://raw.githubusercontent.com/${REPO}/${branch}/${path}`
    };
    const tree=await github(env,'POST','/git/trees',{
      base_tree:commit.tree.sha,
      tree:[
        {path:'manifest.json',mode:'100644',type:'blob',content:JSON.stringify([...current,testEntry],null,2)+'\n'},
        {path,mode:'100644',type:'blob',sha:zip.sha}
      ]
    },'Zapis testowego drzewa');
    assert(isSha(tree.sha),'Nie uzyskano identyfikatora drzewa testowego.');
    const testCommit=await github(env,'POST','/git/commits',{
      message:'AIO: temporary GitHub publishing test — delete branch after verification',
      tree:tree.sha,parents:[parent]
    },'Utworzenie commita testowego');
    assert(isSha(testCommit.sha),'Nie uzyskano identyfikatora commita testowego.');
    await github(env,'PATCH',`/git/refs/heads/${branch}`,{sha:testCommit.sha,force:false},'Aktualizacja gałęzi testowej');
    const [savedManifest,savedZip,mainAfter]=await Promise.all([
      github(env,'GET',`/contents/manifest.json?ref=${branch}`,undefined,'Weryfikacja manifestu'),
      github(env,'GET',`/contents/${path}?ref=${branch}`,undefined,'Weryfikacja ZIP'),
      github(env,'GET','/git/ref/heads/main',undefined,'Kontrola gałęzi main')
    ]);
    assert(decodedJson(savedManifest.content).some(item=>item?.id===testId),
      'Testowy manifest nie zawiera wpisu — test przerwany.');
    assert(savedZip.sha===zip.sha,'Zapisany ZIP ma inny identyfikator niż oczekiwany.');
    // main może ulec zmianie równolegle wskutek innych commitów, ale nasz test nigdy go nie zapisuje.
    mainChanged=mainAfter.object?.sha!==parent;
  } catch (e) {
    failed=String(e?.message||'Błąd podczas testu').slice(0,500);
  } finally {
    if(created) {
      try {await github(env,'DELETE',`/git/refs/heads/${branch}`,undefined,'Usunięcie gałęzi testowej');}
      catch(e){cleanupError=String(e?.message||'Błąd usuwania gałęzi').slice(0,400);}
    }
  }
  if (failed||cleanupError) {
    return json({ok:false,error:failed||'Test techniczny przeszedł, ale automatyczne czyszczenie nie powiodło się.',
      cleanup_ok:created&&!cleanupError,
      cleanup_error:cleanupError||null,
      remaining_branch:cleanupError?branch:null,
      main_untouched_by_test:true},502);
  }
  return json({ok:true,message:'Test publikacji GitHub zakończony powodzeniem. ZIP i manifest zapisano i odczytano na gałęzi testowej; gałąź usunięto.',
    cleanup_ok:true,main_untouched_by_test:true,
    concurrent_main_update:mainChanged});
}
