// ============================================================
// WAYI - Yivi en mode secours : conversation et questions precises
// Ce qui fait qu'elle repond comme une personne et pas comme un
// distributeur de plats : politesse, au revoir, humeur du client,
// questions sur un plat, sur un restaurant ou sur le service.
// Toutes les infos viennent de knowledge.js (donnees reelles).
// ============================================================
const { getDishById } = require('../../data/store');
const K = require('./knowledge');
const { beninNow, periodLabel } = require('./recommend');
const { runTool, serviceState } = require('./tools');

const { n, fmt, chez } = K;

function pick(options, avoid = '') {
  const fresh = options.filter(o => !n(avoid).startsWith(n(o).slice(0, 25)));
  const pool = fresh.length ? fresh : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

const QUESTION = /\?|^(est[- ]ce|c'est quoi|c'est qui|c'est ou|c'est combien|ca coute|comment|combien|pourquoi|quand|ou |quel|quelle|quels|quelles|qui |lequel|laquelle|vous (livrez|acceptez|avez|faites|etes)|tu (livres|acceptes|as|peux|connais|sais)|on peut|je peux|peut[- ]on|puis[- ]je|y a[- ]t[- ]il|il y a|y a |c'est (epice|pimente|copieux|long|cher|halal|sucre|sale)|est[- ]il|est[- ]elle|ca pique|ca cale|dis[- ]moi|explique|parle[- ]moi)/;
const FOOD = /(manger|mange|plat|faim|repas|menu|boire|boisson|command|livr|panier|resto|restaurant|maquis|cuisine|gout|epice|piment|sucre|prix|fcfa|budget|wayi|yivi|dej|diner|gouter|soir|midi|matin|paiement|payer|momo|abonnement|annul|rembours|allerg|livreur|adresse|compte|recu)/;

function partOfDay() {
  const h = beninNow().hour;
  return h < 12 ? 'matin' : h < 18 ? 'apres-midi' : 'soir';
}

// ─── Small talk ────────────────────────────────────────────────
function smallTalk({ q, ctx, first, hasCart }) {
  const name = first ? ` ${first}` : '';
  if (/^(bye|bye bye|au revoir|aurevoir|a\+|a plus|a la prochaine|a bientot|a demain|bonne nuit|bonne soiree|bonne journee|ciao|tchao|j'y vais|je dois y aller|je te laisse|on se parle|c'est tout pour (moi|aujourd'hui))\b/.test(q)) {
    const h = beninNow().hour;
    const wish = h >= 21 || h < 4 ? 'Bonne nuit' : h >= 17 ? 'Bonne soirée' : 'Bonne journée';
    return {
      reply: pick([
        `${wish}${name} ! Je suis là dès que la faim revient.`,
        `${wish}${name}, à très vite.`,
        `${wish}${name} !${hasCart ? " Ton panier reste de côté si tu changes d'avis." : ' Passe me voir quand tu as faim.'}`,
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  if (/(^|\b)(ca va|cava|comment tu vas|comment vas[- ]tu|tu vas bien|la forme|bien ou bien|comment ca se passe|quoi de neuf)\b/.test(q) && q.split(/\s+/).length <= 8 && !/(ca va (etre|prendre|couter|arriver)|ca va pas)/.test(q)) {
    const p = partOfDay();
    return {
      reply: pick([
        `Ça va très bien, merci${name} ! Et toi, ${p === 'soir' ? 'la journée a été longue' : "tu tiens le coup"} ? Si tu as faim, je suis là.`,
        `Toujours en forme quand on parle de manger. Et toi${name}, ça va ?`,
        `Très bien merci ! Tu me demandes ça le ventre vide ou plein ?`,
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  if (/^(ca va|bien|tres bien|tranquille|tranquillement|pas mal|nickel|super|ca roule|on est la|je vais bien|ca peut aller|bof)\b/.test(q) && (/et toi/.test(q) || /(ca va|et toi|forme|ventre|tiens le coup)/.test(n(ctx.lastReply))) && q.split(/\s+/).length <= 7) {
    if (/^bof|ca peut aller/.test(q)) return { reply: pick(['Bof, hein. Un bon plat peut arranger ça : tu veux que je te trouve un réconfort ?', 'Je vois. Laisse-moi au moins te régaler, tu as envie de quoi ?'], ctx.lastReply), awaiting: null };
    if (/et toi/.test(q)) return { reply: pick([`Ça va très bien, merci de demander${name} ! Bon, on se fait plaisir avec quoi ?`, 'Moi ça va toujours quand on parle de manger. Tu as faim de quoi ?'], ctx.lastReply), awaiting: null };
    return { reply: pick(['Contente de le savoir. Tu as faim de quoi aujourd\'hui ?', 'Top. On se fait plaisir avec quoi ?', 'Ça fait plaisir. Salé, sucré, épicé ou léger ?'], ctx.lastReply), awaiting: null };
  }
  if (/(t'es (un |une )?(robot|bot|ia|humain|humaine|vraie|vrai|personne)|tu es (un |une )?(robot|bot|ia|humain|humaine|vraie|vrai|personne)|es[- ]tu (un |une )?(robot|humain|humaine|ia)|qui es[- ]tu|tu es qui|t'es qui|c'est qui yivi|ton nom|tu t'appelles|comment tu t'appelles|une vraie personne|intelligence artificielle)/.test(q)) {
    return {
      reply: pick([
        "Je suis Yivi, l'assistante IA de WAYI. Pas une personne, mais je connais le menu du jour par coeur et je m'occupe de ta commande du choix jusqu'à la livraison.",
        "Moi c'est Yivi, l'assistante IA de WAYI. Je ne mange pas, malheureusement, mais je sais exactement ce qui est bon aujourd'hui. On regarde ?",
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  if (/(t'es (trop )?(forte|fort|geniale|top|cool|gentille|la meilleure|efficace)|tu es (trop )?(geniale|top|forte|super|gentille|la meilleure)|je t'adore|je t'aime bien|bravo|bien joue|trop bien)/.test(q)) {
    return { reply: pick(['Ça me fait plaisir, merci ! Je reste dans le coin.', "Merci, c'est gentil. Tu me redis quand tu as faim ?", 'Oh merci. Mon vrai travail, c\'est que tu manges bien.'], ctx.lastReply), awaiting: null };
  }
  if (/(t'es nul|tu es nulle?|\bnulle?\b|idiot|stupide|bete|tu sers a rien|tu comprends rien|tu comprends pas|n'importe quoi|ca marche pas|merde|putain|\bcon\b|connard|je m'en fous)/.test(q)) {
    return {
      reply: pick([
        "Désolée, je me suis mal débrouillée. Dis-moi en une phrase ce que tu veux (un plat, ta commande, une question) et je reprends depuis là.",
        "Pardon pour ça. Reprenons simplement : tu veux manger quelque chose, suivre une commande, ou tu as une question sur le service ?",
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  if (/(tu fais quoi|tu sers a quoi|tu peux faire quoi|que sais[- ]tu faire|comment (ca|tu) marche|^aide$|^help$|a quoi tu sers)/.test(q)) {
    return { reply: pick([
      "Je t'aide à choisir dans le menu du jour selon tes goûts et ton budget, je remplis ton panier, je prépare ta commande et je te dis où en est ta livraison. Je réponds aussi à tes questions : un plat, les frais, les horaires, un souci. Essaie : un plat local pas trop épicé à moins de 2500.",
      "Moi je m'occupe de tout ce qui touche au repas : trouver le bon plat, remplir le panier, préparer la commande, suivre le livreur, et répondre à tes questions sur WAYI. Dis-moi juste ce qui te ferait plaisir.",
    ], ctx.lastReply), awaiting: null };
  }
  if (/^(c'est bon|ca ira|ca va aller|non merci|pas besoin|ca suffit|rien d'autre)\b/.test(q) && /(merci|rien d'autre|ca suffit|pas besoin)/.test(q) && q.split(/\s+/).length <= 6) {
    return {
      reply: hasCart
        ? pick(["D'accord, je n'ajoute rien. Ton panier est prêt quand tu veux valider.", "Ça marche. Dis-moi « on commande » quand tu veux, ou valide directement depuis le Panier."], ctx.lastReply)
        : pick(["D'accord, je n'ajoute rien. Je reste là si l'envie revient.", 'Pas de souci. Je suis là si tu as faim plus tard.'], ctx.lastReply),
      awaiting: hasCart ? 'confirm_order' : null,
    };
  }
  if (!ctx.awaiting && /\b(merci|thanks|thank you)\b/.test(q) && q.split(/\s+/).length <= 6 && !/\?/.test(q)) {
    return { reply: pick([`Avec plaisir${name} !`, 'De rien, bon appétit par avance !', 'Toujours là si tu as encore faim.', "Je t'en prie. Je reste dans le coin."], ctx.lastReply), awaiting: null };
  }
  if (/^(mdr|lol|haha+|hihi|ptdr|xptdr|hahaha)/.test(q)) {
    return { reply: pick(['Contente de te faire rire. Bon, on mange quoi ?', 'Haha. Dis-moi quand tu veux passer aux choses sérieuses : la nourriture.'], ctx.lastReply), awaiting: null };
  }
  if (/^(ok|okay|d'accord|dac|ca marche|entendu|compris|je vois|ah ok|ah d'accord)\.?$/.test(q) && !ctx.awaiting) {
    return { reply: pick(['Parfait. Je suis là si tu as besoin.', "D'accord. Dis-moi quand tu veux qu'on commande.", 'Ça marche.'], ctx.lastReply), awaiting: null };
  }
  return null;
}

// ─── Questions ─────────────────────────────────────────────────
const ORD = [[/\b(premier|1er|le 1|numero 1)\b/, 0], [/\b(deuxieme|second|2e|2eme|le 2|numero 2)\b/, 1], [/\b(troisieme|3e|3eme|le 3|numero 3)\b/, 2], [/\bdernier\b/, -1]];
const PRONOUN = /\b(il|elle|ils|elles|ca|ce plat|ces plats|celui[- ]ci|celui[- ]la|celle[- ]ci|celle[- ]la|le premier|le deuxieme|le second|le dernier|les deux|ceux[- ]la|lui)\b/;

function referencedDishes(q, ctx) {
  const shown = ctx.lastShown.filter(getDishById);
  for (const [re, i] of ORD) if (re.test(q) && shown.length) return [getDishById(i < 0 ? shown[shown.length - 1] : shown[i])].filter(Boolean);
  // Le plat le mieux nomme, en preferant ceux qu'on vient de montrer a egalite
  const inShown = shown.length ? K.findDishScored(q, { ids: shown }) : null;
  const global = K.findDishScored(q);
  const named = inShown && (!global || inShown.score >= global.score) ? inShown.dish : global?.dish;
  if (named) return [named];
  if ((PRONOUN.test(q) || /^(c'est|est[- ]ce que c'est|ce sont)\b/.test(q)) && shown.length) return shown.map(getDishById);
  // "et c'est combien ?", "c'est halal ?" juste apres avoir parle d'un plat
  if (shown.length === 1 && q.split(/\s+/).length <= 7 && K.matchFaq(q).every(f => ['allergies', 'qualite', 'delai'].includes(f.id))) return [getDishById(shown[0])];
  return [];
}

function showDish(session, dish) {
  runTool('afficher_plats', { plat_ids: [dish.id] }, session);
}

function compareShown(q, ctx) {
  const ids = ctx.lastShown.length >= 2 ? ctx.lastShown : (ctx.lastSet || []);
  const shown = ids.map(getDishById).filter(Boolean);
  if (shown.length < 2) return null;
  if (/(du menu|au menu|de tout|le plat le|en ce moment|aujourd'hui|de wayi)/.test(q)) return null;
  if (!/(lequel|laquelle|lesquel|entre (les deux|eux|les)|des deux|parmi|tu (me )?conseilles|tu prendrais|tu choisirais|ton prefere|le meilleur|^(et )?(le|la) (plus|moins) )/.test(q)) return null;
  const prep = (d) => parseInt(String(K.dishFacts(d).temps_preparation_min || '30').split('-')[0], 10);
  const by = (fn, dir = 1) => [...shown].sort((a, b) => dir * (fn(a) - fn(b)))[0];
  let d; let why; let label = null;
  if (/(moins cher|pas cher|economique|plus abordable)/.test(q)) { d = by(x => x.price); why = `à ${fmt(d.price)}`; label = 'Le moins cher'; }
  else if (/plus cher/.test(q)) { d = by(x => x.price, -1); why = `à ${fmt(d.price)}`; label = 'Le plus cher'; }
  else if (/(plus rapide|moins long|plus vite)/.test(q)) { d = by(prep); why = `préparé en ${K.dishFacts(d).temps_preparation_min} minutes`; label = 'Le plus rapide'; }
  else if (/(moins (epice|pimente|fort)|plus doux)/.test(q)) { d = shown.find(x => x.taste !== 'epice') || shown[0]; why = d.taste === 'epice' ? 'même si les deux sont relevés' : "il n'est pas classé épicé"; }
  else if (/(plus (epice|pimente|fort|releve))/.test(q)) { d = shown.find(x => x.taste === 'epice') || shown[0]; why = d.taste === 'epice' ? 'il est classé épicé' : "aucun n'est vraiment épicé"; }
  else if (/(plus copieux|cale (le )?plus|plus gros|plus nourrissant)/.test(q)) { d = by(x => x.price, -1); why = 'c\'est le plus complet des deux d\'après sa fiche'; }
  else if (/(plus leger|moins lourd|plus sain|healthy)/.test(q)) { d = shown.find(x => ['frais', 'doux'].includes(x.taste) || x.category === 'healthy') || by(x => x.price); why = 'il est plus léger'; }
  else { d = shown[0]; const f = K.dishFacts(d); why = f.points_forts[0] ? f.points_forts[0].charAt(0).toLowerCase() + f.points_forts[0].slice(1) : 'il a de très bons retours'; }
  const of = shown.length === 2 ? 'des deux' : 'des trois';
  return { dish: d, reply: label ? `${label} ${of}, c'est ${d.name}, ${why}. Je te le mets au panier ?` : `${pick(['Je dirais', 'Moi je prendrais', 'Sans hésiter'], ctx.lastReply)} ${d.name}, ${why}. Je te le mets au panier ?` };
}

function answerFaq(faqs, q, raw) {
  const main = faqs[0];
  let text = main.answer();
  if (main.id === 'groupe') {
    const WORDS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10 };
    const m = q.match(/(?:on est|nous sommes|on sera|pour)\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|dix)/);
    const count = m ? (WORDS[m[1]] || parseInt(m[1], 10)) : null;
    if (count) text = `Pour ${count}, aucun souci : tu peux prendre plusieurs portions d'un même plat ou mélanger, jusqu'à 50 articles par commande. Donne-moi un budget par personne et un style (local, grillades, léger) et je compose le repas pour ${count}.`;
  }
  // Zone : reponse directe si le client cite un quartier
  if (main.id === 'zone') {
    const place = (raw.match(/(?:^|\s)(?:a|à|au|sur|vers|jusqu'à|jusqu'a)\s+([A-ZÀ-Ý][\p{L}'-]+(?:[ -][A-ZÀ-Ý][\p{L}'-]+)?)/u) || [])[1];
    const max = require('../../data/store').PLATFORM_CONFIG.maxDeliveryKm;
    if (K.FAR.test(q)) text = `Pas encore${place ? ` à ${place}` : ''}, désolée : pour l'instant on livre seulement Cotonou, Abomey-Calavi et leurs environs, jusqu'à ${max} km du restaurant.`;
    else if (K.IN_ZONE.test(q)) text = `Oui${place ? `, ${place} est dans la zone` : ', c\'est dans la zone'} : on livre Cotonou, Abomey-Calavi et les environs. Au moment de commander, tu places l'épingle sur la carte et l'appli calcule les frais exacts.`;
  }
  const second = faqs[1] && faqs[1].id !== main.id && q.length > 60 ? ` ${faqs[1].answer()}` : '';
  return { reply: `${text}${second}`, awaiting: null };
}

function answerQuestion({ q, raw, session, ctx }) {
  const question = QUESTION.test(q) || /\?/.test(raw);

  // Plainte : toujours prise au serieux, question ou pas
  const faqs = K.matchFaq(q);
  const complaint = faqs.find(f => f.id === 'probleme');
  if (complaint) {
    const out = runTool('suivre_commandes', {}, session);
    const live = out.en_cours?.[0];
    const none = !live && /(attend|arrive|livr|retard|long|recu)/.test(q) ? " Je ne vois pourtant aucune commande en cours sur ton compte : vérifie que la commande a bien été validée dans le Panier (sinon elle n'est pas partie)." : '';
    const status = none || live ? (none || ` Ta commande ${chez(live.restaurant)} est au statut « ${live.statut} »${live.livreur ? `, avec ${live.livreur}` : ''}${live.heure_estimee ? `, prévue vers ${live.heure_estimee}` : ''}.`) : '';
    return { reply: `${pick(['Ah non, je suis désolée.', 'Désolée, ce n\'est pas l\'expérience qu\'on veut pour toi.', 'Ah, je comprends que ça agace.'], ctx.lastReply)}${status} ${complaint.answer().replace(/^Désolée pour ça\. /, '')}`, awaiting: null };
  }
  // Sujets de service reconnus meme sans point d'interrogation
  const STATEMENT_OK = ['groupe', 'contact', 'partenaire', 'livreur', 'compte', 'annulation', 'remboursement', 'abonnement', 'recu', 'pourboire'];
  if (!question && faqs.length && STATEMENT_OK.includes(faqs[0].id) && !K.findDish(q)) return answerFaq(faqs, q, raw);
  if (!question) return null;

  // Comparaison entre les plats qu'on vient de montrer
  const cmp = compareShown(q, ctx);
  if (cmp) return { reply: cmp.reply, awaiting: 'confirm_add', show: cmp.dish };

  // Le moins cher / le plus rapide du menu
  if (/(le moins cher|le plus cher|le plus rapide|moins cher du menu)/.test(q)) {
    const st = serviceState();
    const ex = K.menuExtremes(st.open ? st.period : null);
    if (ex) {
      const d = /plus cher/.test(q) ? ex.priciest : /rapide/.test(q) ? ex.fastest : ex.cheapest;
      const what = /plus cher/.test(q) ? 'le plus cher' : /rapide/.test(q) ? 'le plus rapide à préparer' : 'le moins cher';
      return { reply: `En ce moment, ${what}, c'est ${d.name} à ${fmt(d.price)} ${chez(K.dishFacts(d).restaurant)}. Je te l'ajoute ?`, awaiting: 'confirm_add', show: d };
    }
  }

  // Disponibilite generale ("vous avez du poisson ?") : on laisse la recherche du menu repondre
  const availability = /^(vous avez|tu as|il y a|y a|y'a|avez[- ]vous|est[- ]ce qu'il y a|est[- ]ce que vous avez)\b/.test(q);

  // Question sur un ou plusieurs plats precis
  const attr = /(sucre|sale|doux|acide|amer|gout|halal|allerg|gluten|lactose|arachide|dedans|ingredient|compose|contient|fait avec|avec quoi|c'est quoi|qu'est[- ]ce que c'est|ca ressemble|explique|decris|parle[- ]moi|epice|pimente|piquant|ca pique|fort|releve|combien|prix|coute|cher|temps|delai|minutes|attendre|copieux|portion|quantite|personnes|ca cale|suffit|viande|vegetarien|vegan|qui le prepare|quel restaurant|d'ou|disponible|servi)/;
  const dishes = referencedDishes(q, ctx);
  const tasteOnly = /(sucre|sale|doux|acide|amer)/.test(q) && !/^(c'est|ils sont|elles sont|il est|elle est|est[- ]ce que (c'est|il est|elle est)|et (le|la) )/.test(q) && !PRONOUN.test(q);
  if (dishes.length && attr.test(q) && !tasteOnly && !(availability && !K.findDish(q))) {
    if (dishes.length === 1) {
      const text = K.answerAboutDish(dishes[0], q);
      showDish(session, dishes[0]);
      return { reply: `${text} ${pick(['Je te le mets au panier ?', 'Tu le veux ?', 'Ça te tente ?'], ctx.lastReply)}`, awaiting: 'confirm_add', show: dishes[0] };
    }
    if (/(sucre|sale|doux|acide|amer)/.test(q) && !/(dedans|ingredient|compose|epice|pimente|combien|prix)/.test(q)) {
      const L = { sale: 'salé', sucre: 'sucré', epice: 'relevé', umami: 'gourmand', frais: 'frais', doux: 'doux' };
      const tastes = dishes.slice(0, 3).map(d => d.taste);
      const txt = tastes.every(x => x === tastes[0])
        ? `${dishes.length === 2 ? 'Les deux' : 'Tous'} sont plutôt ${{ sale: 'salés', sucre: 'sucrés', epice: 'relevés', umami: 'gourmands', frais: 'frais', doux: 'doux' }[tastes[0]] || 'équilibrés'}.`
        : dishes.slice(0, 3).map(d => `${d.name} est plutôt ${L[d.taste] || 'équilibré'}`).join(', ') + '.';
      return { reply: `${txt} ${pick(['Lequel te tente ?', 'Tu pars sur lequel ?'], ctx.lastReply)}`, awaiting: 'confirm_add' };
    }
    const parts = dishes.slice(0, 3).map(d => { const t = K.answerAboutDish(d, q); return n(t).includes(n(d.name)) ? t : `${d.name} : ${t.charAt(0).toLowerCase()}${t.slice(1)}`; });
    return { reply: `${parts.join(' ')} ${pick(['Lequel te tente ?', 'Tu pars sur lequel ?'], ctx.lastReply)}`, awaiting: 'confirm_add' };
  }

  // Restaurant
  const resto = !availability && (/(restaurant|resto|maquis|chez|grill|bar|jardin)/.test(q) || !dishes.length) ? K.findRestaurant(q) : null;
  if (resto) return { reply: `${K.answerAboutRestaurant(resto)} Je te montre un de leurs plats ?`, awaiting: null };

  // Questions sur le service
  if (faqs.length) return answerFaq(faqs, q, raw);

  if (availability) return null; // la recherche de plats s'en charge

  // Question hors sujet
  if (!FOOD.test(q) && !dishes.length) {
    return {
      reply: pick([
        "Ça, ce n'est pas mon rayon, je suis surtout calée en nourriture et en livraisons. Par contre si tu as faim, je te trouve quelque chose en deux secondes.",
        "Bonne question, mais je ne suis pas la mieux placée pour ça : moi c'est le menu, les commandes et les livraisons WAYI. Je peux t'aider de ce côté ?",
      ], ctx.lastReply),
      awaiting: null,
    };
  }
  return null;
}

// Humeur et contexte de vie : on reagit avant de proposer
function moodIntro(q) {
  if (/(fatigue|creve|epuise|flemme|pas envie de cuisiner|la flemme|journee (de ouf|difficile|longue|chargee)|stresse|deborde)/.test(q)) return pick(['Grosse journée alors. Laisse-moi m\'occuper du repas. ', 'Repose-toi, je gère le dîner. ', 'Pas de cuisine ce soir alors, je m\'en charge. ']);
  if (/(malade|pas bien|mal au ventre|grippe|rhume)/.test(q)) return 'Prends soin de toi. Je te propose quelque chose de léger. ';
  if (/(content|heureux|on fete|celebr|anniversaire|bonne nouvelle|promotion|reussi)/.test(q)) return pick(['Ça se fête ! ', 'Bravo, ça mérite un bon plat. ']);
  if (/(trop faim|tres faim|grosse faim|je meurs de faim|affame|crever de faim)/.test(q)) return pick(['Urgence alors, je vais vite. ', 'On ne te laisse pas comme ça. ']);
  if (/(fauche|pas d'argent|pas beaucoup d'argent|petit budget|fin du mois|serre)/.test(q)) return pick(['Fin de mois, je connais. Je reste sur des prix doux. ', 'On fait plaisir sans se ruiner. ']);
  return '';
}

module.exports = { smallTalk, answerQuestion, moodIntro, QUESTION, periodLabel };
