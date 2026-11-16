#!/usr/bin/env bash
# =====================================================================
# WAYI : supprime l'ancienne installation (ratée ou incomplète) de CE serveur,
# pour repartir de zéro avant setup-vps.sh.
#
#   bash deploy/reset-vps.sh
#
# Le script commence par AFFICHER tout ce qu'il va supprimer et attend que vous tapiez OUI.
# Il ne touche qu'à ce dont le nom contient « wayi » (processus, conteneurs Docker, services,
# configurations Nginx, dossiers). Il ne touche JAMAIS au paquet d'installation en cours,
# ni à /root/wayi-migration.tgz, ni à vos fichiers .zip / .tgz.
#
# ATTENTION : les données de l'ancienne installation (base de données comprise) sont perdues.
# =====================================================================
set -euo pipefail

APP_USER="${APP_USER:-wayi}"
APP_PORTS="${APP_PORTS:-3010 3001}"
SCAN_DIRS="${SCAN_DIRS:-/root /home /opt /srv /var/www}"
NGINX_DIRS="${NGINX_DIRS:-/etc/nginx/conf.d /etc/nginx/sites-enabled /etc/nginx/sites-available}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
STATE_DIR="${STATE_DIR:-/var/lib/wayi}"
CRON_DIR="${CRON_DIR:-/etc/cron.d}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Dossier personnel réel de l'utilisateur wayi (jamais supprimé : PM2 en a besoin)
APP_HOME="${APP_HOME:-$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6 || true)}"
APP_HOME="${APP_HOME:-/home/$APP_USER}"

die() { printf '\n\033[1;31mERREUR : %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Lancez ce script en root."

PM2_ROOT=(); PM2_USER=(); UNITS=(); CONTAINERS=(); VOLUMES=(); NGINX_FILES=(); DIRS=(); FILES=()

# Noms des processus PM2 contenant « wayi » (sans dépendre de python : simple extraction de texte)
pm2_names() { grep -o '"name":"[^"]*"' | cut -d'"' -f4 | sort -u | grep -i wayi || true; }

# ── Inventaire ───────────────────────────────────────────────────────
if command -v pm2 >/dev/null 2>&1; then
  while IFS= read -r n; do [ -n "$n" ] && PM2_ROOT+=("$n"); done < <(pm2 jlist 2>/dev/null | pm2_names)
  if id "$APP_USER" >/dev/null 2>&1; then
    while IFS= read -r n; do [ -n "$n" ] && PM2_USER+=("$n"); done < <(runuser -u "$APP_USER" -- pm2 jlist 2>/dev/null | pm2_names)
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  while IFS= read -r u; do [ -n "$u" ] && UNITS+=("$u"); done < <(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -i wayi || true)
fi

if command -v docker >/dev/null 2>&1; then
  while IFS= read -r c; do [ -n "$c" ] && CONTAINERS+=("$c"); done < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i wayi || true)
  while IFS= read -r v; do [ -n "$v" ] && VOLUMES+=("$v"); done < <(docker volume ls -q 2>/dev/null | grep -i wayi || true)
fi

for d in $NGINX_DIRS; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do [ -n "$f" ] && NGINX_FILES+=("$f"); done < <(grep -RIil -e wayi "$d" 2>/dev/null || true)
done

