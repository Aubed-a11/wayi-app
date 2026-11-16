// ============================================================
// WAYI - Moteur de recommandation de Yivi
// Le classement des plats se fait ICI, cote serveur, avec les vraies
// donnees (menu du moment, preferences, historique, plats deja proposes).
// Le LLM ne choisit que parmi ce que ce moteur lui renvoie : il ne peut
// donc ni inventer un plat, ni reproposer en boucle les memes.
// ============================================================
const { getMenu, getOrdersByUser, PERIODS } = require('../../data/store');

const TZ = 'Africa/Porto-Novo';
const DAY_IDS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const DAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Heure du Benin, quel que soit le fuseau du VPS
function beninNow() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour12: false })
      .formatToParts(now).map(p => [p.type, p.value])
  );
  const hour = parseInt(parts.hour, 10) % 24;
  const dayIndex = DAY_LABELS.indexOf(String(parts.weekday).toLowerCase());
  return {
    hour,
    dayId: DAY_IDS[dayIndex >= 0 ? dayIndex : now.getDay()],
    label: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}h${parts.minute}`,
  };
}

function periodForHour(h) {
  if (h < 11) return 'petit_dejeuner';
  if (h < 15) return 'dejeuner';
  if (h < 18) return 'gouter';
  return 'diner';
}

function periodLabel(id) { return PERIODS.find(p => p.id === id)?.label || id; }

const TASTE_SYNONYMS = { epice: ['piment', 'epice', 'releve'], sucre: ['sucre', 'dessert'] };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Profil Yivi stocke sur l'utilisateur (persiste avec le reste de l'etat dans PostgreSQL)
function getYiviProfile(user) {
  if (!user.yiviProfile) user.yiviProfile = { aime: [], evite: [], budgetMax: null, notes: [], updatedAt: null };
  return user.yiviProfile;
}

function savePreference(user, type, valeur) {
  const p = getYiviProfile(user);
  const v = String(valeur || '').trim().slice(0, 80);
  if (!v && type !== 'budget') return { ok: false, error: 'Valeur vide' };
  const pushUnique = (arr, val) => { if (!arr.some(x => norm(x) === norm(val))) arr.push(val); if (arr.length > 30) arr.shift(); };
  if (type === 'aime') { pushUnique(p.aime, v); p.evite = p.evite.filter(x => norm(x) !== norm(v)); }
  else if (type === 'evite') { pushUnique(p.evite, v); p.aime = p.aime.filter(x => norm(x) !== norm(v)); }
  else if (type === 'budget') { const n = parseInt(String(valeur).replace(/\D/g, ''), 10); p.budgetMax = Number.isFinite(n) && n > 0 ? n : null; }
  else if (type === 'note') pushUnique(p.notes, v);
  else if (type === 'oublier') {
    p.aime = p.aime.filter(x => norm(x) !== norm(v));
    p.evite = p.evite.filter(x => norm(x) !== norm(v));
    p.notes = p.notes.filter(x => norm(x) !== norm(v));
  } else return { ok: false, error: 'Type inconnu' };
  p.updatedAt = new Date().toISOString();
  return { ok: true, profil: { aime: p.aime, evite: p.evite, budgetMax: p.budgetMax, notes: p.notes } };
}

// Historique des plats deja proposes par Yivi (pour varier d'une conversation a l'autre)
function recordRecommendations(user, dishIds) {
  if (!user.yiviRecos) user.yiviRecos = [];
  const at = new Date().toISOString();
  for (const id of dishIds) user.yiviRecos.push({ dishId: id, at });
  if (user.yiviRecos.length > 150) user.yiviRecos.splice(0, user.yiviRecos.length - 150);
}

function recentRecoAges(user) {
  const ages = {};
  const now = Date.now();
  for (const r of user.yiviRecos || []) {
    const days = (now - new Date(r.at).getTime()) / 86400000;
    if (ages[r.dishId] === undefined || days < ages[r.dishId]) ages[r.dishId] = days;
  }
  return ages;
}

// Plats commandes (livres ou en cours) par ce client : nombre de fois par plat
function orderedCounts(userId) {
  const counts = {};
  for (const o of getOrdersByUser(userId)) {
    if (o.status === 'cancelled') continue;
    for (const it of o.items || []) counts[it.dishId] = (counts[it.dishId] || 0) + (it.qty || 1);
  }
  return counts;
}

function matchesAny(dish, words, { withRestaurant = true } = {}) {
  const hay = norm(`${dish.name} ${dish.desc} ${dish.category} ${dish.taste || ''} ${dish.characteristics || ''} ${withRestaurant ? dish.restaurant?.name || '' : ''}`);
  return words.some(w => { const n = norm(w); return n.length > 2 && hay.includes(n); });
}

// Disponible aujourd'hui ? Champ facultatif `days` sur le plat (ex: ['lun','mer','ven']).
// Sans ce champ, le plat est servi tous les jours (comportement actuel du menu).
function availableToday(dish, dayId) {
  return !Array.isArray(dish.days) || !dish.days.length || dish.days.includes(dayId);
}

/**
 * Cherche et classe les plats pour ce client.
 * filtres : { periode, gout, categorie, budgetMax, texte, inclureDejaProposes, excludeIds }
 */
function searchDishes(user, filtres = {}) {
  const now = beninNow();
  const profile = getYiviProfile(user);
  const counts = orderedCounts(user.id);
  const recoAges = recentRecoAges(user);
  const favs = new Set(user.favoriteDishes || []);
  const exclude = new Set(filtres.excludeIds || []);

  let pool = getMenu({}).filter(d => availableToday(d, now.dayId) && !exclude.has(d.id) && d.available !== false && !d.soldOut);
  if (filtres.periode) pool = pool.filter(d => d.period === filtres.periode);
  if (filtres.categorie) pool = pool.filter(d => d.category === filtres.categorie);
  if (filtres.gout) pool = pool.filter(d => d.taste === filtres.gout);
  if (filtres.eviterGout) {
    pool = pool.filter(d => d.taste !== filtres.eviterGout);
    // Un plat decrit comme epice ou pimente ne doit pas passer pour "pas epice"
    if (filtres.eviterGout === 'epice') pool = pool.filter(d => !/(epice|pimente|piment)/.test(norm(`${d.name} ${d.desc || ''} ${d.characteristics || ''}`)));
  }
  const budget = filtres.budgetMax || null;
  if (budget) pool = pool.filter(d => d.price <= budget);
  if (filtres.texte) {
    const words = String(filtres.texte).split(/[\s,]+/).filter(w => w.length > 2);
    // Strict : si rien ne correspond aux mots du client, on le signale (liste vide)
    // plutot que de renvoyer n'importe quel plat comme s'il correspondait.
    pool = words.length ? pool.filter(d => matchesAny(d, words)) : pool;
  }
  // Ce que le client a dit eviter est retire, sauf s'il le cherche explicitement
  if (profile.evite.length && !filtres.texte) {
    pool = pool.filter(d => !matchesAny(d, profile.evite, { withRestaurant: false }));
    // "pas de piment", "rien de sucre"... ecarte aussi le gout correspondant
    const evite = profile.evite.map(norm);
    for (const [taste, words] of Object.entries(TASTE_SYNONYMS)) {
      if (evite.some(e => words.some(w => e.includes(w)))) {
        pool = pool.filter(d => d.taste !== taste);
        // Les plats decrits avec un mot de la meme famille (ex : "soupe epicee") sont retires aussi
        pool = pool.filter(d => !matchesAny(d, [...words, ...(taste === 'epice' ? ['pimente'] : [])], { withRestaurant: false }));
      }
    }
  }

  // Gouts et categories que le client commande souvent ou met en favori
  const likedTaste = {}; const likedCat = {};
  for (const d of getMenu({})) {
    const w = (counts[d.id] || 0) + (favs.has(d.id) ? 2 : 0);
    if (!w) continue;
    if (d.taste) likedTaste[d.taste] = (likedTaste[d.taste] || 0) + w;
    likedCat[d.category] = (likedCat[d.category] || 0) + w;
  }

  const currentPeriod = periodForHour(now.hour);
  const scored = pool.map(d => {
    let score = 1;
    const why = [];
    if (profile.aime.length && matchesAny(d, profile.aime)) { score += 3; why.push('correspond a ce que le client aime'); }
    if (d.taste && likedTaste[d.taste]) score += Math.min(likedTaste[d.taste], 4) * 0.5;
    if (likedCat[d.category]) score += Math.min(likedCat[d.category], 4) * 0.5;
    if (favs.has(d.id)) { score += 1.5; why.push('dans ses favoris'); }
    if (counts[d.id]) { score += 0.8; why.push(`deja commande ${counts[d.id]} fois`); }
    else { score += 1.2; why.push('jamais goute par ce client'); }
    if (!filtres.periode && d.period === currentPeriod) { score += 1.5; why.push('servi maintenant'); }
    if (profile.budgetMax && !budget && d.price > profile.budgetMax) score -= 2;
    if (d.isPopular) { score += 0.5; why.push('populaire'); }
    const age = recoAges[d.id];
    if (age !== undefined && !filtres.inclureDejaProposes) {
      if (age < 1) score -= 5; else if (age < 3) score -= 3; else if (age < 7) score -= 1;
      if (age < 3) why.push('deja propose recemment');
    }
    score += Math.random() * 1.5; // variete d'une demande a l'autre
    return { d, score, why };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, 6).map(({ d, why }) => ({
    id: d.id,
    nom: d.name,
    prix: d.price,
    restaurant: d.restaurant?.name || null,
    creneau: periodLabel(d.period),
    categorie: d.category,
    gout: d.taste || null,
    description: (d.desc || '').slice(0, 140),
    servi_maintenant: d.period === currentPeriod,
    exemple_non_commandable: d.demo && process.env.ALLOW_DEMO_ORDERS !== '1' ? true : undefined,
    pourquoi: why.join(', '),
  }));
}

// Resume du profil reel (commandes livrees), injecte dans le contexte
function customerSummary(user) {
  const delivered = getOrdersByUser(user.id).filter(o => o.status === 'delivered');
  if (!delivered.length) return 'Nouveau client, aucune commande livree pour le moment.';
  const dishCount = {};
  delivered.forEach(o => (o.items || []).forEach(i => { dishCount[i.name] = (dishCount[i.name] || 0) + i.qty; }));
  const top = Object.entries(dishCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  const avg = Math.round(delivered.reduce((s, o) => s + (o.total || 0), 0) / delivered.length);
  const last = delivered[0];
  return `${delivered.length} commande(s) livree(s). Plats les plus pris : ${top.join(', ')}. Panier moyen : ${avg} FCFA. Derniere commande : ${(last.items || []).map(i => i.name).join(', ')} (${new Date(last.createdAt).toLocaleDateString('fr-FR', { timeZone: TZ })}).`;
}

module.exports = {
  beninNow, periodForHour, periodLabel, getYiviProfile, savePreference,
  recordRecommendations, searchDishes, customerSummary, availableToday,
};
