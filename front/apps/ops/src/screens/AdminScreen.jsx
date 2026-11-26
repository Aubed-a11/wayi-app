import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard, Store, UtensilsCrossed, Receipt, Bike, PhoneCall, LogOut, Plus, Pencil, Trash2,
  RefreshCw, Clock, TrendingUp, Wallet, ChefHat, MapPin, X, Search, Star, CircleAlert, Sparkles, Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Spinner } from '../components/UI';
import { DynamicIcon, TASTE_META } from '../components/DynamicIcon';
import { adminAPI } from '../api';
import TelemarketingPanel from './TelemarketingPanel';
import '../admin.css';

const PERIODS = [
  { id: 'petit_dejeuner', label: 'Petit-déjeuner', icon: 'sunrise' },
  { id: 'dejeuner', label: 'Déjeuner', icon: 'sun' },
  { id: 'gouter', label: 'Goûter', icon: 'cookie' },
  { id: 'diner', label: 'Dîner', icon: 'moon' },
];
const CATEGORIES = [
  { id: 'plats_locaux', label: 'Plats locaux', icon: 'soup' },
  { id: 'healthy', label: 'Healthy', icon: 'salad' },
  { id: 'burgers', label: 'Fast-food', icon: 'sandwich' },
  { id: 'grillades', label: 'Grillades', icon: 'flame' },
  { id: 'boissons', label: 'Boissons', icon: 'cup-soda' },
];
const TASTES = [
  { id: 'sale', label: 'Salé' }, { id: 'sucre', label: 'Sucré' }, { id: 'epice', label: 'Épicé' },
  { id: 'umami', label: 'Umami' }, { id: 'frais', label: 'Frais' }, { id: 'doux', label: 'Doux' },
];
const PERIOD_LABEL = Object.fromEntries(PERIODS.map(p => [p.id, p.label]));
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

const emptyRestaurant = { name: '', icon: 'utensils', logo: '', tagline: '', zone: '', lat: '6.3720', lng: '2.3820', prepTime: '20-30', momoMtn: '', momoMoov: '' };
const emptyDish = { restaurantId: '', period: 'dejeuner', category: 'plats_locaux', name: '', icon: 'utensils', image: '', taste: '', price: '', desc: '', characteristics: '', advantages: '', benefits: '' };
const emptyMerchantForm = { restaurantName: '', tagline: '', icon: 'utensils', zone: '', lat: '6.3720', lng: '2.3820', contactName: '', email: '', phone: '' };

const STATUS = {
  pending: ['En attente', 'wait'], confirmed: ['Confirmée', 'info'], preparing: ['En préparation', 'info'],
  ready: ['Prête', 'info'], on_the_way: ['En route', 'go'], delivered: ['Livrée', 'ok'], cancelled: ['Annulée', 'ko'],
};
const NAV = [
  ['dashboard', "Vue d'ensemble", LayoutDashboard],
  ['restaurants', 'Restaurants', Store],
  ['menu', 'Plats', UtensilsCrossed],
  ['orders', 'Commandes', Receipt],
  ['drivers', 'Livreurs', Bike],
  ['telemarketing', 'Télémarketing', PhoneCall],
];
const TITLES = {
  dashboard: ["Vue d'ensemble", "L'activité de WAYI en un coup d'œil"],
  restaurants: ['Restaurants partenaires', 'Logos, cartes de la semaine, formules et comptes'],
  menu: ['Plats', 'Tous les plats des restaurants, avec leur photo'],
  orders: ['Commandes', 'Suivi, paiements et attribution des livreurs'],
  drivers: ['Livreurs', 'Comptes, disponibilité et performance'],
  telemarketing: ['Télémarketing', 'Relances et appels des partenaires'],
};