# Dossiers « wayi » à 2 niveaux de profondeur, en protégeant le paquet en cours, la migration et les archives.
# Le dossier personnel de l'utilisateur wayi n'est pas supprimé (PM2 en a besoin) : seulement son contenu WAYI.
for root in $SCAN_DIRS; do
  [ -d "$root" ] || continue
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ "$p" = "$SRC_DIR" ] && continue
    case "$p" in "$SRC_DIR"/*) continue ;; esac
    [ "$p" = "$APP_HOME" ] && continue
    DIRS+=("$p")
  done < <(find "$root" -maxdepth 2 -type d -iname '*wayi*' \
             -not -name 'wayi-backend-vps*' -not -name 'wayi-migration*' -not -name 'wayi-release*' 2>/dev/null || true)
done
[ -d "$APP_HOME/.pm2" ] && DIRS+=("$APP_HOME/.pm2")

for f in "$CRON_DIR/wayi-backup" "$CRON_DIR/wayi-certbot" "$BIN_DIR/wayi-backup-db" "$BIN_DIR/wayi-pm2"; do
  [ -e "$f" ] && FILES+=("$f")
done
[ -d "$STATE_DIR" ] && DIRS+=("$STATE_DIR")

# Programmes qui écoutent sur les ports du backend (information, supprimés en dernier si ce sont des « server.js »)
port_pids() {  # port_pids PORT -> un PID par ligne
  command -v ss >/dev/null 2>&1 || return 0
  ss -tlnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true
}
cmdline_of() { { tr '\0' ' ' < "/proc/$1/cmdline"; } 2>/dev/null || true; }   # le processus a pu disparaître entre-temps

# ── Affichage ────────────────────────────────────────────────────────
show() { local title="$1"; shift; [ "$#" -gt 0 ] || return 0; printf '  %s\n' "$title"; for x in "$@"; do printf '      %s\n' "$x"; done; FOUND=1; }
FOUND=0
echo
echo "Ce qui a été trouvé et sera SUPPRIMÉ :"
show "Processus PM2 (root)"           "${PM2_ROOT[@]+"${PM2_ROOT[@]}"}"
show "Processus PM2 (utilisateur $APP_USER)" "${PM2_USER[@]+"${PM2_USER[@]}"}"
show "Services système"               "${UNITS[@]+"${UNITS[@]}"}"
show "Conteneurs Docker"              "${CONTAINERS[@]+"${CONTAINERS[@]}"}"
show "Volumes Docker (données de la base)" "${VOLUMES[@]+"${VOLUMES[@]}"}"
show "Configurations Nginx"           "${NGINX_FILES[@]+"${NGINX_FILES[@]}"}"
show "Dossiers"                       "${DIRS[@]+"${DIRS[@]}"}"
show "Fichiers"                       "${FILES[@]+"${FILES[@]}"}"

echo
echo "Programmes qui occupent actuellement les ports du backend :"
anything=0
for port in $APP_PORTS; do
  for pid in $(port_pids "$port"); do
    anything=1; printf '      port %s : PID %s  %s\n' "$port" "$pid" "$(cmdline_of "$pid")"
  done
done
[ "$anything" = 1 ] || echo "      (aucun)"
for port in 80 443; do
  for pid in $(port_pids "$port"); do
    c="$(cmdline_of "$pid")"
    case "$c" in *nginx*) ;; *) printf '  ATTENTION : le port %s est utilisé par un autre programme que Nginx (PID %s : %s)\n  Il empêchera Nginx de démarrer. Ce script ne le supprime pas : arrêtez-le vous-même.\n' "$port" "$pid" "$c" ;; esac
  done
done

if [ "$FOUND" = 0 ] && [ "$anything" = 0 ]; then
  echo; echo "Rien à supprimer : le serveur est propre. Vous pouvez lancer :  bash deploy/setup-vps.sh"; exit 0
fi

echo
if [ "${YES:-0}" != "1" ]; then
  [ -t 0 ] || die "Pas de terminal pour confirmer. Relancez avec YES=1 si vous êtes sûr."
  read -r -p "Tapez OUI (en majuscules) pour tout supprimer, autre chose pour annuler : " ans
  [ "$ans" = "OUI" ] || { echo "Annulé : rien n'a été supprimé."; exit 1; }
fi

# ── Suppression ──────────────────────────────────────────────────────
echo; echo "Suppression en cours..."
for n in "${PM2_ROOT[@]+"${PM2_ROOT[@]}"}"; do pm2 delete "$n" >/dev/null 2>&1 || true; done
[ "${#PM2_ROOT[@]}" -gt 0 ] && { pm2 save --force >/dev/null 2>&1 || true; }
for n in "${PM2_USER[@]+"${PM2_USER[@]}"}"; do runuser -u "$APP_USER" -- pm2 delete "$n" >/dev/null 2>&1 || true; done
[ "${#PM2_USER[@]}" -gt 0 ] && { runuser -u "$APP_USER" -- pm2 save --force >/dev/null 2>&1 || true; }

for u in "${UNITS[@]+"${UNITS[@]}"}"; do
  systemctl disable --now "$u" >/dev/null 2>&1 || true
  rm -f "$SYSTEMD_DIR/$u"
done
[ "${#UNITS[@]}" -gt 0 ] && { systemctl daemon-reload >/dev/null 2>&1 || true; }

for c in "${CONTAINERS[@]+"${CONTAINERS[@]}"}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
for v in "${VOLUMES[@]+"${VOLUMES[@]}"}"; do docker volume rm -f "$v" >/dev/null 2>&1 || true; done

if [ "${#NGINX_FILES[@]}" -gt 0 ]; then
  for f in "${NGINX_FILES[@]}"; do
    # Un lien (sites-enabled) et sa cible (sites-available) : on retire les deux.
    if [ -L "$f" ]; then rm -f "$(readlink -f "$f" 2>/dev/null || true)" 2>/dev/null || true; fi
    rm -f "$f"
  done
  if command -v nginx >/dev/null 2>&1; then
    if nginx -t >/dev/null 2>&1; then systemctl reload nginx >/dev/null 2>&1 || true
    else echo "  ATTENTION : la configuration Nginx restante n'est pas valide (nginx -t). Setup la régénérera."; fi
  fi
fi

for d in "${DIRS[@]+"${DIRS[@]}"}"; do rm -rf "$d"; done
for f in "${FILES[@]+"${FILES[@]}"}"; do rm -f "$f"; done

# Programmes encore présents sur les ports du backend : arrêtés seulement s'il s'agit d'un server.js / wayi
for port in $APP_PORTS; do
  for pid in $(port_pids "$port"); do
    c="$(cmdline_of "$pid")"
    case "$c" in
      *server.js*|*wayi*) kill "$pid" 2>/dev/null || true; sleep 1; kill -9 "$pid" 2>/dev/null || true; echo "  Processus arrêté : PID $pid ($c) sur le port $port" ;;
      *) echo "  Laissé en place (ne ressemble pas au backend WAYI) : PID $pid ($c) sur le port $port" ;;
    esac
  done
done

echo
echo "Nettoyage terminé. Prochaine étape :  bash deploy/setup-vps.sh"
