// ============================================================
// WAYI - Notifications (boite interne, sans service exterieur)
// Chaque notification est rangee dans la boite du compte (account.inbox),
// sauvegardee avec le reste dans la base du serveur. L'appli la consulte
// regulierement et affiche une notification sur le telephone :
//   restaurant : nouvelle commande
//   livreur    : nouvelle course proposee
//   client     : commande acceptee, en route, livree, annulee
// Firebase reste possible en option (FIREBASE_* dans .env) mais n'est plus necessaire.
// ============================================================
const { users, drivers, merchants, admins, orders } = require('../data/store');
const { sendPushNotification } = require('./notifications');

const MAX_TOKENS = 5;
const MAX_INBOX = 50;
let seq = 0;

function addToInbox(account, { title, body, data = {} }) {
  if (!account) return null;
  const n = {
    id: `${Date.now()}-${++seq}`,
    at: Date.now(),
    title: String(title || ''),
    body: String(body || ''),
    type: String(data.type || ''),
    orderId: data.orderId ? String(data.orderId) : null,
  };
  account.inbox = [n, ...(Array.isArray(account.inbox) ? account.inbox : [])].slice(0, MAX_INBOX);
  return n;
}

function inboxSince(account, since) {
  const t = Number(since) || 0;
  return (Array.isArray(account?.inbox) ? account.inbox : []).filter(n => n.at > t).sort((a, b) => a.at - b.at);
}

function accountFor(user) {
  if (!user) return null;
  if (user.role === 'driver') return drivers.find(d => d.id === user.id);
  if (user.role === 'merchant') return merchants.find(m => m.id === user.id);
  if (user.role === 'admin') return admins.find(a => a.id === user.id);
  return users.find(u => u.id === user.id);
}

function registerToken(account, token) {
  const t = String(token || '').trim();
  if (!account || t.length < 20 || t.length > 4096) return false;
  // Un meme telephone ne doit recevoir les alertes que du dernier compte connecte
  for (const list of [users, drivers, merchants, admins]) {
    list.forEach(a => { if (a !== account && Array.isArray(a.fcmTokens)) a.fcmTokens = a.fcmTokens.filter(x => x !== t); });
  }
  account.fcmTokens = [t, ...(account.fcmTokens || []).filter(x => x !== t)].slice(0, MAX_TOKENS);
  return true;
}

function removeToken(account, token) {
  if (!account?.fcmTokens) return;
  account.fcmTokens = account.fcmTokens.filter(x => x !== token);
}

async function pushTo(account, { title, body, data = {} }) {
  addToInbox(account, { title, body, data });
  const tokens = account?.fcmTokens || [];
  if (!tokens.length) return 0;
  const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')]));
  let sent = 0;
  for (const token of [...tokens]) {
    try {
      const r = await sendPushNotification({ token, title, body, data: strData });
      if (r?.success) sent++;
      else if (/not-registered|invalid-registration|invalid-argument/i.test(String(r?.error || ''))) removeToken(account, token);
    } catch { /* un echec ne bloque jamais la commande */ }
  }
  return sent;
}

// Sans attendre : une notification ne doit jamais ralentir une action
const fire = (p) => { Promise.resolve(p).catch(() => {}); };

function newOrderToRestaurant(order) {
  merchants.filter(m => m.restaurantId === order.restaurantId).forEach(m => fire(pushTo(m, {
    title: 'Nouvelle commande WAYI',
    body: `${(order.items || []).map(i => `${i.qty} x ${i.name}`).join(', ').slice(0, 120)} · ouvre l'appli pour l'accepter`,
    data: { type: 'new_order', orderId: order.id },
  })));
}

function pingToDriver(driverId, order) {
  const d = drivers.find(x => x.id === driverId);
  if (!d) return;
  fire(pushTo(d, {
    title: 'Nouvelle course WAYI',
    body: `${order.restaurantName} · gain ${Math.round((order.deliveryFee || 0) * 0.8)} FCFA · accepte vite, elle expire`,
    data: { type: 'ping', orderId: order.id },
  }));
}

const CLIENT_MESSAGES = {
  preparing: (o) => [`${o.restaurantName} prépare ta commande`, 'Ta commande a été acceptée, elle est en préparation.'],
  on_the_way: (o) => ['Ton livreur est en route', `${o.driver?.name || 'Ton livreur'} arrive avec ta commande.`],
  delivered: () => ['Commande livrée', 'Bon appétit ! Pense à noter ta commande.'],
  cancelled: (o) => ['Commande annulée', `${o.restaurantName} ne peut pas honorer ta commande pour le moment.`],
};

function orderStatusToClient(orderId, status) {
  const order = orders.find(o => o.id === orderId);
  const make = CLIENT_MESSAGES[status];
  if (!order || !make || order._pushedStatus === status) return;
  order._pushedStatus = status;
  const user = users.find(u => u.id === order.userId);
  const [title, body] = make(order);
  fire(pushTo(user, { title, body, data: { type: 'order_status', orderId, status } }));
}

module.exports = { addToInbox, inboxSince, accountFor, registerToken, removeToken, pushTo, newOrderToRestaurant, pingToDriver, orderStatusToClient };
