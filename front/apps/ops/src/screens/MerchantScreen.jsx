import { X } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { DynamicIcon } from '../components/DynamicIcon';
import { merchantAPI } from '../api';
import DriverTracking from '../components/DriverTracking';
import { notifyPhone, askNotificationPermission } from '../lib/native';

const PERIODS = [
  { id: 'petit_dejeuner', label: 'Petit-déjeuner' },
  { id: 'dejeuner',       label: 'Déjeuner' },
  { id: 'gouter',         label: 'Goûter' },
  { id: 'diner',          label: 'Dîner' },
];
const CATEGORIES = [
  { id: 'plats_locaux', label: 'Plats locaux' },
  { id: 'healthy',      label: 'Healthy' },
  { id: 'burgers',      label: 'Fast-food' },
  { id: 'grillades',    label: 'Grillades' },
  { id: 'boissons',     label: 'Boissons' },
];

export default function MerchantScreen() {
  const [trackingId, setTrackingId] = useState(null);
  const { state, dispatch, navigate } = useApp();
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [plans, setPlans] = useState({});
  const [myDishes, setMyDishes] = useState([]);
  const [maxDishes, setMaxDishes] = useState(null);
  const [weeklyDishes, setWeeklyDishes] = useState(null);

  useEffect(() => {
    if (!state.merchantToken) navigate('merchant_login');
  }, [state.merchantToken]);

  const seenOrdersRef = useRef(null);
  useEffect(() => { askNotificationPermission(); }, []);
  const loadAll = useCallback(async () => {
    try {
      const [d, o, a, p, dishRes] = await Promise.all([
        merchantAPI.dashboard(), merchantAPI.orders(), merchantAPI.analytics(), merchantAPI.plans(), merchantAPI.dishes(),
      ]);
      setDashboard(d.data);
      // Nouvelle commande pendant que l'appli est en arriere-plan : notification du telephone
      const pending = (o.data.orders || []).filter(x => x.status === 'pending').map(x => x.id);
      const fresh = seenOrdersRef.current ? pending.filter(id => !seenOrdersRef.current.has(id)) : [];
      seenOrdersRef.current = new Set([...(seenOrdersRef.current || []), ...pending]);
      if (fresh.length) notifyPhone(fresh.length > 1 ? `${fresh.length} nouvelles commandes WAYI` : 'Nouvelle commande WAYI', 'Ouvre WAYI Pro pour l\'accepter.');
      setOrders(o.data.orders);
      setAnalytics(a.data);
      setPlans(p.data.plans || {});
      setMyDishes(dishRes.data.dishes);
      setMaxDishes(dishRes.data.maxDishes);
      setWeeklyDishes(dishRes.data.weeklyDishes || null);
    } catch {
      // token invalide → intercepteur gère la déconnexion
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!state.merchantToken) return;
    loadAll();
    const poll = setInterval(loadAll, 15000); // rafraîchit les commandes automatiquement
    return () => clearInterval(poll);
  }, [state.merchantToken]);

  const [actionError, setActionError] = useState('');
  const [decidingId, setDecidingId] = useState(null); // commande en cours d'accept/reject
  const acceptOrder = async (id) => {
    setActionError('');
    setDecidingId(id);
    try {
      await merchantAPI.updateOrderStatus(id, 'preparing');
      const { data } = await merchantAPI.orders();
      setOrders(data.orders);
    } catch (err) {
      setActionError(err.response?.data?.error || "Impossible d'accepter cette commande pour le moment.");
    } finally {
      setDecidingId(null);
    }
  };

  const rejectOrder = async (id) => {
    setActionError('');
    setDecidingId(id);
    try {
      await merchantAPI.updateOrderStatus(id, 'cancelled');
      const { data } = await merchantAPI.orders();
      setOrders(data.orders);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Impossible de rejeter cette commande.');
    } finally {
      setDecidingId(null);
    }
  };

  const [payBusyId, setPayBusyId] = useState(null);
  const decidePayment = async (id, action) => {
    setActionError(''); setPayBusyId(id);
    try {
      await merchantAPI.decidePayment(id, action);
      const { data } = await merchantAPI.orders();
      setOrders(data.orders);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Action impossible pour le moment.');
    } finally { setPayBusyId(null); }
  };

  // Numéros Mobile Money sur lesquels ce restaurant encaisse
  const [payout, setPayout] = useState({ momoMtn: '', momoMoov: '' });
  const [payoutMode, setPayoutMode] = useState('');
  const [payoutMsg, setPayoutMsg] = useState({ type: '', text: '' });
  const [payoutSaving, setPayoutSaving] = useState(false);
  useEffect(() => {
    if (!state.merchantToken) return;
    merchantAPI.payout().then(({ data }) => { setPayout({ momoMtn: data.momoMtn || '', momoMoov: data.momoMoov || '' }); setPayoutMode(data.mode || ''); }).catch(() => {});
  }, [state.merchantToken]);
  const savePayout = async () => {
    setPayoutSaving(true); setPayoutMsg({ type: '', text: '' });
    try {
      const { data } = await merchantAPI.savePayout(payout);
      setPayout({ momoMtn: data.momoMtn || '', momoMoov: data.momoMoov || '' });
      setPayoutMsg({ type: 'ok', text: 'Numéros enregistrés.' });
    } catch (err) {
      setPayoutMsg({ type: 'err', text: err.response?.data?.error || "Impossible d'enregistrer." });
    } finally { setPayoutSaving(false); }
  };

  const [readyLoadingId, setReadyLoadingId] = useState(null);
  const markReady = async (id) => {
    setActionError('');
    setReadyLoadingId(id);
    try {
      await merchantAPI.updateOrderStatus(id, 'ready');
      const { data } = await merchantAPI.orders();
      setOrders(data.orders);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Impossible de marquer cette commande comme prête.');
    } finally {
      setReadyLoadingId(null);
    }
  };

  // ── Sélection du livreur par le restaurant ──────────────────
  const [driverPickerOrderId, setDriverPickerOrderId] = useState(null);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState(null);

  const openDriverPicker = async (orderId) => {
    setDriverPickerOrderId(orderId);
    setLoadingDrivers(true);
    setActionError('');
    try {
      const { data } = await merchantAPI.availableDrivers(orderId);
      setAvailableDrivers(data.drivers);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Impossible de charger les livreurs disponibles.');
      setDriverPickerOrderId(null);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const assignDriver = async (driverId) => {
    setAssigningDriverId(driverId);
    try {
      await merchantAPI.assignDriver(driverPickerOrderId, driverId);
      setDriverPickerOrderId(null);
      const { data } = await merchantAPI.orders();
      setOrders(data.orders);
    } catch (err) {
      setActionError(err.response?.data?.error || "Impossible d'assigner ce livreur.");
    } finally {
      setAssigningDriverId(null);
    }
  };

  // ── Menu (le restaurant gère ses propres plats) ─────────────
  const emptyDishForm = { period: 'dejeuner', category: 'plats_locaux', name: '', price: '', desc: '', image: '', characteristics: '', advantages: '', benefits: '' };
  const [dishForm, setDishForm] = useState(emptyDishForm);
  const [editingDishId, setEditingDishId] = useState(null);
  const [savingDish, setSavingDish] = useState(false);
  const [dishFormError, setDishFormError] = useState('');

  const startEditDish = (dish) => {
    setEditingDishId(dish.id);
    setDishForm({ period: dish.period, category: dish.category, name: dish.name, price: dish.price, desc: dish.desc || '', image: dish.image || '', characteristics: dish.characteristics || '', advantages: dish.advantages || '', benefits: dish.benefits || '' });
  };
  const cancelEditDish = () => { setEditingDishId(null); setDishForm(emptyDishForm); setDishFormError(''); };

  const submitDish = async () => {
    setDishFormError('');
    if (!dishForm.name || !dishForm.price) { setDishFormError('Nom et prix requis'); return; }
    setSavingDish(true);
    try {
      if (editingDishId) {
        await merchantAPI.updateDish(editingDishId, { ...dishForm, price: Number(dishForm.price) });
      } else {
        await merchantAPI.createDish({ ...dishForm, price: Number(dishForm.price) });
      }
      const { data } = await merchantAPI.dishes();
      setMyDishes(data.dishes);
      setMaxDishes(data.maxDishes);
      setWeeklyDishes(data.weeklyDishes || null);
      cancelEditDish();
    } catch (err) {
      setDishFormError(err.response?.data?.error || "Impossible d'enregistrer ce plat.");
    } finally {
      setSavingDish(false);
    }
  };

  const removeDish = async (id) => {
    try {
      await merchantAPI.removeDish(id);
      const { data } = await merchantAPI.dishes();
      setMyDishes(data.dishes);
      setMaxDishes(data.maxDishes);
      setWeeklyDishes(data.weeklyDishes || null);
    } catch (err) {
      setDishFormError(err.response?.data?.error || 'Impossible de retirer ce plat.');
    }
  };

  // ── Changer mon mot de passe ─────────────────────────────────
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const submitPasswordChange = async () => {
    setPwError(''); setPwSuccess(false);
    if (!pwForm.currentPassword || !pwForm.newPassword) { setPwError('Tous les champs sont requis'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Les nouveaux mots de passe ne correspondent pas'); return; }
    if (pwForm.newPassword.length < 6) { setPwError('Le nouveau mot de passe doit faire au moins 6 caractères'); return; }
    setPwSaving(true);
    try {
      await merchantAPI.changePassword(pwForm.currentPassword, pwForm.newPassword);
      setPwSuccess(true);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Impossible de changer le mot de passe.');
    } finally {
      setPwSaving(false);
    }
  };

  const logout = () => { dispatch({ type: 'MERCHANT_LOGOUT' }); navigate('merchant_login'); };

  if (loading || !dashboard) {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><Spinner size={32} /></div>;
  }

  const m = dashboard.merchant;
  const pendingOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));

  return (
    <div className="screen" style={{ flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'var(--emerald-dark)', flexShrink: 0 }}>
        <StatusBar light />
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {m?.restaurantLogo
            ? <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
                <img src={m.restaurantLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            : <DynamicIcon name={m?.restaurantIcon} size={32} color="#fff" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, color: '#fff' }}>{m?.restaurantName}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
              Abonnement {m?.subscriptionInfo?.label} - {dashboard.stats.rating}
            </div>
          </div>
          <button onClick={logout} title="Déconnexion" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>Quitter</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', padding: '0 20px' }}>
          {[['dashboard', 'Dashboard'], ['orders', 'Commandes'], ['menu', 'Mon menu'], ['analytics', 'Analytiques'], ['plans', 'Abonnement']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '12px 0', border: 'none', background: 'none',
              borderBottom: tab === k ? '3px solid var(--emerald)' : '3px solid transparent',
              color: tab === k ? 'var(--emerald)' : 'var(--gray)',
              fontWeight: tab === k ? 800 : 600, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{label}</span></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingBottom: 20 }}>

        {tab === 'dashboard' && (
          <>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Où tes clients te paient</div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10, lineHeight: 1.45 }}>
                {payoutMode === 'kkiapay'
                  ? "Entre les numéros Mobile Money sur lesquels WAYI te reverse tes ventes. Les clients paient en ligne : tu ne prépares une commande que lorsqu'elle est marquée « Payée »."
                  : "Entre les numéros Mobile Money sur lesquels tu encaisses. Le client envoie l'argent directement sur ton numéro, puis tu confirmes la réception dans « Commandes ». Si tu n'en mets pas, c'est WAYI qui encaisse."}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="tel" placeholder="Numéro MTN MoMo (ex : 01 42 43 63 87)" value={payout.momoMtn} onChange={e => setPayout(p => ({ ...p, momoMtn: e.target.value }))} />
                <input type="tel" placeholder="Numéro Moov Money (ex : 01 94 80 50 26)" value={payout.momoMoov} onChange={e => setPayout(p => ({ ...p, momoMoov: e.target.value }))} />
              </div>
              {payoutMsg.text && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: payoutMsg.type === 'ok' ? 'var(--emerald-dark)' : 'var(--danger)' }}>{payoutMsg.text}</div>}
              <button className="btn btn-primary" onClick={savePayout} disabled={payoutSaving} style={{ marginTop: 10, width: '100%' }}>{payoutSaving ? 'Enregistrement...' : 'Enregistrer mes numéros'}</button>
            </div>
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { val: dashboard.stats.todayOrders, label: "Commandes aujourd'hui", color: 'var(--emerald-light)', tc: 'var(--emerald-dark)' },
                { val: `${(dashboard.stats.todayRevenue / 1000).toFixed(0)}k F`, label: "CA aujourd'hui (net)", color: '#F7ECE3', tc: '#c45012' },
                { val: dashboard.stats.monthlyOrders, label: 'Commandes ce mois', color: 'var(--emerald-light)', tc: 'var(--emerald-dark)' },
                { val: `${(dashboard.stats.monthlyRevenue / 1000000).toFixed(1)}M F`, label: 'CA mensuel (net)', color: '#F7ECE3', tc: '#c45012' },
              ].map(s => (
                <div key={s.label} style={{ background: s.color, borderRadius: 'var(--r-lg)', padding: '16px 14px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: s.tc }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>{m?.subscriptionInfo?.badge && <DynamicIcon name={m.subscriptionInfo.badge} size={15} />} Positionnement {m?.subscriptionInfo?.label}</div>
              <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5 }}>{dashboard.message}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <div style={{ flex: 1, background: 'var(--border)', borderRadius: 'var(--r-full)', height: 8 }}>
                  <div style={{ background: 'var(--grad-brand)', width: `${dashboard.priorityScore}%`, height: '100%', borderRadius: 'var(--r-full)' }} />
                </div>
                <span style={{ fontWeight: 800, color: 'var(--emerald)', fontSize: 14 }}>{dashboard.priorityScore}/100</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>Commission Wayi : {(dashboard.commissionRate * 100).toFixed(0)}% par commande</div>
            </div>

            {pendingOrders.length > 0 && (
              <div style={{ background: '#F7ECE3', border: '1px solid #ffd0b8', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#c45012', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}> {pendingOrders.length} commande{pendingOrders.length > 1 ? 's' : ''} en attente</div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>Confirme vite pour maintenir ton taux de satisfaction élevé !</div>
              </div>
            )}
          </>
        )}

        {tab === 'orders' && (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, marginBottom: 14 }}>
              Commandes ({orders.length})
            </div>
            {actionError && (
              <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                {actionError}
              </div>
            )}
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--gray)', fontSize: 13 }}>Aucune commande pour le moment</div>
            ) : orders.map(order => (
              <div key={order.id} style={{
                background: 'var(--white)',
                border: `2px solid ${order.status === 'ready' ? 'var(--emerald)' : order.status === 'preparing' ? 'var(--sun)' : order.status === 'pending' ? '#c45012' : 'var(--border)'}`,
                borderRadius: 'var(--r-lg)', padding: '14px', marginBottom: 12,
                boxShadow: order.status === 'ready' || order.status === 'pending' ? '0 4px 16px rgba(242, 105, 13, 0.12)' : 'none',
                transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{order.id}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray)' }}>{new Date(order.createdAt).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  {(order.items || []).map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--ink)' }}>{item.name} x{item.qty}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}> {order.address}</div>
                {order.paymentProvider === 'kkiapay' && (
                  <div style={{ background: order.paymentStatus === 'paid' ? '#e8f6ee' : '#fff8e8', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 10, fontSize: 12, fontWeight: 700 }}>
                    {order.paymentStatus === 'paid' ? 'Payée en ligne : tu peux préparer.' : 'En attente du paiement du client : ne prépare pas encore.'}
                  </div>
                )}
                {order.paymentProvider === 'manual' && (
                  <div style={{ background: order.paymentStatus === 'paid' ? '#e8f6ee' : '#fff8e8', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 10, fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {order.paymentMethod === 'moov' ? 'Moov Money' : 'MTN MoMo'} : {order.paymentStatus === 'paid' ? 'paiement confirmé' : order.paymentStatus === 'rejected' ? 'paiement rejeté' : order.paymentStatus === 'claimed' ? 'le client dit avoir payé' : 'en attente du paiement du client'}
                    </div>
                    {order.paymentPayee === 'restaurant' ? (
                      <div style={{ color: 'var(--gray)', marginTop: 2 }}>
                        Montant à recevoir sur ton {order.paymentTo} : <b>{order.total?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</b>
                        {order.paymentFromPhone ? ` · depuis ${order.paymentFromPhone}` : ''}
                        {order.paymentClaim?.reference ? ` · réf. ${order.paymentClaim.reference}` : ''}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--gray)', marginTop: 2 }}>Le client paie WAYI : WAYI te préviendra dès que le paiement est confirmé.</div>
                    )}
                    {order.paymentPayee === 'restaurant' && ['awaiting_payment', 'claimed'].includes(order.paymentStatus) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn btn-primary" disabled={payBusyId === order.id} onClick={() => decidePayment(order.id, 'confirm')} style={{ flex: 1, padding: '8px 10px', fontSize: 12 }}>J'ai reçu l'argent</button>
                        <button className="btn" disabled={payBusyId === order.id} onClick={() => decidePayment(order.id, 'reject')} style={{ padding: '8px 10px', fontSize: 12 }}>Pas reçu</button>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontWeight: 900, color: 'var(--emerald)', fontSize: 16 }}>{order.total?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>

                  {order.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => rejectOrder(order.id)} disabled={decidingId === order.id}
                        style={{ background: '#fde8e6', color: 'var(--danger)', border: 'none', borderRadius: 'var(--r-md)', padding: '9px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Rejeter
                      </button>
                      <button onClick={() => acceptOrder(order.id)} disabled={decidingId === order.id || ['awaiting_payment', 'claimed', 'rejected'].includes(order.paymentStatus)}
                        style={{ background: 'var(--grad-brand)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '9px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {decidingId === order.id ? <Spinner size={13} color="#fff" /> : 'Accepter'}
                      </button>
                    </div>
                  ) : order.status === 'preparing' ? (
                    <button onClick={() => markReady(order.id)} disabled={readyLoadingId === order.id}
                      style={{ background: 'var(--grad-sun)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '9px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {readyLoadingId === order.id ? <Spinner size={13} color="#fff" /> : 'Marquer prêt'}
                    </button>
                  ) : order.status === 'ready' ? (
                    order.driver ? (
                      <span className="badge" style={{ background: 'var(--grad-brand)', color: '#fff', fontSize: 11, padding: '6px 12px' }}>
                        {order.driver.name} arrive
                      </span>
                    ) : (
                      <button onClick={() => openDriverPicker(order.id)}
                        style={{ background: 'var(--grad-brand)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '9px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Choisir un livreur
                      </button>
                    )
                  ) : (
                    <span className="badge badge-emerald" style={{ fontSize: 11 }}>{({ cancelled: 'Rejetée', delivered: 'Livrée', confirmed: 'Confirmée', on_the_way: 'En livraison' })[order.status] || order.status}</span>
                  )}
                </div>
                {order.driver && ['confirmed', 'preparing', 'ready', 'on_the_way'].includes(order.status) && (
                  <button onClick={() => setTrackingId(order.id)}
                    style={{ marginTop: 10, width: '100%', background: 'var(--white)', color: 'var(--ink)', border: '1.5px solid var(--border)', borderRadius: 999, padding: '9px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Suivre {order.driver.name} sur la carte
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'menu' && (
          <>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
                {editingDishId ? 'Modifier le plat' : 'Ajouter un plat'}
                {maxDishes && <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: 12 }}> - {myDishes.length}/{maxDishes} plats</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={dishForm.period} onChange={e => setDishForm(f => ({ ...f, period: e.target.value }))} style={{ flex: 1 }}>
                    {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <select value={dishForm.category} onChange={e => setDishForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <input placeholder="Nom du plat" value={dishForm.name} onChange={e => setDishForm(f => ({ ...f, name: e.target.value }))} />
                <input placeholder="Prix (FCFA)" type="number" value={dishForm.price} onChange={e => setDishForm(f => ({ ...f, price: e.target.value }))} />
                <input placeholder="Description (optionnel)" value={dishForm.desc} onChange={e => setDishForm(f => ({ ...f, desc: e.target.value }))} />
                <input placeholder="URL de la photo (optionnel)" value={dishForm.image} onChange={e => setDishForm(f => ({ ...f, image: e.target.value }))} />
                <textarea rows={3} placeholder="Caractéristiques : ce qu'est le plat (ingrédients, taille, cuisson...). Une ligne par élément." value={dishForm.characteristics} onChange={e => setDishForm(f => ({ ...f, characteristics: e.target.value }))} />
                <textarea rows={3} placeholder="Avantages : en quoi ce plat se distingue (fraîcheur, rapidité, fait maison...)." value={dishForm.advantages} onChange={e => setDishForm(f => ({ ...f, advantages: e.target.value }))} />
                <textarea rows={3} placeholder="Bénéfices : ce que le client en retire (se régaler, repas complet, gain de temps...)." value={dishForm.benefits} onChange={e => setDishForm(f => ({ ...f, benefits: e.target.value }))} />

                {dishFormError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{dishFormError}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                  {editingDishId && (
                    <button onClick={cancelEditDish} style={{ flex: 1, background: 'var(--cream)', border: 'none', borderRadius: 'var(--r-md)', padding: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      Annuler
                    </button>
                  )}
                  <button onClick={submitDish} disabled={savingDish} className="btn btn-primary" style={{ flex: 2, padding: 12, fontSize: 13 }}>
                    {savingDish ? <Spinner size={16} color="#fff" /> : editingDishId ? 'Enregistrer' : 'Ajouter au menu'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Mon menu ({myDishes.length})</div>
            {weeklyDishes && (
              <div style={{ background: '#FFF4EB', border: '1px solid #F7D9C2', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#7A2A18', lineHeight: 1.5 }}>
                Tes clients voient <b>{weeklyDishes} plats par semaine</b>. Chaque lundi à minuit, ils passent automatiquement aux {weeklyDishes} plats suivants de ta carte.
              </div>
            )}
            {myDishes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray)', fontSize: 13 }}>Aucun plat pour le moment - ajoute ton premier plat ci-dessus.</div>
            ) : (
              <div className="cards-grid">
                {myDishes.map(dish => (
                  <div key={dish.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 12 }}>
                    {weeklyDishes && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: dish.onlineThisWeek ? '#1E7D4B' : dish.onlineNextWeek ? '#A8321F' : 'var(--gray)' }}>
                        {dish.onlineThisWeek ? 'En ligne cette semaine' : dish.onlineNextWeek ? 'En ligne la semaine prochaine' : 'Plus tard dans la rotation'}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{dish.name}</span>
                      <span style={{ fontWeight: 800, color: 'var(--emerald)', fontSize: 13 }}>{dish.price?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8 }}>
                      {PERIODS.find(p => p.id === dish.period)?.label} - {CATEGORIES.find(c => c.id === dish.category)?.label}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEditDish(dish)} style={{ flex: 1, background: 'var(--cream)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Modifier</button>
                      <button onClick={() => removeDish(dish.id)} style={{ flex: 1, background: '#fde8e6', color: 'var(--danger)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'analytics' && analytics && (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, marginBottom: 14 }}>Gains par plat</div>
            {(analytics.dishEarnings || []).length === 0 ? (
              <div style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 16 }}>Pas encore assez de données.</div>
            ) : analytics.dishEarnings.map((p, i) => (
              <div key={p.name} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <DynamicIcon name={p.icon} size={22} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>{p.qty} vendu{p.qty > 1 ? 's' : ''} - net {p.net.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--emerald)' }}>{p.revenue.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F</div>
                  <span className="badge badge-emerald" style={{ fontSize: 9 }}>#{i + 1}</span>
                </div>
              </div>
            ))}
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px', marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}> Finances</div>
              {[
                ['CA total brut', `${analytics.revenue.total.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`],
                [`Commission Wayi (${analytics.revenue.commissionRate})`, `${analytics.revenue.platformFees.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`],
                ['CA net reversé', `${analytics.revenue.net.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`],
                ['Panier moyen', `${analytics.orders.avgBasket.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--gray)' }}>{k}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'plans' && (
          <>
            <div style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Ton abonnement détermine ta visibilité dans le menu du jour. Plus ton plan est élevé, plus tu apparais en priorité.
            </div>
            {Object.entries(plans).map(([key, plan]) => (
              <div key={key} style={{
                background: 'var(--white)', borderRadius: 'var(--r-lg)',
                border: `${m?.subscription?.plan === key ? '2px' : '1px'} solid ${m?.subscription?.plan === key ? 'var(--emerald)' : 'var(--border)'}`,
                padding: '16px', marginBottom: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {plan.badge && <DynamicIcon name={plan.badge} size={17} />}
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16 }}>{plan.label}</span>
                    {m?.subscription?.plan === key && <span className="badge badge-emerald" style={{ fontSize: 9 }}>Mon plan</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: 'var(--emerald)', fontSize: 16 }}>{(plan.price / 1000)}k FCFA</div>
                    <div style={{ fontSize: 10, color: 'var(--gray)' }}>/mois</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>Priorité {plan.priority}/3 - jusqu'à {plan.maxDishes || 'illimité'} plats</div>
              </div>
            ))}

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginTop: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Changer mon mot de passe</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Mot de passe actuel" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
                <input placeholder="Nouveau mot de passe" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
                <input placeholder="Confirmer le nouveau mot de passe" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} />

                {pwError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{pwError}</div>}
                {pwSuccess && <div style={{ color: 'var(--emerald-dark)', fontSize: 12, fontWeight: 600 }}>Mot de passe mis à jour.</div>}

                <button onClick={submitPasswordChange} disabled={pwSaving} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
                  {pwSaving ? <Spinner size={16} color="#fff" /> : 'Mettre à jour'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sélection du livreur */}
      {driverPickerOrderId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17 }}>Choisir un livreur</div>
              <button onClick={() => setDriverPickerOrderId(null)} style={{ background: 'var(--cream)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} strokeWidth={2.4} aria-hidden="true" /></button>
            </div>

            {loadingDrivers ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}><Spinner size={24} /></div>
            ) : availableDrivers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray)', fontSize: 13 }}>
                Aucun livreur disponible pour le moment. Réessaie dans quelques minutes.
              </div>
            ) : (
              availableDrivers.map(d => (
                <button key={d.id} onClick={() => assignDriver(d.id)} disabled={assigningDriverId === d.id}
                  style={{ width: '100%', background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                      {d.vehicle?.type || 'Véhicule'} - Note {d.rating ?? '-'}
                      {d.distanceKm !== null && ` - ${d.distanceKm} km`}
                    </div>
                  </div>
                  {assigningDriverId === d.id ? <Spinner size={16} /> : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--emerald)' }}>Assigner</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {trackingId && <DriverTracking orderId={trackingId} onClose={() => setTrackingId(null)} />}
    </div>
  );
}
