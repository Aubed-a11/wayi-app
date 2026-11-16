import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { driversAPI } from '../api';

export default function DriverLoginScreen() {
  const { dispatch, navigate } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('E-mail et mot de passe requis'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await driversAPI.login({ email, password });
      dispatch({ type: 'DRIVER_LOGIN', payload: { driver: data.driver, token: data.token } });
      navigate('driver');
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--grad-brand)' }}>
      <StatusBar light />

      <div style={{ padding: '32px 24px 24px' }}>
        <img src="/icon-192.png" alt="WAYI" style={{ height: 52, width: 52, borderRadius: 15, boxShadow: '0 8px 18px rgba(0,0,0,0.25)' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: '#fff', marginTop: 12 }}>
          Espace livreur
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>
          Connexion sécurisée - Reçois tes livraisons en temps réel
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--cream)', borderRadius: '24px 24px 0 0', padding: '28px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>E-MAIL</label>
            <input placeholder="toi@example.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} type="email" />
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

          <button className="btn btn-primary" onClick={handleLogin} disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <Spinner size={20} color="#fff" /> : 'Se connecter'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20, color: 'var(--gray)', fontSize: 11 }}>
            Wayi Livreur v1.0
          </div>
        </div>
      </div>
    </div>
  );
}
