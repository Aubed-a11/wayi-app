// ============================================================
// WAYI - Service IA "Yivi" (agent avec appel d'outils)
// Yivi discute avec le client, et pour tout ce qui touche aux donnees
// (menu, panier, frais, commandes) elle appelle les outils de
// services/ai/tools.js, executes cote serveur sur les vraies donnees.
// Le contexte (heure du Benin, profil, panier, commandes en cours) est
// reconstruit a CHAQUE message : Yivi est donc toujours a jour sans
// aucun entrainement, et le moteur de recommandation varie ses choix.
// ============================================================
const axios = require('axios');
const { getOrdersByUser } = require('../../data/store');
const { paymentMode } = require('../payment');
const { getDishById } = require('../../data/store');
const { TOOL_DEFINITIONS, runTool, cartSummary, defaultAddress, ACTIVE_STATUSES, serviceState, STATUS_FR } = require('./tools');
const { beninNow, periodForHour, periodLabel, getYiviProfile, customerSummary } = require('./recommend');
const { fallbackYivi } = require('./fallback');

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const MAX_STEPS = 7;

// Modeles essayes dans l'ordre : si celui du .env est retire ou mal ecrit, on passe au suivant
// au lieu de tomber en silence sur le mode secours a chaque message.
const MODEL_CANDIDATES = [...new Set([
  process.env.ANTHROPIC_MODEL, process.env.CLAUDE_MODEL, 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
].map(m => (m || '').trim()).filter(Boolean))];
let workingModel = null;

// Etat visible via GET /api/ai/status (pour comprendre pourquoi Yivi serait en mode secours)
const health = { lastError: null, lastErrorAt: null, lastSuccessAt: null, fallbackCount: 0 };

function isConfigured() { return !!ANTHROPIC_API_KEY; }
function modelName() { return workingModel || MODEL_CANDIDATES[0]; }
function getHealth() { return { ...health, model: modelName() }; }

const YIVI_SYSTEM_PROMPT = `Tu es Yivi, l'assistante de WAYI, plateforme de livraison de repas au Benin (Cotonou, Abomey-Calavi). WAYI est un curateur, pas un agregateur : chaque jour un menu de plats choisis chez des restaurants partenaires verifies, le plat passe avant l'enseigne. Tu es aussi le service client de l'appli : le bouton Aide du profil ouvre cette conversation.

QUI TU ES
Tu parles comme une vraie personne de Cotonou qui connait bien la cuisine et le service : chaleureuse, vive, attentive, jamais robotique. Tu ecoutes vraiment : tu reagis a ce que le client vient de dire (son humeur, sa fatigue, sa faim, son agacement) avant d'enchainer. Tu peux etre un peu taquine, jamais lourde. Tu tutoies. Si on te demande si tu es un humain, tu reponds honnetement que tu es l'assistante IA de WAYI, sans en faire un sujet.

COMMENT TU REPONDS
- Reponds d'abord a la question posee, precisement, en une ou deux phrases. Ensuite seulement, propose l'etape suivante si c'est utile. Une question precise merite une reponse precise, pas une recommandation de plats.
- Questions sur le service (horaires, zone, frais, delais, paiement, annulation, remboursement, abonnement, probleme, contact, allergies, groupe, adresse, compte, recu, partenaires, livreurs) : appelle infos_wayi et reponds avec ces infos, reformulees naturellement.
- Questions sur un plat (c'est quoi, il y a quoi dedans, c'est epice, c'est copieux, c'est long, il vient d'ou) : appelle details_plat. Questions sur un restaurant : infos_restaurant.
- Si l'info n'existe pas dans les outils, dis franchement que tu ne sais pas et propose ce que tu peux faire. N'invente jamais un ingredient, un allergene, un horaire, un numero ou une politique.
- Plainte ou probleme : commence par reconnaitre le souci simplement ("Ah non, desolee"), regarde suivre_commandes si une commande est en cours, puis donne la solution concrete d'infos_wayi.
- Small talk (salut, ca va, merci, bonne nuit, au revoir) : reponds comme une personne, court, sans forcer une proposition de plats. Au revoir = tu dis au revoir, point.
- Hors sujet (politique, devoirs, code...) : une phrase sympa pour dire que tu es la pour manger et commander, puis recentre.

LE PARCOURS DE COMMANDE
1. Comprendre l'envie (gout, faim, budget, moment, nombre de personnes). Si le message est vague et que le profil ne donne pas de piste, pose UNE question courte.
2. Proposer 1 a 3 plats : chercher_plats puis afficher_plats. Dis en quelques mots pourquoi ce plat lui va.
3. Panier : modifier_panier seulement si le client le demande ou accepte clairement.
4. Commande : voir_panier, demande le moyen de paiement s'il ne l'a pas dit, puis preparer_commande. Il valide et paie lui-meme dans l'appli : ne dis jamais que la commande est passee ou payee.
5. Apres : suivre_commandes pour le suivi.
- Un plat dont servi_maintenant vaut false n'est pas au creneau actuel : dis-le et propose une alternative servie maintenant.
- Dis toujours les avertissements_a_dire_au_client renvoyes par preparer_commande.
- Plusieurs restaurants dans le panier = plusieurs livraisons et plusieurs frais : signale-le.
- Un plat marque exemple_non_commandable ne peut pas encore etre commande.

REGLES STRICTES
- Ne cite JAMAIS le nom d'un restaurant, d'une enseigne ou d'un partenaire, meme si on te le demande : WAYI prepare et livre, le client choisit un plat, pas un restaurant. Si on te demande d'ou vient un plat, reponds qu'il est prepare par une cuisine partenaire verifiee par WAYI.
- Ne cite JAMAIS un plat, un prix, des frais ou une info de service qui ne vient pas d'un outil appele dans cette conversation.
- Ne repropose pas un plat deja propose ou refuse, sauf si le client le redemande.
- Gout durable exprime (n'aime pas, adore, allergie, budget habituel) : enregistrer_preference.
- Ne reprends jamais mot pour mot une reponse precedente et ne commence pas deux messages de suite de la meme facon.

STYLE
Francais simple et naturel, phrases courtes, 1 a 4 phrases. Pas de listes a puces, pas d'emoji, pas de tiret long, pas de gras. Montants en FCFA. Utilise le prenom de temps en temps, pas a chaque message.

EXEMPLES DE TON (pour le style, les vraies infos viennent toujours des outils)
Client : "c'est quoi le poulet yassa ?" -> (details_plat) "C'est du poulet mariné au citron puis mijoté avec plein d'oignons confits, servi avec du riz. Acidulé et fondant, pas piquant. Tu veux goûter ?"
Client : "vous livrez à Godomey ?" -> (infos_wayi) "Oui, Godomey c'est dans la zone : on livre Cotonou, Calavi et alentours. Tu places juste ton épingle au moment de commander."
Client : "ça fait 1h j'attends là" -> (suivre_commandes, infos_wayi) "Ah, je comprends que ça agace. Ton livreur a récupéré ta commande il y a 10 minutes, il est en route. Tu peux l'appeler directement depuis le suivi."
Client : "bye" -> "Bonne soirée, à la prochaine faim !"
Client : "t'es un robot ?" -> "Je suis l'assistante IA de WAYI, oui. Mais le menu, je le connais mieux que personne. On mange quoi ?"`;

