// ============================================================
// WAYI Bénin : univers Mode (vente de mode neuve et d'occasion)
// Cahier des charges « Mode Bénin ». L'univers est MASQUÉ au public
// tant que l'administration ne l'active pas depuis le back office.
//   hidden : invisible (sauf comptes testeurs)
//   soon   : annoncé aux clients (« Bientôt »), sans annonces
//   live   : ouvert à tous
// ============================================================

const CATEGORIES = [
  { id: 'robes', label: 'Robes', icon: 'shirt' },
  { id: 'hauts', label: 'Hauts', icon: 'shirt' },
  { id: 'pantalons', label: 'Pantalons', icon: 'ruler' },
  { id: 'jupes', label: 'Jupes', icon: 'scissors' },
  { id: 'chaussures', label: 'Chaussures', icon: 'footprints' },
  { id: 'sacs', label: 'Sacs', icon: 'shopping-bag' },
  { id: 'pagnes', label: 'Pagnes et tissus', icon: 'layers' },
  { id: 'homme', label: 'Homme', icon: 'user' },
  { id: 'enfants', label: 'Enfants', icon: 'baby' },
  { id: 'accessoires', label: 'Accessoires', icon: 'watch' },
];

const CONDITIONS = [
  { id: 'neuf', label: 'Neuf, non porté' },
  { id: 'tres_bon', label: 'Très bon état' },
  { id: 'bon', label: 'Bon état' },
  { id: 'occasion', label: 'Occasion' },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Taille unique',
  '34', '36', '38', '40', '42', '44', '46',
  '35', '37', '39', '41', '43', '45',
  '2 ans', '4 ans', '6 ans', '8 ans', '10 ans', '12 ans'];

const CITIES = ['Cotonou', 'Abomey-Calavi', 'Porto-Novo', 'Parakou', 'Bohicon', 'Ouidah', 'Lokossa', 'Natitingou', 'Djougou', 'Autre ville'];

const REPORT_REASONS = [
  { id: 'contrefacon', label: 'Contrefaçon' },
  { id: 'arnaque', label: 'Arnaque ou fausse annonce' },
  { id: 'interdit', label: 'Article interdit' },
  { id: 'photos', label: 'Photos inappropriées' },
  { id: 'doublon', label: 'Annonce en double' },
  { id: 'autre', label: 'Autre raison' },
];

const ORDER_STEPS = [
  { id: 'confirmed', label: 'Commande confirmée' },
  { id: 'handed', label: 'Remise au livreur' },
  { id: 'on_the_way', label: 'En route' },
  { id: 'delivered', label: 'Livrée' },
];

const PAYMENT_METHODS = [
  { id: 'mtn', label: 'MTN MoMo' },
  { id: 'moov', label: 'Moov Money' },
  { id: 'celtiis', label: 'Celtiis Cash' },
  { id: 'cash', label: 'Paiement à la livraison' },
];

// Tout l'état de l'univers Mode, sauvegardé avec le reste (instantané PostgreSQL)
const mode = {
  settings: {
    state: 'hidden',
    testers: [],            // e-mails qui voient l'univers même masqué
    commissionRate: 0.10,   // commission WAYI sur chaque vente
    deliveryFee: 1000,      // livraison forfaitaire (FCFA)
    launchOffer: { enabled: true, sellers: 20, sales: 5 }, // 0 frais : 5 premières ventes des 20 premiers vendeurs
    maxPhotos: 8,
  },
  listings: [],
  favorites: {},           // userId -> [listingId]
  conversations: [],
  reports: [],
  reviews: [],
  orders: [],
  launchSellers: [],       // vendeurs inscrits à l'offre de lancement (dans l'ordre)
  shops: [],               // boutiques partenaires (comptes créés par WAYI, nom caché aux clients)
};

function restoreMode(saved) {
  if (!saved || typeof saved !== 'object') return;
  Object.assign(mode.settings, saved.settings || {});
  mode.settings.launchOffer = { enabled: true, sellers: 20, sales: 5, ...(saved.settings?.launchOffer || {}) };
  for (const k of ['listings', 'conversations', 'reports', 'reviews', 'orders', 'launchSellers', 'shops']) {
    mode[k].length = 0;
    if (Array.isArray(saved[k])) mode[k].push(...saved[k]);
  }
  mode.favorites = saved.favorites && typeof saved.favorites === 'object' ? saved.favorites : {};
}

const STATES = ['hidden', 'soon', 'live'];

// L'univers est-il visible pour ce compte ? (les testeurs voient tout, même masqué)
function modeAccess(user) {
  const st = mode.settings.state;
  const tester = !!user?.email && mode.settings.testers.includes(String(user.email).toLowerCase());
  if (st === 'live' || tester) return 'live';
  return st; // hidden ou soon
}

const label = (list, id) => list.find(x => x.id === id)?.label || id;

function sellerStats(sellerId) {
  const revs = mode.reviews.filter(r => r.sellerId === sellerId);
  const sales = mode.orders.filter(o => o.sellerId === sellerId && o.status === 'delivered').length;
  const rating = revs.length ? Math.round((revs.reduce((s, r) => s + r.rating, 0) / revs.length) * 10) / 10 : null;
  return { rating, reviewsCount: revs.length, sales };
}

// Commission d'une nouvelle vente : 0 pendant l'offre de lancement
function commissionFor(sellerId) {
  const s = mode.settings;
  // Boutique partenaire : sa commission propre (contrat), sinon celle de WAYI ; pas d'offre de lancement
  const shop = mode.shops.find(x => x.id === sellerId);
  if (shop) return { rate: shop.commissionRate ?? s.commissionRate, launchOffer: false };
  const offer = s.launchOffer;
  if (offer?.enabled) {
    const rank = mode.launchSellers.indexOf(sellerId);
    if (rank !== -1 && rank < offer.sellers) {
      const done = mode.orders.filter(o => o.sellerId === sellerId && o.status !== 'cancelled').length;
      if (done < offer.sales) return { rate: 0, launchOffer: true };
    }
  }
  return { rate: s.commissionRate, launchOffer: false };
}

module.exports = {
  mode, restoreMode, modeAccess, sellerStats, commissionFor, label, STATES,
  CATEGORIES, CONDITIONS, SIZES, CITIES, REPORT_REASONS, ORDER_STEPS, PAYMENT_METHODS,
};
