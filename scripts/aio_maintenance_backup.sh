#!/usr/bin/env bash
# AIO Cloudflare private backup: export D1, copy R2, and verify both automatically.
# Sensitive data is stored outside of the website repository. No production writes.
set -Eeuo pipefail

usage() {
 cat <<'HELP'
AIO Backup + automatic verification (D1 + R2)
Usage:
  bash scripts/aio_maintenance_backup.sh --d1 aio-community --r2 aio-r2:aio-community-media
  bash scripts/aio_maintenance_backup.sh --verify-only /path/to/existing/backup --r2 aio-r2:aio-community-media
  bash scripts/aio_maintenance_backup.sh --dry-run --d1 NAME --r2 REMOTE
Options:
  --d1 NAME          Cloudflare D1 database name (or AIO_D1_NAME)
  --r2 REMOTE        rclone S3 bucket path (or AIO_R2_REMOTE)
  --output PATH      private base directory (default: $HOME/AIO_PRIVATE_BACKUPS)
  --d1-only          explicitly skip R2 (not a complete backup)
  --verify-only DIR  verify existing backup, without making a new one
  --dry-run          print configuration, do not access cloud or create files
HELP
}

NAME="${AIO_D1_NAME:-}"
REMOTE="${AIO_R2_REMOTE:-}"
OUT="${AIO_BACKUP_DIR:-$HOME/AIO_PRIVATE_BACKUPS}"
DRY=0
D1ONLY=0
VERIFY_ONLY=""
while (($#)); do
 case "$1" in
   --dry-run) DRY=1; shift ;;
   --d1) NAME="${2:?Brak nazwy D1}"; shift 2 ;;
   --r2) REMOTE="${2:?Brak nazwy R2 remote}"; shift 2 ;;
   --output) OUT="${2:?Brak ścieżki wyjściowej}"; shift 2 ;;
   --d1-only) D1ONLY=1; shift ;;
   --verify-only) VERIFY_ONLY="${2:?Brak katalogu do weryfikacji}"; shift 2 ;;
   -h|--help) usage; exit 0 ;;
   *) echo "Nieznany parametr: $1" >&2; usage; exit 2 ;;
 esac
done

if ((DRY)); then
 echo "AIO BACKUP — PODGLĄD (bez zmian danych)"
 echo "D1: ${NAME:-NIEUSTAWIONA}"
 if ((D1ONLY)); then echo 'R2: celowo pominięty'; else echo "R2: ${REMOTE:-NIEUSTAWIONY}"; fi
 echo "Katalog docelowy: $OUT"
 echo "Tryb: $( [[ -n $VERIFY_ONLY ]] && echo "weryfikacja $VERIFY_ONLY" || echo 'nowa kopia + automatyczna weryfikacja' )"
 exit 0
fi

# Defend against accidental backups in the Git repository.
if [[ -z "$VERIFY_ONLY" ]]; then
 OUT="$(realpath -m -- "$OUT")"
 if [[ "$OUT" == *'/aio-iptv-projekt' || "$OUT" == *'/aio-iptv-projekt/'* ]]; then
   echo 'Odmowa: backupy muszą znajdować się POZA repozytorium GitHub.' >&2
   exit 2
 fi
fi
if (( ! D1ONLY )) && [[ -z "$REMOTE" ]]; then
 echo 'Brak adresu R2. Podaj --r2 REMOTE, albo świadomie wybierz --d1-only.' >&2
 exit 2
fi
command -v sha256sum >/dev/null || { echo 'Brak sha256sum' >&2; exit 1; }
if (( ! D1ONLY )); then
 command -v rclone >/dev/null || { echo 'Brak rclone' >&2; exit 1; }
fi