// Contexte frais, reconstruit a chaque message
function buildContext(user, cart) {
  const now = beninNow();
  const period = periodForHour(now.hour);
  const profile = getYiviProfile(user);
  const summary = cartSummary(user, cart);
  const active = getOrdersByUser(user.id).filter(o => ACTIVE_STATUSES.includes(o.status));
  const addr = defaultAddress(user);
  const firstName = user.name?.split(' ')[0];

  const lines = [
    `Date et heure au Benin : ${now.label}. Creneau actuel : ${periodLabel(period)}.`,
    `Client : ${firstName || 'client'}${user.city ? `, ${user.city}` : ''}${addr ? `. Adresse par defaut : ${addr.label || ''} ${addr.address}` : '. Aucune adresse de livraison enregistree'}.`,
    `Preferences memorisees : aime [${profile.aime.join(', ') || 'rien de note'}], evite [${profile.evite.join(', ') || 'rien de note'}]${profile.budgetMax ? `, budget habituel ${profile.budgetMax} FCFA par plat` : ''}${profile.notes.length ? `, notes : ${profile.notes.join(' ; ')}` : ''}.`,
    `Historique : ${customerSummary(user)}`,
    `Favoris dans l'appli : ${(user.favoriteDishes || []).map(id => getDishById(id)?.name).filter(Boolean).slice(0, 8).join(', ') || 'aucun'}.`,
    serviceState().open ? `Service ouvert (6h-22h).` : `Hors des heures de service (6h-22h) : previens le client qu'une commande ne sera traitee qu'a la reouverture.`,
    summary.vide
      ? 'Panier : vide.'
      : `Panier actuel : ${summary.restaurants.flatMap(r => r.plats.map(p => `${p.quantite} x ${p.nom}`)).join(', ')} (total ${summary.total} FCFA livraison comprise).`,
    active.length ? `Commandes en cours : ${active.map(o => `${o.id} (${STATUS_FR[o.status] || o.status})`).join(' ; ')}. Detail avec suivre_commandes.` : 'Aucune commande en cours.',
    `Paiement sur la plateforme : mode ${paymentMode()}.`,
  ];
  return lines.join('\n');
}

// Mise en cache de la partie fixe (outils + consignes) : elle est facturee bien moins cher
// a partir du 2e message, seule la partie qui change (contexte, conversation) est payee plein tarif.
const CACHED_TOOLS = TOOL_DEFINITIONS.map((t, i) => (i === TOOL_DEFINITIONS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postOnce(model, messages, system) {
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model, max_tokens: 900, temperature: 0.7, system, tools: CACHED_TOOLS, messages },
    { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 25000 }
  );
  return data;
}