const money = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ /g, ' ')} F`;
const timeAgo = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function Logo({ src, name, icon, size = 44 }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || 'W').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="bo-logo" style={{ width: size, height: size }}>
      {src && !broken
        ? <img src={src} alt={name} onError={() => setBroken(true)} />
        : (icon && icon !== 'utensils' ? <DynamicIcon name={icon} size={size * 0.45} /> : <b style={{ fontSize: size * 0.36 }}>{initials}</b>)}
    </span>
  );
}

function Status({ s }) {
  const [label, tone] = STATUS[s] || [s, 'info'];
  return <span className={`bo-status ${tone}`}>{label}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="bo-modal" onClick={onClose}>
      <div className="bo-modal-card" onClick={e => e.stopPropagation()}>
        <div className="bo-modal-head">
          <h3>{title}</h3>
          <button className="bo-icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="bo-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Notice({ notice }) {
  if (!notice) return null;
  return (
    <div className={`bo-notice ${notice.emailSimulated ? 'warn' : 'ok'}`}>
      {notice.emailSimulated
        ? <>L'e-mail n'a pas pu être envoyé à {notice.email}. Mot de passe temporaire à transmettre : <b>{notice.devPassword}</b></>
        : <>Compte créé. Les identifiants ont été envoyés par e-mail à {notice.email}.</>}
    </div>
  );
}

export default function AdminScreen() {
  const { state, dispatch, navigate } = useApp();
  const admin = state.admin;

  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  const [assignError, setAssignError] = useState('');
  const [aiStatus, setAiStatus] = useState(null);
  const [driverPerformance, setDriverPerformance] = useState(null);
  const [suspendingId, setSuspendingId] = useState(null);
  const [driverForm, setDriverForm] = useState({ name: '', email: '', phone: '', vehicleType: 'moto', vehiclePlate: '' });
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [driverFormError, setDriverFormError] = useState('');
  const [driverCreateNotice, setDriverCreateNotice] = useState(null);

  const [restaurantForm, setRestaurantForm] = useState(emptyRestaurant);
  const [editingRestaurantId, setEditingRestaurantId] = useState(null);
  const [dishForm, setDishForm] = useState(emptyDish);
  const [editingDishId, setEditingDishId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuFilter, setMenuFilter] = useState({ period: '', restaurantId: '', q: '', week: false });
  const [orderFilter, setOrderFilter] = useState('');
  const [modal, setModal] = useState(null); // 'merchant' | 'restaurant' | 'dish' | 'driver'

  const [merchantForm, setMerchantForm] = useState(emptyMerchantForm);
  const [creatingMerchant, setCreatingMerchant] = useState(false);
  const [merchantFormError, setMerchantFormError] = useState('');
  const [merchantCreateNotice, setMerchantCreateNotice] = useState(null);
  const [payBusyId, setPayBusyId] = useState(null);

  useEffect(() => { if (!state.adminToken) navigate('admin_login'); }, [state.adminToken]);

  const loadAll = useCallback(async () => {
    try {
      const [d, r, ds, o, ai, drv, perf] = await Promise.all([
        adminAPI.dashboard(), adminAPI.restaurants.list(), adminAPI.dishes.list(), adminAPI.orders({}),
        adminAPI.aiStatus().catch(() => null), adminAPI.drivers().catch(() => null), adminAPI.driverPerformance().catch(() => null),
      ]);
      setDashboard(d.data);
      setRestaurants(r.data.restaurants);
      setDishes(ds.data.dishes);
      setOrders(o.data.orders);
      if (ai) setAiStatus(ai.data);
      if (drv) setAvailableDrivers(drv.data.drivers);
      if (perf) setDriverPerformance(perf.data);
    } catch { /* token invalide : gere par l'intercepteur */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (!state.adminToken) return;
    loadAll();
    const poll = setInterval(loadAll, 15000);
    return () => clearInterval(poll);
  }, [state.adminToken]);

  const refresh = () => { setRefreshing(true); loadAll(); };
  const reloadRestaurants = async () => { const { data } = await adminAPI.restaurants.list(); setRestaurants(data.restaurants); };
  const reloadMenu = async () => { const { data } = await adminAPI.dishes.list(); setDishes(data.dishes); };
  const closeModal = () => { setModal(null); setError(''); setMerchantFormError(''); setDriverFormError(''); };

  // ── Compte restaurant ──
  const submitMerchant = async () => {
    setMerchantFormError('');
    if (!merchantForm.restaurantName || !merchantForm.contactName || !merchantForm.email || !merchantForm.lat || !merchantForm.lng) {
      setMerchantFormError('Nom du restaurant, contact, e-mail, latitude et longitude requis'); return;
    }
    setCreatingMerchant(true);
    try {
      const { data } = await adminAPI.createMerchant({ ...merchantForm, lat: parseFloat(merchantForm.lat), lng: parseFloat(merchantForm.lng) });
      setMerchantCreateNotice({ email: merchantForm.email, emailSimulated: !!data.emailSimulated, devPassword: data.devPassword });
      setMerchantForm(emptyMerchantForm);
      reloadRestaurants();
    } catch (err) {
      setMerchantFormError(err.response?.data?.error || 'Impossible de créer ce compte restaurant.');
    } finally { setCreatingMerchant(false); }
  };

  // ── Restaurants ──
  const submitRestaurant = async () => {
    setError('');
    if (!restaurantForm.name || !restaurantForm.lat || !restaurantForm.lng) { setError('Nom, latitude et longitude requis'); return; }
    setSaving(true);
    try {
      const payload = { ...restaurantForm, lat: parseFloat(restaurantForm.lat), lng: parseFloat(restaurantForm.lng) };
      if (editingRestaurantId) await adminAPI.restaurants.update(editingRestaurantId, payload);
      else await adminAPI.restaurants.create(payload);
      setRestaurantForm(emptyRestaurant); setEditingRestaurantId(null); closeModal();
      reloadRestaurants();
    } catch (err) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };
  const editRestaurant = (r) => {
    setEditingRestaurantId(r.id);
    setRestaurantForm({ name: r.name, icon: r.icon, logo: r.logo || '', tagline: r.tagline || '', zone: r.zone || '', lat: String(r.lat), lng: String(r.lng), prepTime: r.prepTime || '', momoMtn: r.momoMtn || '', momoMoov: r.momoMoov || '' });
    setModal('restaurant');
  };
  const removeRestaurant = async (id) => {
    if (!confirm('Retirer ce restaurant et tous ses plats ?')) return;
    await adminAPI.restaurants.remove(id);
    reloadRestaurants(); reloadMenu();
  };

  // ── Plats ──
  const submitDish = async () => {
    setError('');
    if (!dishForm.restaurantId || !dishForm.name || !dishForm.price) { setError('Restaurant, nom et prix requis'); return; }
    setSaving(true);
    try {
      const payload = { ...dishForm, price: parseInt(dishForm.price, 10) };
      if (editingDishId) await adminAPI.dishes.update(editingDishId, payload);
      else await adminAPI.dishes.create(payload);
      setDishForm(emptyDish); setEditingDishId(null); closeModal();
      reloadMenu(); reloadRestaurants();
    } catch (err) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };
  const editDish = (d) => {
    setEditingDishId(d.id);
    setDishForm({ restaurantId: d.restaurantId, period: d.period, category: d.category, name: d.name, icon: d.icon, image: d.image || '', taste: d.taste || '', price: String(d.price), desc: d.desc || '', characteristics: d.characteristics || '', advantages: d.advantages || '', benefits: d.benefits || '' });
    setModal('dish');
  };
  const removeDish = async (id) => {
    if (!confirm('Retirer ce plat ?')) return;
    await adminAPI.dishes.remove(id);
    reloadMenu(); reloadRestaurants();
  };

  // ── Livreurs ──
  const suspendOrReactivate = async (driver) => {
    setSuspendingId(driver.id);
    try {
      if (driver.suspended) await adminAPI.reactivateDriver(driver.id);
      else await adminAPI.suspendDriver(driver.id);
      const { data } = await adminAPI.driverPerformance();
      setDriverPerformance(data);
    } catch (err) { setAssignError(err.response?.data?.error || 'Action impossible pour ce livreur.'); }
    finally { setSuspendingId(null); }
  };
  const submitDriver = async () => {
    setDriverFormError('');
    if (!driverForm.name || !driverForm.email) { setDriverFormError('Nom et e-mail requis'); return; }
    setCreatingDriver(true);
    try {
      const { data } = await adminAPI.createDriver(driverForm);
      setDriverCreateNotice({ email: driverForm.email, emailSimulated: !!data.emailSimulated, devPassword: data.devPassword });
      setDriverForm({ name: '', email: '', phone: '', vehicleType: 'moto', vehiclePlate: '' });
      const { data: perf } = await adminAPI.driverPerformance();
      setDriverPerformance(perf);
    } catch (err) { setDriverFormError(err.response?.data?.error || 'Impossible de créer ce livreur.'); }
    finally { setCreatingDriver(false); }
  };

  // ── Commandes ──
  const assignDriver = async (orderId, driverId) => {
    if (!driverId) return;
    setAssigningOrderId(orderId); setAssignError('');
    try {
      await adminAPI.assignDriver(orderId, driverId);
      const { data } = await adminAPI.orders({});
      setOrders(data.orders);
    } catch (err) { setAssignError(err.response?.data?.error || "Impossible d'assigner ce livreur."); }
    finally { setAssigningOrderId(null); }
  };
  const decidePayment = async (orderId, action) => {
    setPayBusyId(orderId); setAssignError('');
    try {
      await adminAPI.confirmPayment(orderId, action);
      const { data } = await adminAPI.orders({});
      setOrders(data.orders);
    } catch (err) { setAssignError(err.response?.data?.error || 'Action impossible.'); }
    finally { setPayBusyId(null); }
  };

  const logout = () => { dispatch({ type: 'ADMIN_LOGOUT' }); navigate('admin_login'); };

  const restoById = useMemo(() => Object.fromEntries(restaurants.map(r => [r.id, r])), [restaurants]);
  const shownDishes = useMemo(() => dishes.filter(d =>
    (!menuFilter.period || d.period === menuFilter.period) &&
    (!menuFilter.restaurantId || d.restaurantId === menuFilter.restaurantId) &&
    (!menuFilter.week || d.onlineThisWeek) &&
    (!menuFilter.q || d.name.toLowerCase().includes(menuFilter.q.toLowerCase()))
  ), [dishes, menuFilter]);
  const shownOrders = useMemo(() => {
    if (!orderFilter) return orders;
    if (orderFilter === 'active') return orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    return orders.filter(o => o.status === orderFilter);
  }, [orders, orderFilter]);
  const unassigned = orders.filter(o => !o.driver && !['delivered', 'cancelled', 'pending'].includes(o.status)).length;

  if (!admin || loading) {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><Spinner size={32} /></div>;
  }

  const st = dashboard?.stats || {};
  const [title, subtitle] = TITLES[tab];
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="screen bo">
      {/* ── Barre laterale (ordinateur) ── */}
      <aside className="bo-side">
        <div className="bo-brand">
          <img src="/logo.png" alt="WAYI" />
          <div><b>WAYI</b><small>Back office</small></div>
        </div>
        <nav>
          {NAV.map(([k, label, Icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icon size={18} strokeWidth={2} /> <span>{label}</span>
              {k === 'orders' && unassigned > 0 && <em>{unassigned}</em>}
            </button>
          ))}
        </nav>
        <div className="bo-side-foot">
          <div className="bo-me">
            <span className="bo-me-av">{(admin.name || 'A').charAt(0)}</span>
            <div><b>{admin.name}</b><small>{admin.email}</small></div>
          </div>
          <button className="bo-logout" onClick={logout}><LogOut size={16} /> Déconnexion</button>
        </div>
      </aside>

      <div className="bo-main">
        {/* ── En-tete ── */}
        <header className="bo-top">
          <div className="bo-top-mobile">
            <img src="/logo.png" alt="WAYI" />
            <b>Back office WAYI</b>
            <button className="bo-icon-btn light" onClick={logout} aria-label="Déconnexion"><LogOut size={17} /></button>
          </div>
          <div className="bo-top-row">
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="bo-top-actions">
              <span className="bo-date">{today}</span>
              <button className="bo-btn ghost" onClick={refresh} disabled={refreshing}>
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Actualiser
              </button>
            </div>
          </div>
          <div className="bo-mtabs">
            {NAV.map(([k, label, Icon]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>
            ))}
          </div>
        </header>

        <div className="bo-content">
          {/* ══════════ VUE D'ENSEMBLE ══════════ */}
          {tab === 'dashboard' && dashboard && (
            <>
              <div className="bo-kpis">
                {[
                  { icon: Receipt, val: st.todayOrders, label: "Commandes aujourd'hui", tone: 'orange' },
                  { icon: TrendingUp, val: money(st.totalRevenue), label: "Chiffre d'affaires livré", tone: 'dark' },
                  { icon: Wallet, val: money(st.platformRevenue), label: 'Commission WAYI', tone: 'green' },
                  { icon: Bike, val: `${st.driversOnline}/${st.driversTotal}`, label: 'Livreurs en ligne', tone: 'blue' },
                  { icon: Store, val: st.restaurantsCount, label: 'Restaurants partenaires', tone: 'orange' },
                  { icon: UtensilsCrossed, val: st.dishesCount, label: 'Plats enregistrés', tone: 'violet' },
                  { icon: Clock, val: st.avgDeliveryMinutes != null ? `${st.avgDeliveryMinutes} min` : '-', label: 'Temps moyen de livraison', tone: 'blue' },
                  { icon: CircleAlert, val: st.unassignedOrders, label: 'Sans livreur assigné', tone: st.unassignedOrders > 0 ? 'red' : 'green' },
                ].map(k => (
                  <div key={k.label} className="bo-kpi">
                    <span className={`bo-kpi-ico ${k.tone}`}><k.icon size={19} /></span>
                    <b>{k.val}</b>
                    <small>{k.label}</small>
                  </div>
                ))}
              </div>

              {aiStatus && (
                <div className={`bo-ai ${aiStatus.configured ? 'ok' : 'off'}`}>
                  <span className="bo-ai-ico"><ChefHat size={20} /></span>
                  <div>
                    <b>Yivi, l'assistante WAYI</b>
                    <small>{aiStatus.configured ? `Active avec Claude (${aiStatus.model})` : 'Mode simulation : clé ANTHROPIC_API_KEY absente du serveur'}</small>
                  </div>
                  <span className="bo-dot" />
                </div>
              )}

              <div className="bo-grid2">
                <section className="bo-card">
                  <div className="bo-card-head"><h2>Commandes récentes</h2><button className="bo-link" onClick={() => setTab('orders')}>Tout voir</button></div>
                  {dashboard.recentOrders.length === 0 && <p className="bo-empty">Aucune commande pour le moment.</p>}
                  {dashboard.recentOrders.slice(0, 6).map(o => (
                    <div key={o.id} className="bo-row">
                      <Logo src={o.restaurantLogo} name={o.restaurantName} icon={o.restaurantIcon} size={40} />
                      <div className="bo-row-main">
                        <b>{o.restaurantName}</b>
                        <small>{o.id} · {timeAgo(o.createdAt)}</small>
                      </div>
                      <div className="bo-row-end">
                        <b>{money(o.total)}</b>
                        <Status s={o.status} />
                      </div>
                    </div>
                  ))}
                </section>

                <section className="bo-card">
                  <div className="bo-card-head"><h2>À la carte cette semaine</h2><button className="bo-link" onClick={() => setTab('restaurants')}>Restaurants</button></div>
                  {restaurants.length === 0 && <p className="bo-empty">Aucun restaurant pour le moment.</p>}
                  {restaurants.map(r => (
                    <div key={r.id} className="bo-spot">
                      <div className="bo-spot-head">
                        <Logo src={r.logo} name={r.name} icon={r.icon} size={42} />
                        <div className="bo-row-main"><b>{r.name}</b><small>{r.onlineCount} plat{r.onlineCount > 1 ? 's' : ''} en ligne sur {r.dishesCount}{r.plan ? ` · formule ${r.plan.label}` : ''}</small></div>
                      </div>
                      <div className="bo-thumbs">
                        {(r.thisWeek || []).map(d => (
                          <div key={d.id} className="bo-thumb">
                            <span style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined} />
                            <small>{d.name}</small>
                            <b>{money(d.price)}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}

          {/* ══════════ RESTAURANTS ══════════ */}
          {tab === 'restaurants' && (
            <>
              <div className="bo-toolbar">
                <span className="bo-count">{restaurants.length} restaurant{restaurants.length > 1 ? 's' : ''}</span>
                <div className="bo-toolbar-actions">
                  <button className="bo-btn ghost" onClick={() => { setEditingRestaurantId(null); setRestaurantForm(emptyRestaurant); setModal('restaurant'); }}><Plus size={15} /> Restaurant sans compte</button>
                  <button className="bo-btn" onClick={() => { setMerchantCreateNotice(null); setModal('merchant'); }}><Plus size={15} /> Nouveau partenaire</button>
                </div>
              </div>
              <div className="bo-restos">
                {restaurants.map(r => (
                  <article key={r.id} className="bo-resto">
                    <div className="bo-resto-cover" style={r.cover ? { backgroundImage: `url("${r.cover}")` } : undefined}>
                      {r.plan && <span className="bo-plan">Formule {r.plan.label}</span>}
                    </div>
                    <div className="bo-resto-body">
                      <div className="bo-resto-logo"><Logo src={r.logo} name={r.name} icon={r.icon} size={68} /></div>
                      <h3>{r.name}</h3>
                      <p>{r.tagline}</p>
                      <div className="bo-chips">
                        {r.zone && <span><MapPin size={13} /> {r.zone}</span>}
                        <span><Clock size={13} /> {r.prepTime || '25-35'} min</span>
                        <span><UtensilsCrossed size={13} /> {r.dishesCount} plats</span>
                        {r.weeklyDishes ? <span className="hot"><Sparkles size={13} /> {r.weeklyDishes} par semaine</span> : null}
                        {r.rating != null && <span><Star size={13} /> {r.rating}</span>}
                      </div>
                      {r.thisWeek?.length > 0 && (
                        <>
                          <div className="bo-mini-title">En ligne cette semaine</div>
                          <div className="bo-thumbs small">
                            {r.thisWeek.slice(0, 4).map(d => (
                              <div key={d.id} className="bo-thumb">
                                <span style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined} />
                                <small>{d.name}</small>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="bo-resto-meta">
                        <span><Users size={13} /> {r.account ? r.account.email : 'Pas de compte restaurant'}</span>
                        <span><Receipt size={13} /> {r.ordersCount || 0} commande{(r.ordersCount || 0) > 1 ? 's' : ''}</span>
                      </div>
                      <div className="bo-actions">
                        <button className="bo-btn ghost" onClick={() => { setMenuFilter({ period: '', restaurantId: r.id, q: '', week: false }); setTab('menu'); }}><UtensilsCrossed size={14} /> Voir la carte</button>
                        <button className="bo-icon-btn" onClick={() => editRestaurant(r)} aria-label="Modifier"><Pencil size={16} /></button>
                        <button className="bo-icon-btn danger" onClick={() => removeRestaurant(r.id)} aria-label="Supprimer"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {/* ══════════ PLATS ══════════ */}
          {tab === 'menu' && (
            <>
              <div className="bo-toolbar">
                <div className="bo-search">
                  <Search size={16} />
                  <input placeholder="Rechercher un plat" value={menuFilter.q} onChange={e => setMenuFilter(f => ({ ...f, q: e.target.value }))} />
                </div>
                <select className="bo-select" value={menuFilter.restaurantId} onChange={e => setMenuFilter(f => ({ ...f, restaurantId: e.target.value }))}>
                  <option value="">Tous les restaurants</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="bo-btn" onClick={() => { setEditingDishId(null); setDishForm({ ...emptyDish, restaurantId: menuFilter.restaurantId || '' }); setModal('dish'); }}><Plus size={15} /> Ajouter un plat</button>
              </div>
              <div className="bo-pills">
                <button className={!menuFilter.period && !menuFilter.week ? 'on' : ''} onClick={() => setMenuFilter(f => ({ ...f, period: '', week: false }))}>Tous ({dishes.length})</button>
                <button className={menuFilter.week ? 'on' : ''} onClick={() => setMenuFilter(f => ({ ...f, week: !f.week }))}><Sparkles size={13} /> En ligne cette semaine</button>
                {PERIODS.map(p => (
                  <button key={p.id} className={menuFilter.period === p.id ? 'on' : ''} onClick={() => setMenuFilter(f => ({ ...f, period: f.period === p.id ? '' : p.id }))}>
                    <DynamicIcon name={p.icon} size={13} /> {p.label}
                  </button>
                ))}
              </div>
              {shownDishes.length === 0 && <p className="bo-empty">Aucun plat ne correspond.</p>}
              <div className="bo-dishes">
                {shownDishes.map(d => {
                  const r = restoById[d.restaurantId] || d.restaurant || {};
                  return (
                    <article key={d.id} className="bo-dish">
                      <div className="bo-dish-img" style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined}>
                        {!d.image && <DynamicIcon name={d.icon} size={30} />}
                        <span className={`bo-week ${d.onlineThisWeek ? 'on' : ''}`}>{d.onlineThisWeek ? 'En ligne cette semaine' : 'Hors carte cette semaine'}</span>
                      </div>
                      <div className="bo-dish-body">
                        <div className="bo-dish-resto"><Logo src={r.logo} name={r.name} icon={r.icon} size={22} /> <span>{r.name}</span></div>
                        <h3>{d.name}</h3>
                        <div className="bo-dish-tags">
                          <span>{PERIOD_LABEL[d.period] || d.period}</span>
                          <span>{CATEGORY_LABEL[d.category] || d.category}</span>
                          {d.taste && TASTE_META[d.taste] && <span>{TASTE_META[d.taste].label}</span>}
                        </div>
                        <div className="bo-dish-foot">
                          <b>{money(d.price)}</b>
                          <div>
                            <button className="bo-icon-btn" onClick={() => editDish(d)} aria-label="Modifier"><Pencil size={15} /></button>
                            <button className="bo-icon-btn danger" onClick={() => removeDish(d.id)} aria-label="Supprimer"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {/* ══════════ COMMANDES ══════════ */}
          {tab === 'orders' && (
            <>
              <div className="bo-pills">
                {[['', `Toutes (${orders.length})`], ['active', 'En cours'], ['pending', 'En attente'], ['preparing', 'En préparation'], ['on_the_way', 'En route'], ['delivered', 'Livrées'], ['cancelled', 'Annulées']].map(([k, l]) => (
                  <button key={k || 'all'} className={orderFilter === k ? 'on' : ''} onClick={() => setOrderFilter(k)}>{l}</button>
                ))}
              </div>
              {assignError && <div className="bo-notice ko">{assignError}</div>}
              {shownOrders.length === 0 && <p className="bo-empty">Aucune commande.</p>}
              <div className="bo-orders">
                {shownOrders.map(o => {
                  const canAssign = !o.driver && !['delivered', 'cancelled'].includes(o.status);
                  const busyDriverIds = orders.filter(x => x.driver && !['delivered', 'cancelled'].includes(x.status)).map(x => x.driver.id);
                  const freeDrivers = availableDrivers.filter(d => !busyDriverIds.includes(d.id) && !d.suspended);
                  return (
                    <article key={o.id} className="bo-order">
                      <div className="bo-order-head">
                        <Logo src={o.restaurantLogo} name={o.restaurantName} icon={o.restaurantIcon} size={44} />
                        <div className="bo-row-main">
                          <b>{o.restaurantName}</b>
                          <small>{o.id} · {timeAgo(o.createdAt)}</small>
                        </div>
                        <Status s={o.status} />
                      </div>
                      {o.items?.length > 0 && (
                        <div className="bo-order-items">
                          {o.items.map((it, i) => <span key={i}>{it.qty || 1} x {it.name}</span>)}
                        </div>
                      )}
                      <div className="bo-order-foot">
                        <span><Bike size={14} /> {o.driver ? o.driver.name : 'Pas encore de livreur'}</span>
                        <b>{money(o.total)}</b>
                      </div>
                      {o.paymentProvider === 'kkiapay' && (
                        <div className={`bo-pay ${o.paymentStatus === 'paid' ? 'ok' : 'wait'}`}>
                          Kkiapay : {o.paymentStatus === 'paid' ? `payée${o.paymentTransactionId ? ' (réf. ' + o.paymentTransactionId + ')' : ''}` : 'en attente du paiement'}
                        </div>
                      )}
                      {o.paymentProvider === 'manual' && ['awaiting_payment', 'claimed', 'rejected', 'paid'].includes(o.paymentStatus) && (
                        <div className={`bo-pay ${o.paymentStatus === 'paid' ? 'ok' : o.paymentStatus === 'rejected' ? 'ko' : 'wait'}`}>
                          <b>{o.paymentMethod === 'moov' ? 'Moov Money' : 'MTN MoMo'} {o.paymentPayee === 'restaurant' ? `(vers ${o.paymentPayeeName})` : '(vers WAYI)'} : {o.paymentStatus === 'paid' ? 'paiement confirmé' : o.paymentStatus === 'rejected' ? 'paiement rejeté' : o.paymentStatus === 'claimed' ? 'le client dit avoir payé' : 'en attente du paiement'}</b>
                          <small>Montant attendu : {money(o.total)} sur le {o.paymentTo}{o.paymentFromPhone ? ` · envoyé depuis ${o.paymentFromPhone}` : ''}{o.paymentClaim?.reference ? ` · réf. ${o.paymentClaim.reference}` : ''}</small>
                          {['awaiting_payment', 'claimed'].includes(o.paymentStatus) && (
                            <div className="bo-actions">
                              <button className="bo-btn" disabled={payBusyId === o.id} onClick={() => decidePayment(o.id, 'confirm')}>J'ai reçu l'argent</button>
                              <button className="bo-btn ghost" disabled={payBusyId === o.id} onClick={() => decidePayment(o.id, 'reject')}>Rejeter</button>
                            </div>
                          )}
                        </div>
                      )}
                      {canAssign && (
                        <div className="bo-assign">
                          <select onChange={e => assignDriver(o.id, e.target.value)} disabled={assigningOrderId === o.id} defaultValue="">
                            <option value="" disabled>Assigner un livreur...</option>
                            {freeDrivers.length === 0 && <option value="" disabled>Aucun livreur disponible</option>}
                            {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} {d.status === 'available' ? '(en ligne)' : '(hors ligne)'}</option>)}
                          </select>
                          {assigningOrderId === o.id && <Spinner size={16} />}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {/* ══════════ LIVREURS ══════════ */}
          {tab === 'drivers' && (
            <>
              <div className="bo-toolbar">
                <span className="bo-count">{driverPerformance?.drivers?.length || 0} livreur{(driverPerformance?.drivers?.length || 0) > 1 ? 's' : ''}{driverPerformance?.globalAvgDeliveryMinutes != null ? ` · moyenne ${driverPerformance.globalAvgDeliveryMinutes} min par livraison` : ''}</span>
                <button className="bo-btn" onClick={() => { setDriverCreateNotice(null); setModal('driver'); }}><Plus size={15} /> Nouveau livreur</button>
              </div>
              {assignError && <div className="bo-notice ko">{assignError}</div>}
              {driverPerformance && (
                <p className="bo-hint">
                  Un livreur est signalé si sa note passe sous {driverPerformance.benchmarks.minRating}, sa complétion sous {driverPerformance.benchmarks.minCompletionRate} %,
                  ou si ses livraisons prennent plus de {Math.round((driverPerformance.benchmarks.maxAvgDeliveryTimeRatio - 1) * 100)} % de plus que la moyenne
                  (à partir de {driverPerformance.benchmarks.minDeliveriesForBenchmark} livraisons).
                </p>
              )}
              <div className="bo-drivers">
                {(driverPerformance?.drivers || []).map(d => (
                  <article key={d.id} className={`bo-driver${d.underperforming ? ' warn' : ''}${d.suspended ? ' off' : ''}`}>
                    <div className="bo-order-head">
                      <span className="bo-me-av big">{d.avatar || (d.name || 'L').charAt(0)}</span>
                      <div className="bo-row-main">
                        <b>{d.name}</b>
                        <small>{d.vehicle?.plate || 'Moto'} · {d.deliveriesInPeriod} livraison{d.deliveriesInPeriod > 1 ? 's' : ''}</small>
                      </div>
                      {d.suspended
                        ? <span className={`bo-status ${d.pendingApproval ? 'info' : 'ko'}`}>{d.pendingApproval ? 'À valider' : 'Suspendu'}</span>
                        : d.underperforming ? <span className="bo-status ko">Sous-performant</span> : <span className="bo-status ok">Actif</span>}
                    </div>
                    <div className="bo-driver-stats">
                      <div><small>Temps moyen</small><b className={d.hasEnoughData && d.flags.includes('livraisons lentes') ? 'bad' : ''}>{d.avgDeliveryMinutes !== null ? `${d.avgDeliveryMinutes} min` : '-'}</b></div>
                      <div><small>Note</small><b className={d.flags.includes('note faible') ? 'bad' : ''}><Star size={13} /> {d.rating}</b></div>
                      <div><small>Complétion</small><b className={d.flags.includes('taux de complétion faible') ? 'bad' : ''}>{d.completionRate} %</b></div>
                    </div>
                    <button className={`bo-btn ${d.suspended ? '' : 'ghost'}`} onClick={() => suspendOrReactivate(d)} disabled={suspendingId === d.id}>
                      {suspendingId === d.id ? <Spinner size={14} /> : d.pendingApproval ? 'Valider ce livreur' : d.suspended ? 'Réactiver' : 'Suspendre'}
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}

          {tab === 'telemarketing' && <div className="bo-card"><TelemarketingPanel /></div>}
        </div>
      </div>

      {/* ══════════ FENETRES ══════════ */}
      {modal === 'merchant' && (
        <Modal title="Nouveau restaurant partenaire" onClose={closeModal}>
          <p className="bo-hint">Crée le restaurant et son compte de connexion en une fois. Il pourra ensuite gérer sa carte.</p>
          <div className="bo-form">
            <label>Nom du restaurant<input value={merchantForm.restaurantName} onChange={e => setMerchantForm(f => ({ ...f, restaurantName: e.target.value }))} /></label>
            <div className="two">
              <label>Description courte<input value={merchantForm.tagline} onChange={e => setMerchantForm(f => ({ ...f, tagline: e.target.value }))} /></label>
              <label>Quartier<input placeholder="Ex. Abomey-Calavi" value={merchantForm.zone} onChange={e => setMerchantForm(f => ({ ...f, zone: e.target.value }))} /></label>
            </div>
            <div className="two">
              <label>Latitude<input type="number" step="0.0001" value={merchantForm.lat} onChange={e => setMerchantForm(f => ({ ...f, lat: e.target.value }))} /></label>
              <label>Longitude<input type="number" step="0.0001" value={merchantForm.lng} onChange={e => setMerchantForm(f => ({ ...f, lng: e.target.value }))} /></label>
            </div>
            <label>Nom du gérant<input value={merchantForm.contactName} onChange={e => setMerchantForm(f => ({ ...f, contactName: e.target.value }))} /></label>
            <div className="two">
              <label>E-mail de connexion<input type="email" value={merchantForm.email} onChange={e => setMerchantForm(f => ({ ...f, email: e.target.value }))} /></label>
              <label>Téléphone<input type="tel" value={merchantForm.phone} onChange={e => setMerchantForm(f => ({ ...f, phone: e.target.value }))} /></label>
            </div>
            {merchantFormError && <div className="bo-notice ko">{merchantFormError}</div>}
            <Notice notice={merchantCreateNotice} />
            <button className="bo-btn full" onClick={submitMerchant} disabled={creatingMerchant}>{creatingMerchant ? <Spinner size={16} color="#fff" /> : 'Créer le restaurant et son compte'}</button>
          </div>
        </Modal>
      )}

      {modal === 'restaurant' && (
        <Modal title={editingRestaurantId ? 'Modifier le restaurant' : 'Restaurant sans compte'} onClose={closeModal}>
          <div className="bo-form">
            <div className="bo-logo-edit">
              <Logo src={restaurantForm.logo} name={restaurantForm.name} icon={restaurantForm.icon} size={64} />
              <label>Logo (adresse de l'image)<input value={restaurantForm.logo} onChange={e => setRestaurantForm(f => ({ ...f, logo: e.target.value }))} /></label>
            </div>
            <label>Nom du restaurant<input value={restaurantForm.name} onChange={e => setRestaurantForm(f => ({ ...f, name: e.target.value }))} /></label>
            <label>Description courte<input value={restaurantForm.tagline} onChange={e => setRestaurantForm(f => ({ ...f, tagline: e.target.value }))} /></label>
            <div className="two">
              <label>Quartier<input value={restaurantForm.zone} onChange={e => setRestaurantForm(f => ({ ...f, zone: e.target.value }))} /></label>
              <label>Temps de préparation<input placeholder="25-35" value={restaurantForm.prepTime} onChange={e => setRestaurantForm(f => ({ ...f, prepTime: e.target.value }))} /></label>
            </div>
            <div className="two">
              <label>Numéro MTN MoMo<input type="tel" value={restaurantForm.momoMtn} onChange={e => setRestaurantForm(f => ({ ...f, momoMtn: e.target.value }))} /></label>
              <label>Numéro Moov Money<input type="tel" value={restaurantForm.momoMoov} onChange={e => setRestaurantForm(f => ({ ...f, momoMoov: e.target.value }))} /></label>
            </div>
            <div className="two">
              <label>Latitude<input type="number" step="0.0001" value={restaurantForm.lat} onChange={e => setRestaurantForm(f => ({ ...f, lat: e.target.value }))} /></label>
              <label>Longitude<input type="number" step="0.0001" value={restaurantForm.lng} onChange={e => setRestaurantForm(f => ({ ...f, lng: e.target.value }))} /></label>
            </div>
            <label>Icône de repli (soup, salad, flame...)<input value={restaurantForm.icon} onChange={e => setRestaurantForm(f => ({ ...f, icon: e.target.value }))} /></label>
            {error && <div className="bo-notice ko">{error}</div>}
            <button className="bo-btn full" onClick={submitRestaurant} disabled={saving}>{saving ? <Spinner size={16} color="#fff" /> : editingRestaurantId ? 'Enregistrer' : 'Ajouter le restaurant'}</button>
          </div>
        </Modal>
      )}

      {modal === 'dish' && (
        <Modal title={editingDishId ? 'Modifier le plat' : 'Ajouter un plat'} onClose={closeModal}>
          <div className="bo-form">
            <div className="bo-dish-preview" style={dishForm.image ? { backgroundImage: `url("${dishForm.image}")` } : undefined}>
              {!dishForm.image && <span>Aperçu de la photo</span>}
            </div>
            <label>Photo du plat (adresse de l'image)<input value={dishForm.image} onChange={e => setDishForm(f => ({ ...f, image: e.target.value }))} /></label>
            <label>Restaurant
              <select value={dishForm.restaurantId} onChange={e => setDishForm(f => ({ ...f, restaurantId: e.target.value }))}>
                <option value="">Choisir le restaurant</option>
                {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <div className="two">
              <label>Nom du plat<input value={dishForm.name} onChange={e => setDishForm(f => ({ ...f, name: e.target.value }))} /></label>
              <label>Prix (FCFA)<input type="number" value={dishForm.price} onChange={e => setDishForm(f => ({ ...f, price: e.target.value }))} /></label>
            </div>
            <div className="two">
              <label>Moment<select value={dishForm.period} onChange={e => setDishForm(f => ({ ...f, period: e.target.value }))}>{PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
              <label>Catégorie<select value={dishForm.category} onChange={e => setDishForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            </div>
            <label>Goût<select value={dishForm.taste} onChange={e => setDishForm(f => ({ ...f, taste: e.target.value }))}><option value="">Aucun</option>{TASTES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label>Description<textarea rows={2} value={dishForm.desc} onChange={e => setDishForm(f => ({ ...f, desc: e.target.value }))} /></label>
            <label>Caractéristiques<textarea rows={2} placeholder="Une ligne par élément" value={dishForm.characteristics} onChange={e => setDishForm(f => ({ ...f, characteristics: e.target.value }))} /></label>
            <div className="two">
              <label>Avantages<textarea rows={2} value={dishForm.advantages} onChange={e => setDishForm(f => ({ ...f, advantages: e.target.value }))} /></label>
              <label>Bénéfices<textarea rows={2} value={dishForm.benefits} onChange={e => setDishForm(f => ({ ...f, benefits: e.target.value }))} /></label>
            </div>
            {error && <div className="bo-notice ko">{error}</div>}
            <button className="bo-btn full" onClick={submitDish} disabled={saving}>{saving ? <Spinner size={16} color="#fff" /> : editingDishId ? 'Enregistrer' : 'Ajouter le plat'}</button>
          </div>
        </Modal>
      )}

      {modal === 'driver' && (
        <Modal title="Nouveau livreur" onClose={closeModal}>
          <p className="bo-hint">Le livreur reçoit ses identifiants par e-mail.</p>
          <div className="bo-form">
            <label>Nom complet<input value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} /></label>
            <label>E-mail<input type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} /></label>
            <div className="two">
              <label>Téléphone<input type="tel" value={driverForm.phone} onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))} /></label>
              <label>Immatriculation<input value={driverForm.vehiclePlate} onChange={e => setDriverForm(f => ({ ...f, vehiclePlate: e.target.value }))} /></label>
            </div>
            {driverFormError && <div className="bo-notice ko">{driverFormError}</div>}
            <Notice notice={driverCreateNotice} />
            <button className="bo-btn full" onClick={submitDriver} disabled={creatingDriver}>{creatingDriver ? <Spinner size={16} color="#fff" /> : 'Créer le compte livreur'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
