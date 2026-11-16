// Remet une sauvegarde (data/sauvegarde/*.json) dans la base PostgreSQL.
// A n'utiliser qu'en cas de perte de donnees : ecrase l'etat actuel de la base.
// Usage : node scripts/restaurer-sauvegarde.js [fichier.json] --confirmer
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, loadAppState, saveAppState } = require('../services/database/postgres');

(async () => {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirmer');
  let file = args.find(a => a.endsWith('.json'));
  if (!file) {
    const dir = path.join(__dirname, '..', 'data', 'sauvegarde');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
    if (!files.length) { console.error('Aucune sauvegarde dans data/sauvegarde.'); process.exit(1); }
    file = path.join(dir, files[files.length - 1]);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = k => (Array.isArray(data[k]) ? data[k].length : 0);
  console.log(`Sauvegarde : ${path.basename(file)}`);
  console.log(`  ${n('users')} clients, ${n('restaurants')} restaurants, ${n('dishes')} plats, ${n('orders')} commandes, ${n('drivers')} livreurs, ${n('merchants')} comptes restaurant`);

  if (!getPool()) { console.error('DATABASE_URL absent du .env : aucune base a restaurer.'); process.exit(1); }
  const current = await loadAppState();
  if (current) {
    const c = k => (Array.isArray(current[k]) ? current[k].length : 0);
    console.log(`Base actuelle : ${c('users')} clients, ${c('restaurants')} restaurants, ${c('dishes')} plats, ${c('orders')} commandes`);
  }
  if (!confirm) {
    console.log('\nRien n\'a ete modifie. Pour remplacer la base par cette sauvegarde, relance avec --confirmer');
    console.log('puis redemarre le serveur : wayi-pm2 restart wayi-backend');
    process.exit(0);
  }
  if (current) {
    const keep = path.join(__dirname, '..', 'data', 'sauvegarde', `avant-restauration-${Date.now()}.json`);
    fs.writeFileSync(keep, JSON.stringify(current));
    console.log(`Etat actuel garde dans ${path.basename(keep)}`);
  }
  await saveAppState(data);
  console.log('Sauvegarde restauree. Redemarre le serveur : wayi-pm2 restart wayi-backend');
  process.exit(0);
})().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
