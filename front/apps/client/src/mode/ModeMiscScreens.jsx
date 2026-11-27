import { useEffect, useState } from 'react';
import { Shirt, EyeOff, Smartphone, MessageCircle, ShieldCheck, Tag, BadgeCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { Avatar, Stars, ListingCard, Empty, dayLabel } from './shared';

export function ModeSellerScreen() {
  const { state, navigate, dispatch } = useApp();
  const id = state.modeCtx.listingId;
  const [d, setD] = useState(null);
  useEffect(() => { modeAPI.seller(id).then(({ data }) => setD(data)).catch(() => setD(false)); }, [id]);
  const open = (l) => { dispatch({ type: 'MODE_CTX', payload: { listingId: l.id } }); navigate('mode-item'); };

  if (d === false) return <div className="screen md-screen"><StatusBar /><div className="md-bar w-pad"><BackBtn /></div><Empty title="Vendeur introuvable" /></div>;
  const s = d?.seller;
  const totalReviews = d ? d.distribution.reduce((a, x) => a + x.count, 0) : 0;
  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-bar"><BackBtn /><h1 className="md-title">{d?.seller?.shop ? 'La boutique' : 'Avis sur ce vendeur'}</h1></div>
          {!d ? <div className="w-skel" style={{ height: 220, borderRadius: 24 }} /> : (
            <>
              <div className="md-seller-card">
                <Avatar name={s.name} initials={s.initials} anonymous={s.anonymous && !s.id} shop={s.shop} size={64} />
                <div>
                  <b>{s.name}</b>
                  <span className="md-seller-rate">
                    {s.rating ? <><Stars value={s.rating} /> <strong>{String(s.rating).replace('.', ',')}/5</strong> ({s.reviewsCount} avis)</> : 'Pas encore noté'}
                  </span>
                  <small>{s.sales} vente{s.sales > 1 ? 's' : ''} sur WAYI Mode</small>
                </div>
              </div>
              {s.shop && <div className="md-note ok"><BadgeCheck size={15} aria-hidden="true" /> Boutique partenaire vérifiée par WAYI : articles neufs, stock suivi et commandes préparées par la boutique.</div>}
              {s.anonymous && !s.id && <div className="md-note"><EyeOff size={15} aria-hidden="true" /> Ce vendeur a choisi la vente anonyme : seuls sa note et ses avis sont visibles.</div>}

              {totalReviews > 0 && (
                <div className="md-dist">
                  {d.distribution.map(x => (
                    <div key={x.stars}>
                      <span>{x.stars} étoile{x.stars > 1 ? 's' : ''}</span>
                      <i><em style={{ width: `${Math.round((x.count / totalReviews) * 100)}%` }} /></i>
                      <small>{Math.round((x.count / totalReviews) * 100)} %</small>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="md-h3">Avis</h3>
              {d.reviews.length ? (
                <div className="md-reviews">
                  {d.reviews.map(r => (
                    <div key={r.id} className="md-rev">
                      <Avatar name={r.author} size={38} />
                      <div>
                        <span className="md-rev-top"><b>{r.author}</b><small>{dayLabel(r.createdAt)}</small></span>
                        <Stars value={r.rating} size={13} />
                        {r.comment && <p>{r.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="md-hint">Aucun avis pour le moment.</p>}

              {d.listings.length > 0 && (
                <>
                  <h3 className="md-h3">{s.shop ? 'Plus d\'articles de cette boutique' : 'Ses autres annonces'}</h3>
                  <div className="md-grid">{d.listings.map(l => <ListingCard key={l.id} listing={l} onOpen={open} />)}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Univers annoncé mais pas encore ouvert (état « Bientôt » dans le back office)
export function ModeSoonScreen() {
  const { navigate } = useApp();
  const points = [
    { Icon: Tag, t: 'Neuf, non porté et occasion', d: 'Robes, pagnes, chaussures, sacs : vends ce que tu ne portes plus.' },
    { Icon: EyeOff, t: 'Vente publique ou anonyme', d: 'Tu choisis si ton prénom apparaît sur tes annonces.' },
    { Icon: MessageCircle, t: 'Messagerie intégrée', d: 'Pose tes questions au vendeur avant d\'acheter.' },
    { Icon: Smartphone, t: 'MoMo, Moov, Celtiis ou à la livraison', d: 'Livraison par les livreurs WAYI partout dans ta ville.' },
    { Icon: ShieldCheck, t: 'Paiement protégé', d: 'Le vendeur est payé seulement après la livraison.' },
  ];
  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-bar"><BackBtn onBack={() => navigate('home')} /></div>
          <div className="md-soon">
            <span className="md-soon-ico"><Shirt size={44} strokeWidth={1.5} aria-hidden="true" /></span>
            <small>WAYI Bénin</small>
            <h1>WAYI Mode arrive bientôt</h1>
            <p>Achète et vends de la mode neuve et d'occasion, aussi simplement que tu commandes ton repas.</p>
          </div>
          <div className="md-soon-list">
            {points.map(({ Icon, t, d }) => (
              <div key={t}>
                <span><Icon size={20} aria-hidden="true" /></span>
                <p><b>{t}</b>{d}</p>
              </div>
            ))}
          </div>
          <button className="md-btn wide big" onClick={() => navigate('home')}>Continuer sur WAYI Restaurant</button>
        </div>
      </div>
    </div>
  );
}
