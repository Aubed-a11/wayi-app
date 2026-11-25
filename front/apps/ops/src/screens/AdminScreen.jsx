import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { DynamicIcon, TASTE_META } from '../components/DynamicIcon';
import { adminAPI } from '../api';
import TelemarketingPanel from './TelemarketingPanel';

const PERIODS = [
  { id: 'petit_dejeuner', label: 'Petit-déjeuner', icon: 'sunrise' },
  { id: 'dejeuner',       label: 'Déjeuner',        icon: 'sun' },
  { id: 'gouter',         label: 'Goûter',          icon: 'cookie' },
  { id: 'diner',          label: 'Dîner',           icon: 'moon' },
];
const CATEGORIES = [
  { id: 'plats_locaux', label: 'Plats locaux', icon: 'soup' },
  { id: 'healthy',      label: 'Healthy',       icon: 'salad' },
  { id: 'burgers',      label: 'Fast-food',       icon: 'sandwich' },
  { id: 'grillades',    label: 'Grillades',     icon: 'flame' },
  { id: 'boissons',     label: 'Boissons',      icon: 'cup-soda' },
];

const TASTES = [
  { id: 'sale',  label: 'Salé' },
  { id: 'sucre', label: 'Sucré' },
  { id: 'epice', label: 'Épicé' },
  { id: 'umami', label: 'Umami' },
  { id: 'frais', label: 'Frais' },
  { id: 'doux',  label: 'Doux' },
];

const emptyRestaurant = { name: '', icon: 'utensils', logo: '', tagline: '', zone: '', lat: '6.3720', lng: '2.3820', prepTime: '20-30', momoMtn: '', momoMoov: '' };
const emptyDish = { restaurantId: '', period: 'dejeuner', category: 'plats_locaux', name: '', icon: 'utensils', image: '', taste: '', price: '', desc: '', characteristics: '', advantages: '', benefits: '' };

const STATUS_FR = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', on_the_way: 'En route', delivered: 'Livrée', cancelled: 'Annulée' };

