// ============================================================
// WAYI - Yivi en mode secours (sans IA externe)
// Utilise quand ANTHROPIC_API_KEY est absente ou que l'API Claude ne
// repond pas. Ce n'est pas une simple reponse type : on detecte
// l'intention du message (choisir, ajouter, retirer, commander, payer,
// suivre, preference, merci...), on suit l'etape en cours de la
// conversation, et on s'appuie sur les memes outils que l'IA.
// Les formulations varient et ne se repetent pas d'un message a l'autre.
// ============================================================
const { getDishById, getMenu } = require('../../data/store');
const { runTool, cartSummary, availableMethods, serviceState } = require('./tools');
const { getYiviProfile, periodLabel } = require('./recommend');
const { smallTalk, answerQuestion, moodIntro } = require('./talk');
const { methodsLabel } = require('./knowledge');

const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
const fmt = (x) => `${Number(x || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')}\u00a0FCFA`;
const has = (q, re) => re.test(q);
// "chez Chez Maman Piment" -> "chez Maman Piment"
// Le client ne doit jamais connaitre le restaurant : aucune mention de l'enseigne
const chez = () => '';

// Choisit une formulation differente de la derniere reponse envoyee
function pick(options, avoid = '') {
  const fresh = options.filter(o => !n(avoid).startsWith(n(o).slice(0, 25)));
  const pool = fresh.length ? fresh : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
function parseQty(q) {
  const m = q.match(/\b(\d{1,2})\s*(x|fois|portions?|plats?)?\b/);
  if (m && parseInt(m[1], 10) > 0 && parseInt(m[1], 10) <= 20 && !/\d{3,}/.test(m[0])) return parseInt(m[1], 10);
  for (const [w, v] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q) && w !== 'un' && w !== 'une') return v;
  return 1;
}

const TASTES = {
  epice: /\b(epice|pimente|piment|releve|fort)\b/, sucre: /\b(sucre|dessert|douceur|gateau)\b/,
  frais: /\b(frais|leger|light|healthy|salade)\b/, umami: /\b(gourmand|copieux|burger|bien garni)\b/, doux: /\bdoux\b/,
};
const PERIODS = { petit_dejeuner: /(petit[- ]?dej|matin|reveil)/, dejeuner: /(dejeuner|midi)/, gouter: /(gouter|quatre heures|16h|17h)/, diner: /(diner|ce soir|\bsoir\b)/ };
const CATS = { grillades: /(grill|braise|brochette)/, burgers: /burger/, boissons: /(boisson|jus|a boire|soif|bissap)/, healthy: /(healthy|regime|salade)/, plats_locaux: /(local|beninois|africain|traditionnel)/ };
const METHODS = { mtn_momo: /(momo|mtn)/, moov: /(moov|flooz)/, card: /(carte|visa|mastercard)/, cash: /(cash|espece|liquide|a la livraison|main a main)/ };

function detect(map, q) { return Object.entries(map).find(([, re]) => re.test(q))?.[0] || null; }

