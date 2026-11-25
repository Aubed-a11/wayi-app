import { Toaster } from 'react-hot-toast';
import { useApp } from './context/AppContext';
import SplashScreen  from './screens/SplashScreen';
import LoginScreen   from './screens/LoginScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import HomeScreen    from './screens/HomeScreen';
import { lazy, Suspense, useEffect } from 'react';
import { setBackHandler } from './lib/native';

// Ecrans secondaires charges a la demande : l'accueil s'affiche plus vite.
// Ils sont precharges en arriere-plan juste apres le premier affichage.
const loaders = {
  dish:    () => import('./screens/DishScreen'),
  restaurant: () => import('./screens/RestaurantScreen'),
  explore: () => import('./screens/ExploreScreen'),
  ai:      () => import('./screens/AIScreen'),
  cart:    () => import('./screens/CartScreen'),
  track:   () => import('./screens/TrackScreen'),
  profile: () => import('./screens/ProfileScreen'),
};
const DishScreen    = lazy(loaders.dish);
const RestaurantScreen = lazy(loaders.restaurant);
const ExploreScreen = lazy(loaders.explore);
const AIScreen      = lazy(loaders.ai);
const CartScreen    = lazy(loaders.cart);
const TrackScreen   = lazy(loaders.track);
const ProfileScreen = lazy(loaders.profile);

export default function App() {
  const { state, dispatch } = useApp();
  // Bouton Retour d'Android : ecran precedent, ou accueil, puis l'appli passe en arriere-plan
  useEffect(() => {
    setBackHandler(() => {
      if (['home', 'login', 'splash', 'welcome'].includes(state.screen)) return false;
      dispatch({ type: 'GO_BACK' });
      return true;
    });
  }, [state.screen, dispatch]);
  useEffect(() => {
    const t = setTimeout(() => Object.values(loaders).forEach(l => l().catch(() => {})), 1500);
    return () => clearTimeout(t);
  }, []);
  const screens = {
    splash:  <SplashScreen />,
    welcome: <WelcomeScreen />,
    login:   <LoginScreen />,
    home:    <HomeScreen />,
    dish:    <DishScreen />,
    restaurant: <RestaurantScreen />,
    explore: <ExploreScreen />,
    ai:      <AIScreen />,
    cart:    <CartScreen />,
    track:   <TrackScreen />,
    profile: <ProfileScreen />,
  };
  return (
    <div className="app-shell">
      <Toaster position="bottom-center" containerStyle={{ bottom: 170 }} toastOptions={{
        style: { fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, borderRadius: 12 },
        duration: 4000,
      }} />
      <Suspense fallback={<div className="screen" />}>
        {screens[state.screen] || <HomeScreen />}
      </Suspense>
    </div>
  );
}
