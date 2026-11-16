import { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { UNIFIED, backToWelcome } from './lib/handoff';

// Appli mobile : la connexion se fait sur l'ecran unique de WAYI
function ToWelcome() {
  useEffect(() => { backToWelcome(); }, []);
  return <div className="screen" />;
}
import OpsSplashScreen     from './screens/OpsSplashScreen';
import OpsLoginScreen      from './screens/OpsLoginScreen';
import AdminLoginScreen    from './screens/AdminLoginScreen';
import AdminScreen         from './screens/AdminScreen';
import MerchantLoginScreen from './screens/MerchantLoginScreen';
import MerchantScreen      from './screens/MerchantScreen';

export default function App() {
  const { state } = useApp();
  const screens = {
    splash:         <OpsSplashScreen />,
    ops_login:      <OpsLoginScreen />,
    admin_login:    <AdminLoginScreen />,
    admin:          <AdminScreen />,
    merchant_login: <MerchantLoginScreen />,
    merchant:       <MerchantScreen />,
  };
  if (UNIFIED) { screens.ops_login = <ToWelcome />; screens.admin_login = <ToWelcome />; screens.merchant_login = <ToWelcome />; }
  return <div className="app-shell">{screens[state.screen] || <OpsSplashScreen />}</div>;
}
