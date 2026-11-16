// ============================================================
// WAYI - composants du theme v7 (cartes de plats, logos, quantite)
// ============================================================
import { ChefHat, Clock, Plus, Minus, UtensilsCrossed, ConciergeBell, Sun, Moon, CakeSlice } from 'lucide-react';

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
  restaurantId: dish.restaurantId, restaurantName: dish.restaurant?.name, restaurantIcon: dish.restaurant?.icon,
});

export function DishImg({ src, className = '', style, iconSize = 28 }) {
  return (
    <div className={`w-img ${className}`} style={{ ...(src ? { backgroundImage: `url("${src}")` } : {}), ...style }}>
      {!src && <span className="w-img-empty"><UtensilsCrossed size={iconSize} strokeWidth={1.6} aria-hidden="true" /></span>}
    </div>
  );
}

// Logo rond du restaurant ; sans logo, une toque et le nom
export function RestoLogo({ restaurant, size = 56, className = '', style }) {
  const name = restaurant?.name || '';
  return (
    <span className={`w-logo ${className}`} style={{ width: size, height: size, fontSize: size * 0.32, ...style }} title={name}>
      {restaurant?.logo
        ? <img src={restaurant.logo} alt={name} onError={e => { e.currentTarget.style.display = 'none'; }} />
        : (
          <span className="w-logo-fallback">
            <ChefHat size={size * 0.38} strokeWidth={1.7} aria-hidden="true" />
          </span>
        )}
    </span>
  );
}

// Carte de la grille "Menus du jour"
export function MenuCard({ dish, onOpen, onAdd }) {
  return (
    <div className="w-mcard" onClick={() => onOpen(dish)}>
      <DishImg src={dish.image} />
      <span className="w-mcard-tag">{dish.isPopular ? 'Populaire' : 'Plat du jour'}</span>
      <RestoLogo restaurant={dish.restaurant} size={46} className="w-mcard-logo" />
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

// Carte en liste : logo | photo | infos
export function ListCard({ dish, onOpen, onAdd, cta = 'Commander' }) {
  return (
    <div className="w-lcard" onClick={() => onOpen(dish)}>
      <div className="w-lcard-logo"><RestoLogo restaurant={dish.restaurant} size={62} /></div>
      <DishImg src={dish.image} iconSize={22} />
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
      <RestoLogo restaurant={dish.restaurant} size={58} />
      <DishImg src={dish.image} />
      <button className="w-ecard-add" onClick={e => { e.stopPropagation(); onAdd(dish); }} aria-label={`Ajouter ${dish.name}`}>
        <Plus size={17} strokeWidth={2.6} aria-hidden="true" />
      </button>
      <div className="w-ecard-name">{dish.name}</div>
      {dish.restaurant?.name && <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 2 }}>{dish.restaurant.name}</div>}
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
