// ============================================================
// WAYI — Route Restaurants partenaires
// GET /api/restaurants · GET /api/restaurants/:id
// ============================================================
const express = require('express');
const { restaurants, getRestaurantById, getDishesByRestaurant, reviews } = require('../data/store');

const router = express.Router();

// Les numéros d'encaissement ne sont jamais publics : ils ne sont révélés qu'au client qui paie sa commande.
const pub = ({ momoMtn, momoMoov, ...rest }) => rest;

// GET /api/restaurants — liste des partenaires labellisés
router.get('/', (req, res) => {
  const sorted = [...restaurants].sort((a, b) => b.priorityScore - a.priorityScore);
  res.json({ restaurants: sorted.map(pub), total: sorted.length });
});

// GET /api/restaurants/:id — profil + son menu
router.get('/:id', (req, res) => {
  const restaurant = getRestaurantById(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant introuvable' });
  const dishes = getDishesByRestaurant(restaurant.id);
  const restaurantReviews = reviews.filter(r => r.restaurantId === restaurant.id);
  res.json({ restaurant: pub(restaurant), dishes, reviews: restaurantReviews });
});

module.exports = router;
