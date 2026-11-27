// Back office : univers Mode de WAYI Bénin (ouverture au public, réglages, modération)
import { useEffect, useState, useCallback } from 'react';
import { EyeOff, Clock3, Globe, Shirt, Users, ShoppingBag, Wallet, Flag, Percent, Save, RefreshCw, Eye, Ban, Check, Sparkles } from 'lucide-react';
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
  const [tab, setTab] = useState('listings');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
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
    const p = tab === 'listings' ? adminAPI.mode.listings().then(r => r.data.listings)
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
            {[['listings', 'Annonces'], ['reports', `Signalements${st.openReports ? ` (${st.openReports})` : ''}`], ['orders', 'Commandes']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <button className="bo-icon-btn" onClick={loadRows} aria-label="Actualiser"><RefreshCw size={16} /></button>
        </div>

        {rows === null ? <div className="bo-empty">Chargement...</div> : !rows.length ? (
          <div className="bo-empty">{tab === 'listings' ? 'Aucune annonce pour le moment.' : tab === 'reports' ? 'Aucun signalement.' : 'Aucune commande Mode.'}</div>
        ) : tab === 'listings' ? (
          <div className="bo-md-listings">
            {rows.map(l => (
              <div key={l.id} className="bo-md-item">
                <div className="bo-md-photo" style={l.photo ? { backgroundImage: `url("${l.photo}")` } : undefined}>{!l.photo && <Shirt size={26} />}</div>
                <div className="bo-md-body">
                  <b>{l.title}, {l.size}</b>
                  <span>{money(l.price)} · {l.conditionLabel} · {l.city}</span>
                  <small>{l.seller.name}{l.anonymous ? ' (anonyme)' : ''} · {l.views} vues{l.reports ? ` · ${l.reports} signalement(s)` : ''}</small>
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
                    <td>{o.listing?.title}<br /><small className="bo-muted">{o.address?.label}</small></td>
                    <td>{o.buyer}<br /><small className="bo-muted">{o.buyerPhone}</small></td>
                    <td>{o.seller}</td>
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
    </div>
  );
}
