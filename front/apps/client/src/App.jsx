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
// Univers Mode (charge seulement s'il est ouvert a ce compte)
const modeLoad = {
  home: () => import('./mode/ModeHomeScreen'),
  item: () => import('./mode/ModeItemScreen'),
  sell: () => import('./mode/ModeSellScreen'),
  inbox: () => import('./mode/ModeInboxScreen'),
  account: () => import('./mode/ModeAccountScreen'),
  order: () => import('./mode/ModeOrderScreen'),
  misc: () => import('./mode/ModeMiscScreens'),
};
const pick = (load, name) => lazy(() => load().then(m => ({ default: m[name] })));
const ModeHome = lazy(modeLoad.home);
const ModeItem = lazy(modeLoad.item);
const ModeSell = lazy(modeLoad.sell);
const ModeInbox = pick(modeLoad.inbox, 'ModeInboxScreen');
const ModeChat = pick(modeLoad.inbox, 'ModeChatScreen');
const ModeAccount = pick(modeLoad.account, 'ModeAccountScreen');
const ModeList = pick(modeLoad.account, 'ModeListScreen');
const ModeCheckout = pick(modeLoad.order, 'ModeCheckoutScreen');
const ModeOrder = pick(modeLoad.order, 'ModeOrderScreen');
const ModeSeller = pick(modeLoad.misc, 'ModeSellerScreen');
const ModeSoon = pick(modeLoad.misc, 'ModeSoonScreen');
const DishScreen    = lazy(loaders.dish);
const RestaurantScreen = lazy(loaders.restaurant);
const ExploreScreen = lazy(loaders.explore);
const AIScreen      = lazy(loaders.ai);
const CartScreen    = lazy(loaders.cart);
const TrackScreen   = lazy(loaders.track);
const ProfileScreen = lazy(loaders.profile);

export default function App() {
  const { state, dispatch, modeState, universe } = useApp();
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
  useEffect(() => {
    if (modeState === 'live') Object.values(modeLoad).forEach(l => l().catch(() => {}));
    document.title = modeState === 'hidden' ? document.title : 'WAYI Bénin';
  }, [modeState]);
  const live = modeState === 'live';
  const screens = {
    splash:  <SplashScreen />,
    welcome: <WelcomeScreen />,
    login:   <LoginScreen />,
    home:    universe === 'mode' ? <ModeHome /> : <HomeScreen />,
    dish:    <DishScreen />,
    restaurant: <RestaurantScreen />,
    explore: <ExploreScreen />,
    ai:      <AIScreen />,
    cart:    <CartScreen />,
    track:   <TrackScreen />,
    profile: <ProfileScreen />,
    ...(live ? {
      'mode-item': <ModeItem />, 'mode-sell': <ModeSell />, 'mode-inbox': <ModeInbox />, 'mode-chat': <ModeChat />,
      'mode-account': <ModeAccount />, 'mode-list': <ModeList />, 'mode-checkout': <ModeCheckout />,
      'mode-order': <ModeOrder />, 'mode-seller': <ModeSeller />,
    } : {}),
    ...(modeState === 'soon' ? { 'mode-soon': <ModeSoon /> } : {}),
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
