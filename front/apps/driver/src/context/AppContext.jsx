import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { driversAPI } from '../api';

const AppContext = createContext(null);

const initialState = {
  driver: null,
  driverToken: localStorage.getItem('wayi_driver_token'),
  screen: 'splash',
  prevScreen: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'DRIVER_LOGIN':
      localStorage.setItem('wayi_driver_token', action.payload.token);
      return { ...state, driver: action.payload.driver, driverToken: action.payload.token };
    case 'DRIVER_LOGOUT':
      localStorage.removeItem('wayi_driver_token');
      return { ...state, driver: null, driverToken: null, screen: 'driver_login' };
    case 'NAVIGATE':
      return { ...state, screen: action.payload, prevScreen: state.screen };
    case 'GO_BACK':
      return { ...state, screen: state.prevScreen || 'driver', prevScreen: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const bootstrap = async () => {
      if (!state.driverToken) return;
      try {
        const { data } = await driversAPI.me();
        dispatch({ type: 'DRIVER_LOGIN', payload: { driver: data, token: state.driverToken } });
        dispatch({ type: 'NAVIGATE', payload: 'driver' });
      } catch {
        localStorage.removeItem('wayi_driver_token');
      }
    };
    bootstrap();

    const handleLogout = () => dispatch({ type: 'DRIVER_LOGOUT' });
    window.addEventListener('wayi:driver_logout', handleLogout);
    return () => window.removeEventListener('wayi:driver_logout', handleLogout);
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
