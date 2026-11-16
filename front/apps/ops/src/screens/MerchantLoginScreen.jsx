import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { merchantAPI } from '../api';

export default function MerchantLoginScreen() {
  const { dispatch, navigate } = useApp();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [form, setForm] = useState({ restaurantName: '', contactName: '', email: '', phone: '', zone: '', lat: '', lng: '', password: '', confirmPassword: '' });
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSimulated, setEmailSimulated] = useState(false);
  const [devCode, setDevCode] = useState('');
  const codeInputs = useRef([]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };

  const doLogin = async (e, pw) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await merchantAPI.login({ email: e, password: pw });
      dispatch({ type: 'MERCHANT_LOGIN', payload: { merchant: data.merchant, token: data.token } });
      navigate('merchant');
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    if (!form.restaurantName || !form.contactName || !form.email || !form.password) { setError('Tous les champs sont requis'); return; }
    if (form.password !== form.confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    if (form.password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await merchantAPI.registerStart(form);
      setEmailSimulated(!!data.emailSimulated);
      if (data.devCode) { setDevCode(data.devCode); setCode(data.devCode.split('')); } else { setDevCode(''); }
      setMode('verify');
      setTimeout(() => codeInputs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[i] = val;
    setCode(next);
    setError('');
    if (val && i < 5) codeInputs.current[i + 1]?.focus();
  };
  const handleCodeKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) codeInputs.current[i - 1]?.focus();
  };

  const verifyCode = async () => {
    const full = code.join('');
    if (full.length !== 6) { setError('Entre le code à 6 chiffres'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await merchantAPI.registerVerify(form.email, full);
      dispatch({ type: 'MERCHANT_LOGIN', payload: { merchant: data.merchant, token: data.token } });
      navigate('merchant');
    } catch (err) {
      setError(err.response?.data?.error || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setError('');
    try {
      const { data } = await merchantAPI.registerResend(form.email);
      setEmailSimulated(!!data.emailSimulated);
      if (data.devCode) { setDevCode(data.devCode); setCode(data.devCode.split('')); } else { setDevCode(''); }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  // ── Écran de vérification du code e-mail ────────────────────
  if (mode === 'verify') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--cream)' }}>
        <StatusBar />
        <div style={{ background: 'var(--emerald-dark)', padding: '24px 24px 40px', borderRadius: '0 0 32px 32px', flexShrink: 0 }}>
          <img src="/icon-192.png" alt="WAYI" style={{ height: 44, width: 44, borderRadius: 13, boxShadow: '0 8px 18px rgba(0,0,0,0.25)' }} />
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 8 }}>Vérifie ton e-mail</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: '#fff', marginTop: 4, lineHeight: 1.2 }}>
            Entre le code envoyé à<br />{form.email}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
          {emailSimulated && (
            <div style={{ background: '#fff8e6', border: '1px solid #f0d98c', borderRadius: 'var(--r-sm)', padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#8a6d1a' }}>
              {devCode ? (
                <span>L'envoi d'e-mail n'est pas disponible pour le moment (phase de test). Ton code a été pré-rempli automatiquement ci-dessous - vérifie-le puis valide.</span>
              ) : (
                <span>Aucun service d'e-mail n'est configuré sur ce serveur pour le moment : ton code n'a pas été envoyé à ta boîte mail. Contacte l'administrateur de la plateforme.</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {code.map((c, i) => (
              <input
                key={i}
                ref={el => codeInputs.current[i] = el}
                value={c}
                onChange={e => handleCodeChange(i, e.target.value)}
                onKeyDown={e => handleCodeKeyDown(i, e)}
                inputMode="numeric"
                maxLength={1}
                style={{ width: 42, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
              />
            ))}
          </div>

          {error && (
            <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={verifyCode} disabled={loading}>
            {loading ? <Spinner size={20} color="#fff" /> : 'Vérifier et créer mon compte'}
          </button>

          <button onClick={resendCode} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 16, background: 'none', border: 'none', color: 'var(--emerald)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Renvoyer le code
          </button>
          <button onClick={() => { setMode('register'); setCode(['', '', '', '', '', '']); setError(''); }} style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 8, background: 'none', border: 'none', color: 'var(--gray)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Modifier mes informations
          </button>
        </div>
      </div>
    );
  }

  // ── Écran de connexion / inscription ────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--emerald-dark)' }}>
      <StatusBar light />

      <div style={{ padding: '32px 24px 24px' }}>
        <img src="/icon-192.png" alt="WAYI" style={{ height: 52, width: 52, borderRadius: 15, boxShadow: '0 8px 18px rgba(0,0,0,0.25)' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: '#fff', marginTop: 12 }}>
          {mode === 'login' ? 'Espace restaurant' : 'Crée ton compte restaurant'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
          {mode === 'login' ? 'Connexion sécurisée - Gère tes commandes en direct' : 'Rejoins la plateforme et gère ton propre menu'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)', borderRadius: '24px 24px 0 0', padding: '28px 24px 24px' }}>

        <div style={{ display: 'flex', background: 'var(--white)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', padding: 4, marginBottom: 20 }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
              flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: mode === m ? 'var(--emerald)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--gray)',
              fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
              transition: 'all 0.2s',
            }}>
              {m === 'login' ? 'Connexion' : 'Créer un compte'}
            </button>
          ))}
        </div>

        {mode === 'login' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>E-MAIL</label>
              <input placeholder="restaurant@example.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} type="email" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>MOT DE PASSE</label>
              <input placeholder="********" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} type="password" />
            </div>

            {error && (
              <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" onClick={() => doLogin(email, password)} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={20} color="#fff" /> : 'Se connecter'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>NOM DU RESTAURANT</label>
              <input placeholder="Ex: Chez Mama" value={form.restaurantName} onChange={e => set('restaurantName', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>TON NOM (CONTACT)</label>
              <input placeholder="Nom du gérant" value={form.contactName} onChange={e => set('contactName', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>E-MAIL</label>
              <input placeholder="restaurant@example.com" value={form.email} onChange={e => set('email', e.target.value)} type="email" />
              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>On t'enverra un code pour vérifier ton e-mail.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>TÉLÉPHONE (OPTIONNEL)</label>
              <input placeholder="+229 XX XX XX XX" value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>ZONE (OPTIONNEL)</label>
              <input placeholder="Ex : Cité GBÉTO" value={form.zone} onChange={e => set('zone', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>POSITION (OPTIONNEL)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Latitude" type="number" step="0.0001" value={form.lat} onChange={e => set('lat', e.target.value)} style={{ flex: 1 }} />
                <input placeholder="Longitude" type="number" step="0.0001" value={form.lng} onChange={e => set('lng', e.target.value)} style={{ flex: 1 }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>Laisse vide si tu ne les connais pas - tu pourras les ajuster plus tard.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>MOT DE PASSE</label>
              <input placeholder="********" value={form.password} onChange={e => set('password', e.target.value)} type="password" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>CONFIRMER LE MOT DE PASSE</label>
              <input placeholder="********" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} type="password" />
            </div>

            {error && (
              <div style={{ background: '#fde8e6', border: '1px solid #f5c0bb', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" onClick={submitRegister} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={20} color="#fff" /> : 'Continuer'}
            </button>
          </div>
        )}

        <button
          onClick={() => navigate('ops_login')}
          style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 16, width: '100%', textAlign: 'center', fontFamily: 'var(--font-body)' }}
        >
          Retour
        </button>
      </div>
    </div>
  );
}