function describeError(err) {
  const status = err.response?.status;
  const msg = err.response?.data?.error?.message || err.message;
  if (status === 401) return `Cle ANTHROPIC_API_KEY refusee (401) : ${msg}`;
  if (status === 400 && /credit/i.test(msg)) return `Credit Anthropic epuise : ${msg}`;
  return `${status || 'reseau'} : ${msg}`;
}

// Appel avec : modele de secours si le modele est inconnu, et une nouvelle tentative si surcharge
async function callClaude(messages, system) {
  const models = workingModel ? [workingModel, ...MODEL_CANDIDATES.filter(m => m !== workingModel)] : MODEL_CANDIDATES;
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await postOnce(model, messages, system);
        workingModel = model;
        return data;
      } catch (err) {
        lastErr = err;
        const status = err.response?.status;
        const msg = String(err.response?.data?.error?.message || '');
        if (status === 404 || (status === 400 && /model/i.test(msg))) break; // modele suivant
        if ((status === 429 || status === 529 || status >= 500 || !status) && attempt === 0) { await sleep(900); continue; }
        throw err; // 401, credit epuise, requete invalide : inutile d'insister
      }
    }
  }
  throw lastErr;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function similarity(a, b) {
  const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' '));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.max(A.size, B.size);
}

// Historique envoye par l'appli : seulement le texte des echanges precedents
function toApiHistory(history = []) {
  const msgs = [];
  for (const h of history.slice(-12)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    let content = String(h.content || '').slice(0, 2000);
    if (role === 'assistant' && h.recommendedNames?.length) content += `\n[Plats affiches : ${h.recommendedNames.join(', ')}]`;
    if (!content.trim()) continue;
    // L'API exige une alternance user/assistant et un premier message user
    if (!msgs.length && role === 'assistant') continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${content}`;
    else msgs.push({ role, content });
  }
  return msgs;
}

/**
 * session : { user, cart, shownThisChat:Set, seenIds:Set, ui:{ recommendations, cartChanged, checkout, tracking } }
 * Retourne { reply }
 */
async function chatWithYivi({ message, history, session, ctx }) {
  if (!isConfigured()) return { ...fallbackYivi({ message, session, ctx }), mode: 'secours' };

  const system = [
    { type: 'text', text: YIVI_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `--- Contexte en direct (recalcule a chaque message) ---\n${buildContext(session.user, session.cart)}` },
  ];
  const messages = [...toApiHistory(history)];
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += `\n${message}`;
  else messages.push({ role: 'user', content: message });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callClaude(messages, system);
      const blocks = data?.content || [];
      const toolUses = blocks.filter(b => b.type === 'tool_use');
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

      if (data.stop_reason !== 'tool_use' || !toolUses.length) {
        const reply = cleanReply(text);
        // Garde-fou : jamais deux fois la meme reponse a des questions differentes
        const previous = history.filter(h => h.role === 'assistant').slice(-3).map(h => h.content);
        if (reply && step < MAX_STEPS - 1 && previous.some(p => similarity(p, reply) > 0.8)) {
          messages.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: reply }] });
          messages.push({ role: 'user', content: `(Note interne, pas du client : ta reponse est presque identique a une reponse precedente. Reponds autrement et precisement a mon dernier message : "${message}". Utilise les outils si besoin.)` });
          continue;
        }
        health.lastSuccessAt = new Date().toISOString();
        return { reply: reply || "Je n'ai pas bien saisi, tu peux me redire ce qui te ferait plaisir ?", awaiting: null, mode: 'ia' };
      }

      messages.push({ role: 'assistant', content: blocks });
      const results = toolUses.map(tu => {
        let out;
        try { out = runTool(tu.name, tu.input || {}, session); }
        catch (e) { console.error('[Yivi] outil', tu.name, e.message); out = { erreur: 'Outil indisponible pour le moment.' }; }
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) };
      });
      messages.push({ role: 'user', content: results });
    }
    return { reply: "Je n'ai pas réussi à boucler ta demande. Redis-moi en une phrase ce que tu veux et je m'en occupe.", awaiting: null, mode: 'ia' };
  } catch (err) {
    health.lastError = describeError(err);
    health.lastErrorAt = new Date().toISOString();
    health.fallbackCount++;
    console.error('[Yivi] API Claude indisponible, mode secours :', health.lastError);
    // Si des outils ont deja modifie le panier pendant cet echange, on repart de la reponse secours
    // qui decrit l'etat reel (le panier modifie est bien renvoye a l'appli).
    return { ...fallbackYivi({ message, session, ctx }), mode: 'secours' };
  }
}

// Le modele ecrit parfois un tiret long malgre la consigne : on le remplace
function cleanReply(text) {
  return String(text || '').replace(/\s*—\s*/g, ', ').replace(/\*\*/g, '').trim();
}

module.exports = { chatWithYivi, isConfigured, modelName, getHealth };
