#!/bin/bash
# Recupere le backend WAYI du VPS et ses donnees, dans /root/wayi-recup.tgz
set -e
B=/home/wayi/wayi-backend
R=/root/wayi-recup
rm -rf "$R" /root/wayi-recup.tgz
mkdir -p "$R"

echo "1/4 Code du backend (sans node_modules ni .env)"
tar --exclude=node_modules --exclude=.env --exclude='*.log' -czf "$R/backend.tgz" -C /home/wayi wayi-backend

echo "2/4 Liste des reglages du .env (valeurs masquees)"
if [ -f "$B/.env" ]; then
  sed -E 's/^([A-Za-z0-9_]+)=(.{0,4}).*/\1=\2****/' "$B/.env" | grep -E '^[A-Za-z0-9_]+=' > "$R/env-masque.txt" || true
fi

echo "3/4 Donnees (commandes, clients, restaurants, plats, livreurs)"
cd "$B"
node -e "
require('dotenv').config();
const fs=require('fs');
const m=require('./services/database/postgres');
(async()=>{
  if(!m.getPool()){fs.writeFileSync('$R/donnees.json','null');console.log('   Pas de DATABASE_URL : aucune base configuree');process.exit(0);}
  const s=await m.loadAppState();
  fs.writeFileSync('$R/donnees.json',JSON.stringify(s));
  const n=k=>(s&&Array.isArray(s[k]))?s[k].length:0;
  console.log('   '+n('users')+' clients, '+n('restaurants')+' restaurants, '+n('dishes')+' plats, '+n('orders')+' commandes, '+n('drivers')+' livreurs');
  process.exit(0);
})().catch(e=>{console.error('   Erreur lecture base :',e.message);process.exit(0);});
" || true

echo "4/4 Etat du serveur et derniers journaux"
{
  echo "== pm2 =="; wayi-pm2 list 2>&1 || true
  echo "== logs =="; wayi-pm2 logs wayi-backend --lines 200 --nostream 2>&1 || true
  echo "== sauvegardes =="; ls -d /home/wayi/wayi-backend.sauvegarde-* 2>/dev/null || true
  echo "== node =="; node -v
} > "$R/etat-serveur.txt" 2>&1

tar -czf /root/wayi-recup.tgz -C /root wayi-recup
rm -rf "$R"
echo "OK : /root/wayi-recup.tgz pret"
