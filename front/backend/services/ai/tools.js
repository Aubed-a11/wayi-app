// ============================================================
// WAYI - Outils de Yivi (tool calling)
// Chaque outil s'execute cote serveur, avec les vraies donnees et
// uniquement pour le client connecte. Les prix, frais et totaux sont
// toujours calcules ici, jamais par le modele.
// La commande elle-meme n'est JAMAIS passee par Yivi : preparer_commande
// renvoie un recapitulatif que le client valide d'un clic dans l'appli
// (ecran Panier), qui cree la commande et lance le paiement comme avant.
// ============================================================
const {
  getDishById, getRestaurantById, enrichDish, getOrdersByUser,
  calcDistance, calcDeliveryFee, PERIODS, CATEGORIES, TASTES, outOfZone, outOfZoneMessage,
} = require('../../data/store');
const { PAYMENT_METHODS, methodAvailable, paymentMode } = require('../payment');
const { searchDishes, savePreference, recordRecommendations, beninNow, periodForHour, periodLabel } = require('./recommend');

// Heures de service des restaurants partenaires (heure du Benin)
const SERVICE_START = 6;
const SERVICE_END = 22;
function serviceState() {
  const { hour } = beninNow();
  return { hour, open: hour >= SERVICE_START && hour < SERVICE_END, period: periodForHour(hour) };
}
function cartSignature(cart) {
  return cart.map(c => `${c.dishId}:${c.qty}`).sort().join('|');
}

// Moyens proposes dans l'ecran Panier de l'appli client
const APP_METHODS = ['mtn_momo', 'moov', 'card', 'cash'];
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];
const STATUS_FR = {
  pending: 'en attente de confirmation du restaurant', confirmed: 'confirmée par le restaurant',
  preparing: 'en préparation', ready: 'prête, en attente du livreur', on_the_way: 'livreur en route',
  delivered: 'livrée', cancelled: 'annulée',
};

