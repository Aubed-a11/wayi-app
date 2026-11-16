#!/usr/bin/env bash
# Sauvegarde de la base WAYI. Installé par setup-vps.sh, lancé chaque nuit à 3 h.
# Toutes les données de l'application (comptes, commandes, menus) sont dans cette base.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/wayi}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/wayi-$(date +%Y%m%d-%H%M%S).sql.gz"

docker exec wayi-postgres pg_dump -U wayi -d wayi --no-owner --no-privileges | gzip > "$FILE" \
  || { rm -f "$FILE"; echo "ERREUR : pg_dump a échoué" >&2; exit 1; }

# Garde-fou : une sauvegarde vide ne sert à rien (et ne doit pas pousser les bonnes dehors).
if [ "$(gzip -dc "$FILE" | wc -c)" -lt 200 ]; then
  rm -f "$FILE"; echo "ERREUR : sauvegarde vide, supprimée" >&2; exit 1
fi

find "$BACKUP_DIR" -name 'wayi-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
