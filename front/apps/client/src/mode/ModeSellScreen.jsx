import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Globe, EyeOff, Sparkles, ImagePlus, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { ModeNav, compressImage, errMsg } from './shared';

const EMPTY = { title: '', category: '', size: '', condition: '', price: '', city: '', description: '', anonymous: false, photos: [] };

export default function ModeSellScreen() {
  const { state, navigate, dispatch } = useApp();
  const editId = state.modeCtx.editId;
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, city: localStorage.getItem('wayi_mode_city') || '' });
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { modeAPI.meta().then(({ data }) => setMeta(data)).catch(() => setError('Connexion impossible. Réessaie.')); }, []);
  useEffect(() => {
    if (!editId) return;
    modeAPI.listing(editId).then(({ data }) => {
      const l = data.listing;
      setForm({ title: l.title, category: l.category, size: l.size, condition: l.condition, price: String(l.price), city: l.city, description: l.description || '', anonymous: l.anonymous, photos: l.photos || [] });
    }).catch(() => toast.error('Annonce introuvable'));
  }, [editId]);
  // En quittant l'écran, on sort du mode modification
  useEffect(() => () => dispatch({ type: 'MODE_CTX', payload: { editId: null } }), []);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };
  const max = meta?.maxPhotos || 8;

  const addPhotos = async (files) => {
    const list = Array.from(files || []).slice(0, max - form.photos.length);
    if (!list.length) return;
    setUploading(n => n + list.length);
    for (const file of list) {
      try {
        const data = await compressImage(file);
        const { data: res } = await modeAPI.photo(data, 'jpg');
        setForm(f => ({ ...f, photos: [...f.photos, res.url].slice(0, max) }));
      } catch (e) { toast.error(errMsg(e, "Une photo n'a pas pu être envoyée.")); }
      finally { setUploading(n => n - 1); }
    }
  };

  const submit = async () => {
    const price = Number(String(form.price).replace(/\D/g, ''));
    const missing = !form.photos.length ? 'Ajoute au moins une photo.'
      : form.title.trim().length < 3 ? 'Donne un titre à ton annonce.'
      : !form.category ? 'Choisis une catégorie.'
      : !form.size ? 'Indique la taille.'
      : !form.condition ? "Indique l'état de l'article."
      : !(price >= 100) ? 'Indique le prix en FCFA.'
      : !form.city ? 'Choisis ta ville.' : '';
    if (missing) { setError(missing); return; }
    setSaving(true);
    try {
      const body = { ...form, price };
      const { data } = editId ? await modeAPI.update(editId, body) : await modeAPI.create(body);
      localStorage.setItem('wayi_mode_city', form.city);
      toast(editId ? 'Annonce mise à jour' : 'Annonce publiée !');
      dispatch({ type: 'MODE_CTX', payload: { listingId: data.listing.id, editId: null } });
      setForm({ ...EMPTY, city: form.city });
      navigate('mode-item');
    } catch (e) { setError(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <div className="md-bar">
            {editId && <BackBtn />}
            <h1 className="md-title">{editId ? "Modifier l'annonce" : 'Publier une annonce'}</h1>
          </div>

          <div className="md-photos">
            {form.photos.map((p, i) => (
              <div key={p} className="md-photo-slot" style={{ backgroundImage: `url("${p}")` }}>
                {i === 0 && <span className="md-cover">Couverture</span>}
                <button onClick={() => set('photos', form.photos.filter(x => x !== p))} aria-label="Retirer la photo"><X size={14} strokeWidth={2.6} aria-hidden="true" /></button>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={'u' + i} className="md-photo-slot loading"><Loader2 size={22} className="md-spin" aria-hidden="true" /></div>
            ))}
            {form.photos.length + uploading < max && (
              <button className="md-photo-add" onClick={() => fileRef.current?.click()}>
                {form.photos.length ? <Plus size={24} aria-hidden="true" /> : <ImagePlus size={26} aria-hidden="true" />}
                <span>{form.photos.length ? 'Ajouter' : `Jusqu'à ${max} photos`}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
          </div>
          <p className="md-hint">Photos nettes, à la lumière du jour. La première sert de couverture.</p>

          <label className="md-label">Titre</label>
          <input className="md-input" maxLength={80} placeholder="Ex. : robe en wax" value={form.title} onChange={e => set('title', e.target.value)} />

          <div className="md-two">
            <div>
              <label className="md-label">Catégorie</label>
              <select className="md-input" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Choisir</option>
                {meta?.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="md-label">Taille</label>
              <select className="md-input" value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">Choisir</option>
                {meta?.sizes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <label className="md-label">État</label>
          <div className="md-seg">
            {meta?.conditions.map(c => (
              <button key={c.id} className={form.condition === c.id ? 'on' : ''} onClick={() => set('condition', c.id)}>{c.label}</button>
            ))}
          </div>

          <div className="md-two">
            <div>
              <label className="md-label">Prix en FCFA</label>
              <input className="md-input" inputMode="numeric" placeholder="Ex. : 8 000" value={form.price} onChange={e => set('price', e.target.value.replace(/[^\d ]/g, ''))} />
            </div>
            <div>
              <label className="md-label">Ville</label>
              <select className="md-input" value={form.city} onChange={e => set('city', e.target.value)}>
                <option value="">Choisir</option>
                {meta?.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <label className="md-label">Description</label>
          <textarea className="md-input" rows={4} maxLength={1500} placeholder="Matière, nombre de fois porté, défauts éventuels..." value={form.description} onChange={e => set('description', e.target.value)} />

          <label className="md-label">Visibilité</label>
          <div className="md-vis-pick">
            <button className={!form.anonymous ? 'on' : ''} onClick={() => set('anonymous', false)}>
              <Globe size={20} aria-hidden="true" />
              <b>Vente publique</b>
              <small>Ton prénom est affiché</small>
            </button>
            <button className={form.anonymous ? 'on' : ''} onClick={() => set('anonymous', true)}>
              <EyeOff size={20} aria-hidden="true" />
              <b>Vente anonyme</b>
              <small>Seule ta note est visible</small>
            </button>
          </div>

          {meta?.launchOffer && !editId && (
            <div className="md-offer">
              <Sparkles size={20} aria-hidden="true" />
              <p>Offre de lancement : 0 frais sur tes {meta.launchOffer.sales} premières ventes ({meta.launchOffer.sellers} premiers vendeurs).</p>
            </div>
          )}

          {error && <div className="md-note warn" role="alert">{error}</div>}
          <button className="md-btn wide big" disabled={saving || uploading > 0} onClick={submit}>
            {saving ? 'Publication...' : uploading ? 'Envoi des photos...' : editId ? 'Enregistrer' : "Publier l'annonce"}
          </button>
        </div>
      </div>
      <ModeNav />
    </div>
  );
}
