// ============================================================
// WAYI — Module Telemarketing (outil d'appels pour l'équipe WAYI)
// Construit les listes de clients et de restaurants à appeler à partir des
// données existantes, fournit le script d'appel adapté à chaque cas, et tient
// à jour les statistiques à partir du journal des appels.
// ============================================================
const { users, merchants, restaurants, dishes, orders, callLogs, PLATFORM_CONFIG } = require('../../data/store');

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_AFTER_DAYS = 14;
const EXPIRING_WITHIN_DAYS = 3;

// Résultat d'un appel. "Joint" = quelqu'un a répondu ; "converti" = l'objectif de l'appel est atteint.
const OUTCOMES = {
  no_answer:      { label: 'Pas de réponse',  reached: false },
  wrong_number:   { label: 'Mauvais numéro',  reached: false },
  callback:       { label: 'À rappeler',      reached: true },
  interested:     { label: 'Intéressé',       reached: true },
  not_interested: { label: 'Pas intéressé',   reached: true },
  converted:      { label: 'Converti',        reached: true },
  do_not_call:    { label: 'Ne plus appeler', reached: true },
};

const SEGMENTS = {
  client: {
    never_ordered:         'Jamais commandé',
    inactive:              `Inactif depuis plus de ${INACTIVE_AFTER_DAYS} jours`,
    subscription_expiring: `Abonnement expiré ou qui expire sous ${EXPIRING_WITHIN_DAYS} jours`,
    callbacks_due:         'Rappels à faire',
  },
  restaurant: {
    no_dishes:     'Menu vide',
    no_orders:     'Aucune commande reçue',
    not_verified:  'Pas encore vérifié',
    callbacks_due: 'Rappels à faire',
  },
};

function firstName(name) { return (name || '').trim().split(/\s+/)[0] || ''; }

function lastCallOf(targetId) {
  let last = null;
  for (const c of callLogs) {
    if (c.targetId === targetId && (!last || c.createdAt > last.createdAt)) last = c;
  }
  return last;
}
function callCountOf(targetId) { return callLogs.filter(c => c.targetId === targetId).length; }
function isDoNotCall(targetId) { return callLogs.some(c => c.targetId === targetId && c.outcome === 'do_not_call'); }

