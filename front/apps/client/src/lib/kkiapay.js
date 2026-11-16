// Widget de paiement Kkiapay (MTN MoMo, Moov Money, carte).
// Doc : https://docs.kkiapay.me — le script https://cdn.kkiapay.me/k.js expose openKkiapayWidget et les listeners.
let loading = null;

export function loadKkiapay() {
  if (typeof window.openKkiapayWidget === 'function') return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.kkiapay.me/k.js';
      s.async = true;
      s.onload = () => (typeof window.openKkiapayWidget === 'function' ? resolve() : reject(new Error('widget')));
      s.onerror = () => { loading = null; reject(new Error('script')); };
      document.body.appendChild(s);
    });
  }
  return loading;
}

// Ouvre le widget. Résout { transactionId } après paiement réussi ; rejette { closed: true } si l'utilisateur ferme.
export async function payWithKkiapay({ publicKey, sandbox, amount, phone, orderId, name, method }) {
  await loadKkiapay();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      try { window.removeKkiapayListener?.('success'); } catch {}
      fn(value);
    };
    window.addSuccessListener((r) => {
      const transactionId = r?.transactionId || r?.transaction_id;
      if (transactionId) finish(resolve, { transactionId });
    });
    window.addKkiapayCloseListener(() => finish(reject, { closed: true }));
    window.openKkiapayWidget({
      key: publicKey,
      amount: Math.round(amount),
      sandbox: !!sandbox,
      phone: String(phone || '').replace(/\D/g, '').replace(/^229/, ''),
      name: name || undefined,
      partnerId: orderId,
      paymentmethod: method === 'card' ? 'card' : 'momo',
      countries: ['BJ'],
      position: 'center',
      theme: '#E8481C',
    });
  });
}
