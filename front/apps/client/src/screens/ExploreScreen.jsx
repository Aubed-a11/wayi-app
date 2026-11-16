import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Search, X, Check, SearchX, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BottomNav, BackBtn } from '../components/UI';
import { PERIODS, ExploreCard, toCartItem, Empty } from '../components/Wayi';
import { menuAPI } from '../api';

const norm = (t) => (t || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ExploreScreen() {
  const { navigate, dispatch } = useApp();
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const inputRef = useRef(null);

  const load = () => {
    setLoading(true); setLoadError(false);
    menuAPI.get({})
      .then(r => setDishes(r.data?.dishes || []))
      .catch(() => { setDishes([]); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 250); return () => clearTimeout(t); }, []);

  const q = norm(query.trim());
  const shown = dishes.filter(d =>
    (period === 'all' || d.period === period) &&
    (!q || norm(d.name).includes(q) || norm(d.restaurant?.name).includes(q) || norm(d.desc).includes(q))
  );

  const openDish = (dish) => { dispatch({ type: 'SET_ACTIVE_DISH', payload: dish }); navigate('dish'); };
  const addToCart = (dish) => {
    dispatch({ type: 'CART_ADD', payload: { item: toCartItem(dish) } });
    toast(`${dish.name} ajouté au panier`, { id: 'add-' + dish.id, duration: 1400, icon: <Check size={16} strokeWidth={3} /> });
  };

  return (
    <div className="screen">
      <StatusBar />
      <div className="w-topbar">
        <BackBtn />
        <div className="w-topbar-title">Explorer</div>
        <span style={{ width: 40 }} />
      </div>

      <div className="w-scroll">
        <div className="w-pad">
          <label className="w-search">
            <Search size={20} aria-hidden="true" />
            <input ref={inputRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un plat ou un restaurant..." aria-label="Rechercher" />
            {query && <button onClick={() => setQuery('')} className="w-icon-btn" style={{ width: 30, height: 30 }} aria-label="Effacer"><X size={16} aria-hidden="true" /></button>}
          </label>

          <div className="w-chips" style={{ marginTop: 16, marginBottom: 16 }}>
            {PERIODS.map(p => (
              <button key={p.id} className={`w-chip${period === p.id ? ' on' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>

          {loading ? (
            <div className="w-grid">{[0, 1, 2, 3].map(i => <div key={i} className="w-skel" style={{ height: 210, borderRadius: 18 }} />)}</div>
          ) : loadError ? (
            <Empty Icon={RefreshCw} title="Menu indisponible" text="Vérifie ta connexion et réessaie." action={load} actionLabel="Réessayer" />
          ) : shown.length === 0 ? (
            <Empty Icon={SearchX} title="Aucun résultat" text={q ? `Rien ne correspond à « ${query} ». Essaie un autre mot ou demande à Yivi.` : 'Aucun plat pour ce créneau.'}
              action={() => navigate('ai')} actionLabel="Demander à Yivi" />
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 10 }}>{shown.length} plat{shown.length > 1 ? 's' : ''}</div>
              <div className="w-grid">
                {shown.map(d => <ExploreCard key={d.id} dish={d} onOpen={openDish} onAdd={addToCart} />)}
              </div>
            </>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
