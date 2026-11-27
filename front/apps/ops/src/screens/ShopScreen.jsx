// Espace des boutiques partenaires de l'univers Mode (WAYI Bénin)
// La boutique publie ses articles (tailles et stock), prépare les commandes et répond aux clients.
// Les clients voient « Boutique partenaire WAYI » : le nom de la boutique ne leur est jamais montré.
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard, Shirt, Receipt, MessageCircle, LogOut, RefreshCw, Plus, Pencil, Trash2, PauseCircle, PlayCircle,
  X, ImagePlus, Package, Wallet, Star, Boxes, Truck, SendHorizontal, EyeOff, Check, Loader2, KeyRound,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { shopAPI } from '../api';
import '../admin.css';

const money = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const err = (e, f = 'Action impossible') => e?.response?.data?.error || f;
const NAV = [
  ['dashboard', 'Tableau de bord', LayoutDashboard],
  ['articles', 'Articles', Shirt],
  ['orders', 'Commandes', Receipt],
  ['messages', 'Messages', MessageCircle],
];
const TITLES = {
  dashboard: ['Tableau de bord', 'Ton activité sur WAYI Mode'],
  articles: ['Articles', 'Tes articles, leurs tailles et ton stock'],
  orders: ['Commandes', 'Les commandes que WAYI t\'envoie, à préparer pour le livreur'],
  messages: ['Messages', 'Les questions des clients sur tes articles'],
};
const ORDER_LABEL = { awaiting_payment: 'Paiement en attente', confirmed: 'À préparer', handed: 'Remise au livreur', on_the_way: 'En route', delivered: 'Livrée', cancelled: 'Annulée' };
const ORDER_TONE = { awaiting_payment: 'wait', confirmed: 'info', handed: 'go', on_the_way: 'go', delivered: 'ok', cancelled: 'ko' };
const LIST_LABEL = { active: 'En ligne', paused: 'En pause', sold: 'Épuisé', hidden: 'Masqué par WAYI' };
const LIST_TONE = { active: 'ok', paused: 'wait', sold: 'ko', hidden: 'ko' };
const QUICK_SIZES = [['S', 'M', 'L', 'XL'], ['38', '40', '42', '44'], ['Taille unique']];

function compressImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function Modal({ title, onClose, children }) {
  return (
    <div className="bo-modal" onClick={onClose}>
      <div className="bo-modal-card" onClick={e => e.stopPropagation()}>
        <div className="bo-modal-head">
          <h3>{title}</h3>
          <button className="bo-icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="bo-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ShopLoginScreen() {
  const { dispatch, navigate } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await shopAPI.login({ email: email.trim(), password });
      dispatch({ type: 'SHOP_LOGIN', payload: { shop: data.shop, token: data.token } });
      navigate('shop');
    } catch (e2) { setError(err(e2, 'Connexion impossible')); }
    finally { setBusy(false); }
  };
  return (
    <div className="sh-login">
      <form className="sh-login-card" onSubmit={submit}>
        <img src="/logo.png" alt="WAYI" />
        <h1>Espace boutique</h1>
        <p>WAYI Mode : publie tes articles et prépare tes commandes.</p>
        <div className="bo-form">
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {error && <div className="bo-notice ko">{error}</div>}
          <button className="bo-btn full" disabled={busy}>{busy ? 'Connexion...' : 'Me connecter'}</button>
          <button type="button" className="bo-link" onClick={() => navigate('ops_login')}>Retour</button>
        </div>
      </form>
    </div>
  );
}

const EMPTY = { title: '', category: '', condition: 'neuf', price: '', description: '', photos: [], variants: [{ size: '', qty: '' }] };

