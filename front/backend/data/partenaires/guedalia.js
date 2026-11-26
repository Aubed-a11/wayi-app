// ============================================================
// Guédalia Restaurant : fiche et 10 plats de sa carte, surtout africains
// (prix de la carte du restaurant). Photos : images libres de droits
// trouvees sur le web, a remplacer par les vraies photos du restaurant.
// Identifiants stables : l'insertion ne cree jamais de doublon.
// ============================================================
const SITE = process.env.PUBLIC_SITE_URL || 'https://www.wayibenin.com';
const IMG = (slug) => `${SITE}/plats/guedalia/${slug}.jpg`;

const RESTAURANT = {
  id: 'resto-guedalia',
  name: 'Guédalia Restaurant',
  tagline: 'Spécialités africaines et grillades au feu',
  // Ancienne phrase remplacee au demarrage si elle n'a pas ete modifiee depuis
  oldTaglines: ['Salades, chawarmas, grillades, pizzas et spécialités africaines'],
  logo: `${SITE}/restaurants/guedalia.jpg`,
  zone: 'Abomey-Calavi, face Université Le Faucon',
  // Position approchee (secteur du campus d'Abomey-Calavi), a affiner avec le point GPS exact
  lat: 6.441, lng: 2.352,
  // Ancienne position par defaut, remplacee au demarrage si elle n'a pas ete modifiee depuis
  oldPositions: [[6.3654, 2.4183]],
  prepTime: '25-35',
  // Formule du contrat de partenariat (article 4)
  plan: 'ahossi',
  menuVersion: 2,
};

// Compte de connexion de l'espace restaurant (mot de passe transmis au proprietaire,
// seule son empreinte chiffree est ici ; a changer depuis l'espace restaurant)
const ACCOUNT = {
  id: 'merchant-guedalia',
  email: 'guedalia@wayibenin.com',
  name: 'Guédalia Restaurant',
  passwordHash: '$2a$10$MG0VKUtsqgcdMzTRdnu7R.stm0GQxArd3kZSzTdM017g6YYJlUN0C',
};

const ACC = "Accompagnement au choix : frites, alloco, attiéké, riz, pâte, akassa, piron, couscous, pommes vapeur ou purée.";

// [slug, periode, categorie, nom, prix, gout, label, description]
const PLATS = [
  ['poulet-bicyclette', 'diner', 'grillades', 'Poulet bicyclette entier grillé', 4500, 'sale', 'braise', `Poulet bicyclette entier, grillé au feu. ${ACC}`],
  ['choukouya-mouton', 'diner', 'grillades', 'Choukouya mouton', 4500, 'epice', 'braise', `Mouton grillé à la béninoise, oignon et piment. ${ACC}`],
  ['poisson-grille', 'diner', 'grillades', 'Poisson entier grillé BBQ', 5000, 'sale', 'ocean', `Carpe rouge, bar, dorade ou tilapia, grillé sauce barbecue. ${ACC}`],
  ['poulet-yassa', 'dejeuner', 'plats_locaux', 'Poulet yassa', 4000, 'sale', 'terroir', `Poulet mariné au citron et aux oignons fondants. ${ACC}`],
  ['poulet-kedjenou', 'dejeuner', 'plats_locaux', 'Poulet kédjénou', 4000, 'epice', 'terroir', `Poulet mijoté à l'étouffée avec ses légumes. ${ACC}`],
  ['sauce-arachide', 'dejeuner', 'plats_locaux', "Sauce d'arachide", 3500, 'sale', 'terroir', `Sauce onctueuse à la pâte d'arachide. ${ACC}`],
  ['sauce-gombo', 'dejeuner', 'plats_locaux', 'Sauce gombo, crincrin royal', 3500, 'sale', 'terroir', `Sauce gombo et crincrin, version royale. ${ACC}`],
  ['couscous-royal', 'diner', 'plats_locaux', 'Couscous royal', 4000, 'sale', 'terroir', 'Couscous au mouton et aux légumes.'],
  // Ajoutes le 26/11/2026 pour la formule Ahossi (15 plats)
  ['sauce-legumes', 'dejeuner', 'plats_locaux', 'Sauce légumes', 3500, 'sale', 'terroir', `Gboman, tchiayo et amanvivê, la sauce feuille de chez nous. ${ACC}`, 2],
  ['monyo', 'dejeuner', 'plats_locaux', 'Monyo', 3500, 'epice', 'terroir', `Sauce crue tomate, oignon et piment, servie avec son poisson ou sa viande. ${ACC}`, 2],
  ['bomiwo-poulet', 'dejeuner', 'plats_locaux', 'Bomiwô au poulet entier', 4000, 'sale', 'terroir', 'Pâte rouge de maïs à la tomate, servie avec un poulet entier.', 2],
  ['choukouya-poulet', 'diner', 'grillades', 'Choukouya poulet', 4500, 'epice', 'braise', `Poulet grillé à la béninoise, oignon et piment. ${ACC}`, 2],
  ['lapin-grille', 'diner', 'grillades', 'Lapin grillé sauce BBQ', 4000, 'sale', 'braise', `Lapin grillé, nappé de sauce barbecue. ${ACC}`, 2],
  ['degue-raisin', 'gouter', 'plats_locaux', 'Dêguê au raisin', 1000, 'sucre', 'fraicheur', 'Dêguê frais au yaourt et aux raisins secs.'],
  ['jus-gingembre', 'gouter', 'boissons', 'Jus de gingembre', 1000, 'epice', 'fraicheur', 'Jus de gingembre naturel, bien relevé.'],
];

const DISHES = PLATS.map(([slug, period, category, name, price, taste, label, desc, since = 1]) => ({
  since, id: `guedalia-${slug}`, restaurantId: RESTAURANT.id, period, category, name, price, taste, label, desc, image: IMG(slug),
}));

module.exports = { RESTAURANT, DISHES, ACCOUNT };
