// Rangement de la carte d'un restaurant en rubriques, et separation
// description / accompagnement pour un affichage propre.
export const SECTIONS = [
  { id: 'plats_locaux', title: 'Spécialités africaines', sub: 'Les recettes de chez nous, mijotées comme à la maison' },
  { id: 'grillades', title: 'Grillades et braises', sub: 'Cuit au feu, servi bien chaud' },
  { id: 'healthy', title: 'Salades et fraîcheur', sub: 'Léger et plein de saveurs' },
  { id: 'burgers', title: 'Fast-food', sub: 'Burgers, chawarmas et pizzas' },
  { id: 'douceurs', title: 'Douceurs et boissons', sub: 'Pour finir en beauté' },
];
export const sectionOf = (d) => (d.taste === 'sucre' || d.category === 'boissons') ? 'douceurs' : (d.category || 'plats_locaux');

export function splitDesc(desc = '') {
  const i = desc.indexOf('Accompagnement au choix');
  if (i < 0) return { text: desc.trim(), side: null };
  const side = desc.slice(i).replace(/^Accompagnement au choix\s*:\s*/, '').replace(/\.$/, '');
  return { text: desc.slice(0, i).trim(), side };
}

// Les incontournables : les plats salés les plus copieux de chaque rubrique
export function signatures(dishes, n = 3) {
  const main = dishes.filter(d => sectionOf(d) !== 'douceurs');
  const out = [];
  for (const s of SECTIONS) {
    const best = main.filter(d => sectionOf(d) === s.id).sort((a, b) => b.price - a.price)[0];
    if (best) out.push(best);
  }
  for (const d of [...main].sort((a, b) => b.price - a.price)) if (!out.includes(d)) out.push(d);
  return out.slice(0, n);
}
