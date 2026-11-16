import axios from 'axios';

// En développement, /api passe par le proxy Vite. En production, VITE_API_URL doit
// pointer vers l'URL complète du backend déployé (ex : https://wayi-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

// Instance dédiée au super admin
const adminApi = axios.create({ baseURL: API_BASE, timeout: 10000 });
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('wayi_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wayi_admin_token');
      window.dispatchEvent(new CustomEvent('wayi:admin_logout'));
    }
    return Promise.reject(err);
  }
);

export const adminAPI = {
  login: (data) => adminApi.post('/admin/login', data),
  me: () => adminApi.get('/admin/me'),
  dashboard: () => adminApi.get('/admin/dashboard'),
  telemarketing: {
    targets: (params) => adminApi.get('/admin/telemarketing/targets', { params }),
    calls: (targetId) => adminApi.get('/admin/telemarketing/calls', { params: { targetId } }),
    logCall: (data) => adminApi.post('/admin/telemarketing/calls', data),
  },
  restaurants: {
    list: () => adminApi.get('/admin/restaurants'),
    create: (data) => adminApi.post('/admin/restaurants', data),
    update: (id, data) => adminApi.put(`/admin/restaurants/${id}`, data),
    remove: (id) => adminApi.delete(`/admin/restaurants/${id}`),
  },
  dishes: {
    list: (params) => adminApi.get('/admin/dishes', { params }),
    create: (data) => adminApi.post('/admin/dishes', data),
    update: (id, data) => adminApi.put(`/admin/dishes/${id}`, data),
    remove: (id) => adminApi.delete(`/admin/dishes/${id}`),
  },
  orders: (params) => adminApi.get('/admin/orders', { params }),
  confirmPayment: (orderId, action) => adminApi.put(`/admin/orders/${orderId}/payment`, { action }),
  assignDriver: (orderId, driverId) => adminApi.put(`/admin/orders/${orderId}/assign-driver`, { driverId }),
  drivers: () => adminApi.get('/admin/drivers'),
  createDriver: (data) => adminApi.post('/admin/drivers', data),
  driverPerformance: () => adminApi.get('/admin/drivers/performance'),
  suspendDriver: (id) => adminApi.put(`/admin/drivers/${id}/suspend`),
  reactivateDriver: (id) => adminApi.put(`/admin/drivers/${id}/reactivate`),
  merchants: () => adminApi.get('/admin/merchants'),
  createMerchant: (data) => adminApi.post('/admin/merchants', data),
  aiStatus: () => adminApi.get('/ai/status'),
};

// Instance dédiée au restaurant partenaire (session indépendante de l'admin)
const merchantApi = axios.create({ baseURL: API_BASE, timeout: 10000 });
merchantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('wayi_merchant_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
merchantApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wayi_merchant_token');
      window.dispatchEvent(new CustomEvent('wayi:merchant_logout'));
    }
    return Promise.reject(err);
  }
);

export const merchantAPI = {
  login: (data) => merchantApi.post('/merchants/login', data),
  registerStart: (data) => merchantApi.post('/merchants/register/start', data),
  registerResend: (email) => merchantApi.post('/merchants/register/resend', { email }),
  registerVerify: (email, code) => merchantApi.post('/merchants/register/verify', { email, code }),
  changePassword: (currentPassword, newPassword) => merchantApi.put('/merchants/me/password', { currentPassword, newPassword }),
  dashboard: () => merchantApi.get('/merchants/dashboard'),
  orders: (params) => merchantApi.get('/merchants/orders', { params }),
  payout: () => merchantApi.get('/merchants/payout'),
  savePayout: (data) => merchantApi.put('/merchants/payout', data),
  decidePayment: (id, action) => merchantApi.put(`/merchants/orders/${id}/payment`, { action }),
  updateOrderStatus: (id, status) => merchantApi.put(`/merchants/orders/${id}/status`, { status }),
  availableDrivers: (orderId) => merchantApi.get(`/merchants/orders/${orderId}/available-drivers`),
  tracking: (orderId) => merchantApi.get(`/merchants/orders/${orderId}/tracking`),
  assignDriver: (orderId, driverId) => merchantApi.put(`/merchants/orders/${orderId}/assign-driver`, { driverId }),
  dishes: () => merchantApi.get('/merchants/dishes'),
  createDish: (data) => merchantApi.post('/merchants/dishes', data),
  updateDish: (id, data) => merchantApi.put(`/merchants/dishes/${id}`, data),
  removeDish: (id) => merchantApi.delete(`/merchants/dishes/${id}`),
  plans: () => merchantApi.get('/merchants/subscription/plans'),
  analytics: () => merchantApi.get('/merchants/analytics'),
};
