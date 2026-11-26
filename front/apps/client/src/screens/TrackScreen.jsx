import { useState, useEffect, useRef } from 'react';
import { Star, Check, CheckCircle2, X, Bike, Headphones, Phone, ChefHat, Receipt, ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BottomNav, Spinner, launchConfetti } from '../components/UI';
import { Empty, fcfa } from '../components/Wayi';
import { LiveMap, km, directionsLink } from '../components/LiveMap';
import { ordersAPI, paymentsAPI } from '../api';
import { getSocket } from '../socket';
import { payWithKkiapay } from '../lib/kkiapay';

const STATUS_CONFIG = {
  pending:    { label: 'Commande envoyée',  sub: 'En attente de la confirmation du restaurant...', pct: 8 },
  cancelled:  { label: 'Commande annulée',  sub: "Cette commande n'a pas été préparée.", pct: 0 },
  confirmed:  { label: 'Commande confirmée', sub: "Recherche d'un livreur...", pct: 20 },
  preparing:  { label: 'En préparation',    sub: 'Ton plat est en préparation', pct: 45 },
  ready:      { label: 'Plat prêt !',        sub: 'Le livreur arrive pour le récupérer', pct: 62 },
  on_the_way: { label: 'Livreur en route',   sub: 'Suis-le en direct ci-dessous', pct: 80 },
  delivered:  { label: 'Livré !',            sub: 'Bon appétit !', pct: 100 },
};


// Paiement Mobile Money manuel : le client envoie l'argent au numéro WAYI puis confirme ici.
function ManualPayCard({ order, onClaimed }) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const status = order.paymentStatus;
  const net = order.paymentMethod === 'moov' ? 'Moov Money' : 'MTN MoMo';
  const pretty = (order.paymentTo || '').replace(/^\+229(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '+229 $1 $2 $3 $4 $5');
  const copy = async () => {
    try { await navigator.clipboard.writeText((order.paymentTo || '').replace(/\s/g, '')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  const claim = async () => {
    setBusy(true); setErr('');
    try {
      await paymentsAPI.manualClaim({ orderId: order.id, reference: ref });
      onClaimed(order.id);
    } catch (e) { setErr(e.response?.data?.error || "Impossible d'envoyer la confirmation. Réessaie."); }
    finally { setBusy(false); }
  };
  const box = { background: '#fff8e8', border: '1px solid #f1d58a', borderRadius: 'var(--r-lg)', padding: '16px', marginBottom: 20 };
  if (status === 'rejected') {
    return <div style={{ ...box, background: '#fde8e6', border: '1px solid #f5c0bb' }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--danger)' }}>Paiement non reçu</div>
      <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 4 }}>Ton paiement n'a pas été retrouvé et la commande a été annulée. Tu peux recommander et payer en espèces à la livraison.</div>
    </div>;
  }
  if (status === 'claimed') {
    return <div style={box}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#8a5a00' }}>Vérification du paiement en cours</div>
      <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 4 }}>WAYI contrôle la réception de {Number(order.total).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA. Dès que c'est confirmé, ta commande est préparée.</div>
    </div>;
  }
  return <div style={box}>
    <div style={{ fontWeight: 800, fontSize: 14, color: '#8a5a00', marginBottom: 8 }}>Dernière étape : envoie ton paiement {net}</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
      Envoie <b>{Number(order.total).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</b> par {net} au numéro suivant :
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, flex: 1 }}>{pretty || order.paymentTo}</div>
      <button onClick={copy} style={{ background: 'var(--emerald-light)', color: 'var(--emerald)', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{copied ? 'Copié' : 'Copier'}</button>
    </div>
    <div style={{ fontSize: 11.5, color: 'var(--gray)', marginBottom: 10 }}>Motif ou référence si possible : {order.id}</div>
    <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Référence de transaction (facultatif)" />
    {err && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginTop: 8 }}>{err}</div>}
    <button className="btn btn-primary" onClick={claim} disabled={busy} style={{ marginTop: 10, width: '100%' }}>{busy ? 'Envoi...' : "J'ai envoyé le paiement"}</button>
  </div>;
}