// Trouve le plat dont parle le client : rang ("le premier"), puis nom, parmi les candidats
function resolveDish(q, candidateIds, { ordinals = true } = {}) {
  const ids = candidateIds.filter(id => getDishById(id));
  const ord = [[/(\b(premier|1er|le 1|numero 1|n ?1)\b|^1$)/, 0], [/(\b(deuxieme|second|2e|2eme|le 2|numero 2)\b|^2$)/, 1], [/(\b(troisieme|3e|3eme|le 3|numero 3)\b|^3$)/, 2], [/\bdernier\b/, ids.length - 1]];
  if (ordinals) for (const [re, i] of ord) if (re.test(q) && ids[i]) return ids[i];
  let best = null; let bestScore = 0;
  const STOP = ['avec', 'pour', 'sans', 'dans', 'plat', 'plats', 'veux', 'prends', 'ajoute', 'mets', 'retire', 'enleve', 'celui', 'celle', 'aussi', 'encore', 'merci', 'ouais', 'okay', 'commande', 'commander', 'panier', 'moi'];
  const words = q.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.includes(w));
  for (const id of ids) {
    const name = n(getDishById(id).name);
    const score = words.filter(w => name.includes(w)).length;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

function reasonFor(p) {
  if (/aime/.test(p.pourquoi)) return 'ça colle à ce que tu aimes';
  if (/favoris/.test(p.pourquoi)) return "il est dans tes favoris";
  if (/jamais/.test(p.pourquoi)) return "tu ne l'as encore jamais goûté";
  if (/deja commande/.test(p.pourquoi)) return 'une valeur sûre pour toi';
  if (/servi maintenant/.test(p.pourquoi)) return 'il est servi en ce moment';
  return null;
}

function recommend(session, q, ctx, opts = {}) {
  let intro = opts.intro || '';
  const profile = getYiviProfile(session.user);
  const st = serviceState();
  const budget = (q.match(/(\d{3,5})\s*(f|fcfa|francs|cfa)?\b/) || [])[1];
  const filtres = {
    gout: detect(TASTES, q), periode: detect(PERIODS, q), categorie: detect(CATS, q),
    budget_max: budget ? parseInt(budget, 10) : undefined,
  };
  if (/pas (trop )?(epice|pimente)|sans piment/.test(q)) { filtres.gout = undefined; filtres.eviter_gout = 'epice'; }
  const anyFilter = Object.values(filtres).some(Boolean);
  if (!anyFilter && !opts.noText) {
    const words = q.split(/[^a-z]+/).filter(w => w.length > 3 && !/^(veux|voudrais|envie|manger|propose|conseille|quoi|chose|autre|plat|faim|truc|bonjour|salut|merci|surprends|surprend|choisis|idee|idees|moi|quelque|premier|deuxieme|second|dernier|troisieme|prends|ajoute)$/.test(w));
    if (words.length) filtres.texte = words.join(' ');
  }
  // Budget memorise : applique par defaut, sauf si le client en donne un autre
  const defaultBudget = !filtres.budget_max && profile.budgetMax ? profile.budgetMax : undefined;
  const base = { ...filtres, budget_max: filtres.budget_max || defaultBudget };
  // Du plus precis au plus large ; on ne change de categorie qu'en dernier recours
  const tryOrder = [];
  if (!base.periode && !base.texte && st.open) tryOrder.push({ ...base, periode: st.period });
  tryOrder.push(base);
  if (base.gout === 'frais') tryOrder.push({ ...base, gout: undefined, categorie: 'healthy' });
  if (base.gout || base.categorie) tryOrder.push({ ...base, inclure_deja_proposes: true });
  if (defaultBudget) tryOrder.push({ ...filtres, budget_max: undefined });
  if (base.gout || base.categorie) tryOrder.push({ ...base, gout: undefined, categorie: undefined });
  if (base.texte) tryOrder.push({ ...base, texte: undefined });
  if (defaultBudget) tryOrder.push({ budget_max: undefined });

  let plats = [];
  let used = filtres;
  for (const f of tryOrder) {
    plats = runTool('chercher_plats', f, session).plats || [];
    if (plats.length) { used = f; break; }
  }
  if (!plats.length) {
    return {
      reply: pick([
        `${intro}Je n'ai plus rien qui colle avec ces critères. Tu veux que j'élargisse le budget, ou on change de gout ?`,
        `${intro}Rien ne correspond exactement pour le moment. Dis-moi un autre goût ou un autre créneau et je relance.`,
      ], ctx.lastReply).trim(),
      awaiting: null,
    };
  }
  // Mots du client introuvables dans le menu : on le dit au lieu de faire comme si
  if (filtres.texte && !used.texte && !anyFilter) {
    intro = `${intro}${pick([`Je n'ai rien trouvé pour « ${filtres.texte} » dans le menu du jour.`, `« ${filtres.texte} », ce n'est pas au menu aujourd'hui.`], ctx.lastReply)} `;
  }
  const count = /(idees|options|choix|plusieurs|trois)/.test(q) ? 3 : 2;
  const picks = plats.slice(0, count);
  runTool('afficher_plats', { plat_ids: picks.map(p => p.id) }, session);

  const single = picks.length === 1;
  const lines = picks.map(p => `${p.nom} à ${fmt(p.prix)}${p.restaurant ? ` ${chez(p.restaurant)}` : ''}`);
  const why = reasonFor(picks[0]);
  const list = lines.length > 1 ? `${lines.slice(0, -1).join(', ')} ou ${lines[lines.length - 1]}` : lines[0];
  const when = used.periode && used.periode !== st.period ? ` (servi au ${periodLabel(used.periode).toLowerCase()})` : '';
  const demo = picks.some(p => p.exemple_non_commandable) ? " Ceux marqués Exemple ne sont pas encore commandables." : '';
  const over = picks.filter(p => profile.budgetMax && p.prix > profile.budgetMax);
  const budgetNote = over.length ? ` Attention, ${over.length === picks.length && single ? 'il dépasse' : `${over.map(p => p.nom).join(' et ')} ${over.length > 1 ? 'dépassent' : 'dépasse'}`} ton budget habituel de ${fmt(profile.budgetMax)}.` : '';
  const opener = pick([
    `${intro}Je te propose ${list}${when}.`,
    `${intro}Regarde ça : ${list}${when}.`,
    `${intro}Pour toi j'ai ${list}${when}.`,
    single ? `${intro}J'ai exactement ce qu'il faut${when} : ${list}.` : `${intro}${picks.length === 3 ? 'Trois' : 'Deux'} pistes${when} : ${list}.`,
  ], ctx.lastReply);
  const tail = single
    ? pick([`${why ? ` ${why.charAt(0).toUpperCase()}${why.slice(1)}.` : ''} Je te l'ajoute ?`, ' Je le mets dans ton panier ?'], ctx.lastReply)
    : pick([
      `${why ? ` Le premier, ${why}.` : ''} Je t'en mets un au panier ?`,
      `${why ? ` Pour ${picks[0].nom}, ${why}.` : ''} Lequel te tente ?`,
      ' Dis-moi lequel et je l\'ajoute, ou demande-moi autre chose.',
    ], ctx.lastReply);
  return { reply: `${opener}${tail}${budgetNote}${demo}`.replace(/[ \t\n]+/g, ' ').trim(), awaiting: 'confirm_add' };
}

function cartLine(session) {
  const s = cartSummary(session.user, session.cart);
  if (s.vide) return null;
  const items = s.restaurants.flatMap(r => r.plats.map(p => `${p.quantite} x ${p.nom}`)).join(', ');
  return { s, items };
}

function orderFlow(session, q, ctx) {
  const c = cartLine(session);
  if (!c) {
    const r = recommend(session, q, ctx, { intro: "Ton panier est vide pour l'instant. " });
    return r;
  }
  const blocked = c.s.restaurants.flatMap(r => r.plats).filter(p => p.exemple_non_commandable);
  if (blocked.length) {
    return { reply: `${blocked.map(p => p.nom).join(', ')} ${blocked.length > 1 ? 'sont des plats' : 'est un plat'} d'exemple : le restaurant n'est pas encore partenaire, je ne peux pas le commander. Je te le retire et je te propose autre chose ?`, awaiting: 'remove_demo' };
  }
  const methods = availableMethods();
  const method = detect(METHODS, q) || ctx.presetMethod;
  if (!method || !methods.some(m => m.id === method)) {
    const unavailable = method && !methods.some(m => m.id === method);
    return {
      reply: `${unavailable ? "Ce moyen de paiement n'est pas disponible en ce moment. " : ''}${pick([
        `Parfait, on y est presque : ${c.items}. Tu paies comment ? ${methodsLabel()}.`,
        `Ton panier : ${c.items}, total ${fmt(c.s.total)}. Quel moyen de paiement ? ${methodsLabel()}.`,
      ], ctx.lastReply)}`,
      awaiting: 'payment_method',
    };
  }
  const out = runTool('preparer_commande', { moyen_paiement: method }, session);
  const label = methods.find(m => m.id === method)?.label;
  if (out.erreur && !session.ui.checkout) return { reply: "Je n'arrive pas à préparer la commande pour le moment. Ouvre ton panier pour la valider directement.", awaiting: null };
  const addr = c.s.adresse_livraison ? `livraison à ${c.s.adresse_livraison}` : "il te faudra ajouter ton adresse à l'étape suivante";
  const warn = (session.ui.checkout?.warnings || []).length ? ` À savoir : ${session.ui.checkout.warnings.join(' ')}` : '';
  return {
    reply: `${pick(['Voilà ton récapitulatif', 'Tout est prêt', "C'est bon pour moi"], ctx.lastReply)} : ${c.items}, ${fmt(c.s.total)} dont ${c.s.frais_livraison ? fmt(c.s.frais_livraison) : 'livraison offerte'}${c.s.frais_livraison ? ' de livraison' : ''}, ${addr}, paiement ${/^(Esp|Carte)/.test(label) ? label.toLowerCase() : label}. Appuie sur Valider et payer pour l'envoyer au restaurant.${warn}`,
    awaiting: null,
  };
}

function trackingReply(session, ctx) {
  const out = runTool('suivre_commandes', {}, session);
  if (!out.en_cours.length) {
    const last = out.derniere_livree;
    return {
      reply: last
        ? `Tu n'as pas de commande en cours. La dernière (${last.plats} ${chez(last.restaurant)}) a bien été livrée${last.note_donnee ? '' : ', tu peux la noter depuis le suivi'}. On en lance une nouvelle ?`
        : "Tu n'as aucune commande en cours. Dis-moi ce qui te ferait envie et on en prépare une.",
      awaiting: null,
    };
  }
  const parts = out.en_cours.map(o => `${o.plats} ${chez(o.restaurant)} : ${o.statut}${o.livreur ? `, livreur ${o.livreur}` : ''}${o.heure_estimee && !/livr/.test(o.statut) ? `, prévue vers ${o.heure_estimee}` : ''}`);
  const pay = out.a_faire ? ' Ton paiement est encore en attente : finalise-le depuis le suivi pour que le restaurant commence.' : '';
  return { reply: `${parts.join(' ; ')}.${pay} Le bouton ci-dessous te montre tout en direct.`, awaiting: null };
}

function preferenceFlow(session, q, raw, ctx) {
  const saved = [];
  const clean = (s) => s.replace(/[.!?,;].*$/, '').replace(/\b(s'il te plait|stp|svp|merci)\b.*$/, '').trim().split(/\s+/).slice(0, 4).join(' ');
  let m;
  // On enregistre le mot tel que le client l'a ecrit (avec ses accents)
  const original = (v) => { const words = raw.split(/[^\p{L}']+/u); return words.find(w => n(w) === v.split(' ')[0]) ? v.split(' ').map(x => words.find(w => n(w) === x) || x).join(' ') : v; };
  if ((m = q.match(/(?:je n'?aime pas|j'?aime pas|je deteste|pas de|sans|allergique (?:a|au|aux))\s+(le |la |les |l'|du |de la |des )?([a-z' ]{3,40})/))) {
    const v = clean(m[2]); if (v) { runTool('enregistrer_preference', { type: 'evite', valeur: original(v) }, session); saved.push(/^[aeiouyh]/i.test(v) ? `pas d'${original(v)}` : `pas de ${original(v)}`); }
  }
  if ((m = q.match(/(?:j'?adore|j'?aime (?:bien |beaucoup |trop )?|je kiffe|fan de)\s*(le |la |les |l'|du |de la |des )?([a-z' ]{3,40})/)) && !/aime pas/.test(q)) {
    const v = clean(m[2]); if (v) { runTool('enregistrer_preference', { type: 'aime', valeur: original(v) }, session); saved.push(`tu aimes ${m[1] || ''}${original(v)}`); }
  }
  if ((m = q.match(/budget\D{0,12}(\d{3,6})/))) { runTool('enregistrer_preference', { type: 'budget', valeur: m[1] }, session); saved.push(`budget ${fmt(m[1])}`); }
  if (!saved.length) return null;
  const intro = `${pick(['Noté', 'Retenu', "C'est enregistré"], ctx.lastReply)} : ${saved.join(', ')}. `;
  // On garde seulement les autres criteres de la phrase (creneau, budget...), pas l'ingredient cite
  const rest = q.replace(/(je n'?aime pas|j'?aime pas|je deteste|pas de|sans|allergique \S+|j'?adore|j'?aime (bien |beaucoup |trop )?|je kiffe|fan de)\s+(le |la |les |l'|du |de la |des )?[a-z']+/g, ' ').replace(/budget\D{0,12}\d{3,6}/, ' ');
  // S'il dit ce qu'il aime, on cherche d'abord ca
  const liked = session.user.yiviProfile?.aime?.slice(-1)[0];
  const likedNow = saved.some(x => x.startsWith('tu aimes')) && liked ? ` ${n(liked)}` : '';
  return recommend(session, `${rest}${likedNow}`, ctx, { intro });
}

function addFlow(session, q, ctx, { thenOrder = false } = {}) {
  const candidates = [...ctx.lastShown, ...session.cart.map(c => c.dishId), ...getMenu({}).map(d => d.id)];
  const ordinalAsked = /\b(premier|1er|deuxieme|second|2e|2eme|troisieme|3e|3eme|dernier)\b|^[123]$/.test(q);
  let id = resolveDish(q, ctx.lastShown) || resolveDish(q, candidates, { ordinals: false });
  if (!id && ordinalAsked) {
    const names = ctx.lastShown.map(i => getDishById(i)?.name).filter(Boolean);
    if (!names.length) return recommend(session, '', ctx, { intro: "Je ne t'ai encore rien proposé. " });
    return { reply: `Je ne t'en ai proposé ${names.length === 1 ? `qu'un : ${names[0]}. Je te l'ajoute ?` : `que ${names.length} : ${names.join(' et ')}. Lequel veux-tu ?`}`, awaiting: 'confirm_add' };
  }
  if (/^(oui|ouais|ok|okay|d'accord|dac|vas ?y|go|yes|volontiers)\b/.test(q) && ctx.lastShown.length > 1 && !resolveDish(q, ctx.lastShown)) id = null;
  const wantsCategory = !id && (detect(CATS, q) || detect(TASTES, q));
  if (!id && !wantsCategory && ctx.lastShown.length === 1) id = ctx.lastShown[0];
  // "ajoute une boisson", "mets-moi un truc sucre" : on propose dans cette categorie
  if (wantsCategory) {
    return recommend(session, q, ctx, { intro: pick(['Bonne idée. ', 'Ça marche. '], ctx.lastReply) });
  }
  if (!id) {
    if (ctx.lastShown.length > 1) {
      const names = ctx.lastShown.map(i => getDishById(i)?.name).filter(Boolean);
      return { reply: pick([
        `Lequel je t'ajoute : ${names.join(' ou ')} ? Tu peux dire "le premier" ou son nom.`,
        `J'ai besoin de savoir lequel : ${names.map((x, i) => `${i + 1}. ${x}`).join(', ')}. Réponds juste par le numéro.`,
      ], ctx.lastReply), awaiting: 'confirm_add' };
    }
    return recommend(session, q, ctx);
  }
  const qty = /^\d$/.test(q) ? 1 : parseQty(q.replace(/\b(1er|le 1|le 2|le 3|numero \d)\b/g, ''));
  const dish = getDishById(id);
  if (dish.demo && process.env.ALLOW_DEMO_ORDERS !== '1') {
    return { reply: `${dish.name} est un plat d'exemple : ce restaurant n'est pas encore partenaire, il n'est pas commandable. Je te trouve un plat équivalent ?`, awaiting: null };
  }
  const out = runTool('modifier_panier', { operations: [{ action: 'ajouter', plat_id: id, quantite: qty }] }, session);
  if (thenOrder) return orderFlow(session, q, ctx);
  const nb = out.restaurants.length;
  return {
    reply: `${pick([`C'est ajouté : ${qty} x ${dish.name}.`, `${qty > 1 ? `${qty} x ` : ''}${dish.name} est dans ton panier.`, `Je t'ai mis ${qty > 1 ? `${qty} x ` : ''}${dish.name}.`], ctx.lastReply)} Total ${fmt(out.total)} livraison comprise${nb > 1 ? ` (${nb} livraisons)` : ''}. ${pick(['On commande, ou tu veux ajouter une boisson ?', 'Je prépare la commande ?', 'Autre chose, ou on valide ?'], ctx.lastReply)}`,
    awaiting: 'confirm_order',
  };
}

function removeFlow(session, q, ctx) {
  if (/vide|tout (retirer|enlever|supprimer)|recommencer/.test(q)) {
    runTool('modifier_panier', { vider_avant: true, operations: [] }, session);
    return { reply: "Panier vidé. On repart de zéro : qu'est-ce qui te ferait plaisir ?", awaiting: null };
  }
  const id = resolveDish(q, session.cart.map(c => c.dishId));
  if (!id) {
    const c = cartLine(session);
    return { reply: c ? `Je retire lequel ? Dans ton panier : ${c.items}.` : 'Ton panier est déjà vide.', awaiting: null };
  }
  const out = runTool('modifier_panier', { operations: [{ action: 'definir', plat_id: id, quantite: 0 }] }, session);
  return { reply: `${getDishById(id).name} retiré. ${out.vide ? 'Ton panier est vide.' : `Reste ${fmt(out.total)} livraison comprise.`}`, awaiting: null };
}

/**
 * ctx = { history, lastShown: [ids], awaiting, lastReply }
 */
function fallbackYivi(args) {
  const out = route(args);
  // Garde-fou : ne jamais renvoyer exactement la reponse precedente
  if (out.reply && n(out.reply) === n(args.ctx.lastReply)) {
    out.reply = `${pick(['Je reformule : ', 'Pour être plus claire : ', 'Je précise : '])}${out.reply.charAt(0).toLowerCase()}${out.reply.slice(1)}`;
  }
  return out;
}

function route({ message, session, ctx }) {
  const raw = String(message || '');
  const q = n(raw).trim();
  const yes = /^(oui|ouais|ok|okay|d'accord|dac|vas ?y|go|parfait|carrement|yes|volontiers|c'est bon|bien sur)\b/.test(q);
  const no = /^(non|nan|pas ca|bof|autre|une autre|autre chose|pas trop)\b/.test(q) || /(autre chose|propose autre|pas ca)/.test(q);
  const first = session.user.name?.split(' ')[0] || '';
  // "je prends le deuxieme" juste apres une question sur un seul des plats : on parle de la serie entiere
  if (ctx.lastShown.length === 1 && (ctx.lastSet || []).length >= 2 && ctx.lastSet.includes(ctx.lastShown[0])
    && /\b(deuxieme|second|2e|2eme|troisieme|3e|3eme|dernier|premier|1er|l'autre)\b/.test(q)) {
    ctx.lastShown = /l'autre/.test(q) ? ctx.lastSet.filter(id => id !== ctx.lastShown[0]) : ctx.lastSet;
  }

  // Etapes en attente d'une reponse
  if (ctx.awaiting === 'payment_method' && detect(METHODS, q)) return orderFlow(session, q, ctx);
  if (ctx.awaiting === 'remove_demo' && yes) {
    const demoIds = session.cart.filter(c => getDishById(c.dishId)?.demo).map(c => c.dishId);
    runTool('modifier_panier', { operations: demoIds.map(id => ({ action: 'definir', plat_id: id, quantite: 0 })) }, session);
    return recommend(session, '', ctx, { intro: "C'est retiré. " });
  }

  // Conversation : au revoir, ca va, qui es-tu, humeur... (jamais une liste de plats a la place)
  const talk = smallTalk({ q, ctx, first, hasCart: session.cart.length > 0 });
  if (talk) return talk;

  // Questions precises (plat, restaurant, service) et plaintes : on repond a la question posee
  const answer = answerQuestion({ q, raw, session, ctx });
  if (answer) {
    if (answer.show && !session.ui.recommendations.includes(answer.show.id)) runTool('afficher_plats', { plat_ids: [answer.show.id] }, session);
    return { reply: answer.reply, awaiting: answer.awaiting };
  }

  if (has(q, /(suivi|suivre|ma commande|mes commandes|ou en est|ou est|livreur|arrive quand|c'est long|toujours pas)/)) return trackingReply(session, ctx);
  if ((has(q, /^(merci|thanks|thank you)\b/) || (has(q, /^(top|super|genial|cool|parfait)\b/) && !ctx.awaiting)) && q.length < 30) {
    return { reply: pick([`Avec plaisir${first ? ` ${first}` : ''} !`, 'De rien, bon appétit par avance !', 'Toujours là si tu as encore faim.', 'Je t\'en prie. Je reste dans le coin.'], ctx.lastReply), awaiting: null };
  }
  if (has(q, /(^aide$|comment ca marche|tu fais quoi|tu sers a quoi|tu peux faire quoi|que sais[- ]tu faire)/)) {
    return { reply: "Je t'aide à choisir dans le menu du jour selon tes goûts et ton budget, je remplis ton panier, je prépare ta commande à valider, puis je te dis où en est ta livraison. Je réponds aussi à tes questions : un plat, les frais, les horaires, un souci de commande. Essaie par exemple : un plat local pas trop épicé à moins de 2500.", awaiting: null };
  }

  // Humeur : on reagit avant de proposer
  const mood = moodIntro(q);
  if (mood && !/(\d{3,5})/.test(q) && /(fauche|pas d'argent|petit budget|fin du mois|serre)/.test(q)) return recommend(session, `${q} 1500f`, ctx, { intro: mood, noText: true });
  if (mood) return recommend(session, /(malade|pas bien|mal au ventre|grippe|rhume)/.test(q) ? `${q} leger` : q, ctx, { intro: mood, noText: true });

  const pref = has(q, /(j'?aime|n'?aime|j'?adore|je deteste|allergique|budget|je kiffe|fan de|^pas de |^sans )/) ? preferenceFlow(session, q, raw, ctx) : null;
  if (pref) return pref;

  const wantsOrder = has(q, /(\bcommand(e|er|ons|ez)\b|valide|passer (la )?commande|finalise|payer|je confirme|on y va|c'est tout|c'est bon)/);
  const methodSaid = detect(METHODS, q);
  if (has(q, /(retire|enleve|supprime|vide (le|mon) panier|pas de ca dans)/)) return removeFlow(session, q, ctx);
  const addVerb = has(q, /(\bajoute|\bje (le |la )?prends|\bje veux (le|la|celui|celle|ca)\b|\bmets[- ]moi|\bmet moi|\bprends[- ]moi|\bdonne[- ]moi (le|la|celui)|\bcelui[- ]la|\bcelle[- ]la|\ble premier|\ble deuxieme|\ble second|\ble dernier|^\d\b)/);
  const namedShown = resolveDish(q, ctx.lastShown);
  if (addVerb || namedShown || (ctx.awaiting === 'confirm_add' && yes && !wantsOrder)) {
    return addFlow(session, q, ctx, { thenOrder: wantsOrder });
  }
  if (wantsOrder || (ctx.awaiting === 'confirm_order' && yes) || (ctx.awaiting === 'payment_method' && yes)
    || (methodSaid && session.cart.length && q.split(/\s+/).length <= 6)) return orderFlow(session, q, ctx);
  if (has(q, /(mon panier|le panier|qu'est-ce que j'ai|j'ai quoi)/)) {
    const c = cartLine(session);
    return c
      ? { reply: `Dans ton panier : ${c.items}. Total ${fmt(c.s.total)} dont ${fmt(c.s.frais_livraison)} de livraison. On commande ?`, awaiting: 'confirm_order' }
      : recommend(session, '', ctx, { intro: 'Ton panier est vide. ' });
  }
  if (no && ctx.awaiting) return recommend(session, q.replace(/^(non|nan|bof)\b/, ''), ctx, { intro: pick(["D'accord. ", 'Pas de souci. ', 'Ok, on change. '], ctx.lastReply) });
  if (/^(salut|bonjour|bonsoir|hello|coucou|hey|yo|cc|slt|bjr)\b/.test(q) && q.split(/\s+/).length <= 3) {
    const st = serviceState();
    const c = cartLine(session);
    if (c) return { reply: `${pick(['Re', 'Salut', 'Hello'], ctx.lastReply)}${first ? ` ${first}` : ''} ! Tu as déjà ${c.items} dans ton panier. On finalise, ou tu veux ajouter quelque chose ?`, awaiting: 'confirm_order' };
    return {
      reply: pick([
        `${/^bonsoir/.test(q) ? 'Bonsoir' : /^bonjour|^bjr/.test(q) ? 'Bonjour' : 'Salut'}${first ? ` ${first}` : ''} ! ${st.open ? `C'est l'heure du ${periodLabel(st.period).toLowerCase()}.` : 'Les cuisines sont fermées pour le moment, mais je peux préparer ta commande pour la réouverture.'} Plutôt salé, sucré, épicé ou léger ?`,
        `${/^bonsoir/.test(q) ? 'Bonsoir' : /^bonjour|^bjr/.test(q) ? 'Bonjour' : 'Hello'}${first ? ` ${first}` : ''} ! Tu as faim de quoi : un plat local, une grillade, quelque chose de léger ?`,
        `${/^bonsoir/.test(q) ? 'Bonsoir' : 'Bonjour'}${first ? ` ${first}` : ''}. Dis-moi ton envie et ton budget, je te trouve ça dans le menu du jour.`,
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  if (/^(j'?ai faim|faim|je sais pas|jsp|une idee|surprends?[- ]moi|je ne sais pas)\b/.test(q) && q.split(/\s+/).length <= 5) {
    const profile = getYiviProfile(session.user);
    if (!profile.aime.length && !(session.user.favoriteDishes || []).length && Math.random() < 0.5) {
      return { reply: pick(['Grosse faim ou petit creux ? Et plutôt local, grillade ou léger ?', "Je m'en occupe. Tu as un budget en tete ?"], ctx.lastReply), awaiting: null };
    }
    return recommend(session, '', ctx, { intro: pick(['Laisse-moi faire. ', 'Ok, je choisis pour toi. '], ctx.lastReply) });
  }
  return recommend(session, q, ctx);
}

module.exports = { fallbackYivi };
