// Essai rapide de Yivi : lance une conversation de test contre le serveur local.
// Usage : node scripts/essai-yivi.js            (scenario par defaut)
//         node scripts/essai-yivi.js "msg 1" "msg 2" ...
// Le serveur doit tourner (npm run dev). Compte de demo : adele@gmail.com / wayi2026
const BASE = process.env.BASE || 'http://localhost:3001';
const DEFAUT = [
  'Salut', 'ça va ?', 'Un plat local pas trop épicé', "c'est quoi le premier ?", 'il est copieux ?',
  'lequel est le moins cher ?', 'vous livrez à Godomey ?', 'combien coûte la livraison ?', 'je prends le deuxième',
  'on commande', 'en espèces', 'merci', 'bye',
];
(async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'adele@gmail.com', password: 'wayi2026' }) });
  const { token } = await r.json();
  if (!token) { console.error('Connexion impossible : le serveur tourne-t-il ?'); process.exit(1); }
  const history = []; let cart = [];
  const msgs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAUT;
  for (const m of msgs) {
    const res = await fetch(`${BASE}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ message: m, history, cart }) });
    const d = await res.json();
    if (d.cart) cart = d.cart.map(c => ({ id: c.id, qty: c.qty }));
    console.log(`\nToi   : ${m}\nYivi  : ${d.reply || d.error}${d.recommendedNames?.length ? `\n        [cartes : ${d.recommendedNames.join(' | ')}]` : ''}${d.simulated ? '' : '  (IA Claude)'}`);
    history.push({ role: 'user', content: m });
    history.push({ role: 'assistant', content: d.reply, recommendedIds: d.recommendedIds, awaiting: d.awaiting });
  }
})();
