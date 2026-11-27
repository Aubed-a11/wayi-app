import { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, ChevronDown, MessageCircle, Shirt, Ruler, Scissors, Footprints, ShoppingBag, Layers, User, Baby, Watch, Sparkles, SlidersHorizontal, Check, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar } from '../components/UI';
import { modeAPI } from '../api';
import { ListingCard, ModeNav, UniverseSwitch, Sheet, Empty, fcfa } from './shared';

const CAT_ICONS = { robes: Shirt, hauts: Shirt, pantalons: Ruler, jupes: Scissors, chaussures: Footprints, sacs: ShoppingBag, pagnes: Layers, homme: User, enfants: Baby, accessoires: Watch };
const CAT_TONES = ['#FFE7D3', '#E4EEFF', '#E6F4EC', '#FDE6EC', '#EEE8FF', '#FFF3CF'];
const PRICES = [
  { id: '', label: 'Tous les prix' },
  { id: '0-5000', label: 'Moins de 5 000 FCFA' },
  { id: '5000-10000', label: '5 000 à 10 000 FCFA' },
  { id: '10000-25000', label: '10 000 à 25 000 FCFA' },
  { id: '25000-', label: 'Plus de 25 000 FCFA' },
];

export default function ModeHomeScreen() {
  const { state, navigate, dispatch } = useApp();
  const [meta, setMeta] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ category: '', size: '', price: '', condition: '', city: localStorage.getItem('wayi_mode_city') || '' });
  const [sheet, setSheet] = useState(null);
  const [unread, setUnread] = useState(0);
  const firstName = state.user?.name?.split(' ')[0] || '';

  useEffect(() => { modeAPI.meta().then(({ data }) => setMeta(data)).catch(() => {}); }, []);
  useEffect(() => { modeAPI.conversations().then(({ data }) => setUnread(data.unread || 0)).catch(() => {}); }, []);

  const params = useMemo(() => {
    const [minPrice, maxPrice] = f.price ? f.price.split('-') : ['', ''];
    return { q: q || undefined, category: f.category || undefined, size: f.size || undefined, condition: f.condition || undefined, city: f.city || undefined, minPrice: minPrice || undefined, maxPrice: maxPrice || undefined };
  }, [q, f]);

  const load = () => {
    setLoading(true); setError(false);
    modeAPI.listings(params)
      .then(({ data }) => { setItems(data.listings || []); setTotal(data.total || 0); })
      .catch(() => { setItems([]); setError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [params]);

  const set = (k, v) => {
    setF(prev => ({ ...prev, [k]: prev[k] === v ? '' : v }));
    if (k === 'city') localStorage.setItem('wayi_mode_city', v === f.city ? '' : v);
    setSheet(null);
  };
  const open = (l) => { dispatch({ type: 'MODE_CTX', payload: { listingId: l.id } }); navigate('mode-item'); };
  const label = (list, id) => list?.find(x => x.id === id)?.label;
  const filtered = !!(q || f.category || f.size || f.price || f.condition || f.city);
  const chips = [
    { k: 'category', label: label(meta?.categories, f.category) || 'Catégorie' },
    { k: 'size', label: f.size ? `Taille ${f.size}` : 'Taille' },
    { k: 'price', label: f.price ? PRICES.find(p => p.id === f.price)?.label : 'Prix' },
    { k: 'condition', label: label(meta?.conditions, f.condition) || 'État' },
  ];

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-top">
            <img src="/icon-192.png" alt="" className="md-logo" />
            <div className="md-brand"><b>WAYI Bénin</b><span>Mode</span></div>
            <button className="md-city" onClick={() => setSheet('city')}>
              <MapPin size={15} aria-hidden="true" /> {f.city || 'Tout le Bénin'} <ChevronDown size={14} aria-hidden="true" />
            </button>
            <button className="w-icon-btn" onClick={() => navigate('mode-inbox')} aria-label={unread ? `${unread} message(s) non lu(s)` : 'Messages'}>
              <MessageCircle size={22} strokeWidth={1.9} aria-hidden="true" />
              {unread > 0 && <span className="w-dot">{unread}</span>}
            </button>
          </div>

          <UniverseSwitch />

          <h1 className="md-hello">{firstName ? `${firstName}, la` : 'La'} mode <span>à portée de main</span></h1>
          <p className="md-sub">Neuf, non porté et occasion, partout au Bénin.</p>

          <label className="w-search md-search">
            <Search size={20} aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un article..." aria-label="Rechercher un article" />
          </label>

          <div className="md-cats">
            {(meta?.categories || []).map((c, i) => {
              const Icon = CAT_ICONS[c.id] || Shirt;
              return (
                <button key={c.id} className={`md-cat${f.category === c.id ? ' on' : ''}`} onClick={() => set('category', c.id)}>
                  <span style={{ background: CAT_TONES[i % CAT_TONES.length] }}><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {meta?.launchOffer && (
            <div className="md-promo">
              <div>
                <b>Vends ce que tu ne portes plus</b>
                <p>0 frais sur tes {meta.launchOffer.sales} premières ventes, pour les {meta.launchOffer.sellers} premiers vendeurs.</p>
                <button onClick={() => navigate('mode-sell')}>Publier une annonce</button>
              </div>
              <span className="md-promo-ico"><Sparkles size={34} strokeWidth={1.6} aria-hidden="true" /></span>
            </div>
          )}

          <div className="md-filters">
            <SlidersHorizontal size={18} aria-hidden="true" className="md-filters-ico" />
            {chips.map(c => (
              <button key={c.k} className={`md-chip${f[c.k] ? ' on' : ''}`} onClick={() => setSheet(c.k)}>
                {c.label} <ChevronDown size={14} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="md-head">
            <h2>{filtered ? `${total} article${total > 1 ? 's' : ''}` : 'Annonces récentes'}</h2>
            {filtered && <button className="w-link" onClick={() => { setQ(''); setF({ category: '', size: '', price: '', condition: '', city: '' }); localStorage.removeItem('wayi_mode_city'); }}>Tout effacer</button>}
          </div>

          {loading ? (
            <div className="md-grid">{[0, 1, 2, 3].map(i => <div key={i} className="w-skel" style={{ height: 290, borderRadius: 20 }} />)}</div>
          ) : error ? (
            <Empty icon={RefreshCw} title="Connexion impossible" text="Vérifie ta connexion puis réessaie." action="Réessayer" onAction={load} />
          ) : items.length ? (
            <div className="md-grid">{items.map(l => <ListingCard key={l.id} listing={l} onOpen={open} />)}</div>
          ) : filtered ? (
            <Empty icon={Search} title="Aucun article trouvé" text="Essaie d'autres filtres ou une autre ville." />
          ) : (
            <Empty title="Les premières annonces arrivent" text="Sois parmi les premiers vendeurs de WAYI Mode : publier une annonce prend deux minutes." action="Publier une annonce" onAction={() => navigate('mode-sell')} />
          )}
        </div>
      </div>
      <ModeNav />

      {sheet && (
        <Sheet
          title={{ category: 'Catégorie', size: 'Taille', price: 'Prix', condition: 'État', city: 'Ville' }[sheet]}
          onClose={() => setSheet(null)}
        >
          <div className={sheet === 'size' ? 'md-opts grid' : 'md-opts'}>
            {(sheet === 'category' ? meta?.categories
              : sheet === 'condition' ? meta?.conditions
              : sheet === 'price' ? PRICES.slice(1)
              : sheet === 'city' ? (meta?.cities || []).map(c => ({ id: c, label: c }))
              : (meta?.sizes || []).map(s => ({ id: s, label: s }))
            )?.map(o => (
              <button key={o.id} className={`md-opt${f[sheet] === o.id ? ' on' : ''}`} onClick={() => set(sheet, o.id)}>
                {o.label}
                {f[sheet] === o.id && <Check size={16} strokeWidth={2.6} aria-hidden="true" />}
              </button>
            ))}
          </div>
          {f[sheet] && <button className="md-btn ghost wide" onClick={() => set(sheet, f[sheet])}>Retirer ce filtre</button>}
        </Sheet>
      )}
    </div>
  );
}


