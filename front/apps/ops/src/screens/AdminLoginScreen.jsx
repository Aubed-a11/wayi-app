import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBar, Spinner } from '../components/UI';
import { adminAPI } from '../api';

export default function AdminLoginScreen() {
  const { dispatch, navigate } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLogin = async (em, pw) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await adminAPI.login({ email: em, password: pw });
      dispatch({ type: 'ADMIN_LOGIN', payload: { admin: data.admin, token: data.token } });
      navigate('admin');
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
          Backoffice WAYI
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 }}>
          Accès super admin - Menu du jour, restaurants, supervision
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--cream)', borderRadius: '24px 24px 0 0', padding: '28px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>E-MAIL</label>
            <input placeholder="admin@example.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} type="email" />
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

          <button
            onClick={() => navigate('ops_login')}
            style={{ background: 'none', border: 'none', color: 'var(--gray)', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 8, fontFamily: 'var(--font-body)' }}
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
