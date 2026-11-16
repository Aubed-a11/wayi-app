import axios from 'axios';

// En développement, /api passe par le proxy Vite. En production, VITE_API_URL doit
// pointer vers l'URL complète du backend déployé (ex : https://wayi-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const driverApi = axios.create({ baseURL: API_BASE, timeout: 10000 });

driverApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('wayi_driver_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

driverApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wayi_driver_token');
      window.dispatchEvent(new CustomEvent('wayi:driver_logout'));
    }
    return Promise.reject(err);
  }
);

export const driversAPI = {
  login: (data) => driverApi.post('/drivers/login', data),
  me: () => driverApi.get('/drivers/me'),
  dashboard: () => driverApi.get('/drivers/dashboard'),
  setStatus: (status, lat, lng) => driverApi.put('/drivers/status', { status, lat, lng }),
  updateLocation: (lat, lng) => driverApi.put('/drivers/location', { lat, lng }),
  acceptOrder: (orderId) => driverApi.put(`/drivers/orders/${orderId}/accept`),
  declineOrder: (orderId) => driverApi.put(`/drivers/orders/${orderId}/decline`),
  pickupOrder: (orderId) => driverApi.put(`/drivers/orders/${orderId}/pickup`),
  completeOrder: (orderId) => driverApi.put(`/drivers/orders/${orderId}/complete`),
  orders: () => driverApi.get('/drivers/orders'),
  capture: (data) => driverApi.post('/drivers/capture', data),
  changePassword: (currentPassword, newPassword) => driverApi.put('/drivers/me/password', { currentPassword, newPassword }),
};

export default driverApi;
