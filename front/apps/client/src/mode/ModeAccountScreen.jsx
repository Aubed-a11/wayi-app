import { useEffect, useState } from 'react';
import { ShoppingBag, Tag, Heart, LayoutGrid, Settings, UtensilsCrossed, ChevronRight, Star, Package, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { ModeNav, ListingCard, Photo, Avatar, Empty, fcfa, dayLabel } from './shared';

const STATUS = {
  awaiting_payment: 'Paiement à confirmer', confirmed: 'Confirmée', handed: 'Remise au livreur',
  on_the_way: 'En route', delivered: 'Livrée', cancelled: 'Annulée',
};
const LSTATUS = { active: 'En ligne', paused: 'En pause', reserved: 'Réservée', sold: 'Vendue', hidden: 'Masquée' };

export function ModeAccountScreen() {
  const { state, navigate, dispatch } = useApp();
  const [mine, setMine] = useState(null);
  const [orders, setOrders] = useState({ purchases: [], sales: [] });
  const u = state.user || {};
  const initials = (u.name || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  useEffect(() => {
    modeAPI.mine().then(({ data }) => setMine(data)).catch(() => setMine({ listings: [], stats: {} }));
    modeAPI.orders().then(({ data }) => setOrders(data)).catch(() => {});
  }, []);
  const go = (tab) => { dispatch({ type: 'MODE_CTX', payload: { listTab: tab } }); navigate('mode-list'); };
  const live = (mine?.listings || []).filter(l => l.status === 'active').length;
  const pendingSales = orders.sales.filter(o => o.status === 'confirmed').length;
  const st = mine?.stats || {};

  const rows = [
    { tab: 'listings', label: 'Mes annonces', Icon: LayoutGrid, info: mine ? `${live} en ligne` : '' },
    { tab: 'sales', label: 'Mes ventes', Icon: Tag, info: pendingSales ? `${pendingSales} à remettre` : `${orders.sales.length}`, alert: pendingSales > 0 },
    { tab: 'purchases', label: 'Mes achats', Icon: ShoppingBag, info: `${orders.purchases.length}` },
    { tab: 'favorites', label: 'Mes favoris', Icon: Heart },
  ];

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-profile">
            <Avatar name={u.name} initials={initials} size={72} />
            <b>{u.name}</b>
            <small>{u.email || u.phone}</small>
          </div>
          <div className="md-stats">
            <div><b>{mine ? live : '-'}</b><span>Annonces</span></div>
            <div><b>{st.sales ?? '-'}</b><span>Ventes</span></div>
            <div><b>{st.rating ? String(st.rating).replace('.', ',') : '-'}</b><span>{st.reviewsCount ? `${st.reviewsCount} avis` : 'Note'}</span></div>
          </div>

          <div className="md-menu">
            {rows.map(({ tab, label, Icon, info, alert }) => (
              <button key={tab} onClick={() => go(tab)}>
                <span className="md-menu-ico"><Icon size={19} aria-hidden="true" /></span>
                <span className="md-menu-lbl">{label}</span>
                {info && <small className={alert ? 'alert' : ''}>{info}</small>}
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="md-menu">
            <button onClick={() => dispatch({ type: 'SET_UNIVERSE', payload: 'food' })}>
              <span className="md-menu-ico food"><UtensilsCrossed size={19} aria-hidden="true" /></span>
              <span className="md-menu-lbl">Aller sur WAYI Restaurant</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button onClick={() => navigate('profile')}>
              <span className="md-menu-ico"><Settings size={19} aria-hidden="true" /></span>
              <span className="md-menu-lbl">Mon compte WAYI</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <ModeNav />
    </div>
  );
}

const TITLES = { listings: 'Mes annonces', sales: 'Mes ventes', purchases: 'Mes achats', favorites: 'Mes favoris' };

export function ModeListScreen() {
  const { state, navigate, dispatch } = useApp();
  const tab = state.modeCtx.listTab || 'listings';
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const p = tab === 'listings' ? modeAPI.mine().then(r => r.data.listings)
      : tab === 'favorites' ? modeAPI.favorites().then(r => r.data.listings)
      : modeAPI.orders().then(r => r.data[tab]);
    p.then(setData).catch(() => setData([]));
  }, [tab]);

  const openListing = (l) => { dispatch({ type: 'MODE_CTX', payload: { listingId: l.id } }); navigate('mode-item'); };
  const openOrder = (o) => { dispatch({ type: 'MODE_CTX', payload: { orderId: o.id } }); navigate('mode-order'); };

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-bar"><BackBtn onBack={() => navigate('mode-account')} /><h1 className="md-title">{TITLES[tab]}</h1></div>
          <div className="md-tabs">
            {Object.entries(TITLES).map(([k, v]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => dispatch({ type: 'MODE_CTX', payload: { listTab: k } })}>{v.replace('Mes ', '')}</button>
            ))}
          </div>
          {data === null ? (
            [0, 1, 2].map(i => <div key={i} className="w-skel" style={{ height: 96, borderRadius: 18, marginTop: 12 }} />)
          ) : !data.length ? (
            tab === 'listings' ? <Empty title="Aucune annonce" text="Publie ta première annonce en deux minutes." action="Publier une annonce" onAction={() => navigate('mode-sell')} />
            : tab === 'favorites' ? <Empty icon={Heart} title="Aucun favori" text="Touche le cœur d'une annonce pour la retrouver ici." />
            : tab === 'sales' ? <Empty icon={Tag} title="Aucune vente" text="Tes ventes et leur suivi apparaîtront ici." />
            : <Empty icon={ShoppingBag} title="Aucun achat" text="Tes commandes Mode apparaîtront ici." />
          ) : tab === 'favorites' ? (
            <div className="md-grid">{data.map(l => <ListingCard key={l.id} listing={l} onOpen={openListing} />)}</div>
          ) : tab === 'listings' ? (
            <div className="md-rows-list">
              {data.map(l => (
                <button key={l.id} className="md-line" onClick={() => openListing(l)}>
                  <Photo src={l.photo} className="md-line-photo" iconSize={22} />
                  <span className="md-line-txt">
                    <b>{l.title}, {l.size}</b>
                    <span>{fcfa(l.price)}</span>
                    <small><Eye size={12} aria-hidden="true" /> {l.views} vue{l.views > 1 ? 's' : ''} · publiée {dayLabel(l.createdAt)}</small>
                  </span>
                  <span className={`md-pill ${l.status}`}>{LSTATUS[l.status] || l.status}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="md-rows-list">
              {data.map(o => (
                <button key={o.id} className="md-line" onClick={() => openOrder(o)}>
                  <Photo src={o.listing?.photo} className="md-line-photo" iconSize={22} />
                  <span className="md-line-txt">
                    <b>{o.listing?.title}</b>
                    <span>{fcfa(tab === 'sales' ? o.sellerAmount : o.total)}</span>
                    <small><Package size={12} aria-hidden="true" /> {o.number} · {dayLabel(o.createdAt)}</small>
                  </span>
                  <span className={`md-pill o-${o.status}`}>{STATUS[o.status] || o.status}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'sales' && data?.length > 0 && (
            <p className="md-hint" style={{ marginTop: 14 }}><Star size={12} aria-hidden="true" /> Le montant affiché est ce que tu reçois, commission WAYI déduite.</p>
          )}
        </div>
      </div>
      <ModeNav />
    </div>
  );
}
