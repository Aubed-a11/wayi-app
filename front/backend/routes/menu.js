// ============================================================
// WAYI — Route Menu du jour
// GET /api/menu?period=dejeuner&category=healthy&search=riz
// ============================================================
const express = require('express');
const { PERIODS, CATEGORIES, TASTES, DISH_LABELS, currentPeriod, getMenu, getDishById, enrichDish, users, orders, restaurants } = require('../data/store');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/menu — plats du jour, filtrables par période/catégorie
router.get('/', (req, res) => {
  const { period, category, search } = req.query;
  const dishes = getMenu({ period, category, search });
  res.json({
    periods: PERIODS,
    categories: CATEGORIES,
    tastes: TASTES,
    labels: DISH_LABELS,
    currentPeriod: currentPeriod(),
    activeFilters: { period: period || null, category: category || null, search: search || null },
    dishes,
    total: dishes.length,
  });
});

// GET /api/menu/recommendations — plats recommandés à partir des favoris du client
router.get('/recommendations', auth, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  const favoriteIds = user?.favoriteDishes || [];

  if (!favoriteIds.length) {
    // Pas encore de favoris : on ne devine pas les goûts, on le dit clairement.
    return res.json({ dishes: [], total: 0, basedOnFavorites: false });
  }

  const favoriteDishes = favoriteIds.map(getDishById).filter(Boolean);
  const categoryCount = {};
  const tasteCount = {};
  const restaurantCount = {};
  favoriteDishes.forEach(d => {
    categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
    if (d.taste) tasteCount[d.taste] = (tasteCount[d.taste] || 0) + 1;
    restaurantCount[d.restaurantId] = (restaurantCount[d.restaurantId] || 0) + 1;
  });

  const allDishes = getMenu({}).filter(d => !favoriteIds.includes(d.id));

  const scored = allDishes.map(d => {
    let score = 0;
    if (categoryCount[d.category]) score += categoryCount[d.category] * 2;
    if (d.taste && tasteCount[d.taste]) score += tasteCount[d.taste] * 2;
    if (restaurantCount[d.restaurantId]) score += restaurantCount[d.restaurantId];
    return { dish: d, score };
  }).filter(x => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const dishes = scored.slice(0, 8).map(x => x.dish);

  res.json({ dishes, total: dishes.length, basedOnFavorites: true });
});

// GET /api/menu/restaurant-of-week — le restaurant qui a servi le plus de plats ces 7 derniers jours
// (commandes livrées ; à défaut, commandes non annulées). Public : sert la page d'accueil.
router.get('/restaurant-of-week', (req, res) => {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = orders.filter(o => o.createdAt && new Date(o.createdAt).getTime() >= since);
  const tally = (list) => {
    const t = {};
    for (const o of list) {
      const qty = (o.items || []).reduce((sum, it) => sum + (it.qty || 1), 0);
      if (!o.restaurantId || !qty) continue;
      if (!t[o.restaurantId]) t[o.restaurantId] = { dishes: 0, orders: 0 };
      t[o.restaurantId].dishes += qty;
      t[o.restaurantId].orders += 1;
    }
    return t;
  };
  let t = tally(recent.filter(o => o.status === 'delivered'));
  if (!Object.keys(t).length) t = tally(recent.filter(o => o.status !== 'cancelled'));
  const best = Object.entries(t).sort((a, b) => b[1].dishes - a[1].dishes)[0];
  if (!best) return res.json({ restaurant: null });
  const r = restaurants.find(x => x.id === best[0]);
  if (!r) return res.json({ restaurant: null });
  res.json({
    restaurant: { id: r.id, name: r.name, logo: r.logo || null, icon: r.icon, tagline: r.tagline || '', rating: r.rating, verified: !!r.verified, prepTime: r.prepTime },
    dishesServed: best[1].dishes,
    ordersCount: best[1].orders,
    periodDays: 7,
  });
});

// GET /api/menu/:id — détail d'un plat
router.get('/:id', (req, res) => {
  const dish = getDishById(req.params.id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  res.json(enrichDish(dish));
});

module.exports = router;
