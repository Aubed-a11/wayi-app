import axios from 'axios';

// En développement, /api passe par le proxy Vite vers localhost:3001.
// En production (déployé), le backend est sur un autre domaine : VITE_API_URL doit
// pointer vers son URL complète (ex : https://wayi-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wayi_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wayi_token');
      window.dispatchEvent(new CustomEvent('wayi:logout'));
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  // Connexion unique : client, restaurant, livreur ou administration
  loginAny: (data) => api.post('/auth/login-any', data),
  registerStart: (data) => api.post('/auth/register/start', data),
  registerVerify: (data) => api.post('/auth/register/verify', data),
  registerResend: (email) => api.post('/auth/register/resend', { email }),
  social: (data) => api.post('/auth/social', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  addAddress: (data) => api.post('/auth/addresses', data),
  setDefaultAddress: (id) => api.put(`/auth/addresses/${id}/default`),
  deleteAddress: (id) => api.delete(`/auth/addresses/${id}`),
  setAddressPosition: (id, lat, lng) => api.put(`/auth/addresses/${id}/position`, { lat, lng }),
  favorites: () => api.get('/auth/favorites'),
  addFavorite: (dishId) => api.post(`/auth/favorites/${dishId}`),
  removeFavorite: (dishId) => api.delete(`/auth/favorites/${dishId}`),
  subscriptionPlans: () => api.get('/auth/subscription/plans'),
  subscribe: (plan, method, phone) => api.post('/auth/subscribe', { plan, method, phone }),
  subscribeConfirm: () => api.post('/auth/subscribe/confirm'),
};

// Inscription des restaurants et des livreurs depuis l'appli WAYI
export const signupAPI = {
  merchant: {
    start: (data) => api.post('/merchants/register/start', data),
    verify: (data) => api.post('/merchants/register/verify', data),
    resend: (email) => api.post('/merchants/register/resend', { email }),
  },
  driver: {
    start: (data) => api.post('/drivers/register/start', data),
    verify: (data) => api.post('/drivers/register/verify', data),
    resend: (email) => api.post('/drivers/register/resend', { email }),
  },
};

export const menuAPI = {
  get: (params) => api.get('/menu', { params }),
  dish: (id) => api.get(`/menu/${id}`),
  recommendations: () => api.get('/menu/recommendations'),
  restaurantOfWeek: () => api.get('/menu/restaurant-of-week'),
  topRestaurants: (limit = 8) => api.get('/menu/top-restaurants', { params: { limit } }),
};

export const aiAPI = {
  // Yivi peut enchainer plusieurs recherches avant de repondre : delai plus long que les autres appels
  chat: (message, history, cart) => api.post('/ai/chat', { message, history, cart }, { timeout: 45000 }),
  profile: () => api.get('/ai/profile'),
  forget: (type, valeur) => api.delete(`/ai/profile/${encodeURIComponent(type)}/${encodeURIComponent(valeur)}`),
};

export const ordersAPI = {
  list: () => api.get('/orders'),
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  rate: (id, data) => api.put(`/orders/${id}/rate`, data),
  cancel: (id) => api.delete(`/orders/${id}`),
  receipt: (id) => api.get(`/orders/${id}/receipt`),
  quote: (items, pos) => api.post('/orders/quote', { items, ...(pos || {}) }),
};

export const paymentsAPI = {
  methods: () => api.get('/payments/methods'),
  initiate: (data) => api.post('/payments/initiate', data),
  verify: (data) => api.post('/payments/verify', data),
  manualClaim: (data) => api.post('/payments/manual-claim', data),
};

export default api;

// Univers WAYI Bénin (Restaurant, Mode). Le Mode reste masqué tant que le back office ne l'ouvre pas.
export const verticalsAPI = { get: () => api.get('/verticals') };

export const modeAPI = {
  meta: () => api.get('/mode/meta'),
  listings: (params) => api.get('/mode/listings', { params }),
  listing: (id) => api.get(`/mode/listings/${id}`),
  seller: (id) => api.get(`/mode/listings/${id}/seller`),
  mine: () => api.get('/mode/mine'),
  create: (data) => api.post('/mode/listings', data),
  update: (id, data) => api.put(`/mode/listings/${id}`, data),
  remove: (id) => api.delete(`/mode/listings/${id}`),
  photo: (data, ext) => api.post('/mode/photos', { data, ext }, { timeout: 60000 }),
  favorites: () => api.get('/mode/favorites'),
  addFavorite: (id) => api.post(`/mode/favorites/${id}`),
  removeFavorite: (id) => api.delete(`/mode/favorites/${id}`),
  report: (id, reason, details) => api.post(`/mode/listings/${id}/report`, { reason, details }),
  conversations: () => api.get('/mode/conversations'),
  startConversation: (listingId, text) => api.post(`/mode/listings/${listingId}/conversation`, { text }),
  conversation: (id) => api.get(`/mode/conversations/${id}`),
  send: (id, text) => api.post(`/mode/conversations/${id}/messages`, { text }),
  order: (data) => api.post('/mode/orders', data),
  orders: () => api.get('/mode/orders'),
  orderOne: (id) => api.get(`/mode/orders/${id}`),
  orderStatus: (id, status) => api.put(`/mode/orders/${id}/status`, { status }),
  review: (id, rating, comment) => api.post(`/mode/orders/${id}/review`, { rating, comment }),
};
