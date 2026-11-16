import { useState, lazy, Suspense } from 'react';
import { X, MapPin, Link2, LocateFixed, Check, Trash2, Map as MapIcon } from 'lucide-react';
// Carte chargee seulement quand on l'ouvre (Leaflet est lourd)
const PickLocationMap = lazy(() => import('./LiveMap').then(m => ({ default: m.PickLocationMap })));
const MapFallback = () => <div style={{ height: 230, borderRadius: 18, background: '#EEE8E2' }} />;
import { useApp } from '../context/AppContext';
import { useBackClose } from '../lib/native';
import { Spinner } from './UI';
import { authAPI } from '../api';

const EMPTY = { label: '', address: '', landmark: '', mapsLink: '' };

/* Fenêtre « Mes adresses » : choisir, ajouter (avec repère, lien Google Maps ou position GPS) ou supprimer. */
export default function AddressSheet({ open, onClose, onChosen }) {
  const { state, dispatch } = useApp();
  const user = state.user;
  const [form, setForm] = useState(EMPTY);
  const [gps, setGps] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);
  // Adresse deja enregistree dont on place le point sur la carte
  const [pickFor, setPickFor] = useState(null);
  const [pickPos, setPickPos] = useState(null);

  useBackClose(open, () => { setError(''); onClose?.(); });
  if (!open) return null;
  const close = () => { setError(''); onClose?.(); };

  const choose = async (addr) => {
    if (addr.isDefault) { onChosen?.(addr); close(); return; }
    setSaving(true); setError('');
    try {
      const { data } = await authAPI.setDefaultAddress(addr.id);
      dispatch({ type: 'SET_USER', payload: data.user });
      onChosen?.(addr); close();
    } catch (err) {
      setError(err.response?.data?.error || "Impossible de changer d'adresse.");
    } finally { setSaving(false); }
  };

  const remove = async (addr) => {
    setSaving(true); setError('');
    try {
      await authAPI.deleteAddress(addr.id);
      const { data } = await authAPI.me();
      dispatch({ type: 'SET_USER', payload: data });
    } catch (err) {
      setError(err.response?.data?.error || "Impossible de supprimer cette adresse.");
    } finally { setSaving(false); }
  };

  const locateMe = (target = setGps) => {
    if (!navigator.geolocation) { setError("La position n'est pas disponible sur cet appareil. Place le point sur la carte ou colle un lien Google Maps."); return; }
    setGpsLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      pos => { target({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); setShowMap(true); },
      () => { setGpsLoading(false); setError('Position refusée. Autorise la localisation, ou colle un lien Google Maps.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const add = async () => {
    if (!form.label.trim() || !form.address.trim()) { setError('Nom et adresse requis.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await authAPI.addAddress({ ...form, ...(gps || {}), isDefault: true });
      dispatch({ type: 'SET_USER', payload: data.user });
      setForm(EMPTY); setGps(null);
      onChosen?.(data.address); close();
    } catch (err) {
      setError(err.response?.data?.error || "Impossible d'ajouter cette adresse.");
    } finally { setSaving(false); }
  };

  const savePick = async () => {
    if (!pickFor || !pickPos) return;
    setSaving(true); setError('');
    try {
      const { data } = await authAPI.setAddressPosition(pickFor.id, pickPos.lat, pickPos.lng);
      dispatch({ type: 'SET_USER', payload: data.user });
      setPickFor(null); setPickPos(null);
    } catch (err) {
      setError(err.response?.data?.error || "Impossible d'enregistrer cette position.");
    } finally { setSaving(false); }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }} onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))', width: '100%', maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18 }}>Mes adresses</div>
          <button onClick={close} aria-label="Fermer" style={{ background: 'var(--cream)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        {(user?.addresses || []).map(addr => (
          <div key={addr.id} className="addr-row" style={{
            background: addr.isDefault ? 'var(--emerald-light)' : 'var(--cream)',
            border: `1.5px solid ${addr.isDefault ? 'var(--emerald)' : 'var(--border)'}`,
          }}>
            <button className="addr-row-main" onClick={() => choose(addr)} disabled={saving}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{addr.label} {addr.isDefault && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--emerald)' }}>(par défaut)</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{addr.address}</div>
              {addr.landmark && <div style={{ fontSize: 12, color: 'var(--gray)' }}>Repère : {addr.landmark}</div>}
              {(addr.mapsLink || addr.hasPosition)
                ? <div className="addr-pos"><MapPin size={12} aria-hidden="true" /> Position enregistrée</div>
                : <div className="addr-pos addr-pos-missing"><MapPin size={12} aria-hidden="true" /> Sans position</div>}
            </button>
            <button className="addr-del" onClick={() => { setPickFor(addr); setPickPos(addr.hasPosition && addr.lat != null ? { lat: addr.lat, lng: addr.lng } : null); }} disabled={saving} aria-label={`Placer ${addr.label} sur la carte`} title="Placer sur la carte" style={{ color: "var(--brand)" }}>
              <MapIcon size={16} aria-hidden="true" />
            </button>
            <button className="addr-del" onClick={() => remove(addr)} disabled={saving} aria-label={`Supprimer ${addr.label}`}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}

        {pickFor && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Point de livraison : {pickFor.label}</div>
            <Suspense fallback={<MapFallback />}><PickLocationMap key={pickFor.id} value={pickPos} onChange={setPickPos} height={230} /></Suspense>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="addr-gps" style={{ flex: 1 }} onClick={() => locateMe(setPickPos)} disabled={gpsLoading}>
                {gpsLoading ? <Spinner size={14} /> : <LocateFixed size={16} aria-hidden="true" />} Ma position
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={savePick} disabled={!pickPos || saving}>
                {saving ? <Spinner size={14} color="#fff" /> : 'Enregistrer'}
              </button>
            </div>
            <button type="button" onClick={() => { setPickFor(null); setPickPos(null); }} style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: 12, marginTop: 8, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Annuler</button>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', marginBottom: 8 }}>Ajouter une nouvelle adresse</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Nom (ex: Domicile, Bureau)" value={form.label} onChange={set('label')} />
            <input placeholder="Adresse complète (quartier, rue)" value={form.address} onChange={set('address')} />
            <input placeholder="Repère (ex: près du marché, portail bleu)" value={form.landmark} onChange={set('landmark')} />
            <div className="addr-link-field">
              <Link2 size={16} aria-hidden="true" />
              <input placeholder="Lien Google Maps (facultatif)" inputMode="url" autoCapitalize="none" autoCorrect="off" value={form.mapsLink} onChange={set('mapsLink')} />
            </div>
            <div className="addr-help">Dans Google Maps, appuie sur Partager puis Copier le lien, et colle-le ici.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => locateMe()} disabled={gpsLoading} className={`addr-gps${gps ? ' addr-gps-ok' : ''}`} style={{ flex: 1 }}>
                {gpsLoading ? <Spinner size={14} /> : gps ? <Check size={16} aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
                {gps ? 'Position choisie' : 'Ma position'}
              </button>
              <button type="button" onClick={() => setShowMap(v => !v)} className="addr-gps" style={{ flex: 1 }}>
                <MapIcon size={16} aria-hidden="true" /> {showMap ? 'Masquer la carte' : 'Placer sur la carte'}
              </button>
            </div>
            {showMap && (
              <>
                <Suspense fallback={<MapFallback />}><PickLocationMap value={gps} onChange={setGps} height={230} /></Suspense>
                <div className="addr-help">Touche la carte ou fais glisser l'épingle à l'endroit exact où le livreur doit venir.</div>
              </>
            )}
            {error && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{error}</div>}
            <button onClick={add} disabled={saving} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
              {saving ? <Spinner size={16} color="#fff" /> : 'Enregistrer cette adresse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
