import { useEffect, useRef, useState } from 'react';
import { Home, Search, Sparkles, ShoppingCart, User, ChevronLeft, ChevronRight, Heart, Star, Check, Plus, Minus, LayoutGrid, Soup, Leaf, Sandwich, Flame, CupSoda, Wheat, Fish, Cookie, Tag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TASTE_META } from './DynamicIcon';

/* ─── Logo ─────────────────────────────────────────────────── */
export function WayiLogo({ size = 32 }) {
  return (
    <img
      src="/icon-512.png"
      alt="WAYI"
      style={{
        height: size, width: size, display: 'block', objectFit: 'contain',
        borderRadius: size * 0.24,
        userSelect: 'none', flexShrink: 0,
      }}
    />
  );
}


/* ─── Petits effets : vol vers le panier, confettis, teintes ─── */
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function launchConfetti() {
  // Plus de confettis.
}

const TINTS = 6;
export function tintOf(dish) {
  const str = String(dish?.id || dish?.name || '');
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `tint-${h % TINTS}`;
}

/* ─── Status Bar ────────────────────────────────────────────── */
export function StatusBar() {
  // Espace de respiration en haut de l'écran (encoche des téléphones incluse)
  return <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 16px)', flexShrink: 0 }} />;
}

/* ─── Icônes de la barre de navigation ──────────────────────── */
function NavIcon({ name }) {
  const p = { size: 22, strokeWidth: 1.9, 'aria-hidden': true };
  if (name === 'home') return <Home {...p} />;
  if (name === 'explore') return <Search {...p} />;
  if (name === 'ai') return <Sparkles {...p} />;
  if (name === 'cart') return <ShoppingCart {...p} />;
  return <User {...p} />;
}