const TOOL_DEFINITIONS = [
  {
    name: 'chercher_plats',
    description: "Cherche dans le menu du moment les plats qui conviennent le mieux a ce client. Le classement tient deja compte de ses preferences, de son historique et des plats proposes recemment (pour varier). Appelle-le avant toute recommandation : tu ne dois jamais citer un plat qui n'a pas ete renvoye par cet outil.",
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string', enum: PERIODS.map(p => p.id), description: 'Creneau de repas, seulement si le client le precise ou si le contexte l\'impose.' },
        gout: { type: 'string', enum: TASTES.map(t => t.id), description: 'Gout recherche.' },
        eviter_gout: { type: 'string', enum: TASTES.map(t => t.id), description: 'Gout a exclure (ex: epice si le client ne veut rien de pimente).' },
        categorie: { type: 'string', enum: CATEGORIES.map(c => c.id) },
        budget_max: { type: 'integer', description: 'Prix maximum par plat en FCFA.' },
        texte: { type: 'string', description: 'Mots-cles libres (ex: "poisson", "attieke", "sans viande").' },
        inclure_deja_proposes: { type: 'boolean', description: 'true seulement si le client redemande un plat deja propose.' },
      },
    },
  },
  {
    name: 'afficher_plats',
    description: "Affiche au client 1 a 3 plats sous forme de cartes cliquables (photo, prix, bouton Ajouter). Utilise uniquement des identifiants renvoyes par chercher_plats.",
    input_schema: {
      type: 'object',
      properties: { plat_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } },
      required: ['plat_ids'],
    },
  },
  {
    name: 'enregistrer_preference',
    description: "Memorise durablement une preference exprimee par le client (ex: il n'aime pas le piment, il adore l'amiwo, budget 2000 FCFA). Utilise 'oublier' s'il demande de retirer une preference.",
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['aime', 'evite', 'budget', 'note', 'oublier'] },
        valeur: { type: 'string', description: 'Ingredient, plat, gout ou montant en FCFA pour budget.' },
      },
      required: ['type', 'valeur'],
    },
  },
  {
    name: 'modifier_panier',
    description: "Modifie le panier du client (ajouter, retirer, fixer une quantite, ou vider). Ne le fais que si le client l'a demande ou accepte clairement. Renvoie le panier a jour avec les vrais prix et frais.",
    input_schema: {
      type: 'object',
      properties: {
        vider_avant: { type: 'boolean', description: 'Vide le panier avant d\'appliquer les operations.' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['ajouter', 'retirer', 'definir'] },
              plat_id: { type: 'string' },
              quantite: { type: 'integer', minimum: 0, maximum: 20 },
            },
            required: ['action', 'plat_id'],
          },
        },
      },
    },
  },
  {
    name: 'voir_panier',
    description: "Renvoie le panier actuel, les frais de livraison exacts, le total, l'adresse de livraison par defaut et les moyens de paiement disponibles.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'preparer_commande',
    description: "Prepare le recapitulatif final a faire valider par le client (bouton dans l'appli). A appeler seulement quand le client a dit qu'il veut commander. Le client valide ensuite lui-meme et paie dans l'ecran Panier.",
    input_schema: {
      type: 'object',
      properties: { moyen_paiement: { type: 'string', enum: APP_METHODS, description: 'Moyen choisi par le client. Si inconnu, demande-lui avant.' } },
      required: ['moyen_paiement'],
    },
  },
  {
    name: 'infos_wayi',
    description: "Renvoie les informations officielles sur le service WAYI : horaires, zone et frais de livraison, delais, moyens de paiement, annulation, remboursement, abonnement, probleme de commande, contact, allergies, commande pour un groupe, adresse, compte, recu, devenir partenaire ou livreur. Appelle-le des que le client pose une question sur le fonctionnement du service, au lieu de repondre de memoire.",
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'La question du client, reformulee simplement.' } },
      required: ['question'],
    },
  },
  {
    name: 'details_plat',
    description: "Fiche complete d'un plat : description, composition, gout (epice ou non), prix, restaurant, temps de preparation, creneau, presence de viande. Appelle-le quand le client pose une question precise sur un plat (c'est quoi, il y a quoi dedans, c'est epice, c'est copieux, combien de temps...). Donne plat_id si tu l'as, sinon le nom.",
    input_schema: {
      type: 'object',
      properties: { plat_id: { type: 'string' }, nom: { type: 'string', description: 'Nom ou partie du nom du plat.' } },
    },
  },
  {
    name: 'infos_restaurant',
    description: "Infos sur un restaurant partenaire (description, zone, temps de preparation, note) et ses plats actuellement au menu.",
    input_schema: {
      type: 'object',
      properties: { nom: { type: 'string', description: 'Nom ou partie du nom du restaurant.' } },
      required: ['nom'],
    },
  },
  {
    name: 'suivre_commandes',
    description: "Donne l'etat des commandes en cours du client (statut, livreur, heure estimee) et de sa derniere commande livree.",
    input_schema: { type: 'object', properties: {} },
  },
];

// ─── Panier ───────────────────────────────────────────────────
// Le panier vit dans l'appli (etat React). Le client l'envoie avec chaque message ;
// on le revalide ici (plats existants, prix serveur) avant de travailler dessus.
function sanitizeCart(rawCart = []) {
  const out = [];
  for (const it of Array.isArray(rawCart) ? rawCart : []) {
    const dishId = it?.id || it?.dishId;
    const qty = Math.max(0, Math.min(20, parseInt(it?.qty, 10) || 0));
    if (!dishId || !qty || !getDishById(dishId)) continue;
    const existing = out.find(x => x.dishId === dishId);
    if (existing) existing.qty = Math.min(20, existing.qty + qty); else out.push({ dishId, qty });
  }
  return out;
}

