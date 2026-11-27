import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Search, MapPin, ChevronDown, Bell, CalendarDays, Check, RefreshCw, UtensilsCrossed, ChefHat } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BottomNav } from '../components/UI';
import { PERIODS, WeekMenu, toCartItem, Empty } from '../components/Wayi';
import AddressSheet from '../components/AddressSheet';
import { UniverseSwitch } from '../mode/shared';
import { menuAPI, ordersAPI } from '../api';

function currentPeriodId() {
  const h = new Date().getHours();
  if (h < 11) return 'petit_dejeuner';
  if (h < 15) return 'dejeuner';
  if (h < 18) return 'gouter';
  return 'diner';
}

export default function HomeScreen() {
  const { state, navigate, dispatch } = useApp();
  const [period, setPeriod] = useState('all');
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeOrders, setActiveOrders] = useState([]);
  const [showAddress, setShowAddress] = useState(false);
  const gridRef = useRef(null);
  const firstName = state.user?.name?.split(' ')[0] || '';
  const addr = state.user?.addresses?.find(a => a.isDefault) || state.user?.addresses?.[0];
  const place = addr?.label || state.user?.city || 'Mon adresse';

  const loadMenu = () => {
    setLoading(true);
    setLoadError(false);
    menuAPI.get({})
      .then(r => setDishes(r.data?.dishes || []))
      .catch(() => { setDishes([]); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(loadMenu, []);

  // Cloche : commandes en cours (on y accede directement au suivi)
  useEffect(() => {
    if (!state.user) return;
    ordersAPI.list()
      .then(({ data }) => setActiveOrders((data?.orders || []).filter(o => !['delivered', 'cancelled'].includes(o.status))))
      .catch(() => setActiveOrders([]));
  }, [state.user]);

  const openDish = (dish) => { dispatch({ type: 'SET_ACTIVE_DISH', payload: dish }); navigate('dish'); };
  const addToCart = (dish) => {
    dispatch({ type: 'CART_ADD', payload: { item: toCartItem(dish) } });
    toast(`${dish.name} ajouté au panier`, { id: 'add-' + dish.id, duration: 1400, icon: <Check size={16} strokeWidth={3} /> });
  };
  const openTracking = () => {
    if (activeOrders.length) dispatch({ type: 'SET_ACTIVE_ORDERS', payload: activeOrders });
    navigate('track');
  };

  // "Tous" : les plats du creneau en cours d'abord
  const now = currentPeriodId();
  const shown = (period === 'all' ? [...dishes].sort((a, b) => (b.period === now) - (a.period === now)) : dishes.filter(d => d.period === period));
  const bannerImg = (dishes.find(d => d.period === now && d.image) || dishes.find(d => d.image))?.image;

  return (
    <div className="screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          {/* En-tete : logo, adresse, notifications */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
            <img src="/icon-192.png" alt="WAYI" style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0 }} />
            <button onClick={() => setShowAddress(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-light)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><MapPin size={16} aria-hidden="true" /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            <button className="w-icon-btn" style={{ marginLeft: 'auto' }} onClick={openTracking} aria-label={activeOrders.length ? `${activeOrders.length} commande(s) en cours` : 'Mes commandes'}>
              <Bell size={23} strokeWidth={1.9} aria-hidden="true" />
              {activeOrders.length > 0 && <span className="w-dot">{activeOrders.length}</span>}
            </button>
          </div>

          <UniverseSwitch />

          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '18px 0 2px' }}>Bonjour{firstName ? ` ${firstName}` : ''} !</h1>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
            Qu'est-ce qu'on te livre <span style={{ color: 'var(--brand)' }}>aujourd'hui</span> ?
          </p>

          <button className="w-search" onClick={() => navigate('explore')} style={{ width: '100%', border: 'none', marginTop: 16, cursor: 'text', fontFamily: 'var(--font-body)' }}>
            <Search size={20} aria-hidden="true" />
            <span style={{ color: '#A69C95', fontSize: 14 }}>Rechercher un plat...</span>
          </button>

          {/* Banniere menu du jour */}
          <div className="w-banner" style={{ marginTop: 18 }}>
            <div className="w-banner-txt">
              <span className="w-banner-tag"><CalendarDays size={14} aria-hidden="true" /> Menu du jour</span>
              <h3>Les menus du jour, préparés par nos restaurants partenaires</h3>
              <button className="w-banner-cta" onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                Voir les menus
              </button>
            </div>
            {bannerImg && <div className="w-banner-img" style={{ backgroundImage: `url("${bannerImg}")` }} />}
          </div>

          {/* Bandeau Yivi */}
          <button className="yv-banner" onClick={() => navigate('ai')}>
            <span className="yv-banner-txt">
              <b>Pas d'idée pour ce repas ?</b>
              <small>Dis à Yivi ce qui te fait envie, il te trouve le bon plat.</small>
              <span className="yv-banner-btn">Demander à Yivi</span>
            </span>
            <span className="yv-banner-ico"><ChefHat size={34} strokeWidth={1.9} aria-hidden="true" /></span>
          </button>

          {/* Restaurants favoris de la semaine */}

          {/* Creneaux */}
          <div className="w-periods" style={{ marginTop: 18 }}>
            {PERIODS.map(({ id, label, Icon }) => (
              <button key={id} className={`w-period${period === id ? ' on' : ''}`} onClick={() => setPeriod(id)}>
                <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {/* Menus du jour */}
          <div className="wm-head" ref={gridRef} style={{ scrollMarginTop: 12 }}>
            <div>
              <h2>La carte de la semaine</h2>
              <p>{dishes.length ? `${dishes.length} plats choisis par WAYI. ` : ''}Nouvelle carte chaque lundi.</p>
            </div>
            <button className="w-link" onClick={() => navigate('explore')}>Voir tout</button>
          </div>

          {loading ? (
            <div className="wm">
              <div className="w-skel" style={{ height: 300, borderRadius: 26 }} />
              <div className="wm-tiles">{[0, 1].map(i => <div key={i} className="w-skel" style={{ height: 210, borderRadius: 22 }} />)}</div>
            </div>
          ) : loadError ? (
            <Empty Icon={RefreshCw} title="Menu indisponible" text="Impossible de charger le menu. Vérifie ta connexion." action={loadMenu} actionLabel="Réessayer" />
          ) : shown.length === 0 ? (
            <Empty Icon={UtensilsCrossed} title="Rien pour ce créneau" text="Aucun plat n'est proposé pour ce moment de la journée." action={() => setPeriod('all')} actionLabel="Voir tous les plats" />
          ) : (
            <WeekMenu
              dishes={shown}
              onOpen={openDish}
              onAdd={addToCart}
              heroLabel={period === 'all' ? (shown[0]?.period === now ? 'Servi maintenant' : 'Le plat du moment') : (PERIODS.find(p => p.id === period)?.label || 'Le plat du moment')}
            />
          )}
        </div>
      </div>

      <AddressSheet open={showAddress} onClose={() => setShowAddress(false)} />
      <BottomNav />
    </div>
  );
}
