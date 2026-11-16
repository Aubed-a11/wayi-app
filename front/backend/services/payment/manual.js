// Paiement Mobile Money manuel : le client envoie l'argent sur le numéro du restaurant
// (ou, à défaut, de WAYI), puis le bénéficiaire confirme la réception.
const { generateReceipt, getRestaurantById } = require('../../data/store');
const { manualNumbers } = require('./index');

// Qui reçoit l'argent pour cette commande et sur quel numéro ?
function payeeFor(order, method) {
  const r = getRestaurantById(order.restaurantId);
  const key = method === 'moov' ? 'momoMoov' : 'momoMtn';
  if (r?.[key]) return { payTo: r[key], payee: 'restaurant', payeeName: r.name };
  return { payTo: manualNumbers()[method], payee: 'wayi', payeeName: 'WAYI' };
}

// action: 'confirm' | 'reject'. Les contrôles d'autorisation se font dans la route appelante.
function settleManualPayment(order, action, by) {
  let receipt = null;
  if (action === 'confirm') {
    order.paymentStatus = 'paid';
    order.paidAt = new Date().toISOString();
    order.paymentConfirmedBy = by || 'admin';
    try { receipt = generateReceipt(order); } catch {}
  } else {
    order.paymentStatus = 'rejected';
    if (order.status === 'pending') {
      order.status = 'cancelled';
      order.statusHistory?.push({ status: 'cancelled', label: 'Paiement non reçu', time: new Date().toISOString() });
    }
  }
  try {
    const { emitOrderStatusChange } = require('../realtime');
    emitOrderStatusChange(order.id, order.status, { paymentConfirmed: action === 'confirm', receipt });
  } catch {}
  return order;
}
module.exports = { payeeFor, settleManualPayment };