// Format exact attendu par le reducer de l'appli client (CART_ADD / CART_SET)
function toClientCart(cart) {
  return cart.map(({ dishId, qty }) => {
    const d = enrichDish(getDishById(dishId));
    return {
      id: d.id, name: d.name, icon: d.icon, image: d.image || null, price: d.price, qty,
      restaurantId: d.restaurantId, restaurantName: d.restaurant?.name, restaurantIcon: d.restaurant?.icon,
    };
  });
}

function defaultAddress(user) {
  return user.addresses?.find(a => a.isDefault) || user.addresses?.[0] || null;
}

const METHOD_LABELS = { mtn_momo: 'MTN MoMo', moov: 'Moov Money', card: 'Carte bancaire', cash: 'Espèces à la livraison' };
function availableMethods() {
  return APP_METHODS.filter(id => methodAvailable(id)).map(id => ({ id, label: METHOD_LABELS[id] || PAYMENT_METHODS.find(m => m.id === id)?.label || id }));
}

// Memes calculs que POST /api/orders (une commande et des frais par restaurant)
// pos (facultatif) : point de livraison choisi pour CETTE commande ; sinon l'adresse par defaut
function cartSummary(user, cart, pos = null) {
  const addr = defaultAddress(user);
  const lat = pos?.lat ?? addr?.lat ?? user.location?.lat;
  const lng = pos?.lng ?? addr?.lng ?? user.location?.lng;
  const freeDelivery = !!(user.subscription?.active && new Date(user.subscription.expiresAt) > new Date());

  const groups = {};
  for (const { dishId, qty } of cart) {
    const d = getDishById(dishId);
    if (!groups[d.restaurantId]) groups[d.restaurantId] = [];
    groups[d.restaurantId].push({ d, qty });
  }
  const restaurants = Object.entries(groups).map(([rid, items]) => {
    const r = getRestaurantById(rid);
    const subtotal = items.reduce((s, i) => s + i.d.price * i.qty, 0);
    const distKm = lat && lng && r?.lat && r?.lng ? calcDistance(lat, lng, r.lat, r.lng) : 2;
    const deliveryFee = freeDelivery ? 0 : calcDeliveryFee(distKm);
    return {
      _km: distKm,
      restaurant: r?.name || 'Restaurant', sous_total: subtotal, frais_livraison: deliveryFee,
      plats: items.map(i => ({
        id: i.d.id, nom: i.d.name, prix: i.d.price, quantite: i.qty, creneau: periodLabel(i.d.period),
        servi_maintenant: i.d.period === serviceState().period,
        exemple_non_commandable: i.d.demo && process.env.ALLOW_DEMO_ORDERS !== '1' ? true : undefined,
      })),
    };
  });
  const subtotal = restaurants.reduce((s, r) => s + r.sous_total, 0);
  const farthest = Math.max(0, ...restaurants.map(r => r._km || 0));
  restaurants.forEach(r => delete r._km);
  const fees = restaurants.reduce((s, r) => s + r.frais_livraison, 0);
  return {
    vide: cart.length === 0,
    restaurants,
    sous_total: subtotal,
    frais_livraison: fees,
    total: subtotal + fees,
    livraison_gratuite_abonnement: freeDelivery,
    hors_zone: outOfZone(farthest) ? outOfZoneMessage(farthest) : undefined,
    adresse_livraison: addr ? [addr.label, addr.address, addr.landmark].filter(Boolean).join(' - ') : null,
    moyens_paiement_disponibles: availableMethods(),
  };
}

// ─── Execution ────────────────────────────────────────────────
// session = { user, cart, ui: { recommendations, cartChanged, checkout, tracking }, seenIds:Set }
// Charge a la demande (knowledge.js utilise availableMethods de ce fichier)
const K = () => require('./knowledge');

