#!/usr/bin/env python3
"""AIO List Slots V1: static guards, SQL conflict checks and real ZIP validation.
No network or production D1/R2 access. Test files are generated in a temp directory.
"""
from pathlib import Path
import re,sqlite3,subprocess,sys,tempfile,zipfile,json,shutil
ROOT=Path(__file__).resolve().parents[1]
API=ROOT/'functions/api/list-submissions.js'
VALIDATOR=ROOT/'functions/_aio_list_validation.js'
SLOTS=ROOT/'functions/_aio_list_slots.js'
UI=ROOT/'assets/js/aio-list-upload.js'
HTML=ROOT/'aio-list-upload.html'
def check(ok,why):
    if not ok:raise AssertionError(why)
    print('OK:',why)

def main():
    api=API.read_text('utf-8');val=VALIDATOR.read_text('utf-8');u=UI.read_text('utf-8');h=HTML.read_text('utf-8')
    check('const MAX_ACTIVE_LISTS = 3;' in api,'3 active slots per account')
    check('source_type' in api and 'manifest_url' in api,'additive migration for historical lists')
    check("if(action==='assign_legacy') return assignHistorical" in api and 'requireAdmin(request,env,true)' in api,'only site owner can link legacy lists to e-mail account')
    check('SELECT user_id FROM community_auth WHERE lower(email)=?' in api,'server-side matching of registered e-mail')
    check('const base=updateOf?await' in api and "id=? AND user_id=? AND update_of IS NULL AND status='published'" in api,'ownership enforced server-side for updates')
    check("if(action==='edit_details_own') return editOwnDetails" in api,'metadata-only editing supported')
    check("if(action==='delete_own') return removeOwn" in api and 'managedPath(row)' in api,'self-service removal with ownership guard')
    check('snap.arr.filter(x=>x?.id===manifestId).length!==1' in api,'rejection of duplicated manifest IDs')
    check("(others||row.source_type==='legacy')?null:row.archive_path" in api,'historical ZIPs kept when entries removed')
    check('source_type' in api and 'NOT EXISTS' in api,'atomic conflict guards')
    check('name="satellite_slot" required' in h and 'account_email' in u,'session account e-mail and satellite slot in UI')
    check('beginUpdate(item)' in u and 'editDetailsOwn(item)' in u,'update ZIP and metadata buttons')
    check('trusted_publisher:session.user.is_owner===true || await isTrusted' in api and "if(manual)await db.prepare" in api,'trusted publisher approval retained')
    check('satellites,satellite_slot' in val and 'orbitalFromService(line)' in val,'server ZIP validation retained')
    # Real SQLite check of the exact INSERT...SELECT generated for both modes.
    common=re.search(r'const common=`(INSERT INTO aio_list_submissions.*?)`;',api,re.S)
    check(bool(common),'shared SQL INSERT is extractable')
    rest=api[common.end():]
    matches=[' WHERE'+m.group(1) for m in re.finditer(r'result=await db.prepare\(`\$\{common\} WHERE(.*?)`\)',rest,re.S)]
    check(len(matches)==4,'four owner and regular SQL guards are extractable')
    owner_update_sql=common.group(1)+matches[0];update_sql=common.group(1)+matches[1]
    owner_new_sql=common.group(1)+matches[2];new_sql=common.group(1)+matches[3]
    con=sqlite3.connect(':memory:')
    con.execute('''CREATE TABLE aio_list_submissions (id TEXT PRIMARY KEY,user_id TEXT,name TEXT,description TEXT,version TEXT,
      file_name TEXT,r2_key TEXT,file_size INTEGER,zip_sha256 TEXT,report_json TEXT,status TEXT,created_at TEXT,
      update_of TEXT,satellite_slot TEXT,source_type TEXT DEFAULT 'community',manifest_url TEXT,manifest_id TEXT)''')
    day='2026-10-19';since='2026-09-19T00:00:00Z';i=0
    def insert(user,slot,base=None):
      nonlocal i
      i+=1
      name=f'Lista {user} {slot}';hashv=f'hash-{i}';common_args=[str(i),user,name,'Opis listy testowej',day,'new.zip','tmp',1234,hashv,'{}',day+'T12:00:00Z',base,slot]
      if base:
        params=common_args+[user,day,3,user,since,30,base,base,user]
        sql=update_sql
      else:
        params=common_args+[user,day,3,user,user,3,user,since,30,user,slot,user,name,hashv,user]
        sql=new_sql
      assert sql.count('?')==len(params),(sql.count('?'),len(params),sql)
      cur=con.execute(sql,params);con.commit();return cur.rowcount,str(i)
    ok,base=insert('owner','hb13');check(ok==1,'new 13E list accepted')
    con.execute("UPDATE aio_list_submissions SET status='published' WHERE id=?",(base,))
    ok,newid=insert('owner','hb13');check(ok==0,'second NEW list in occupied slot is blocked')
    ok,updateid=insert('owner','hb13',base);check(ok==1,'existing published list updated without deleting base')
    ok,_=insert('owner','hb13',base);check(ok==0,'concurrent update of same base is blocked')
    ok,_=insert('stranger','hb13',base);check(ok==0,'another account cannot update a foreign list')
    con.execute("UPDATE aio_list_submissions SET status='applied' WHERE id=?",(updateid,))
    ok,third=insert('owner','hb13',base);check(ok==1,'third ZIP submission today accepted')
    con.execute("UPDATE aio_list_submissions SET status='applied' WHERE id=?",(third,))
    ok,_=insert('owner','hb13',base);check(ok==0,'daily quota remains in effect for ZIP updates')
    # Owner's server-verified exemption: no daily, monthly, pending, or slot quotas.
    # Same-name/cross-account duplicates and concurrent update protection remain.
    owner_id='site_owner_test'
    def owner_insert(base_id=None, forced_name=None, forced_hash=None):
      nonlocal i
      i+=1
      name=forced_name or ('Owner unlimited list '+str(i))
      digest=forced_hash or ('owner-zip-'+str(i))
      values=[str(i),owner_id,name,'Opis listy testowej',day,'owner.zip','tmp',1234,digest,'{}',day+'T12:00:00Z',base_id,'hb13']
      if base_id:
        sql=owner_update_sql;args=values+[base_id,base_id,owner_id]
      else:
        sql=owner_new_sql;args=values+[owner_id,name,digest,owner_id]
      check(sql.count('?')==len(args),'owner SQL bind parameters match')
      ret=con.execute(sql,args);con.commit();return ret.rowcount,str(i),name
    entries=[owner_insert() for _ in range(32)]
    check(all(row[0]==1 for row in entries),'owner may create 32 lists in one category, beyond all quotas')
    check(owner_insert(forced_name=entries[0][2])[0]==0,'owner duplicate list name is rejected')
    check(owner_insert(forced_hash='hash-1')[0]==0,'owner cannot reuse another account archived ZIP')
    con.execute("UPDATE aio_list_submissions SET status='published' WHERE id=?",(entries[0][1],))
    check(owner_insert(base_id=entries[0][1])[0]==1,'owner can update after daily and monthly quotas')
    check(owner_insert(base_id=entries[0][1])[0]==0,'owner cannot concurrently update same list')
    # Historical linking is an INSERT...SELECT tied to an authenticated account ID.
    section=api[api.index('async function assignHistorical'):api.index('async function editOwnDetails')]
    sql_match=re.search(r'const result=await db.prepare\(`(INSERT INTO aio_list_submissions.*?)`\)',section,re.S)
    check(bool(sql_match),'legacy assignment statement extractable')
    legacy_sql=sql_match.group(1)
    con.execute('ALTER TABLE aio_list_submissions ADD COLUMN published_at TEXT')
    con.execute('ALTER TABLE aio_list_submissions ADD COLUMN archive_path TEXT')
    params=['historical1','legacy_owner','M@rio 13E','Historyczna lista','2026-08-23','mario.zip',day+'T11:00:00Z',day+'T11:00:00Z','mario_13E','archives/mario.zip','hb13','https://raw.githubusercontent.com/OliOli2013/PanelAIO-Lists/main/archives/mario.zip','mario_13E']
    check(legacy_sql.count('?')==len(params),'historical SQL parameters match safely')
    check(con.execute(legacy_sql,params).rowcount==1,'legacy list assigned to existing account ID')
    params[0]='historical2'
    check(con.execute(legacy_sql,params).rowcount==0,'duplicate historical claim blocked')
    check('Object.hasOwn(SLOT_LABELS,declaredSlot)' in api,'satellite values validated')
    # check JS parsing and concrete ZIPs built with regular zipfile (no user files modified)
    for f in [API,VALIDATOR,SLOTS,UI]:
        subprocess.run(['node','--check',str(f)],check=True,capture_output=True)
    check(True,'all four JavaScript files parse')
    with tempfile.TemporaryDirectory(prefix='aio-slots-') as tmp:
        folder=Path(tmp)
        base={'lamedb':'eDVB services /4/\ntransponders\nend\nservices\nend\n',
              'bouquets.tv':'#NAME User - bouquets (TV)\n#SERVICE 1:7:1:0:0:0:0:0:0:0:FROM BOUQUET "userbouquet.test.tv" ORDER BY bouquet\n'}
        # Test the real validator as ESM without Node's --experimental-default-type=module.
        # Cloudflare Pages natively understands .js ESM; older Node versions do not.
        # Testing copies are therefore written with the .mjs extension, with one local
        # import adjusted to point to the sibling test-only .mjs file.
        slot_source=SLOTS.read_text(encoding='utf-8')
        validator_source=VALIDATOR.read_text(encoding='utf-8')
        old_import="from './_aio_list_slots.js';"
        check(validator_source.count(old_import)==1,'ES module validator has expected relative import')
        (folder/'_aio_list_slots.mjs').write_text(slot_source,encoding='utf-8')
        (folder/'_aio_list_validation.mjs').write_text(
            validator_source.replace(old_import,"from './_aio_list_slots.mjs';"),encoding='utf-8')
        cases=[('single',[130]),('dual',[130,192]),('multi',[130,192,160]),('unknown',[192])]
        base={'lamedb':'eDVB services /4/\ntransponders\nend\nservices\nend\n',
              'bouquets.tv':'#NAME User - bouquets (TV)\n#SERVICE 1:7:1:0:0:0:0:0:0:0:FROM BOUQUET "userbouquet.test.tv" ORDER BY bouquet\n'}
        for compression,suffix in [(zipfile.ZIP_STORED,'store'),(zipfile.ZIP_DEFLATED,'deflate')]:
            for name,orbs in cases:
                payload='#NAME Test\n'+''.join(f'#SERVICE 1:0:1:1:1:1:{orb<<16:X}:0:0:0:\n' for orb in orbs)
                f=folder/(name+'_'+suffix+'.zip')
                with zipfile.ZipFile(f,'w',compression=compression) as z:
                    for path,txt in {**base,'userbouquet.test.tv':payload}.items():z.writestr(path,txt)
                with zipfile.ZipFile(f) as z:
                    check(z.testzip() is None,'Python ZIP CRC '+suffix+'/'+name)
        runner=folder/'test.mjs'
        runner.write_text('''import fs from 'fs';
import {validateAioZip} from './_aio_list_validation.mjs';
const expected={single:'hb13',dual:'dual',multi:'multi',unknown:null};
const shouldTestDeflate=() => {
  if(process.env.AIO_TEST_DISABLE_NODE_DEFLATE === '1')return false;
  if(typeof Blob !== 'function' || typeof DecompressionStream !== 'function')return false;
  try {new DecompressionStream('deflate-raw');return true;}catch(_){return false;}
};
async function check(name,suffix,slot){
 const b=fs.readFileSync('./'+name+'_'+suffix+'.zip');
 const res=await validateAioZip(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 if(!res.ok || res.satellite_slot!==slot)throw Error(name+'/'+suffix+' expected '+slot+' got '+JSON.stringify(res));
 console.log('ZIP validated:',name+'/'+suffix,res.satellites,res.satellite_slot);
}
(async function(){
 for(const [name,slot] of Object.entries(expected))await check(name,'store',slot);
 if(shouldTestDeflate()){
   for(const [name,slot] of Object.entries(expected))await check(name,'deflate',slot);
 }else console.log('INFO: Node does not support DecompressionStream(deflate-raw), Python validated DEFLATE CRC; STORE-tested orbital logic.');
})().catch(e=>{console.error(e);process.exitCode=1;});
''',encoding='utf-8')
        # cwd is set to the fixture directory so static imports and file names work.
        p=subprocess.run(['node',str(runner)],cwd=folder,capture_output=True,text=True)
        check(p.returncode==0,'ZIP structure and satellite classifications'+('\n'+p.stderr if p.returncode else ''))
    print('AIO LIST SLOTS V1: testy OK')

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('AIO LIST SLOTS V1: BŁĄD:',e,file=sys.stderr)
        raise
