// Codes promo de bienvenue : -X % sur la premiere commande du client
const PROMOS = require('../data/promos');
const { orders } = require('../data/store');

const norm = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

/** Code valide aujourd'hui, ou null */
function findPromo(code) {
  const c = norm(code);
  if (!c) return null;
  const p = PROMOS.find(x => norm(x.code) === c);
  if (!p || p.active === false) return null;
  if (p.expiresAt && new Date(p.expiresAt + 'T23:59:59') < new Date()) return null;
  return p;
}

/** Reduction a laquelle le client a droit maintenant (premiere commande), ou null */
function welcomeDiscount(user) {
  if (!user?.promo?.code) return null;
  const p = findPromo(user.promo.code);
  const percent = p ? p.percent : user.promo.percent;
  if (!percent) return null;
  // Premiere commande : aucune commande non annulee avant
  if (orders.some(o => o.userId === user.id && o.status !== 'cancelled')) return null;
  return { code: user.promo.code, percent, maxDiscount: p?.maxDiscount ?? null, label: p?.label || `-${percent} % sur ta première commande` };
}

/** Montant de la reduction sur un sous-total (plats uniquement) */
function discountAmount(promo, subtotal) {
  if (!promo) return 0;
  let d = Math.round((subtotal * promo.percent) / 100);
  if (promo.maxDiscount) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, subtotal));
}

module.exports = { findPromo, welcomeDiscount, discountAmount, normPromo: norm };
