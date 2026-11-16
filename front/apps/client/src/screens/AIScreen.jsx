import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, ShoppingBag, MapPin, Bike, ChevronRight, RotateCcw, Sparkles, Sun, Soup, Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { aiAPI } from '../api';
import { toCartItem, MenuCard } from '../components/Wayi';

const STARTERS = [
  { Icon: Sun, text: 'Un truc léger pour ce midi' },
  { Icon: Soup, text: 'Un plat local pas trop épicé' },
  { Icon: Wand2, text: 'Surprends-moi' },
  { Icon: Bike, text: 'Où en est ma commande ?' },
];

// Etapes affichees pendant que Yivi travaille (adaptees a la demande)
function thinkingSteps(text) {
  const t = (text || '').toLowerCase();
  if (/command|valide|payer|cash|esp[eè]ce|momo|moov|carte/.test(t)) return ['Je vérifie ton panier', 'Je calcule les frais de livraison', 'Je prépare le récapitulatif'];
  if (/suivi|où en est|ou en est|livreur|arrive/.test(t)) return ['Je retrouve tes commandes', 'Je regarde où en est la livraison'];
  if (/\b(ajoute|je prends|je le prends|retire|enl[eè]ve|panier)\b/.test(t) || /^(le|la) (premier|deuxi[eè]me|dernier)/.test(t)) return ['Je mets à jour ton panier', 'Je recalcule le total'];
  return ['Je lis ta demande', 'Je parcours le menu du jour', 'Je compare avec tes goûts', 'Je choisis le meilleur pour toi'];
}

// Reponses rapides selon l'etape de la conversation
function quickReplies(m) {
  if (!m || m.role !== 'assistant') return [];
  if (m.awaiting === 'payment_method') return ['En espèces à la livraison', 'Par MTN MoMo', 'Par Moov Money', 'Par carte'];
  if (m.awaiting === 'confirm_order') return ['On commande', 'Ajoute une boisson', 'Mon panier'];
  if (m.awaiting === 'remove_demo') return ['Oui, retire-les', 'Non'];
  if (m.recommendations?.length > 1) return ['Je prends le premier', 'Je prends le deuxième', 'Autre chose'];
  if (m.recommendations?.length === 1) return ['Je le prends', 'Autre chose'];
  return [];
}

