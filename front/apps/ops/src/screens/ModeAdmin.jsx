// Back office : univers Mode de WAYI Bénin (ouverture au public, réglages, modération)
import { useEffect, useState, useCallback } from 'react';
import { EyeOff, Clock3, Globe, Shirt, Users, ShoppingBag, Wallet, Flag, Percent, Save, RefreshCw, Eye, Ban, Check, Sparkles, Store, Plus, X, BadgeCheck } from 'lucide-react';
import { adminAPI } from '../api';

const money = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;
const err = (e) => e?.response?.data?.error || 'Action impossible';
const STATES = [
  { id: 'hidden', Icon: EyeOff, title: 'Masqué', text: 'Personne ne voit le Mode, sauf les comptes testeurs. Le site reste exactement comme aujourd\'hui.' },
  { id: 'soon', Icon: Clock3, title: 'Bientôt', text: 'Les clients voient « WAYI Bénin » avec Restaurant et Mode, et une page qui annonce le Mode.' },
  { id: 'live', Icon: Globe, title: 'En ligne', text: 'Tout le monde peut publier, acheter et vendre. Restaurant continue de fonctionner à côté.' },
];
const ORDER_LABEL = { awaiting_payment: 'Paiement à confirmer', confirmed: 'Confirmée', handed: 'Remise au livreur', on_the_way: 'En route', delivered: 'Livrée', cancelled: 'Annulée' };
const ORDER_TONE = { awaiting_payment: 'wait', confirmed: 'info', handed: 'go', on_the_way: 'go', delivered: 'ok', cancelled: 'ko' };
const LIST_LABEL = { active: 'En ligne', paused: 'En pause', reserved: 'Réservée', sold: 'Vendue', hidden: 'Masquée' };
const LIST_TONE = { active: 'ok', paused: 'wait', reserved: 'info', sold: 'go', hidden: 'ko' };

