#!/usr/bin/env bash
# Vérifie que le backend répond ET que le CORS accepte bien les trois applications.
#
#   bash deploy/smoke-test.sh                                   (en local sur le serveur, port 3010)
#   bash deploy/smoke-test.sh http://127.0.0.1 api.wayibenin.com   (à travers Nginx, avant la bascule DNS)
#   bash deploy/smoke-test.sh https://api.wayibenin.com          (après la bascule DNS)
#
# Arguments : 1) adresse de base   2) (facultatif) nom de domaine à envoyer dans l'en-tête Host
#            3) (facultatif) adresse IP à utiliser pour résoudre le domaine de l'adresse de base, sans passer
#               par le DNS (ex. : bash deploy/smoke-test.sh https://api.wayibenin.com "" 127.0.0.1)
set -uo pipefail

BASE="${1:-http://127.0.0.1:3010}"
HOST_HEADER="${2:-}"
RESOLVE_IP="${3:-}"
ALLOWED=("https://www.wayibenin.com" "https://driver.wayibenin.com" "https://admin.wayibenin.com")
BLOCKED="https://site-inconnu.example"

CURL=(curl -s -m 15)
[ -n "$HOST_HEADER" ] && CURL+=(-H "Host: $HOST_HEADER")
if [ -n "$RESOLVE_IP" ]; then
  RHOST="${BASE#*://}"; RHOST="${RHOST%%/*}"; RPORT=443; case "$BASE" in http://*) RPORT=80 ;; esac
  case "$RHOST" in *:*) RPORT="${RHOST##*:}"; RHOST="${RHOST%%:*}" ;; esac
  CURL+=(--resolve "${RHOST}:${RPORT}:${RESOLVE_IP}")
fi
FAIL=0
ok()   { printf '  OK     %s\n' "$1"; }
fail() { printf '  ECHEC  %s\n' "$1"; FAIL=$((FAIL+1)); }
header() { grep -i "^$1:" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

echo "Santé du serveur"
HEALTH="$("${CURL[@]}" "$BASE/health" || true)"
if echo "$HEALTH" | grep -q '"status":"ok"'; then ok "/health répond"; else fail "/health ne répond pas ($HEALTH)"; fi
if echo "$HEALTH" | grep -q '"database":"postgresql"'; then ok "base de données PostgreSQL connectée"; else fail "base de données absente ou injoignable (vérifiez DATABASE_URL dans .env et :  docker ps ; docker logs wayi-postgres). Sans base, les données sont perdues à chaque redémarrage"; fi

echo "CORS : applications autorisées"
for o in "${ALLOWED[@]}"; do
  got="$("${CURL[@]}" -i -X OPTIONS "$BASE/api/auth/login" -H "Origin: $o" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization" | header access-control-allow-origin)"
  [ "$got" = "$o" ] && ok "API : $o" || fail "API : $o refusé (reçu : '${got:-rien}')"
  got="$("${CURL[@]}" -i "$BASE/socket.io/?EIO=4&transport=polling" -H "Origin: $o" | header access-control-allow-origin)"
  [ "$got" = "$o" ] && ok "Temps réel (Socket.io) : $o" || fail "Temps réel : $o refusé (reçu : '${got:-rien}')"
done

echo "CORS : site non autorisé (doit être refusé)"
got="$("${CURL[@]}" -i -X OPTIONS "$BASE/api/auth/login" -H "Origin: $BLOCKED" -H "Access-Control-Request-Method: POST" | header access-control-allow-origin)"
[ -z "$got" ] && ok "$BLOCKED correctement refusé" || fail "$BLOCKED accepté à tort"

echo
if [ "$FAIL" -eq 0 ]; then echo "Tout est bon."; else echo "$FAIL vérification(s) en échec."; exit 1; fi
