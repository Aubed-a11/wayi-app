// ============================================================
// WAYI - Ce que Yivi sait du service (base de connaissances)
// Toutes les reponses sont construites a partir de la configuration
// et des donnees reelles (horaires, frais, moyens de paiement, menu,
// restaurants). Rien n'est invente : si une info n'existe pas dans
// les donnees, Yivi le dit et oriente vers la bonne solution.
// Utilise par l'IA (outils infos_wayi, details_plat, infos_restaurant)
// et par le mode secours (reponses directes).
// ============================================================
const { PLATFORM_CONFIG, PERIODS, getMenu, getDishById, restaurants, enrichDish } = require('../../data/store');
const { paymentMode } = require('../payment');

const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
const fmt = (x) => `${Number(x || 0).toLocaleString('fr-FR').replace(/ /g, ' ')} FCFA`;
const chez = (name) => (/^chez /i.test(name || '') ? `chez ${name.slice(5)}` : `chez ${name}`);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function support() {
  const phone = (process.env.SUPPORT_PHONE || '').trim();
  const wa = (process.env.SUPPORT_WHATSAPP || '').trim();
  const mail = (process.env.SUPPORT_EMAIL || '').trim();
  const ways = [wa && `WhatsApp au ${wa}`, phone && `téléphone au ${phone}`, mail && `e-mail à ${mail}`].filter(Boolean);
  return ways.length ? `l'équipe WAYI par ${ways.join(', ou ')}` : null;
}

