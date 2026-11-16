import { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { UNIFIED, backToWelcome } from './lib/handoff';

// Appli mobile : la connexion se fait sur l'ecran unique de WAYI
function ToWelcome() {
  useEffect(() => { backToWelcome(); }, []);
  return <div className="screen" />;
}
import DriverSplashScreen from './screens/DriverSplashScreen';
import DriverLoginScreen from './screens/DriverLoginScreen';
import DriverScreen      from './screens/DriverScreen';

export default function App() {
  const { state } = useApp();
  const screens = {
    splash:       <DriverSplashScreen />,
    driver_login: <DriverLoginScreen />,
    driver:       <DriverScreen />,
  };
  if (UNIFIED) { screens.driver_login = <ToWelcome />; }
  return <div className="app-shell">{screens[state.screen] || <DriverSplashScreen />}</div>;
}
