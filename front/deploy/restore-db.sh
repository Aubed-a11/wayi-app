#!/usr/bin/env bash
# Restaure la base WAYI depuis un fichier .sql ou .sql.gz (sauvegarde ou export de l'ancien serveur).
#
#   bash deploy/restore-db.sh /root/wayi-migration/wayi-db.sql
#   bash deploy/restore-db.sh /var/backups/wayi/wayi-20261003-030000.sql.gz
#
# ATTENTION : remplace TOUTES les données actuelles de la base.
# Un même fichier n'est restauré qu'une fois (pour qu'un redémarrage ou une relance de
# setup-vps.sh n'écrase jamais des données plus récentes) ; FORCE=1 pour passer outre.
set -euo pipefail

DUMP="${1:-}"
APP_USER="${APP_USER:-wayi}"
STATE_DIR="${STATE_DIR:-/var/lib/wayi}"
PM2_APP="${PM2_APP:-wayi-backend}"

[ -f "$DUMP" ] || { echo "Usage : bash deploy/restore-db.sh <fichier.sql | fichier.sql.gz>" >&2; exit 1; }

mkdir -p "$STATE_DIR"
MARK="$STATE_DIR/restored.$(sha1sum "$DUMP" | cut -c1-16)"
if [ -f "$MARK" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "Ce fichier a déjà été restauré ($MARK). Rien à faire. (FORCE=1 pour forcer.)"
  exit 0
fi

# 1. On arrête d'abord l'application : à l'arrêt elle sauvegarde son état en base, ce qui
#    écraserait la restauration si elle tournait encore pendant l'import.
WAS_RUNNING=0
if runuser -u "$APP_USER" -- pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  WAS_RUNNING=1
  runuser -u "$APP_USER" -- pm2 stop "$PM2_APP" >/dev/null
fi

# 2. Remplacement complet du contenu de la base
docker exec wayi-postgres psql -U wayi -d wayi -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
case "$DUMP" in
  *.gz) gzip -dc "$DUMP" | docker exec -i wayi-postgres psql -U wayi -d wayi -v ON_ERROR_STOP=1 -q ;;
  *)    docker exec -i wayi-postgres psql -U wayi -d wayi -v ON_ERROR_STOP=1 -q < "$DUMP" ;;
esac

ROWS="$(docker exec wayi-postgres psql -U wayi -d wayi -tAc 'SELECT count(*) FROM app_state' | tr -d '[:space:]')"
[ "${ROWS:-0}" -ge 1 ] || { echo "ERREUR : la restauration n'a produit aucune donnée (app_state vide)." >&2; exit 1; }
touch "$MARK"
echo "Restauration terminée : $ROWS enregistrement(s) d'état dans la base."

# 3. Redémarrage si l'application tournait
if [ "$WAS_RUNNING" = "1" ]; then
  runuser -u "$APP_USER" -- pm2 start "$PM2_APP" >/dev/null
  echo "Application redémarrée."
fi
