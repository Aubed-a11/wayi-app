#!/bin/bash
# Sauvegarde des donnees WAYI (clients, restaurants, plats, commandes, livreurs)
# AVANT chaque mise a jour du serveur. Si la sauvegarde echoue, la mise a jour s'arrete.
set -e
B=/home/wayi/wayi-backend
D=/home/wayi/sauvegardes
mkdir -p "$D"
F="$D/donnees-$(date +%Y%m%d-%H%M).json"
cd "$B"
node -e "
require('dotenv').config();
const fs=require('fs');
const m=require('./services/database/postgres');
(async()=>{
  if(!m.getPool()){console.error('   Pas de base configuree (DATABASE_URL) : rien a sauvegarder.');process.exit(1);}
  const s=await m.loadAppState();
  if(!s){console.error('   Base vide : rien a sauvegarder.');process.exit(1);}
  fs.writeFileSync('$F',JSON.stringify(s));
  const n=k=>Array.isArray(s[k])?s[k].length:0;
  console.log('   Sauvegarde OK : '+n('users')+' clients, '+n('restaurants')+' restaurants, '+n('dishes')+' plats, '+n('orders')+' commandes, '+n('drivers')+' livreurs, '+n('merchants')+' comptes restaurant');
  process.exit(0);
})().catch(e=>{console.error('   Erreur de lecture de la base :',e.message);process.exit(1);});
"
cp "$F" /root/derniere-sauvegarde-wayi.json
chmod 600 "$F" /root/derniere-sauvegarde-wayi.json
# On garde les 30 dernieres sauvegardes
ls -1t "$D"/donnees-*.json | tail -n +31 | xargs -r rm -f
echo "   Fichier : $F"
