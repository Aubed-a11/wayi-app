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
  tagline: 'Salades, chawarmas, grillades, pizzas et spécialités africaines',
  logo: `${SITE}/restaurants/guedalia.jpg`,
  zone: 'Cotonou',
  lat: 6.3654, lng: 2.4183,
  prepTime: '25-35',
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
  ['degue-raisin', 'gouter', 'plats_locaux', 'Dêguê au raisin', 1000, 'sucre', 'fraicheur', 'Dêguê frais au yaourt et aux raisins secs.'],
  ['jus-gingembre', 'gouter', 'boissons', 'Jus de gingembre', 1000, 'epice', 'fraicheur', 'Jus de gingembre naturel, bien relevé.'],
];

const DISHES = PLATS.map(([slug, period, category, name, price, taste, label, desc]) => ({
  id: `guedalia-${slug}`, restaurantId: RESTAURANT.id, period, category, name, price, taste, label, desc, image: IMG(slug),
}));

module.exports = { RESTAURANT, DISHES };