// ── Scripts d'appel ───────────────────────────────────────────
// Chaque script suit la logique CAB (Caractéristiques, Avantages, Bénéfices) du reste du produit.
function scriptFor(type, key, t) {
  const weekly = PLATFORM_CONFIG.clientSubscriptionPlans.weekly;
  const monthly = PLATFORM_CONFIG.clientSubscriptionPlans.monthly;
  const prenom = firstName(t.contactName || t.name);
  const closing = { heading: 'Clôture', text: "Merci pour votre temps, bonne journée. N'hésitez pas à nous recontacter si besoin." };

  const scripts = {
    'client.never_ordered': {
      title: 'Client inscrit qui n\'a jamais commandé',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je m'appelle [votre prénom], de WAYI. Vous avez créé votre compte mais vous n'avez pas encore passé de commande : je voulais savoir si vous aviez rencontré une difficulté.` },
        { heading: 'Caractéristiques', text: 'Vous choisissez directement un plat, préparé par un restaurant partenaire, et vous suivez votre commande en direct jusqu\'à la livraison. Le paiement se fait par mobile money, carte ou espèces.' },
        { heading: 'Avantages et bénéfices', text: 'Vous gagnez du temps : pas de menus à comparer, et vous savez à chaque instant où en est votre repas.' },
        { heading: 'Question à poser', text: 'Qu\'est-ce qui vous a empêché de commander jusqu\'ici ? Quel plat vous ferait envie ?' },
        { heading: 'Proposition', text: 'Je vous invite à ouvrir l\'application et à regarder les plats populaires du jour.' },
        closing,
      ],
    },
    'client.inactive': {
      title: 'Client inactif',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. Cela fait un moment que vous n'avez pas commandé, je prends de vos nouvelles.` },
        { heading: 'Avantages', text: 'De nouveaux plats sont régulièrement ajoutés, et les plus commandés et les plus appréciés sont mis en avant sur l\'accueil.' },
        { heading: 'Offre', text: `Si vous commandez souvent, l'abonnement hebdomadaire (${weekly.price.toLocaleString('fr')} FCFA) ou mensuel (${monthly.price.toLocaleString('fr')} FCFA) offre la livraison gratuite pendant sa durée.` },
        { heading: 'Question à poser', text: 'Avez-vous été satisfait de votre dernière commande ? Qu\'est-ce qui pourrait vous donner envie de recommander ?' },
        closing,
      ],
    },
    'client.subscription_expiring': {
      title: 'Abonnement client à renouveler',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. Votre abonnement de livraison gratuite arrive à échéance${t.context?.subscriptionExpiresAt ? ` (le ${new Date(t.context.subscriptionExpiresAt).toLocaleDateString('fr')})` : ''}.` },
        { heading: 'Avantages', text: 'Le renouveler vous permet de continuer sans frais de livraison. Si vous le renouvelez avant la fin, les jours restants sont conservés.' },
        { heading: 'Question à poser', text: `Souhaitez-vous renouveler en formule hebdomadaire (${weekly.price.toLocaleString('fr')} FCFA) ou mensuelle (${monthly.price.toLocaleString('fr')} FCFA) ?` },
        { heading: 'Proposition', text: 'Le renouvellement se fait dans l\'application, onglet Profil puis Abonnement.' },
        closing,
      ],
    },
    'restaurant.no_dishes': {
      title: 'Restaurant dont le menu est vide',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. Le compte de ${t.name} est créé, mais le menu est encore vide : puis-je vous aider à le remplir ?` },
        { heading: 'Caractéristiques', text: 'Dans l\'onglet Mon menu, vous ajoutez chaque plat avec son nom, sa photo et son prix.' },
        { heading: 'Avantages et bénéfices', text: 'Chaque plat est présenté avec ses Caractéristiques, ses Avantages et ses Bénéfices : c\'est ce qui donne envie au client de commander.' },
        { heading: 'Question à poser', text: 'Quels sont vos plats les plus demandés ? Voulez-vous que nous les saisissions ensemble ?' },
        closing,
      ],
    },
    'restaurant.no_orders': {
      title: 'Restaurant sans commande',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. ${t.name} n'a pas encore reçu de commande sur la plateforme et je voulais comprendre pourquoi.` },
        { heading: 'Avantages', text: 'Une belle photo et une formulation complète (Caractéristiques, Avantages, Bénéfices) donnent envie de commander, et les plats les plus commandés sont mis en avant sur l\'accueil.' },
        { heading: 'Question à poser', text: 'Votre menu est-il à jour pour les périodes de la journée où vous cuisinez ? Rencontrez-vous une difficulté avec votre espace restaurant ?' },
        closing,
      ],
    },
    'restaurant.not_verified': {
      title: 'Restaurant pas encore vérifié',
      sections: [
        { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. L'équipe doit encore vérifier les informations de ${t.name} sur la plateforme.` },
        { heading: 'Question à poser', text: 'Pouvez-vous me confirmer le nom du restaurant, son adresse et sa position, ainsi que les plats que vous proposez ?' },
        closing,
      ],
    },
    'client.callbacks_due': null, 'restaurant.callbacks_due': null,
  };

  const found = scripts[`${type}.${key}`];
  if (found) return found;
  return {
    title: 'Rappel',
    sections: [
      { heading: 'Ouverture', text: `Bonjour ${prenom}, je suis de WAYI. Je vous rappelle comme convenu lors de notre dernier échange.` },
      { heading: 'Rappel du contexte', text: t.lastCall?.note ? `Note du dernier appel : ${t.lastCall.note}` : 'Reprendre le point là où il a été laissé.' },
      closing,
    ],
  };
}

// ── Construction des listes ───────────────────────────────────
function userOrders(userId) { return orders.filter(o => o.userId === userId && o.status !== 'cancelled'); }