function ArticleForm({ meta, shop, initial, onDone, toast }) {
  const [f, setF] = useState(initial ? {
    title: initial.title, category: initial.category, condition: initial.condition, price: String(initial.price),
    description: initial.description || '', photos: initial.photos || [], variants: (initial.variants || []).map(v => ({ size: v.size, qty: String(v.qty) })),
  } : EMPTY);
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setError(''); };
  const max = meta?.maxPhotos || 8;

  const addPhotos = async (files) => {
    const list = Array.from(files || []).slice(0, max - f.photos.length);
    setUploading(n => n + list.length);
    for (const file of list) {
      try {
        const data = await compressImage(file);
        const { data: r } = await shopAPI.photo(data, 'jpg');
        setF(x => ({ ...x, photos: [...x.photos, r.url].slice(0, max) }));
      } catch (e) { setError(err(e, "Une photo n'a pas pu être envoyée.")); }
      finally { setUploading(n => n - 1); }
    }
  };
  const setVariant = (i, k, v) => set('variants', f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const quick = (sizes) => {
    const existing = f.variants.filter(v => v.size);
    set('variants', [...existing, ...sizes.filter(s => !existing.some(v => v.size === s)).map(s => ({ size: s, qty: '1' }))]);
  };

  const save = async () => {
    const variants = f.variants.filter(v => v.size.trim()).map(v => ({ size: v.size.trim(), qty: Number(v.qty) || 0 }));
    const price = Number(String(f.price).replace(/\D/g, ''));
    const miss = !f.photos.length ? 'Ajoute au moins une photo.' : f.title.trim().length < 3 ? 'Donne un nom à l\'article.'
      : !f.category ? 'Choisis une catégorie.' : !(price >= 100) ? 'Indique le prix.' : !variants.length ? 'Ajoute au moins une taille.'
      : !initial && !variants.some(v => v.qty > 0) ? 'Indique la quantité en stock.' : '';
    if (miss) { setError(miss); return; }
    setSaving(true);
    try {
      const body = { title: f.title, category: f.category, condition: f.condition, price, description: f.description, photos: f.photos, variants, city: shop.city || 'Cotonou' };
      if (initial) await shopAPI.update(initial.id, body); else await shopAPI.create(body);
      toast(initial ? 'Article mis à jour' : 'Article publié');
      onDone();
    } catch (e) { setError(err(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="bo-form">
      <div className="sh-photos">
        {f.photos.map((p, i) => (
          <div key={p} className="sh-photo" style={{ backgroundImage: `url("${p}")` }}>
            {i === 0 && <span>Couverture</span>}
            <button type="button" onClick={() => set('photos', f.photos.filter(x => x !== p))} aria-label="Retirer"><X size={13} /></button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => <div key={'u' + i} className="sh-photo wait"><Loader2 size={20} className="spin" /></div>)}
        {f.photos.length + uploading < max && (
          <button type="button" className="sh-photo add" onClick={() => fileRef.current?.click()}><ImagePlus size={22} /><small>{f.photos.length ? 'Ajouter' : `Jusqu'à ${max} photos`}</small></button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
      </div>
      <label>Nom de l'article<input value={f.title} maxLength={80} placeholder="Ex. : robe en bazin brodée" onChange={e => set('title', e.target.value)} /></label>
      <div className="two">
        <label>Catégorie
          <select value={f.category} onChange={e => set('category', e.target.value)}>
            <option value="">Choisir</option>
            {meta?.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label>Prix (FCFA)<input inputMode="numeric" value={f.price} placeholder="25 000" onChange={e => set('price', e.target.value.replace(/[^\d ]/g, ''))} /></label>
      </div>
      <label>État
        <select value={f.condition} onChange={e => set('condition', e.target.value)}>
          {meta?.conditions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div className="sh-variants">
        <div className="sh-variants-head"><b>Tailles et stock</b>
          <span>{QUICK_SIZES.map(q => <button type="button" key={q.join()} className="bo-link" onClick={() => quick(q)}>+ {q.join(' ')}</button>)}</span>
        </div>
        {f.variants.map((v, i) => (
          <div key={i} className="sh-variant">
            <input list="sh-sizes" placeholder="Taille" value={v.size} onChange={e => setVariant(i, 'size', e.target.value)} />
            <input inputMode="numeric" placeholder="Qté" value={v.qty} onChange={e => setVariant(i, 'qty', e.target.value.replace(/\D/g, ''))} />
            <button type="button" className="bo-icon-btn" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))} aria-label="Retirer la taille"><X size={15} /></button>
          </div>
        ))}
        <datalist id="sh-sizes">{meta?.sizes.map(s => <option key={s} value={s} />)}</datalist>
        <button type="button" className="bo-btn ghost" onClick={() => set('variants', [...f.variants, { size: '', qty: '' }])}><Plus size={14} /> Ajouter une taille</button>
      </div>
      <label>Description<textarea rows={3} maxLength={1500} value={f.description} placeholder="Matière, coupe, entretien..." onChange={e => set('description', e.target.value)} /></label>
      {error && <div className="bo-notice ko">{error}</div>}
      <button className="bo-btn full" disabled={saving || uploading > 0} onClick={save}>{saving ? 'Enregistrement...' : initial ? 'Enregistrer' : 'Publier l\'article'}</button>
    </div>
  );
}

export default function ShopScreen() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('dashboard');
  const [me, setMe] = useState(null);
  const [items, setItems] = useState(null);
  const [orders, setOrders] = useState(null);
  const [convs, setConvs] = useState(null);
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(null); // null | 'new' | article
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useCallback((t, k = 'ok') => { setMsg({ t, k }); clearTimeout(window.__shT); window.__shT = setTimeout(() => setMsg(null), 3500); }, []);
  const shop = me?.shop || state.shop || {};

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [a, b, c, d] = await Promise.all([shopAPI.me(), shopAPI.listings(), shopAPI.orders(), shopAPI.conversations()]);
      setMe(a.data); setItems(b.data.listings); setOrders(c.data.sales); setConvs(d.data);
    } catch { /* deconnexion geree par l'intercepteur */ }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!conv) return;
    let alive = true;
    const pull = () => shopAPI.conversation(conv).then(({ data }) => alive && setMsgs(data.messages || [])).catch(() => {});
    pull();
    const t = setInterval(pull, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [conv]);

  const logout = () => dispatch({ type: 'SHOP_LOGOUT' });
  const act = async (fn, ok) => { try { await fn(); toast(ok); load(); } catch (e) { toast(err(e), 'ko'); } };
  const send = async () => {
    if (!text.trim()) return;
    try { const { data } = await shopAPI.send(conv, text.trim()); setMsgs(m => [...m, data.message]); setText(''); load(); }
    catch (e) { toast(err(e), 'ko'); }
  };
  const changePw = async () => {
    if (pw.next !== pw.again) { toast('Les deux mots de passe ne sont pas identiques', 'ko'); return; }
    try {
      const { data } = await shopAPI.password(pw.current, pw.next);
      // Le changement ferme les autres sessions : on garde la nouvelle ici
      dispatch({ type: 'SHOP_LOGIN', payload: { shop: { ...shop, mustChangePassword: false }, token: data.token } });
      setPwOpen(false); setPw({ current: '', next: '', again: '' }); toast('Mot de passe changé'); load();
    }
    catch (e) { toast(err(e), 'ko'); }
  };

  const st = me?.stats || {};
  const toPrepare = (orders || []).filter(o => o.status === 'confirmed');
  const unread = convs?.unread || 0;
  const [title, subtitle] = TITLES[tab];

  return (
    <div className="screen bo">
      {msg && <div className={`bo-notice ${msg.k} bo-md-toast`} role="status">{msg.t}</div>}
      <aside className="bo-side">
        <div className="bo-brand"><img src="/logo.png" alt="WAYI" /><div><b>WAYI Mode</b><small>Espace boutique</small></div></div>
        <nav>
          {NAV.map(([k, label, Icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icon size={18} strokeWidth={2} /> <span>{label}</span>
              {k === 'orders' && toPrepare.length > 0 && <em>{toPrepare.length}</em>}
              {k === 'messages' && unread > 0 && <em>{unread}</em>}
            </button>
          ))}
        </nav>
        <div className="bo-side-foot">
          <div className="bo-me"><span className="bo-me-av">{(shop.name || 'B').charAt(0)}</span><div><b>{shop.name}</b><small>{shop.email}</small></div></div>
          <button className="bo-logout" onClick={() => setPwOpen(true)}><KeyRound size={16} /> Mot de passe</button>
          <button className="bo-logout" onClick={logout}><LogOut size={16} /> Déconnexion</button>
        </div>
      </aside>

      <div className="bo-main">
        <header className="bo-top">
          <div className="bo-top-mobile">
            <img src="/logo.png" alt="WAYI" />
            <b>{shop.name || 'Espace boutique'}</b>
            <button className="bo-icon-btn light" onClick={load} aria-label="Actualiser"><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></button>
            <button className="bo-icon-btn light" onClick={logout} aria-label="Déconnexion"><LogOut size={17} /></button>
          </div>
          <div className="bo-top-row">
            <div><h1>{title}</h1><p>{subtitle}</p></div>
            <div className="bo-top-actions">
              {tab === 'articles' && <button className="bo-btn" onClick={() => setEdit('new')}><Plus size={15} /> Ajouter un article</button>}
              <button className="bo-btn ghost" onClick={load} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Actualiser</button>
            </div>
          </div>
          <div className="bo-mtabs">
            {NAV.map(([k, label, Icon]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>)}
          </div>
        </header>

        <div className="bo-content">
          {tab === 'dashboard' && (
            <div className="bo-col">
              <section className="bo-hero">
                <div className="bo-hero-text">
                  <h2>Bonjour, {shop.contactName || shop.name}</h2>
                  <p>{toPrepare.length ? `${toPrepare.length} commande${toPrepare.length > 1 ? 's' : ''} à préparer pour le livreur.` : 'Aucune commande à préparer pour le moment.'}</p>
                  <div className="bo-hero-actions">
                    <button className="bo-btn white" onClick={() => setEdit('new')}><Plus size={15} /> Ajouter un article</button>
                    <button className="bo-btn glass" onClick={() => setTab('orders')}><Receipt size={15} /> Commandes</button>
                  </div>
                </div>
              </section>
              {me?.modeState && me.modeState !== 'live' && (
                <div className="bo-notice warn">WAYI Mode n'est pas encore ouvert au public. Prépare ton catalogue maintenant : tes articles seront visibles dès l'ouverture.</div>
              )}
              <div className="bo-notice ok sh-anon"><EyeOff size={16} /> Les clients voient « Boutique partenaire WAYI » : le nom de ta boutique n'est jamais affiché. WAYI s'occupe des paiements et de la livraison.</div>
              <div className="bo-kpis">
                {[
                  { Icon: Shirt, val: st.listings ?? '-', label: 'Articles en ligne', tone: 'orange' },
                  { Icon: Boxes, val: st.stock ?? '-', label: 'Pièces en stock', tone: 'blue' },
                  { Icon: Package, val: st.toPrepare ?? '-', label: 'À préparer', tone: st.toPrepare ? 'red' : 'green' },
                  { Icon: Truck, val: st.sales ?? '-', label: 'Ventes livrées', tone: 'green' },
                  { Icon: Wallet, val: money(st.earned), label: 'Gagné (commission déduite)', tone: 'dark' },
                  { Icon: Star, val: st.rating ? `${String(st.rating).replace('.', ',')}/5` : '-', label: `${st.reviewsCount || 0} avis clients`, tone: 'violet' },
                ].map(k => (
                  <div key={k.label} className="bo-kpi"><span className={`bo-kpi-ico ${k.tone}`}><k.Icon size={18} /></span><div><b>{k.val}</b><small>{k.label}</small></div></div>
                ))}
              </div>
              <section className="bo-card">
                <div className="bo-card-head"><h2>Commandes à préparer</h2><button className="bo-link" onClick={() => setTab('orders')}>Tout voir</button></div>
                {toPrepare.length ? toPrepare.slice(0, 5).map(o => <OrderRow key={o.id} o={o} act={act} />) : <div className="bo-empty">Rien à préparer.</div>}
              </section>
              <p className="bo-muted">Commission WAYI sur tes ventes : {Math.round((me?.meta?.commissionRate || 0) * 1000) / 10} %.</p>
            </div>
          )}

          {tab === 'articles' && (
            items === null ? <div className="bo-empty">Chargement...</div> : !items.length ? (
              <div className="bo-card"><div className="bo-empty">Aucun article. Ajoute ton premier article avec ses photos, ses tailles et ton stock.</div>
                <div style={{ textAlign: 'center' }}><button className="bo-btn" onClick={() => setEdit('new')}><Plus size={15} /> Ajouter un article</button></div></div>
            ) : (
              <div className="bo-md-listings">
                {items.map(l => (
                  <div key={l.id} className="bo-md-item">
                    <div className="bo-md-photo" style={l.photo ? { backgroundImage: `url("${l.photo}")` } : undefined}>{!l.photo && <Shirt size={26} />}</div>
                    <div className="bo-md-body">
                      <b>{l.title}</b>
                      <span>{money(l.price)} · {l.conditionLabel}</span>
                      <div className="sh-stock">
                        {(l.variants || []).map(v => <span key={v.size} className={v.qty ? '' : 'out'}>{v.size} <i>{v.qty}</i></span>)}
                      </div>
                      <small>{l.views} vue{l.views > 1 ? 's' : ''}{l.hiddenReason ? ` · ${l.hiddenReason}` : ''}</small>
                      <div className="bo-md-foot">
                        <span className={`bo-status ${LIST_TONE[l.status] || 'wait'}`}>{LIST_LABEL[l.status] || l.status}</span>
                        <span className="sh-acts">
                          <button className="bo-icon-btn" onClick={() => setEdit(l)} aria-label="Modifier"><Pencil size={15} /></button>
                          {['active', 'paused'].includes(l.status) && (
                            <button className="bo-icon-btn" onClick={() => act(() => shopAPI.update(l.id, { status: l.status === 'active' ? 'paused' : 'active' }), l.status === 'active' ? 'Article en pause' : 'Article remis en ligne')} aria-label={l.status === 'active' ? 'Mettre en pause' : 'Remettre en ligne'}>
                              {l.status === 'active' ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                            </button>
                          )}
                          <button className="bo-icon-btn" onClick={() => window.confirm('Supprimer cet article ?') && act(() => shopAPI.remove(l.id), 'Article supprimé')} aria-label="Supprimer"><Trash2 size={15} /></button>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'orders' && (
            <section className="bo-card">
              {orders === null ? <div className="bo-empty">Chargement...</div> : !orders.length ? <div className="bo-empty">Aucune commande pour le moment.</div>
                : orders.map(o => <OrderRow key={o.id} o={o} act={act} />)}
            </section>
          )}

          {tab === 'messages' && (
            <div className="sh-chat">
              <div className="sh-convs">
                {!convs?.conversations?.length ? <div className="bo-empty">Aucun message.</div> : convs.conversations.map(c => (
                  <button key={c.id} className={`sh-conv${conv === c.id ? ' on' : ''}`} onClick={() => setConv(c.id)}>
                    <div className="bo-md-photo sm" style={c.listing?.photo ? { backgroundImage: `url("${c.listing.photo}")` } : undefined} />
                    <span><b>{c.other.name}</b><small>{c.listing?.title}</small><em>{c.last ? `${c.last.mine ? 'Toi : ' : ''}${c.last.text}` : ''}</em></span>
                    {c.unread > 0 && <i>{c.unread}</i>}
                  </button>
                ))}
              </div>
              <div className="sh-thread">
                {!conv ? <div className="bo-empty">Choisis une conversation.</div> : (
                  <>
                    <div className="sh-msgs">
                      {msgs.map(m => <div key={m.id} className={`sh-msg${m.mine ? ' mine' : ''}`}><p>{m.text}</p><small>{new Date(m.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>)}
                    </div>
                    <div className="sh-compose">
                      <textarea rows={2} value={text} placeholder="Ta réponse au client..." onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                      <button className="bo-btn" onClick={send} disabled={!text.trim()}><SendHorizontal size={16} /> Envoyer</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {edit && (
        <Modal title={edit === 'new' ? 'Ajouter un article' : 'Modifier l\'article'} onClose={() => setEdit(null)}>
          <ArticleForm meta={me?.meta} shop={shop} initial={edit === 'new' ? null : edit} toast={toast} onDone={() => { setEdit(null); load(); }} />
        </Modal>
      )}
      {(pwOpen || me?.shop?.mustChangePassword) && (
        <Modal title={me?.shop?.mustChangePassword ? 'Choisis ton mot de passe' : 'Changer mon mot de passe'} onClose={() => !me?.shop?.mustChangePassword && setPwOpen(false)}>
          <div className="bo-form">
            {me?.shop?.mustChangePassword && <div className="bo-notice warn">Première connexion : remplace le mot de passe temporaire reçu par e-mail par un mot de passe que toi seul connais.</div>}
            <label>{me?.shop?.mustChangePassword ? 'Mot de passe temporaire' : 'Mot de passe actuel'}<input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} /></label>
            <label>Nouveau mot de passe (8 caractères minimum)<input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} /></label>
            <label>Confirme le nouveau mot de passe<input type="password" autoComplete="new-password" value={pw.again} onChange={e => setPw(p => ({ ...p, again: e.target.value }))} /></label>
            <button className="bo-btn full" onClick={changePw}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OrderRow({ o, act }) {
  return (
    <div className="sh-order">
      <div className="bo-md-photo sm" style={o.listing?.photo ? { backgroundImage: `url("${o.listing.photo}")` } : undefined}>{!o.listing?.photo && <Shirt size={20} />}</div>
      <div className="bo-md-body">
        <b>{o.number} · {o.listing?.title}{o.size ? `, taille ${o.size}` : ''}</b>
        <span>Client : {o.counterpart?.name}{o.counterpart?.phone ? ` · ${o.counterpart.phone}` : ''}</span>
        <small>Livraison : {o.address?.label} · {new Date(o.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small>
        <small>Tu reçois {money(o.sellerAmount)} (commission {money(o.commission)})</small>
      </div>
      <div className="sh-order-end">
        <span className={`bo-status ${ORDER_TONE[o.status]}`}>{ORDER_LABEL[o.status]}</span>
        {o.status === 'confirmed' && <button className="bo-btn" onClick={() => window.confirm("Confirmes-tu avoir remis l'article au livreur ?") && act(() => shopAPI.orderStatus(o.id, 'handed'), 'Commande remise au livreur')}><Check size={14} /> Remis au livreur</button>}
        {o.status === 'awaiting_payment' && <small className="bo-muted">Prépare l'article dès que WAYI confirme le paiement.</small>}
      </div>
    </div>
  );
}
