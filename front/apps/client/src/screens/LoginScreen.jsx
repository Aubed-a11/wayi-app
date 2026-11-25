import { useState, useRef, useEffect } from 'react';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, MailCheck, KeyRound, Store, Bike, Phone, MapPin, Hash, ShieldCheck, UtensilsCrossed, BadgePercent } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Spinner } from '../components/UI';
import { authAPI, signupAPI, menuAPI } from '../api';
import { openSpace, rememberClient, ROLE_LABEL } from '../lib/roles';
import '../auth.css';

// Force du mot de passe (indication simple pour l'inscription)
function strength(pwd) {
  if (!pwd) return 0;
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/\d/.test(pwd) && /[a-zA-Z]/.test(pwd)) s++;
  if (/[^a-zA-Z0-9]/.test(pwd) || /[A-Z]/.test(pwd)) s++;
  return Math.min(3, Math.max(1, s - (pwd.length < 6 ? 1 : 0)));
}
const STRENGTH = ['', 'Faible', 'Correct', 'Solide'];

const EMPTY_CODE = ['', '', '', '', '', ''];

// Les trois profils proposes a l'inscription
const ROLES = [
  { id: 'client', label: 'Client', desc: 'Je commande mes repas', Icon: UtensilsCrossed },
  { id: 'merchant', label: 'Restaurant', desc: 'Je vends mes plats', Icon: Store },
  { id: 'driver', label: 'Livreur', desc: 'Je livre les commandes', Icon: Bike },
];
const VEHICLES = [['moto', 'Moto'], ['velo', 'Vélo'], ['voiture', 'Voiture'], ['tricycle', 'Tricycle']];
const ROLE_ICON = { client: UtensilsCrossed, merchant: Store, driver: Bike, admin: ShieldCheck };