function methodsLabel() {
  // Chargement tardif pour eviter une dependance circulaire avec tools.js
  const { availableMethods } = require('./tools');
  const l = availableMethods().map(m => m.label);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1].charAt(0).toLowerCase()}${l[l.length - 1].slice(1)}` : l.join('');
}

const cfg = PLATFORM_CONFIG;
const plans = () => Object.values(cfg.clientSubscriptionPlans || {});

// ─── Questions frequentes ───────────────────────────────────────
// re : teste sur le message normalise (minuscules, sans accents)
const FAQ = [
  {
    id: 'horaires', sujet: "Heures d'ouverture et créneaux",
    re: /(horaire|heure.{0,12}(ouvert|ferme|service|livr)|ouvert|ferme|jusqu'a quelle heure|a partir de quelle heure|quand (est-ce que )?(vous )?(livrez|ouvrez)|tard|creneau|le dimanche|le week-?end|jours? ferie)/,
    answer: () => `On livre tous les jours de 6h à 22h, heure du Bénin. Le menu suit quatre moments : ${PERIODS.map(p => `${p.label.toLowerCase()} (${p.hours.replace(/\s/g, '')})`).join(', ')}. Une commande passée en dehors de ces heures est traitée à la réouverture.`,
  },
  {
    id: 'zone', sujet: 'Zone de livraison',
    re: /(zone|vous livrez (a|ou|dans|jusqu)|livrez[- ]vous|tu livres (a|ou)|quartier|jusqu'ou|ville|calavi|cotonou|porto[- ]?novo|abomey|ouidah|akpakpa|fidjrosse|godomey|cadjehoun|hors de cotonou|a l'etranger)/,
    answer: () => `Pour l'instant on livre Cotonou, Abomey-Calavi et leurs environs, jusqu'à ${cfg.maxDeliveryKm} km du restaurant. Au moment de commander, tu places l'épingle sur la carte : si ton point est trop loin, l'appli te le dit avant de payer.`,
  },
  {
    id: 'frais', sujet: 'Frais de livraison',
    re: /(frais|cout|coute|prix|combien|tarif).{0,25}(livraison|livrer|livreur|deplacement)|(livraison|delivery).{0,15}(gratuite|offerte|payante|combien|cher|prix)/,
    answer: () => `Les frais dépendent de la distance : ${fmt(cfg.deliveryBasePrice)} de base plus ${fmt(cfg.deliveryPerKm)} par km entre le restaurant et toi. Si ton panier vient de deux restaurants, il y a deux livraisons, donc deux frais. Avec un abonnement WAYI, la livraison est offerte. Le montant exact s'affiche dans ton panier une fois ton point choisi.`,
  },
  {
    id: 'delai', sujet: 'Délai de livraison',
    re: /(combien de temps|ca prend|delai|en combien|temps de livraison|ca met|rapide|vite|minutes? pour)/,
    answer: () => {
      const preps = restaurants.filter(r => r.prepTime).map(r => r.prepTime.split('-').map(Number));
      const min = preps.length ? Math.min(...preps.map(p => p[0])) : 20;
      const max = preps.length ? Math.max(...preps.map(p => p[1] || p[0])) : 40;
      return `La préparation prend entre ${min} et ${max} minutes selon le restaurant (c'est affiché sur chaque plat), puis le trajet du livreur, souvent 10 à 20 minutes en ville. Compte en général 35 à 60 minutes. Tu suis le livreur en direct sur la carte une fois qu'il a récupéré ton repas.`;
    },
  },
  {
    id: 'paiement', sujet: 'Moyens de paiement',
    re: /(paiement|payer|paye|momo|moov|flooz|carte bancaire|visa|espece|cash|liquide|mobile money|kkiapay)/,
    answer: () => {
      const mode = paymentMode();
      const extra = mode === 'test' ? " En ce moment l'appli est en mode test : le paiement en ligne est simulé, aucun argent n'est prélevé."
        : mode === 'kkiapay' ? " Le paiement en ligne passe par une fenêtre sécurisée Kkiapay : WAYI ne voit jamais tes codes."
        : mode === 'manual' ? " Pour MoMo et Moov, tu envoies le montant au numéro affiché, et le restaurant commence dès la réception confirmée."
        : '';
      return `Tu peux payer par ${methodsLabel()}.${extra} Si tu paies en espèces, prévois l'appoint pour le livreur.`;
    },
  },
  {
    id: 'annulation', sujet: 'Annuler une commande',
    re: /(annul|je ne veux plus|j'ai change d'avis|arreter la commande|stopper la commande)/,
    answer: () => "Tu peux annuler toi-même tant que le restaurant n'a pas encore accepté la commande : bouton Annuler la commande sur l'écran de suivi. Une fois qu'il a commencé à cuisiner, ce n'est plus possible depuis l'appli.",
  },
  {
    id: 'remboursement', sujet: 'Remboursement',
    re: /(rembours|recuperer mon argent|argent perdu|debite|preleve deux fois|double paiement)/,
    answer: () => `Si une commande payée en ligne est annulée, le remboursement est fait sous 24 à 48h sur le moyen utilisé.${support() ? ` Si ce n'est pas le cas, contacte ${support()} avec ton numéro de commande.` : ' Garde ton numéro de commande (WY-...), il sert à retrouver le paiement.'}`,
  },
  {
    id: 'abonnement', sujet: 'Abonnement livraison gratuite',
    re: /(abonnement|\babonne|s'abonner|\bpass\b|forfait|livraison illimitee)/,
    answer: () => {
      const p = plans();
      return p.length
        ? `WAYI propose ${p.map(x => `${x.label.toLowerCase()} à ${fmt(x.price)} (${x.benefit.charAt(0).toLowerCase()}${x.benefit.slice(1)})`).join(' et ')}. Ça se prend dans ton Profil, rubrique abonnement. Si tu commandes plus de trois ou quatre fois par semaine, c'est vite rentabilisé.`
        : "Il n'y a pas d'abonnement disponible pour le moment.";
    },
  },
  {
    id: 'probleme', sujet: 'Problème avec une commande',
    re: /(j'attends|attend(s)? depuis|ca fait (une|1|deux|2|\d+) ?(h|heure)|ca fait .{0,20} que j'attends|retard|en retard|trop long|toujours pas (arrive|livre|recu)|pas recu|jamais (arrive|recu)|froid|mauvais plat|pas le bon|il manque|manquant|renverse|abime|mal cuit|pas bon|degueu|immangeable|livreur (introuvable|perdu|ne repond)|probleme|souci|plainte|reclam)/,
    answer: () => `Désolée pour ça. Sur l'écran de suivi, tu peux appeler directement le livreur, et une fois la commande livrée tu peux la noter et laisser un commentaire : chaque note est lue par l'équipe et compte pour le restaurant.${support() ? ` Pour un plat manquant, un mauvais plat ou un remboursement, écris à ${support()} avec ton numéro de commande.` : ' Pour un plat manquant ou un mauvais plat, garde ton numéro de commande (WY-...) : l\'équipe WAYI s\'en sert pour régler le problème avec le restaurant.'}`,
  },
  {
    id: 'contact', sujet: 'Contacter WAYI',
    re: /(contact|joindre|appeler (wayi|le support|quelqu'un)|parler a (un humain|quelqu'un|une personne|un conseiller)|service client|numero de wayi|support)/,
    answer: () => support()
      ? `Tu peux joindre ${support()}. Pour une commande en cours, le plus rapide reste d'appeler le livreur depuis l'écran de suivi.`
      : "Pour une commande en cours, le plus rapide est d'appeler le livreur depuis l'écran de suivi. Pour le reste, dis-moi ce qui se passe et je te guide.",
  },
  {
    id: 'partenaire', sujet: 'Devenir restaurant partenaire',
    re: /(devenir partenaire|inscrire mon restaurant|mon restaurant|j'ai un (resto|restaurant|maquis)|vendre (sur|avec) wayi|referencer)/,
    answer: () => `Les restaurants rejoignent WAYI sur sélection : l'équipe goûte et vérifie l'hygiène avant de mettre un plat au menu. Il existe un espace restaurant pour gérer ses plats et ses commandes.${support() ? ` Pour candidater, écris à ${support()}.` : ''}`,
  },
  {
    id: 'livreur', sujet: 'Devenir livreur',
    re: /(devenir livreur|travailler (chez|avec|pour) wayi|recrut|emploi|job|postuler|zem|moto pour livrer)/,
    answer: () => `Les livreurs WAYI utilisent une appli dédiée et touchent ${Math.round(cfg.driverShare * 100)} % des frais de chaque livraison.${support() ? ` Pour postuler, écris à ${support()}.` : " L'équipe WAYI recrute directement, dis-moi si tu veux que je t'explique le fonctionnement."}`,
  },
  {
    id: 'allergies', sujet: 'Allergies et régimes',
    re: /(allerg|intoleran|gluten|lactose|arachide|cacahuete|halal|vegetarien|vegan|sans viande|regime|diabet|enceinte)/,
    answer: () => "Je peux te dire ce que contient chaque plat d'après la fiche du restaurant, et je retiens ce que tu ne veux pas pour ne plus te le proposer. Par contre je n'ai pas de liste d'allergènes certifiée : en cas d'allergie sérieuse, évite les plats dont tu n'es pas sûr et demande au livreur de vérifier avec le restaurant.",
  },
  {
    id: 'qualite', sujet: 'Qualité et hygiène',
    re: /(hygien|propre|qualite|confiance|frais du jour|fiable|serieux|arnaque)/,
    answer: () => "WAYI fonctionne comme un curateur : on ne met pas tous les restaurants, seulement des plats choisis chez des partenaires vérifiés. Les notes des clients après chaque livraison sont suivies, et un plat mal noté sort du menu.",
  },
  {
    id: 'groupe', sujet: 'Commander pour plusieurs personnes',
    re: /(pour (\d+|deux|trois|quatre|cinq|six|dix) personnes|(on est|nous sommes|on sera) (\d+|deux|trois|quatre|cinq|six|sept|huit|dix)|au bureau|pour (toute )?la famille|pour le bureau|pour mes collegues|grosse commande|en groupe|evenement|anniversaire|traiteur)/,
    answer: () => "Pas de souci : tu peux mettre plusieurs portions du même plat et mélanger les plats, jusqu'à 50 articles par commande. Dis-moi combien vous êtes et votre budget, je compose quelque chose. Pour un événement plus gros, mieux vaut s'y prendre à l'avance.",
  },
  {
    id: 'programmer', sujet: 'Commander à l\'avance',
    re: /(a l'avance|programmer|planifier|pour demain|pour ce soir|reserver|plus tard|a une heure precise)/,
    answer: () => "Les commandes partent tout de suite au restaurant, on ne peut pas encore choisir une heure de livraison. Le mieux est de commander une quarantaine de minutes avant l'heure où tu veux manger. Je peux déjà préparer ton panier si tu veux.",
  },
  {
    id: 'adresse', sujet: 'Adresse et position',
    re: /(changer (d'|mon )?adresse|autre adresse|nouvelle adresse|ma position|gps|localisation|livrer (au|a mon) (bureau|travail)|pas chez moi)/,
    answer: () => "À chaque commande, tu choisis où être livré : ta position actuelle, un point touché sur la carte, ou une adresse enregistrée. Ajoute un repère (portail, pharmacie, couleur du mur), ça aide beaucoup le livreur. Tu peux enregistrer plusieurs adresses dans ton Profil.",
  },
  {
    id: 'pourboire', sujet: 'Pourboire',
    re: /(pourboire|tip|donner (quelque chose|un peu) au livreur)/,
    answer: () => "Il n'y a pas de pourboire dans l'appli. Si tu veux remercier ton livreur, tu peux lui donner directement, et une bonne note l'aide aussi.",
  },
  {
    id: 'compte', sujet: 'Compte et mot de passe',
    re: /(mot de passe|mdp|connexion|me connecter|mon compte|supprimer (mon )?compte|changer (mon )?(nom|numero|email|telephone))/,
    answer: () => "Mot de passe oublié : sur la page de connexion, appuie sur Mot de passe oublié, entre le code reçu par e-mail puis choisis le nouveau mot de passe. Ça marche pour les comptes client, restaurant et livreur. Ton nom, ton numéro et tes adresses se modifient dans ton Profil.",
  },
  {
    id: 'recu', sujet: 'Reçu de commande',
    re: /(recu|facture|justificatif|preuve de paiement)/,
    answer: () => "Le reçu de chaque commande est disponible depuis l'écran de suivi de la commande, avec le détail des plats, des frais et du paiement.",
  },
  {
    id: 'wayi', sujet: 'Ce qu\'est WAYI',
    re: /(c'est quoi wayi|wayi c'est quoi|qu'est-ce que wayi|c'est quoi cette app|a propos de wayi|comment (ca|wayi) marche|pourquoi wayi|difference avec)/,
    answer: () => "WAYI, c'est la livraison de repas au Bénin version curatrice : au lieu de te noyer sous des centaines de restaurants, on te propose chaque jour un menu de plats choisis chez des partenaires vérifiés, du petit-déjeuner au dîner. Tu choisis, tu paies, et tu suis ton livreur en direct jusqu'à ta porte.",
  },
  {
    id: 'menu_change', sujet: 'Renouvellement du menu',
    re: /(menu (change|du jour|de la semaine|hebdo)|nouveau(x)? plat|nouveautes|chaque jour|tous les jours le meme)/,
    answer: () => "Le menu est organisé par moment de la journée et il évolue : les restaurants partenaires ajoutent et retirent des plats, et les plats les mieux notés restent. Je te propose en priorité ce que tu n'as pas encore goûté.",
  },
];

// Questions sur WAYI : renvoie les entrees qui correspondent
function matchFaq(q) {
  const t = n(q);
  return FAQ.filter(f => f.re.test(t));
}

function faqFacts(question) {
  const found = matchFaq(question);
  const list = found.length ? found : FAQ;
  return {
    reponses: list.slice(0, found.length ? 3 : FAQ.length).map(f => ({ sujet: f.sujet, info: f.answer() })),
    ...(found.length ? {} : { note: "Aucun sujet precis reconnu : voici toutes les infos disponibles. N'invente rien au-dela." }),
  };
}

// ─── Plats ──────────────────────────────────────────────────────
const lines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const MEAT = /(poulet|boeuf|bœuf|viande|mouton|porc|agneau|poisson|crevette|chevre|saucisse|lapin|dinde|brochette|grillade|fruits de mer)/;

function dishFacts(dish) {
  const d = enrichDish(dish);
  const text = n(`${d.name} ${d.desc || d.description || ''} ${d.characteristics}`);
  const meat = MEAT.test(text);
  return {
    id: d.id,
    nom: d.name,
    prix: d.price,
    restaurant: d.restaurant?.name,
    restaurant_description: d.restaurant?.tagline,
    temps_preparation_min: d.restaurant?.prepTime,
    creneau: PERIODS.find(p => p.id === d.period)?.label,
    heures_creneau: PERIODS.find(p => p.id === d.period)?.hours,
    gout: d.taste,
    description: d.desc || d.description || '',
    composition: lines(d.characteristics),
    points_forts: lines(d.advantages),
    pour_qui: lines(d.benefits),
    contient_viande_ou_poisson: meat ? 'oui' : (/sans viande/.test(n(d.advantages)) ? 'non' : 'pas precise sur la fiche'),
    note_restaurant: d.restaurant?.rating || undefined,
    exemple_non_commandable: d.demo && process.env.ALLOW_DEMO_ORDERS !== '1' ? true : undefined,
  };
}

const STOP = new Set(['avec', 'pour', 'sans', 'dans', 'plat', 'plats', 'quoi', 'cest', 'est', 'combien', 'coute', 'prix', 'dedans', 'comment', 'pourquoi', 'quel', 'quelle', 'restaurant', 'epice', 'pimente', 'fort', 'temps', 'vous', 'avez', 'votre', 'cette', 'celui', 'celle', 'leur', 'mais', 'tres', 'trop', 'bien', 'aussi', 'peux', 'veux', 'faire', 'fait', 'compose', 'ingredients', 'contient', 'menu', 'jour', 'livraison', 'bon', 'bonne', 'servi', 'sert', 'maman', 'chez', 'maquis', 'grand', 'petit', 'portion', 'viande', 'dedans', 'sucre', 'sale', 'halal', 'epicee', 'pimentee', 'copieux', 'leger', 'doux', 'frais', 'chaud', 'froid', 'bien', 'quoi', 'ont', 'sont', 'ils', 'elles', 'deux', 'premier', 'deuxieme', 'dernier', 'second']);

// Trouve un plat cite par son nom (meilleur recouvrement de mots)
function findDish(text, opts = {}) {
  const r = findDishScored(text, opts);
  return r ? r.dish : null;
}
function findDishScored(text, { ids = null, minScore = 1 } = {}) {
  const words = n(text).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  const pool = ids ? ids.map(getDishById).filter(Boolean) : getMenu({});
  let best = null; let bestScore = 0;
  for (const d of pool) {
    const name = n(d.name).split(/[^a-z0-9]+/);
    const score = words.filter(w => name.some(x => x === w || (w.length > 4 && x.startsWith(w.slice(0, -1))))).length;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return bestScore >= minScore ? { dish: best, score: bestScore } : null;
}

// Petites questions sur un plat precis : reponse construite uniquement a partir de la fiche
function answerAboutDish(dish, q) {
  const f = dishFacts(dish);
  const t = n(q);
  const spicyAsk = /(epice|pimente|piquant|ca pique|\bfort\b|releve)/.test(t);
  const parts = [];
  const priceAsk = /(prix|coute|cher|combien (il |elle |ca )?(coute|fait|vaut)|c'est combien|^combien\s*\??$|combien pour)/.test(t) && !/combien de (temps|minutes|personnes)/.test(t);
  const descAsk = /(dedans|ingredient|compose|contient|y a quoi|fait avec|avec quoi|c'est quoi|qu'est-ce que c'est|ca ressemble|explique|decris|parle[- ]moi)/.test(t);
  const otherAsk = spicyAsk || priceAsk || /(sucre|sale|doux|acide|amer|gout|temps|delai|minutes|attendre|rapide|long|copieux|portion|quantite|personnes|cale|suffit|viande|vegetarien|vegan|halal|qui le|quel restaurant|ou (est|se trouve)|d'ou|disponible|servi)/.test(t);
  if (descAsk || !otherAsk) {
    const desc = f.description.replace(/\.$/, '');
    const comp = f.composition.join(', ').toLowerCase();
    const overlap = comp && n(desc).includes(n(f.composition[0] || '').split(' ')[0]);
    if (desc) parts.push(`${cap(desc)}.${comp && !overlap ? ` Dedans : ${comp}.` : ''}`);
    else parts.push(comp ? `Dedans : ${comp}.` : `Le restaurant n'a pas encore détaillé la fiche de ${f.nom}.`);
  }
  const spicyText = /(epice|pimente|piment)/.test(n(`${f.description} ${f.composition.join(' ')}`));
  if (spicyAsk) {
    if (f.gout === 'epice') parts.push(`Oui, ${f.nom} est relevé. Si tu crains le piment, je peux te trouver une option plus douce.`);
    else if (spicyText) parts.push(`${f.nom} a une partie relevée d'après la fiche (${/soupe|sauce/.test(n(f.description)) ? 'la sauce ou la soupe' : 'le piment'}). Si tu ne supportes pas le piment, je te propose plus doux.`);
    else parts.push(`Non, ${f.nom} n'est pas épicé, ${f.gout === 'sucre' ? "c'est plutôt sucré" : f.gout === 'frais' ? "c'est plutôt frais et léger" : f.gout === 'doux' ? "c'est plutôt doux" : 'tu peux y aller tranquille'}.`);
  }
  if (/(sucre|sale|doux|acide|amer|gout)/.test(t) && !descAsk) {
    const L = { sale: 'salé', sucre: 'sucré', epice: 'relevé', umami: 'gourmand et bien garni', frais: 'frais et léger', doux: 'doux' };
    parts.push(`Côté goût, ${f.nom} est plutôt ${L[f.gout] || 'équilibré'}.`);
  }
  if (priceAsk) parts.push(`Il est à ${fmt(f.prix)}${f.restaurant ? ` ${chez(f.restaurant)}` : ''}, hors frais de livraison.`);
  if (/(temps|delai|minutes|attendre|rapide|long)/.test(t)) parts.push(`Le restaurant le prépare en ${f.temps_preparation_min || '20-30'} minutes, à quoi s'ajoute le trajet du livreur.`);
  if (/(copieux|portion|quantite|personnes|ca cale|suffit|gros|faim)/.test(t)) {
    const hint = [...f.points_forts, ...f.pour_qui].find(x => /(copieux|genereux|cale|complet|rassasi|leger|petit)/.test(n(x)));
    parts.push(hint ? `D'après le restaurant : ${hint.charAt(0).toLowerCase()}${hint.slice(1)}. C'est une portion pour une personne.` : "C'est une portion pour une personne. Si tu as très faim, prends-en deux ou ajoute un accompagnement.");
  }
  if (/halal/.test(t)) parts.push(f.contient_viande_ou_poisson === 'oui' ? "La fiche ne dit pas si la viande est halal, je préfère ne pas te l'affirmer. Si c'est important pour toi, je te propose un plat sans viande." : "D'après la fiche il n'y a pas de viande dedans.");
  else if (/(viande|vegetarien|vegan)/.test(t)) {
    parts.push(f.contient_viande_ou_poisson === 'oui' ? `Il contient de la viande ou du poisson.` : f.contient_viande_ou_poisson === 'non' ? "Il est sans viande." : "La fiche ne précise pas s'il contient de la viande : en cas de doute, je te propose autre chose.");
  }
  if (/(qui le (prepare|fait)|quel restaurant|ou (est|se trouve)|d'ou|vient d'ou)/.test(t)) parts.push(`Il vient ${chez(f.restaurant)}${f.restaurant_description ? `, ${f.restaurant_description.charAt(0).toLowerCase()}${f.restaurant_description.slice(1)}` : ''}.`);
  if (/(disponible|aujourd'hui|maintenant|en ce moment|ce soir|ce midi)/.test(t)) parts.push(`Il est au menu au ${f.creneau.toLowerCase()} (${f.heures_creneau.replace(/\s/g, '')}).`);
  if (f.exemple_non_commandable) parts.push("Attention, c'est un plat d'exemple : il n'est pas encore commandable.");
  return parts.join(' ');
}

// ─── Restaurants ────────────────────────────────────────────────
// Mots de noms de restaurants qui sont aussi des mots courants : il faut un indice en plus
const AMBIGUOUS = ['piment', 'saveurs', 'grill', 'bar', 'jardin', 'port', 'maman', 'fair'];
function findRestaurant(text) {
  const t = n(text);
  const hint = /(restaurant|resto|maquis|chez|partenaire)/.test(t);
  let best = null; let bestScore = 0;
  for (const r of restaurants) {
    const words = n(r.name).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['chez', 'maquis', 'le', 'la', 'les', 'des', 'du'].includes(w));
    const hits = words.filter(w => new RegExp(`\\b${w}\\b`).test(t));
    const score = hits.length >= 2 || hits.some(w => !AMBIGUOUS.includes(w)) || (hits.length && hint) ? hits.length : 0;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

function restaurantFacts(r) {
  const plats = getMenu({}).filter(d => d.restaurantId === r.id);
  return {
    nom: r.name, description: r.tagline, zone: r.zone, temps_preparation_min: r.prepTime, note: r.rating || undefined,
    plats_au_menu: plats.map(d => ({ id: d.id, nom: d.name, prix: d.price, creneau: PERIODS.find(p => p.id === d.period)?.label })),
  };
}

function answerAboutRestaurant(r) {
  const f = restaurantFacts(r);
  const dishes = f.plats_au_menu.slice(0, 4).map(d => `${d.nom} (${fmt(d.prix)})`);
  return `${f.nom}, c'est ${f.description ? f.description.charAt(0).toLowerCase() + f.description.slice(1) : 'un de nos partenaires'}${f.zone ? `, à ${f.zone}` : ''}. Ils préparent en ${f.temps_preparation_min || '20-30'} minutes.${dishes.length ? ` Au menu chez eux : ${dishes.join(', ')}.` : " Ils n'ont pas de plat au menu en ce moment."}`;
}

// ─── Menu entier ────────────────────────────────────────────────
function menuExtremes(period) {
  const menu = getMenu(period ? { period } : {}).filter(d => !(d.demo && process.env.ALLOW_DEMO_ORDERS !== '1'));
  if (!menu.length) return null;
  const byPrice = [...menu].sort((a, b) => a.price - b.price);
  const prep = (d) => parseInt(String(enrichDish(d).restaurant?.prepTime || '30').split('-')[0], 10);
  const byTime = [...menu].sort((a, b) => prep(a) - prep(b) || a.price - b.price);
  return { cheapest: byPrice[0], priciest: byPrice[byPrice.length - 1], fastest: byTime[0], count: menu.length };
}

// Quartiers et communes dans la zone de livraison
const IN_ZONE = /(cotonou|calavi|godomey|akpakpa|fidjrosse|fidjiross|cadjehoun|haie vive|gbegamey|agla|menontin|zogbo|vedoko|sainte rita|ste rita|jericho|togbin|cococodji|akassato|togba|ouedo|tankpe|zogbadje|kouhounou|houeyiho|ganhi|dantokpa|missebo|placodji|ladji|segbeya|kindonou|houenoussou|mifongo|gbedjromede|aidjedo|zongo|saint michel|st michel|le campus|uac|abomey[- ]calavi|seme|pk ?\d+)/;
const FAR = /(porto[- ]?novo|\babomey\b(?![- ]calavi)|ouidah|parakou|bohicon|allada|lokossa|natitingou|djougou|kandi|grand[- ]popo|lome|lagos|togo|nigeria|maroc|france|etranger)/;

module.exports = {
  IN_ZONE, FAR, methodsLabel,
  FAQ, matchFaq, faqFacts, findDish, findDishScored, dishFacts, answerAboutDish,
  findRestaurant, restaurantFacts, answerAboutRestaurant, menuExtremes, support, n, fmt, chez, cap,
};
