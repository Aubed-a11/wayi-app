// ============================================================
// E-mails WAYI : une seule mise en page pour tous les messages
// (logo, couleurs de la marque, blocs prets a l'emploi).
// HTML compatible messageries : tableaux et styles en ligne.
// ============================================================
const SITE = process.env.PUBLIC_SITE_URL || 'https://www.wayibenin.com';
const LOGO = `${SITE}/email-logo.png`;
const BRAND = '#F2690D', BRAND_DARK = '#A8321F', INK = '#15181F', MUTED = '#6B7280', SOFT = '#FFF4EB';
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Blocs ──────────────────────────────────────────────────────
const title = (t) => `<h1 style="${FONT}margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};">${t}</h1>`;
const p = (t) => `<p style="${FONT}margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">${t}</p>`;
const small = (t) => `<p style="${FONT}margin:14px 0 0;font-size:13px;line-height:1.55;color:${MUTED};">${t}</p>`;

function codeBox(code, note = 'Ce code expire dans 10 minutes.') {
  const spaced = esc(code).split('').join('&nbsp;');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td align="center"
    style="background:${SOFT};border:1px dashed ${BRAND};border-radius:16px;padding:22px 12px;">
    <div style="${FONT}font-size:12px;letter-spacing:2px;color:${BRAND_DARK};font-weight:700;margin-bottom:8px;">TON CODE</div>
    <div style="${FONT}font-size:34px;letter-spacing:4px;font-weight:800;color:${INK};">${spaced}</div>
    ${note ? `<div style="${FONT}font-size:13px;color:${MUTED};margin-top:10px;">${note}</div>` : ''}
  </td></tr></table>`;
}

function infoBox(rows) {
  const tr = rows.map(([k, v]) => `<tr>
      <td style="${FONT}padding:10px 0;font-size:13.5px;color:${MUTED};border-bottom:1px solid #F1E3D6;">${k}</td>
      <td align="right" style="${FONT}padding:10px 0;font-size:14.5px;font-weight:700;color:${INK};border-bottom:1px solid #F1E3D6;">${v}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${SOFT};border-radius:16px;">
    <tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tr}</table></td></tr></table>`;
}

function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr>
    <td style="border-radius:14px;background:${BRAND};background-image:linear-gradient(90deg,${BRAND},#D85A2E,${BRAND_DARK});">
      <a href="${url}" style="${FONT}display:inline-block;padding:14px 26px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:14px;">${label}</a>
    </td></tr></table>`;
}

// ── Mise en page commune ───────────────────────────────────────
function layout({ preheader = '', body, footer = 'Tu reçois ce message parce que tu utilises WAYI.' }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>WAYI</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;" data-wayi-mail="1">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 28px rgba(21,24,31,0.08);">
    <tr><td align="center" style="background:${SOFT};padding:26px 20px 18px;">
      <a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="78" height="81" alt="WAYI" style="display:block;border:0;width:78px;height:auto;"></a>
      <div style="${FONT}margin-top:8px;font-size:13px;color:${BRAND_DARK};font-weight:700;">Les bons plats, livrés chez toi.</div>
    </td></tr>
    <tr><td style="height:5px;line-height:5px;font-size:0;background:${BRAND};background-image:linear-gradient(90deg,#FF8A2B,${BRAND},${BRAND_DARK});">&nbsp;</td></tr>
    <tr><td style="padding:30px 30px 24px;">${body}</td></tr>
    <tr><td style="padding:18px 30px 26px;border-top:1px solid #F1F2F4;">
      <p style="${FONT}margin:0;font-size:12px;line-height:1.6;color:#9CA3AF;">${footer}<br>
      WAYI Bénin · <a href="${SITE}" style="color:${BRAND};text-decoration:none;">wayibenin.com</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// ── Messages ───────────────────────────────────────────────────
const hello = (name) => p(`Bonjour <b>${esc(String(name || '').split(' ')[0] || '')}</b>,`);

const verificationCode = ({ name, code, context = 'pour créer ton compte WAYI' }) => layout({
  preheader: `Ton code WAYI : ${code}`,
  body: title('Ton code de vérification') + (name ? hello(name) : '') + p(`Voici ton code ${context}.`) + codeBox(code)
    + small("Si tu n'as rien demandé, ignore simplement ce message."),
});

const passwordReset = ({ name, code }) => layout({
  preheader: `Ton code pour changer de mot de passe : ${code}`,
  body: title('Nouveau mot de passe') + hello(name) + p('Voici ton code pour choisir un nouveau mot de passe WAYI.') + codeBox(code)
    + small("Si tu n'as rien demandé, ignore ce message : ton mot de passe actuel reste valable."),
});

const welcomeAccount = ({ name, role, email, password, url, extra }) => layout({
  preheader: `Ton compte ${role} WAYI est prêt`,
  body: title(`Bienvenue chez WAYI !`) + hello(name)
    + p(`Ton compte ${role} vient d'être créé. Voici tes identifiants de connexion :`)
    + infoBox([['E-mail', esc(email)], ['Mot de passe temporaire', `<span style="font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:1px;color:${BRAND_DARK};">${esc(password)}</span>`]])
    + button('Me connecter', url)
    + (extra ? p(extra) : '')
    + small('Pour ta sécurité, change ce mot de passe dès ta première connexion et ne le partage avec personne.'),
});

const orderConfirmed = (d) => layout({
  preheader: `Commande ${d.orderId} confirmée chez ${d.shopName}`,
  body: title('Commande confirmée') + hello(d.userName)
    + p(`Ta commande chez <b>${esc(d.shopName)}</b> a bien été reçue. Le restaurant la prépare.`)
    + (d.itemsHtml || '')
    + infoBox([['Commande', esc(d.orderId)], ['Livraison estimée', esc(d.estimatedTime || '30-45 min')], ['Total', `<span style="color:${BRAND};">${esc(d.total)} FCFA</span>`]])
    + button('Suivre ma commande', SITE)
    + small('Merci de faire confiance à WAYI.'),
});

const orderDelivered = (d) => layout({
  preheader: 'Ta commande est arrivée, bon appétit !',
  body: title('Livré, bon appétit !') + hello(d.userName)
    + p(`Ta commande chez <b>${esc(d.shopName)}</b> est arrivée. On espère que tu vas te régaler.`)
    + p("Ton avis aide les autres clients : prends quelques secondes pour noter ton plat dans l'application.")
    + button('Noter ma commande', SITE),
});

const orderCancelled = (d) => layout({
  preheader: `Commande ${d.orderId} annulée`,
  body: title('Commande annulée') + hello(d.userName)
    + p(`Ta commande <b>${esc(d.orderId)}</b>${d.shopName ? ` chez <b>${esc(d.shopName)}</b>` : ''} a été annulée.`)
    + p("Si tu avais déjà payé, le remboursement est fait automatiquement sur ton moyen de paiement.")
    + button('Commander à nouveau', SITE),
});

// Message libre deja ecrit en HTML : on l'habille avec la mise en page
const wrap = (html, subject = '') => (/data-wayi-mail/.test(html || '') ? html
  : layout({ preheader: subject, body: (subject ? title(esc(subject)) : '') + `<div style="${FONT}font-size:15px;line-height:1.6;color:#374151;">${html || ''}</div>` }));

module.exports = { layout, wrap, title, p, small, codeBox, infoBox, button, verificationCode, passwordReset, welcomeAccount, orderConfirmed, orderDelivered, orderCancelled, SITE };
