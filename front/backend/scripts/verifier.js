// ============================================================
// WAYI - Verification des services reels
// Usage : npm run verifier          (dans le dossier backend)
//         npm run verifier -- --email ton@adresse.com   (envoie aussi un e-mail de test)
// Teste chaque cle pour de vrai (connexion a la base, cle Claude,
// token WhatsApp, compte Twilio, serveur e-mail...) sans rien payer
// ni prelever. Affiche ce qui marche et ce qu'il faut corriger.
// ============================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const { scrubPlaceholders, SERVICES, serviceState } = require('../utils/integrations');

scrubPlaceholders();
const env = (k) => (process.env[k] || '').trim();
const T = 12000;
const emailArg = (() => { const i = process.argv.indexOf('--email'); return i > 0 ? process.argv[i + 1] : null; })();

const why = (e) => e.response?.data?.error?.message || e.response?.data?.message || e.response?.data?.error_description || (typeof e.response?.data?.error === 'string' ? e.response.data.error : null) || e.code || e.message;

const CHECKS = {
  async database() {
    const { Pool } = require('pg');
    const url = env('DATABASE_URL');
    const pool = new Pool({ connectionString: url, ssl: /sslmode=require|neon\.tech|supabase/.test(url) ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000 });
    try {
      const r = await pool.query('SELECT version()').catch(e => {
        if (e.code === 'ECONNREFUSED') throw new Error(`aucun PostgreSQL ne répond à ${e.address}:${e.port}. Sur le VPS : docker ps (le conteneur tourne-t-il ?)`);
        if (e.code === '28P01') throw new Error('mot de passe refusé par PostgreSQL : vérifie celui de DATABASE_URL');
        if (e.code === '3D000') throw new Error("la base indiquée dans DATABASE_URL n'existe pas");
        if (e.code === 'ENOTFOUND') throw new Error("adresse du serveur PostgreSQL introuvable : vérifie DATABASE_URL");
        throw e;
      });
      const t = await pool.query("SELECT to_regclass('public.app_state') AS t");
      return `connectée (${r.rows[0].version.split(' ').slice(0, 2).join(' ')})${t.rows[0].t ? ', données WAYI présentes' : ', tables créées au premier démarrage'}`;
    } finally { await pool.end().catch(() => {}); }
  },

  async kkiapay() {
    const sandbox = env('KKIAPAY_SANDBOX') !== 'false';
    const base = sandbox ? 'https://api-sandbox.kkiapay.me' : 'https://api.kkiapay.me';
    // Une transaction inexistante : une cle refusee renvoie 401/403, une cle valide renvoie "introuvable"
    try {
      await axios.post(`${base}/api/v1/transactions/status`, { transactionId: 'verification-wayi' }, {
        headers: { 'x-api-key': env('KKIAPAY_PUBLIC_KEY'), 'x-private-key': env('KKIAPAY_PRIVATE_KEY'), 'x-secret-key': env('KKIAPAY_SECRET') }, timeout: T,
      });
    } catch (e) {
      const st = e.response?.status;
      if (st === 401 || st === 403) throw new Error(`clés refusées par Kkiapay (${st}). Vérifie que ce sont les clés ${sandbox ? 'SANDBOX' : 'LIVE'}.`);
      if (!st) throw new Error(`Kkiapay injoignable (${why(e)})`);
    }
    return `clés acceptées (${sandbox ? 'mode SANDBOX : aucun vrai prélèvement' : 'mode LIVE : argent réel'})${env('KKIAPAY_WEBHOOK_SECRET') ? '' : '. Pense à KKIAPAY_WEBHOOK_SECRET'}`;
  },

  async email() {
    if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) {
      const nodemailer = require('nodemailer');
      const port = Number(env('SMTP_PORT') || 465);
      const tr = nodemailer.createTransport({ host: env('SMTP_HOST'), port, secure: port === 465, auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') } });
      await tr.verify();
      if (emailArg) await tr.sendMail({ from: env('EMAIL_FROM') || env('SMTP_USER'), to: emailArg, subject: 'WAYI : e-mail de test', text: 'Si tu lis ceci, les e-mails de WAYI partent bien.' });
      return `serveur SMTP accepté (${env('SMTP_USER')})${emailArg ? `, e-mail de test envoyé à ${emailArg}` : '. Ajoute --email ton@adresse pour recevoir un test'}`;
    }
    const { data } = await axios.get('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}` }, timeout: T });
    const ok = (data.data || []).filter(d => d.status === 'verified').map(d => d.name);
    if (!ok.length) throw new Error("clé Resend valide mais aucun domaine vérifié : les e-mails ne partiront qu'à ta propre adresse");
    return `clé Resend acceptée, domaine(s) vérifié(s) : ${ok.join(', ')}`;
  },

  async claude() {
    const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
    try {
      await axios.post('https://api.anthropic.com/v1/messages', { model, max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }, {
        headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: T,
      });
    } catch (e) {
      const m = why(e);
      if (/credit/i.test(m)) throw new Error("clé valide mais crédit épuisé : ajoute du crédit dans console.anthropic.com > Billing");
      throw new Error(m);
    }
    return `répond (modèle ${model}). Yivi utilise la vraie IA.`;
  },

  async whatsapp() {
    const { data } = await axios.get(`https://graph.facebook.com/v18.0/${env('WHATSAPP_PHONE_NUMBER_ID')}`, { params: { access_token: env('WHATSAPP_ACCESS_TOKEN'), fields: 'display_phone_number,verified_name,quality_rating' }, timeout: T });
    return `numéro ${data.display_phone_number} (${data.verified_name || 'nom non vérifié'}), qualité ${data.quality_rating || '?'}`;
  },

  async twilio() {
    const sid = env('TWILIO_ACCOUNT_SID');
    const { data } = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { auth: { username: sid, password: env('TWILIO_AUTH_TOKEN') }, timeout: T });
    return `compte ${data.friendly_name} (${data.status}${data.type === 'Trial' ? ', compte d\'essai : SMS seulement vers les numéros vérifiés' : ''})`;
  },
};

(async () => {
  console.log('\nWAYI : vérification des services réels\n');
  let missing = 0; let failed = 0;
  for (const s of SERVICES) {
    if (s.besoin === 'inutile' && !serviceState(s)) continue;
    const head = `${s.label} [${s.besoin}]`;
    if (!serviceState(s)) {
      if (s.besoin === 'indispensable') missing++;
      console.log(`  [pas configuré]  ${head}\n                   ${s.pourquoi}\n                   ${s.ou}\n`);
      continue;
    }
    if (!CHECKS[s.id]) { console.log(`  [configuré]      ${head}\n`); continue; }
    try {
      const msg = await CHECKS[s.id]();
      console.log(`  [OK]             ${head}\n                   ${msg}\n`);
    } catch (e) {
      failed++;
      console.log(`  [ERREUR]         ${head}\n                   ${e.message || why(e)}\n`);
    }
  }
  if (process.env.NODE_ENV !== 'production') console.log('  Note : NODE_ENV n\'est pas "production" (normal en local, à mettre sur le VPS).');
  if (process.env.ALLOW_SIMULATED_PAYMENTS === '1' || process.env.ALLOW_DEMO_ORDERS === '1') console.log('  Note : paiements simulés ou commandes de plats d\'exemple encore autorisés (ALLOW_...=1). À retirer en production.');
  console.log(`\n${failed ? `${failed} service(s) en erreur. ` : ''}${missing ? `${missing} service(s) indispensable(s) à configurer : npm run configurer` : failed ? '' : 'Tout ce qui est indispensable fonctionne.'}\n`);
  process.exit(failed ? 1 : 0);
})();
