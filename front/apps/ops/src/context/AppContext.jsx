import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { adminAPI, merchantAPI, shopAPI } from '../api';

const AppContext = createContext(null);

const initialState = {
  admin: null,
  adminToken: localStorage.getItem('wayi_admin_token'),
  merchant: null,
  merchantToken: localStorage.getItem('wayi_merchant_token'),
  shop: null,
  shopToken: localStorage.getItem('wayi_shop_token'),
  screen: 'splash',
  prevScreen: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADMIN_LOGIN':
      localStorage.setItem('wayi_admin_token', action.payload.token);
      return { ...state, admin: action.payload.admin, adminToken: action.payload.token };
    case 'ADMIN_LOGOUT':
      localStorage.removeItem('wayi_admin_token');
      return { ...state, admin: null, adminToken: null, screen: 'admin_login' };
    case 'MERCHANT_LOGIN':
      localStorage.setItem('wayi_merchant_token', action.payload.token);
      return { ...state, merchant: action.payload.merchant, merchantToken: action.payload.token };
    case 'MERCHANT_LOGOUT':
      localStorage.removeItem('wayi_merchant_token');
      return { ...state, merchant: null, merchantToken: null, screen: 'merchant_login' };
    case 'SHOP_LOGIN':
      localStorage.setItem('wayi_shop_token', action.payload.token);
      return { ...state, shop: action.payload.shop, shopToken: action.payload.token };
    case 'SHOP_LOGOUT':
      localStorage.removeItem('wayi_shop_token');
      return { ...state, shop: null, shopToken: null, screen: 'shop_login' };
    case 'NAVIGATE':
      return { ...state, screen: action.payload, prevScreen: state.screen };
    case 'GO_BACK':
      return { ...state, screen: state.prevScreen || 'ops_login', prevScreen: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const bootstrapAdmin = async () => {
      if (!state.adminToken) return;
      try {
        const { data } = await adminAPI.me();
        dispatch({ type: 'ADMIN_LOGIN', payload: { admin: data, token: state.adminToken } });
        dispatch({ type: 'NAVIGATE', payload: 'admin' });
      } catch {
        localStorage.removeItem('wayi_admin_token');
      }
    };
    bootstrapAdmin();
    const handleAdminLogout = () => dispatch({ type: 'ADMIN_LOGOUT' });
    window.addEventListener('wayi:admin_logout', handleAdminLogout);

    const bootstrapMerchant = async () => {
      if (!state.merchantToken) return;
      try {
        const { data } = await merchantAPI.dashboard();
        dispatch({ type: 'MERCHANT_LOGIN', payload: { merchant: data.merchant, token: state.merchantToken } });
        dispatch({ type: 'NAVIGATE', payload: 'merchant' });
      } catch {
        localStorage.removeItem('wayi_merchant_token');
      }
    };
    bootstrapMerchant();
    const bootstrapShop = async () => {
      if (!state.shopToken) return;
      try {
        const { data } = await shopAPI.me();
        dispatch({ type: 'SHOP_LOGIN', payload: { shop: data.shop, token: state.shopToken } });
        dispatch({ type: 'NAVIGATE', payload: 'shop' });
      } catch {
        localStorage.removeItem('wayi_shop_token');
      }
    };
    bootstrapShop();
    const handleShopLogout = () => dispatch({ type: 'SHOP_LOGOUT' });
    window.addEventListener('wayi:shop_logout', handleShopLogout);
    const handleMerchantLogout = () => dispatch({ type: 'MERCHANT_LOGOUT' });
    window.addEventListener('wayi:merchant_logout', handleMerchantLogout);

    return () => {
      window.removeEventListener('wayi:admin_logout', handleAdminLogout);
      window.removeEventListener('wayi:merchant_logout', handleMerchantLogout);
      window.removeEventListener('wayi:shop_logout', handleShopLogout);
    };
  }, []);

  const navigate = useCallback((screen) => dispatch({ type: 'NAVIGATE', payload: screen }), []);
  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), []);

  return (
    <AppContext.Provider value={{ state, dispatch, navigate, goBack }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
