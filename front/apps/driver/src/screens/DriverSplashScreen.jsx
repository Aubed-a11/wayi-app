import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { UNIFIED } from '../lib/handoff';

// Palette prélevée directement sur les couleurs réelles du logo - voir
// apps/client/src/screens/SplashScreen.jsx pour le détail de la démarche.
const CREAM_BG      = '#FFF6EC';
const BURNT_ORANGE  = '#A8460D';
const VIVID_ORANGE  = '#E4632F';
const SOFT_TAN      = '#F0D2B4';

export default function DriverSplashScreen() {
  const { state, navigate } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(state.driverToken ? 'driver' : 'driver_login');
    }, UNIFIED ? 250 : 2000);
    return () => clearTimeout(timer);
  }, [state.driverToken]);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: CREAM_BG,
    }}>
      <img src="/icon-512.png" alt="WAYI" style={{
        height: 110, width: 110, borderRadius: 26, marginBottom: 22, animation: 'fadeUp 0.5s ease both',
        filter: 'drop-shadow(0 10px 20px rgba(168,70,13,0.16))',
      }} />
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: BURNT_ORANGE, animation: 'fadeUp 0.5s ease 0.15s both' }}>
        Espace livreur
      </div>
    </div>
  );
}
