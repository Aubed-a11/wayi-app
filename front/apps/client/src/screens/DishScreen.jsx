import { useState, useEffect } from 'react';
import { Heart, Share2, ShoppingCart, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { DishImg, PhotoMark, Qty, toCartItem, fcfa } from '../components/Wayi';
import { TASTE_META } from '../components/DynamicIcon';

const PERIOD_LABEL = { petit_dejeuner: 'Petit-déjeuner', dejeuner: 'Déjeuner', gouter: 'Goûter', diner: 'Dîner' };

export default function DishScreen() {
  const { state, navigate, dispatch, toggleFavorite, goBack } = useApp();
  const dish = state.activeDish;
  const [qty, setQty] = useState(1);

  // Pas de navigation pendant le rendu (avertissement React) : on redirige apres
  useEffect(() => { if (!dish) navigate('home'); }, [dish, navigate]);
  if (!dish) return null;

  const isFavorite = (state.user?.favoriteDishes || []).includes(dish.id);
  const r = dish.restaurant;

  const addToCart = () => {
    for (let i = 0; i < qty; i++) dispatch({ type: 'CART_ADD', payload: { item: toCartItem(dish) } });
    navigate('cart');
  };

  const share = async () => {
    const text = `${dish.name} chez ${r?.name || 'WAYI'} : ${fcfa(dish.price)} sur WAYI`;
    try {
      if (navigator.share) await navigator.share({ title: dish.name, text, url: 'https://www.wayibenin.com' });
      else { await navigator.clipboard.writeText(`${text} - https://www.wayibenin.com`); toast('Lien copié'); }
    } catch { /* partage annule */ }
  };

  const about = [
    dish.desc,
    dish.characteristics && `Composition\n${dish.characteristics}`,
    dish.advantages && `Pourquoi on l'aime\n${dish.advantages}`,
    dish.benefits && `Bon à savoir\n${dish.benefits}`,
  ].filter(Boolean);

  return (
    <div className="screen">
      <div className="w-scroll" style={{ paddingBottom: 0 }}>
        <div className="w-dish-hero">
          <DishImg src={dish.image} iconSize={56} />
          <div className="w-dish-hero-bar">
            <button className="ct-back" onClick={goBack}>Retour</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="w-icon-btn on-img" onClick={() => toggleFavorite(dish)} aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                <span className="dish-fav-heart"><Heart size={19} strokeWidth={1.8} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" /></span>
              </button>
              <button className="w-icon-btn on-img" onClick={share} aria-label="Partager"><Share2 size={19} aria-hidden="true" /></button>
            </div>
          </div>
          <button className="w-dish-mark-btn" onClick={() => { dispatch({ type: 'SET_ACTIVE_RESTAURANT', payload: r }); navigate('restaurant'); }} aria-label="Voir la carte du restaurant">
            <PhotoMark restaurant={r} size="lg" />
          </button>
        </div>

        <div className="w-dish-body">
          <div className="w-dish-name">{dish.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--gray)' }}>
            <button className="rs-link" onClick={() => { dispatch({ type: 'SET_ACTIVE_RESTAURANT', payload: r }); navigate('restaurant'); }}>Voir toute la carte</button>
            {r?.prepTime && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} aria-hidden="true" /> {r.prepTime} min</span>}
          </div>
          <div className="w-tags">
            {PERIOD_LABEL[dish.period] && <span className="w-tag">{PERIOD_LABEL[dish.period]}</span>}
            {dish.taste && TASTE_META[dish.taste] && <span className="w-tag">{TASTE_META[dish.taste].label}</span>}
            {r?.verified && <span className="w-tag">Restaurant vérifié</span>}
            {r?.demo && <span className="w-tag demo">Exemple, pas encore commandable</span>}
          </div>

          <div className="w-dish-price">{fcfa(dish.price)}</div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Qty value={qty} onMinus={() => setQty(q => Math.max(1, q - 1))} onPlus={() => setQty(q => Math.min(20, q + 1))} />
          </div>

          {about.length > 0 && (
            <div className="w-about">
              <h4>À propos du plat</h4>
              {about.map((t, i) => <p key={i} style={{ marginBottom: 12 }}>{t}</p>)}
            </div>
          )}
        </div>
      </div>

      <div className="w-dish-bottom">
        <button className="w-btn" onClick={addToCart}>
          <ShoppingCart size={19} aria-hidden="true" /> Ajouter au panier · {fcfa(dish.price * qty)}
        </button>
      </div>
    </div>
  );
}
