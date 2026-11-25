import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, Bike, UtensilsCrossed, Plus, Minus, Check, ShoppingBag, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { menuAPI } from '../api';
import { RestoLogo, fcfa, toCartItem } from '../components/Wayi';
import { Spinner } from '../components/UI';
import { SECTIONS, sectionOf, splitDesc, signatures } from '../lib/menuSections';

// Carte d'un restaurant : couverture, incontournables, puis le menu range par rubriques
export default function RestaurantScreen() {
  const { state, dispatch, navigate, goBack } = useApp();
  const resto = state.activeRestaurant;
  const [dishes, setDishes] = useState(null);
  const [tab, setTab] = useState(null);
  const refs = useRef({});
  const scroller = useRef(null);

  useEffect(() => {
    if (!resto) { navigate('home'); return; }
    menuAPI.get({}).then(r => setDishes((r.data?.dishes || []).filter(d => d.restaurantId === resto.id))).catch(() => setDishes([]));
  }, [resto]);

  const sections = useMemo(() => SECTIONS
    .map(s => ({ ...s, items: (dishes || []).filter(d => sectionOf(d) === s.id) }))
    .filter(s => s.items.length), [dishes]);
  const stars = useMemo(() => signatures(dishes || []), [dishes]);
  const info = (dishes && dishes[0]?.restaurant) || resto || {};
  const cover = stars[0]?.image;

  const qtyOf = (id) => state.cart.find(c => c.id === id)?.qty || 0;
  const add = (d) => {
    dispatch({ type: 'CART_ADD', payload: { item: toCartItem(d) } });
    toast(`${d.name} ajouté`, { id: 'add-' + d.id, duration: 1200, icon: <Check size={16} strokeWidth={3} /> });
  };
  const remove = (d) => dispatch({ type: 'CART_REMOVE', payload: d.id });
  const open = (d) => { dispatch({ type: 'SET_ACTIVE_DISH', payload: d }); navigate('dish'); };
  const go = (id) => {
    setTab(id);
    const el = refs.current[id];
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 64, behavior: 'smooth' });
  };
  const onScroll = () => {
    const y = (scroller.current?.scrollTop || 0) + 90;
    let cur = sections[0]?.id;
    for (const s of sections) if ((refs.current[s.id]?.offsetTop || 0) <= y) cur = s.id;
    if (cur !== tab) setTab(cur);
  };

  const mine = state.cart.filter(c => c.restaurantId === resto?.id);
  const count = mine.reduce((s, c) => s + c.qty, 0);
  const total = mine.reduce((s, c) => s + c.qty * c.price, 0);

  if (!resto) return null;
  const Stepper = ({ d, light }) => {
    const q = qtyOf(d.id);
    return q ? (
      <span className={`rs-step${light ? ' light' : ''}`} onClick={e => e.stopPropagation()}>
        <button onClick={() => remove(d)} aria-label="Retirer"><Minus size={15} strokeWidth={2.6} /></button>
        <b>{q}</b>
        <button onClick={() => add(d)} aria-label="Ajouter"><Plus size={15} strokeWidth={2.6} /></button>
      </span>
    ) : (
      <button className={`rs-add${light ? ' light' : ''}`} onClick={e => { e.stopPropagation(); add(d); }} aria-label={`Ajouter ${d.name}`}>
        <Plus size={18} strokeWidth={2.6} />
      </button>
    );
  };

  return (
    <div className="screen rs">
      <div className="rs-scroll" ref={scroller} onScroll={onScroll}>
        <div className="rs-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
          <span className="rs-cover-shade" />
          <button className="ct-back rs-back" onClick={goBack}>Retour</button>
        </div>

        <div className="rs-head">
          <RestoLogo restaurant={info} size={78} className="rs-logo" />
          <h1>{info.name}</h1>
          {info.tagline && <p>{info.tagline}</p>}
          <div className="rs-meta">
            <span><Clock size={15} /> {info.prepTime || '25-35'} min</span>
            <span><Bike size={15} /> 75 F / km</span>
            <span><UtensilsCrossed size={15} /> {dishes ? dishes.length : '...'} plats</span>
            {info.rating ? <span><Star size={15} /> {Number(info.rating).toFixed(1)}</span> : null}
          </div>
        </div>

        {!dishes ? <div style={{ textAlign: 'center', padding: 50 }}><Spinner size={26} /></div> : (
          <>
            {stars.length > 0 && (
              <section className="rs-stars">
                <h2>Les incontournables</h2>
                <div className="rs-stars-track">
                  {stars.map((d, i) => (
                    <div key={d.id} className="rs-star" onClick={() => open(d)}>
                      <div className="rs-star-img" style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined}>
                        <span className="rs-star-rank">{i === 0 ? 'Le plat signature' : 'Très demandé'}</span>
                        <Stepper d={d} light />
                      </div>
                      <strong>{d.name}</strong>
                      <span className="rs-price">{fcfa(d.price)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sections.length > 1 && (
              <nav className="rs-tabs">
                {sections.map(s => (
                  <button key={s.id} className={(tab || sections[0].id) === s.id ? 'on' : ''} onClick={() => go(s.id)}>
                    {s.title} <small>{s.items.length}</small>
                  </button>
                ))}
              </nav>
            )}

            {sections.map(s => (
              <section key={s.id} className="rs-section" ref={el => { refs.current[s.id] = el; }}>
                <h2>{s.title}</h2>
                <p className="rs-section-sub">{s.sub}</p>
                {s.items.map(d => {
                  const { text, side } = splitDesc(d.desc);
                  return (
                    <div key={d.id} className="rs-row" onClick={() => open(d)}>
                      <div className="rs-row-txt">
                        <strong>{d.name}</strong>
                        {text && <p>{text}</p>}
                        {side && <span className="rs-side">Accompagnement au choix</span>}
                        <span className="rs-price">{fcfa(d.price)}</span>
                      </div>
                      <div className="rs-row-img" style={d.image ? { backgroundImage: `url("${d.image}")` } : undefined}>
                        <Stepper d={d} />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
            {!dishes.length && <p className="tr-empty">Pas de plat disponible pour le moment.</p>}
            <div style={{ height: count ? 110 : 40 }} />
          </>
        )}
      </div>

      {count > 0 && (
        <button className="rs-cartbar" onClick={() => navigate('cart')}>
          <span className="rs-cartbar-n"><ShoppingBag size={17} /> {count}</span>
          <span>Voir mon panier</span>
          <b>{fcfa(total)}</b>
        </button>
      )}
    </div>
  );
}
