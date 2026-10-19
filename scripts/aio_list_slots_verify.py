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
    check('const MAX_ACTIVE_LISTS = 3;' in api,'3 active slots per user')
    check('satellite_slot' in api and 'NOT EXISTS(SELECT 1 FROM aio_list_submissions WHERE user_id=? AND update_of IS NULL AND (satellite_slot=?' in api,'atomic collision guard in D1')
    check('trusted_publisher:await isTrusted' in api and "if(manual)await db.prepare" in api,'permanent approval after manual publish')
    check("if(String(form.get('update_of')||'').trim()) throw httpError(409" in api and 'Zgłoś aktualizację' not in u,'old update flow disabled; remove old list first')
    check("if(action==='retry_own')" in api and "status='publish_failed'" in api,'safe author retry on GitHub failure')
    check('satellites,satellite_slot' in val and 'orbitalFromService(line)' in val,'server ZIP orbital validation')
    check('name="satellite_slot" required' in h and 'trusted_publisher' in u,'satellite selector and approval status in UI')
    check('Object.hasOwn(SLOT_LABELS,declaredSlot)' in api,'user cannot invent new satellite categories')
    # D1 INSERT logic tested in real SQLite with simulated accounts and statuses.
    match=re.search(r"const result=await db.prepare\(`(INSERT INTO aio_list_submissions.*?\))`\)\s*\.bind\(",api,re.S)
    check(bool(match),'atomic insert SQL is extractable')
    sql=match.group(1)
    conn=sqlite3.connect(':memory:');conn.row_factory=sqlite3.Row
    conn.execute('CREATE TABLE aio_list_submissions(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,description TEXT,version TEXT,file_name TEXT,r2_key TEXT,file_size INTEGER,zip_sha256 TEXT,report_json TEXT,status TEXT,created_at TEXT,update_of TEXT,satellite_slot TEXT)')
    day='2026-10-19';since='2026-09-19'
    n=0
    def insert(user,slot,name=None,hashval=None,date=day):
        nonlocal n
        n+=1
        params=(str(n),user,name or (slot+' list'), 'Opis testowy',date,'test.zip','temp/'+str(n),1234,
                hashval or ('hash-'+str(n)),'{}',date+'T10:00:00Z',slot,
                user,date,3,user,user,3,user,since,30,user,slot,user,name or slot+' list',hashval or ('hash-'+str(n)),user)
        assert sql.count('?')==len(params), (sql.count('?'),len(params))
        cur=conn.execute(sql,params)
        conn.commit()
        return cur.rowcount
    check(insert('u1','hb13')==1,'single 13E accepted')
    check(insert('u1','dual')==1,'dual accepted')
    check(insert('u1','multi')==1,'multi accepted')
    check(insert('u1','dual')==0,'duplicate satellite slot rejected')
    check(insert('u2','hb13')==1,'separate user can publish own 13E')
    # Existing orphaned slots are blocked conservatively.
    conn.execute("INSERT INTO aio_list_submissions (id,user_id,name,status,created_at,update_of,satellite_slot) VALUES ('legacy','legacy_user','Unclassified old list','published','2026-10-10T00:00:00Z',NULL,'')")
    check(insert('legacy_user','hb13')==0,'legacy unclassified live list blocks new uploads')
    # Removing current list frees slot, but 3-per-day quota still applies.
    conn.execute("UPDATE aio_list_submissions SET status='removed' WHERE user_id='u1' AND satellite_slot='dual'")
    conn.execute("UPDATE aio_list_submissions SET created_at='2026-10-18T10:00:00Z' WHERE user_id='u1'")
    check(insert('u1','dual',date=day)==1,'removal permits replacement after daily quota permits it')
    conn.execute("INSERT INTO aio_list_submissions (id,user_id,name,status,created_at,update_of,satellite_slot) VALUES ('blocked','u3','Old 13E','pending','2026-10-10T00:00:00Z',NULL,'hb13')")
    check(insert('u3','hb13')==0,'pending submission occupies satellite slot')
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