# Verification of a standalone snapshot (only reads local disk and remote R2).
verify_snapshot() {
 local dir="$1" r2count
 if [[ ! -s "$dir/community-d1.sql" || ! -s "$dir/community-d1.sha256" ]]; then
   echo 'BŁĄD: brak pliku bazy D1 lub jego sumy SHA-256.' >&2
   return 1
 fi
 echo 'Kontrola SHA-256 D1...'
 (cd "$dir" && sha256sum -c community-d1.sha256) || return 1
 if (( ! D1ONLY )); then
   if [[ ! -d "$dir/community-r2" || ! -s "$dir/community-r2.sha256" ]]; then
     echo 'BŁĄD: brak kopii R2 lub jej listy kontrolnej.' >&2
     return 1
   fi
   echo 'Kontrola SHA-256 wszystkich pobranych plików R2...'
   (cd "$dir/community-r2" && sha256sum -c ../community-r2.sha256 --status) || return 1
   r2count="$(cd "$dir/community-r2" && find . -type f | wc -l)"
   if ((r2count < 1)); then
     echo 'BŁĄD: R2 zawiera zero plików. Sprawdź poprawność adresu magazynu.' >&2
     return 1
   fi
   echo 'Porównanie R2 z magazynem Cloudflare...'
   rclone check "$REMOTE" "$dir/community-r2" || return 1
   printf 'R2: %s zgodnych plików lokalnych\n' "$r2count"
 fi
 echo 'WERYFIKACJA: SUKCES (D1 SHA-256; R2 lokalne SHA-256 i zgodność z chmurą)'
 echo 'Uwaga: pełny test odtworzenia D1 wymaga odrębnego środowiska testowego.'
}

if [[ -n "$VERIFY_ONLY" ]]; then
 [[ -d "$VERIFY_ONLY" ]] || { echo "Brak katalogu: $VERIFY_ONLY" >&2; exit 2; }
 verify_snapshot "$(realpath -- "$VERIFY_ONLY")"
 exit $?
fi

if [[ -z "$NAME" ]]; then
 echo 'Brak nazwy bazy. Podaj --d1 lub ustaw AIO_D1_NAME.' >&2
 exit 2
fi
if command -v wrangler >/dev/null 2>&1; then
 W=(wrangler)
elif command -v npx >/dev/null 2>&1; then
 W=(npx --no-install wrangler)
else
 echo 'Brak wrangler/npx.' >&2
 exit 1
fi

umask 077
mkdir -p -- "$OUT"
chmod 700 -- "$OUT"
DEST="$OUT/$(date +%Y%m%d-%H%M%S)"
if [[ -e "$DEST" ]]; then
 echo "Katalog już istnieje: $DEST. Spróbuj ponownie za sekundę." >&2
 exit 1
fi
mkdir -m 700 -- "$DEST"
# Incomplete snapshots are clearly marked, even if download or checks fail.
printf 'STATUS: NIEZWERYFIKOWANA (w trakcie lub przerwana)\n' > "$DEST/STATUS.txt"

printf 'AIO BACKUP: eksport D1 (%s).\n' "$NAME"
echo 'Uwaga: przy eksporcie baza może być chwilowo niedostępna; Wrangler może poprosić o zgodę.'
"${W[@]}" d1 export "$NAME" --remote --output "$DEST/community-d1.sql"
[[ -s "$DEST/community-d1.sql" ]] || { echo 'Brak danych SQL w kopii D1.' >&2; exit 1; }
sha256sum "$DEST/community-d1.sql" > "$DEST/community-d1.sha256"

if (( ! D1ONLY )); then
 echo "AIO BACKUP: kopiowanie R2: $REMOTE"
 mkdir -m 700 -- "$DEST/community-r2"
 rclone copy "$REMOTE" "$DEST/community-r2" --progress
 (cd "$DEST/community-r2" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum) > "$DEST/community-r2.sha256"
fi

printf '\nAIO BACKUP: AUTOMATYCZNA WERYFIKACJA\n'
verify_snapshot "$DEST" || { echo "BŁĄD: Niezweryfikowana kopia pozostała w: $DEST" >&2; exit 1; }
# Save success only once all checks have passed.
{
 printf 'STATUS: ZWERYFIKOWANA\n'
 printf 'D1: %s\n' "$NAME"
 if ((D1ONLY)); then printf 'R2: POMINIĘTO (tylko D1)\n'; else printf 'R2: %s\n' "$REMOTE"; fi
 printf 'Utworzono: %s\n' "$(date -Iseconds)"
 printf 'Test odtwarzania D1: NIE (wymaga odrębnej bazy testowej)\n'
} > "$DEST/STATUS.txt"
chmod -R go-rwx -- "$DEST"
printf '\nAIO BACKUP: GOTOWE I ZWERYFIKOWANE\nKatalog: %s\n' "$DEST"
