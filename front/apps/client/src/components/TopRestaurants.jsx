import { useEffect, useRef, useState } from 'react';
import { Flame, Star, X } from 'lucide-react';
import { menuAPI } from '../api';
import { MenuCard } from './Wayi';
import { useApp } from '../context/AppContext';

// Initiales du restaurant (quand il n'a pas encore envoye son logo)
const COLORS = ['#F2690D', '#1E9E5A', '#2F7BE5', '#8B4FD8', '#D9467A', '#E59A00', '#0F8A8A'];
function Logo({ url, name, size = 44 }) {
  const words = String(name || '').split(/\s+/).filter(w => w.length > 2);
  const initials = (words.length ? words.slice(0, 2).map(w => w[0]) : [String(name || 'W')[0]]).join('').toUpperCase();
  const color = COLORS[[...String(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span className="tr-logo" style={{ width: size, height: size, background: url ? '#fff' : color, fontSize: size * 0.36 }}>
      {url ? <img src={url} alt="" /> : initials}
    </span>
  );
}

// Carrousel "Nos restaurants favoris de la semaine" : classement mis a jour chaque lundi
export default function TopRestaurants({ dishes = [], onOpenDish, onAdd }) {
  const [list, setList] = useState([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(null);
  const { dispatch, navigate } = useApp();
  const openResto = (r) => { dispatch({ type: 'SET_ACTIVE_RESTAURANT', payload: r }); navigate('restaurant'); };
  const track = useRef(null);

  useEffect(() => {
    menuAPI.topRestaurants(8).then(r => setList(r.data?.restaurants || [])).catch(() => setList([]));
  }, []);

  // Defilement automatique toutes les 4 secondes
  useEffect(() => {
    if (list.length < 2) return undefined;
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const next = (index + 1) % list.length;
      const card = el.children[next];
      if (card) el.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' });
    }, 4000);
    return () => clearInterval(t);
  }, [list.length, index]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.children.length) return;
    const w = el.children[0].offsetWidth + 12;
    setIndex(Math.max(0, Math.min(list.length - 1, Math.round(el.scrollLeft / w))));
  };

  if (!list.length) return null;
  const menuOf = (id) => dishes.filter(d => d.restaurantId === id);

  return (
    <>
      <div className="w-section-head" style={{ marginTop: 22 }}>
        <span className="w-section-title">Nos restaurants favoris de la semaine</span>
      </div>
      <div className="tr-track" ref={track} onScroll={onScroll}>
        {list.map((item, i) => {
          const r = item.restaurant || {};
          const sold = item.dishesSold || 0;
          const badge = sold > 0 ? `${sold} plat${sold > 1 ? 's' : ''} vendu${sold > 1 ? 's' : ''}` : (i < 3 ? 'Coup de cœur' : 'À découvrir');
          return (
            <button key={r.id} className="tr-card" onClick={() => openResto(r)}>
              {item.topDish?.image && <img className="tr-cover" src={item.topDish.image} alt="" loading="lazy" />}
              <span className="tr-shade" />
              <span className="tr-badge"><Flame size={13} strokeWidth={2.4} aria-hidden="true" /> #{i + 1} · {badge}</span>
              {r.rating ? <span className="tr-rating"><Star size={12} strokeWidth={2.4} aria-hidden="true" /> {Number(r.rating).toFixed(1)}</span> : null}
              <span className="tr-info">
                <Logo url={r.logo} name={r.name} size={46} />
                <span className="tr-text">
                  <strong>{r.name}</strong>
                  <small>{item.topDish?.name ? `${sold > 0 ? 'Le plus commandé' : 'Spécialité'} : ${item.topDish.name}` : r.tagline}</small>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="tr-dots" aria-hidden="true">
        {list.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}
      </div>

      {open && (
        <div className="tr-sheet-bg" onClick={() => setOpen(null)}>
          <div className="tr-sheet" onClick={e => e.stopPropagation()}>
            <div className="tr-sheet-head">
              <Logo url={open.logo} name={open.name} size={54} />
              <div><strong>{open.name}</strong>{open.tagline && <small>{open.tagline}</small>}</div>
              <button className="tr-close" onClick={() => setOpen(null)} aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="w-grid">
              {menuOf(open.id).map(d => <MenuCard key={d.id} dish={d} onOpen={(x) => { setOpen(null); onOpenDish(x); }} onAdd={onAdd} />)}
            </div>
            {!menuOf(open.id).length && <p className="tr-empty">Pas de plat disponible pour le moment.</p>}
          </div>
        </div>
      )}
    </>
  );
}
