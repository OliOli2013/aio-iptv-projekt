#!/usr/bin/env python3
"""Conservative, reversible HTML <img> PNG/JPG -> WebP optimizer.
Original images are never removed. Requires Pillow only for --apply.
No scripts, CSS backgrounds, social OG images, binaries or HTML in archiwum/ are changed.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parent.parent
IMG=re.compile(r'(<img\b[^>]*?\s)(src\s*=\s*)([\"\'])([^\"\']+)(\3)',re.I|re.S)
MIN=350*1024

def candidates():
 usages={}
 for html in ROOT.rglob('*.html'):
  rel=html.relative_to(ROOT)
  if 'archiwum' in rel.parts or '.git' in rel.parts:continue
  txt=html.read_text('utf-8',errors='replace')
  for match in IMG.finditer(txt):
   val=match.group(4);u=urlsplit(val)
   if u.scheme or u.netloc or not re.search(r'\.(png|jpg|jpeg)$',u.path,re.I):continue
   if '..' in Path(u.path).parts:continue
   file=(html.parent/u.path.lstrip('/')).resolve() if not val.startswith('/') else (ROOT/u.path.lstrip('/')).resolve()
   if not file.is_relative_to(ROOT.resolve()) or not file.is_file() or file.stat().st_size<MIN:continue
   usages.setdefault(file,set()).add(html)
 return usages

def img_write(source,target):
 from PIL import Image,ImageOps
 from io import BytesIO
 with Image.open(source) as im:
  im=ImageOps.exif_transpose(im)
  if im.mode not in ('RGB','RGBA'):im=im.convert('RGBA' if 'A' in im.getbands() or ('transparency' in im.info) else 'RGB')
  buffer=BytesIO()
  if im.mode=='RGBA':im.save(buffer,format='WEBP',lossless=True,method=6)
  else:im.save(buffer,format='WEBP',quality=85,method=6)
  content=buffer.getvalue()
 with Image.open(BytesIO(content)) as verify:verify.verify()
 if len(content)>=(source.stat().st_size*.77):return None
 target.write_bytes(content)
 return len(content)

def main():
 p=argparse.ArgumentParser();p.add_argument('--report',action='store_true');p.add_argument('--apply',action='store_true');p.add_argument('--max-images',type=int,default=16)
 a=p.parse_args();files=candidates()
 print('AIO MEDIA: duże, bezpośrednio używane obrazy PNG/JPEG:',len(files))
 for file,pages in sorted(files.items(),key=lambda x:-x[0].stat().st_size)[:25]:
  print(' -',file.relative_to(ROOT),'%.1f KB'%(file.stat().st_size/1024),f'(HTML: {len(pages)})')
 if not a.apply:
  print('PODGLĄD: nic nie zmieniono. Użyj --apply świadomie po wykonaniu backupu.')
  return 0
 if a.max_images<1 or a.max_images>100:raise RuntimeError('--max-images: 1..100')
 try:import PIL # noqa
 except ImportError:raise RuntimeError('Brak Pillow; zainstaluj python3-pil albo pip w venv (nie zmieniono plików).')
 selected=sorted(files,key=lambda x:-x.stat().st_size)[:a.max_images]
 backups={};created=[];changed={}
 out=ROOT.parent/('AIO_WEBP_BACKUP_'+datetime.now().strftime('%Y%m%d-%H%M%S'))
 out.mkdir(mode=0o700)
 try:
  for src in selected:
   dst=src.with_suffix('.webp')
   if dst.exists():continue
   size=img_write(src,dst)
   if size is None:
    dst.unlink(missing_ok=True);continue
   created.append(dst)
   for page in files[src]:
    txt=changed.get(page,page.read_text('utf-8'))
    def swap(m):
     u=urlsplit(m.group(4))
     full=(page.parent/u.path).resolve() if not u.path.startswith('/') else (ROOT/u.path.lstrip('/')).resolve()
     if full!=src:return m.group(0)
     newpath=u.path.rsplit('.',1)[0]+'.webp'
     suffix='?'+u.query if u.query else ''
     if u.fragment:suffix+='#'+u.fragment
     return m.group(1)+m.group(2)+m.group(3)+newpath+suffix+m.group(3)
    new=IMG.sub(swap,txt)
    if txt!=new:changed[page]=new
  for page,content in changed.items():
   name=page.relative_to(ROOT);backup=out/name;backup.parent.mkdir(parents=True,exist_ok=True)
   backup.write_bytes(page.read_bytes());backups[page]=backup
   page.write_text(content,encoding='utf-8')
  manifest={'created_webp':[str(f.relative_to(ROOT)) for f in created], 'changed_html':[str(f.relative_to(ROOT)) for f in changed]}
  (out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 except BaseException:
  for page,backup in backups.items():page.write_bytes(backup.read_bytes())
  for x in created:x.unlink(missing_ok=True)
  raise
 print('WebP wygenerowane:',len(created),'HTML zaktualizowane:',len(changed),'BACKUP:',out)
 print('Oryginalne PNG/JPEG zachowane. Sprawdź obrazy wizualnie przed Push.')
 return 0

if __name__=='__main__':
 try:sys.exit(main())
 except Exception as e:print('BŁĄD:',e,file=sys.stderr);sys.exit(1)
