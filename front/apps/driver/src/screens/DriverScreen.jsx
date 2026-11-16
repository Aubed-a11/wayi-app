import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigation, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { DynamicIcon } from '../components/DynamicIcon';
import { driversAPI } from '../api';
import { getSocket, disconnectSocket } from '../socket';
import { watchPosition } from '../lib/gps';
import { notifyPhone, askNotificationPermission } from '../lib/native';

const CAPTURE_FIELDS = [
  { key: 'buildingType',     label: 'Type de bâtiment', options: ['apartment', 'house', 'office', 'compound', 'shop'] },
  { key: 'accessDifficulty', label: 'Accès',            options: ['easy', 'moderate', 'difficult'] },
];

// Repère donné par le client + bouton qui ouvre sa position dans Google Maps (ou l'appli Maps du téléphone).
function DeliveryPoint({ landmark, mapsLink }) {
  if (!landmark && !mapsLink) return null;
  return (
    <div className="delivery-point">
      {landmark && <div className="delivery-landmark"><MapPin size={13} aria-hidden="true" /> Repère : {landmark}</div>}
      {mapsLink && (
        <a className="maps-btn" href={mapsLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          <Navigation size={16} aria-hidden="true" /> Ouvrir dans Maps
        </a>
      )}
    </div>
  );
}

export default function DriverScreen() {
  const { state, dispatch, navigate } = useApp();
  const driver = state.driver;

  const [tab, setTab] = useState('dashboard');

  // ── Changer mon mot de passe ─────────────────────────────────
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const submitPasswordChange = async () => {
    setPwError(''); setPwSuccess(false);
    if (!pwForm.currentPassword || !pwForm.newPassword) { setPwError('Tous les champs sont requis'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Les nouveaux mots de passe ne correspondent pas'); return; }
    if (pwForm.newPassword.length < 6) { setPwError('Le nouveau mot de passe doit faire au moins 6 caractères'); return; }
    setPwSaving(true);
    try {
      await driversAPI.changePassword(pwForm.currentPassword, pwForm.newPassword);
      setPwSuccess(true);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Impossible de changer le mot de passe.');
    } finally {
      setPwSaving(false);
    }
  };
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [incomingPing, setIncomingPing] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [gpsError, setGpsError] = useState('');
  const [captureForm, setCaptureForm] = useState({ buildingType: '', accessDifficulty: '', notes: '' });
  const [captureSent, setCaptureSent] = useState(false);
  const [captureError, setCaptureError] = useState('');

  const watchIdRef = useRef(null);
  useEffect(() => { askNotificationPermission(); }, []);
  const lastSentRef = useRef(0);
  const countdownTimerRef = useRef(null);

  // ── Redirection si pas connecté ─────────────────────────────
  useEffect(() => {
    if (!state.driverToken) navigate('driver_login');
  }, [state.driverToken]);

  // ── Chargement du dashboard ──────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await driversAPI.dashboard();
      setDashboard(data);
      if (data.incomingPing && !incomingPing) {
        setIncomingPing(data.incomingPing);
      }
    } catch {
      // token invalide → déconnecté par l'intercepteur
    } finally {
      setLoading(false);
    }
  }, [incomingPing]);

  useEffect(() => {
    if (!state.driverToken) return;
    loadDashboard();
    const poll = setInterval(loadDashboard, 12000); // filet de sécurité si le socket rate un ping
    return () => clearInterval(poll);
  }, [state.driverToken]);

  // ── Connexion temps réel : réception des pings de commande ──
  useEffect(() => {
    if (!state.driverToken) return;
    const socket = getSocket(state.driverToken);

    const onPing = (payload) => {
      setIncomingPing(payload);
      notifyPhone('Nouvelle course WAYI', `${payload?.restaurantName || payload?.restaurant?.name || 'Un restaurant'} : accepte-la vite, elle expire bientôt.`);
    };
    socket.on('order:ping', onPing);

    // Le restaurant vient de marquer le plat prêt → on rafraîchit tout de suite
    // au lieu d'attendre le polling de secours (jusqu'à 12s de retard sinon).
    const onReady = () => { loadDashboard(); notifyPhone('Commande prête', 'Le restaurant a préparé la commande, tu peux la récupérer.'); };
    socket.on('order:ready_for_pickup', onReady);

    return () => {
      socket.off('order:ping', onPing);
      socket.off('order:ready_for_pickup', onReady);
    };
  }, [state.driverToken]);

  // ── Compte à rebours du ping en cours (n'existe pas pour une commande assignée par l'admin) ──
  useEffect(() => {
    clearInterval(countdownTimerRef.current);
    if (!incomingPing || incomingPing.assignedByAdmin) { setCountdown(0); return; }
    setCountdown(incomingPing.expiresInSec || 20);
    countdownTimerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownTimerRef.current);
          setIncomingPing(null); // expiré → transmis au livreur suivant côté serveur
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownTimerRef.current);
  }, [incomingPing]);

  // ── Partage de position GPS quand en ligne ───────────────────
  const startSharingLocation = useCallback(() => {
    if (watchIdRef.current) return;
    // Dans l'appli mobile, le partage continue en arriere-plan (voir lib/gps.js)
    watchIdRef.current = watchPosition(
      ({ latitude, longitude }) => {
        const now = Date.now();
        if (now - lastSentRef.current < 4000) return; // throttle ~4s
        lastSentRef.current = now;
        driversAPI.updateLocation(latitude, longitude).catch(() => {});
      },
      (msg) => setGpsError(msg),
    );
  }, []);

  const stopSharingLocation = useCallback(() => {
    if (watchIdRef.current) {
      watchIdRef.current();
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => stopSharingLocation(), []); // cleanup on unmount

  // Reprend automatiquement le partage GPS si le livreur était déjà en ligne
  // (ex : rechargement de page, reconnexion) - sinon le suivi en direct du client
  // s'interrompt silencieusement sans que personne ne le remarque.
  useEffect(() => {
    const isActive = dashboard?.driver?.status === 'available' || dashboard?.driver?.status === 'busy';
    if (isActive && !watchIdRef.current) {
      startSharingLocation();
    }
  }, [dashboard?.driver?.status, startSharingLocation]);

  // ── Toggle présence en ligne ──────────────────────────────────
  const toggleOnline = async () => {
    const goingOnline = dashboard?.driver?.status !== 'available';
    setTogglingStatus(true);
    setGpsError('');

    if (goingOnline) {
      // Récupère une position initiale avant d'activer le statut
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            await driversAPI.setStatus('available', latitude, longitude);
            startSharingLocation();
            loadDashboard();
          } catch (err) {
            setGpsError(err.response?.data?.error || 'Impossible de passer en ligne pour le moment.');
          } finally {
            setTogglingStatus(false);
          }
        },
        () => {
          setGpsError("Position GPS requise pour passer en ligne.");
          setTogglingStatus(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      try {
        stopSharingLocation();
        await driversAPI.setStatus('offline');
        loadDashboard();
      } finally {
        setTogglingStatus(false);
      }
    }
  };

  const acceptPing = async () => {
    if (!incomingPing) return;
    try {
      await driversAPI.acceptOrder(incomingPing.orderId);
      setIncomingPing(null);
      loadDashboard();
    } catch (err) {
      setGpsError(err.response?.data?.error || 'Cette commande a déjà été prise');
      setIncomingPing(null);
    }
  };

  const declinePing = async () => {
    if (!incomingPing) return;
    try { await driversAPI.declineOrder(incomingPing.orderId); } catch {}
    setIncomingPing(null);
  };

  const [actionLoading, setActionLoading] = useState(false);
  const pickupOrder = async () => {
    if (!dashboard?.activeDelivery) return;
    setActionLoading(true);
    try {
      await driversAPI.pickupOrder(dashboard.activeDelivery.id);
      loadDashboard();
    } catch (err) {
      setGpsError(err.response?.data?.error || 'Impossible de récupérer cette commande');
    } finally {
      setActionLoading(false);
    }
  };

  const completeOrder = async () => {
    if (!dashboard?.activeDelivery) return;
    setActionLoading(true);
    try {
      await driversAPI.completeOrder(dashboard.activeDelivery.id);
      loadDashboard();
    } catch (err) {
      setGpsError(err.response?.data?.error || 'Impossible de finaliser cette livraison');
    } finally {
      setActionLoading(false);
    }
  };

  const submitCapture = async () => {
    if (!captureForm.buildingType || !dashboard?.activeDelivery) return;
    setCaptureError('');
    try {
      await driversAPI.capture({
        orderId: dashboard.activeDelivery.id,
        userId: dashboard.activeDelivery.userId,
        observations: captureForm,
      });
      setCaptureSent(true);
      setTimeout(() => setCaptureSent(false), 3000);
    } catch (err) {
      setCaptureError(err.response?.data?.error || "Impossible d'envoyer la capture pour le moment.");
    }
  };

  const logout = () => {
    stopSharingLocation();
    disconnectSocket();
    dispatch({ type: 'DRIVER_LOGOUT' });
    navigate('driver_login');
  };

  if (!driver || loading) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={32} />
      </div>
    );
  }

  const status = dashboard?.driver?.status || 'offline';
  const statusConfig = {
    available: { label: 'En ligne', color: '#22c55e', bg: '#dcfce7' },
    busy:      { label: 'En livraison', color: '#f59e0b', bg: '#fef3c7' },
    offline:   { label: 'Hors ligne', color: 'var(--gray)', bg: 'var(--border)' },
  };
  const sc = statusConfig[status] || statusConfig.offline;

  return (
    <div className="screen" style={{ flexDirection: 'column' }}>

      {/* Header */}
      <div className="header-em" style={{ flexShrink: 0, borderRadius: '0 0 28px 28px' }}>
        <StatusBar light />
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--grad-sun)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#fff' }}>{dashboard?.driver?.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, color: '#fff' }}>{dashboard?.driver?.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}> {dashboard?.driver?.vehicle?.plate} - {dashboard?.driver?.rating}</div>
          </div>
          <button onClick={logout} title="Déconnexion" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>Quitter</button>
        </div>

        {/* Toggle en ligne / hors ligne - présence + partage GPS */}
        <div style={{ padding: '0 20px 16px' }}>
          <button
            onClick={toggleOnline}
            disabled={togglingStatus || status === 'busy' || dashboard?.driver?.suspended}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: sc.bg, color: sc.color, border: 'none', borderRadius: 'var(--r-md)',
              padding: '14px 16px', cursor: (status === 'busy' || dashboard?.driver?.suspended) ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: sc.color, display: 'inline-block' }} />
              {togglingStatus ? 'Mise à jour...' : sc.label}
              {status === 'available' && <span style={{ fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>position partagée</span>}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{status === 'busy' ? 'Livraison en cours' : status === 'available' ? 'Passer hors ligne' : 'Passer en ligne'}</span>
          </button>
          {dashboard?.driver?.suspended && (
            <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: 8, color: 'var(--danger)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
               {dashboard?.driver?.pendingApproval
                 ? "Ton compte est en attente de validation par l'équipe WAYI. Tu pourras passer en ligne dès qu'il sera activé."
                 : "Ton compte est suspendu par l'administration. Contacte le support WAYI."}
            </div>
          )}
          {gpsError && <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}> {gpsError}</div>}
        </div>
      </div>

      {/* Ping entrant - commande à accepter/décliner */}
      {incomingPing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'var(--white)', borderRadius: '24px 24px 0 0', padding: '24px 20px', width: '100%', animation: 'scaleIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span className="badge badge-sun" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                 {incomingPing.assignedByAdmin ? 'Commande assignée par le super admin' : 'Nouvelle commande'}
              </span>
              {!incomingPing.assignedByAdmin && (
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: countdown <= 5 ? 'var(--danger)' : 'var(--ink)' }}>{countdown}s</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <DynamicIcon name={incomingPing.restaurantIcon} size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{incomingPing.restaurantName}</div>
                <div style={{ color: 'var(--gray)', fontSize: 12 }}>{incomingPing.address}</div>
                <DeliveryPoint landmark={incomingPing.landmark} mapsLink={incomingPing.mapsLink} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, color: 'var(--sun)', fontSize: 18 }}>{incomingPing.estimatedEarnings?.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F</div>
                <div style={{ fontSize: 10, color: 'var(--gray)' }}>tes gains</div>
              </div>
            </div>
            <div style={{ background: 'var(--cream)', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--gray)' }}>
              {(incomingPing.items || []).map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><DynamicIcon name={it.icon} size={13} /> {it.name} x{it.qty}</div>
              ))}
            </div>
            {incomingPing.assignedByAdmin ? (
              <button onClick={() => { setIncomingPing(null); loadDashboard(); }} style={{ width: '100%', background: 'var(--grad-brand)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                 Compris, je m'en occupe
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={declinePing} style={{ flex: 1, background: 'var(--white)', border: '1.5px solid var(--danger)', color: 'var(--danger)', borderRadius: 'var(--r-md)', padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                   Décliner
                </button>
                <button onClick={acceptPing} style={{ flex: 2, background: 'var(--grad-brand)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                   Accepter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', padding: '0 20px' }}>
          {[['dashboard', 'Dashboard'], ['capture', 'Capture terrain']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: '13px 0', border: 'none', background: 'none',
              borderBottom: tab === k ? '3px solid var(--emerald)' : '3px solid transparent',
              color: tab === k ? 'var(--emerald)' : 'var(--gray)',
              fontWeight: tab === k ? 800 : 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}><span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{label}</span></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingBottom: 20 }}>

        {tab === 'dashboard' && (
          <>
            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { val: dashboard?.stats?.todayDeliveries ?? 0, label: "Livraisons aujourd'hui", color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: `${(dashboard?.stats?.todayEarnings ?? 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F`, label: "Gains aujourd'hui", color: '#F7ECE3', textColor: '#c45012' },
                { val: `${(dashboard?.stats?.monthlyEarnings ?? 0).toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0')} F`, label: 'Gains ce mois', color: 'var(--emerald-light)', textColor: 'var(--emerald-dark)' },
                { val: dashboard?.stats?.totalDeliveries ?? 0, label: 'Total livraisons', color: '#F7ECE3', textColor: '#c45012' },
              ].map(s => (
                <div key={s.label} style={{ background: s.color, borderRadius: 'var(--r-lg)', padding: '16px 14px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: s.textColor }}>{s.val}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Livraison active */}
            {dashboard?.activeDelivery ? (
              <div style={{ background: 'var(--white)', border: '2px solid var(--emerald)', borderRadius: 'var(--r-lg)', padding: '14px', marginBottom: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--emerald-dark)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}> Livraison en cours</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <DynamicIcon name={dashboard.activeDelivery.restaurantIcon} size={26} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{dashboard.activeDelivery.restaurantName}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray)' }}>{dashboard.activeDelivery.id} - {dashboard.activeDelivery.address}</div>
                    <DeliveryPoint landmark={dashboard.activeDelivery.landmark} mapsLink={dashboard.activeDelivery.mapsLink} />
                  </div>
                </div>

                {['confirmed', 'preparing'].includes(dashboard.activeDelivery.status) && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
                      Statut : <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{dashboard.activeDelivery.status === 'preparing' ? 'Le restaurant prépare la commande' : 'Commande confirmée'}</span>
                    </div>
                    <button disabled style={{ width: '100%', background: 'var(--border)', color: 'var(--gray)', border: 'none', borderRadius: 'var(--r-md)', padding: '13px', fontWeight: 800, fontSize: 13, cursor: 'not-allowed', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                       En attente du restaurant...
                    </button>
                  </>
                )}

                {dashboard.activeDelivery.status === 'ready' && (
                  <>
                    <div style={{
                      fontSize: 13, color: 'var(--emerald-dark)', marginBottom: 10, fontWeight: 700,
                      background: 'var(--emerald-light)', borderRadius: 'var(--r-md)', padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeIn 0.4s ease',
                    }}>
                       Le plat est prêt ! File le récupérer au restaurant.
                    </div>
                    <button onClick={pickupOrder} disabled={actionLoading} style={{ width: '100%', background: 'var(--grad-brand)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '13px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {actionLoading ? <Spinner size={16} color="#fff" /> : <> J'ai récupéré la commande</>}
                    </button>
                  </>
                )}

                {dashboard.activeDelivery.status === 'on_the_way' && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
                      Statut : <span style={{ fontWeight: 700, color: 'var(--ink)' }}>En route vers le client</span> - ta position est partagée en direct
                    </div>
                    <button onClick={completeOrder} disabled={actionLoading} style={{ width: '100%', background: 'var(--grad-sun)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '13px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {actionLoading ? <Spinner size={16} color="#fff" /> : <> Marquer comme livré</>}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--emerald-light)', borderRadius: 'var(--r-lg)', padding: '16px', marginBottom: 20, textAlign: 'center' }}>
                <div style={{ color: 'var(--emerald-dark)', fontWeight: 700, fontSize: 13 }}>
                  {status === 'available' ? 'En attente de commande' : 'Passe en ligne pour recevoir des commandes'}
                </div>
              </div>
            )}

            {/* Livraisons récentes */}
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, color: 'var(--ink)', marginBottom: 10 }}>
              Livraisons récentes
            </div>
            {(dashboard?.recentDeliveries || []).length === 0 ? (
              <div style={{ color: 'var(--gray)', fontSize: 13 }}>Aucune livraison pour le moment.</div>
            ) : dashboard.recentDeliveries.map(d => (
              <div key={d.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--grad-soft)', color: 'var(--emerald-dark)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(d.restaurantName || 'W').trim().charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{d.restaurantName}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>{d.id}</div>
                </div>
                <span className="badge badge-emerald" style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3 }}> Livré</span>
              </div>
            ))}

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginTop: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Changer mon mot de passe</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Mot de passe actuel" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
                <input placeholder="Nouveau mot de passe" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
                <input placeholder="Confirmer le nouveau mot de passe" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))} />

                {pwError && <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{pwError}</div>}
                {pwSuccess && <div style={{ color: 'var(--emerald-dark)', fontSize: 12, fontWeight: 600 }}>Mot de passe mis à jour.</div>}

                <button onClick={submitPasswordChange} disabled={pwSaving} className="btn btn-primary" style={{ padding: 12, fontSize: 13 }}>
                  {pwSaving ? <Spinner size={16} color="#fff" /> : 'Mettre à jour'}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'capture' && (
          <>
            <div style={{ background: 'var(--emerald-light)', borderRadius: 'var(--r-lg)', padding: '14px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--emerald-dark)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}> Capture terrain</div>
              <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5 }}>
                {dashboard?.activeDelivery ? 'Renseigne quelques infos sur cette adresse pour aider Wayi.' : "Disponible une fois qu'une livraison est en cours."}
              </div>
            </div>

            {CAPTURE_FIELDS.map(field => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', marginBottom: 6 }}>{field.label.toUpperCase()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {field.options.map(opt => (
                    <button key={opt} onClick={() => setCaptureForm(f => ({ ...f, [field.key]: opt }))} style={{
                      padding: '8px 14px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600,
                      background: captureForm[field.key] === opt ? 'var(--emerald)' : 'var(--white)',
                      color: captureForm[field.key] === opt ? '#fff' : 'var(--gray)',
                      border: `1px solid ${captureForm[field.key] === opt ? 'var(--emerald)' : 'var(--border)'}`,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', marginBottom: 6 }}>NOTES (OPTIONNEL)</div>
              <textarea value={captureForm.notes} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Ex: Résidence sécurisée, appeler avant, gardien à l'entrée" rows={3}
                style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13, fontFamily: 'var(--font-body)', resize: 'none' }} />
            </div>

            {captureSent ? (
              <div style={{ background: 'var(--emerald-light)', borderRadius: 'var(--r-lg)', padding: '16px', textAlign: 'center' }}>
                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: 'var(--emerald-dark)' }}></div>
                <div style={{ fontWeight: 800, color: 'var(--emerald-dark)' }}>Capture envoyée !</div>
              </div>
            ) : (
              <>
                <button onClick={submitCapture} disabled={!captureForm.buildingType || !dashboard?.activeDelivery}
                  style={{ width: '100%', background: (captureForm.buildingType && dashboard?.activeDelivery) ? 'var(--emerald)' : 'var(--border)', color: (captureForm.buildingType && dashboard?.activeDelivery) ? '#fff' : 'var(--gray)', border: 'none', borderRadius: 'var(--r-md)', padding: '15px', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                   Soumettre la capture terrain
                </button>
                {captureError && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginTop: 10, textAlign: 'center' }}>{captureError}</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
