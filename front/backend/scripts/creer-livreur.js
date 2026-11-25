// Cree un compte livreur sur le serveur en marche (appel local de l'API admin).
// Le livreur recoit ses identifiants par e-mail. Usage :
//   node scripts/creer-livreur.js "Prenom Nom" email@exemple.com [telephone]
require('dotenv').config();
const { loadAppState } = require('../services/database/postgres');
const { signToken } = require('../middleware/auth');

(async () => {
  const [name, email, phone] = process.argv.slice(2);
  if (!name || !email) { console.error('Usage : node scripts/creer-livreur.js "Nom" email [telephone]'); process.exit(1); }
  const state = await loadAppState();
  const adminId = state?.admins?.[0]?.id || require('../data/store').admins?.[0]?.id;
  if (!adminId) { console.error('Aucun compte admin trouve.'); process.exit(1); }
  const token = signToken({ id: adminId, role: 'admin' });
  const port = process.env.PORT || 3001;
  const r = await fetch(`http://127.0.0.1:${port}/api/admin/drivers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, email, phone, vehicleType: 'moto' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Echec :', r.status, d.error || ''); process.exit(1); }
  console.log(`Livreur cree : ${d.driver?.name} (${d.driver?.email})`);
  console.log(d.emailSimulated ? "E-mail NON envoye : mot de passe temporaire a transmettre a la main." : 'Identifiants envoyes par e-mail.');
  if (d.devPassword) console.log('MOT_DE_PASSE_TEMPORAIRE_DISPONIBLE');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
