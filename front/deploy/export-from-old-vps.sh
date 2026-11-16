#!/usr/bin/env bash
# À lancer sur l'ANCIEN serveur (en root) : prépare le paquet de migration.
#
#   bash export-from-old-vps.sh
#
# Il arrête le backend (qui sauvegarde alors son état), exporte la base et copie le .env,
# puis range le tout dans /root/wayi-migration.tgz. Ce fichier contient vos clés secrètes :
# ne le partagez pas, supprimez-le une fois la migration terminée.
#
# Le backend de l'ancien serveur RESTE ARRÊTÉ : le relancer maintenant créerait des
# données qui ne seraient pas migrées. (Pour annuler : pm2 start wayi-backend)
set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/root/wayi-backend}"
PM2_APP="${PM2_APP:-wayi-backend}"
OUT_DIR="${OUT_DIR:-/root/wayi-migration}"
BUNDLE="${BUNDLE:-/root/wayi-migration.tgz}"

echo "1/4 Arrêt du backend (sauvegarde finale de l'état)..."
pm2 stop "$PM2_APP" >/dev/null 2>&1 || echo "   (le backend n'était pas lancé sous PM2, on continue)"
sleep 2

echo "2/4 Export de la base..."
rm -rf "$OUT_DIR"; mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
docker exec wayi-postgres pg_dump -U wayi -d wayi --no-owner --no-privileges > "$OUT_DIR/wayi-db.sql"
grep -q "app_state" "$OUT_DIR/wayi-db.sql" || { echo "ERREUR : l'export ne contient pas la table app_state." >&2; exit 1; }
[ "$(wc -c < "$OUT_DIR/wayi-db.sql")" -gt 500 ] || { echo "ERREUR : export anormalement petit." >&2; exit 1; }

echo "3/4 Copie du .env..."
if [ -f "$BACKEND_DIR/.env" ]; then cp "$BACKEND_DIR/.env" "$OUT_DIR/wayi.env"; else echo "   ATTENTION : $BACKEND_DIR/.env introuvable, il faudra ressaisir les clés."; fi

echo "4/4 Création du paquet..."
FILES="wayi-db.sql"; [ -f "$OUT_DIR/wayi.env" ] && FILES="$FILES wayi.env"
tar czf "$BUNDLE" -C "$OUT_DIR" $FILES
chmod 600 "$BUNDLE"

echo
echo "Paquet prêt : $BUNDLE ($(du -h "$BUNDLE" | cut -f1))"
echo "Envoyez-le au nouveau serveur :"
echo "    scp $BUNDLE root@IP_DU_NOUVEAU_SERVEUR:/root/"
