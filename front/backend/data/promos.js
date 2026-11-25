// ============================================================
// WAYI - Codes promo (a modifier ici, puis redeployer le serveur)
//   code          ce que le client tape a l'inscription (majuscules ou minuscules)
//   percent       reduction en % sur le prix des plats (pas sur la livraison)
//   maxDiscount   plafond de la reduction en FCFA (null = pas de plafond)
//   active        false pour desactiver le code sans le supprimer
//   expiresAt     date limite (null = sans limite), ex : '2027-03-31'
// La reduction s'applique a la PREMIERE commande du client. Si cette commande
// est annulee, la reduction reste disponible pour la suivante.
// WAYI prend la reduction a sa charge : le restaurant touche le prix complet.
// ============================================================
module.exports = [
  { code: 'WAYI20', percent: 20, maxDiscount: null, active: true, expiresAt: null, label: '-20 % sur ta première commande' },
];
