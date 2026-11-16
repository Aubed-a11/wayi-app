// ============================================================
// WAYI - Lien de localisation (Google Maps) d'une adresse de livraison
// Le client peut coller le lien "Partager" de Google Maps. On n'accepte que
// les sites de cartes connus (jamais un lien quelconque), pour que le livreur
// ne puisse pas être envoyé vers une page piégée.
// ============================================================
const ALLOWED_HOSTS = [
  'google.com', 'www.google.com', 'maps.google.com', 'google.bj', 'www.google.bj',
  'maps.app.goo.gl', 'goo.gl', 'share.google',
  'waze.com', 'www.waze.com',
];

// Retourne l'URL propre, ou null si le lien n'est pas valable.
function sanitizeMapsLink(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  // Le client colle souvent tout le message de partage : on garde la première adresse web.
  const found = s.match(/https?:\/\/[^\s]+/i);
  if (found) s = found[0];
  else if (/^(www\.|maps\.|goo\.gl|google\.)/i.test(s)) s = 'https://' + s;
  if (s.length > 500) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) return null;
  // google.com et goo.gl servent plein de choses : seulement les chemins de cartes.
  if ((host === 'google.com' || host === 'www.google.com' || host === 'google.bj' || host === 'www.google.bj') && !u.pathname.startsWith('/maps')) return null;
  if (host === 'goo.gl' && !u.pathname.startsWith('/maps')) return null;
  u.protocol = 'https:';
  u.username = ''; u.password = '';
  return u.toString();
}

const validCoords = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Extrait latitude/longitude d'un lien quand elles y figurent (les liens courts
// maps.app.goo.gl n'en contiennent pas : on garde alors le lien tel quel).
function parseCoordsFromLink(link) {
  if (!link) return null;
  let decoded = link;
  try { decoded = decodeURIComponent(link); } catch {}
  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|daddr|center)=(-?\d{1,2}\.\d+)[,+ ](-?\d{1,3}\.\d+)/,
    /[?&]ll=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
      if (validCoords(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// Lien d'itinéraire/position à partir de coordonnées (position GPS du téléphone).
function mapsLinkFromCoords(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!validCoords(lat, lng)) return null;
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

module.exports = { sanitizeMapsLink, parseCoordsFromLink, mapsLinkFromCoords, validCoords };
