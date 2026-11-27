// ============================================================
// WAYI - Une seule application, quatre espaces
// Client (cette appli), Livreur, Restaurant, Administration.
// Apres connexion ou inscription, chacun est envoye dans son espace.
// - Appli mobile : les espaces sont dans la meme appli (/livreur/, /pro/)
// - Web : sites dedies (driver.wayibenin.com, admin.wayibenin.com)
// - Local : ports 5174 et 5175
// Le jeton passe dans l'adresse (#auth=...) et l'espace l'enregistre aussitot.
// ============================================================
const MODE = import.meta.env.MODE;
const BASES = MODE === 'mobile'
  // Fichier index.html explicite : sans lui, l'appli recharge l'espace client
  ? { driver: '/livreur/index.html', merchant: '/pro/index.html', admin: '/pro/index.html', shop: '/pro/index.html' }
  : MODE === 'development'
    ? { driver: 'http://localhost:5174/', merchant: 'http://localhost:5175/', admin: 'http://localhost:5175/', shop: 'http://localhost:5175/' }
    : {
      driver: import.meta.env.VITE_DRIVER_URL || 'https://driver.wayibenin.com/',
      merchant: import.meta.env.VITE_PRO_URL || 'https://admin.wayibenin.com/',
      admin: import.meta.env.VITE_PRO_URL || 'https://admin.wayibenin.com/',
      shop: import.meta.env.VITE_PRO_URL || 'https://admin.wayibenin.com/',
    };

export const ROLE_LABEL = { client: 'Client', merchant: 'Restaurant', driver: 'Livreur', admin: 'Administration', shop: 'Boutique Mode' };

const TOKEN_KEY = { driver: 'wayi_driver_token', merchant: 'wayi_merchant_token', admin: 'wayi_admin_token', shop: 'wayi_shop_token' };

// Ouvre l'espace livreur / restaurant / admin avec son jeton
export function openSpace(role, token) {
  try { localStorage.setItem('wayi_last_role', role); } catch { /* ignore */ }
  const payload = btoa(JSON.stringify({ role, token }));
  window.location.href = `${BASES[role]}#auth=${encodeURIComponent(payload)}`;
}

// Au lancement de l'appli mobile : si la derniere session etait livreur ou restaurant,
// on y retourne directement au lieu d'afficher l'espace client.
export function resumeLastSpace() {
  if (MODE !== 'mobile') return false;
  try {
    const role = localStorage.getItem('wayi_last_role');
    if (!role || !TOKEN_KEY[role]) return false;
    if (!localStorage.getItem(TOKEN_KEY[role])) { localStorage.removeItem('wayi_last_role'); return false; }
    window.location.replace(BASES[role]);
    return true;
  } catch { return false; }
}

export function rememberClient() {
  try { localStorage.setItem('wayi_last_role', 'client'); } catch { /* ignore */ }
}
