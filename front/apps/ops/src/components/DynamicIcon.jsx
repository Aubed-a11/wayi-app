// Les icônes ont été retirées de l'interface : ce composant ne rend plus rien,
// mais reste exporté (avec TASTE_META) pour ne pas casser les imports existants.
export const TASTE_META = {
  sale:  { label: 'Salé',  color: '#3B7A9E' },
  sucre: { label: 'Sucré', color: '#D65D8A' },
  epice: { label: 'Épicé', color: '#D64545' },
  umami: { label: 'Umami', color: '#8A5A3B' },
  frais: { label: 'Frais', color: '#2E9E7A' },
  doux:  { label: 'Doux',  color: '#C9A15A' },
};

export function DynamicIcon() {
  return null;
}
