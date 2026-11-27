// Univers Mode de WAYI Bénin : éléments communs aux écrans
import './mode.css';
import { useEffect, useState } from 'react';
import { Home, PlusSquare, MessageCircle, User, Heart, Shirt, UtensilsCrossed, Star, X, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { modeAPI } from '../api';

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA`;

export function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

export function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Hier';
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export const errMsg = (e, fallback = 'Une erreur est survenue. Réessaie.') => e?.response?.data?.error || fallback;

// Photo réduite dans le navigateur avant l'envoi (connexions lentes) : 1280 px, JPEG
export function compressImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

export function Photo({ src, className = '', children, iconSize = 34 }) {
  return (
    <div className={`md-photo ${className}`} style={src ? { backgroundImage: `url("${src}")` } : undefined}>
      {!src && <Shirt size={iconSize} strokeWidth={1.5} className="md-photo-empty" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function Avatar({ name, initials, anonymous, size = 46 }) {
  return (
    <span className={`md-avatar${anonymous ? ' anon' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {anonymous ? <EyeOff size={size * 0.42} strokeWidth={1.9} /> : (initials || (name || '?').slice(0, 1).toUpperCase())}
    </span>
  );
}

export function Stars({ value = 0, size = 14 }) {
  return (
    <span className="md-stars" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} strokeWidth={1.8} aria-hidden="true" />
      ))}
    </span>
  );
}

export function useModeFavorite() {
  const [busy, setBusy] = useState(false);
  return async (listing, set) => {
    if (busy) return;
    setBusy(true);
    const next = !listing.favorite;
    set(next);
    try { next ? await modeAPI.addFavorite(listing.id) : await modeAPI.removeFavorite(listing.id); }
    catch { set(!next); }
    finally { setBusy(false); }
  };
}

export function ListingCard({ listing, onOpen }) {
  const [fav, setFav] = useState(!!listing.favorite);
  const toggle = useModeFavorite();
  return (
    <div className="md-card" onClick={() => onOpen(listing)}>
      <Photo src={listing.photo} className="md-card-photo">
        <span className="md-vis">{listing.anonymous ? 'Anonyme' : 'Public'}</span>
        {!listing.mine && (
          <button
            className={`md-heart${fav ? ' on' : ''}`}
            onClick={e => { e.stopPropagation(); toggle({ ...listing, favorite: fav }, setFav); }}
            aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Heart size={17} fill={fav ? 'currentColor' : 'none'} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        {listing.status === 'reserved' && <span className="md-ribbon">Réservé</span>}
        {listing.status === 'sold' && <span className="md-ribbon">Vendu</span>}
      </Photo>
      <div className="md-card-body">
        <b className="md-card-price">{fcfa(listing.price)}</b>
        <span className="md-card-title">{listing.title}, {listing.size}</span>
        <span className="md-card-cond">{listing.conditionLabel}</span>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon = Shirt, title, text, action, onAction }) {
  return (
    <div className="md-empty">
      <span className="md-empty-ico"><Icon size={30} strokeWidth={1.7} aria-hidden="true" /></span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action && <button className="md-btn" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="md-sheet-bg" onClick={onClose}>
      <div className="md-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="md-sheet-head">
          <b>{title}</b>
          <button className="md-sheet-x" onClick={onClose} aria-label="Fermer"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="md-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// Choix de l'univers : Restaurant ou Mode (visible seulement quand le back office l'autorise)
export function UniverseSwitch() {
  const { modeState, universe, dispatch, navigate } = useApp();
  if (modeState === 'hidden') return null;
  const pick = (u) => {
    if (u === 'mode' && modeState === 'soon') { navigate('mode-soon'); return; }
    if (u !== universe) dispatch({ type: 'SET_UNIVERSE', payload: u });
  };
  return (
    <div className="md-switch" role="tablist" aria-label="Univers WAYI Bénin">
      <button role="tab" aria-selected={universe === 'food'} className={universe === 'food' ? 'on' : ''} onClick={() => pick('food')}>
        <UtensilsCrossed size={17} aria-hidden="true" /> Restaurant
      </button>
      <button role="tab" aria-selected={universe === 'mode'} className={universe === 'mode' ? 'on' : ''} onClick={() => pick('mode')}>
        <Shirt size={17} aria-hidden="true" /> Mode
        {modeState === 'soon' && <small>Bientôt</small>}
      </button>
    </div>
  );
}

export function ModeNav() {
  const { state, navigate } = useApp();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => modeAPI.conversations().then(({ data }) => alive && setUnread(data.unread || 0)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const tabs = [
    { key: 'home', label: 'Accueil', Icon: Home },
    { key: 'mode-sell', label: 'Vendre', Icon: PlusSquare },
    { key: 'mode-inbox', label: 'Messages', Icon: MessageCircle, badge: unread },
    { key: 'mode-account', label: 'Compte', Icon: User },
  ];
  return (
    <nav className="bottom-nav md-nav">
      {tabs.map(({ key, label, Icon, badge }) => (
        <button key={key} className={`nav-item ${state.screen === key ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={state.screen === key ? 'page' : undefined}>
          <span className="nav-ico">
            <span style={{ display: 'flex' }}><Icon size={22} strokeWidth={1.9} aria-hidden="true" /></span>
            {badge > 0 && <span className="nav-badge">{badge > 9 ? '9+' : badge}</span>}
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
