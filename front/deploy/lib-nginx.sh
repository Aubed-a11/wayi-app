#!/usr/bin/env bash
# Fonctions Nginx partagées par setup-vps.sh et enable-ssl.sh (chargées avec « source »).
# Nécessite que le script appelant définisse die().

# detect_https_listen : affiche la valeur de « listen » à donner au bloc HTTPS de l'API.
#  - Serveur Nginx classique : « 443 ssl http2 ».
#  - Serveur où un routeur TCP (module « stream » avec ssl_preread) est placé devant les sites : le port 443
#    appartient au routeur, qui renvoie chaque site vers une voie interne. Les sites HTTPS écoutent alors sur
#    l'adresse interne de la voie par défaut du routeur (ex. 127.0.0.1:8444), jamais sur le 443 lui-même.
# Retourne une erreur si un routeur est présent mais que sa voie par défaut est introuvable : on ne devine pas.
# WAYI_HTTPS_LISTEN force la valeur (dépannage).
detect_https_listen() {
  if [ -n "${WAYI_HTTPS_LISTEN:-}" ]; then printf '%s' "$WAYI_HTTPS_LISTEN"; return 0; fi
  local cfg flat up
  cfg="$(nginx -T 2>/dev/null || true)"
  flat="$(printf '%s' "$cfg" | tr '\n' ' ')"      # indépendant de la mise en forme (une directive par ligne ou tout sur une ligne)
  if printf '%s' "$flat" | grep -Eq '(^|[;{[:space:]])ssl_preread[[:space:]]+on[[:space:]]*;'; then
    up="$(printf '%s' "$flat" | grep -Eo 'map[[:space:]]+\$ssl_preread_server_name[[:space:]]+\$[A-Za-z_0-9]+[[:space:]]*\{[^}]*' \
          | grep -Eo 'default[[:space:]]+127\.0\.0\.1:[0-9]+' | head -1 | awk '{print $2}')"
    [ -n "$up" ] || return 1
    printf '%s ssl http2' "$up"
  else
    printf '443 ssl http2'
  fi
}

_nginx_rollback() {  # _nginx_rollback FICHIER : remet l'ancienne version (FICHIER.prev), ou retire le fichier s'il n'existait pas
  if [ -f "$1.prev" ]; then cp "$1.prev" "$1"; else rm -f "$1"; fi
}

# safe_nginx_reload FICHIER : à appeler juste APRÈS avoir écrit FICHIER (l'ancienne version, si elle existait, est dans FICHIER.prev).
# « nginx -t » ne détecte PAS les conflits de port : un rechargement raté laisse Nginx sur son ancienne configuration en mémoire
# alors que le fichier sur disque est fautif, et le prochain redémarrage de Nginx (ou du serveur) échouerait pour TOUS les sites.
# Ici, si le rechargement journalise une erreur [emerg], on remet l'ancienne version du fichier avant de s'arrêter.
safe_nginx_reload() {
  local conf="$1" errlog="${NGINX_ERROR_LOG:-/var/log/nginx/error.log}" before emerg
  if ! nginx -t >/dev/null 2>&1; then
    nginx -t 2>&1 | tail -4 >&2 || true
    _nginx_rollback "$conf"
    die "Configuration Nginx invalide : l'ancienne version a été remise en place, vos sites ne sont pas affectés."
  fi
  before="$({ wc -l < "$errlog"; } 2>/dev/null || echo 0)"
  systemctl reload nginx
  sleep "${NGINX_RELOAD_WAIT:-6}"   # un rechargement raté réessaie 5 fois, à 500 ms d'écart
  emerg="$(tail -n +"$((before + 1))" "$errlog" 2>/dev/null | grep -c '\[emerg\]' || true)"
  if [ "${emerg:-0}" -gt 0 ]; then
    tail -n +"$((before + 1))" "$errlog" | grep '\[emerg\]' | head -3 >&2 || true
    _nginx_rollback "$conf"
    systemctl reload nginx || true
    die "Nginx a refusé la nouvelle configuration (${emerg} erreur(s) ci-dessus). L'ancienne version est remise en place : vos sites ne sont pas affectés."
  fi
}
