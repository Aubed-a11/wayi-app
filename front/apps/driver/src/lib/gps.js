// ============================================================
// WAYI Livreur - suivi GPS
// Dans l'application mobile : le suivi continue meme ecran eteint ou appli
// en arriere-plan (notification permanente "WAYI Livreur en ligne"),
// sinon le client et le restaurant perdent le livreur sur la carte.
// Sur le web : suivi classique du navigateur (s'arrete en arriere-plan).
// ============================================================
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

const BackgroundGeolocation = isNative ? registerPlugin('BackgroundGeolocation') : null;

// onPosition({ latitude, longitude }), onError(message). Renvoie une fonction d'arret.
export function watchPosition(onPosition, onError) {
  if (BackgroundGeolocation) {
    let id = null; let stopped = false;
    BackgroundGeolocation.addWatcher({
      backgroundTitle: 'WAYI Livreur en ligne',
      backgroundMessage: 'Ta position est partagée avec le client et le restaurant pendant la livraison.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    }, (loc, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') {
          onError("WAYI n'a pas accès à ta position. Autorise la localisation « Toujours » dans les réglages.");
          if (window.confirm('Ouvrir les réglages pour autoriser la localisation ?')) BackgroundGeolocation.openSettings();
        } else onError("Impossible d'obtenir ta position GPS.");
        return;
      }
      if (loc) onPosition({ latitude: loc.latitude, longitude: loc.longitude });
    }).then((wid) => { id = wid; if (stopped) BackgroundGeolocation.removeWatcher({ id }); });
    return () => { stopped = true; if (id) BackgroundGeolocation.removeWatcher({ id }); };
  }

  if (!navigator.geolocation) { onError('Géolocalisation non supportée par ce navigateur'); return () => {}; }
  const wid = navigator.geolocation.watchPosition(
    (pos) => onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    () => onError("Impossible d'accéder à ta position. Autorise la géolocalisation."),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
  );
  return () => navigator.geolocation.clearWatch(wid);
}
