import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Smartphone, Wallet, Banknote, CreditCard, Check, ShieldCheck, Copy, Phone, MessageCircle, Star, Bike, PackageCheck, CircleCheck, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { Photo, Stars, fcfa, errMsg, dayLabel } from './shared';

const PAY_STYLE = {
  mtn: { Icon: Smartphone, bg: '#FFCC00', fg: '#1E1916' },
  moov: { Icon: Wallet, bg: '#0A5CB8', fg: '#fff' },
  celtiis: { Icon: CreditCard, bg: '#E0322B', fg: '#fff' },
  cash: { Icon: Banknote, bg: '#E6F4EC', fg: '#1F7A55' },
};

export function ModeCheckoutScreen() {
  const { state, navigate, dispatch } = useApp();
  const id = state.modeCtx.listingId;
  const size = state.modeCtx.size || undefined;
  const [l, setL] = useState(null);
  const [meta, setMeta] = useState(null);
  const addr = state.user?.addresses?.find(a => a.isDefault) || state.user?.addresses?.[0];
  const [address, setAddress] = useState(addr ? [addr.label, addr.details || addr.landmark].filter(Boolean).join(', ') : (state.user?.city || ''));
  const [method, setMethod] = useState('mtn');
  const [phone, setPhone] = useState(state.user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    modeAPI.listing(id).then(({ data }) => setL(data.listing)).catch(() => setError("Cet article n'est plus disponible."));
    modeAPI.meta().then(({ data }) => setMeta(data)).catch(() => {});
  }, [id]);

  const pay = async () => {
    if (address.trim().length < 3) { setError('Indique ton adresse de livraison.'); return; }
    if (method !== 'cash' && phone.replace(/\D/g, '').length < 8) { setError('Indique ton numéro Mobile Money.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await modeAPI.order({ listingId: id, method, phone, size, address: { label: address } });
      dispatch({ type: 'MODE_CTX', payload: { orderId: data.order.id } });
      toast('Commande enregistrée');
      navigate('mode-order');
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const total = l ? l.price + l.deliveryFee : 0;
  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll" style={{ paddingBottom: 130 }}>
        <div className="w-pad">
          <div className="md-bar"><BackBtn /><h1 className="md-title">Paiement et livraison</h1></div>
          {l && (
            <div className="md-sum-item">
              <Photo src={l.photos[0]} className="md-sum-photo" iconSize={24} />
              <span><b>{l.title}, {size || l.size}</b><small>{l.seller.name} · {l.city}</small><strong>{fcfa(l.price)}</strong></span>
            </div>
          )}

          <h3 className="md-h3">Adresse de livraison</h3>
          <label className="md-field-ico">
            <MapPin size={18} aria-hidden="true" />
            <input value={address} onChange={e => { setAddress(e.target.value); setError(''); }} placeholder="Quartier, repère, ville" />
          </label>

          <h3 className="md-h3">Mode de paiement</h3>
          <div className="md-pay">
            {(meta?.payments || []).map(p => {
              const s = PAY_STYLE[p.id] || PAY_STYLE.cash;
              return (
                <button key={p.id} className={method === p.id ? 'on' : ''} onClick={() => { setMethod(p.id); setError(''); }}>
                  <span className="md-pay-ico" style={{ background: s.bg, color: s.fg }}><s.Icon size={18} aria-hidden="true" /></span>
                  <b>{p.label}</b>
                  <span className="md-radio">{method === p.id && <Check size={13} strokeWidth={3} aria-hidden="true" />}</span>
                </button>
              );
            })}
          </div>
          {method !== 'cash' && (
            <>
              <label className="md-label">Numéro {meta?.payments.find(p => p.id === method)?.label}</label>
              <input className="md-input" type="tel" value={phone} onChange={e => { setPhone(e.target.value); setError(''); }} placeholder="+229 01 97 00 00 00" />
            </>
          )}

          <div className="md-bill">
            <div><span>Article</span><b>{fcfa(l?.price)}</b></div>
            <div><span>Livraison</span><b>{fcfa(l?.deliveryFee)}</b></div>
            <div className="total"><span>Total</span><b>{fcfa(total)}</b></div>
          </div>
          <div className="md-safe">
            <ShieldCheck size={22} aria-hidden="true" />
            <p>Ton paiement est gardé par WAYI et versé au vendeur seulement après la livraison.</p>
          </div>
          {error && <div className="md-note warn" role="alert">{error}</div>}
        </div>
      </div>
      <div className="md-actions">
        <button className="md-btn wide big" disabled={!l || busy || l?.status !== 'active'} onClick={pay}>
          {busy ? 'Envoi...' : method === 'cash' ? `Commander, ${fcfa(total)} à la livraison` : `Payer ${fcfa(total)}`}
        </button>
      </div>
    </div>
  );
}

const STEP_ICONS = [CircleCheck, PackageCheck, Truck, Check];

export function ModeOrderScreen() {
  const { state, navigate, dispatch } = useApp();
  const id = state.modeCtx.orderId;
  const [o, setO] = useState(null);
  const [steps, setSteps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const load = () => modeAPI.orderOne(id).then(({ data }) => setO(data.order)).catch(() => {});
  useEffect(() => {
    load();
    modeAPI.meta().then(({ data }) => setSteps(data.steps || [])).catch(() => {});
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);

  const act = async (status, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try { const { data } = await modeAPI.orderStatus(id, status); setO(data.order); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true);
    try { await modeAPI.review(id, rating, comment); toast('Merci pour ton avis !'); load(); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  const write = async () => {
    try {
      const { data } = await modeAPI.conversations();
      const c = data.conversations.find(x => x.listingId === o.listing.id && x.role === o.role);
      if (c) { dispatch({ type: 'MODE_CTX', payload: { convId: c.id } }); navigate('mode-chat'); }
      else navigate('mode-inbox');
    } catch { navigate('mode-inbox'); }
  };

  if (!o) return <div className="screen md-screen"><StatusBar /><div className="w-pad"><div className="w-skel" style={{ height: 320, borderRadius: 24, marginTop: 20 }} /></div></div>;

  const seller = o.role === 'seller';
  const cancelled = o.status === 'cancelled';
  const cur = Math.max(0, steps.findIndex(s => s.id === o.status));
  const waitingPay = o.status === 'awaiting_payment';
  const headline = cancelled ? 'Commande annulée'
    : waitingPay ? 'Paiement à envoyer'
    : o.status === 'delivered' ? (seller ? 'Vente terminée' : 'Article livré')
    : seller ? (o.status === 'confirmed' ? "Prépare l'article pour le livreur" : 'Article en livraison')
    : o.status === 'confirmed' ? 'Le vendeur prépare ton article' : 'Ton article est en route';

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-bar"><BackBtn onBack={() => { dispatch({ type: 'MODE_CTX', payload: { listTab: seller ? 'sales' : 'purchases' } }); navigate('mode-list'); }} /><h1 className="md-title">Suivi de commande</h1></div>

          <div className={`md-track${cancelled ? ' off' : ''}`}>
            <span className="md-track-ico">{cancelled ? <Package2 /> : <Bike size={30} strokeWidth={1.8} aria-hidden="true" />}</span>
            <b>{headline}</b>
            <small>Commande {o.number} · {dayLabel(o.createdAt)}</small>
            {!cancelled && (
              <div className="md-steps">
                {steps.map((s, i) => {
                  const Icon = STEP_ICONS[i] || Check;
                  const done = !waitingPay && i <= cur;
                  return (
                    <div key={s.id} className={`md-step${done ? ' done' : ''}${!waitingPay && i === cur ? ' cur' : ''}`}>
                      <span><Icon size={15} strokeWidth={2.4} aria-hidden="true" /></span>
                      <small>{s.label}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {waitingPay && !seller && (
            <div className="md-paybox">
              <b>Envoie {fcfa(o.total)} par {o.methodLabel}</b>
              {o.payTo ? (
                <>
                  <p>Au numéro WAYI ci-dessous. Ta commande est confirmée dès la réception du paiement.</p>
                  <button className="md-copy" onClick={() => { navigator.clipboard?.writeText(o.payTo); toast('Numéro copié'); }}>
                    <Phone size={16} aria-hidden="true" /> {o.payTo} <Copy size={15} aria-hidden="true" />
                  </button>
                </>
              ) : <p>WAYI te contacte pour finaliser le paiement. Ta commande est confirmée dès la réception.</p>}
            </div>
          )}
          {waitingPay && seller && <div className="md-note">L'acheteur doit encore payer. Tu seras prévenu ici dès que WAYI confirme le paiement.</div>}

          <div className="md-sum-item">
            <Photo src={o.listing.photo} className="md-sum-photo" iconSize={24} />
            <span><b>{o.listing.title}{o.listing.size ? `, ${o.listing.size}` : ''}</b><small>{seller ? `Acheteur : ${o.counterpart.name}` : `Vendeur : ${o.counterpart.name}`}</small><strong>{fcfa(o.price)}</strong></span>
          </div>

          <div className="md-bill">
            {seller ? (
              <>
                <div><span>Prix de vente</span><b>{fcfa(o.price)}</b></div>
                <div><span>Commission WAYI{o.launchOffer ? ' (offre de lancement)' : ''}</span><b>{o.commission ? `- ${fcfa(o.commission)}` : 'Offerte'}</b></div>
                <div className="total"><span>Tu reçois</span><b>{fcfa(o.sellerAmount)}</b></div>
              </>
            ) : (
              <>
                <div><span>Article</span><b>{fcfa(o.price)}</b></div>
                <div><span>Livraison</span><b>{fcfa(o.deliveryFee)}</b></div>
                <div className="total"><span>Total · {o.methodLabel}</span><b>{fcfa(o.total)}</b></div>
              </>
            )}
          </div>
          <div className="md-rows">
            <div><span>Livraison</span><b>{o.address?.label}</b></div>
            {seller && o.counterpart.phone && <div><span>Téléphone</span><b>{o.counterpart.phone}</b></div>}
            <div><span>Paiement</span><b>{o.paymentStatus === 'paid' ? 'Reçu par WAYI' : o.method === 'cash' ? 'À la livraison' : 'En attente'}</b></div>
          </div>

          <div className="md-stack">
            {seller && o.status === 'confirmed' && <button className="md-btn wide big" disabled={busy} onClick={() => act('handed', "Confirmes-tu avoir remis l'article au livreur ?")}>J'ai remis l'article au livreur</button>}
            {!seller && ['handed', 'on_the_way'].includes(o.status) && <button className="md-btn wide big" disabled={busy} onClick={() => act('delivered', "Confirmes-tu avoir reçu l'article ?")}>J'ai reçu l'article</button>}
            {!cancelled && o.status !== 'delivered' && <button className="md-btn ghost wide" onClick={write}><MessageCircle size={16} aria-hidden="true" /> Écrire {seller ? "à l'acheteur" : 'au vendeur'}</button>}
            {['awaiting_payment', 'confirmed'].includes(o.status) && <button className="md-btn ghost danger wide" disabled={busy} onClick={() => act('cancelled', 'Annuler cette commande ?')}>Annuler la commande</button>}
          </div>

          {!seller && o.status === 'delivered' && !o.reviewed && (
            <div className="md-review">
              <b>Note le vendeur</b>
              <div className="md-review-stars">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`} className={n <= rating ? 'on' : ''}>
                    <Star size={30} fill={n <= rating ? 'currentColor' : 'none'} strokeWidth={1.6} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <textarea className="md-input" rows={3} placeholder="Ton avis (facultatif)" value={comment} onChange={e => setComment(e.target.value)} />
              <button className="md-btn wide" disabled={!rating || busy} onClick={review}>Publier mon avis</button>
            </div>
          )}
          {!seller && o.reviewed && <div className="md-note ok"><Check size={15} aria-hidden="true" /> Merci, ton avis a été publié.</div>}
        </div>
      </div>
    </div>
  );
}

function Package2() { return <PackageCheck size={30} strokeWidth={1.8} aria-hidden="true" />; }
