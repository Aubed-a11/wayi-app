import { useState, useEffect, useCallback } from 'react';
import { Star, MapPin, Sparkles, X, ChevronRight, ClipboardList, Heart, Crown, HelpCircle, Info, LogOut, Settings, User, ArrowLeft, Bike } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BottomNav, Spinner } from '../components/UI';
import { DishImg, Empty, fcfa, toCartItem } from '../components/Wayi';
import AddressSheet from '../components/AddressSheet';
import { ordersAPI, authAPI, aiAPI } from '../api';
import { useBackClose } from '../lib/native';

const STATUS_CONFIG = {
  pending:    { label: 'En attente',     cls: '' },
  confirmed:  { label: 'Confirmée',      cls: 'live' },
  preparing:  { label: 'En préparation', cls: 'live' },
  ready:      { label: 'Prête',          cls: 'live' },
  on_the_way: { label: 'En route',       cls: 'live' },
  delivered:  { label: 'Livrée',         cls: 'ok' },
  cancelled:  { label: 'Annulée',        cls: 'ko' },
};

export default function ProfileScreen() {
  const { state, dispatch, navigate } = useApp();
  const user = state.user;
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState(null);
  useBackClose(!!tab, () => setTab(null));
  const [favorites, setFavorites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddresses, setShowAddresses] = useState(false);
  // Ce que Yivi a retenu des gouts du client (consultable et modifiable)
  const [prefs, setPrefs] = useState(null);
  const loadPrefs = useCallback(() => { aiAPI.profile().then(({ data }) => setPrefs(data)).catch(() => setPrefs({ aime: [], evite: [], budgetMax: null, notes: [] })); }, []);
  const forget = async (type, valeur) => {
    try { await aiAPI.forget(type, valeur); loadPrefs(); } catch { /* on garde l'affichage tel quel */ }
  };
  const [loadError, setLoadError] = useState(false);

  // ── Abonnement client ────────────────────────────────────────
  const [subPlans, setSubPlans] = useState(null);
  const [subscribing, setSubscribing] = useState(null);
  const [subError, setSubError] = useState('');
  const [subMethod, setSubMethod] = useState('mtn_momo');
  const [subPendingMsg, setSubPendingMsg] = useState('');
  const [subChecking, setSubChecking] = useState(false);
  const [subPhone, setSubPhone] = useState(user?.phone || '');

  useEffect(() => {
    if (tab === 'subscription' && !subPlans) {
      authAPI.subscriptionPlans().then(({ data }) => setSubPlans(data.plans)).catch(() => {});
    }
  }, [tab, subPlans]);

  const subscribeToPlan = async (plan) => {
    setSubError('');
    if (subMethod !== 'card' && !subPhone.trim()) { setSubError('Renseigne ton numéro Mobile Money pour payer.'); return; }
    setSubscribing(plan);
    try {
      const { data } = await authAPI.subscribe(plan, subMethod, subMethod === 'card' ? undefined : subPhone.trim());
      if (data.pending) { setSubPendingMsg(data.message); }
      else { setSubPendingMsg(''); dispatch({ type: 'SET_USER', payload: { ...user, subscription: data.subscription } }); }
    } catch (err) {
      setSubError(err.response?.data?.error || "Impossible de finaliser l'abonnement.");
    } finally {
      setSubscribing(null);
    }
  };

  const confirmSubscription = async () => {
    setSubError('');
    setSubChecking(true);
    try {
      const { data } = await authAPI.subscribeConfirm();
      setSubPendingMsg('');
      dispatch({ type: 'SET_USER', payload: { ...user, subscription: data.subscription } });
    } catch (err) {
      setSubError(err.response?.data?.error || 'Impossible de vérifier le paiement.');
    } finally {
      setSubChecking(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await ordersAPI.list();
      setOrders(data?.orders || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = () => dispatch({ type: 'LOGOUT' });

  // Uniquement des entrees qui font vraiment quelque chose
  useEffect(() => {
    if (tab === 'favorites' && !favorites) authAPI.favorites().then(({ data }) => setFavorites(data?.dishes || [])).catch(() => setFavorites([]));
    if (tab === 'prefs' && !prefs) loadPrefs();
  }, [tab, favorites, prefs, loadPrefs]);

  if (!user) {
    return (
      <div className="screen">
        <StatusBar />
        <Empty Icon={User} title="Mon profil" text="Connecte-toi pour retrouver tes commandes, tes adresses et tes favoris." action={() => navigate('login')} actionLabel="Se connecter" />
        <BottomNav />
      </div>
    );
  }

  const delivered = orders.filter(o => o.status === 'delivered');
  const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const spent = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
  const subActive = user.subscription?.active && new Date(user.subscription.expiresAt) > new Date();

  const MENU = [
    { key: 'orders', Icon: ClipboardList, label: 'Mes commandes', sub: active.length ? `${active.length} en cours` : null },
    { key: 'addresses', Icon: MapPin, label: 'Mes adresses', sub: `${user.addresses?.length || 0} adresse(s)` },
    { key: 'subscription', Icon: Crown, label: 'Abonnement livraison', sub: subActive ? `Actif jusqu'au ${new Date(user.subscription.expiresAt).toLocaleDateString('fr-FR')}` : 'Livraison gratuite pendant 7 ou 30 jours' },
    { key: 'favorites', Icon: Heart, label: 'Favoris' },
    { key: 'prefs', Icon: Sparkles, label: 'Mes goûts retenus par Yivi' },
    { key: 'help', Icon: HelpCircle, label: 'Aide & Support' },
    { key: 'about', Icon: Info, label: 'À propos de WAYI' },
    { key: 'logout', Icon: LogOut, label: 'Se déconnecter' },
  ];
  const openItem = (k) => {
    if (k === 'addresses') return setShowAddresses(true);
    if (k === 'help') return navigate('ai');
    if (k === 'logout') return logout();
    setTab(k);
  };
  const TITLES = { orders: 'Mes commandes', subscription: 'Abonnement livraison', favorites: 'Favoris', prefs: 'Mes goûts', about: 'À propos de WAYI' };

  // ── Sous-page ──────────────────────────────────────────────
  if (tab) {
    return (
      <div className="screen">
        <StatusBar />
        <div className="w-topbar">
          <button className="w-icon-btn" onClick={() => setTab(null)} aria-label="Retour"><ArrowLeft size={22} aria-hidden="true" /></button>
          <div className="w-topbar-title">{TITLES[tab]}</div><span style={{ width: 40 }} />
        </div>
        <div className="w-scroll"><div className="w-pad">

          {tab === 'orders' && (loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={26} /></div>
            : loadError ? <Empty Icon={ClipboardList} title="Historique indisponible" text="Vérifie ta connexion." action={load} actionLabel="Réessayer" />
            : orders.length === 0 ? <Empty Icon={ClipboardList} title="Aucune commande" text="Tes commandes apparaîtront ici." action={() => navigate('home')} actionLabel="Commander" />
            : orders.map(order => {
              const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              return (
                <div key={order.id} className="w-order-row" onClick={() => {
                  const batch = orders.filter(o => o.batchId && o.batchId === order.batchId);
                  dispatch({ type: 'SET_ACTIVE_ORDERS', payload: batch.length ? batch : [order] });
                  navigate('track');
                }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--brand-light)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Bike size={20} aria-hidden="true" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{order.restaurantName}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(order.items || []).map(i => `${i.qty} x ${i.name}`).join(', ')}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray)' }}>{new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</div>
                    {order.dishRating && <div style={{ display: 'flex', gap: 1, marginTop: 2, color: 'var(--brand)' }}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} strokeWidth={1.8} fill={i < order.dishRating ? 'currentColor' : 'none'} aria-hidden="true" />)}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="w-price" style={{ fontSize: 14, marginBottom: 4 }}>{fcfa(order.total)}</div>
                    <span className={`w-status ${sc.cls}`}>{sc.label}</span>
                  </div>
                </div>
              );
            }))}

          {tab === 'subscription' && (
          <>
            <div style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Abonne-toi pour profiter de la livraison gratuite sur toutes tes commandes pendant la durée de l'abonnement.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <select value={subMethod} onChange={e => { setSubMethod(e.target.value); setSubError(''); }}>
                <option value="mtn_momo">MTN MoMo</option>
                <option value="moov">Moov Money</option>
                <option value="card">Carte bancaire</option>
              </select>
              {subMethod !== 'card' && (
                <input type="tel" placeholder="Numéro Mobile Money" value={subPhone} onChange={e => { setSubPhone(e.target.value); setSubError(''); }} />
              )}
            </div>
            {subPlans && Object.entries(subPlans).map(([key, plan]) => (
              <div key={key} style={{
                background: 'var(--white)', borderRadius: 'var(--r-lg)',
                border: `${user?.subscription?.plan === key && user?.subscription?.active ? '2px' : '1px'} solid ${user?.subscription?.plan === key && user?.subscription?.active ? 'var(--emerald)' : 'var(--border)'}`,
                padding: '16px', marginBottom: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16 }}>{plan.label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: 'var(--emerald)', fontSize: 16 }}>{plan.price.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 12 }}>{plan.benefit}</div>
                <button
                  onClick={() => subscribeToPlan(key)}
                  disabled={subscribing === key}
                  className="btn btn-primary"
                  style={{ padding: 10, fontSize: 13 }}
                >
                  {subscribing === key ? <Spinner size={16} color="#fff" /> : "S'abonner"}
                </button>
              </div>
            ))}
            {user?.subscription?.active && new Date(user.subscription.expiresAt) > new Date() && (
              <div style={{ background: 'var(--emerald-light)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 12, color: 'var(--emerald-dark)', fontWeight: 600 }}>
                Abonnement actif jusqu'au {new Date(user.subscription.expiresAt).toLocaleDateString('fr')}.
              </div>
            )}
            {subPendingMsg && (
              <div style={{ background: '#fff8e6', border: '1px solid #f0d98c', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 12, color: '#8a6d1a', marginTop: 8 }}>
                <div style={{ marginBottom: 10 }}>{subPendingMsg}</div>
                <button onClick={confirmSubscription} disabled={subChecking} className="btn btn-primary" style={{ padding: 10, fontSize: 13 }}>
                  {subChecking ? <Spinner size={16} color="#fff" /> : 'Vérifier mon paiement'}
                </button>
              </div>
            )}
            {subError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginTop: 8 }}>{subError}</div>}
          </>
          )}

          {tab === 'favorites' && (!favorites ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={26} /></div>
            : favorites.length === 0 ? <Empty Icon={Heart} title="Pas encore de favoris" text="Touche le cœur sur la fiche d'un plat pour le retrouver ici." action={() => navigate('explore')} actionLabel="Explorer les plats" />
            : favorites.map(d => (
              <div key={d.id} className="w-cart-item" style={{ cursor: 'pointer' }} onClick={() => { dispatch({ type: 'SET_ACTIVE_DISH', payload: d }); navigate('dish'); }}>
                <DishImg src={d.image} iconSize={20} />
                <div className="w-cart-info">
                  <div className="w-cart-name">{d.name}</div>
                  <div className="w-cart-resto">{d.restaurant?.name}</div>
                  <div className="w-price">{fcfa(d.price)}</div>
                </div>
                <button className="w-add" onClick={e => { e.stopPropagation(); dispatch({ type: 'CART_ADD', payload: { item: toCartItem(d) } }); }}>Ajouter</button>
              </div>
            )))}

          {tab === 'prefs' && (
            <div className="w-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12, lineHeight: 1.5 }}>Ce que tu as dit à Yivi sur tes goûts. Touche la croix pour qu'elle l'oublie.</div>
                {!prefs ? <Spinner size={18} /> : (() => {
                  const chips = [
                    ...prefs.aime.map(v => ({ type: 'aime', v, label: `Aime : ${v}` })),
                    ...prefs.evite.map(v => ({ type: 'evite', v, label: `Évite : ${v}` })),
                    ...(prefs.budgetMax ? [{ type: 'budget', v: 'budget', label: `Budget : ${prefs.budgetMax.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA` }] : []),
                    ...prefs.notes.map(v => ({ type: 'note', v, label: v })),
                  ];
                  if (!chips.length) return <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5 }}>Rien pour l'instant. Dis à Yivi ce que tu aimes ou ce que tu ne manges pas, elle s'en souviendra pour ses prochaines propositions.</div>;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {chips.map(c => (
                        <span key={c.type + c.v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 'var(--r-full)', padding: '6px 6px 6px 12px', fontSize: 12.5 }}>
                          {c.label}
                          <button onClick={() => forget(c.type, c.v)} aria-label={`Oublier ${c.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, color: 'var(--gray)' }}><X size={14} aria-hidden="true" /></button>
                        </span>
                      ))}
                    </div>
                  );
                })()}
            </div>
          )}

          {tab === 'about' && (
            <div className="w-card" style={{ padding: 18, fontSize: 14, lineHeight: 1.6, color: '#4F4641' }}>
              <img src="/icon-192.png" alt="" style={{ width: 64, height: 64, borderRadius: 18, display: 'block', marginBottom: 12 }} />
              <p style={{ margin: '0 0 10px' }}><b style={{ color: 'var(--ink)' }}>WAYI</b> compose chaque jour un menu avec des plats de restaurants partenaires, du petit-déjeuner au dîner, et te les livre.</p>
              <p style={{ margin: '0 0 10px' }}>Yivi, l'assistante de l'appli, t'aide à choisir, remplit ton panier et suit ta livraison.</p>
              <p style={{ margin: 0, color: 'var(--gray)', fontSize: 12.5 }}>Version 1.0 · wayibenin.com</p>
            </div>
          )}
        </div></div>
        <AddressSheet open={showAddresses} onClose={() => setShowAddresses(false)} />
        <BottomNav />
      </div>
    );
  }

  // ── Page principale du profil ──────────────────────────────
  return (
    <div className="screen">
      <div className="w-scroll">
        <div className="w-profile-head">
          <button className="w-icon-btn w-profile-gear" onClick={() => setShowAddresses(true)} aria-label="Réglages de livraison"><Settings size={22} aria-hidden="true" /></button>
          <div className="w-avatar"><User size={46} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="w-profile-name">{user.name}</div>
          <div className="w-profile-mail">{user.email || user.phone}</div>
        </div>

        <div className="w-stats">
          <div className="w-stat"><b>{loading ? '...' : delivered.length}</b><span>{delivered.length > 1 ? 'Livrées' : 'Livrée'}</span></div>
          <div className="w-stat"><b>{loading ? '...' : active.length}</b><span>En cours</span></div>
          <div className="w-stat"><b>{loading ? '...' : (spent >= 100000 ? `${Math.round(spent / 1000)}k` : spent.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0'))}</b><span>FCFA dépensés</span></div>
        </div>

        <div className="w-pad" style={{ marginTop: 18 }}>
          <div className="w-menu">
            {MENU.map(({ key, Icon, label, sub }) => (
              <button key={key} className="w-menu-item" onClick={() => openItem(key)} style={key === 'logout' ? { color: 'var(--danger)' } : undefined}>
                <span className="ico" style={key === 'logout' ? { color: 'var(--danger)' } : undefined}><Icon size={21} strokeWidth={1.9} aria-hidden="true" /></span>
                <span>{label}{sub && <small>{sub}</small>}</span>
                {key !== 'logout' && <span className="chev"><ChevronRight size={18} aria-hidden="true" /></span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <AddressSheet open={showAddresses} onClose={() => setShowAddresses(false)} />
      <BottomNav />
    </div>
  );
}
