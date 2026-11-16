#!/usr/bin/env bash
# =====================================================================
# WAYI : installation complète du backend sur un nouveau VPS.
# Systèmes pris en charge : Ubuntu / Debian, AlmaLinux / Rocky / RHEL.
#
# Usage, en root, depuis le dossier du package :
#     bash deploy/setup-vps.sh
#
# Le script peut être relancé sans danger : il ne refait que ce qui manque, ne recrée
# pas la base, ne régénère pas les secrets et ne réimporte jamais deux fois les mêmes
# données. Relancez-le aussi pour déployer une nouvelle version du code.
#
# Si /root/wayi-migration.tgz existe (créé par export-from-old-vps.sh sur l'ancien
# serveur), le .env et les données de l'ancien serveur sont repris automatiquement.
# =====================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-api.wayibenin.com}"
APP_USER="${APP_USER:-wayi}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/wayi-backend}"
APP_PORT="${APP_PORT:-3010}"
DB_PORT="${DB_PORT:-5433}"
NODE_MAJOR="${NODE_MAJOR:-22}"
# Sites autorisés à appeler l'API : client, livreur, administration et restaurant.
FRONTEND_URLS="${FRONTEND_URLS:-https://www.wayibenin.com,https://wayibenin.com,https://driver.wayibenin.com,https://admin.wayibenin.com}"

ROOT_HOME="${ROOT_HOME:-/root}"
STATE_DIR="${STATE_DIR:-/var/lib/wayi}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
CRON_DIR="${CRON_DIR:-/etc/cron.d}"
LOGROTATE_DIR="${LOGROTATE_DIR:-/etc/logrotate.d}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
ACME_ROOT="${ACME_ROOT:-/var/www/certbot}"
LE_DIR="${LE_DIR:-/etc/letsencrypt}"
MIGRATION_BUNDLE="${MIGRATION_BUNDLE:-${ROOT_HOME}/wayi-migration.tgz}"
MIG_DIR="${ROOT_HOME}/wayi-migration"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$SRC_DIR/deploy"
ENV_FILE="$APP_DIR/.env"
DB_PASS_FILE="$STATE_DIR/db-password"

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }

