// ============================================================
// WAYI - Menu de démonstration (Cotonou)
// Restaurants et plats d'exemple pour montrer le concept avant
// l'arrivée des vrais partenaires. Chaque restaurant est marqué
// demo:true et verified:false : AUCUNE note, AUCUNE certification
// n'est inventée. À supprimer depuis l'admin quand les vrais
// restaurants sont signés, ou à désactiver avec NO_DEMO_MENU=1.
// Photos : Unsplash (illustratives, pas les photos réelles des plats).
// ============================================================
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&h=800&q=75`;

// Identifiants stables : le semis ne crée jamais de doublons.
const R = (n) => `demo-resto-${n}`;

const DEMO_RESTAURANTS = [
  { id: R(1), name: 'Maquis Le Cocotier',  tagline: 'Cuisine béninoise du quotidien',  zone: 'Cotonou', lat: 6.3654, lng: 2.4183, prepTime: '25-35' },
  { id: R(2), name: 'Chez Maman Piment',   tagline: 'Sauces maison et pâtes',          zone: 'Cotonou', lat: 6.3702, lng: 2.4022, prepTime: '25-35' },
  { id: R(3), name: 'Maquis Le Kédjénou',  tagline: 'Poulet, riz et plats mijotés',    zone: 'Cotonou', lat: 6.3598, lng: 2.3921, prepTime: '25-35' },
  { id: R(4), name: 'Maquis du Port',      tagline: 'Poissons et fruits de mer braisés', zone: 'Cotonou', lat: 6.3532, lng: 2.4331, prepTime: '30-40' },
  { id: R(5), name: 'Le Fair Bar',         tagline: 'Petits plats et boissons fraîches', zone: 'Cotonou', lat: 6.3641, lng: 2.3772, prepTime: '20-30' },
  { id: R(6), name: 'Jardin des Saveurs',  tagline: 'Plats légers et salades',         zone: 'Cotonou', lat: 6.3605, lng: 2.3412, prepTime: '20-30' },
  { id: R(7), name: 'Le Grill de Mira',    tagline: 'Brochettes et grillades au charbon', zone: 'Cotonou', lat: 6.3758, lng: 2.4037, prepTime: '20-30' },
];

// Photos choisies pour la ressemblance avec le plat
const IMG = {
  jollofFish:    U('1665332195309-9d75071138f0'),
  jollofSkewer:  U('1664992960082-0ea299a9c53e'),
  jollofChicken: U('1664993101841-036f189719b6'),
  riceEgg:       U('1569058242252-623df46b5025'),
  plantain:      U('1788530757669-417558f26bef'),
  fishPlantain:  U('1783408356251-f4953f943bb2'),
  africanFish:   U('1665401015549-712c0dc5ef85'),
  egusi:         U('1763048443535-1243379234e2'),
  yassa:         U('1665400808116-f0e6339b7e9a'),
  thieb:         U('1665332305771-e49a5dd5ba80'),
  puff:          U('1664993085274-80c6ba725ccc'),
  friedChicken:  U('1603496987674-79600a000f55'),
  grillades:     U('1555939594-58d7cb561ad1'),
  fishUgali:     U('1666181551815-b9adecb24e46'),
  tostones:      U('1762884601729-0eeeafbdfb8a'),
  akara:         U('1647162264554-5f60af27f052'),
  bissap:        U('1713289590440-3159f2d6063c'),
  fufu:          U('1604329760661-e71dc83f8f26'),
  fufu2:         U('1673465580365-b96bef916770'),
  juice:         U('1534353473418-4cfa6c56fd38'),
  omelette:      U('1766146431872-a4472ccd3889'),
  salad:         U('1618666185561-baed3459ff18'),
  skewers:       U('1779474989201-fe2d22ff3f79'),
  skewers2:      U('1779358964755-75464e144187'),
};

// [restaurant, période, catégorie, nom, image, goût, prix indicatif (FCFA), label, description, C, A, B]
const D = (resto, period, category, name, image, taste, price, label, desc, c, a, b) =>
  ({ resto, period, category, name, image, taste, price, label, desc, characteristics: c, advantages: a, benefits: b });

const DEMO_DISHES = [
  // ── Petit-déjeuner ──
  D(2, 'petit_dejeuner', 'plats_locaux', 'Akara et bouillie de maïs', IMG.akara, 'sale', 1000, 'terroir',
    'Beignets de haricots dorés servis avec une bouillie de maïs tiède.',
    'Haricots mixés et frits\nBouillie de maïs', 'Rassasiant dès le matin\nSans viande', 'Énergie pour démarrer la journée'),
  D(5, 'petit_dejeuner', 'healthy', 'Omelette aux légumes et pain', IMG.omelette, 'sale', 1500, 'fraicheur',
    'Omelette moelleuse aux légumes frais, servie avec du pain et de la salade.',
    'Oeufs, oignon, tomate\nPain frais', 'Riche en protéines\nPréparé minute', 'Un petit-déjeuner complet et léger'),
  D(1, 'petit_dejeuner', 'plats_locaux', 'Aloko piment', IMG.plantain, 'epice', 1000, 'terroir',
    'Bananes plantains frites, servies avec une sauce pimentée maison.',
    'Plantain mûr frit\nSauce piment', 'Croustillant dehors, fondant dedans', 'Le classique des rues de Cotonou'),
  D(5, 'petit_dejeuner', 'boissons', 'Jus d\'ananas gingembre', IMG.juice, 'sucre', 800, 'fraicheur',
    'Jus pressé d\'ananas relevé d\'une pointe de gingembre.',
    'Ananas, gingembre\nSans colorant', 'Rafraîchissant', 'Un coup de fouet naturel'),

  // ── Déjeuner ──
  D(3, 'dejeuner', 'plats_locaux', 'Riz au gras et poulet frit', IMG.friedChicken, 'epice', 2500, 'terroir',
    'Riz cuit dans une sauce tomate parfumée, accompagné de poulet frit.',
    'Riz parfumé\nPoulet mariné puis frit', 'Plat complet\nGénéreux', 'Le plat des grandes occasions'),
  D(3, 'dejeuner', 'plats_locaux', 'Riz jollof et poulet', IMG.jollofChicken, 'epice', 2800, 'terroir',
    'Riz jollof relevé, servi avec du poulet tendre.',
    'Riz tomaté\nPoulet mijoté', 'Savoureux et parfumé', 'Un repas qui cale'),
  D(2, 'dejeuner', 'plats_locaux', 'Pâte et poisson frit', IMG.fishUgali, 'sale', 2500, 'ocean',
    'Pâte de maïs accompagnée de poisson frit et de sauce.',
    'Pâte de maïs\nPoisson frit', 'Plat traditionnel\nRiche en protéines', 'Le goût du pays'),
  D(2, 'dejeuner', 'plats_locaux', 'Soupe egusi et viande', IMG.egusi, 'epice', 3000, 'terroir',
    'Soupe épaisse aux graines de courge, feuilles et viandes assorties.',
    'Graines de courge\nFeuilles vertes, viandes', 'Dense et nourrissante', 'Un plat mijoté et réconfortant'),
  D(2, 'dejeuner', 'plats_locaux', 'Igname pilée et sauce feuilles', IMG.fufu, 'sale', 2500, 'terroir',
    'Igname pilée onctueuse servie avec une sauce de feuilles.',
    'Igname pilée\nSauce de feuilles', 'Sans friture\nRiche en fibres', 'Traditionnel et copieux'),
  D(7, 'dejeuner', 'plats_locaux', 'Poulet yassa', IMG.yassa, 'sale', 2800, 'terroir',
    'Poulet mariné au citron et aux oignons confits, avec du riz.',
    'Poulet, citron, oignons\nRiz blanc', 'Acidulé et fondant', 'Un grand classique d\'Afrique de l\'Ouest'),
  D(4, 'dejeuner', 'plats_locaux', 'Thiéboudienne', IMG.thieb, 'epice', 3000, 'ocean',
    'Riz au poisson et aux légumes, cuit dans une sauce tomate.',
    'Poisson, riz, légumes', 'Plat complet', 'Le riz au poisson, version généreuse'),
  D(6, 'dejeuner', 'healthy', 'Salade composée aux oeufs', IMG.salad, 'sale', 2000, 'fraicheur',
    'Salade fraîche aux oeufs durs, tomates et crudités.',
    'Légumes frais\nOeufs durs', 'Léger\nRiche en vitamines', 'Fraîcheur et légèreté à midi'),
  D(3, 'dejeuner', 'plats_locaux', 'Riz sauté, viande et oeuf', IMG.riceEgg, 'epice', 2200, 'terroir',
    'Riz sauté aux épices, viande tendre et oeuf au plat.',
    'Riz sauté\nViande, oeuf', 'Rapide et copieux', 'Un plat qui cale pour le déjeuner'),

  // ── Goûter ──
  D(1, 'gouter', 'plats_locaux', 'Beignets boflot', IMG.puff, 'sucre', 700, 'gourmand',
    'Petits beignets dorés, moelleux à coeur.',
    'Pâte levée frite', 'Chauds et moelleux', 'Le goûter de tous les jours'),
  D(1, 'gouter', 'plats_locaux', 'Aloko croustillant', IMG.tostones, 'sale', 900, 'gourmand',
    'Tranches de plantain frites bien croustillantes.',
    'Plantain frit', 'Croustillant', 'À grignoter sans modération'),
  D(7, 'gouter', 'grillades', 'Brochettes de poulet', IMG.skewers, 'epice', 1500, 'braise',
    'Brochettes de poulet grillées au charbon, épicées.',
    'Poulet mariné\nCuisson au charbon', 'Goût fumé', 'Parfait pour partager'),
  D(5, 'gouter', 'boissons', 'Bissap glacé', IMG.bissap, 'sucre', 700, 'fraicheur',
    'Infusion glacée de fleurs d\'hibiscus, légèrement sucrée.',
    'Hibiscus, sucre, menthe', 'Désaltérant', 'La boisson fraîche incontournable'),

  // ── Dîner ──
  D(4, 'diner', 'grillades', 'Poisson braisé et aloko', IMG.fishPlantain, 'epice', 3500, 'braise',
    'Poisson braisé au charbon, plantain frit, oignons et citron.',
    'Poisson frais braisé\nAloko, oignons', 'Cuisson au charbon\nRiche en protéines', 'Le dîner préféré des maquis'),
  D(4, 'diner', 'grillades', 'Riz jollof et poisson grillé', IMG.jollofFish, 'epice', 3500, 'braise',
    'Riz jollof accompagné de poisson grillé et de crudités.',
    'Riz tomaté\nPoisson grillé', 'Équilibré et savoureux', 'Un dîner complet'),
  D(7, 'diner', 'grillades', 'Grillades mixtes', IMG.grillades, 'epice', 4000, 'braise',
    'Assortiment de viandes grillées au charbon avec sauce piment.',
    'Viandes grillées\nSauce piment', 'À partager', 'Pour les soirées entre amis'),
  D(7, 'diner', 'grillades', 'Brochettes au charbon', IMG.skewers2, 'epice', 2000, 'braise',
    'Brochettes grillées au feu de charbon, servies chaudes.',
    'Viande marinée\nCuisson au feu de charbon', 'Fumé et tendre', 'Un classique du soir'),
  D(3, 'diner', 'plats_locaux', 'Riz jollof et brochettes', IMG.jollofSkewer, 'epice', 3000, 'terroir',
    'Riz jollof parfumé, servi avec des brochettes de poulet.',
    'Riz tomaté\nBrochettes de poulet', 'Plat complet', 'Un repas gourmand'),
  D(6, 'diner', 'healthy', 'Poisson grillé citron et légumes', IMG.africanFish, 'sale', 3200, 'fraicheur',
    'Poisson grillé au citron, accompagné de légumes frais.',
    'Poisson grillé\nCitron, légumes', 'Léger\nRiche en oméga-3', 'Un dîner léger sans compromis'),
  D(2, 'diner', 'plats_locaux', 'Igname pilée et soupe', IMG.fufu2, 'sale', 2800, 'terroir',
    'Igname pilée servie avec une soupe épicée.',
    'Igname pilée\nSoupe épicée', 'Doux et réconfortant', 'Un plat chaud pour finir la journée'),
];

module.exports = { DEMO_RESTAURANTS, DEMO_DISHES };
