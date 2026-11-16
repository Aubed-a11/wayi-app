import { X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '../components/UI';
import { adminAPI } from '../api';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr', { day: 'numeric', month: 'short' }) : '');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// Outil d'appels de l'équipe WAYI : listes de clients ou de restaurants à appeler,
// script adapté à chaque cas, et suivi du résultat de chaque appel.
export default function TelemarketingPanel() {
  const [type, setType] = useState('client');
  const [segment, setSegment] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [active, setActive] = useState(null); // personne en cours d'appel
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ outcome: 'no_answer', note: '', callbackAt: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: res } = await adminAPI.telemarketing.targets({ type, segment: segment || undefined });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger la liste.');
    } finally {
      setLoading(false);
    }
  }, [type, segment]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const switchType = (t) => {
    if (t === type) return;
    setType(t); setSegment(''); setData(null);
  };

  const outcomeLabel = (key) => data?.outcomes?.find(o => o.key === key)?.label || key;

  const openCall = (target) => {
    setActive(target);
    setForm({ outcome: 'no_answer', note: '', callbackAt: '' });
    setFormError('');
    setHistory([]);
    adminAPI.telemarketing.calls(target.id).then(({ data: res }) => setHistory(res.calls)).catch(() => {});
  };

  const submitCall = async () => {
    setFormError('');
    setSaving(true);
    try {
      await adminAPI.telemarketing.logCall({
        targetType: type,
        targetId: active.id,
        outcome: form.outcome,
        note: form.note,
        callbackAt: form.outcome === 'callback' && form.callbackAt ? new Date(form.callbackAt).toISOString() : undefined,
      });
      setActive(null);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.error || "Impossible d'enregistrer cet appel.");
    } finally {
      setSaving(false);
    }
  };

  const stats = data?.stats;

  return (
    <>
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          {[
            ["Appels aujourd'hui", stats.callsToday],
            ['Personnes jointes', stats.reachedToday],
            ['Convertis', stats.convertedToday],
            ['Rappels à faire', stats.callbacksDue],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 14px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--emerald-dark)' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', background: 'var(--white)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', padding: 4, marginBottom: 12 }}>
        {[['client', 'Clients'], ['restaurant', 'Restaurants']].map(([k, label]) => (
          <button key={k} onClick={() => switchType(k)} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: type === k ? 'var(--emerald)' : 'transparent', color: type === k ? '#fff' : 'var(--gray)',
            fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
          }}>{label}</button>
        ))}
      </div>

      {data && (
        <select value={segment} onChange={e => setSegment(e.target.value)} style={{ marginBottom: 14 }}>
          <option value="">Tous les motifs d'appel</option>
          {data.segments.map(s => <option key={s.key} value={s.key}>{s.label} ({s.count})</option>)}
        </select>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spinner size={24} /></div>
      ) : data && data.targets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--gray)', fontSize: 13 }}>
          Personne à appeler pour ce motif pour le moment.
        </div>
      ) : data && (
        <div className="cards-grid">
          {data.targets.map(t => (
            <div key={t.id} style={{ background: 'var(--white)', border: `${t.callbackDue ? 2 : 1}px solid ${t.callbackDue ? '#c45012' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{t.name}</div>
                  {type === 'restaurant' && <div style={{ fontSize: 12, color: 'var(--gray)' }}>Contact : {t.contactName}</div>}
                </div>
                {t.callbackDue && <span className="badge" style={{ background: '#F7ECE3', color: '#c45012', fontSize: 10 }}>Rappel à faire</span>}
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink)', margin: '8px 0 4px' }}>{t.reasonLabels.join(', ')}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 6 }}>
                {type === 'client'
                  ? `${t.context.ordersCount} commande(s)${t.context.lastOrderAt ? `, la dernière le ${fmtDate(t.context.lastOrderAt)}` : ''}`
                  : `${t.context.dishCount} plat(s) au menu, ${t.context.orderCount} commande(s) reçue(s)`}
              </div>

              <div style={{ fontSize: 12, marginBottom: 6 }}>
                {t.hasPhone
                  ? <a href={`tel:${t.phone.replace(/\s/g, '')}`} style={{ color: 'var(--emerald)', fontWeight: 700 }}>{t.phone}</a>
                  : <span style={{ color: 'var(--gray)' }}>Aucun numéro enregistré{t.email ? ` - ${t.email}` : ''}</span>}
              </div>

              <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                {t.lastCall
                  ? `Dernier appel : ${outcomeLabel(t.lastCall.outcome)} le ${fmtDate(t.lastCall.createdAt)} (${t.callCount} appel${t.callCount > 1 ? 's' : ''})`
                  : 'Jamais appelé'}
              </div>

              <button onClick={() => openCall(t)} className="btn btn-primary" style={{ padding: 10, fontSize: 13, marginTop: 10 }}>
                Fiche d'appel
              </button>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ background: 'var(--white)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17 }}>{active.name}</div>
              <button onClick={() => setActive(null)} style={{ background: 'var(--cream)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} strokeWidth={2.4} aria-hidden="true" /></button>
            </div>

            {active.hasPhone ? (
              <a href={`tel:${active.phone.replace(/\s/g, '')}`} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: 12, fontSize: 14, marginBottom: 14 }}>
                Appeler {active.phone}
              </a>
            ) : (
              <div style={{ background: '#fff8e6', border: '1px solid #f0d98c', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 12, color: '#8a6d1a', marginBottom: 14 }}>
                Aucun numéro enregistré pour cette personne.{active.email ? ` Elle peut être contactée par e-mail : ${active.email}.` : ''}
              </div>
            )}

            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Script : {active.script.title}</div>
            {active.script.sections.map(sec => (
              <div key={sec.heading} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--emerald-dark)' }}>{sec.heading}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{sec.text}</div>
              </div>
            ))}

            {history.length > 0 && (
              <div style={{ background: 'var(--cream)', borderRadius: 'var(--r-sm)', padding: '10px 12px', margin: '14px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Appels précédents</div>
                {history.slice(0, 5).map(c => (
                  <div key={c.id} style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 4 }}>
                    {fmtDateTime(c.createdAt)} - {outcomeLabel(c.outcome)} - {c.agentName}
                    {c.note && <div style={{ color: 'var(--gray)' }}>{c.note}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Résultat de l'appel</div>
              <select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}>
                {(data?.outcomes || []).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {form.outcome === 'callback' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--gray)', display: 'block', marginBottom: 4 }}>Rappeler le (facultatif, sinon demain)</label>
                  <input type="datetime-local" value={form.callbackAt} onChange={e => setForm(f => ({ ...f, callbackAt: e.target.value }))} />
                </div>
              )}
              <textarea rows={3} placeholder="Note sur l'appel (facultatif)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              {form.outcome === 'do_not_call' && (
                <div style={{ fontSize: 11, color: 'var(--gray)' }}>Cette personne disparaîtra des listes d'appels.</div>
              )}
              {formError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{formError}</div>}
              <button onClick={submitCall} disabled={saving} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
                {saving ? <Spinner size={16} color="#fff" /> : "Enregistrer l'appel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
