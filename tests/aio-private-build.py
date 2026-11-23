"""Synthetic, offline tests. Never read credentials or connect to Cloudflare."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SRC=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(SRC/'scripts'))
import aio_pages_public_build_v1 as build
import aio_pages_public_verify_v1 as verify
import aio_r2_repair_catalog_v1 as r2
import aio_private_manifest as manifest
import aio_public_payload_guard as guard
import aio_catalog_v1 as catalog
import aio_integrity_audit as integrity

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        for name in ['functions/_middleware.js','functions/pliki/[[path]].js','functions/api/community-auth.js',
                     'index.html','community.html','community-admin.html','konto.html','downloads.html',
                     '_headers','_redirects','assets/js/demo.js','.well-known/security.txt','pliki/logo.png',
                     'assets/releases/SHA256SUMS-18.2.1.txt','assets/releases/notes.txt','pliki/old/archive.zip',
                     'pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.ipk',manifest.path_for(manifest.DEB)]:
            self.put(name,b'test-content')
        self.put('_routes.json',json.dumps({'include':['/*'],'exclude':['/assets/*']}).encode())
        self.digest=hashlib.sha256(b'test-content').hexdigest()
        self.put('data/downloads.json',json.dumps([{'href':manifest.DEB,'sha256':self.digest}]).encode())
    def put(self,path,body):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
    def run_check(self,args,result='OK'):
        with patch.object(r2,'ROOT',self.root),patch.object(r2,'wrangler_command',return_value=['fixture']), \
             patch.object(r2,'check_one',return_value=result) as check,patch.object(r2,'run_wrangler',side_effect=AssertionError('No remote write')), \
             patch.object(sys,'argv',['fixture','--check','--all-private','--bucket','preview-fixture',*args]), \
             contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            return r2.main(),[call.args[1] for call in check.call_args_list]
    def test_build_filters_private_bytes_and_keeps_images_and_checksums(self):
        with patch.object(build,'ROOT',self.root),patch.object(build,'DEST',self.root/'dist'),patch.object(verify,'PUBLIC',self.root/'dist'):
            build.build();verify.check()
            for path in ('pliki/logo.png','assets/releases/SHA256SUMS-18.2.1.txt'):
                self.assertTrue((self.root/'dist'/path).is_file())
            for path in ('pliki/old/archive.zip',manifest.path_for(manifest.DEB),'assets/releases/notes.txt'):
                self.assertFalse((self.root/'dist'/path).exists())
            self.put('dist/assets/releases/unexpected.zip',b'fixture')
            with self.assertRaises(RuntimeError):verify.check()
    def test_routes_are_required(self):
        self.put('_routes.json',b'{"include":["/*"],"exclude":["/pliki/*"]}')
        with patch.object(build,'ROOT',self.root),self.assertRaises(RuntimeError):build.validate_routes()
    def test_integrity_audit_resolves_protected_deb_without_a_static_copy(self):
        with patch.object(integrity,'ROOT',self.root),patch.object(integrity,'_VERIFIED_PRIVATE',{}):
            self.assertIsNone(integrity.missing(self.root/'index.html','/'+manifest.DEB))
            self.assertIsNotNone(integrity.missing(self.root/'index.html','/pliki/unknown.deb'))
    def test_missing_or_inconsistent_files_stop_cutover(self):
        status,keys=self.run_check(['--save-inventory'],'MISSING')
        self.assertNotEqual(status,0);self.assertCountEqual(keys,[manifest.DEB,'pliki/old/archive.zip'])
        self.assertFalse((self.root/manifest.NAME).exists())
        self.put('data/downloads.json',json.dumps([{'href':manifest.DEB,'sha256':'a'*64}]).encode())
        status,keys=self.run_check(['--save-inventory'])
        self.assertNotEqual(status,0);self.assertNotIn(manifest.DEB,keys)
    def test_verified_manifest_survives_clean_clone(self):
        status,keys=self.run_check(['--save-inventory']);self.assertEqual(status,0)
        records=manifest.inventory(self.root);self.assertEqual(set(records),set(keys))
        (self.root/manifest.path_for(manifest.DEB)).unlink()
        (self.root/'pliki/old/archive.zip').unlink()
        self.assertEqual(self.run_check([])[0],0)
        with patch.object(catalog,'ROOT',self.root):
            self.assertEqual(catalog.valid_url(manifest.DEB,True,records),manifest.DEB)
            with self.assertRaises(ValueError):catalog.valid_url('pliki/nonexistent.zip',True,records)
    def test_portal_release_metadata_is_consistent(self):
        raw=json.loads((SRC/'data/downloads.json').read_text());gen=json.loads((SRC/'data/aio-catalog-v1.json').read_text())
        records=[r for r in raw if r.get('title','').startswith('AIO Panel 18.2.1 —')]
        self.assertEqual(len(records),2)
        for r in records:
            key=r['href'];entry=next(x for x in gen['files'] if x['href']==key)
            self.assertEqual(entry['release_id'],'legacy-'+hashlib.sha256(key.encode()).hexdigest()[:16])
            if r['kind']=='DEB':self.assertEqual((key,entry['access']),(manifest.DEB,'konto_AIO'))
            else:self.assertEqual(key,'/api/aio-panel-ipk')
    def test_guard_keeps_public_standard_ipk_only(self):
        self.assertTrue(guard.allowed('assets/releases/enigma2-plugin-extensions-panelaio_18.2.1_all.ipk'))
        self.assertFalse(guard.allowed(manifest.DEB));self.assertFalse(guard.allowed('pliki/new-source.zip'))
        self.assertFalse(manifest.private_key('pliki/../file.deb'))
        self.assertFalse(manifest.private_key('pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.ipk'))

if __name__=='__main__':unittest.main()
