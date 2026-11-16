// ============================================================
// WAYI - Comportement dans l'application mobile (Android / iOS)
// Sur le web, rien de tout cela ne s'active.
// - bouton Retour d'Android : revient a l'ecran precedent, sinon met l'appli en arriere-plan
// - liens externes (Google Maps, WhatsApp...) : ouverts dans l'appli du telephone
// - ecran de lancement : masque des que l'interface est prete
// ============================================================
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

let backHandler = null;
// L'ecran courant peut fournir sa propre action de retour ; renvoie true si elle a ete geree
export function setBackHandler(fn) { backHandler = fn; }

export async function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native', `native-${platform}`);

  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);

  App.addListener('backButton', () => {
    // Une fenetre ouverte (feuille d'adresse, menu...) peut intercepter le retour
    const ev = new Event('wayi:back', { cancelable: true });
    window.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
    if (backHandler && backHandler()) return;
    App.minimizeApp();
  });

  // Liens vers l'exterieur : on quitte la WebView pour l'appli concernee (Maps, WhatsApp, navigateur)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return; // tel:, mailto:, sms: sont deja geres par le systeme
    try { if (new URL(href).host === window.location.host) return; } catch { return; }
    e.preventDefault();
    window.location.href = href;
  }, true);

  setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
}

// Notification du telephone quand l'appli n'est pas a l'ecran (nouvelle course, nouvelle commande)
let notifId = 1;
let notifReady = null;
export async function notifyPhone(title, body) {
  if (!isNative || !document.hidden) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if (!notifReady) notifReady = LocalNotifications.requestPermissions();
    const perm = await notifReady;
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{ id: notifId++, title, body }] });
  } catch { /* notification facultative */ }
}

// Demande l'autorisation des notifications au lancement (Android 13+)
export async function askNotificationPermission() {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    notifReady = LocalNotifications.requestPermissions();
    await notifReady;
  } catch { /* ignore */ }
}
