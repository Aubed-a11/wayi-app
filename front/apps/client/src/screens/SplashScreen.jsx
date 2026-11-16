import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

// Ecran de demarrage : aplat orange, logo, slogan. Rien d'autre.
export default function SplashScreen() {
  const { state, navigate } = useApp();

  useEffect(() => {
    if (state.authLoading) return undefined;
    const timer = setTimeout(() => navigate(state.user ? 'home' : 'login'), 1400);
    return () => clearTimeout(timer);
  }, [state.user, state.authLoading, navigate]);

  return (
    <div className="w-splash">
      <div className="w-splash-logo"><img src="/icon-512.png" alt="WAYI" /></div>
      <p>Le goût livré,<br />la qualité certifiée</p>
    </div>
  );
}
