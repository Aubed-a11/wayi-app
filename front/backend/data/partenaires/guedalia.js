// ============================================================
// Guédalia Restaurant : fiche et selection de plats de sa carte
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
  // Position a confirmer avec le restaurant (sert au calcul des frais de livraison)
  lat: 6.3654, lng: 2.4183,
  prepTime: '25-35',
};

const ACC = "Accompagnement au choix : frites, alloco, attiéké, riz, pâte, akassa, piron, couscous, pommes vapeur ou purée.";

// [slug, periode, categorie, nom, prix, gout, label, description]
const PLATS = [
  // Entrees et salades
  ['salade-nicoise', 'dejeuner', 'healthy', 'Salade niçoise', 3500, 'frais', 'fraicheur', "Laitue, tomates, haricots verts, pommes vapeur, oignon, thon, filets d'anchois et olives vertes."],
  ['salade-guedalia', 'dejeuner', 'healthy', 'Salade Guédalia', 4000, 'frais', 'fraicheur', 'La salade de la maison : laitue, tomates, petits pois, pomme de terre, maïs doux, avocat, poulet et poivron vert.'],
  ['salade-avocat-crevettes', 'dejeuner', 'healthy', "Salade d'avocat aux crevettes", 3500, 'frais', 'ocean', 'Laitue, tomates, oignon, avocat, crevettes et olives vertes. Existe aussi au thon.'],
  ['salade-du-chef', 'diner', 'healthy', 'Salade du chef', 3000, 'frais', 'fraicheur', 'Laitue, tomates, jambon de dinde, maïs doux, concombre, olives noires, poulet grillé et fromage.'],
  // Chawarmas et sandwichs
  ['chawarma-poulet', 'diner', 'burgers', 'Chawarma poulet', 1500, 'sale', 'gourmand', 'Le chawarma classique au poulet, roulé dans un pain libanais.'],
  ['chawarma-guedalia', 'diner', 'burgers', 'Chawarma Guédalia', 2500, 'sale', 'gourmand', 'Le chawarma de la maison : poulet et viande steak.'],
  ['croque-monsieur', 'gouter', 'burgers', 'Croque monsieur', 1500, 'sale', 'gourmand', 'Pain de mie, jambon, fromage, tomate, laitue et oignon.'],
  ['philadelphia', 'diner', 'burgers', 'Sandwich Philadelphia', 1500, 'sale', 'gourmand', 'Viande de bœuf, oignon, poivron, champignons, fromage et mayonnaise.'],
  // Burgers
  ['cheese-burger', 'diner', 'burgers', 'Cheese burger', 2000, 'sale', 'gourmand', 'Pain burger, viande steak, laitue et fromage.'],
  ['burger-guedalia', 'diner', 'burgers', 'Burger Guédalia', 2500, 'sale', 'gourmand', 'Le burger de la maison : viande steak, jambon, oignon, tomates et fromage.'],
  // Assiettes et grillades
  ['assiette-chawarma', 'dejeuner', 'grillades', 'Assiette chawarma Guédalia', 4000, 'sale', 'gourmand', 'Pain, makouk, poulet grillé, fromage, champignons, portion de frites, sauce et grenadine.'],
  ['brochette-guedalia', 'diner', 'grillades', 'Brochette Guédalia', 5500, 'sale', 'braise', `Brochettes de poulet, de viande et de légumes. ${ACC}`],
  ['demi-poulet-grille', 'dejeuner', 'grillades', 'Demi poulet grillé', 4000, 'sale', 'braise', `Demi poulet chair grillé. ${ACC}`],
  ['poulet-bicyclette', 'diner', 'grillades', 'Poulet bicyclette entier grillé', 4500, 'sale', 'braise', `Poulet bicyclette entier, grillé au feu. ${ACC}`],
  ['choukouya-mouton', 'diner', 'grillades', 'Choukouya mouton', 4500, 'epice', 'braise', `Mouton grillé à la béninoise, oignon et piment. ${ACC}`],
  ['poisson-grille', 'diner', 'grillades', 'Poisson entier grillé BBQ', 5000, 'sale', 'ocean', `Carpe rouge, bar, dorade ou tilapia, grillé sauce barbecue. ${ACC}`],
  ['crevettes-ail', 'dejeuner', 'grillades', "Crevettes sautées à l'ail", 4000, 'sale', 'ocean', `Crevettes sautées à l'ail. ${ACC}`],
  // Pizzas
  ['pizza-marguerita', 'diner', 'burgers', 'Pizza marguerita', 3000, 'sale', 'gourmand', 'Fromage, sauce tomate et olives noires.'],
  ['pizza-quatre-fromages', 'diner', 'burgers', 'Pizza quatre fromages', 4000, 'sale', 'gourmand', 'Sauce cocktail, mozzarella, emmental, cheddar, gruyère et olives noires.'],
  ['pizza-guedalia', 'diner', 'burgers', 'Pizza Guédalia', 5000, 'sale', 'gourmand', 'La pizza de la maison : viande hachée, poulet, crème fraîche, poivron vert, oignon, maïs doux, thon, jambon et olives noires.'],
  // Specialites africaines
  ['poulet-yassa', 'dejeuner', 'plats_locaux', 'Poulet yassa', 4000, 'sale', 'terroir', `Poulet mariné au citron et aux oignons fondants. ${ACC}`],
  ['poulet-kedjenou', 'dejeuner', 'plats_locaux', 'Poulet kédjénou', 4000, 'epice', 'terroir', `Poulet mijoté à l'étouffée avec ses légumes. ${ACC}`],
  ['sauce-arachide', 'dejeuner', 'plats_locaux', "Sauce d'arachide", 3500, 'sale', 'terroir', `Sauce onctueuse à la pâte d'arachide. ${ACC}`],
  ['sauce-gombo', 'dejeuner', 'plats_locaux', 'Sauce gombo, crincrin royal', 3500, 'sale', 'terroir', `Sauce gombo et crincrin, version royale. ${ACC}`],
  ['couscous-royal', 'diner', 'plats_locaux', 'Couscous royal', 4000, 'sale', 'terroir', 'Couscous au mouton et aux légumes.'],
  ['spaghetti-bolognaise', 'diner', 'burgers', 'Spaghetti bolognaise', 2500, 'sale', 'gourmand', 'Spaghetti à la sauce tomate et viande hachée.'],
  // Desserts et jus
  ['crepe-chocolat', 'gouter', 'burgers', 'Crêpe choco', 1000, 'sucre', 'gourmand', 'Crêpe nappée de chocolat.'],
  ['degue-raisin', 'gouter', 'plats_locaux', 'Dêguê au raisin', 1000, 'sucre', 'fraicheur', 'Dêguê frais au yaourt et aux raisins secs.'],
  ['jus-ananas', 'gouter', 'boissons', "Jus d'ananas", 1000, 'frais', 'fraicheur', "Jus d'ananas naturel."],
  ['jus-gingembre', 'gouter', 'boissons', 'Jus de gingembre', 1000, 'epice', 'fraicheur', 'Jus de gingembre naturel, bien relevé.'],
  ['jus-citron', 'gouter', 'boissons', 'Jus de citron', 800, 'frais', 'fraicheur', 'Jus de citron naturel.'],
];

const DISHES = PLATS.map(([slug, period, category, name, price, taste, label, desc]) => ({
  id: `guedalia-${slug}`, restaurantId: RESTAURANT.id, period, category, name, price, taste, label, desc, image: IMG(slug),
}));

module.exports = { RESTAURANT, DISHES };
