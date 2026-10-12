#!/usr/bin/env bash
# Explicit read-only export; never invoked by installer.
set -euo pipefail
OUT="${1:-$HOME/AIO_BACKUPS}"
DEST="$OUT/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST";chmod 700 "$DEST"
if command -v wrangler >/dev/null 2>&1;then W=(wrangler)
elif command -v npx >/dev/null 2>&1;then W=(npx --no-install wrangler)
else echo 'Wrangler nie jest zainstalowany.' >&2;exit 1;fi
"${W[@]}" d1 export "${AIO_D1_NAME:-aio-community}" --remote --output "$DEST/community-d1.sql"
if [[ -n "${AIO_R2_REMOTE:-}" ]];then
 if command -v rclone >/dev/null 2>&1;then rclone copy "$AIO_R2_REMOTE" "$DEST/community-r2" --progress
 else echo 'UWAGA: brak rclone. Nie skopiowano R2.';fi
else echo 'UWAGA: R2 pominięte. Ustaw AIO_R2_REMOTE zgodnie z README.';fi
printf 'D1: %s\nR2 configured: %s\n' "${AIO_D1_NAME:-aio-community}" "${AIO_R2_REMOTE:-nie}" > "$DEST/README.txt"
echo "Backup: $DEST — przetestuj przywrócenie na osobnym środowisku."