// Paiement Kkiapay : bouton qui ouvre le widget, puis vérification côté serveur.
const autoOpened = new Set(); // une ouverture automatique par commande et par session
let kkInfo = null;
function KkiapayPayCard({ order, userName, onPaid }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState(kkInfo);
  const method = order.paymentMethod === 'card' ? 'card' : 'momo';
  const net = order.paymentMethod === 'card' ? 'carte bancaire' : order.paymentMethod === 'moov' ? 'Moov Money' : 'MTN MoMo';

  useEffect(() => {
    if (info) return;
    paymentsAPI.methods().then(({ data }) => { kkInfo = data.kkiapay || null; setInfo(kkInfo); }).catch(() => setErr('Impossible de joindre le service de paiement.'));
  }, []);

  const pay = async () => {
    if (!info?.publicKey) { setErr('Le paiement en ligne est momentanément indisponible. Réessaie dans un instant.'); return; }
    setBusy(true); setErr('');
    try {
      const { transactionId } = await payWithKkiapay({
        publicKey: info.publicKey, sandbox: info.sandbox, amount: order.total,
        phone: order.paymentFromPhone, orderId: order.id, name: userName, method,
      });
      try {
        await paymentsAPI.verify({ orderId: order.id, transactionId });
        onPaid(order.id);
      } catch (e) {
        setErr((e.response?.data?.error || 'Paiement non confirmé.') + ' Si tu as été débité, contacte le support avec la référence ' + transactionId + '.');
      }
    } catch (e) {
      if (!e?.closed) setErr("Le module de paiement n'a pas pu s'ouvrir. Vérifie ta connexion et réessaie.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (info && !autoOpened.has(order.id)) { autoOpened.add(order.id); pay(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  return (
    <div style={{ background: '#fff8e8', border: '1px solid #f1d58a', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#8a5a00', marginBottom: 6 }}>Dernière étape : le paiement</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
        Règle <b>{Number(order.total).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</b> par {net}. Le restaurant prépare ta commande dès que le paiement est confirmé.
        {info?.sandbox && <span style={{ color: '#8a5a00' }}> (Mode test : aucun argent réel.)</span>}
      </div>
      {err && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginTop: 8 }}>{err}</div>}
      <button className="btn btn-primary" onClick={pay} disabled={busy} style={{ marginTop: 12, width: '100%' }}>
        {busy ? 'Paiement en cours...' : `Payer ${Number(order.total).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`}
      </button>
    </div>
  );
}

// Une ligne de notation par étoiles pour une catégorie (plat, livreur, ou service)
function RatingRow({ label, value, onChange, last = false }) {
  return (
    <div style={{ marginBottom: last ? 16 : 18 }}>
      <div style={{ fontSize: 12, color: 'var(--gray)', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.15s', transform: n <= value ? 'scale(1.15)' : 'scale(1)', padding: 2, fontSize: 22, color: 'var(--sun)' }}>
            <Star size={26} strokeWidth={1.8} fill={n <= value ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TrackScreen() {
  const { state, navigate, goBack } = useApp();
  const initialOrders = state.activeOrders?.length ? state.activeOrders : [];
  const [orders, setOrders] = useState(initialOrders);
  // Ouvert sans commande precise (cloche, profil) : on charge les commandes en cours
  const [fetching, setFetching] = useState(!initialOrders.length);
  useEffect(() => {
    if (initialOrders.length) return;
    ordersAPI.list()
      .then(({ data }) => setOrders((data?.orders || []).filter(o => !['delivered', 'cancelled'].includes(o.status))))
      .catch(() => {})
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [livePositions, setLivePositions] = useState({});
  const [dishRating, setDishRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const pollRef = useRef(null);

  const order = orders[activeIdx];
  const userPos = (order?.lat && order?.lng) ? { lat: order.lat, lng: order.lng } : state.user?.location;

  useEffect(() => {
    if (!orders.length) return;
    const socket = getSocket(state.token);

    orders.forEach(o => socket.emit('join:order', { orderId: o.id }));

    const onPosition = (payload) => {
      setLivePositions(prev => ({ ...prev, [payload.orderId]: { lat: payload.lat, lng: payload.lng, timestamp: payload.timestamp } }));
    };
    const onStatusChanged = (payload) => {
      setOrders(prev => prev.map(o => o.id === payload.orderId ? {
        ...o,
        status: payload.status || o.status,
        driver: payload.driver || o.driver,
        pingStatus: payload.pingStatus ?? o.pingStatus,
      } : o));
    };

    socket.on('driver:position', onPosition);
    socket.on('order:status_changed', onStatusChanged);

    return () => {
      orders.forEach(o => socket.emit('leave:order', { orderId: o.id }));
      socket.off('driver:position', onPosition);
      socket.off('order:status_changed', onStatusChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.map(o => o.id).join(',')]);

  useEffect(() => {
    if (!orders.length) return;
    const poll = async () => {
      try {
        const results = await Promise.all(orders.map(o => ordersAPI.get(o.id).then(r => r.data).catch(() => null)));
        setOrders(prev => prev.map((o, i) => results[i] ? { ...o, ...results[i] } : o));
      } catch {}
    };
    poll(); // positions du restaurant, du client et du livreur tout de suite
    pollRef.current = setInterval(poll, 6000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const confettiDone = useRef(false);
  const deliveredNow = order?.status === 'delivered';
  useEffect(() => {
    if (deliveredNow && !confettiDone.current) { confettiDone.current = true; launchConfetti(110); }
  }, [deliveredNow]);

  if (!order) {
    return (
      <div className="screen">
        <StatusBar />
        <div className="w-topbar">
          <button className="ct-back" onClick={goBack}>Retour</button>
          <div className="w-topbar-title">Suivi de commande</div><span style={{ width: 40 }} />
        </div>
        {fetching
          ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={26} /></div>
          : <Empty Icon={ClipboardList} title="Aucune commande en cours" text="Tes commandes en cours apparaîtront ici, avec leur suivi en direct." action={() => navigate('home')} actionLabel="Voir les menus du jour" />}
        <BottomNav />
      </div>
    );
  }

  const submitRating = async () => {
    setRatingLoading(true);
    setRatingError('');
    try {
      await ordersAPI.rate(order.id, {
        dishRating: dishRating || undefined,
        driverRating: order.driver ? (driverRating || undefined) : undefined,
        serviceRating: serviceRating || undefined,
      });
      setRated(true);
    } catch (err) {
      setRatingError(err.response?.data?.error || "Impossible d'envoyer ton avis pour le moment. Réessaie.");
    } finally {
      setRatingLoading(false);
    }
  };

  const cancelOrder = async () => {
    setCancelLoading(true);
    setCancelError('');
    try {
      await ordersAPI.cancel(order.id);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o));
    } catch (err) {
      setCancelError(err.response?.data?.error || "Impossible d'annuler cette commande pour le moment.");
    } finally {
      setCancelLoading(false);
    }
  };

  const currentStatus = order.status || 'pending';
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.confirmed;
  const isDelivered = currentStatus === 'delivered';
  const isCancelled = currentStatus === 'cancelled';
  const allDelivered = orders.every(o => o.status === 'delivered');
  const liveDriverPos = livePositions[order.id];
  const ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'];
  const reached = (k) => ORDER.indexOf(currentStatus) >= ORDER.indexOf(k);
  // Heure reelle de chaque etape, tiree de l'historique de la commande
  const timeOf = (k) => {
    const h = (order.statusHistory || []).find(x => x.status === k);
    if (!h) return null;
    const d = new Date(h.time);
    const today = d.toDateString() === new Date().toDateString();
    return `${today ? "Aujourd'hui" : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const eta = order.estimatedDelivery ? Math.max(0, Math.round((new Date(order.estimatedDelivery) - Date.now()) / 60000)) : null;

  const steps = isCancelled
    ? [{ key: 'cancelled', label: 'Commande annulée', sub: "Cette commande n'a pas été préparée.", done: true }]
    : [
      { key: 'pending', label: reached('confirmed') ? 'Commande confirmée' : 'Commande envoyée', sub: reached('confirmed') ? (timeOf('confirmed') || `${order.restaurantName} a accepté`) : `En attente de ${order.restaurantName}`, done: true },
      { key: 'preparing', label: 'Préparation en cours', sub: `Le restaurant prépare ta commande${timeOf('preparing') ? `\n${timeOf('preparing')}` : ''}`, done: reached('preparing') },
      { key: 'on_the_way', label: 'En cours de livraison', sub: order.driver ? `${order.driver.name}${order.driver.vehicle?.plate ? ` · ${order.driver.vehicle.plate}` : ''}` : (reached('ready') ? 'En attente du livreur' : (eta !== null ? `Estimation : ${eta} min` : '')), done: reached('on_the_way'), icon: Bike },
      { key: 'delivered', label: 'Livraison terminée', sub: timeOf('delivered') || '', done: isDelivered },
    ];
  const nowIdx = steps.findIndex(st => !st.done);

  return (
    <div className="screen">
      <StatusBar />
      <div className="w-topbar">
        <button className="ct-back" onClick={goBack}>Retour</button>
        <div className="w-topbar-title">Suivi de votre commande</div>
        <span style={{ width: 40 }} />
      </div>

      <div className="w-scroll">
        <div className="w-pad">
          {orders.length > 1 && (
            <div className="w-chips" style={{ marginBottom: 14 }}>
              {orders.map((o, i) => (
                <button key={o.id} className={`w-chip${i === activeIdx ? ' on' : ''}`} onClick={() => setActiveIdx(i)}>Livraison {i + 1}</button>
              ))}
            </div>
          )}

          <div className="w-card" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{config.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 2 }}>
                {order.paymentStatus === 'awaiting_payment' && order.paymentProvider === 'kkiapay' && currentStatus === 'pending' ? 'En attente de ton paiement' : (!order.driver && !isDelivered && !isCancelled && reached('confirmed') ? "Recherche d'un livreur disponible" : config.sub)}
              </div>
            </div>
            <span className={`w-status ${isDelivered ? 'ok' : isCancelled ? 'ko' : 'live'}`}>{order.id}</span>
          </div>

          {order.paymentStatus === 'awaiting_payment' && order.paymentProvider === 'kkiapay' && order.status === 'pending' && (
            <KkiapayPayCard key={order.id} order={order} userName={state?.user?.name} onPaid={(id) => setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentStatus: 'paid' } : o))} />
          )}
          {['awaiting_payment', 'claimed', 'rejected'].includes(order.paymentStatus) && order.paymentProvider === 'manual' && (
            <ManualPayCard order={order} onClaimed={(id) => setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentStatus: 'claimed' } : o))} />
          )}

          {/* Frise */}
          <div className="w-timeline" style={{ marginBottom: 18 }}>
            {steps.map((st, i) => {
              const Ico = st.icon;
              return (
                <div key={st.key} className={`w-step${st.done ? ' done' : ''}${i === nowIdx ? ' now' : ''}`}>
                  <span className="w-step-dot">{st.done ? (isCancelled ? <X size={16} strokeWidth={3} aria-hidden="true" /> : <Check size={16} strokeWidth={3} aria-hidden="true" />) : Ico ? <Ico size={16} aria-hidden="true" /> : null}</span>
                  <div>
                    <div className="w-step-title">{st.label}</div>
                    {st.sub && <div className="w-step-sub" style={{ whiteSpace: 'pre-line' }}>{st.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carte en direct : restaurant, point de livraison et livreur */}
          {!isDelivered && !isCancelled && (() => {
            const t = order.tracking;
            const restaurantPt = t?.restaurant?.lat != null ? { lat: t.restaurant.lat, lng: t.restaurant.lng } : null;
            const deliveryPt = t?.delivery?.lat != null ? { lat: t.delivery.lat, lng: t.delivery.lng } : (userPos?.lat != null ? { lat: userPos.lat, lng: userPos.lng } : null);
            const driverPt = liveDriverPos ? { lat: liveDriverPos.lat, lng: liveDriverPos.lng } : (t?.driver?.lat != null ? { lat: t.driver.lat, lng: t.driver.lng } : null);
            if (!restaurantPt && !deliveryPt && !driverPt) return null;
            const dist = km(driverPt, deliveryPt);
            const onTheWay = currentStatus === 'on_the_way';
            const pickupPt = onTheWay && t?.pickup?.lat != null ? { lat: t.pickup.lat, lng: t.pickup.lng } : null;
            const trail = onTheWay ? (t?.trail || []) : [];
            const traveled = onTheWay ? (t?.traveledKm || 0) + (driverPt && trail.length ? km({ lat: trail[trail.length - 1][0], lng: trail[trail.length - 1][1] }, driverPt) : 0) : 0;
            const progress = onTheWay && dist != null && traveled + dist > 0 ? Math.round(traveled / (traveled + dist) * 100) : null;
            const fmtD = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace('.', ',')} km`);
            const updatedAt = liveDriverPos?.timestamp || t?.driver?.updatedAt;
            const ageSec = updatedAt ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)) : null;
            return (
              <div style={{ marginBottom: 16 }}>
                <LiveMap restaurant={restaurantPt} delivery={deliveryPt} driver={driverPt} pickup={pickupPt} trail={trail} height={290} />
                {onTheWay && (
                  <div className="w-card" style={{ padding: '12px 14px', marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--gray)', marginBottom: 8 }}>
                      <span>Départ : le restaurant{t?.pickup?.at ? ` à ${new Date(t.pickup.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                      <span>Chez toi</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 8, background: '#EFE7E0', overflow: 'hidden' }}>
                      <div style={{ width: `${progress ?? 0}%`, height: '100%', borderRadius: 8, background: 'var(--bj-green, #4F8A68)', transition: 'width .8s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 8 }}>
                      <span><b>{fmtD(traveled)}</b> parcourus</span>
                      {dist != null && <span>reste <b>{fmtD(dist)}</b>, environ {Math.max(2, Math.round(dist / 20 * 60) + 2)} min</span>}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, fontSize: 12.5, color: 'var(--gray)' }}>
                  <span>
                    {onTheWay && driverPt ? 'Trajet du livreur depuis le restaurant'
                      : driverPt && dist == null
                      ? 'Ton livreur est en route.'
                      : driverPt
                      ? <>Livreur à <b style={{ color: 'var(--ink)' }}>{dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}</b> de toi{dist != null ? `, environ ${Math.max(2, Math.round(dist / 20 * 60) + 2)} min` : ''}{ageSec != null && ageSec > 60 ? ' (position non actualisée)' : ''}</>
                      : order.driver ? 'Le livreur va bientôt partager sa position.' : 'Le livreur apparaîtra sur la carte dès qu\'il est assigné.'}
                  </span>
                  {deliveryPt && driverPt && (
                    <a className="w-link" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }} href={directionsLink(deliveryPt, driverPt)} target="_blank" rel="noopener noreferrer">Google Maps</a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recapitulatif */}
          <div className="w-card" style={{ padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Ta commande</div>
            {(order.items || []).map((item, i) => (
              <div key={i} className="w-sum-row" style={{ padding: '3px 0', fontSize: 13 }}><span>{item.qty} x {item.name}</span><span>{fcfa(item.price * item.qty)}</span></div>
            ))}
            <div className="w-sum-row" style={{ fontSize: 13 }}><span>Livraison</span><span>{order.deliveryFee ? fcfa(order.deliveryFee) : 'Offerte'}</span></div>
            <div className="w-sum-row" style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 10, fontWeight: 700, color: 'var(--ink)' }}>
              <span>{order.paymentStatus === 'paid' ? 'Total payé' : order.paymentMethod === 'cash' ? 'À payer à la livraison' : 'Total à payer'}</span>
              <span style={{ color: 'var(--brand)' }}>{fcfa(order.total)}</span>
            </div>
          </div>

          {isDelivered && (
            <button className="w-row-card" style={{ marginBottom: 16, justifyContent: 'center' }} disabled={receiptLoading}
              onClick={async () => {
                setReceiptLoading(true);
                try { const { data } = await ordersAPI.receipt(order.id); setReceipt(data); setShowReceipt(true); }
                catch { setReceipt(null); }
                finally { setReceiptLoading(false); }
              }}>
              {receiptLoading ? <Spinner size={16} /> : <><span className="ico"><Receipt size={20} aria-hidden="true" /></span> Voir le reçu</>}
            </button>
          )}

          {isDelivered && !rated && (
            <div className="w-card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, textAlign: 'center' }}>Donne ton avis</div>
              <RatingRow label="Le plat" value={dishRating} onChange={setDishRating} />
              {order.driver && <RatingRow label="Le livreur" value={driverRating} onChange={setDriverRating} />}
              <RatingRow label="Le service WAYI" value={serviceRating} onChange={setServiceRating} last />
              {(dishRating > 0 || driverRating > 0 || serviceRating > 0) && (
                <button className="w-btn" onClick={submitRating} disabled={ratingLoading}>{ratingLoading ? <Spinner size={18} color="#fff" /> : 'Envoyer mon avis'}</button>
              )}
              {ratingError && <div className="w-error" style={{ marginTop: 10 }}>{ratingError}</div>}
            </div>
          )}
          {rated && (
            <div className="w-note" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><CheckCircle2 size={20} aria-hidden="true" /> Merci pour ton avis !</div>
          )}

          {/* Aide */}
          <div className="w-help" style={{ marginBottom: 14 }}>
            <Headphones size={30} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Besoin d'aide ?</div>
              <div style={{ fontSize: 12.5, color: 'var(--gray)' }}>{order.driver?.phone && !isDelivered ? 'Appelle ton livreur' : 'Pose ta question à Yivi'}</div>
            </div>
            {order.driver?.phone && !isDelivered
              ? <a className="w-help-call" href={`tel:${order.driver.phone}`} aria-label="Appeler le livreur"><Phone size={20} aria-hidden="true" /></a>
              : <button className="w-help-call" onClick={() => navigate('ai')} aria-label="Ouvrir Yivi"><ChefHat size={20} aria-hidden="true" /></button>}
          </div>

          {/* Le serveur n'autorise l'annulation que tant que le restaurant n'a pas repondu */}
          {currentStatus === 'pending' && (
            <button className="w-btn ghost" style={{ color: 'var(--danger)', borderColor: '#F6C9C3', marginBottom: 10 }} onClick={cancelOrder} disabled={cancelLoading}>
              {cancelLoading ? <Spinner size={16} color="var(--danger)" /> : 'Annuler la commande'}
            </button>
          )}
          {cancelError && <div className="w-error" style={{ marginBottom: 10 }}>{cancelError}</div>}
          {(allDelivered || isCancelled) && (
            <button className="w-btn" onClick={() => navigate('home')}>Commander à nouveau</button>
          )}
        </div>
      </div>

      {/* Modale du reçu */}
      {showReceipt && receipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowReceipt(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                Reçu
              </div>
              <button onClick={() => setShowReceipt(false)} style={{ background: 'var(--cream)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{receipt.receiptId}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 16 }}>{new Date(receipt.issuedAt).toLocaleString('fr', { dateStyle: 'long', timeStyle: 'short' })}</div>

            <div style={{ background: 'var(--cream)', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 14 }}>
              {receipt.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span>{item.name} x{item.qty}</span>
                  <span>{(item.price * item.qty).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--gray)' }}>Sous-total</span>
                <span>{receipt.subtotal.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                <span style={{ color: 'var(--gray)' }}>Livraison</span>
                <span>{receipt.deliveryFee.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span>Total</span>
                <span style={{ color: 'var(--emerald)' }}>{receipt.total.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>Paiement : {receipt.paymentMethod}</div>
            {receipt.paymentTransactionId && (
              <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Transaction : {receipt.paymentTransactionId}</div>
            )}
            {receipt.driverName && (
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>Livré par : {receipt.driverName}</div>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
