import { useEffect, useRef, useState } from 'react';
import { Search, MessageCircle, SendHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatusBar, BackBtn } from '../components/UI';
import { modeAPI } from '../api';
import { ModeNav, Photo, Avatar, Empty, fcfa, clock, errMsg } from './shared';
import toast from 'react-hot-toast';

export function ModeInboxScreen() {
  const { navigate, dispatch } = useApp();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => modeAPI.conversations().then(({ data }) => alive && setList(data.conversations || [])).catch(() => alive && setList(l => l || []));
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const open = (c) => { dispatch({ type: 'MODE_CTX', payload: { convId: c.id } }); navigate('mode-chat'); };
  const shown = (list || []).filter(c => !q || `${c.other.name} ${c.listing?.title || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="screen md-screen">
      <StatusBar />
      <div className="w-scroll">
        <div className="w-pad">
          <h1 className="md-title">Messages</h1>
          {list?.length > 3 && (
            <label className="w-search md-search small">
              <Search size={18} aria-hidden="true" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une conversation..." />
            </label>
          )}
          {list === null ? (
            [0, 1, 2].map(i => <div key={i} className="w-skel" style={{ height: 76, borderRadius: 18, marginTop: 12 }} />)
          ) : shown.length ? (
            <div className="md-convs">
              {shown.map(c => (
                <button key={c.id} className={`md-conv${c.unread ? ' unread' : ''}`} onClick={() => open(c)}>
                  <span className="md-conv-pic">
                    <Photo src={c.listing?.photo} className="md-conv-photo" iconSize={20} />
                    <Avatar name={c.other.name} anonymous={c.other.anonymous} shop={c.other.shop} size={26} />
                  </span>
                  <span className="md-conv-txt">
                    <span className="md-conv-top"><b>{c.other.name}</b><small>{clock(c.last?.at || c.updatedAt)}</small></span>
                    <span className="md-conv-item">{c.listing?.title || 'Annonce retirée'}{c.role === 'seller' ? ' · ta vente' : ''}</span>
                    <span className="md-conv-last">{c.last ? `${c.last.mine ? 'Toi : ' : ''}${c.last.text}` : 'Nouvelle conversation'}</span>
                  </span>
                  {c.unread > 0 && <span className="md-unread">{c.unread}</span>}
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={MessageCircle} title="Aucun message" text="Écris à un vendeur depuis une annonce pour poser tes questions." action="Voir les annonces" onAction={() => navigate('home')} />
          )}
        </div>
      </div>
      <ModeNav />
    </div>
  );
}

export function ModeChatScreen() {
  const { state, navigate, dispatch } = useApp();
  const id = state.modeCtx.convId;
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const count = useRef(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = () => modeAPI.conversation(id).then(({ data }) => {
      if (!alive) return;
      setConv(data.conversation);
      setMsgs(data.messages || []);
    }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  useEffect(() => {
    if (msgs.length !== count.current) { end.current?.scrollIntoView({ block: 'end' }); count.current = msgs.length; }
  }, [msgs]);

  const send = async (t = text) => {
    const body = t.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { data } = await modeAPI.send(id, body);
      setMsgs(m => [...m, data.message]);
      setText('');
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSending(false); }
  };
  const openListing = () => { if (conv?.listing) { dispatch({ type: 'MODE_CTX', payload: { listingId: conv.listing.id } }); navigate('mode-item'); } };
  const quick = conv?.role === 'buyer'
    ? ['Est-ce encore disponible ?', 'Le prix est-il négociable ?', 'Peux-tu envoyer une autre photo ?']
    : ['Oui, il est disponible.', 'Je peux le remettre au livreur aujourd\'hui.'];

  return (
    <div className="screen md-screen md-chat">
      <StatusBar />
      <div className="md-chat-head">
        <BackBtn onBack={() => navigate('mode-inbox')} />
        <div className="md-chat-who">
          <Avatar name={conv?.other.name} anonymous={conv?.other.anonymous} shop={conv?.other.shop} size={38} />
          <b>{conv?.other.name || '...'}</b>
        </div>
      </div>
      {conv?.listing && (
        <button className="md-chat-item" onClick={openListing}>
          <Photo src={conv.listing.photo} className="md-chat-item-photo" iconSize={18} />
          <span><b>{conv.listing.title}</b><small>{fcfa(conv.listing.price)}</small></span>
          <span className="md-chat-see">Voir</span>
        </button>
      )}
      <div className="md-chat-body">
        {msgs.length === 0 && conv && <p className="md-chat-empty">Pose ta question au {conv.role === 'buyer' ? 'vendeur' : 'client'}. Reste poli et ne partage jamais de code reçu par SMS.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`md-bubble${m.mine ? ' mine' : ''}`}>
            <p>{m.text}</p>
            <small>{clock(m.at)}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      {msgs.length < 2 && conv && (
        <div className="md-quick">{quick.map(t => <button key={t} onClick={() => send(t)}>{t}</button>)}</div>
      )}
      <div className="md-compose">
        <textarea rows={1} value={text} placeholder="Écris ton message..." onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button onClick={() => send()} disabled={!text.trim() || sending} aria-label="Envoyer"><SendHorizontal size={20} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
