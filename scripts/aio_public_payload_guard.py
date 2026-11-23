"""Pull-request guard for new/updated binary payloads in public transfer directories."""
import re
import subprocess
import sys
from pathlib import PurePosixPath


def allowed(raw):
    path = PurePosixPath(raw)
    if raw.startswith('pliki/') and path.suffix.lower() in {'.png','.jpg','.jpeg','.gif','.svg','.webp','.avif','.sha256'}:
        return True
    if raw.startswith('assets/releases/') and re.fullmatch(r'SHA256SUMS[-.\w]*\.txt',path.name,re.I):
        return True
    return bool(re.fullmatch(r'enigma2-plugin-extensions-panelaio_\d+\.\d+\.\d+_all\.ipk',path.name,re.I))


def main(base,head):
    if not all(re.fullmatch(r'[0-9a-f]{40}',v) for v in (base,head)):
        return 2
    # --no-renames: moves into a protected directory count as new files.
    changed = subprocess.check_output(['git','diff','--name-only','--no-renames','--diff-filter=AMT','-z',
        base,head,'--','pliki/','assets/releases/'])
    denied = [name for name in changed.decode('utf-8').split('\0') if name and not allowed(name)]
    if denied:
        print('Nie publikuj prywatnych plików w publicznym GitHubie. Skorzystaj z prywatnego R2.')
        for name in denied: print(repr(name))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]) if len(sys.argv)==3 else 2)
