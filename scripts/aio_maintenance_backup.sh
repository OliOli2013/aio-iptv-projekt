#!/usr/bin/env bash
# Explicit backup of Cloudflare D1 and optionally R2. Never scheduled automatically.
set -euo pipefail
usage(){ cat <<'HELP'
AIO private Cloudflare backup (manual; requires local Wrangler credentials)
Usage:
  AIO_D1_NAME="REALNA_NAZWA_D1" AIO_R2_REMOTE="rclone_remote:bucket" bash scripts/aio_maintenance_backup.sh
  bash scripts/aio_maintenance_backup.sh --dry-run
Options:
  --dry-run       show configuration, no network access and no files
  --d1 NAME       use known database name (otherwise AIO_D1_NAME env)
  --r2 REMOTE     rclone remote path to R2 bucket (otherwise AIO_R2_REMOTE env)
  --output PATH   directory for backups (default $HOME/AIO_PRIVATE_BACKUPS)
  --d1-only       intentionally omit R2 (not a complete media backup)
HELP
}
NAME="${AIO_D1_NAME:-}";REMOTE="${AIO_R2_REMOTE:-}";OUT="${AIO_BACKUP_DIR:-$HOME/AIO_PRIVATE_BACKUPS}"
DRY=0;D1ONLY=0
while (($#));do
 case "$1" in
 --dry-run)DRY=1;shift;;
 --d1)NAME="${2:?Brak nazwy D1}";shift 2;;
 --r2)REMOTE="${2:?Brak nazwy R2 remote}";shift 2;;
 --output)OUT="${2:?Brak ścieżki}";shift 2;;
 --d1-only)D1ONLY=1;shift;;
 -h|--help)usage;exit 0;;
 *)echo "Nieznany parametr: $1" >&2;usage;exit 2;;
 esac
done
if ((DRY));then
 echo "AIO BACKUP — PODGLĄD, nic nie zapisano"
 echo "D1: ${NAME:-NIEUSTAWIONA; sprawdź Cloudflare D1 > database name}"
 echo "R2: $( ((D1ONLY)) && echo 'celowo wyłączony' || echo "${REMOTE:-NIEUSTAWIONY; sprawdź rclone config}" )"
 echo "Dane wyjściowe: $OUT (prywatnie, poza repozytorium)"
 exit 0
fi
if [[ -z "$NAME" ]];then echo 'Brak AIO_D1_NAME. Nie zgaduję nazwy bazy. Użyj --d1 lub AIO_D1_NAME.' >&2;exit 2;fi
if [[ "$OUT" == *'/aio-iptv-projekt'* ]];then echo 'Katalog backupów musi znajdować się POZA repozytorium.' >&2;exit 2;fi
if command -v wrangler >/dev/null 2>&1;then W=(wrangler)
elif command -v npx >/dev/null 2>&1;then W=(npx --no-install wrangler)
else echo 'Brak wrangler lub npx. Nie wykonano eksportu.' >&2;exit 1;fi
umask 077
DEST="$OUT/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST";chmod 700 "$DEST"
echo 'Eksport D1: baza prywatna — nie wrzucaj plików na GitHub.'
"${W[@]}" d1 export "$NAME" --remote --output "$DEST/community-d1.sql"
if [[ ! -s "$DEST/community-d1.sql" ]];then echo 'D1: brak niepustego pliku!';exit 1;fi
sha256sum "$DEST/community-d1.sql" > "$DEST/community-d1.sha256"
MEDIA='NIE — brak skonfigurowanej kopii R2'
if ((D1ONLY));then MEDIA='NIE — celowo pominięto R2'
elif [[ -n "$REMOTE" ]];then
 if ! command -v rclone >/dev/null 2>&1;then echo 'Brak rclone. D1 jest zapisane, R2 pominięte.' >&2
 else
   echo "Kopiowanie R2: $REMOTE"
   mkdir -p "$DEST/community-r2"
   rclone copy "$REMOTE" "$DEST/community-r2" --progress
   MEDIA='TAK — R2 skopiowane, ale wymagany jest test odtwarzania'
   (cd "$DEST/community-r2" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$DEST/community-r2.sha256"
 fi
fi
printf 'Baza D1: %s\nD1: wyeksportowane; przetestuj przywrócenie do osobnej bazy\nR2: %s\nUtworzono: %s\n' "$NAME" "$MEDIA" "$(date -Iseconds)" > "$DEST/STATUS.txt"
chmod -R go-rwx "$DEST"
echo "Backup w: $DEST"
echo "R2: $MEDIA"
echo 'NIE PRZYWRACAJ TESTOWO NA PRODUKCYJNEJ BAZIE. Sprawdź kopię w środowisku testowym.'
