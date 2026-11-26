// ============================================================
// WAYI - composants du theme v7 (cartes de plats, logos, quantite)
// ============================================================
import { ChefHat, Clock, Plus, Minus, UtensilsCrossed, ConciergeBell, Sun, Moon, CakeSlice } from 'lucide-react';
import { useState } from 'react';

export const PERIODS = [
  { id: 'all',            label: 'Tous',      Icon: ConciergeBell },
  { id: 'petit_dejeuner', label: 'Petit-déj', Icon: Sun },
  { id: 'dejeuner',       label: 'Déjeuner',  Icon: UtensilsCrossed },
  { id: 'diner',          label: 'Dîner',     Icon: Moon },
  { id: 'gouter',         label: 'Goûter',    Icon: CakeSlice },
];

// Espace insecable classique (U+00A0) : l'espace fine (U+202F) de fr-FR n'existe pas dans la police
export const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0');
export const fcfa = (n) => `${fmtNum(n)}\u00a0FCFA`;

// Element de panier a partir d'un plat (avec sa photo pour l'ecran Panier)
export const toCartItem = (dish) => ({
  id: dish.id, name: dish.name, icon: dish.icon, image: dish.image || null, price: dish.price,
  restaurantId: dish.restaurantId, restaurantName: dish.restaurant?.name, restaurantIcon: dish.restaurant?.icon, restaurantLogoOverlay: dish.restaurant?.logoOverlay || null,
  restaurantLogo: dish.restaurant?.logo || null,
});

export function DishImg({ src, className = '', style, iconSize = 28 }) {
  return (
    <div className={`w-img ${className}`} style={{ ...(src ? { backgroundImage: `url("${src}")` } : {}), ...style }}>
      {!src && <span className="w-img-empty"><UtensilsCrossed size={iconSize} strokeWidth={1.6} aria-hidden="true" /></span>}
    </div>
  );
}

// Logo rond du restaurant ; sans logo, une toque et le nom
// Logo du restaurant ; sans logo envoye : ses initiales sur une couleur fixe (comme dans l'appli)
const LOGO_COLORS = ['#F2690D', '#1E9E5A', '#2F7BE5', '#8B4FD8', '#D9467A', '#E59A00', '#0F8A8A'];
export function restoInitials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(w => w.length > 2);
  return (words.length ? words.slice(0, 2).map(w => w[0]) : [String(name || 'W')[0]]).join('').toUpperCase();
}
export function restoColor(name = '') {
  return LOGO_COLORS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % LOGO_COLORS.length];
}
export function RestoLogo({ restaurant, size = 56, className = '', style }) {
  const name = restaurant?.name || '';
  const [broken, setBroken] = useState(false);
  const showImg = restaurant?.logo && !broken;
  return (
    <span className={`w-logo ${className}`} style={{ width: size, height: size, fontSize: size * 0.34, ...style }} title={name}>
      {showImg
        ? <img src={restaurant.logo} alt={name} onError={() => setBroken(true)} />
        : (
          <span className="w-logo-fallback" style={{ background: restoColor(name), color: '#fff', fontWeight: 800, letterSpacing: 0.5 }}>
            {restoInitials(name)}
          </span>
        )}
    </span>
  );
}

// Logo du restaurant pose sur la photo du plat : version sans fond si le
// restaurant en a une, sinon son logo rond. Aucun nom ecrit.
export function PhotoMark({ restaurant, className = '', size = 'md' }) {
  const [broken, setBroken] = useState(false);
  if (!restaurant) return null;
  if (restaurant.logoOverlay && !broken) {
    return <img className={`w-mark ${size} ${className}`} src={restaurant.logoOverlay} alt="" onError={() => setBroken(true)} />;
  }
  return <RestoLogo restaurant={restaurant} size={size === 'lg' ? 64 : size === 'sm' ? 30 : 40} className={`w-mark-round ${className}`} />;
}

