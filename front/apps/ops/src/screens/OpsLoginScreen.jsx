import { useApp } from '../context/AppContext';
import { StatusBar } from '../components/UI';

export default function OpsLoginScreen() {
  const { navigate } = useApp();

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--grad-brand)' }}>
      <StatusBar light />
      <div style={{ padding: '32px 24px 24px' }}>
        <img src="/icon-192.png" alt="WAYI" style={{ height: 44, width: 44, borderRadius: 13, boxShadow: '0 8px 18px rgba(0,0,0,0.25)' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, color: '#fff', marginTop: 12 }}>
          Wayi Pro
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 }}>
          Espace professionnel : restaurants, boutiques et back office
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--cream)', borderRadius: '24px 24px 0 0', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={() => navigate('merchant_login')}
          style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}
        >
          
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Restaurant partenaire</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Gérer mes commandes et mon activité</div>
          </div>
          
        </button>

        <button
          onClick={() => navigate('shop_login')}
          style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Boutique partenaire (Mode)</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Publier mes articles, gérer mon stock et mes commandes</div>
          </div>
        </button>

        <button
          onClick={() => navigate('admin_login')}
          style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left' }}
        >
          
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Super admin</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Menu du jour, restaurants, supervision</div>
          </div>
          
        </button>
      </div>
    </div>
  );
}
