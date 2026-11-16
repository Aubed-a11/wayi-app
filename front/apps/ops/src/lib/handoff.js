// ============================================================
// WAYI - Arrivee depuis la connexion unique (appli WAYI ou site client)
// Doit etre importe EN PREMIER dans main.jsx : enregistre le jeton recu
// dans l'adresse (#auth=...) avant que l'appli ne lise la session.
// ============================================================
const KEYS = { driver: 'wayi_driver_token', merchant: 'wayi_merchant_token', admin: 'wayi_admin_token' };

// Dans l'appli mobile, la connexion et la deconnexion passent par l'ecran unique de WAYI
export const UNIFIED = import.meta.env.MODE === 'mobile';

try {
  const m = window.location.hash.match(/auth=([^&]+)/);
  if (m) {
    const { role, token } = JSON.parse(atob(decodeURIComponent(m[1])));
    if (KEYS[role] && token) {
      Object.values(KEYS).forEach(k => { if (k !== KEYS[role]) localStorage.removeItem(k); });
      localStorage.setItem(KEYS[role], token);
      localStorage.setItem('wayi_last_role', role);
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
} catch { /* adresse invalide : on ignore */ }

// Retour a l'ecran de connexion unique (appli mobile)
export function backToWelcome() {
  try { localStorage.removeItem('wayi_last_role'); } catch { /* ignore */ }
  window.location.replace('/');
}