export default function LoginScreen() {
  const { dispatch, navigate } = useApp();
  // 'login' | 'register' | 'verify' | 'forgot' | 'reset'
  const [mode, setMode] = useState(() => {
    try { const m = sessionStorage.getItem('wayi.authMode'); sessionStorage.removeItem('wayi.authMode'); return m === 'register' ? 'register' : 'login'; } catch (_) { return 'login'; }
  });
  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    menuAPI.get({}).then(r => setPhotos((r.data?.dishes || []).map(d => d.image).filter(Boolean))).catch(() => {});
  }, []);
  const [form, setForm] = useState({ promoCode: '', name: '', email: '', password: '', confirmPassword: '', restaurantName: '', phone: '', zone: '', vehicleType: 'moto', vehiclePlate: '' });
  // Profil choisi a l'inscription : client, restaurant ou livreur
  const [role, setRole] = useState('client');
  // Plusieurs espaces pour les memes identifiants : on demande lequel ouvrir
  const [accounts, setAccounts] = useState([]);
  const [code, setCode] = useState(EMPTY_CODE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [emailSimulated, setEmailSimulated] = useState(false);
  const [emailUnavailable, setEmailUnavailable] = useState(false);
  const [devCode, setDevCode] = useState('');
  const codeInputs = useRef([]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };
  const go = (m) => { setMode(m); setError(''); setNotice(''); setCode(EMPTY_CODE); setShowPwd(false); };

  // ── Connexion / inscription ─────────────────────────────────
  const handleSubmit = async () => {
    if (mode === 'login') {
      if (!form.email || !form.password) { setError('E-mail et mot de passe requis'); return; }
      setLoading(true);
      try {
        const { data } = await authAPI.loginAny({ email: form.email.trim(), password: form.password });
        if (data.accounts.length === 1) enter(data.accounts[0]);
        else { setAccounts(data.accounts); setMode('choose'); }
      } catch (err) {
        setError(err.response?.data?.error || 'Erreur de connexion');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!form.name || !form.email || !form.password) { setError('Tous les champs sont requis'); return; }
    if (role === 'merchant' && (!form.restaurantName.trim() || !form.phone.trim())) { setError('Nom du restaurant et téléphone requis'); return; }
    if (role === 'driver' && !form.phone.trim()) { setError('Ton numéro de téléphone est requis'); return; }
    if (form.password !== form.confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    if (form.password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
    setLoading(true);
    try {
      const { data } = role === 'merchant'
        ? await signupAPI.merchant.start({ restaurantName: form.restaurantName.trim(), contactName: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim(), zone: form.zone.trim() })
        : role === 'driver'
          ? await signupAPI.driver.start({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim(), zone: form.zone.trim(), vehicleType: form.vehicleType, vehiclePlate: form.vehiclePlate.trim() })
          : await authAPI.registerStart(form);
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

  // Ouvre l'espace correspondant au compte : client ici, sinon livreur / restaurant / admin
  const enter = (acc) => {
    if (acc.role === 'client') {
      rememberClient();
      dispatch({ type: 'LOGIN', payload: { token: acc.token, user: acc.user } });
      navigate('home');
      return;
    }
    openSpace(acc.role, acc.token);
  };

  // ── Saisie du code à 6 chiffres (commune à l'inscription et à la réinitialisation) ──
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
  const handleCodePaste = (e) => {
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setCode(Array.from({ length: 6 }, (_, i) => digits[i] || ''));
    codeInputs.current[Math.min(digits.length, 5)]?.focus();
  };

  const verifyCode = async () => {
    const full = code.join('');
    if (full.length !== 6) { setError('Entre le code à 6 chiffres'); return; }
    setLoading(true);
    try {
      const payload = { email: form.email.trim(), code: full };
      if (role === 'merchant') { const { data } = await signupAPI.merchant.verify(payload); openSpace('merchant', data.token); return; }
      if (role === 'driver') { const { data } = await signupAPI.driver.verify(payload); openSpace('driver', data.token); return; }
      const { data } = await authAPI.registerVerify(payload);
      enter({ role: 'client', token: data.token, user: data.user });
    } catch (err) {
      setError(err.response?.data?.error || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setError('');
    try {
      const { data } = role === 'merchant' ? await signupAPI.merchant.resend(form.email.trim())
        : role === 'driver' ? await signupAPI.driver.resend(form.email.trim())
        : await authAPI.registerResend(form.email);
      setEmailSimulated(!!data.emailSimulated);
      if (data.devCode) { setDevCode(data.devCode); setCode(data.devCode.split('')); } else { setDevCode(''); }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  // ── Mot de passe oublié ─────────────────────────────────────
  const sendResetCode = async () => {
    if (!form.email.trim() || !form.email.includes('@')) { setError('Entre ton adresse e-mail'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await authAPI.forgotPassword(form.email.trim());
      setEmailUnavailable(!!data.emailUnavailable);
      setCode(EMPTY_CODE);
      setMode('reset');
      setNotice('');
      setTimeout(() => codeInputs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur, réessaie dans un instant');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    const full = code.join('');
    if (full.length !== 6) { setError('Entre le code à 6 chiffres'); return; }
    if (form.password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
    if (form.password !== form.confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true); setError('');
    try {
      await authAPI.resetPassword({ email: form.email.trim(), code: full, password: form.password });
      setForm(f => ({ ...f, password: '', confirmPassword: '' }));
      setCode(EMPTY_CODE);
      setMode('login');
      setNotice('Mot de passe changé. Connecte-toi avec ton nouveau mot de passe.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur, réessaie');
    } finally {
      setLoading(false);
    }
  };

  const resendResetCode = async () => {
    setError(''); setNotice('');
    try {
      const { data } = await authAPI.forgotPassword(form.email.trim());
      setEmailUnavailable(!!data.emailUnavailable);
      setNotice('Un nouveau code vient d\'être envoyé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  // ── Petits blocs réutilisables ──────────────────────────────
  const msg = () => (
    <>
      {error && <div className="a7-msg err" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{error}</span></div>}
      {notice && !error && <div className="a7-msg ok"><CheckCircle2 size={18} aria-hidden="true" /><span>{notice}</span></div>}
    </>
  );

  const codeBoxes = () => (
    <div className="a7-code">
      {code.map((c, i) => (
        <input
          key={i}
          ref={el => codeInputs.current[i] = el}
          value={c}
          onChange={e => handleCodeChange(i, e.target.value)}
          onKeyDown={e => handleCodeKeyDown(i, e)}
          onPaste={handleCodePaste}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          className={c ? 'filled' : ''}
          aria-label={`Chiffre ${i + 1} du code`}
        />
      ))}
    </div>
  );

  const field = ({ label, Icon, k, type = 'text', placeholder, autoComplete, onEnter, password = false, hint }) => (
    <label className="a7-field">
      <span className="a7-label">{label}</span>
      <span className="a7-box">
        <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
        <input
          placeholder={placeholder}
          value={form[k]}
          onChange={e => set(k, e.target.value)}
          type={password ? (showPwd ? 'text' : 'password') : type}
          autoComplete={autoComplete}
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        />
        {password && (
          <button type="button" className="a7-eye" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}>
            {showPwd ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </span>
      {hint && <span className="a7-hint">{hint}</span>}
    </label>
  );

  const full = mode === 'login' || mode === 'register';
  const titles = {
    login:    ['Content de te |revoir', 'Client, restaurant ou livreur : connecte-toi, on t\'ouvre ton espace.'],
    register: role === 'merchant' ? ['Ton restaurant sur |WAYI', 'Crée ton espace restaurant, puis ajoute tes plats.']
      : role === 'driver' ? ['Livre avec |WAYI', 'Crée ton compte livreur. L\'équipe WAYI le valide avant ta première course.']
      : ['Bienvenue chez |WAYI', 'Crée ton compte, ça prend moins d\'une minute.'],
    choose:   ['Quel |espace ?', 'Ces identifiants ouvrent plusieurs espaces. Choisis celui que tu veux utiliser.'],
    verify:   ['Vérifie ton e-mail', `On a envoyé un code à 6 chiffres à ${form.email}.`],
    forgot:   ['Mot de passe oublié ?', 'Entre ton e-mail, on t\'envoie un code pour en choisir un nouveau.'],
    reset:    ['Nouveau mot de passe', `Entre le code reçu à ${form.email}, puis choisis ton nouveau mot de passe.`],
  };
  const back = () => go(mode === 'reset' ? 'forgot' : (mode === 'verify' ? 'register' : 'login'));
  const submit = mode === 'verify' ? verifyCode : mode === 'forgot' ? sendResetCode : mode === 'reset' ? resetPassword : handleSubmit;
  const pwdScore = strength(form.password);
  const StepIcon = mode === 'verify' ? MailCheck : mode === 'choose' ? ShieldCheck : KeyRound;

  return (
    <div className="screen a7">
      <span className="a7-blob b1" aria-hidden="true" /><span className="a7-blob b2" aria-hidden="true" />
      <div className="a7-scroll">
        {/* En-tete : logo, photos du menu du jour, titre */}
        <header className={`a7-hero${full ? '' : ' small'}`}>
          <div className="a7-top">
            {!full && <button className="a7-back a7-back-txt" onClick={back}>Retour</button>}
            <img src="/icon-192.png" alt="WAYI" className="a7-logo" />
            <span className="a7-brand">WAYI<small>Bénin</small></span>
          </div>

          {full && photos.length > 0 && (
            <div className="a7-marquee" aria-hidden="true">
              {[0, 1].map(row => {
                const list = row ? [...photos].reverse() : photos;
                return (
                  <div key={row} className={`a7-mq-row r${row}`}>
                    <div className="a7-mq-track">
                      {[...list, ...list].map((src, i) => <span key={i} className="a7-mq-photo"><img src={src} alt="" loading="lazy" /></span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!full && <div className="a7-step-ico" aria-hidden="true"><StepIcon size={30} strokeWidth={1.7} /></div>}

          <div className="a7-title" key={mode}>
            <h1>{titles[mode][0].split('|')[0]}{titles[mode][0].includes('|') && <span>{titles[mode][0].split('|')[1]}</span>}</h1>
            <p>{titles[mode][1]}</p>
          </div>
        </header>

        <main className="a7-card">
          {full && (
            <div className="a7-tabs" role="tablist">
              <span className={`a7-tabs-pill ${mode}`} aria-hidden="true" />
              {['login', 'register'].map(m => (
                <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => go(m)}>
                  {m === 'login' ? 'Connexion' : 'Inscription'}
                </button>
              ))}
            </div>
          )}

          <div className="a7-form" key={'f' + mode}>
            {mode === 'register' && (
              <div className="a7-roles" role="radiogroup" aria-label="Je suis">
                <span className="a7-label">Je suis</span>
                <div className="a7-roles-row">
                  {ROLES.map(({ id, label, desc, Icon }) => (
                    <button key={id} type="button" role="radio" aria-checked={role === id} className={`a7-role${role === id ? ' on' : ''}`} onClick={() => { setRole(id); setError(''); }}>
                      <span className="a7-role-ico"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'register' && role === 'merchant' && field({ label: 'Nom du restaurant', Icon: Store, k: 'restaurantName', placeholder: 'Ex : Chez Maman Piment', autoComplete: 'organization' })}
            {mode === 'register' && field({
              label: role === 'client' ? 'Prénom' : role === 'merchant' ? 'Ton nom (responsable)' : 'Nom complet',
              Icon: User, k: 'name', placeholder: role === 'client' ? 'Ton prénom' : 'Prénom et nom', autoComplete: role === 'client' ? 'given-name' : 'name',
            })}
            {mode === 'register' && role !== 'client' && field({ label: 'Téléphone', Icon: Phone, k: 'phone', type: 'tel', placeholder: '+229 01 00 00 00 00', autoComplete: 'tel' })}
            {mode === 'register' && role !== 'client' && field({ label: role === 'merchant' ? 'Quartier du restaurant' : 'Zone où tu livres', Icon: MapPin, k: 'zone', placeholder: 'Ex : Cadjehoun, Calavi...' })}
            {mode === 'register' && role === 'driver' && (
              <div className="a7-field">
                <span className="a7-label">Véhicule</span>
                <div className="a7-chips">
                  {VEHICLES.map(([v, l]) => (
                    <button key={v} type="button" className={form.vehicleType === v ? 'on' : ''} aria-pressed={form.vehicleType === v} onClick={() => set('vehicleType', v)}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'register' && role === 'driver' && form.vehicleType !== 'velo' && field({ label: 'Immatriculation', Icon: Hash, k: 'vehiclePlate', placeholder: 'Ex : AB 1234 RB' })}

            {mode === 'choose' && (
              <div className="a7-spaces">
                {accounts.map(acc => {
                  const Ico = ROLE_ICON[acc.role] || User;
                  return (
                    <button key={acc.role} type="button" className="a7-space" onClick={() => enter(acc)}>
                      <span className="a7-role-ico"><Ico size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                      <span><strong>Espace {ROLE_LABEL[acc.role].toLowerCase()}</strong><small>{acc.name}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && field({
              label: 'E-mail', Icon: Mail, k: 'email', type: 'email', placeholder: 'toi@exemple.com', autoComplete: 'email',
              onEnter: mode === 'forgot' ? sendResetCode : undefined,
              hint: mode === 'register' ? 'On t\'envoie un code pour le vérifier.' : undefined,
            })}
            {(mode === 'login' || mode === 'register') && field({
              label: 'Mot de passe', Icon: Lock, k: 'password', password: true,
              placeholder: mode === 'login' ? 'Ton mot de passe' : 'Au moins 6 caractères',
              autoComplete: mode === 'login' ? 'current-password' : 'new-password',
              onEnter: mode === 'login' ? handleSubmit : undefined,
            })}
            {mode === 'register' && form.password && (
              <div className={`a7-meter s${pwdScore}`} aria-live="polite">
                <span /><span /><span />
                <em>{STRENGTH[pwdScore]}</em>
              </div>
            )}
            {mode === 'login' && <button type="button" className="a7-link right" onClick={() => go('forgot')}>Mot de passe oublié ?</button>}
            {mode === 'register' && field({ label: 'Confirmer le mot de passe', Icon: Lock, k: 'confirmPassword', password: true, placeholder: 'Retape ton mot de passe', autoComplete: 'new-password', onEnter: handleSubmit })}
            {mode === 'register' && role === 'client' && field({ label: 'Code promo (facultatif)', Icon: BadgePercent, k: 'promoCode', placeholder: 'Ex : WAYI20', hint: 'Une réduction sur ta première commande.', onEnter: handleSubmit })}

            {mode === 'verify' && (
              <>
                {emailSimulated && (
                  <div className="a7-msg warn">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>{devCode
                      ? "L'envoi d'e-mail n'est pas encore actif (phase de test). Ton code a été pré-rempli : vérifie-le puis valide."
                      : "Aucun service d'e-mail n'est configuré sur ce serveur : le code n'a pas été envoyé."}</span>
                  </div>
                )}
                {codeBoxes()}
              </>
            )}

            {mode === 'reset' && (
              <>
                {emailUnavailable && <div className="a7-msg warn"><AlertCircle size={18} aria-hidden="true" /><span>L'e-mail n'a pas pu être envoyé pour le moment. Réessaie dans quelques minutes.</span></div>}
                {codeBoxes()}
                {field({ label: 'Nouveau mot de passe', Icon: Lock, k: 'password', password: true, placeholder: 'Au moins 6 caractères', autoComplete: 'new-password' })}
                {field({ label: 'Confirmer le mot de passe', Icon: Lock, k: 'confirmPassword', password: true, placeholder: 'Retape ton mot de passe', autoComplete: 'new-password', onEnter: resetPassword })}
              </>
            )}

            {msg()}

            {mode !== 'choose' && <button className="a7-cta" onClick={submit} disabled={loading}>
              {loading ? <Spinner size={20} color="#fff" /> : (
                <>
                  {mode === 'login' ? 'Se connecter'
                    : mode === 'register' ? (role === 'merchant' ? 'Créer mon restaurant' : role === 'driver' ? 'Devenir livreur' : 'Créer mon compte')
                    : mode === 'verify' ? 'Valider le code'
                    : mode === 'forgot' ? 'Recevoir mon code'
                    : 'Changer mon mot de passe'}
                </>
              )}
            </button>}

            {mode === 'verify' && (
              <div className="a7-row-links">
                <button type="button" className="a7-link" onClick={resendCode}>Renvoyer le code</button>
                <button type="button" className="a7-link muted" onClick={() => go('register')}>Modifier mes infos</button>
              </div>
            )}
            {mode === 'reset' && <button type="button" className="a7-link center" onClick={resendResetCode}>Renvoyer le code</button>}
            {mode === 'forgot' && <button type="button" className="a7-link center muted" onClick={() => go('login')}>Retour à la connexion</button>}

            {full && (
              <div className="a7-switch">
                {mode === 'login'
                  ? <>Pas encore de compte ? <button type="button" onClick={() => go('register')}>Inscris-toi</button></>
                  : <>Déjà un compte ? <button type="button" onClick={() => go('login')}>Connecte-toi</button></>}
              </div>
            )}
          </div>
        </main>

        {full && <p className="a7-legal">En continuant, tu acceptes les conditions d'utilisation et la politique de confidentialité de WAYI.</p>}
      </div>
    </div>
  );
}