# upsert_env FICHIER CLE VALEUR : remplace ou ajoute une ligne CLE=VALEUR, sans sed
# (aucun souci avec les caractères spéciaux : / & | $ ...). Les autres lignes ne bougent pas.
upsert_env() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  { grep -v "^${key}=" "$file" 2>/dev/null || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# Le port est-il déjà pris par un programme autre que Nginx ? (ancienne installation, Apache, Docker...)
check_port_free() {
  local port="$1" line procs
  command -v ss >/dev/null 2>&1 || return 0
  line="$(ss -tlnpH "sport = :${port}" 2>/dev/null || true)"
  [ -n "$line" ] || return 0
  procs="$(printf '%s' "$line" | grep -o 'users:.*' || true)"
  printf '%s' "$procs" | grep -q '"nginx"' && return 0     # c'est déjà notre Nginx : relance normale
  die "Le port ${port} est déjà utilisé par un autre programme : ${procs:-inconnu}. Nginx ne pourrait pas démarrer. S'il s'agit d'une ancienne installation WAYI :  bash deploy/reset-vps.sh   (sinon, arrêtez ce programme puis relancez ce script)."
}

render() { sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__PORT__|${APP_PORT}|g" -e "s|__ACME_ROOT__|${ACME_ROOT}|g" -e "s|__LE_DIR__|${LE_DIR}|g" -e "s|__LISTEN_HTTPS__|${LISTEN_HTTPS:-443 ssl http2}|g" "$1"; }

# shellcheck source=lib-nginx.sh
. "$DEPLOY_DIR/lib-nginx.sh"

# Permet de charger les fonctions ci-dessus sans rien exécuter (tests).
if [ "${WAYI_SETUP_SOURCE_ONLY:-0}" = "1" ]; then return 0 2>/dev/null || exit 0; fi

[ "$(id -u)" -eq 0 ] || die "Lancez ce script en root :  sudo bash deploy/setup-vps.sh"
[ -d "$SRC_DIR/backend" ] || die "Dossier backend introuvable à côté de deploy/ ($SRC_DIR/backend)."

if command -v apt-get >/dev/null 2>&1; then PKG=apt
elif command -v dnf >/dev/null 2>&1; then PKG=dnf
else die "Système non pris en charge (il faut apt-get ou dnf)."; fi

check_port_free 80
check_port_free 443

# ── 1. Paquets système ───────────────────────────────────────────────
log "1/9 Paquets système ($PKG)"
if [ "$PKG" = apt ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates tar gzip openssl nginx cron ufw python3 python3-venv
else
  dnf install -y curl ca-certificates tar gzip openssl nginx cronie firewalld python3 python3-pip
  systemctl enable --now crond
fi

# ── 2. Node.js et PM2 ────────────────────────────────────────────────
log "2/9 Node.js ${NODE_MAJOR} et PM2"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  if [ "$PKG" = apt ]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
  fi
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
echo "   Node $(node -v), PM2 $(pm2 -v)"

# ── 3. Docker (pour PostgreSQL) ──────────────────────────────────────
log "3/9 Docker"
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# ── 4. Utilisateur et code ───────────────────────────────────────────
log "4/9 Utilisateur « $APP_USER » et code du backend"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$STATE_DIR" "$ACME_ROOT"
# Copie du code SANS écraser le .env ni node_modules du serveur.
tar -C "$SRC_DIR/backend" --exclude=./.env --exclude=./node_modules -cf - . | tar -C "$APP_DIR" -xf -
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Le paquet de migration n'est utilisé QUE s'il vient d'être trouvé dans cette exécution :
# les fichiers extraits lors d'une exécution précédente ne doivent jamais ré-écraser le .env
# (qui a pu être modifié depuis) ni ré-importer des données déjà remplacées par des plus récentes.
BUNDLE_LOADED=0
if [ -f "$MIGRATION_BUNDLE" ]; then
  log "   Paquet de migration trouvé : $MIGRATION_BUNDLE"
  rm -rf "$MIG_DIR"; mkdir -p "$MIG_DIR"; chmod 700 "$MIG_DIR"
  tar -xzf "$MIGRATION_BUNDLE" -C "$MIG_DIR"
  BUNDLE_LOADED=1
fi

# ── 5. Base de données PostgreSQL ────────────────────────────────────
log "5/9 PostgreSQL (conteneur Docker, accessible uniquement depuis ce serveur)"
if ! docker ps -a --format '{{.Names}}' | grep -qx wayi-postgres; then
  DB_PASS="$(openssl rand -hex 24)"
  ( umask 077; printf '%s' "$DB_PASS" > "$DB_PASS_FILE" )
  docker run -d --name wayi-postgres --restart unless-stopped \
    -e POSTGRES_USER=wayi -e POSTGRES_PASSWORD="$DB_PASS" -e POSTGRES_DB=wayi \
    -p "127.0.0.1:${DB_PORT}:5432" -v wayi_postgres_data:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
fi
[ -f "$DB_PASS_FILE" ] || die "Le conteneur wayi-postgres existe déjà mais son mot de passe est introuvable ($DB_PASS_FILE). S'il ne contient rien d'important :  docker rm -f wayi-postgres && docker volume rm wayi_postgres_data  puis relancez ce script."
DB_PASS="$(cat "$DB_PASS_FILE")"

# L'image officielle redémarre PostgreSQL une fois pendant son initialisation : on exige
# deux réponses de suite avant de considérer la base prête.
ready=0
for _ in $(seq 1 60); do
  if docker exec wayi-postgres psql -U wayi -d wayi -tAc 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready+1)); [ "$ready" -ge 2 ] && break
  else ready=0; fi
  sleep 2
done
[ "$ready" -ge 2 ] || die "PostgreSQL ne répond pas. Regardez :  docker logs wayi-postgres"

# ── 6. Configuration (.env) ──────────────────────────────────────────
log "6/9 Fichier .env"
if [ "$BUNDLE_LOADED" = 1 ] && [ -f "$MIG_DIR/wayi.env" ]; then
  [ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
  cat "$MIG_DIR/wayi.env" > "$ENV_FILE"
  echo "   .env repris de l'ancien serveur (clés de paiement, e-mail, etc. conservées)"
elif [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'ENVEOF'
# Fichier de configuration du backend WAYI.
# Les services non configurés (paiement, e-mail, SMS, IA...) fonctionnent en mode simulation.
# Pour en activer un, ajoutez ses clés ici (voir .env.example pour la liste complète),
# puis :  wayi-pm2 restart wayi-backend
ENVEOF
fi
printf '\n' >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

upsert_env "$ENV_FILE" NODE_ENV production
upsert_env "$ENV_FILE" PORT "$APP_PORT"
# Nginx est devant : l'API n'écoute que sur ce serveur (pas directement depuis Internet)
upsert_env "$ENV_FILE" HOST 127.0.0.1
upsert_env "$ENV_FILE" DATABASE_URL "postgresql://wayi:${DB_PASS}@127.0.0.1:${DB_PORT}/wayi"
upsert_env "$ENV_FILE" FRONTEND_URLS "$FRONTEND_URLS"
upsert_env "$ENV_FILE" FRONTEND_URL "${FRONTEND_URLS%%,*}"
upsert_env "$ENV_FILE" WEBHOOK_BASE_URL "https://${DOMAIN}"
# Secret de connexion : conservé s'il est solide, sinon généré (l'exemple de .env.example est connu de tous).
if ! grep -q '^JWT_SECRET=.\{32,\}$' "$ENV_FILE" || grep -q '^JWT_SECRET=wayi-super-secret' "$ENV_FILE"; then
  upsert_env "$ENV_FILE" JWT_SECRET "$(openssl rand -hex 48)"
  echo "   JWT_SECRET généré (les utilisateurs devront se reconnecter une fois)"
fi
# Mot de passe administrateur : généré s'il n'existe pas encore (le compte de démo a un mot de passe connu de tous).
# Affiché TOUT DE SUITE : si une étape ultérieure échouait, il ne serait sinon jamais montré.
if ! grep -q '^ADMIN_PASSWORD=.\{10,\}$' "$ENV_FILE"; then
  ADMIN_PASS_GENERATED="$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
  upsert_env "$ENV_FILE" ADMIN_PASSWORD "$ADMIN_PASS_GENERATED"
  ADMIN_LOGIN="$(grep '^ADMIN_EMAIL=.' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"; ADMIN_LOGIN="${ADMIN_LOGIN:-admin@wayi.bj}"
  cat << ADMINBOX

────────────────────────────────────────────────────────────
  COMPTE ADMINISTRATEUR (notez-le maintenant, affiché une seule fois)
      e-mail        : ${ADMIN_LOGIN}
      mot de passe  : ${ADMIN_PASS_GENERATED}
  Il est aussi dans ${ENV_FILE} (ADMIN_PASSWORD) : pour le relire ou
  le changer, modifiez cette ligne puis :  wayi-pm2 restart wayi-backend
────────────────────────────────────────────────────────────
ADMINBOX
fi
chown "$APP_USER":"$APP_USER" "$ENV_FILE"

# ── 7. Données de l'ancien serveur ───────────────────────────────────
if [ "$BUNDLE_LOADED" = 1 ] && [ -f "$MIG_DIR/wayi-db.sql" ]; then
  log "7/9 Import des données de l'ancien serveur"
  APP_USER="$APP_USER" STATE_DIR="$STATE_DIR" bash "$DEPLOY_DIR/restore-db.sh" "$MIG_DIR/wayi-db.sql"
else
  log "7/9 Pas de données à importer (démarrage avec une base vierge)"
fi

# ── 8. Démarrage de l'application ────────────────────────────────────
log "8/9 Installation des dépendances et démarrage (PM2)"
runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm install --omit=dev --no-audit --no-fund"
runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && pm2 startOrReload ecosystem.config.js --update-env && pm2 save"
# Redémarrage automatique de PM2 quand le serveur redémarre
env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null 2>&1 || echo "   (pm2 startup : à vérifier à la main, voir le guide)"
# Rotation des logs : logrotate du système (aucune mémoire), pas le module pm2-logrotate (≈ 64 Mo en permanence)
runuser -u "$APP_USER" -- pm2 uninstall pm2-logrotate >/dev/null 2>&1 || true
APP_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)"; APP_HOME="${APP_HOME:-/home/$APP_USER}"
mkdir -p "$LOGROTATE_DIR"
cat > "$LOGROTATE_DIR/wayi-pm2" << LOGROT
${APP_HOME}/.pm2/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
LOGROT

# Raccourci pratique : « wayi-pm2 logs wayi-backend » en root
cat > "$BIN_DIR/wayi-pm2" << WRAP
#!/usr/bin/env bash
exec runuser -u ${APP_USER} -- pm2 "\$@"
WRAP
chmod 755 "$BIN_DIR/wayi-pm2"

ok=0
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  runuser -u "$APP_USER" -- pm2 logs wayi-backend --lines 30 --nostream || true
  die "Le backend ne répond pas sur le port ${APP_PORT}. Voir les logs ci-dessus."
fi
# Une réponse sur le port ne prouve pas que c'est NOTRE backend (un ancien processus peut occuper le port).
# On vérifie donc que le process PM2 est « online » ET qu'il ne redémarre plus : deux relevés espacés de 5 s.
# (Le compteur de redémarrages de PM2 est cumulatif, il augmente à chaque relance de ce script : seule sa
# progression pendant l'observation signale un backend qui plante en boucle.)
pm2_probe() {  # affiche « <état> <nombre de redémarrages> »
  local j st rs
  j="$(runuser -u "$APP_USER" -- pm2 jlist 2>/dev/null || true)"
  st="$(printf '%s' "$j" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4 || true)"
  rs="$(printf '%s' "$j" | grep -o '"restart_time":[0-9]*' | head -1 | cut -d: -f2 || true)"
  printf '%s %s' "${st:-inconnu}" "${rs:-0}"
}
read -r _ PM2_RS1 <<< "$(pm2_probe)"
sleep 5
read -r PM2_ST2 PM2_RS2 <<< "$(pm2_probe)"
if [ "$PM2_ST2" != "online" ] || [ "$PM2_RS2" -gt "$PM2_RS1" ]; then
  runuser -u "$APP_USER" -- pm2 logs wayi-backend --lines 30 --nostream || true
  die "Le backend ne démarre pas correctement (état PM2 : ${PM2_ST2}, il a redémarré $((PM2_RS2 - PM2_RS1)) fois pendant l'observation). Si les logs ci-dessus parlent d'un port déjà utilisé, une ancienne installation tourne encore :  bash deploy/reset-vps.sh  puis relancez ce script."
fi
echo "   Backend en ligne : $(curl -fsS "http://127.0.0.1:${APP_PORT}/health" | head -c 160)"

# ── 9. Nginx, pare-feu, sauvegardes ──────────────────────────────────
log "9/9 Nginx, pare-feu et sauvegardes quotidiennes"
mkdir -p "$NGINX_CONF_DIR"
NGINX_SITE="$NGINX_CONF_DIR/${DOMAIN}.conf"
[ -f "$NGINX_SITE" ] && cp "$NGINX_SITE" "$NGINX_SITE.prev"
render "$DEPLOY_DIR/nginx-ws-map.conf" > "$NGINX_CONF_DIR/wayi-ws-map.conf"
if [ -f "$LE_DIR/live/$DOMAIN/fullchain.pem" ]; then
  # Certificat déjà obtenu : on garde le HTTPS. Sur un serveur avec routeur TCP, le bloc HTTPS écoute sur la voie
  # interne du routeur, pas sur le 443 (voir lib-nginx.sh).
  LISTEN_HTTPS="$(detect_https_listen)" || die "Un routeur TCP (nginx « stream ») tient le port 443 mais je ne retrouve pas sa voie par défaut. Je ne modifie rien. Montrez-moi son fichier : cat /etc/nginx/stream-routage.conf"
  render "$DEPLOY_DIR/nginx-https.conf.template" > "$NGINX_SITE"
  echo "   HTTPS : le bloc de ${DOMAIN} écoute sur « ${LISTEN_HTTPS} »"
else
  render "$DEPLOY_DIR/nginx-http.conf.template"  > "$NGINX_SITE"
fi
command -v setsebool >/dev/null 2>&1 && setsebool -P httpd_can_network_connect 1 || true   # AlmaLinux/RHEL : Nginx peut joindre le backend
systemctl enable --now nginx
safe_nginx_reload "$NGINX_SITE"

# Pare-feu. Ce serveur peut déjà héberger d'autres projets : on n'ACTIVE jamais un pare-feu qui ne
# l'est pas déjà si d'autres programmes écoutent sur des ports publics (ils deviendraient
# injoignables). Dans ce cas, on le signale et on laisse la décision à l'administrateur.
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"; SSH_PORT="${SSH_PORT:-22}"
other_public_ports() {  # ports en écoute sur une adresse non locale, hors SSH, 80 et 443
  command -v ss >/dev/null 2>&1 || return 0
  ss -tlnH 2>/dev/null | awk '{print $4}' | grep -Ev '^(127\.|\[?::1\]?:)' | sed 's/.*://' | sort -un \
    | grep -Ev "^(${SSH_PORT}|80|443)$" | tr '\n' ' ' || true
}
if [ "${SKIP_FIREWALL:-0}" = "1" ]; then
  echo "   Pare-feu : ignoré (SKIP_FIREWALL=1)"
else
  OTHERS="$(other_public_ports)"
  if [ "$PKG" = apt ]; then
    FW_ACTIVE=0; ufw status 2>/dev/null | grep -q "Status: active" && FW_ACTIVE=1
  else
    FW_ACTIVE=0; systemctl is-active --quiet firewalld 2>/dev/null && FW_ACTIVE=1
  fi
  if [ "$FW_ACTIVE" = 0 ] && [ -n "${OTHERS// /}" ] && [ "${FORCE_FIREWALL:-0}" != "1" ]; then
    echo "   Pare-feu : NON activé, pour ne pas couper vos autres services. Ces ports sont ouverts à tous : ${OTHERS}"
    echo "   (Le backend WAYI, lui, n'écoute que sur ce serveur : il n'est joignable que par Nginx.)"
    echo "   Pour l'activer quand même :  FORCE_FIREWALL=1 bash deploy/setup-vps.sh   (après avoir autorisé ces ports)"
  else
    if [ "$PKG" = apt ]; then
      ufw allow "${SSH_PORT}/tcp" >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
      [ "$FW_ACTIVE" = 1 ] || ufw --force enable >/dev/null
    else
      [ "$FW_ACTIVE" = 1 ] || systemctl enable --now firewalld
      firewall-cmd --permanent --add-port="${SSH_PORT}/tcp" --add-service=http --add-service=https >/dev/null
      firewall-cmd --reload >/dev/null
    fi
    echo "   Pare-feu : ports ${SSH_PORT} (SSH), 80 et 443 autorisés"
  fi
fi

install -m 755 "$DEPLOY_DIR/backup-db.sh" "$BIN_DIR/wayi-backup-db"
mkdir -p "$CRON_DIR"
printf '0 3 * * * root %s/wayi-backup-db >> /var/log/wayi-backup.log 2>&1\n' "$BIN_DIR" > "$CRON_DIR/wayi-backup"
# Le paquet est « consommé » : renommé pour ne plus être pris en compte aux relances suivantes.
[ "$BUNDLE_LOADED" = 1 ] && mv -f "$MIGRATION_BUNDLE" "$MIGRATION_BUNDLE.done" || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
cat << DONE

════════════════════════════════════════════════════════════
  Installation terminée.
  Adresse de ce serveur : ${IP:-inconnue}

  Étape suivante : tester AVANT de changer le DNS
      bash deploy/smoke-test.sh http://127.0.0.1 ${DOMAIN}

  Puis faire pointer ${DOMAIN} vers ${IP:-cette adresse} chez votre
  hébergeur de domaine, et activer le HTTPS :
      bash deploy/enable-ssl.sh votre@email.com
════════════════════════════════════════════════════════════
DONE
