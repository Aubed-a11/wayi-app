import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { authAPI, ordersAPI } from '../api';
import { getSocket } from '../socket';

const AppContext = createContext(null);

const initialState = {
  user: null,
  token: localStorage.getItem('wayi_token'),
  authLoading: true,
  // Cart - peut contenir des plats de plusieurs restaurants
  cart: [],
  // Navigation
  screen: 'splash',
  prevScreen: null,
  // Active dish / order
  activeDish: null,
  activeOrders: null,
  // Moyen de paiement choisi avec Yivi, pre-selectionne a l'ouverture du panier
  checkoutPreset: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, authLoading: false };
    case 'SET_AUTH_LOADING':
      return { ...state, authLoading: action.payload };
    case 'LOGIN':
      localStorage.setItem('wayi_token', action.payload.token);
      return { ...state, user: action.payload.user, token: action.payload.token };
    case 'LOGOUT':
      localStorage.removeItem('wayi_token');
      return { ...state, user: null, token: null, cart: [], screen: 'login' };
    case 'NAVIGATE':
      return { ...state, screen: action.payload, prevScreen: state.screen };
    case 'GO_BACK':
      return { ...state, screen: state.prevScreen || 'home', prevScreen: null };
    case 'SET_ACTIVE_DISH':
      return { ...state, activeDish: action.payload };
    case 'SET_ACTIVE_ORDERS':
      return { ...state, activeOrders: action.payload };
    case 'CART_ADD': {
      const { item } = action.payload;
      const existing = state.cart.find(c => c.id === item.id);
      if (existing) {
        return { ...state, cart: state.cart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c) };
      }
      return { ...state, cart: [...state.cart, { ...item, qty: 1 }] };
    }
    case 'CART_REMOVE': {
      const existing = state.cart.find(c => c.id === action.payload);
      if (existing?.qty > 1) {
        return { ...state, cart: state.cart.map(c => c.id === action.payload ? { ...c, qty: c.qty - 1 } : c) };
      }
      return { ...state, cart: state.cart.filter(c => c.id !== action.payload) };
    }
    case 'CART_CLEAR':
      return { ...state, cart: [] };
    // Panier complet renvoye par Yivi (deja revalide par le serveur)
    case 'CART_SET':
      return { ...state, cart: (action.payload || []).filter(c => c && c.id && c.qty > 0) };
    case 'SET_CHECKOUT_PRESET':
      return { ...state, checkoutPreset: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const bootstrap = async () => {
      if (!state.token) {
        dispatch({ type: 'SET_AUTH_LOADING', payload: false });
        return;
      }
      try {
        const { data } = await authAPI.me();
        dispatch({ type: 'SET_USER', payload: data });
      } catch {
        localStorage.removeItem('wayi_token');
        dispatch({ type: 'SET_USER', payload: null });
      }
    };
    bootstrap();

    const handleLogout = () => dispatch({ type: 'LOGOUT' });
    window.addEventListener('wayi:logout', handleLogout);
    return () => window.removeEventListener('wayi:logout', handleLogout);
  }, []);

  const navigate = useCallback((screen) => dispatch({ type: 'NAVIGATE', payload: screen }), []);
  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), []);

  // ── Notifications globales ────────────────────────────────
  const lastStatusRef = useRef({});
  const STATUS_TOAST = {
    confirmed:  { label: 'Commande confirmée' },
    preparing:  { label: 'Ta commande est en préparation' },
    on_the_way: { label: 'Ton livreur est en route !' },
    delivered:  { label: 'Commande livrée. Bon appétit !' },
    cancelled:  { label: 'Commande annulée' },
  };

  useEffect(() => {
    if (!state.user || !state.token) return;
    let socket;
    let joinedIds = [];
    let cancelled = false;

    const handleStatusChanged = (payload) => {
      const { orderId, status, message } = payload;
      if (!status || lastStatusRef.current[orderId] === status) return;
      lastStatusRef.current[orderId] = status;
      const info = STATUS_TOAST[status];
      if (info) toast(info.label, { duration: 4000 });
      else if (message) toast(message, { duration: 4000 });
      if (['delivered', 'cancelled'].includes(status) && socket) socket.emit('leave:order', { orderId });
    };

    const setup = async () => {
      try {
        const { data } = await ordersAPI.list();
        const active = (data?.orders || []).filter(o => !['delivered', 'cancelled'].includes(o.status));
        if (cancelled) return;
        joinedIds = active.map(o => o.id);
        active.forEach(o => { lastStatusRef.current[o.id] = o.status; });
        socket = getSocket(state.token);
        joinedIds.forEach(id => socket.emit('join:order', { orderId: id }));
        socket.on('order:status_changed', handleStatusChanged);
      } catch {}
    };
    setup();

    return () => {
      cancelled = true;
      if (socket) {
        joinedIds.forEach(id => socket.emit('leave:order', { orderId: id }));
        socket.off('order:status_changed', handleStatusChanged);
      }
    };
  }, [state.user, state.token, state.activeOrders]);

  const cartCount = state.cart.reduce((s, c) => s + c.qty, 0);
  const cartTotal = state.cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartByRestaurant = Object.values(
    state.cart.reduce((acc, item) => {
      const key = item.restaurantId;
      if (!acc[key]) acc[key] = { restaurantId: item.restaurantId, restaurantName: item.restaurantName, restaurantIcon: item.restaurantIcon, items: [] };
      acc[key].items.push(item);
      return acc;
    }, {})
  );

  const toggleFavorite = useCallback(async (dish) => {
    const isFav = (state.user?.favoriteDishes || []).includes(dish.id);
    // Mise à jour optimiste : l'UI réagit tout de suite, corrigée si l'appel échoue
    const previous = state.user?.favoriteDishes || [];
    const next = isFav ? previous.filter(id => id !== dish.id) : [...previous, dish.id];
    dispatch({ type: 'SET_USER', payload: { ...state.user, favoriteDishes: next } });
    try {
      if (isFav) await authAPI.removeFavorite(dish.id);
      else await authAPI.addFavorite(dish.id);
    } catch {
      dispatch({ type: 'SET_USER', payload: { ...state.user, favoriteDishes: previous } });
      toast.error("Impossible de mettre à jour tes favoris pour le moment.");
    }
  }, [state.user, dispatch]);

  return (
    <AppContext.Provider value={{ state, dispatch, navigate, goBack, cartCount, cartTotal, cartByRestaurant, toggleFavorite }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