function clientTarget(u, now) {
  const mine = userOrders(u.id);
  const lastOrderAt = mine.reduce((m, o) => (o.createdAt > m ? o.createdAt : m), '');
  const reasons = [];
  if (mine.length === 0) reasons.push('never_ordered');
  else if (now - new Date(lastOrderAt).getTime() > INACTIVE_AFTER_DAYS * DAY_MS) reasons.push('inactive');
  const exp = u.subscription?.expiresAt;
  if (exp && new Date(exp).getTime() - now <= EXPIRING_WITHIN_DAYS * DAY_MS) reasons.push('subscription_expiring');
  return {
    id: u.id, type: 'client', name: u.name, contactName: u.name, email: u.email || null, phone: u.phone || null,
    reasons, context: { ordersCount: mine.length, lastOrderAt: lastOrderAt || null, subscriptionExpiresAt: exp || null },
  };
}

function restaurantTarget(m) {
  const r = restaurants.find(x => x.id === m.restaurantId);
  const dishCount = dishes.filter(d => d.restaurantId === m.restaurantId).length;
  const orderCount = orders.filter(o => o.restaurantId === m.restaurantId && o.status !== 'cancelled').length;
  const reasons = [];
  if (dishCount === 0) reasons.push('no_dishes');
  else if (orderCount === 0) reasons.push('no_orders');
  if (r && r.verified === false) reasons.push('not_verified');
  return {
    id: m.id, type: 'restaurant', name: r?.name || 'Restaurant', contactName: m.name, email: m.email || null, phone: m.phone || null,
    reasons, context: { dishCount, orderCount },
  };
}

// Liste complète des cibles d'un type, avec dernier appel, rappel dû et script. Les personnes
// qui ont demandé à ne plus être appelées sont exclues (sauf includeDoNotCall).
function buildTargets(type, { includeDoNotCall = false } = {}) {
  const now = Date.now();
  const base = type === 'client' ? users.map(u => clientTarget(u, now)) : merchants.map(restaurantTarget);

  return base.map(t => {
    const last = lastCallOf(t.id);
    const callbackDue = !!(last && last.outcome === 'callback' && last.callbackAt && new Date(last.callbackAt).getTime() <= now);
    const reasons = [...t.reasons];
    if (callbackDue) reasons.unshift('callbacks_due');
    return { ...t, reasons, doNotCall: isDoNotCall(t.id), callbackDue, callCount: callCountOf(t.id), lastCall: last, hasPhone: !!t.phone };
  })
  .filter(t => (includeDoNotCall || !t.doNotCall) && t.reasons.length > 0)
  .map(t => ({
    ...t,
    reasonLabels: t.reasons.map(k => SEGMENTS[type][k]),
    script: scriptFor(type, t.reasons[0], t),
  }))
  // Rappels dus d'abord, puis ceux jamais appelés, puis les appels les plus anciens.
  .sort((a, b) => (Number(b.callbackDue) - Number(a.callbackDue)) || (a.callCount - b.callCount) || a.name.localeCompare(b.name));
}

function segmentCounts(type, targets) {
  return Object.entries(SEGMENTS[type]).map(([key, label]) => ({ key, label, count: targets.filter(t => t.reasons.includes(key)).length }));
}

// Pour une liste filtrée sur un segment précis, le script suit ce segment (et non le premier motif).
function withSegmentScript(type, segment, targets) {
  if (!segment) return targets;
  return targets.filter(t => t.reasons.includes(segment)).map(t => ({ ...t, script: scriptFor(type, segment, t) }));
}

function stats() {
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = callLogs.filter(c => new Date(c.createdAt) >= startOfDay);
  const dueIds = new Set();
  for (const c of callLogs) {
    const last = lastCallOf(c.targetId);
    if (last && last.id === c.id && c.outcome === 'callback' && c.callbackAt && new Date(c.callbackAt).getTime() <= now) dueIds.add(c.targetId);
  }
  return {
    callsToday: today.length,
    reachedToday: today.filter(c => OUTCOMES[c.outcome]?.reached).length,
    convertedToday: today.filter(c => c.outcome === 'converted').length,
    callbacksDue: dueIds.size,
    totalCalls: callLogs.length,
  };
}

module.exports = { OUTCOMES, SEGMENTS, buildTargets, segmentCounts, withSegmentScript, stats, lastCallOf };