// Carte de la grille "Menus du jour"
export function MenuCard({ dish, onOpen, onAdd }) {
  return (
    <div className="w-mcard" onClick={() => onOpen(dish)}>
      <DishImg src={dish.image} />
      <span className="w-mcard-tag">{dish.isPopular ? 'Populaire' : 'Plat du jour'}</span>
      <div className="w-mcard-body">
        <div className="w-mcard-name">{dish.name}</div>
        {dish.desc && <div className="w-mcard-desc">{dish.desc}</div>}
        <div className="w-mcard-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Clock size={12} aria-hidden="true" /> {dish.restaurant?.prepTime ? `${dish.restaurant.prepTime} min` : "Aujourd'hui"}</span>
          <span className="w-mcard-price">{fcfa(dish.price)}</span>
        </div>
        <div className="w-mcard-foot">
          <button className="w-add" onClick={e => { e.stopPropagation(); onAdd(dish); }} aria-label={`Ajouter ${dish.name}`}>
            Ajouter <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

const PERIOD_LABEL = { petit_dejeuner: 'Petit-déj', dejeuner: 'Déjeuner', gouter: 'Goûter', diner: 'Dîner' };
const prepLabel = (dish) => dish.restaurant?.prepTime ? `${dish.restaurant.prepTime} min` : "Aujourd'hui";

// Carte de la semaine : un plat vedette en grand, puis les autres en photos pleine carte
export function WeekMenu({ dishes, onOpen, onAdd, heroLabel = 'Le plat du moment' }) {
  if (!dishes.length) return null;
  const [hero, ...rest] = dishes;
  return (
    <div className="wm">
      <div className="wm-hero" onClick={() => onOpen(hero)}>
        <DishImg src={hero.image} className="wm-photo" />
        <div className="wm-shade" />
        <span className="wm-chip">{heroLabel}</span>
        <div className="wm-hero-txt">
          <h3>{hero.name}</h3>
          {hero.desc && <p>{hero.desc}</p>}
          <div className="wm-hero-foot">
            <span className="wm-price">{fcfa(hero.price)}</span>
            <span className="wm-time"><Clock size={13} aria-hidden="true" /> {prepLabel(hero)}</span>
            <button className="wm-add lg" onClick={e => { e.stopPropagation(); onAdd(hero); }} aria-label={`Ajouter ${hero.name}`}>
              <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="wm-tiles">
          {rest.map((d, i) => (
            <div key={d.id} className={`wm-tile${rest.length % 2 === 1 && i === rest.length - 1 ? ' wide' : ''}`} onClick={() => onOpen(d)}>
              <DishImg src={d.image} className="wm-photo" />
              <div className="wm-shade" />
              {PERIOD_LABEL[d.period] && <span className="wm-chip sm">{PERIOD_LABEL[d.period]}</span>}
              <button className="wm-add" onClick={e => { e.stopPropagation(); onAdd(d); }} aria-label={`Ajouter ${d.name}`}>
                <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
              </button>
              <div className="wm-tile-txt">
                <b>{d.name}</b>
                <span className="wm-price sm">{fcfa(d.price)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Carte en liste : logo | photo | infos
export function ListCard({ dish, onOpen, onAdd, cta = 'Commander' }) {
  return (
    <div className="w-lcard" onClick={() => onOpen(dish)}>
      <div className="w-ecard-photo w-lcard-photo"><DishImg src={dish.image} iconSize={22} /></div>
      <div className="w-lcard-body">
        <div className="w-lcard-name">{dish.name}</div>
        {dish.desc && <div className="w-lcard-desc">{dish.desc}</div>}
        <div className="w-lcard-foot">
          <span className="w-mcard-price">{fcfa(dish.price)}</span>
        </div>
        <button className="w-add" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={e => { e.stopPropagation(); onAdd(dish); }}>
          {cta} <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// Carte de l'ecran Explorer
export function ExploreCard({ dish, onOpen, onAdd }) {
  return (
    <div className="w-ecard" onClick={() => onOpen(dish)}>
      <div className="w-ecard-photo">
        <DishImg src={dish.image} />
      </div>
      <button className="w-ecard-add" onClick={e => { e.stopPropagation(); onAdd(dish); }} aria-label={`Ajouter ${dish.name}`}>
        <Plus size={17} strokeWidth={2.6} aria-hidden="true" />
      </button>
      <div className="w-ecard-name">{dish.name}</div>
      <div className="w-ecard-price">{fcfa(dish.price)}</div>
    </div>
  );
}

export function Qty({ value, onMinus, onPlus, small = false }) {
  return (
    <span className={`w-qty${small ? ' sm' : ''}`}>
      <button type="button" onClick={onMinus} aria-label="Retirer un"><Minus size={small ? 16 : 18} aria-hidden="true" /></button>
      <span>{value}</span>
      <button type="button" onClick={onPlus} aria-label="Ajouter un"><Plus size={small ? 16 : 18} aria-hidden="true" /></button>
    </span>
  );
}

export function Empty({ Icon, title, text, action, actionLabel }) {
  return (
    <div className="w-empty">
      <div className="ico"><Icon size={32} strokeWidth={1.7} aria-hidden="true" /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <button className="w-btn" style={{ width: 'auto', margin: '0 auto', padding: '13px 26px' }} onClick={action}>{actionLabel}</button>}
    </div>
  );
}