export default function ModeAdmin() {
  const [ov, setOv] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('shops');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [newShop, setNewShop] = useState(null);
  const [created, setCreated] = useState(null);
  const toast = useCallback((t, k = 'ok') => { setMsg({ t, k }); clearTimeout(window.__boMd); window.__boMd = setTimeout(() => setMsg(null), 3500); }, []);

  const load = useCallback(() => {
    adminAPI.mode.overview().then(({ data }) => {
      setOv(data);
      const s = data.settings;
      setForm({ state: s.state, testers: s.testers.join('\n'), commission: String(Math.round(s.commissionRate * 1000) / 10), deliveryFee: String(s.deliveryFee), offerOn: s.launchOffer.enabled, offerSellers: String(s.launchOffer.sellers), offerSales: String(s.launchOffer.sales) });
    }).catch(() => toast('Univers Mode indisponible', 'ko'));
  }, [toast]);
  const loadRows = useCallback(() => {
    setRows(null);
    const p = tab === 'shops' ? adminAPI.mode.shops().then(r => r.data.shops)
      : tab === 'listings' ? adminAPI.mode.listings().then(r => r.data.listings)
      : tab === 'reports' ? adminAPI.mode.reports().then(r => r.data.reports)
      : adminAPI.mode.orders().then(r => r.data.orders);
    p.then(setRows).catch(() => setRows([]));
  }, [tab]);
  useEffect(load, [load]);
  useEffect(loadRows, [loadRows]);

  const save = async (patch) => {
    const f = { ...form, ...patch };
    if (patch?.state === 'live' && ov.settings.state !== 'live' && !window.confirm('Ouvrir le Mode à tous les clients de WAYI ?')) return;
    setSaving(true);
    try {
      await adminAPI.mode.settings({
        state: f.state, testers: f.testers,
        commissionRate: Number(String(f.commission).replace(',', '.')) / 100,
        deliveryFee: Number(f.deliveryFee),
        launchOffer: { enabled: f.offerOn, sellers: Number(f.offerSellers), sales: Number(f.offerSales) },
      });
      toast(patch?.state ? `Mode : ${STATES.find(s => s.id === patch.state).title}` : 'Réglages enregistrés');
      load();
    } catch (e) { toast(err(e), 'ko'); }
    finally { setSaving(false); }
  };

  const act = async (fn, ok) => {
    try { await fn(); toast(ok); loadRows(); load(); } catch (e) { toast(err(e), 'ko'); }
  };

  if (!ov || !form) return <div className="bo-card"><div className="bo-empty">Chargement de l'univers Mode...</div></div>;
  const st = ov.stats;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bo-col">
      {msg && <div className={`bo-notice ${msg.k} bo-md-toast`} role="status">{msg.t}</div>}
      <section className="bo-card">
        <div className="bo-card-head">
          <h2>Visibilité de l'univers Mode</h2>
          <span className={`bo-status ${ov.settings.state === 'live' ? 'ok' : ov.settings.state === 'soon' ? 'info' : 'wait'}`}>{STATES.find(s => s.id === ov.settings.state)?.title}</span>
        </div>
        <div className="bo-md-states">
          {STATES.map(({ id, Icon, title, text }) => (
            <button key={id} className={ov.settings.state === id ? 'on' : ''} disabled={saving} onClick={() => ov.settings.state !== id && save({ state: id })}>
              <span><Icon size={20} /></span>
              <b>{title}</b>
              <small>{text}</small>
              {ov.settings.state === id && <em><Check size={14} strokeWidth={3} /> Actif</em>}
            </button>
          ))}
        </div>
        <div className="bo-md-testers">
          <label>Comptes testeurs <small>(un e-mail par ligne) : ils voient le Mode même masqué, pour essayer avant l'ouverture.</small></label>
          <textarea rows={3} value={form.testers} onChange={e => set('testers', e.target.value)} placeholder="hortice362@gmail.com" />
          <button className="bo-btn" disabled={saving} onClick={() => save()}><Save size={15} /> Enregistrer les testeurs</button>
        </div>
      </section>

      <div className="bo-kpis">
        {[
          { Icon: Shirt, val: st.listings, label: 'Annonces en ligne', tone: 'orange' },
          { Icon: Users, val: st.sellers, label: 'Vendeurs', tone: 'blue' },
          { Icon: ShoppingBag, val: `${st.sales}/${st.orders}`, label: 'Ventes livrées / commandes', tone: 'green' },
          { Icon: Wallet, val: money(st.volume), label: 'Volume vendu', tone: 'dark' },
          { Icon: Percent, val: money(st.commission), label: 'Commission WAYI', tone: 'violet' },
          { Icon: Flag, val: st.openReports, label: 'Signalements ouverts', tone: st.openReports ? 'red' : 'green' },
        ].map(k => (
          <div key={k.label} className="bo-kpi">
            <span className={`bo-kpi-ico ${k.tone}`}><k.Icon size={18} /></span>
            <div><b>{k.val}</b><small>{k.label}</small></div>
          </div>
        ))}
      </div>

      <section className="bo-card">
        <div className="bo-card-head"><h2>Réglages des ventes</h2></div>
        <div className="bo-md-form">
          <label>Commission WAYI (%)<input inputMode="decimal" value={form.commission} onChange={e => set('commission', e.target.value)} /></label>
          <label>Livraison (FCFA)<input inputMode="numeric" value={form.deliveryFee} onChange={e => set('deliveryFee', e.target.value)} /></label>
          <label className="bo-md-check"><input type="checkbox" checked={form.offerOn} onChange={e => set('offerOn', e.target.checked)} /> <span><Sparkles size={15} /> Offre de lancement : 0 frais</span></label>
          <label>Premiers vendeurs<input inputMode="numeric" value={form.offerSellers} disabled={!form.offerOn} onChange={e => set('offerSellers', e.target.value)} /></label>
          <label>Ventes offertes<input inputMode="numeric" value={form.offerSales} disabled={!form.offerOn} onChange={e => set('offerSales', e.target.value)} /></label>
        </div>
        <div className="bo-row-end" style={{ marginTop: 14 }}>
          <span className="bo-muted">{st.launchSellers} vendeur{st.launchSellers > 1 ? 's' : ''} inscrit{st.launchSellers > 1 ? 's' : ''} à l'offre</span>
          <button className="bo-btn" disabled={saving} onClick={() => save()}><Save size={15} /> Enregistrer</button>
        </div>
      </section>

      <section className="bo-card">
        <div className="bo-card-head">
          <div className="bo-pills" style={{ margin: 0 }}>
            {[['shops', `Boutiques${st.shops ? ` (${st.shops})` : ''}`], ['listings', 'Annonces'], ['reports', `Signalements${st.openReports ? ` (${st.openReports})` : ''}`], ['orders', 'Commandes']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <span style={{ display: 'flex', gap: 8 }}>
            {tab === 'shops' && <button className="bo-btn" onClick={() => { setCreated(null); setNewShop({ name: '', contactName: '', email: '', phone: '', city: 'Cotonou', commission: '' }); }}><Plus size={15} /> Ajouter une boutique</button>}
            <button className="bo-icon-btn" onClick={loadRows} aria-label="Actualiser"><RefreshCw size={16} /></button>
          </span>
        </div>
        {tab === 'shops' && <p className="bo-muted" style={{ margin: '-4px 0 14px' }}>Les boutiques publient leurs articles depuis leur espace (admin.wayibenin.com, « Boutique partenaire »). Les clients voient « Boutique partenaire WAYI », jamais leur nom.</p>}
        {created && <div className={`bo-notice ${created.devPassword ? 'warn' : 'ok'}`}>{created.devPassword ? <>Boutique créée. L'e-mail n'a pas pu partir : mot de passe temporaire à transmettre à {created.shop.email} : <b>{created.devPassword}</b></> : <>Boutique créée. Les identifiants ont été envoyés à {created.shop.email}.</>}</div>}

        {rows === null ? <div className="bo-empty">Chargement...</div> : !rows.length ? (
          <div className="bo-empty">{tab === 'shops' ? 'Aucune boutique partenaire. Ajoute la première avec le bouton ci-dessus.' : tab === 'listings' ? 'Aucune annonce pour le moment.' : tab === 'reports' ? 'Aucun signalement.' : 'Aucune commande Mode.'}</div>
        ) : tab === 'shops' ? (
          <div className="bo-md-shops">
            {rows.map(x => (
              <div key={x.id} className={`bo-md-shop${x.active ? '' : ' off'}`}>
                <div className="bo-md-shop-top">
                  <span>{x.name.charAt(0)}</span>
                  <div><b>{x.name}</b><small>{x.contactName ? `${x.contactName} · ` : ''}{x.email}{x.phone ? ` · ${x.phone}` : ''}</small></div>
                  <span className={`bo-status ${x.active ? 'ok' : 'ko'}`}>{x.active ? 'Active' : 'Suspendue'}</span>
                </div>
                <div className="bo-md-shop-stats">
                  <div><b>{x.stats.listings}</b><small>Articles</small></div>
                  <div><b>{x.stats.stock}</b><small>En stock</small></div>
                  <div><b>{x.stats.sales}</b><small>Ventes</small></div>
                  <div><b>{x.stats.inProgress}</b><small>En cours</small></div>
                </div>
                <small className="bo-muted">{x.city} · commission {x.commissionRate == null ? `WAYI (${Math.round(ov.settings.commissionRate * 1000) / 10} %)` : `${Math.round(x.commissionRate * 1000) / 10} %`} · reversé {money(x.stats.earned)}</small>
                <div className="bo-md-foot">
                  <button className="bo-btn ghost" onClick={() => { const v = window.prompt('Commission de cette boutique en % (vide = commission WAYI)', x.commissionRate == null ? '' : String(Math.round(x.commissionRate * 1000) / 10)); if (v !== null) act(() => adminAPI.mode.updateShop(x.id, { commissionRate: v.trim() === '' ? null : Number(v.replace(',', '.')) / 100 }), 'Commission mise à jour'); }}><Percent size={14} /> Commission</button>
                  <button className="bo-btn ghost" onClick={() => window.confirm(x.active ? 'Suspendre cette boutique ? Ses articles sortent du catalogue.' : 'Réactiver cette boutique ?') && act(() => adminAPI.mode.updateShop(x.id, { active: !x.active }), x.active ? 'Boutique suspendue' : 'Boutique réactivée')}>{x.active ? <><Ban size={14} /> Suspendre</> : <><Check size={14} /> Réactiver</>}</button>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'listings' ? (
          <div className="bo-md-listings">
            {rows.map(l => (
              <div key={l.id} className="bo-md-item">
                <div className="bo-md-photo" style={l.photo ? { backgroundImage: `url("${l.photo}")` } : undefined}>{!l.photo && <Shirt size={26} />}</div>
                <div className="bo-md-body">
                  <b>{l.title}, {l.size}</b>
                  <span>{money(l.price)} · {l.conditionLabel} · {l.city}</span>
                  <small>{l.seller.shop && <BadgeCheck size={12} style={{ verticalAlign: -2, color: 'var(--o)' }} />} {l.seller.name}{l.anonymous ? ' (anonyme)' : ''}{l.stock != null ? ` · ${l.stock} en stock` : ''} · {l.views} vues{l.reports ? ` · ${l.reports} signalement(s)` : ''}</small>
                  {l.hiddenReason && <small className="bo-md-reason">{l.hiddenReason}</small>}
                  <div className="bo-md-foot">
                    <span className={`bo-status ${LIST_TONE[l.status]}`}>{LIST_LABEL[l.status] || l.status}</span>
                    {l.status === 'hidden'
                      ? <button className="bo-btn ghost" onClick={() => act(() => adminAPI.mode.moderate(l.id, 'active'), 'Annonce rétablie')}><Eye size={14} /> Rétablir</button>
                      : ['active', 'paused'].includes(l.status) && <button className="bo-btn ghost" onClick={() => { const r = window.prompt('Raison du masquage (visible par le vendeur)', 'Annonce non conforme'); if (r !== null) act(() => adminAPI.mode.moderate(l.id, 'hidden', r), 'Annonce masquée'); }}><Ban size={14} /> Masquer</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'reports' ? (
          <div className="bo-md-reports">
            {rows.map(r => (
              <div key={r.id} className={`bo-md-report${r.status !== 'open' ? ' done' : ''}`}>
                <div className="bo-md-photo sm" style={r.listing?.photo ? { backgroundImage: `url("${r.listing.photo}")` } : undefined}>{!r.listing?.photo && <Shirt size={20} />}</div>
                <div className="bo-md-body">
                  <b>{r.reasonLabel}</b>
                  <span>{r.listing ? `${r.listing.title} · ${money(r.listing.price)} · ${r.listing.seller.name}` : 'Annonce supprimée'}</span>
                  {r.details && <small>« {r.details} »</small>}
                  <small>Signalé par {r.reporter} · {new Date(r.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small>
                </div>
                {r.status === 'open' ? (
                  <div className="bo-md-acts">
                    <button className="bo-btn" onClick={() => act(() => adminAPI.mode.resolve(r.id, 'hide'), 'Annonce masquée')}><Ban size={14} /> Masquer l'annonce</button>
                    <button className="bo-btn ghost" onClick={() => act(() => adminAPI.mode.resolve(r.id, 'dismiss'), 'Signalement classé')}>Ignorer</button>
                  </div>
                ) : <span className={`bo-status ${r.status === 'resolved' ? 'ko' : 'ok'}`}>{r.status === 'resolved' ? 'Annonce masquée' : 'Classé'}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="bo-table-wrap">
            <table className="bo-table">
              <thead><tr><th>Commande</th><th>Article</th><th>Acheteur</th><th>Vendeur</th><th>Total</th><th>Paiement</th><th>Statut</th></tr></thead>
              <tbody>
                {rows.map(o => (
                  <tr key={o.id}>
                    <td><b>{o.number}</b><br /><small className="bo-muted">{new Date(o.createdAt).toLocaleDateString('fr-FR')}</small></td>
                    <td>{o.listing?.title}{o.size ? `, ${o.size}` : ''}<br /><small className="bo-muted">{o.address?.label}</small></td>
                    <td>{o.buyer}<br /><small className="bo-muted">{o.buyerPhone}</small></td>
                    <td>{o.seller}{o.shop ? <><br /><small className="bo-muted">Boutique partenaire</small></> : null}</td>
                    <td><b>{money(o.total)}</b><br /><small className="bo-muted">Commission {money(o.commission)}</small></td>
                    <td>
                      {o.methodLabel}<br />
                      {o.paymentStatus === 'paid' ? <span className="bo-status ok">Reçu</span>
                        : o.method !== 'cash' && o.status !== 'cancelled' ? <button className="bo-btn ghost" onClick={() => act(() => adminAPI.mode.updateOrder(o.id, { payment: 'paid' }), 'Paiement confirmé')}><Check size={14} /> Paiement reçu</button>
                        : <span className="bo-status wait">À la livraison</span>}
                    </td>
                    <td>
                      <select className="bo-mini-select" value={o.status} onChange={e => act(() => adminAPI.mode.updateOrder(o.id, { status: e.target.value }), 'Statut mis à jour')} disabled={['delivered', 'cancelled'].includes(o.status)}>
                        {Object.entries(ORDER_LABEL).filter(([k]) => k !== 'awaiting_payment' || o.status === k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <br /><span className={`bo-status ${ORDER_TONE[o.status]}`} style={{ marginTop: 6 }}>{ORDER_LABEL[o.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {newShop && (
        <div className="bo-modal" onClick={() => setNewShop(null)}>
          <div className="bo-modal-card" onClick={e => e.stopPropagation()}>
            <div className="bo-modal-head"><h3><Store size={18} style={{ verticalAlign: -3 }} /> Nouvelle boutique partenaire</h3><button className="bo-icon-btn" onClick={() => setNewShop(null)} aria-label="Fermer"><X size={18} /></button></div>
            <div className="bo-modal-body bo-form">
              <label>Nom de la boutique (jamais montré aux clients)<input value={newShop.name} onChange={e => setNewShop(s => ({ ...s, name: e.target.value }))} placeholder="Ex. : Maison Akpé" /></label>
              <div className="two">
                <label>Responsable<input value={newShop.contactName} onChange={e => setNewShop(s => ({ ...s, contactName: e.target.value }))} /></label>
                <label>Téléphone<input value={newShop.phone} onChange={e => setNewShop(s => ({ ...s, phone: e.target.value }))} placeholder="01 97 00 00 00" /></label>
              </div>
              <label>E-mail de connexion<input type="email" value={newShop.email} onChange={e => setNewShop(s => ({ ...s, email: e.target.value }))} /></label>
              <div className="two">
                <label>Ville
                  <select value={newShop.city} onChange={e => setNewShop(s => ({ ...s, city: e.target.value }))}>{ov.meta.cities.map(c => <option key={c}>{c}</option>)}</select>
                </label>
                <label>Commission (%)<input inputMode="decimal" value={newShop.commission} onChange={e => setNewShop(s => ({ ...s, commission: e.target.value }))} placeholder={`${Math.round(ov.settings.commissionRate * 1000) / 10} (WAYI)`} /></label>
              </div>
              <button className="bo-btn full" onClick={async () => {
                try {
                  const { data } = await adminAPI.mode.createShop({ ...newShop, commissionRate: newShop.commission.trim() === '' ? null : Number(newShop.commission.replace(',', '.')) / 100 });
                  setCreated(data); setNewShop(null); loadRows(); load();
                } catch (e) { toast(err(e), 'ko'); }
              }}>Créer la boutique et envoyer les identifiants</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
