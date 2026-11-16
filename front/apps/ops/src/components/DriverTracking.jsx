import { useEffect, useState, lazy, Suspense } from 'react';
import { X, Phone, Navigation, MapPin } from 'lucide-react';
import { merchantAPI } from '../api';

// Carte chargee a la demande (Leaflet est lourd)
const LiveMap = lazy(() => import('./LiveMap').then(m => ({ default: m.LiveMap })));

const kmBetween = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371; const t = (x) => x * Math.PI / 180;
  const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const fmtKm = (d) => (d == null ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

/* Suivi en direct du livreur d'une commande, cote restaurant (rafraichi toutes les 4 s) */
export default function DriverTracking({ orderId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => merchantAPI.tracking(orderId)
      .then(({ data }) => { if (alive) { setData(data); setError(''); } })
      .catch(err => { if (alive) setError(err.response?.data?.error || 'Suivi indisponible pour le moment.'); });
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [orderId]);

  const d = data?.driver;
  const driverPt = d?.lat != null ? { lat: d.lat, lng: d.lng } : null;
  const restoPt = data?.restaurant?.lat != null ? { lat: data.restaurant.lat, lng: data.restaurant.lng } : null;
  const deliveryPt = data?.delivery?.lat != null ? { lat: data.delivery.lat, lng: data.delivery.lng } : null;
  const age = d?.updatedAt ? Math.max(0, Math.round((Date.now() - new Date(d.updatedAt).getTime()) / 1000)) : null;
  const toResto = kmBetween(driverPt, restoPt);
  const toClient = kmBetween(driverPt, deliveryPt);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Suivi du livreur</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>{orderId}</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'var(--cream)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={16} aria-hidden="true" /></button>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {!data ? <div style={{ height: 300, borderRadius: 18, background: '#EEE8E2' }} /> : (
          <>
            <Suspense fallback={<div style={{ height: 300, borderRadius: 18, background: '#EEE8E2' }} />}>
              <LiveMap restaurant={restoPt} delivery={deliveryPt} driver={driverPt} pickup={data.pickup?.lat != null ? { lat: data.pickup.lat, lng: data.pickup.lng } : null} trail={data.trail || []} height={300} />
            </Suspense>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d ? d.name : 'Pas encore de livreur'}{d?.plate ? <span style={{ fontWeight: 500, color: 'var(--gray)', fontSize: 12 }}> · {d.plate}</span> : null}</div>
                <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 2 }}>
                  {!d ? 'Assigne un livreur pour le suivre ici.'
                    : !driverPt ? "Le livreur n'a pas encore partagé sa position."
                    : <>À {fmtKm(toResto)} du restaurant{toClient != null ? `, ${fmtKm(toClient)} du client` : ''}{age != null ? (age > 60 ? ' · position non actualisée' : ` · il y a ${age} s`) : ''}</>}
                </div>
              </div>
              {d?.phone && <a href={`tel:${d.phone}`} aria-label="Appeler le livreur" style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--emerald)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Phone size={18} aria-hidden="true" /></a>}
            </div>

            <div style={{ marginTop: 12, background: 'var(--cream)', borderRadius: 14, padding: '10px 12px', fontSize: 12.5, display: 'flex', gap: 8 }}>
              <MapPin size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600 }}>Livraison : {data.delivery?.address}</div>
                {data.delivery?.landmark && <div style={{ color: 'var(--gray)' }}>Repère : {data.delivery.landmark}</div>}
                {!deliveryPt && <div style={{ color: 'var(--gray)' }}>Le client n'a pas placé son point sur la carte.</div>}
              </div>
            </div>

            {(deliveryPt || data.delivery?.mapsLink) && (
              <a href={deliveryPt ? `https://www.google.com/maps/dir/?api=1&destination=${deliveryPt.lat},${deliveryPt.lng}` : data.delivery.mapsLink} target="_blank" rel="noopener noreferrer"
                style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 999, border: '1.5px solid var(--border)', color: 'var(--ink)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                <Navigation size={16} aria-hidden="true" /> Ouvrir l'adresse du client dans Google Maps
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
