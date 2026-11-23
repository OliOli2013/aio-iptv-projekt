"""Non-publication metadata only; never infer a trusted file hash from a remote object."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re

NAME = 'integrity/aio-protected-downloads-v1.json'
IMAGE = {'.png','.jpg','.jpeg','.webp','.gif','.svg','.avif'}
DEB = 'pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.deb'
def public_checksum(name):
    return bool(re.fullmatch(r'SHA256SUMS[-.\w]*\.txt',name,re.I))

def private_key(key):
    if not isinstance(key,str) or not key.startswith('pliki/') or len(key)>500 or any(c in key for c in '\\%?#') or any(ord(c)<32 or ord(c)==127 for c in key):
        return False
    if any(p in ('','.','..') or p.startswith('.') for p in key.split('/')) or PurePosixPath(key).suffix.lower() in IMAGE:
        return False
    pkg=re.fullmatch(r'pliki/enigma2-plugin-extensions-panelaio_([0-9][0-9A-Za-z.+-]*)_all\.ipk',key,re.I)
    return not (pkg and not re.search('hds|satelit|test|beta|rc',pkg[1],re.I))

def path_for(key):
    return ('assets/releases/'+PurePosixPath(key).name) if key==DEB else key

def sha_file(path):
    h=hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda:fh.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()

def inventory(root):
    f=Path(root)/NAME
    if not f.exists():
        return {}
    d=json.loads(f.read_text('utf-8'))
    if f.is_symlink() or not isinstance(d,dict) or d.get('schema')!=1 or not isinstance(d.get('objects'),list):
        raise ValueError('Niepoprawny manifest prywatnych plików.')
    out={}
    for v in d['objects']:
        if not isinstance(v,dict):
            raise ValueError('Niepoprawny wpis manifestu.')
        k=v.get('key')
        if not private_key(k) or k in out or not re.fullmatch(r'[a-f0-9]{64}',str(v.get('sha256',''))) or type(v.get('size')) is not int or v['size']<1:
            raise ValueError('Niepoprawny klucz, rozmiar lub suma w manifeście.')
        out[k]=v
    return out
