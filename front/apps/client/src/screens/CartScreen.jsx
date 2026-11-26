import { useState, useEffect, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import { MapPin, LocateFixed, Trash2, Plus, Check, Smartphone, CreditCard, Banknote, ShoppingCart, Bike, BadgePercent, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BottomNav, Spinner, launchConfetti } from '../components/UI';
import { DishImg, Qty, fcfa, MenuCard, toCartItem } from '../components/Wayi';
import AddressSheet from '../components/AddressSheet';
import { ordersAPI, paymentsAPI, authAPI, menuAPI } from '../api';

// Carte chargee seulement a l'etape livraison (Leaflet est lourd)
const PickLocationMap = lazy(() => import('../components/LiveMap').then(m => ({ default: m.PickLocationMap })));

const PAYMENT_METHODS = [
  { id: 'mtn_momo', label: 'MTN Mobile Money', Icon: Smartphone, logo: { text: 'MTN', bg: '#F5C400', color: '#1A1A1A' } },
  { id: 'moov', label: 'Moov Money', Icon: Smartphone, logo: { text: 'MOOV', bg: '#0A5BA8', color: '#fff' } },
  { id: 'card', label: 'Carte bancaire', Icon: CreditCard },
  { id: 'cash', label: 'Espèces à la livraison', Icon: Banknote },
];

const DELIVERY_FEE_ESTIMATE = 300; // par restaurant, estimation avant confirmation serveur (75 FCFA par km)
const MAX_FEE_PER_RESTAURANT = 3500; // au-dela, le point de livraison est forcement hors zone

export default function CartScreen() {
  const { state, dispatch, navigate, cartTotal, cartByRestaurant } = useApp();
  const [payMethod, setPayMethod] = useState(state.checkoutPreset?.paymentMethod || 'mtn_momo');
  // Le choix fait avec Yivi ne sert qu'une fois
  useEffect(() => { if (state.checkoutPreset) dispatch({ type: 'SET_CHECKOUT_PRESET', payload: null }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Etape 1 : panier ; etape 2 : adresse et paiement (directe si on vient de Yivi)
  const [step, setStep] = useState(state.checkoutPreset ? 'checkout' : 'cart');
  const [momoPhone, setMomoPhone] = useState(state.user?.phone || '');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [paymentError, setPaymentError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showAddressPicker, setShowAddressPicker] = useState(false);
  // 'live' = vrai paiement, 'test' = simulation sans argent, 'off' = seulement cash, null = inconnu
  const [payMode, setPayMode] = useState(null);
  const [payNumbers, setPayNumbers] = useState({});

  useEffect(() => {
    let alive = true;
    paymentsAPI.methods()
      .then(({ data }) => {
        if (!alive) return;
        setPayMode(data.mode);
        if (data.mode === 'off') setPayMethod('cash');
        if (data.mode === 'manual') setPayNumbers(Object.fromEntries(data.methods.filter(m => m.payTo).map(m => [m.id, m.payTo])));
      })
      .catch(() => {}); // si ça échoue, le serveur répondra clairement à la commande
    return () => { alive = false; };
  }, []);
  const onlineOff = payMode === 'off';
  const manual = payMode === 'manual';
  const viaKkiapay = payMode === 'kkiapay';

  const cart = state.cart;
  const [ideas, setIdeas] = useState([]);
  useEffect(() => {
    if (state.cart.length) return;
    menuAPI.get({}).then(r => setIdeas((r.data?.dishes || []).filter(d => d.image).slice(0, 4))).catch(() => {});
  }, [state.cart.length]);
  const user = state.user;
  const restaurantCount = cartByRestaurant.length;
  const defaultAddress = user?.addresses?.find(a => a.isDefault) || user?.addresses?.[0];

  // Point de livraison de CETTE commande : le client peut etre ailleurs aujourd'hui.
  // Repart du point enregistre de l'adresse, modifiable par GPS ou sur la carte.
  const savedPos = defaultAddress?.hasPosition && defaultAddress?.lat != null ? { lat: defaultAddress.lat, lng: defaultAddress.lng } : null;
  const [orderPos, setOrderPos] = useState(savedPos);
  const [posSource, setPosSource] = useState(savedPos ? 'saved' : null);
  const [orderLandmark, setOrderLandmark] = useState(defaultAddress?.landmark || '');
  const [savePoint, setSavePoint] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  useEffect(() => {
    setOrderPos(savedPos); setPosSource(savedPos ? 'saved' : null);
    setOrderLandmark(defaultAddress?.landmark || ''); setSavePoint(false); setLocError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress?.id]);
  const pickOnMap = (p) => { setOrderPos(p); setPosSource('map'); setLocError(''); };
  const locateMe = () => {
    if (!navigator.geolocation) { setLocError("La position n'est pas disponible sur cet appareil : touche la carte à l'endroit de livraison."); return; }
    setLocating(true); setLocError('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setOrderPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setPosSource('gps'); setLocating(false); },
      () => { setLocating(false); setLocError("Position refusée : autorise la localisation, ou touche la carte à l'endroit de livraison."); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // Frais exacts calcules par le serveur (memes regles que la commande) ; estimation en attendant
  const [quote, setQuote] = useState(null);
  const cartKey = cart.map(c => `${c.id}:${c.qty}`).join('|');
  useEffect(() => {
    if (!cart.length) { setQuote(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      ordersAPI.quote(cart.map(c => ({ dishId: c.id, qty: c.qty })), orderPos)
        .then(({ data }) => { if (alive) setQuote({ ...data, key: cartKey }); })
        .catch(() => { if (alive) setQuote(null); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [cartKey, orderPos?.lat, orderPos?.lng, defaultAddress?.id, user?.subscription?.active]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = quote && quote.key === cartKey;
  // Point de livraison trop loin (ex : telephone a l'etranger) : jamais de frais absurdes,
  // a l'etape panier comme a l'etape paiement. Garde-fou si le serveur ne le signale pas.
  const absurdFee = exact && !quote.outOfZone && Number(quote.deliveryFee) > restaurantCount * MAX_FEE_PER_RESTAURANT;
  const outOfZone = exact && (quote.outOfZone || absurdFee)
    ? (quote.outOfZoneMessage || "Ta position actuelle est hors de la zone de livraison (Cotonou, Calavi et environs). Choisis le point de livraison sur la carte à l'étape suivante.")
    : '';
  const estimatedDeliveryFee = outOfZone ? 0 : exact ? quote.deliveryFee : restaurantCount * DELIVERY_FEE_ESTIMATE;
  const discount = exact && !outOfZone ? (quote.discount || 0) : 0;
  const total = cartTotal + estimatedDeliveryFee - discount;

  const validatePaymentDetails = (payMethod) => {
    if (payMethod === 'mtn_momo' || payMethod === 'moov') {
      if (!momoPhone || momoPhone.replace(/\D/g, '').length < 8) {
        setPaymentError('Entre un numéro Mobile Money valide.');
        return false;
      }
    }
    if (payMethod === 'card' && payMode === 'test') {
      const digits = card.number.replace(/\D/g, '');
      if (digits.length < 12) { setPaymentError('Numéro de carte invalide.'); return false; }
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) { setPaymentError("Date d'expiration invalide (MM/AA)."); return false; }
      if (card.cvv.length < 3) { setPaymentError('CVV invalide.'); return false; }
    }
    setPaymentError('');
    return true;
  };

  const fail = (msg) => { setError(msg); toast.error(msg, { duration: 5000 }); };

  const placeOrder = async () => {
    if (!cart.length || loading) return;
    if (!defaultAddress) {
      fail('Ajoute ton adresse de livraison pour commander.');
      setShowAddressPicker(true);
      return;
    }
    if (!orderPos) {
      fail("Indique où te livrer : utilise ta position actuelle ou touche la carte.");
      return;
    }
    if (outOfZone) { fail(outOfZone); return; }
    const method = onlineOff ? 'cash' : payMethod;
    if (method !== payMethod) setPayMethod(method);
    if (!validatePaymentDetails(method)) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        items: cart.map(c => ({ dishId: c.id, qty: c.qty })),
        address: defaultAddress.address || 'Adresse par défaut',
        landmark: orderLandmark.trim(),
        mapsLink: `https://www.google.com/maps?q=${orderPos.lat.toFixed(6)},${orderPos.lng.toFixed(6)}`,
        paymentMethod: method,
        lat: orderPos.lat,
        lng: orderPos.lng,
      };

      // Le client a demande a garder ce point pour son adresse
      if (savePoint && posSource !== 'saved') {
        try {
          const { data } = await authAPI.setAddressPosition(defaultAddress.id, orderPos.lat, orderPos.lng);
          dispatch({ type: 'SET_USER', payload: data.user });
        } catch { /* la commande part quand meme avec ce point */ }
      }

      let createdOrders;
      try {
        const { data } = await ordersAPI.create(payload);
        createdOrders = data.orders;
      } catch (err) {
        const status = err.response?.status;
        fail(
          err.response?.data?.error ||
          (status === 401 ? 'Ta session a expiré : reconnecte-toi puis réessaie.'
            : "Impossible de passer la commande. Vérifie ta connexion et réessaie.")
        );
        return; // le panier reste intact, rien n'a été créé côté serveur
      }

      // Paiement en ligne : une demande par commande. Le cash est encaissé par le livreur.
      if (method !== 'cash') {
        const paymentPayload = method === 'card'
          ? { cardLast4: card.number.replace(/\D/g, '').slice(-4) }
          : { phone: momoPhone };
        const results = await Promise.allSettled(createdOrders.map(o =>
          paymentsAPI.initiate({ orderId: o.id, method, amount: o.total, ...paymentPayload })
        ));
        // Paiement manuel : on récupère le numéro WAYI à afficher dans le suivi
        createdOrders = createdOrders.map((o, i) => {
          const v = results[i].status === 'fulfilled' ? results[i].value.data : null;
          if (v?.widget) return { ...o, paymentStatus: 'awaiting_payment', paymentProvider: 'kkiapay', paymentMethod: method, paymentFromPhone: momoPhone };
          return v?.manual ? { ...o, paymentStatus: 'awaiting_payment', paymentProvider: 'manual', paymentTo: v.payTo, paymentPayee: v.payee, paymentPayeeName: v.payeeName, paymentMethod: method } : o;
        });
        const failed = results
          .map((r, i) => ({ r, order: createdOrders[i] }))
          .filter(x => x.r.status === 'rejected');
        if (failed.length) {
          // Le paiement n'a pas démarré : on annule ces commandes (elles sont encore "en attente")
          // pour ne pas laisser au restaurant une commande jamais payée.
          await Promise.allSettled(failed.map(x => ordersAPI.cancel(x.order.id)));
          const reason = failed[0].r.reason?.response?.data?.error;
          fail((reason || "Le paiement n'a pas pu être lancé.") + ' Ta commande n\'a pas été envoyée : réessaie ou choisis « Cash ».');
          if (failed.length === createdOrders.length) return; // panier conservé
          createdOrders = createdOrders.filter(o => !failed.some(x => x.order.id === o.id));
        }
      }

      dispatch({ type: 'SET_ACTIVE_ORDERS', payload: createdOrders });
      dispatch({ type: 'CART_CLEAR' });
      toast.success(
        method === 'cash'
          ? 'Commande envoyée au restaurant. Tu paies en espèces à la livraison.'
          : viaKkiapay
            ? 'Commande enregistrée. Règle maintenant le paiement pour qu\'elle parte au restaurant.'
          : manual
            ? 'Commande enregistrée. Envoie maintenant ton paiement pour qu\'elle soit préparée.'
          : payMode === 'test'
            ? 'Commande envoyée. Paiement de test enregistré : aucun argent prélevé.'
            : 'Commande envoyée. Valide le paiement sur ton téléphone si on te le demande.',
        { duration: 5000 }
      );
      launchConfetti();
      navigate('track');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="screen">
        <StatusBar />
        <div className="w-scroll" style={{ paddingBottom: 110 }}>
          <div className="ct-hero">
            <h1>Mon panier</h1>
            <p>Il est encore vide.</p>
          </div>
          <div className="w-pad">
            <div className="ct-empty">
              <span className="ct-empty-ico"><ShoppingCart size={34} strokeWidth={1.8} aria-hidden="true" /></span>
              <strong>Ton panier attend ses premiers plats</strong>
              <small>Choisis dans le menu du jour, ou laisse Yivi te proposer le plat qu'il te faut.</small>
              <div className="ct-empty-actions">
                <button className="w-btn" onClick={() => navigate('home')}>Voir le menu du jour</button>
                <button className="ct-ghost" onClick={() => navigate('ai')}>Demander à Yivi</button>
              </div>
            </div>
            {ideas.length > 0 && (
              <>
                <div className="w-section-head" style={{ marginTop: 22 }}><span className="w-section-title">Envie d'une idée ?</span></div>
                <div className="w-grid">
                  {ideas.map(d => <MenuCard key={d.id} dish={d} onOpen={(x) => { dispatch({ type: 'SET_ACTIVE_DISH', payload: x }); navigate('dish'); }} onAdd={(x) => dispatch({ type: 'CART_ADD', payload: { item: toCartItem(x) } })} />)}
                </div>
              </>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const summary = (
    <div style={{ marginTop: 8 }}>
      <div className="w-sum-row"><span>Sous-total</span><span>{fcfa(cartTotal)}</span></div>
      <div className="w-sum-row">
        <span>Livraison{restaurantCount > 1 ? ` (${restaurantCount} livraisons)` : ''}</span>
        <span>{outOfZone ? 'Hors zone' : exact ? (estimatedDeliveryFee ? fcfa(estimatedDeliveryFee) : 'Offerte') : `env. ${fcfa(estimatedDeliveryFee)}`}</span>
      </div>
      {discount > 0 && (
        <div className="w-sum-row" style={{ color: '#1E9E5A', fontWeight: 700 }}>
          <span>Réduction {quote.promoCode} ({quote.promoLabel || 'première commande'})</span><span>- {fcfa(discount)}</span>
        </div>
      )}
      <div className="w-sum-total"><span>{exact && !outOfZone ? 'Total' : 'Total estimé'}</span><span>{fcfa(total)}</span></div>
      {outOfZone && step === 'cart' && <p className="w-hint" style={{ marginTop: 8, fontSize: 12.5, color: '#8A909C' }}>Ta position actuelle est hors zone. Tu choisiras le point de livraison à l'étape suivante, les frais seront calculés à ce moment.</p>}
    </div>
  );

  // ── Etape 1 : panier ───────────────────────────────────────
  if (step === 'cart') {
    const count = cart.reduce((n, i) => n + i.qty, 0);
    return (
      <div className="screen">
        <StatusBar />
        <div className="w-scroll" style={{ paddingBottom: 250 }}>
          <div className="ct-hero">
            <div className="ct-hero-row">
              <div>
                <h1>Mon panier</h1>
                <p>{count} plat{count > 1 ? 's' : ''}{restaurantCount > 1 ? ` · ${restaurantCount} livraisons` : ''}</p>
              </div>
              <button className="ct-clear" onClick={() => { if (window.confirm('Vider le panier ?')) dispatch({ type: 'CART_CLEAR' }); }} aria-label="Vider le panier">
                <Trash2 size={18} aria-hidden="true" /> Vider
              </button>
            </div>
          </div>

          <div className="w-pad ct-body">
            {restaurantCount > 1 && (
              <div className="ct-note"><Bike size={16} aria-hidden="true" /> Ta commande part en {restaurantCount} livraisons séparées, chacune avec son livreur.</div>
            )}

            {cartByRestaurant.map((group, gi) => (
              <div key={group.restaurantId} className="ct-group">
                <div className="ct-group-head">
                  <span className="ct-group-ico"><Bike size={18} aria-hidden="true" /></span>
                  <div>
                    {restaurantCount > 1 && <strong>Livraison {gi + 1}</strong>}
                    <small>{group.items.reduce((n, i) => n + i.qty, 0)} plat{group.items.reduce((n, i) => n + i.qty, 0) > 1 ? 's' : ''}</small>
                  </div>
                </div>
                {group.items.map(item => (
                  <div key={item.id} className="ct-item">
                    <DishImg src={item.image} iconSize={22} />
                    <div className="ct-item-info">
                      <div className="ct-item-name">{item.name}</div>
                      <div className="ct-item-unit">{fcfa(item.price)} l'unité</div>
                      <div className="ct-item-price">{fcfa(item.price * item.qty)}</div>
                    </div>
                    <Qty small value={item.qty}
                      onMinus={() => dispatch({ type: 'CART_REMOVE', payload: item.id })}
                      onPlus={() => dispatch({ type: 'CART_ADD', payload: { item } })} />
                  </div>
                ))}
              </div>
            ))}

            <button className="ct-more" onClick={() => navigate('home')}><Plus size={16} aria-hidden="true" /> Ajouter d'autres plats</button>

            <div className="ct-perks">
              <span><Bike size={16} aria-hidden="true" /> Livraison au kilomètre</span>
              <span><ShieldCheck size={16} aria-hidden="true" /> Restaurants vérifiés</span>
              {discount > 0 && <span className="on"><BadgePercent size={16} aria-hidden="true" /> {quote.promoCode} appliqué</span>}
            </div>

            <div className="ct-summary">{summary}</div>
          </div>
        </div>

        <div className="w-sheet-bottom ct-bottom">
          <button className="w-btn ct-cta" onClick={() => setStep('checkout')}>
            <span>Passer la commande</span><span className="ct-cta-total">{fcfa(total)}</span>
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Etape 2 : adresse et paiement ─────────────────────────
  return (
    <div className="screen">
      <StatusBar />
      <div className="w-topbar">
        <button className="ct-back" onClick={() => setStep('cart')}>Retour</button>
        <div className="w-topbar-title">Livraison et paiement</div>
        <span style={{ width: 40 }} />
      </div>

      <div className="w-scroll" style={{ paddingBottom: 250 }}>
        <div className="w-pad">
          <div className="w-section-title" style={{ fontSize: 16, margin: '4px 0 10px' }}>Adresse de livraison</div>
          <button className="w-row-card" onClick={() => setShowAddressPicker(true)}>
            <span className="ico"><MapPin size={24} aria-hidden="true" /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{defaultAddress ? (defaultAddress.label || 'Mon adresse') : 'Ajouter mon adresse'}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--gray)', marginTop: 2 }}>{defaultAddress?.address || 'Adresse, repère et position Google Maps'}</span>
              {defaultAddress?.landmark && <span style={{ display: 'block', fontSize: 12, color: 'var(--gray)' }}>Repère : {defaultAddress.landmark}</span>}
            </span>
          </button>
          <button className="w-link" style={{ margin: '10px auto 0', display: 'flex' }} onClick={() => setShowAddressPicker(true)}>
            <Plus size={16} aria-hidden="true" /> Changer ou ajouter une adresse
          </button>

          {defaultAddress && (
            <>
              <div className="w-section-title" style={{ fontSize: 16, margin: '22px 0 6px' }}>Où te livrer cette fois ?</div>
              <div style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 10, lineHeight: 1.45 }}>
                {posSource === 'saved' ? `Point enregistré pour ${defaultAddress.label || 'ton adresse'}. Tu es ailleurs aujourd'hui ? Utilise ta position ou déplace l'épingle.`
                  : posSource === 'gps' ? "Ta position actuelle est utilisée pour cette commande. Ajuste l'épingle si besoin."
                  : posSource === 'map' ? 'Point choisi sur la carte pour cette commande.'
                  : "Touche la carte à l'endroit exact où le livreur doit venir, ou utilise ta position actuelle."}
              </div>
              <Suspense fallback={<div style={{ height: 210, borderRadius: 18, background: '#EEE8E2' }} />}>
                <PickLocationMap key={defaultAddress.id} value={orderPos} onChange={pickOnMap} height={210} />
              </Suspense>
              <button className="w-btn ghost" style={{ marginTop: 10, padding: '12px 16px', fontSize: 14 }} onClick={locateMe} disabled={locating}>
                {locating ? <Spinner size={16} /> : <LocateFixed size={18} aria-hidden="true" />} Utiliser ma position actuelle
              </button>
              {locError && <div className="w-error" style={{ marginTop: 8 }}>{locError}</div>}
              {outOfZone && <div className="w-error" style={{ marginTop: 8 }}>{outOfZone}</div>}
              <label className="w-field-label" style={{ marginTop: 14 }}>Repère pour le livreur (facultatif)</label>
              <input value={orderLandmark} onChange={e => setOrderLandmark(e.target.value)} placeholder="Ex : portail bleu, en face de la pharmacie" maxLength={200} />
              {orderPos && posSource !== 'saved' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={savePoint} onChange={e => setSavePoint(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
                  Garder ce point pour « {defaultAddress.label || 'mon adresse'} »
                </label>
              )}
            </>
          )}

          <div className="w-section-title" style={{ fontSize: 16, margin: '22px 0 10px' }}>Moyen de paiement</div>
          {payMode === 'test' && <div className="w-warn" style={{ marginBottom: 10 }}>Mode test : le paiement en ligne est simulé, aucun argent n'est prélevé.</div>}
          <div className="w-pay-list">
            {PAYMENT_METHODS.map(m => {
              const locked = (onlineOff && m.id !== 'cash') || (payMode === 'manual' && m.id === 'card');
              const on = payMethod === m.id;
              return (
                <button key={m.id} className="w-pay" disabled={locked} onClick={() => { setPayMethod(m.id); setPaymentError(''); }}>
                  <span className={`w-radio${on ? ' on' : ''}`}>{on && <Check size={13} strokeWidth={3.2} aria-hidden="true" />}</span>
                  <span style={{ flex: 1 }}>
                    {m.label}
                    {locked && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray)' }}>Bientôt disponible</span>}
                  </span>
                  {m.logo
                    ? <span className="w-pay-logos"><span style={{ background: m.logo.bg, color: m.logo.color }}>{m.logo.text}</span></span>
                    : <m.Icon size={20} color="#9A8F88" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {(!onlineOff && (payMethod === 'mtn_momo' || payMethod === 'moov')) && (
            <div style={{ marginTop: 14 }}>
              <label className="w-field-label">Numéro {payMethod === 'mtn_momo' ? 'MTN MoMo' : 'Moov Money'}</label>
              <input value={momoPhone} onChange={e => { setMomoPhone(e.target.value); setPaymentError(''); }} placeholder="+229 XX XX XX XX" type="tel" />
              {viaKkiapay && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8, lineHeight: 1.45 }}>Après la confirmation, une fenêtre de paiement sécurisée s'ouvre pour valider sur ton téléphone.</div>}
              {manual && payNumbers[payMethod] && (
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8, lineHeight: 1.45 }}>
                  Tu enverras ensuite le montant par {payMethod === 'mtn_momo' ? 'MTN MoMo' : 'Moov Money'} au numéro affiché{restaurantCount > 1 ? ', un paiement par livraison' : ''}. La commande est préparée dès que la réception est confirmée.
                </div>
              )}
            </div>
          )}

          {(payMode === 'test' && payMethod === 'card') && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="w-field-label">Numéro de carte</label>
                <input value={card.number} onChange={e => { setCard(c => ({ ...c, number: e.target.value })); setPaymentError(''); }} placeholder="1234 5678 9012 3456" inputMode="numeric" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="w-field-label">Expiration</label>
                  <input value={card.expiry} onChange={e => { setCard(c => ({ ...c, expiry: e.target.value })); setPaymentError(''); }} placeholder="MM/AA" />
                </div>
                <div style={{ width: 100 }}>
                  <label className="w-field-label">CVV</label>
                  <input value={card.cvv} onChange={e => { setCard(c => ({ ...c, cvv: e.target.value })); setPaymentError(''); }} placeholder="123" inputMode="numeric" maxLength={4} />
                </div>
              </div>
            </div>
          )}
          {paymentError && <div className="w-error" style={{ marginTop: 10 }}>{paymentError}</div>}

          <div className="w-card" style={{ padding: '6px 16px 14px', marginTop: 20 }}>{summary}</div>
        </div>
      </div>

      <div className="w-sheet-bottom">
        {error && <div className="w-error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="w-btn" onClick={placeOrder} disabled={loading || !!outOfZone}>
          {loading ? <Spinner size={20} color="#fff" /> : <>Confirmer la commande · {fcfa(total)}</>}
        </button>
      </div>

      <AddressSheet open={showAddressPicker} onClose={() => setShowAddressPicker(false)} />
      <BottomNav />
    </div>
  );
}
