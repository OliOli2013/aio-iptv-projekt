"""Print a reviewable opt-in Git plan. Does not change Git, disk, R2 or Cloudflare."""
import subprocess
import shlex
from pathlib import Path
from aio_private_manifest import inventory,path_for,sha_file,NAME

def plan(root):
    known=inventory(root)
    if not known:
        raise ValueError('Brak zweryfikowanego manifestu. Najpierw pełny --check --all-private --save-inventory.')
    raw=subprocess.check_output(['git','ls-files','-z','--','pliki','assets/releases'],cwd=root)
    tracked=set(raw.decode('utf8').split('\0'));result=[]
    for key,record in known.items():
        rel=path_for(key);file=root/rel
        if rel not in tracked:continue
        if file.is_symlink() or not file.is_file() or file.stat().st_size!=record['size'] or sha_file(file)!=record['sha256']:
            raise ValueError('Wersja lokalna nie odpowiada sprawdzonemu plikowi: '+rel)
        if subprocess.run(['git','diff','--quiet','HEAD','--',rel],cwd=root).returncode!=0:
            raise ValueError('Nieczyste zmiany w pliku: '+rel)
        result.append(rel)
    return sorted(result)

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    try: paths=plan(root)
    except (ValueError,OSError,subprocess.SubprocessError) as e:raise SystemExit(str(e))
    print('PLAN (nic nie wykonano). Liczba śledzonych plików zgodnych z manifestem:',len(paths))
    for p in paths:print('git rm --cached -- '+shlex.quote(p))
    if paths:print('git add -- '+shlex.quote(NAME))
