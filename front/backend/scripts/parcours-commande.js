// Test du parcours complet d'une commande WAYI, sur un serveur LOCAL :
//   client commande -> restaurant recoit et accepte -> livreur prevenu et accepte
//   -> client suit le livreur -> livraison confirmee -> restaurant informe.
// Usage : serveur lance en local (npm run dev), puis  node scripts/parcours-commande.js
// Ne jamais lancer sur le serveur en ligne : cree des comptes de test.
const BASE = (process.env.BASE || 'http://localhost:3001') + '/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@wayi.bj', password: process.env.ADMIN_PASSWORD || 'wayi2026' };
const stamp = Date.now().toString(36);
let ok = 0, ko = 0;
const check = (cond, label, extra = '') => { if (cond) { ok++; console.log(`  OK     ${label}`); } else { ko++; console.log(`  ECHEC  ${label}${extra ? ' : ' + extra : ''}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function call(method, path, body, token) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const loginAs = async (email, password, role) => ((await call('POST', '/auth/login-any', { email, password })).data.accounts || []).find(a => a.role === role)?.token;
const inbox = async (token) => (await call('GET', '/notifications?since=0', null, token)).data.notifications || [];

(async () => {
  console.log('\n=== Parcours complet d\'une commande WAYI ===\n');
  const PWD = 'Parcours2026!';
  // Restaurant a Cadjehoun (Cotonou), client a Fidjrosse (~2,5 km)
  const RESTO = { lat: 6.3570, lng: 2.3880 };
  const CLIENT = { lat: 6.3560, lng: 2.3650 };

  console.log('1. Comptes de test');
  const admin = await loginAs(ADMIN.email, ADMIN.password, 'admin');
  check(!!admin, 'connexion admin');
  if (!admin) { console.log('\nImpossible sans compte admin (ADMIN_EMAIL / ADMIN_PASSWORD).'); process.exit(1); }

  const m = await call('POST', '/admin/merchants', { restaurantName: `Resto Test ${stamp}`, tagline: 'Cuisine béninoise', zone: 'Cadjehoun', lat: RESTO.lat, lng: RESTO.lng, contactName: 'Resto', email: `resto-${stamp}@test.wayi`, phone: '+22990000101' }, admin);
  const merchant = m.data.devPassword && await loginAs(`resto-${stamp}@test.wayi`, m.data.devPassword, 'merchant');
  check(!!merchant, 'restaurant cree et connecte', JSON.stringify(m.data).slice(0, 120));

  const dish = await call('POST', '/merchants/dishes', { period: 'dejeuner', category: 'plats_locaux', name: `Amiwo test ${stamp}`, price: 2000, desc: 'Plat de test', image: null }, merchant);
  check(dish.status === 201, 'plat ajoute au menu', JSON.stringify(dish.data).slice(0, 120));
  const dishId = dish.data.dish?.id;

  const d = await call('POST', '/drivers/register/start', { name: 'Livreur Test', email: `livreur-${stamp}@test.wayi`, password: PWD, phone: '+22990000102', vehicleType: 'moto', vehiclePlate: 'TT 0001 RB', zone: 'Cotonou' });
  await call('POST', '/drivers/register/verify', { email: `livreur-${stamp}@test.wayi`, code: d.data.devCode });
  const list = (await call('GET', '/admin/drivers', null, admin)).data;
  const drv = (Array.isArray(list) ? list : list.drivers || []).find(x => x.email === `livreur-${stamp}@test.wayi`);
  if (drv) await call('PUT', `/admin/drivers/${drv.id}/reactivate`, {}, admin);
  const driver = await loginAs(`livreur-${stamp}@test.wayi`, PWD, 'driver');
  check(!!driver, 'livreur inscrit, valide par l\'admin et connecte');
  const online = await call('PUT', '/drivers/status', { status: 'available', lat: RESTO.lat + 0.004, lng: RESTO.lng + 0.003 }, driver);
  check(online.status === 200, 'livreur en ligne pres du restaurant');

  const s = await call('POST', '/auth/register/start', { name: 'Client Test', phone: '+22990000103', email: `client-${stamp}@test.wayi`, password: PWD });
  await call('POST', '/auth/register/verify', { email: `client-${stamp}@test.wayi`, code: s.data.devCode });
  const client = await loginAs(`client-${stamp}@test.wayi`, PWD, 'client');
  check(!!client, 'client inscrit et connecte');

  console.log('\n2. Le client commande');
  const quote = await call('POST', '/orders/quote', { items: [{ dishId, qty: 2 }], ...CLIENT }, client);
  check(quote.data.deliveryFee > 0 && !quote.data.outOfZone, `frais de livraison calcules : ${quote.data.deliveryFee} FCFA`);
  const o = await call('POST', '/orders', { items: [{ dishId, qty: 2 }], address: 'Fidjrossè, près de la plage', paymentMethod: 'cash', ...CLIENT }, client);
  const order = (o.data.orders || [])[0];
  check(o.status === 201 || o.status === 200, `commande creee : ${order?.id}`, JSON.stringify(o.data).slice(0, 160));
  if (!order) process.exit(1);
  if (order) await call('POST', '/payments/initiate', { orderId: order.id, method: 'cash', amount: order.total }, client);

  console.log('\n3. Le restaurant recoit la commande');
  const mo = (await call('GET', '/merchants/orders', null, merchant)).data;
  const mine = (Array.isArray(mo) ? mo : mo.orders || []).find(x => x.id === order.id);
  check(!!mine, 'la commande apparait dans l\'espace du restaurant');
  check((await inbox(merchant)).some(n => n.orderId === order.id), 'notification "nouvelle commande" envoyee au restaurant');

  console.log('\n4. Le restaurant accepte : un livreur est prevenu');
  const acc = await call('PUT', `/merchants/orders/${order.id}/status`, { status: 'preparing' }, merchant);
  check(acc.status === 200, 'commande acceptee (en preparation)', JSON.stringify(acc.data).slice(0, 160));
  check((await inbox(client)).some(n => n.orderId === order.id), 'le client est prevenu que sa commande est acceptee');
  await sleep(800);
  const dash = (await call('GET', '/drivers/dashboard', null, driver)).data;
  check(dash.incomingPing?.orderId === order.id, 'la course est proposee au livreur', JSON.stringify(dash.incomingPing || {}).slice(0, 120));
  check((await inbox(driver)).some(n => n.orderId === order.id), 'notification "nouvelle course" envoyee au livreur');

  console.log('\n5. Le livreur accepte et recupere le plat');
  const take = await call('PUT', `/drivers/orders/${order.id}/accept`, {}, driver);
  check(take.status === 200, 'le livreur accepte la course', JSON.stringify(take.data).slice(0, 120));
  const seen = (await call('GET', `/orders/${order.id}`, null, client)).data;
  check(!!seen.driver?.name, `le client voit son livreur : ${seen.driver?.name}`);
  check((await inbox(merchant)).some(n => n.orderId === order.id && /livreur/i.test(n.title + n.body)), 'le restaurant est prevenu qu\'un livreur arrive');
  const ready = await call('PUT', `/merchants/orders/${order.id}/status`, { status: 'ready' }, merchant);
  check(ready.status === 200, 'le restaurant marque le plat pret');
  const pick = await call('PUT', `/drivers/orders/${order.id}/pickup`, {}, driver);
  check(pick.status === 200, 'le livreur recupere le plat (en route)', JSON.stringify(pick.data).slice(0, 120));

  console.log('\n6. Le client suit le livreur, du restaurant jusque chez lui');
  const path = [0, 0.25, 0.5, 0.75, 0.95].map(t => ({ lat: RESTO.lat + (CLIENT.lat - RESTO.lat) * t, lng: RESTO.lng + (CLIENT.lng - RESTO.lng) * t }));
  for (const p of path) { await call('PUT', '/drivers/location', p, driver); await sleep(150); }
  const tr = (await call('GET', `/orders/${order.id}`, null, client)).data.tracking || {};
  const last = path[path.length - 1];
  const pos = tr.driver || tr.driverPosition || {};
  check(Math.abs((pos.lat || 0) - last.lat) < 0.001 && Math.abs((pos.lng || 0) - last.lng) < 0.001, 'le client voit la position du livreur en direct', JSON.stringify(tr).slice(0, 200));
  check((tr.trail || tr.path || []).length >= 3, `le trajet parcouru est trace (${(tr.trail || tr.path || []).length} points)`);
  check(tr.restaurant?.lat != null && tr.delivery?.lat != null, 'la carte montre le restaurant et le point de livraison');
  const mt = (await call('GET', `/merchants/orders/${order.id}/tracking`, null, merchant)).data;
  check(!!(mt.driver || mt.driverPosition), 'le restaurant voit aussi le livreur sur la carte');

  console.log('\n7. Livraison');
  const done = await call('PUT', `/drivers/orders/${order.id}/complete`, {}, driver);
  check(done.status === 200, 'le livreur confirme la livraison');
  const fin = (await call('GET', `/orders/${order.id}`, null, client)).data;
  check(fin.status === 'delivered', 'le client voit "Livré"');
  check(fin.paymentStatus === 'paid', 'paiement en especes enregistre a la livraison');
  const mo2 = (await call('GET', '/merchants/orders', null, merchant)).data;
  check((Array.isArray(mo2) ? mo2 : mo2.orders || []).find(x => x.id === order.id)?.status === 'delivered', 'le restaurant voit la commande "Livree" dans son espace');
  check((await inbox(merchant)).some(n => n.orderId === order.id && /livr/i.test(n.title) && /livr[ée]e/i.test(n.title + n.body)), 'le restaurant recoit la notification "commande livree"');
  check((await inbox(client)).some(n => n.orderId === order.id && n.type === 'order_status' && /livr/i.test(n.title + n.body)), 'le client recoit la notification "livree"');
  const me = (await call('GET', '/drivers/me', null, driver)).data;
  const st = me.status || me.driver?.status;
  check(st === 'available', 'le livreur redevient disponible', `statut : ${st}`);

  console.log(`\n=== Resultat : ${ok} OK, ${ko} echec(s) ===\n`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