/* ─── Bottom Nav ────────────────────────────────────────────── */
export function BottomNav() {
  const { state, navigate, cartCount } = useApp();
  const tabs = [
    { key: 'home',    label: 'Accueil' },
    { key: 'explore', label: 'Explorer' },
    { key: 'ai',      label: 'Yivi' },
    { key: 'cart',    label: 'Panier' },
    { key: 'profile', label: 'Profil' },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={`nav-item ${state.screen === tab.key ? 'active' : ''}`}
          onClick={() => navigate(tab.key)}
          aria-current={state.screen === tab.key ? 'page' : undefined}
        >
          <span className="nav-ico">
            <span style={{ display: 'flex' }}>
              <NavIcon name={tab.key} />
            </span>
            {tab.key === 'cart' && cartCount > 0 && (
              <span className="nav-badge" key={'badge-' + cartCount}>{cartCount > 9 ? '9+' : cartCount}</span>
            )}
          </span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ─── Back Button ───────────────────────────────────────────── */
export function BackBtn({ onBack, light = false }) {
  const { goBack } = useApp();
  return (
    <button
      className={`back-btn${light ? ' back-btn-light' : ''}`}
      onClick={onBack || goBack}
      aria-label="Retour"
    >
      <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

/* ─── Dish Card - plat + badge du restaurant qui le prépare ──── */
export function DishCard({ dish, onClick, onAdd, isFavorite, onToggleFavorite }) {
  const taste = dish.taste && TASTE_META[dish.taste];
  return (
    <div className="shop-card" onClick={() => onClick(dish)}>
      <div className={`shop-card-hero${dish.image ? ' has-img' : ` ${tintOf(dish)}`}`} style={dish.image ? {
        backgroundImage: `url("${dish.image}")`, backgroundSize: 'cover', backgroundPosition: 'center',
      } : undefined}>
        {!dish.image && <span className="hero-initial">{(dish.name || 'W').trim().charAt(0).toUpperCase()}</span>}
        {taste && (
          <span className="chip taste-chip" style={{ background: taste.color }}>{taste.label}</span>
        )}
        {onToggleFavorite && (
          <FavBtn isFavorite={isFavorite} onClick={e => { e.stopPropagation(); onToggleFavorite(dish); }} />
        )}
        <div className="hero-chips">
          {dish.label
            ? <DishLabel dish={dish} />
            : <span className="chip chip-label"><Check size={12} strokeWidth={3} aria-hidden="true" /> Labellisé</span>}
          {(dish.isPopular || dish.isLoved) && (
            <span className="chip chip-popular">{dish.isPopular ? 'Populaire' : 'Très aimé'}</span>
          )}
        </div>
      </div>
      <div className="shop-card-body">
        <span className="shop-card-name">{dish.name}</span>
        {/* Badge du restaurant partenaire, logo si disponible */}
        <div className="shop-resto">
          {dish.restaurant?.logo
            ? <img src={dish.restaurant.logo} alt="" style={{ width: 20, height: 20, borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
            : null}
          <span className="shop-resto-name">{dish.restaurant?.name}</span>
          {dish.restaurant?.verified && <span className="verified-chip">Vérifié</span>}
          {dish.restaurant?.demo && <span className="demo-chip">Exemple</span>}
        </div>
        <div className="shop-card-foot">
          <div>
            {dish.price != null && (
              <div className="shop-card-price">{Number(dish.price).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')}<small>FCFA</small></div>
            )}
            <div className="shop-card-meta">
              {dish.restaurant?.rating != null && <span className="stars"><Star size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" /> {dish.restaurant.rating}</span>}
              {dish.restaurant?.prepTime != null && <span>{dish.restaurant.prepTime} min</span>}
            </div>
          </div>
          <AddBtn onAdd={onAdd} size={42} />
        </div>
      </div>
    </div>
  );
}

/* ─── Bannière d'offre (grande, avec bouton) ────────────────── */
export function PromoCard({ promo, onAction }) {
  return (
    <div
      className="banner"
      style={{
        background: promo.image
          ? `linear-gradient(90deg, rgba(20,10,5,0.78) 0%, rgba(20,10,5,0.25) 100%), url("${promo.image}") center/cover`
          : (promo.gradient || promo.color),
        color: promo.textColor || '#fff',
      }}
    >
      <div className="banner-text">
        {promo.tag && <span className="banner-tag">{promo.tag}</span>}
        <div className="banner-title">{promo.title}</div>
        <div className="banner-sub">{promo.subtitle}</div>
        {onAction && (
          <button className="banner-btn" onClick={onAction}>
            {promo.cta || 'Commander'} <ChevronRight size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
      </div>
      {promo.badge && (
        <div className="banner-badge">
          <strong>{promo.badge}</strong>
          {promo.badgeLabel && <span>{promo.badgeLabel}</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Catégorie : pastille ronde avec pictogramme ───────────── */
const CAT_ICONS = { all: LayoutGrid, plats_locaux: Soup, healthy: Leaf, burgers: Sandwich, grillades: Flame, boissons: CupSoda };
export function CategoryPill({ cat, active, onClick, style }) {
  return (
    <button className={`cat-item${active ? ' active' : ''}`} style={style} onClick={() => onClick(cat.id)}>
      <span className="cat-circle">
        {(() => { const Ico = CAT_ICONS[cat.id] || LayoutGrid; return <Ico size={26} strokeWidth={1.8} aria-hidden="true" />; })()}
      </span>
      <span className="cat-label">{cat.label}</span>
    </button>
  );
}

/* ─── Petit label WAYI de chaque plat ───────────────────────── */
export const LABEL_META = {
  terroir:   { text: 'Terroir',   Icon: Wheat,  tone: 'lb-terroir' },
  braise:    { text: 'Braise',    Icon: Flame,  tone: 'lb-braise' },
  ocean:     { text: 'Océan',     Icon: Fish,   tone: 'lb-ocean' },
  fraicheur: { text: 'Fraîcheur', Icon: Leaf,   tone: 'lb-fraicheur' },
  gourmand:  { text: 'Gourmand',  Icon: Cookie, tone: 'lb-gourmand' },
};
export function DishLabel({ dish, className = '' }) {
  const m = dish.label && LABEL_META[dish.label];
  // Label connu : icône + nom. Label libre saisi par un restaurant : affiché tel quel.
  if (!m && !dish.label) return null;
  const Icon = m ? m.Icon : Tag;
  return (
    <span className={`chip dish-label ${m ? m.tone : 'lb-terroir'} ${className}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" /> {m ? m.text : dish.label}
    </span>
  );
}

/* ─── Mini carte plat (défilement horizontal) ───────────────── */
export function DishMini({ dish, onClick, onAdd, isFavorite, onToggleFavorite }) {
  return (
    <div className="mini-card" onClick={() => onClick(dish)}>
      <div
        className={`mini-hero${dish.image ? ' has-img' : ` ${tintOf(dish)}`}`}
        style={dish.image ? { backgroundImage: `url("${dish.image}")` } : undefined}
      >
        {!dish.image && <span className="hero-initial" style={{ fontSize: 120, right: -2, bottom: -22 }}>{(dish.name || 'W').trim().charAt(0).toUpperCase()}</span>}
        {dish.label && <DishLabel dish={dish} className="mini-label" />}
        {(dish.isPopular || dish.isLoved) && (
          <span className="chip chip-popular mini-chip">{dish.isPopular ? 'Populaire' : 'Très aimé'}</span>
        )}
        {onToggleFavorite && (
          <FavBtn isFavorite={isFavorite} style={{ width: 30, height: 30, fontSize: 15, top: 8, right: 8 }} onClick={e => { e.stopPropagation(); onToggleFavorite(dish); }} />
        )}
      </div>
      <div className="mini-body">
        <div className="mini-name">{dish.name}</div>
        <div className="mini-resto">{dish.restaurant?.name}</div>
        <div className="mini-foot">
          <div>
            <div className="mini-price">{Number(dish.price || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} <small>FCFA</small></div>
            {dish.restaurant?.rating != null && <div className="mini-rate"><Star size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" /> {dish.restaurant.rating} - {dish.restaurant.prepTime} min</div>}
          </div>
          <AddBtn onAdd={onAdd} size={34} />
        </div>
      </div>
    </div>
  );
}

/* ─── Qty Control ───────────────────────────────────────────── */
export function QtyControl({ qty, onAdd, onRemove, size = 30 }) {
  return (
    <div className="qty-control">
      <button
        className="qty-btn qty-btn-minus"
        style={{ width: size, height: size }}
        onClick={e => { e.stopPropagation(); onRemove(); }}
      ><Minus size={Math.round(size * 0.52)} strokeWidth={2.6} aria-hidden="true" /></button>
      <span className="qty-value" key={qty} style={{ fontSize: size * 0.47 }}>{qty}</span>
      <button
        className="qty-btn qty-btn-plus"
        style={{ width: size, height: size }}
        onClick={e => { e.stopPropagation(); onAdd(); }}
      ><Plus size={Math.round(size * 0.52)} strokeWidth={2.6} aria-hidden="true" /></button>
    </div>
  );
}

/* ─── Add Button ────────────────────────────────────────────── */
export function AddBtn({ onAdd, size = 30 }) {
  return (
    <button
      className="qty-btn qty-btn-plus add-btn"
      style={{ width: size, height: size }}
      onClick={e => { e.stopPropagation(); onAdd(); }}
      aria-label="Ajouter au panier"
    >
      <Plus size={Math.round(size * 0.52)} strokeWidth={2.8} aria-hidden="true" />
    </button>
  );
}

/* ─── Bouton favori : petite reaction discrete quand on l'active ── */
export function FavBtn({ isFavorite, onClick, style }) {
  const first = useRef(true);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPop(n => n + 1);
  }, [isFavorite]);
  return (
    <button className={`fav-btn${isFavorite ? ' on' : ''}`} style={style} onClick={onClick} aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
      <span className={pop ? 'fav-heart pop' : 'fav-heart'} key={pop}><Heart size={18} strokeWidth={1.8} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" /></span>
    </button>
  );
}

/* ─── Apparition au défilement ───────────────────────────────── */
export function Reveal({ children, delay = 0, style, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return (
    <Tag ref={ref} className={`rv${seen ? ' in' : ''} ${className}`} style={{ '--rv-delay': `${delay}ms`, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/* ─── Compteur qui s'anime de 0 à la valeur ──────────────────── */
export function CountUp({ value = 0 }) {
  // Plus de compteur animé : le chiffre s'affiche directement.
  return <>{(Number(value) || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')}</>;
}

/* ─── Spinner ───────────────────────────────────────────────── */
export function Spinner({ size = 28, color = 'var(--emerald)' }) {
  return (
    <div className="spin-keep" style={{
      width: size, height: size,
      borderRadius: '50%',
      border: `3px solid var(--emerald-light)`,
      borderTopColor: color,
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}

/* ─── Empty State ───────────────────────────────────────────── */
export function EmptyState({ icon, title, subtitle, action, actionLabel }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{subtitle}</div>
      {action && (
        <button
          className="btn btn-primary"
          onClick={action}
          style={{ marginTop: 20, width: 'auto', padding: '12px 28px', fontSize: 13 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ─── Screen Header ─────────────────────────────────────────── */
export function ScreenHeader({ title, onBack, right, transparent = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px',
      background: transparent ? 'transparent' : 'var(--cream)',
      borderBottom: transparent ? 'none' : '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 10,
      flexShrink: 0,
    }}>
      {onBack && <BackBtn onBack={onBack} />}
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {right}
    </div>
  );
}

/* ─── Section Title ─────────────────────────────────────────── */
export function SectionTitle({ children, action, actionLabel }) {
  return (
    <div className="section-header">
      <span className="section-title">{children}</span>
      {action && (
        <button className="section-link" onClick={action}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ─── Floating Cart Bar ─────────────────────────────────────── */
export function CartBar({ count, total, onPress }) {
  if (!count) return null;
  return (
    <div className="cart-bar">
      <button className="cart-bar-btn" onClick={onPress}>
        <span className="cart-bar-count" key={count}>{count}</span>
        <span>Voir mon panier</span>
        <span>{Number(total || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} FCFA</span>
      </button>
    </div>
  );
}


/* ─── Bandeau défilant de plats africains (décoration) ───────── */
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=520&h=640&q=70`;
export const FOOD_TILES = [
  { img: U('1665332195309-9d75071138f0'), label: 'Riz jollof & poisson grillé' },
  { img: U('1763048443535-1243379234e2'), label: 'Soupe egusi' },
  { img: U('1665400808116-f0e6339b7e9a'), label: 'Poulet yassa' },
  { img: U('1665332305771-e49a5dd5ba80'), label: 'Thiéboudienne' },
  { img: U('1664993085274-80c6ba725ccc'), label: 'Puff puff' },
  { img: U('1603496987674-79600a000f55'), label: 'Poulet frit & riz' },
  { img: U('1555939594-58d7cb561ad1'), label: 'Grillades' },
  { img: U('1666181551815-b9adecb24e46'), label: 'Poisson & ugali' },
];
export function FoodMarquee() {
  // La liste est doublée : l'animation boucle sans coupure (-50 %)
  const tiles = [...FOOD_TILES, ...FOOD_TILES];
  return (
    <div className="marquee" aria-label="Saveurs d'Afrique">
      <div className="marquee-track">
        {tiles.map((t, i) => (
          <figure className="marquee-tile" key={i} aria-hidden={i >= FOOD_TILES.length}>
            <img src={t.img} alt={i < FOOD_TILES.length ? t.label : ''} loading="lazy" draggable="false"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
            <figcaption>{t.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* ─── Restaurant de la semaine (celui qui a servi le plus de plats) ─ */
export function WeekRestaurant({ data, onSeeDishes }) {
  const r = data?.restaurant;
  if (!r) return null;
  return (
    <div className="week-card">
      <div className="week-tag">
        <Star size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        Restaurant de la semaine
      </div>
      <div className="week-main">
        <div className="week-logo">
          {r.logo
            ? <img src={r.logo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : (r.name || 'W').trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="week-name">{r.name}</div>
          {r.tagline ? <div className="week-sub">{r.tagline}</div> : null}
        </div>
      </div>
      <div className="week-stats">
        <div><strong><CountUp value={data.dishesServed || 0} /></strong><span>plats servis</span></div>
        {r.rating != null && <div><strong><Star size={15} fill="currentColor" strokeWidth={0} aria-hidden="true" /> {r.rating}</strong><span>note</span></div>}
        {r.prepTime != null && <div><strong>{r.prepTime} min</strong><span>préparation</span></div>}
      </div>
      <button className="week-btn" onClick={onSeeDishes}>Voir ses plats <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" /></button>
    </div>
  );
}


/* ─── Fond de photos de plats qui défilent (écran de connexion) ─── */
export function FoodBackdrop() {
  const row = (tiles, rev) => (
    <div className={`bd-row${rev ? ' rev' : ''}`}>
      <div className="bd-track">
        {[...tiles, ...tiles].map((t, i) => (
          <span className="bd-tile" key={i}>
            <img src={t.img} alt="" loading="lazy" draggable="false" onError={e => { e.currentTarget.style.display = 'none'; }} />
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div className="auth-backdrop" aria-hidden="true">
      {row(FOOD_TILES.slice(0, 4), false)}
      {row(FOOD_TILES.slice(4), true)}
    </div>
  );
}
