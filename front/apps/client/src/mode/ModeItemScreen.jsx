import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Heart, Share2, Flag, Truck, BadgeCheck, MapPin, Clock, Eye, Pencil, PauseCircle, PlayCircle, Trash2, ChevronRight, Star, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { Photo, Avatar, Sheet, Empty, fcfa, dayLabel, errMsg, useModeFavorite } from './shared';

export default function ModeItemScreen() {
  const { state, navigate, dispatch } = useApp();
  const id = state.modeCtx.listingId;
  const [l, setL] = useState(null);
  const [missing, setMissing] = useState(false);
  const [idx, setIdx] = useState(0);
  const [fav, setFav] = useState(false);
  const [report, setReport] = useState(false);
  const [reasons, setReasons] = useState([]);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState('');
  const gallery = useRef(null);
  const toggleFav = useModeFavorite();

  const load = () => modeAPI.listing(id)
    .then(({ data }) => { setL(data.listing); setFav(!!data.listing.favorite); })
    .catch(() => setMissing(true));
  useEffect(() => { if (id) load(); else setMissing(true); }, [id]);

  const onScroll = () => {
    const g = gallery.current;
    if (g) setIdx(Math.round(g.scrollLeft / g.clientWidth));
  };

  const share = async () => {
    const text = `${l.title}, ${fcfa(l.price)} sur WAYI Mode`;
    try {
      if (navigator.share) await navigator.share({ title: 'WAYI Mode', text, url: window.location.origin });
      else { await navigator.clipboard.writeText(`${text} : ${window.location.origin}`); toast('Lien copié'); }
    } catch { /* partage annulé */ }
  };

  const write = async () => {
    setBusy(true);
    try {
      const { data } = await modeAPI.startConversation(l.id, '');
      dispatch({ type: 'MODE_CTX', payload: { convId: data.conversation.id } });
      navigate('mode-chat');
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const openReport = async () => {
    setReport(true);
    if (!reasons.length) modeAPI.meta().then(({ data }) => setReasons(data.reasons || [])).catch(() => {});
  };
  const sendReport = async () => {
    if (!reason) return;
    setBusy(true);
    try { await modeAPI.report(l.id, reason, details); setReport(false); toast('Merci, WAYI va vérifier cette annonce.'); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try { const { data } = await modeAPI.update(l.id, { status }); setL(data.listing); toast(status === 'paused' ? 'Annonce mise en pause' : 'Annonce remise en ligne'); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Supprimer définitivement cette annonce ?')) return;
    setBusy(true);
    try { await modeAPI.remove(l.id); toast('Annonce supprimée'); navigate('mode-account'); }
    catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  if (missing) {
    return (
      <div className="screen md-screen">
        <div className="md-bar"><BackBtn /></div>
        <Empty title="Annonce indisponible" text="Elle a peut-être été vendue ou retirée par son vendeur." action="Voir les autres annonces" onAction={() => navigate('home')} />
      </div>
    );
  }
  if (!l) return <div className="screen md-screen"><div className="w-skel" style={{ height: '58vh', borderRadius: 0 }} /></div>;

  const photos = l.photos.length ? l.photos : [null];
  const buy = () => {
    if (l.variants && !size) { toast('Choisis ta taille'); document.querySelector('.md-sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    dispatch({ type: 'MODE_CTX', payload: { size: l.variants ? size : null } });
    navigate('mode-checkout');
  };
  const s = l.seller;
  const available = l.status === 'active';

  return (
    <div className="screen md-screen">
      <div className="w-scroll" style={{ paddingBottom: 150 }}>
        <div className="md-gallery-wrap">
          <div className="md-gallery" ref={gallery} onScroll={onScroll}>
            {photos.map((p, i) => <Photo key={i} src={p} className="md-gallery-photo" iconSize={64} />)}
          </div>
          <div className="md-gallery-top">
            <BackBtn light />
            <span style={{ flex: 1 }} />
            {!l.mine && (
              <button className={`md-round${fav ? ' fav' : ''}`} onClick={() => toggleFav({ ...l, favorite: fav }, setFav)} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                <Heart size={19} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            )}
            <button className="md-round" onClick={share} aria-label="Partager"><Share2 size={18} aria-hidden="true" /></button>
          </div>
          {photos.length > 1 && <span className="md-count">{idx + 1}/{photos.length}</span>}
          {photos.length > 1 && (
            <div className="md-dots">{photos.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}</div>
          )}
        </div>

        <div className="w-pad md-item">
          {l.status !== 'active' && (
            <div className="md-note warn">
              {l.status === 'reserved' ? 'Cet article est réservé : une commande est en cours.'
                : l.status === 'sold' ? 'Cet article a été vendu.'
                : l.status === 'paused' ? 'Annonce en pause : elle n\'est pas visible des acheteurs.'
                : 'Annonce masquée par la modération WAYI.'}
            </div>
          )}
          <h1 className="md-item-title">{l.variants ? l.title : `${l.title}, ${l.size}`}</h1>
          <div className="md-item-price">{fcfa(l.price)}</div>
          {l.variants && (
            <div className="md-sizes" role="radiogroup" aria-label="Taille">
              <span className="md-sizes-lbl">Choisis ta taille</span>
              <div>
                {l.variants.map(v => (
                  <button key={v.size} role="radio" aria-checked={size === v.size} disabled={!v.available || l.mine} className={size === v.size ? 'on' : ''} onClick={() => setSize(v.size)}>
                    {v.size}
                    {l.mine ? <small>{v.qty} en stock</small> : !v.available ? <small>Épuisé</small> : v.low ? <small>Dernières pièces</small> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="md-item-meta">
            <span>{l.conditionLabel}</span><i />
            <span><MapPin size={13} aria-hidden="true" /> {l.city}</span><i />
            <span><Clock size={13} aria-hidden="true" /> Publiée {dayLabel(l.createdAt)}</span>
          </div>

          <button className="md-seller" onClick={() => navigate('mode-seller')}>
            <Avatar name={s.name} initials={s.initials} anonymous={s.anonymous && !l.mine} shop={s.shop} />
            <span className="md-seller-txt">
              <b>{l.mine && !s.shop ? 'Toi' : s.name}{l.mine && l.anonymous ? ' (vente anonyme)' : ''}</b>
              {s.shop && <span className="md-verified"><BadgeCheck size={13} aria-hidden="true" /> Vérifiée par WAYI</span>}
              <small>
                {s.rating ? <><Star size={13} fill="currentColor" aria-hidden="true" /> {String(s.rating).replace('.', ',')} / 5 · </> : 'Nouveau vendeur · '}
                {s.sales} vente{s.sales > 1 ? 's' : ''}{l.city ? ` · ${l.city}` : ''}
              </small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>

          <div className="md-facts">
            <div><BadgeCheck size={20} aria-hidden="true" /><span>État</span><b>{l.conditionLabel}</b></div>
            <div><Truck size={20} aria-hidden="true" /><span>Livraison</span><b>{fcfa(l.deliveryFee)}</b></div>
            <div><Eye size={20} aria-hidden="true" /><span>Vues</span><b>{l.views}</b></div>
          </div>

          {l.description && (
            <>
              <h3 className="md-h3">Description</h3>
              <p className="md-desc">{l.description}</p>
            </>
          )}
          <h3 className="md-h3">Détails</h3>
          <div className="md-rows">
            <div><span>Catégorie</span><b>{l.categoryLabel}</b></div>
            <div><span>{l.variants ? 'Tailles' : 'Taille'}</span><b>{l.variants ? l.variants.map(v => v.size).join(', ') : l.size}</b></div>
            <div><span>Ville</span><b>{l.city}</b></div>
          </div>

          <div className="md-safe">
            <ShieldCheck size={22} aria-hidden="true" />
            <p>Paie toujours via WAYI : ton argent n'est versé au vendeur qu'après la livraison.</p>
          </div>

          {!l.mine && (
            <button className="md-report" onClick={openReport}><Flag size={15} aria-hidden="true" /> Signaler cette annonce</button>
          )}
        </div>
      </div>

      <div className="md-actions">
        {l.mine ? (
          <>
            <button className="md-btn ghost" disabled={busy} onClick={() => { dispatch({ type: 'MODE_CTX', payload: { editId: l.id } }); navigate('mode-sell'); }}><Pencil size={16} aria-hidden="true" /> Modifier</button>
            {['active', 'paused'].includes(l.status) && (
              <button className="md-btn ghost" disabled={busy} onClick={() => setStatus(l.status === 'active' ? 'paused' : 'active')}>
                {l.status === 'active' ? <><PauseCircle size={16} aria-hidden="true" /> Pause</> : <><PlayCircle size={16} aria-hidden="true" /> Remettre</>}
              </button>
            )}
            {l.status !== 'reserved' && <button className="md-btn ghost danger icon" disabled={busy} onClick={remove} aria-label="Supprimer"><Trash2 size={18} aria-hidden="true" /></button>}
          </>
        ) : (
          <>
            <button className="md-btn ghost" disabled={busy || !['active', 'reserved'].includes(l.status)} onClick={write}>Écrire au vendeur</button>
            <button className="md-btn" disabled={!available} onClick={buy}>{available ? 'Acheter' : l.status === 'sold' ? (l.shop ? 'Épuisé' : 'Vendu') : 'Réservé'}</button>
          </>
        )}
      </div>

      {report && (
        <Sheet title="Signaler cette annonce" onClose={() => setReport(false)}>
          <div className="md-opts">
            {reasons.map(r => (
              <button key={r.id} className={`md-opt${reason === r.id ? ' on' : ''}`} onClick={() => setReason(r.id)}>{r.label}</button>
            ))}
          </div>
          <textarea className="md-input" rows={3} placeholder="Détails (facultatif)" value={details} onChange={e => setDetails(e.target.value)} />
          <button className="md-btn wide" disabled={!reason || busy} onClick={sendReport}>Envoyer le signalement</button>
        </Sheet>
      )}
    </div>
  );
}