const cartSignature = (cart) => cart.map(c => `${c.id}:${c.qty}`).sort().join('|');
const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA`;

// La conversation survit au passage par la fiche plat ou le panier (meme onglet)
const storageKey = (user) => `wayi_yivi_chat_${user?.id || 'anon'}`;
function loadChat(user) {
  try {
    const raw = sessionStorage.getItem(storageKey(user));
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list.map(m => ({ ...m, fresh: false })) : null;
  } catch { return null; }
}
function saveChat(user, messages) {
  try { sessionStorage.setItem(storageKey(user), JSON.stringify(messages.slice(-40).map(({ fresh, ...m }) => m))); } catch { /* stockage plein ou bloque */ }
}

export function YiviOrb({ size = 36, thinking = false, still = false }) {
  return (
    <span className={`yivi-orb${thinking ? ' is-thinking' : ''}`} style={{ width: size, height: size, ...(still ? { animation: 'none' } : {}) }} aria-hidden="true">
      <Sparkles size={Math.round(size * 0.44)} strokeWidth={2.1} />
    </span>
  );
}

// Texte qui s'ecrit mot a mot, comme une reponse generee en direct
function TypeText({ text, animate, onDone }) {
  const words = String(text || '').split(/(\s+)/);
  const [count, setCount] = useState(animate ? 0 : words.length);
  useEffect(() => {
    if (!animate) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setCount(words.length); onDone?.(); return undefined; }
    let i = 0;
    const id = setInterval(() => {
      i += 2; // un mot + l'espace qui suit
      setCount(i);
      if (i >= words.length) { clearInterval(id); onDone?.(); }
    }, 28);
    return () => clearInterval(id);
  }, [animate]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = count >= words.length;
  return <>{words.slice(0, count).join('')}{!done && <span className="yivi-caret" />}</>;
}

function Thinking({ steps }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(x => (x + 1) % steps.length), 1500);
    return () => clearInterval(id);
  }, [steps]);
  return (
    <div className="yivi-thinking" role="status" aria-live="polite">
      <YiviOrb size={26} thinking />
      <span className="yivi-thinking-text" key={i}>{steps[i]}</span>
      <span className="yivi-dots"><i /><i /><i /></span>
    </div>
  );
}

// Recapitulatif prepare par Yivi : le client valide et paie dans l'ecran Panier
function CheckoutCard({ checkout, onValidate }) {
  return (
    <div className="yivi-card">
      <div className="yivi-card-title"><ShoppingBag size={16} aria-hidden="true" /> Récapitulatif de ta commande</div>
      {checkout.restaurants.map(r => (
        <div key={r.name} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', marginBottom: 2 }}>{r.name}</div>
          {r.items.map(it => (
            <div key={it.name} className="yivi-line"><span>{it.qty} x {it.name}</span><span>{fmt(it.price * it.qty)}</span></div>
          ))}
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 8 }}>
        <div className="yivi-line"><span>Sous-total</span><span>{fmt(checkout.subtotal)}</span></div>
        <div className="yivi-line"><span>Livraison</span><span>{checkout.deliveryFee ? fmt(checkout.deliveryFee) : 'Offerte'}</span></div>
        <div className="yivi-line" style={{ fontWeight: 900, fontSize: 15, marginTop: 4 }}><span>Total</span><span>{fmt(checkout.total)}</span></div>
      </div>
      {checkout.warnings?.length > 0 && (
        <div className="yivi-warn">{checkout.warnings.map(w => <div key={w}>{w}</div>)}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--gray)', marginTop: 10 }}>
        <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <span>{checkout.address || "Adresse à ajouter à l'étape suivante"}{checkout.paymentLabel ? `, ${checkout.paymentLabel.toLowerCase().startsWith('mtn') ? checkout.paymentLabel : checkout.paymentLabel.toLowerCase()}` : ''}</span>
      </div>
      <button className="yivi-cta" onClick={onValidate}>Valider et payer <ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  );
}

export default function AIScreen() {
  const { state, navigate, dispatch } = useApp();
  const [messages, setMessages] = useState(() => loadChat(state.user) || []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(thinkingSteps(''));
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const firstName = state.user?.name?.split(' ')[0] || '';

  useEffect(() => { saveChat(state.user, messages); }, [messages, state.user]);

  const scrollDown = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollDown(); }, [messages.length, loading, scrollDown]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const history = messages.map(m => ({ role: m.role, content: m.content, recommendedIds: m.recommendedIds, recommendedNames: m.recommendedNames, awaiting: m.awaiting }));
    const cart = state.cart.map(c => ({ id: c.id, qty: c.qty }));
    setMessages(m => [...m.map(x => ({ ...x, fresh: false })), { role: 'user', content }]);
    setInput('');
    setSteps(thinkingSteps(content));
    setLoading(true);
    try {
      const { data } = await aiAPI.chat(content, history, cart);
      if (Array.isArray(data.cart)) dispatch({ type: 'CART_SET', payload: data.cart });
      setMessages(m => [...m, {
        role: 'assistant',
        content: data.reply,
        recommendations: data.recommendations,
        recommendedIds: data.recommendedIds,
        recommendedNames: data.recommendedNames,
        cartUpdated: Array.isArray(data.cart),
        checkout: data.checkout || null,
        trackingOrders: data.trackingOrders?.length ? data.trackingOrders : null,
        awaiting: data.awaiting || null,
        fresh: true,
      }]);
    } catch (err) {
      const msg = err.response?.status === 429
        ? 'Doucement, tu vas plus vite que moi. Réessaie dans une minute.'
        : err.code === 'ECONNABORTED'
          ? "Ça me prend trop de temps. Réessaie, je serai plus rapide."
          : "Je n'arrive pas à te répondre là, vérifie ta connexion et réessaie.";
      setMessages(m => [...m, { role: 'assistant', content: msg, fresh: true }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  };

  const markRead = (idx) => setMessages(m => m.map((x, i) => (i === idx ? { ...x, fresh: false } : x)));

  const openDish = (dish) => {
    dispatch({ type: 'SET_ACTIVE_DISH', payload: dish });
    navigate('dish');
  };
  const addDish = (dish) => dispatch({ type: 'CART_ADD', payload: { item: toCartItem(dish) } });
  const validate = (checkout) => {
    dispatch({ type: 'SET_CHECKOUT_PRESET', payload: { paymentMethod: checkout.paymentMethod } });
    navigate('cart');
  };
  const track = (orders) => {
    dispatch({ type: 'SET_ACTIVE_ORDERS', payload: orders });
    navigate('track');
  };

  const cartCount = state.cart.reduce((s, c) => s + c.qty, 0);
  const lastCheckoutIdx = messages.map(m => !!m.checkout).lastIndexOf(true);
  const currentSignature = cartSignature(state.cart);
  const last = messages[messages.length - 1];
  const chips = loading || last?.fresh ? [] : quickReplies(last);

  return (
    <div className="screen">
      <StatusBar />

      <div className="yivi-header">
        <BackBtn />
        <YiviOrb size={38} thinking={loading} />
        <div style={{ flex: 1 }}>
          <div className="yivi-title">Yivi</div>
          <div className={`yivi-status${loading ? ' is-thinking' : ''}`}>
            <span className="yivi-status-dot" /> {loading ? 'Réfléchit...' : 'Assistante IA de WAYI'}
          </div>
        </div>
        {cartCount > 0 && (
          <button className="yivi-icon-btn" onClick={() => navigate('cart')} aria-label="Voir le panier">
            <ShoppingBag size={17} aria-hidden="true" />
            <span className="yivi-badge">{cartCount > 9 ? '9+' : cartCount}</span>
          </button>
        )}
        {messages.length > 0 && (
          <button className="yivi-icon-btn" onClick={() => setMessages([])} aria-label="Nouvelle conversation">
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="screen-scroll yivi-scroll">
        {messages.length === 0 && !loading && (
          <div className="yivi-hero">
            <YiviOrb size={76} />
            <h2>{firstName ? `Salut ${firstName}, on mange quoi ?` : 'On mange quoi ?'}</h2>
            <p>Dis-moi ton envie, ton budget ou ce que tu évites. Je choisis dans le menu du jour, je remplis ton panier et je suis ta livraison.</p>
            <div className="yivi-starters">
              {STARTERS.map(({ Icon, text }) => (
                <button key={text} className="yivi-starter" onClick={() => send(text)}>
                  <span className="yivi-starter-ico"><Icon size={16} aria-hidden="true" /></span>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const showAttachments = !m.fresh;
          return (
            <div key={i}>
              <div className={`yivi-row${m.role === 'user' ? ' is-user' : ''}`}>
                {m.role === 'assistant' && <YiviOrb size={28} still />}
                <div className={`yivi-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
                  {m.role === 'assistant'
                    ? <TypeText text={m.content} animate={!!m.fresh} onDone={() => { markRead(i); scrollDown(); }} />
                    : m.content}
                </div>
              </div>
              {showAttachments && m.cartUpdated && (
                <div className="yivi-note"><ShoppingBag size={13} aria-hidden="true" /> Panier mis à jour</div>
              )}
              {showAttachments && m.recommendations?.length > 0 && (
                <div className="yivi-dishes">
                  {m.recommendations.map(dish => (
                    <div key={dish.id} style={{ width: 190 }}><MenuCard dish={dish} onOpen={openDish} onAdd={addDish} /></div>
                  ))}
                </div>
              )}
              {/* Seul le dernier recapitulatif reste valable, et seulement si le panier n'a pas change */}
              {showAttachments && m.checkout && i === lastCheckoutIdx && state.cart.length > 0 && (
                <div className="yivi-attach">
                  {m.checkout.cartSignature && m.checkout.cartSignature !== currentSignature
                    ? <div style={{ fontSize: 12.5, color: 'var(--gray)' }}>Ton panier a changé depuis ce récapitulatif. Dis « on commande » pour en avoir un à jour.</div>
                    : <CheckoutCard checkout={m.checkout} onValidate={() => validate(m.checkout)} />}
                </div>
              )}
              {showAttachments && m.trackingOrders && (
                <div className="yivi-attach">
                  <button className="yivi-track" onClick={() => track(m.trackingOrders)}>
                    <Bike size={17} aria-hidden="true" /> Suivre {m.trackingOrders.length > 1 ? `mes ${m.trackingOrders.length} commandes` : 'ma commande'} en direct <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {loading && <Thinking steps={steps} />}

        {chips.length > 0 && (
          <div className="yivi-chips">
            {chips.map((s, k) => (
              <button key={s} className="yivi-chip" style={{ animationDelay: `${k * 0.05}s` }} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <form className="yivi-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="yivi-input-wrap">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={loading ? 'Yivi réfléchit...' : 'Écris à Yivi'}
            enterKeyHint="send"
            maxLength={1000}
            aria-label="Message pour Yivi"
          />
          <button type="submit" className="yivi-send" disabled={loading || !input.trim()} aria-label="Envoyer">
            <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