export default function AdminScreen() {
  const { state, dispatch, navigate } = useApp();
  const admin = state.admin;

  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
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
  const [driverCreateNotice, setDriverCreateNotice] = useState(null); // { emailSimulated, devPassword, email }

  const [restaurantForm, setRestaurantForm] = useState(emptyRestaurant);
  const [editingRestaurantId, setEditingRestaurantId] = useState(null);
  const [dishForm, setDishForm] = useState(emptyDish);
  const [editingDishId, setEditingDishId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuFilter, setMenuFilter] = useState({ period: '', category: '' });

  useEffect(() => {
    if (!state.adminToken) navigate('admin_login');
  }, [state.adminToken]);

  const loadAll = useCallback(async () => {
    try {
      const [d, r, ds, o, ai, drv, perf] = await Promise.all([
        adminAPI.dashboard(), adminAPI.restaurants.list(), adminAPI.dishes.list(), adminAPI.orders({}), adminAPI.aiStatus().catch(() => null), adminAPI.drivers().catch(() => null), adminAPI.driverPerformance().catch(() => null),
      ]);
      setDashboard(d.data);
      setRestaurants(r.data.restaurants);
      setDishes(ds.data.dishes);
      setOrders(o.data.orders);
      if (ai) setAiStatus(ai.data);
      if (drv) setAvailableDrivers(drv.data.drivers);
      if (perf) setDriverPerformance(perf.data);
    } catch {
      // token invalide → géré par l'intercepteur
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!state.adminToken) return;
    loadAll();
    const poll = setInterval(loadAll, 15000); // rafraîchit les commandes automatiquement
    return () => clearInterval(poll);
  }, [state.adminToken]);

  const reloadMenu = async (filters = menuFilter) => {
    const params = {};
    if (filters.period) params.period = filters.period;
    if (filters.category) params.category = filters.category;
    const { data } = await adminAPI.dishes.list(params);
    setDishes(data.dishes);
  };

  // ── Créer un compte restaurant (restaurant + connexion, en un seul geste) ──
  const emptyMerchantForm = { restaurantName: '', tagline: '', icon: 'utensils', zone: '', lat: '6.3720', lng: '2.3820', contactName: '', email: '', phone: '' };
  const [merchantForm, setMerchantForm] = useState(emptyMerchantForm);
  const [creatingMerchant, setCreatingMerchant] = useState(false);
  const [merchantFormError, setMerchantFormError] = useState('');
  const [merchantCreateNotice, setMerchantCreateNotice] = useState(null);

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
      const { data: rData } = await adminAPI.restaurants.list();
      setRestaurants(rData.restaurants);
    } catch (err) {
      setMerchantFormError(err.response?.data?.error || 'Impossible de créer ce compte restaurant.');
    } finally {
      setCreatingMerchant(false);
    }
  };

  // ── Restaurants ────────────────────────────────────────────
  const submitRestaurant = async () => {
    setError('');
    if (!restaurantForm.name || !restaurantForm.lat || !restaurantForm.lng) {
      setError('Nom, latitude et longitude requis'); return;
    }
    setSaving(true);
    try {
      const payload = { ...restaurantForm, lat: parseFloat(restaurantForm.lat), lng: parseFloat(restaurantForm.lng) };
      if (editingRestaurantId) {
        await adminAPI.restaurants.update(editingRestaurantId, payload);
      } else {
        await adminAPI.restaurants.create(payload);
      }
      setRestaurantForm(emptyRestaurant);
      setEditingRestaurantId(null);
      const { data } = await adminAPI.restaurants.list();
      setRestaurants(data.restaurants);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const editRestaurant = (r) => {
    setEditingRestaurantId(r.id);
    setRestaurantForm({ name: r.name, icon: r.icon, logo: r.logo || '', tagline: r.tagline, zone: r.zone, lat: String(r.lat), lng: String(r.lng), prepTime: r.prepTime, momoMtn: r.momoMtn || '', momoMoov: r.momoMoov || '' });
  };

  const removeRestaurant = async (id) => {
    if (!confirm('Retirer ce restaurant et tous ses plats du menu ?')) return;
    await adminAPI.restaurants.remove(id);
    const [r, ds] = await Promise.all([adminAPI.restaurants.list(), adminAPI.dishes.list()]);
    setRestaurants(r.data.restaurants);
    setDishes(ds.data.dishes);
  };

  // ── Menu du jour ───────────────────────────────────────────
  const submitDish = async () => {
    setError('');
    if (!dishForm.restaurantId || !dishForm.name || !dishForm.price) {
      setError('Restaurant, nom et prix requis'); return;
    }
    setSaving(true);
    try {
      const payload = { ...dishForm, price: parseInt(dishForm.price, 10) };
      if (editingDishId) {
        await adminAPI.dishes.update(editingDishId, payload);
      } else {
        await adminAPI.dishes.create(payload);
      }
      setDishForm(emptyDish);
      setEditingDishId(null);
      reloadMenu();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const editDish = (d) => {
    setEditingDishId(d.id);
    setDishForm({ restaurantId: d.restaurantId, period: d.period, category: d.category, name: d.name, icon: d.icon, image: d.image || '', taste: d.taste || '', price: String(d.price), desc: d.desc || '', characteristics: d.characteristics || '', advantages: d.advantages || '', benefits: d.benefits || '' });
  };

  const removeDish = async (id) => {
    if (!confirm('Retirer ce plat du menu du jour ?')) return;
    await adminAPI.dishes.remove(id);
    reloadMenu();
  };

  const suspendOrReactivate = async (driver) => {
    setSuspendingId(driver.id);
    try {
      if (driver.suspended) await adminAPI.reactivateDriver(driver.id);
      else await adminAPI.suspendDriver(driver.id);
      const { data } = await adminAPI.driverPerformance();
      setDriverPerformance(data);
    } catch (err) {
      setAssignError(err.response?.data?.error || 'Action impossible pour ce livreur.');
    } finally {
      setSuspendingId(null);
    }
  };

  const submitDriver = async () => {
    setDriverFormError('');
    if (!driverForm.name || !driverForm.email) { setDriverFormError('Nom et e-mail requis'); return; }
    setCreatingDriver(true);
    try {
      const { data } = await adminAPI.createDriver(driverForm);
      setDriverCreateNotice({
        email: driverForm.email,
        emailSimulated: !!data.emailSimulated,
        devPassword: data.devPassword,
      });
      setDriverForm({ name: '', email: '', phone: '', vehicleType: 'moto', vehiclePlate: '' });
      const { data: perf } = await adminAPI.driverPerformance();
      setDriverPerformance(perf);
    } catch (err) {
      setDriverFormError(err.response?.data?.error || 'Impossible de créer ce livreur.');
    } finally {
      setCreatingDriver(false);
    }
  };

  const assignDriver = async (orderId, driverId) => {
    if (!driverId) return;
    setAssigningOrderId(orderId);
    setAssignError('');
    try {
      await adminAPI.assignDriver(orderId, driverId);
      const { data } = await adminAPI.orders({});
      setOrders(data.orders);
    } catch (err) {
      setAssignError(err.response?.data?.error || "Impossible d'assigner ce livreur.");
    } finally {
      setAssigningOrderId(null);
    }
  };

  const [payBusyId, setPayBusyId] = useState(null);
  const decidePayment = async (orderId, action) => {
    setPayBusyId(orderId); setAssignError('');
    try {
      await adminAPI.confirmPayment(orderId, action);
      const { data } = await adminAPI.orders({});
      setOrders(data.orders);
    } catch (err) {
      setAssignError(err.response?.data?.error || 'Action impossible.');
    } finally { setPayBusyId(null); }
  };

  const logout = () => { dispatch({ type: 'ADMIN_LOGOUT' }); navigate('admin_login'); };

  if (!admin || loading) {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><Spinner size={32} /></div>;
  }

  return (
    <div className="screen" style={{ flexDirection: 'column' }}>

      {/* Header */}
      <div className="header-em" style={{ flexShrink: 0, borderRadius: '0 0 28px 28px' }}>
        <StatusBar light />
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#fff' }}>Backoffice WAYI</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{admin.name}</div>
          </div>
          <button onClick={logout} title="Déconnexion" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>Quitter</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        <div style={{ display: 'flex', padding: '0 12px', minWidth: 580 }}>
          {[['dashboard', "Vue d'ensemble"], ['restaurants', 'Restaurants'], ['menu', 'Menu du jour'], ['orders', 'Commandes'], ['telemarketing', 'Telemarketing']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '13px 8px', border: 'none', background: 'none', whiteSpace: 'nowrap',
              borderBottom: tab === k ? '3px solid var(--emerald)' : '3px solid transparent',
              color: tab === k ? 'var(--emerald)' : 'var(--gray)',
              fontWeight: tab === k ? 800 : 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{label}</span></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingBottom: 30 }}>

        {/* ── DASHBOARD ─────────────────────────────────────── */}
        {tab === 'dashboard' && dashboard && (
          <>
            {aiStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 16,
                background: aiStatus.configured ? 'var(--emerald-light)' : '#fde8e6',
                border: `1px solid ${aiStatus.configured ? 'var(--emerald-mid)' : '#f5c0bb'}`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: aiStatus.configured ? 'var(--emerald)' : 'var(--danger)', flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: aiStatus.configured ? 'var(--emerald-dark)' : 'var(--danger)', fontWeight: 600 }}>
                  {aiStatus.configured
                    ? `Yivi active avec Claude (${aiStatus.model})`
                    : "Yivi tourne en mode simulation : ajoute ANTHROPIC_API_KEY dans backend/.env pour l'assistant Claude complet"}
                </div>
              </div>
            )}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { val: dashboard.stats.todayOrders, label: "Commandes aujourd'hui", color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: `${dashboard.stats.totalRevenue.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F`, label: 'CA total livré', color: '#F7ECE3', textColor: '#c45012' },
                { val: `${dashboard.stats.platformRevenue.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F`, label: 'Commission plateforme', color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: `${dashboard.stats.driversOnline}/${dashboard.stats.driversTotal}`, label: 'Livreurs en ligne', color: '#F7ECE3', textColor: '#c45012' },
                { val: dashboard.stats.avgDeliveryMinutes !== null ? `${dashboard.stats.avgDeliveryMinutes} min` : '-', label: 'Temps moyen de livraison', color: dashboard.stats.underperformingDrivers > 0 ? '#fde8e6' : 'var(--emerald-light)', textColor: dashboard.stats.underperformingDrivers > 0 ? 'var(--danger)' : 'var(--emerald-dark)' },
                { val: dashboard.stats.restaurantsCount, label: 'Restaurants partenaires', color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: dashboard.stats.dishesCount, label: 'Plats au menu', color: '#F7ECE3', textColor: '#c45012' },
                { val: dashboard.stats.pendingOrders, label: 'Commandes en cours', color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: dashboard.stats.unassignedOrders, label: 'Sans livreur assigné', color: dashboard.stats.unassignedOrders > 0 ? '#fde8e6' : '#F7ECE3', textColor: dashboard.stats.unassignedOrders > 0 ? 'var(--danger)' : '#c45012' },
              ].map(s => (
                <div key={s.label} style={{ background: s.color, borderRadius: 'var(--r-lg)', padding: '16px 14px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, color: s.textColor }}>{s.val}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Commandes récentes</div>
            {dashboard.recentOrders.map(o => (
              <div key={o.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <DynamicIcon name={o.restaurantIcon} size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{o.restaurantName}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>{o.id}</div>
                </div>
                <span className="badge badge-emerald" style={{ fontSize: 10 }}>{STATUS_FR[o.status] || o.status}</span>
              </div>
            ))}

            {/* Ajouter un livreur */}
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginTop: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                 Ajouter un livreur
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Nom complet" value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} />
                <input placeholder="E-mail" type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Téléphone (optionnel)" type="tel" value={driverForm.phone} onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))} style={{ flex: 1 }} />
                  <input placeholder="Immatriculation" value={driverForm.vehiclePlate} onChange={e => setDriverForm(f => ({ ...f, vehiclePlate: e.target.value }))} style={{ width: 140 }} />
                </div>

                {driverFormError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}> {driverFormError}</div>}

                {driverCreateNotice && (
                  <div style={{ background: driverCreateNotice.emailSimulated ? '#fff8e6' : 'var(--emerald-light)', border: `1px solid ${driverCreateNotice.emailSimulated ? '#f0d98c' : 'var(--emerald-mid)'}`, borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 12, color: driverCreateNotice.emailSimulated ? '#8a6d1a' : 'var(--emerald-dark)' }}>
                    {driverCreateNotice.emailSimulated ? (
                      <>L'e-mail n'a pas pu être envoyé à {driverCreateNotice.email}. Mot de passe temporaire à transmettre toi-même : <b>{driverCreateNotice.devPassword}</b></>
                    ) : (
                      <>Livreur créé - ses identifiants de connexion lui ont été envoyés par e-mail à {driverCreateNotice.email}.</>
                    )}
                  </div>
                )}

                <button onClick={submitDriver} disabled={creatingDriver} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
                  {creatingDriver ? <Spinner size={16} color="#fff" /> : 'Créer le compte livreur'}
                </button>
              </div>
            </div>

            {/* Performance & benchmark des livreurs */}
            {driverPerformance && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15 }}>Performance des livreurs</div>
                  {driverPerformance.globalAvgDeliveryMinutes !== null && (
                    <div style={{ fontSize: 11, color: 'var(--gray)' }}>Moyenne plateforme : {driverPerformance.globalAvgDeliveryMinutes} min</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 12 }}>
                  Benchmark : note &lt; {driverPerformance.benchmarks.minRating}, complétion &lt; {driverPerformance.benchmarks.minCompletionRate}%,
                  {' '}ou temps de livraison &gt; {Math.round((driverPerformance.benchmarks.maxAvgDeliveryTimeRatio - 1) * 100)}% au-dessus de la moyenne
                  {' '}(à partir de {driverPerformance.benchmarks.minDeliveriesForBenchmark} livraisons).
                </div>

                {driverPerformance.drivers.map(d => (
                  <div key={d.id} style={{
                    background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 12, marginBottom: 10,
                    border: `1.5px solid ${d.underperforming ? 'var(--danger)' : 'var(--border)'}`,
                    opacity: d.suspended ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--emerald-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--emerald-dark)', flexShrink: 0 }}>{d.avatar}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {d.name}
                          {d.suspended && <span className="badge" style={{ background: d.pendingApproval ? 'var(--emerald-light)' : 'var(--border)', color: d.pendingApproval ? 'var(--emerald-dark)' : 'var(--gray)', fontSize: 9 }}>{d.pendingApproval ? 'Nouveau, à valider' : 'Suspendu'}</span>}
                          {!d.suspended && d.underperforming && <span className="badge" style={{ background: '#fde8e6', color: 'var(--danger)', fontSize: 9 }}>Sous-performant</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{d.vehicle?.plate} - {d.deliveriesInPeriod} livraisons</div>
                      </div>
                      <button
                        onClick={() => suspendOrReactivate(d)}
                        disabled={suspendingId === d.id}
                        style={{
                          background: d.suspended ? 'var(--emerald-light)' : '#fde8e6',
                          color: d.suspended ? 'var(--emerald-dark)' : 'var(--danger)',
                          border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        }}
                      >
                        {suspendingId === d.id ? <Spinner size={12} /> : d.pendingApproval ? <> Valider</> : d.suspended ? <> Réactiver</> : <> Suspendre</>}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
                      <div>
                        <div style={{ color: 'var(--gray)' }}>Temps moyen</div>
                        <div style={{ fontWeight: 700, color: d.hasEnoughData && d.flags.includes('livraisons lentes') ? 'var(--danger)' : 'var(--ink)' }}>
                          {d.avgDeliveryMinutes !== null ? `${d.avgDeliveryMinutes} min` : 'Pas assez de données'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--gray)' }}>Note</div>
                        <div style={{ fontWeight: 700, color: d.flags.includes('note faible') ? 'var(--danger)' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 3 }}>
                           {d.rating}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--gray)' }}>Complétion</div>
                        <div style={{ fontWeight: 700, color: d.flags.includes('taux de complétion faible') ? 'var(--danger)' : 'var(--ink)' }}>{d.completionRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── RESTAURANTS ───────────────────────────────────── */}
        {tab === 'restaurants' && (
          <>
            <div style={{ background: 'var(--white)', border: '2px solid var(--emerald)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Créer un compte restaurant</div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 12 }}>Crée le restaurant ET son compte de connexion en une fois - il pourra ensuite ajouter son propre menu.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Nom du restaurant" value={merchantForm.restaurantName} onChange={e => setMerchantForm(f => ({ ...f, restaurantName: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Description courte" value={merchantForm.tagline} onChange={e => setMerchantForm(f => ({ ...f, tagline: e.target.value }))} style={{ flex: 1 }} />
                  <input placeholder="Zone (ex: Cité GBÉTO)" value={merchantForm.zone} onChange={e => setMerchantForm(f => ({ ...f, zone: e.target.value }))} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Latitude" type="number" step="0.0001" value={merchantForm.lat} onChange={e => setMerchantForm(f => ({ ...f, lat: e.target.value }))} />
                  <input placeholder="Longitude" type="number" step="0.0001" value={merchantForm.lng} onChange={e => setMerchantForm(f => ({ ...f, lng: e.target.value }))} />
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                <input placeholder="Nom du contact (gérant)" value={merchantForm.contactName} onChange={e => setMerchantForm(f => ({ ...f, contactName: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="E-mail de connexion" type="email" value={merchantForm.email} onChange={e => setMerchantForm(f => ({ ...f, email: e.target.value }))} style={{ flex: 1 }} />
                  <input placeholder="Téléphone (optionnel)" type="tel" value={merchantForm.phone} onChange={e => setMerchantForm(f => ({ ...f, phone: e.target.value }))} style={{ flex: 1 }} />
                </div>

                {merchantFormError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{merchantFormError}</div>}

                {merchantCreateNotice && (
                  <div style={{ background: merchantCreateNotice.emailSimulated ? '#fff8e6' : 'var(--emerald-light)', border: `1px solid ${merchantCreateNotice.emailSimulated ? '#f0d98c' : 'var(--emerald-mid)'}`, borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 12, color: merchantCreateNotice.emailSimulated ? '#8a6d1a' : 'var(--emerald-dark)' }}>
                    {merchantCreateNotice.emailSimulated ? (
                      <>L'e-mail n'a pas pu être envoyé à {merchantCreateNotice.email}. Mot de passe temporaire à transmettre toi-même : <b>{merchantCreateNotice.devPassword}</b></>
                    ) : (
                      <>Compte créé - les identifiants de connexion ont été envoyés par e-mail à {merchantCreateNotice.email}.</>
                    )}
                  </div>
                )}

                <button onClick={submitMerchant} disabled={creatingMerchant} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
                  {creatingMerchant ? <Spinner size={16} color="#fff" /> : 'Créer le restaurant et son compte'}
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{editingRestaurantId ? <> Modifier le restaurant</> : <> Ajouter un restaurant sans compte (avancé)</>}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Nom du restaurant" value={restaurantForm.name} onChange={e => setRestaurantForm(f => ({ ...f, name: e.target.value }))} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--r-md)', flexShrink: 0, border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    background: restaurantForm.logo ? '#fff' : 'var(--emerald-light)',
                  }}>
                    {restaurantForm.logo
                      ? <img src={restaurantForm.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                      : <DynamicIcon name={restaurantForm.icon} size={20} />}
                  </div>
                  <input placeholder="Logo du restaurant (URL image)" value={restaurantForm.logo} onChange={e => setRestaurantForm(f => ({ ...f, logo: e.target.value }))} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Icone de repli (soup, salad, flame...)" value={restaurantForm.icon} onChange={e => setRestaurantForm(f => ({ ...f, icon: e.target.value }))} style={{ width: 130 }} />
                  <input placeholder="Description courte" value={restaurantForm.tagline} onChange={e => setRestaurantForm(f => ({ ...f, tagline: e.target.value }))} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Zone (ex: Cité GBÉTO)" value={restaurantForm.zone} onChange={e => setRestaurantForm(f => ({ ...f, zone: e.target.value }))} style={{ flex: 1 }} />
                  <input placeholder="Temps de prépa" value={restaurantForm.prepTime} onChange={e => setRestaurantForm(f => ({ ...f, prepTime: e.target.value }))} style={{ width: 110 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Numéro MTN MoMo du restaurant" type="tel" value={restaurantForm.momoMtn} onChange={e => setRestaurantForm(f => ({ ...f, momoMtn: e.target.value }))} />
                  <input placeholder="Numéro Moov Money du restaurant" type="tel" value={restaurantForm.momoMoov} onChange={e => setRestaurantForm(f => ({ ...f, momoMoov: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Latitude" type="number" step="0.0001" value={restaurantForm.lat} onChange={e => setRestaurantForm(f => ({ ...f, lat: e.target.value }))} />
                  <input placeholder="Longitude" type="number" step="0.0001" value={restaurantForm.lng} onChange={e => setRestaurantForm(f => ({ ...f, lng: e.target.value }))} />
                </div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}> {error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={submitRestaurant} disabled={saving} className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 13 }}>
                    {saving ? <Spinner size={16} color="#fff" /> : (editingRestaurantId ? 'Enregistrer' : 'Ajouter le restaurant')}
                  </button>
                  {editingRestaurantId && (
                    <button onClick={() => { setEditingRestaurantId(null); setRestaurantForm(emptyRestaurant); }} style={{ background: 'var(--border)', border: 'none', borderRadius: 'var(--r-md)', padding: '0 16px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Annuler</button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Restaurants partenaires ({restaurants.length})</div>
            <div className="cards-grid" style={{ marginBottom: 10 }}>
            {restaurants.map(r => (
              <div key={r.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--r-md)', flexShrink: 0, border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  background: r.logo ? '#fff' : 'var(--emerald-light)',
                }}>
                  {r.logo
                    ? <img src={r.logo} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                    : <DynamicIcon name={r.icon} size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 5 }}>{r.name} {r.verified && <span style={{ fontSize: 10, color: 'var(--emerald)', fontWeight: 700 }}>(vérifié)</span>}{r.demo && <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 800, border: '1px dashed #CBD5E1', borderRadius: 999, padding: '1px 7px' }}>démo</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: 4 }}>{r.tagline} - {r.zone}{r.rating != null ? ` - ${r.rating}` : ''}</div>
                </div>
                <button onClick={() => editRestaurant(r)} style={{ background: 'var(--emerald-light)', color: 'var(--emerald-dark)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Modifier</button>
                <button onClick={() => removeRestaurant(r.id)} style={{ background: '#fde8e6', color: 'var(--danger)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center' }}>Supprimer</button>
              </div>
            ))}
            </div>
          </>
        )}

        {/* ── MENU DU JOUR ──────────────────────────────────── */}
        {tab === 'menu' && (
          <>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{editingDishId ? <> Modifier le plat</> : <> Ajouter un plat au menu du jour</>}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <select value={dishForm.restaurantId} onChange={e => setDishForm(f => ({ ...f, restaurantId: e.target.value }))}>
                  <option value="">Restaurant propriétaire du plat</option>
                  {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={dishForm.period} onChange={e => setDishForm(f => ({ ...f, period: e.target.value }))} style={{ flex: 1 }}>
                    {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <select value={dishForm.category} onChange={e => setDishForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Icone (soup, salad, flame...)" value={dishForm.icon} onChange={e => setDishForm(f => ({ ...f, icon: e.target.value }))} style={{ width: 70 }} />
                  <input placeholder="Nom du plat" value={dishForm.name} onChange={e => setDishForm(f => ({ ...f, name: e.target.value }))} style={{ flex: 1 }} />
                  <input placeholder="Prix FCFA" type="number" value={dishForm.price} onChange={e => setDishForm(f => ({ ...f, price: e.target.value }))} style={{ width: 100 }} />
                </div>
                <input placeholder="Image du plat (URL, optionnel)" value={dishForm.image} onChange={e => setDishForm(f => ({ ...f, image: e.target.value }))} />
                <select value={dishForm.taste} onChange={e => setDishForm(f => ({ ...f, taste: e.target.value }))}>
                  <option value="">Goût (étiquette affichée sur la photo)</option>
                  {TASTES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <textarea placeholder="Description" rows={2} value={dishForm.desc} onChange={e => setDishForm(f => ({ ...f, desc: e.target.value }))} style={{ resize: 'none' }} />
                <textarea placeholder="Caractéristiques : ce qu'est le plat (une ligne par élément)" rows={3} value={dishForm.characteristics} onChange={e => setDishForm(f => ({ ...f, characteristics: e.target.value }))} style={{ resize: 'none' }} />
                <textarea placeholder="Avantages : en quoi ce plat se distingue" rows={3} value={dishForm.advantages} onChange={e => setDishForm(f => ({ ...f, advantages: e.target.value }))} style={{ resize: 'none' }} />
                <textarea placeholder="Bénéfices : ce que le client en retire" rows={3} value={dishForm.benefits} onChange={e => setDishForm(f => ({ ...f, benefits: e.target.value }))} style={{ resize: 'none' }} />
                {error && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}> {error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={submitDish} disabled={saving} className="btn btn-primary" style={{ flex: 1, padding: 12, fontSize: 13 }}>
                    {saving ? <Spinner size={16} color="#fff" /> : (editingDishId ? 'Enregistrer' : 'Ajouter au menu')}
                  </button>
                  {editingDishId && (
                    <button onClick={() => { setEditingDishId(null); setDishForm(emptyDish); }} style={{ background: 'var(--border)', border: 'none', borderRadius: 'var(--r-md)', padding: '0 16px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Annuler</button>
                  )}
                </div>
              </div>
            </div>

            {/* Filtres */}
            <div className="hscroll" style={{ gap: 7, marginBottom: 14 }}>
              <button className={`pill${!menuFilter.period ? ' active' : ''}`} onClick={() => { const f = { ...menuFilter, period: '' }; setMenuFilter(f); reloadMenu(f); }}>Toutes périodes</button>
              {PERIODS.map(p => (
                <button key={p.id} className={`pill${menuFilter.period === p.id ? ' active' : ''}`} onClick={() => { const f = { ...menuFilter, period: p.id }; setMenuFilter(f); reloadMenu(f); }}><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><DynamicIcon name={p.icon} size={13} /> {p.label}</span></button>
              ))}
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Plats au menu ({dishes.length})</div>
            {dishes.map(d => (
              <div key={d.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--r-md)', flexShrink: 0, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: d.image ? undefined : 'var(--emerald-light)',
                  backgroundImage: d.image ? `url(${d.image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
                }}>
                  {!d.image && <DynamicIcon name={d.icon} size={20} />}
                  {d.taste && TASTE_META[d.taste] && (
                    <span style={{ position: 'absolute', bottom: -4, right: -4, background: TASTE_META[d.taste].color, width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--white)' }} title={TASTE_META[d.taste].label} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: 4 }}><DynamicIcon name={d.restaurant?.icon} size={12} /> {d.restaurant?.name} - {d.price?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F{d.taste && TASTE_META[d.taste] && ` - ${TASTE_META[d.taste].label}`}</div>
                </div>
                <button onClick={() => editDish(d)} style={{ background: 'var(--emerald-light)', color: 'var(--emerald-dark)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Modifier</button>
                <button onClick={() => removeDish(d.id)} style={{ background: '#fde8e6', color: 'var(--danger)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center' }}>Supprimer</button>
              </div>
            ))}
          </>
        )}

        {/* ── COMMANDES ─────────────────────────────────────── */}
        {tab === 'telemarketing' && <TelemarketingPanel />}

        {tab === 'orders' && (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Toutes les commandes ({orders.length})</div>
            {assignError && (
              <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                {assignError}
              </div>
            )}
            {orders.map(o => {
              const canAssign = !o.driver && !['delivered', 'cancelled'].includes(o.status);
              const busyDriverIds = orders.filter(x => x.driver && !['delivered', 'cancelled'].includes(x.status)).map(x => x.driver.id);
              const freeDrivers = availableDrivers.filter(d => !busyDriverIds.includes(d.id) && !d.suspended);
              return (
                <div key={o.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <DynamicIcon name={o.restaurantIcon} size={20} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{o.restaurantName}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray)' }}>{o.id}</div>
                    </div>
                    <span className="badge badge-emerald" style={{ fontSize: 10 }}>{STATUS_FR[o.status] || o.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', display: 'flex', justifyContent: 'space-between', marginBottom: canAssign ? 8 : 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{o.driver ? <> {o.driver.name}</> : <> Pas encore assigné</>}</span>
                    <span>{o.total?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
                  </div>
                  {o.paymentProvider === 'kkiapay' && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: o.paymentStatus === 'paid' ? 'var(--emerald-dark)' : '#8a5a00' }}>
                      Kkiapay : {o.paymentStatus === 'paid' ? `payée${o.paymentTransactionId ? ' (réf. ' + o.paymentTransactionId + ')' : ''}` : 'en attente du paiement'}
                    </div>
                  )}
                  {o.paymentProvider === 'manual' && ['awaiting_payment', 'claimed', 'rejected', 'paid'].includes(o.paymentStatus) && (
                    <div style={{ background: o.paymentStatus === 'paid' ? '#e8f6ee' : '#fff8e8', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 700 }}>
                        {o.paymentMethod === 'moov' ? 'Moov Money' : 'MTN MoMo'} {o.paymentPayee === 'restaurant' ? `(vers ${o.paymentPayeeName})` : '(vers WAYI)'} : {o.paymentStatus === 'paid' ? 'paiement confirmé' : o.paymentStatus === 'rejected' ? 'paiement rejeté' : o.paymentStatus === 'claimed' ? 'le client dit avoir payé' : 'en attente du paiement du client'}
                      </div>
                      <div style={{ color: 'var(--gray)', marginTop: 2 }}>
                        Montant attendu : {o.total?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA sur le {o.paymentTo}
                        {o.paymentFromPhone ? ` · envoyé depuis ${o.paymentFromPhone}` : ''}
                        {o.paymentClaim?.reference ? ` · réf. ${o.paymentClaim.reference}` : ''}
                      </div>
                      {['awaiting_payment', 'claimed'].includes(o.paymentStatus) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-primary" disabled={payBusyId === o.id} onClick={() => decidePayment(o.id, 'confirm')} style={{ flex: 1, padding: '8px 10px', fontSize: 12 }}>J'ai reçu l'argent</button>
                          <button className="btn" disabled={payBusyId === o.id} onClick={() => decidePayment(o.id, 'reject')} style={{ padding: '8px 10px', fontSize: 12 }}>Rejeter</button>
                        </div>
                      )}
                    </div>
                  )}
                  {canAssign && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        onChange={e => assignDriver(o.id, e.target.value)}
                        disabled={assigningOrderId === o.id}
                        defaultValue=""
                        style={{ flex: 1, fontSize: 12, padding: '8px 10px' }}
                      >
                        <option value="" disabled>Assigner un livreur...</option>
                        {freeDrivers.length === 0 && <option value="" disabled>Aucun livreur disponible</option>}
                        {freeDrivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name} {d.status === 'available' ? '(en ligne)' : '(hors ligne)'}</option>
                        ))}
                      </select>
                      {assigningOrderId === o.id && <Spinner size={16} />}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

      </div>
    </div>
  );
}