function runTool(name, input = {}, session) {
  const { user } = session;
  switch (name) {
    case 'chercher_plats': {
      const results = searchDishes(user, {
        periode: input.periode, gout: input.gout, eviterGout: input.eviter_gout, categorie: input.categorie,
        budgetMax: input.budget_max, texte: input.texte, inclureDejaProposes: !!input.inclure_deja_proposes,
        excludeIds: input.inclure_deja_proposes ? [] : [...session.shownThisChat],
      });
      results.forEach(r => session.seenIds.add(r.id));
      return results.length ? { plats: results } : { plats: [], info: 'Aucun plat ne correspond. Propose d\'elargir (budget, creneau, gout).' };
    }

    case 'infos_wayi':
      return K().faqFacts(input.question || '');

    case 'details_plat': {
      const k = K();
      const dish = (input.plat_id && getDishById(input.plat_id)) || (input.nom && k.findDish(input.nom));
      if (!dish) return { erreur: "Plat introuvable dans le menu. Utilise chercher_plats avec un mot-cle pour trouver un plat proche." };
      return k.dishFacts(dish);
    }

    case 'infos_restaurant': {
      const k = K();
      const r = k.findRestaurant(input.nom || '');
      return r ? k.restaurantFacts(r) : { erreur: "Ce restaurant n'est pas partenaire de WAYI (ou le nom est mal ecrit)." };
    }

    case 'afficher_plats': {
      const ids = (input.plat_ids || []).filter(id => getDishById(id)).slice(0, 3);
      if (!ids.length) return { erreur: 'Identifiants inconnus : utilise ceux renvoyes par chercher_plats.' };
      for (const id of ids) {
        if (!session.ui.recommendations.includes(id)) session.ui.recommendations.push(id);
        session.shownThisChat.add(id);
      }
      session.ui.recommendations = session.ui.recommendations.slice(0, 3);
      recordRecommendations(user, ids);
      return { affiches: ids.map(id => getDishById(id).name) };
    }

    case 'enregistrer_preference':
      return savePreference(user, input.type, input.valeur);

    case 'modifier_panier': {
      if (input.vider_avant) session.cart = [];
      const errors = [];
      for (const op of input.operations || []) {
        const dish = getDishById(op.plat_id);
        if (!dish) { errors.push(`Plat introuvable : ${op.plat_id}`); continue; }
        const line = session.cart.find(c => c.dishId === dish.id);
        const q = Number.isInteger(op.quantite) ? op.quantite : 1;
        if (op.action === 'ajouter') {
          if (line) line.qty = Math.min(20, line.qty + Math.max(1, q)); else session.cart.push({ dishId: dish.id, qty: Math.max(1, Math.min(20, q)) });
        } else if (op.action === 'retirer') {
          if (line) { line.qty -= Math.max(1, q); if (line.qty <= 0) session.cart = session.cart.filter(c => c !== line); }
        } else if (op.action === 'definir') {
          if (q <= 0) session.cart = session.cart.filter(c => c.dishId !== dish.id);
          else if (line) line.qty = Math.min(20, q); else session.cart.push({ dishId: dish.id, qty: Math.min(20, q) });
        }
      }
      session.ui.cartChanged = true;
      session.ui.checkout = null; // un recapitulatif deja affiche n'est plus a jour
      return { ...cartSummary(user, session.cart), ...(errors.length ? { erreurs: errors } : {}) };
    }

    case 'voir_panier':
      return cartSummary(user, session.cart);

    case 'preparer_commande': {
      const summary = cartSummary(user, session.cart);
      if (summary.vide) return { erreur: 'Le panier est vide.' };
      const blocked = summary.restaurants.flatMap(r => r.plats).filter(p => p.exemple_non_commandable);
      if (blocked.length) return { erreur: `Plats d'exemple non commandables pour le moment : ${blocked.map(p => p.nom).join(', ')}. Propose de les retirer ou de choisir un autre plat.` };
      if (!summary.adresse_livraison) return { erreur: "Le client n'a pas d'adresse de livraison. Dis-lui qu'il pourra l'ajouter a l'etape suivante, dans l'ecran Panier." , ...prepareCard(session, summary, input.moyen_paiement) };
      const method = input.moyen_paiement;
      if (!availableMethods().some(m => m.id === method)) {
        return { erreur: `Moyen de paiement indisponible en ce moment. Disponibles : ${availableMethods().map(m => m.label).join(', ')}.` };
      }
      const warnings = orderWarnings(summary);
      return {
        ok: true,
        info: 'Recapitulatif affiche avec un bouton de validation. Le client confirme et paie lui-meme dans l\'ecran Panier.',
        ...(warnings.length ? { avertissements_a_dire_au_client: warnings } : {}),
        ...prepareCard(session, summary, method, warnings),
      };
    }

    case 'suivre_commandes': {
      const all = getOrdersByUser(user.id);
      const active = all.filter(o => ACTIVE_STATUSES.includes(o.status));
      const lastDelivered = all.find(o => o.status === 'delivered');
      if (active.length) session.ui.tracking = active.map(o => o.id);
      return {
        en_cours: active.map(o => ({
          id: o.id, restaurant: o.restaurantName, statut: STATUS_FR[o.status] || o.status,
          paiement: o.paymentMethod === 'cash' ? 'especes a la livraison' : (o.paymentStatus === 'paid' ? 'paye' : (o.paymentStatus || 'en attente')),
          livreur: o.driver?.name || null,
          heure_estimee: o.estimatedDelivery ? new Date(o.estimatedDelivery).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', minute: '2-digit' }) : null,
          plats: (o.items || []).map(i => `${i.qty} x ${i.name}`).join(', '),
          total: o.total,
        })),
        a_faire: active.filter(o => o.paymentMethod !== 'cash' && o.paymentStatus === 'awaiting_payment').length
          ? 'Un paiement est en attente : rappelle au client de le finaliser depuis l\'ecran de suivi.' : undefined,
        derniere_livree: lastDelivered ? { id: lastDelivered.id, restaurant: lastDelivered.restaurantName, plats: (lastDelivered.items || []).map(i => i.name).join(', '), note_donnee: !!(lastDelivered.dishRating || lastDelivered.serviceRating) } : null,
        mode_paiement_plateforme: paymentMode(),
      };
    }

    default:
      return { erreur: `Outil inconnu : ${name}` };
  }
}

