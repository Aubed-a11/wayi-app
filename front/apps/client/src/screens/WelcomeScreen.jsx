import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { menuAPI } from '../api';

// Premier ecran (sans compte) : photos des plats en cascade, puis inscription ou connexion.
export default function WelcomeScreen() {
  const { navigate } = useApp();
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    menuAPI.get({})
      .then(r => setPhotos((r.data?.dishes || []).map(d => d.image).filter(Boolean)))
      .catch(() => setPhotos([]));
  }, []);

  // Trois colonnes, chacune avec ses photos repetees pour un defilement sans fin
  const columns = useMemo(() => {
    if (!photos.length) return [[], [], []];
    const cols = [[], [], []];
    photos.forEach((p, i) => cols[i % 3].push(p));
    return cols.map((c, i) => {
      const base = c.length ? c : photos;
      const rotated = [...base.slice(i), ...base.slice(0, i)];
      return [...rotated, ...rotated];
    });
  }, [photos]);

  const open = (mode) => {
    try { sessionStorage.setItem('wayi.authMode', mode); } catch (_) { /* navigation privee */ }
    navigate('login');
  };

  return (
    <div className="wl-screen">
      <div className="wl-wall" aria-hidden="true">
        {columns.map((col, i) => (
          <div key={i} className={`wl-col wl-col-${i}`}>
            <div className="wl-track">
              {col.map((src, j) => (
                <div key={j} className="wl-photo"><img src={src} alt="" loading="lazy" /></div>
              ))}
            </div>
          </div>
        ))}
        <div className="wl-fade" />
      </div>

      <header className="wl-top">
        <img src="/icon-192.png" alt="" />
        <span>WAYI</span>
      </header>

      <section className="wl-sheet">
        <h1>Les bons plats de Cotonou, livrés chez toi.</h1>
        <p>Un menu choisi chez des restaurants vérifiés, au bon moment de la journée. Client, restaurant ou livreur : un seul espace.</p>
        <button className="wl-btn" onClick={() => open('register')}>
          Créer un compte
        </button>
        <button className="wl-btn-ghost" onClick={() => open('login')}>J'ai déjà un compte</button>
      </section>
    </div>
  );
}
