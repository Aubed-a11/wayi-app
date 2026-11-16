#!/usr/bin/env bash
# Active le HTTPS (certificat Let's Encrypt gratuit, renouvelé automatiquement).
#
#   bash deploy/enable-ssl.sh votre@email.com
#
# À lancer APRÈS avoir fait pointer le domaine (enregistrement A) vers ce serveur :
# Let's Encrypt vérifie que le domaine arrive bien ici.
set -euo pipefail

EMAIL="${1:-}"
DOMAIN="${DOMAIN:-api.wayibenin.com}"
APP_PORT="${APP_PORT:-3010}"
ROOT_HOME="${ROOT_HOME:-/root}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
CRON_DIR="${CRON_DIR:-/etc/cron.d}"
ACME_ROOT="${ACME_ROOT:-/var/www/certbot}"
LE_DIR="${LE_DIR:-/etc/letsencrypt}"
CERTBOT_VENV="${CERTBOT_VENV:-/opt/certbot}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTTPS_PORT="${HTTPS_PORT:-443}"

die() { printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }
render() { sed -e "s|__DOMAIN__|${DOMAIN}|g" -e "s|__PORT__|${APP_PORT}|g" -e "s|__ACME_ROOT__|${ACME_ROOT}|g" -e "s|__LE_DIR__|${LE_DIR}|g" -e "s|__LISTEN_HTTPS__|${LISTEN_HTTPS:-443 ssl http2}|g" "$1"; }

# shellcheck source=lib-nginx.sh
. "$DEPLOY_DIR/lib-nginx.sh"

[ "$(id -u)" -eq 0 ] || die "Lancez ce script en root."
[ -n "$EMAIL" ] || die "Usage :  bash deploy/enable-ssl.sh votre@email.com"

# Le domaine doit déjà pointer vers CE serveur, sinon Let's Encrypt échouera.
MY_IP="$(curl -4 -fsS -m 10 https://api.ipify.org 2>/dev/null || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$MY_IP" ] && [ "$DNS_IP" != "$MY_IP" ] && [ "${FORCE:-0}" != "1" ]; then
  die "$DOMAIN pointe vers '${DNS_IP:-aucune adresse}' mais ce serveur est '$MY_IP'. Faites pointer le domaine ici (patientez quelques minutes après le changement), ou relancez avec FORCE=1."
fi

if [ ! -x "$CERTBOT_VENV/bin/certbot" ]; then
  echo "Installation de certbot..."
  python3 -m venv "$CERTBOT_VENV"
  "$CERTBOT_VENV/bin/pip" install --quiet --upgrade pip certbot
fi

mkdir -p "$ACME_ROOT"
"$CERTBOT_VENV/bin/certbot" certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" \
  -m "$EMAIL" --agree-tos --non-interactive --keep-until-expiring

# Où le bloc HTTPS doit-il écouter ? Port 443 sur un serveur classique ; sur un serveur avec routeur TCP (nginx « stream »)
# qui tient déjà le 443, sur la voie interne du routeur. Voir lib-nginx.sh.
LISTEN_HTTPS="$(detect_https_listen)" || die "Un routeur TCP (nginx « stream ») tient le port 443 mais je ne retrouve pas sa voie par défaut. Je ne modifie rien. Montrez-moi son fichier : cat /etc/nginx/stream-routage.conf"
echo "Le bloc HTTPS écoutera sur : ${LISTEN_HTTPS}"
NGINX_SITE="$NGINX_CONF_DIR/${DOMAIN}.conf"
[ -f "$NGINX_SITE" ] && cp "$NGINX_SITE" "$NGINX_SITE.prev"
render "$DEPLOY_DIR/nginx-https.conf.template" > "$NGINX_SITE"
safe_nginx_reload "$NGINX_SITE"

mkdir -p "$CRON_DIR"
printf '17 3,15 * * * root %s/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx" >> /var/log/wayi-certbot.log 2>&1\n' "$CERTBOT_VENV" > "$CRON_DIR/wayi-certbot"

echo
echo "HTTPS actif. Vérification :"
# Test indépendant du cache DNS du serveur : on force la résolution vers ce serveur (le certificat est, lui, vérifié).
HTTPS_URL="https://${DOMAIN}$([ "$HTTPS_PORT" = 443 ] || printf ':%s' "$HTTPS_PORT")/health"
if curl -fsS -m 15 --resolve "${DOMAIN}:${HTTPS_PORT}:127.0.0.1" "$HTTPS_URL" | head -c 200; then echo; else echo; echo "(la vérification HTTPS a échoué : voir ci-dessus. Le certificat est installé ; testez depuis votre PC :  curl -I https://${DOMAIN}/health)"; fi
echo "Test complet (CORS des trois applications) :  bash deploy/smoke-test.sh https://${DOMAIN}"