// Points a signaler au client avant qu'il valide (non bloquants)
function orderWarnings(summary) {
  const st = serviceState();
  const w = [];
  if (!st.open) w.push(`Il est ${st.hour}h : les restaurants servent de ${SERVICE_START}h à ${SERVICE_END}h, ta commande sera traitée à la réouverture.`);
  const off = summary.restaurants.flatMap(r => r.plats).filter(p => !p.servi_maintenant);
  if (st.open && off.length) w.push(`${off.map(p => `${p.nom} (${p.creneau.toLowerCase()})`).join(', ')} : hors du créneau actuel (${periodLabel(st.period).toLowerCase()}), le restaurant peut mettre plus de temps ou refuser.`);
  if (summary.restaurants.length > 1) w.push(`${summary.restaurants.length} restaurants : ${summary.restaurants.length} livraisons séparées, donc ${summary.restaurants.length} frais de livraison.`);
  return w;
}

function prepareCard(session, summary, method, warnings = []) {
  session.ui.checkout = {
    cartSignature: cartSignature(session.cart),
    warnings,
    paymentMethod: availableMethods().some(m => m.id === method) ? method : null,
    paymentLabel: METHOD_LABELS[method] || null,
    restaurants: summary.restaurants.map(r => ({ name: r.restaurant, subtotal: r.sous_total, deliveryFee: r.frais_livraison, items: r.plats.map(p => ({ name: p.nom, qty: p.quantite, price: p.prix })) })),
    subtotal: summary.sous_total,
    deliveryFee: summary.frais_livraison,
    total: summary.total,
    address: summary.adresse_livraison,
  };
  return {};
}

module.exports = { TOOL_DEFINITIONS, runTool, sanitizeCart, toClientCart, cartSummary, availableMethods, defaultAddress, ACTIVE_STATUSES, serviceState, cartSignature, STATUS_FR };
