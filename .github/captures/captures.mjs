// Captures d'ecran de l'appli WAYI (version web Flutter) pour verifier le design.
// Prerequis : serveur local sur :3001 et appli web servie sur :8080.
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const API = 'http://localhost:3001/api';
const APP = 'http://localhost:8080';
const OUT = process.argv[2] || 'captures';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body, token, method = 'POST') => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) console.log('  !', path, r.status, JSON.stringify(j).slice(0, 200));
  return j;
};
const loginAny = async (email, password, role) => {
  const r = await post('/auth/login-any', { email, password });
  return (r.accounts || []).find((a) => a.role === role);
};

// Comptes de test (serveur local de la CI uniquement)
const PWD = 'Capture2026!';
const s = await post('/auth/register/start', { name: 'Marzouk', phone: '+22990000001', email: 'client@capture.test', password: PWD });
await post('/auth/register/verify', { email: 'client@capture.test', code: s.devCode });
const client = await loginAny('client@capture.test', PWD, 'client');
const admin = await loginAny('admin@wayi.bj', 'wayi2026', 'admin');
let merchant = null, driver = null;
if (admin) {
  const m = await post('/admin/merchants', { restaurantName: 'Chez Tantie Rose', tagline: 'Cuisine béninoise', zone: 'Cadjehoun', lat: 6.357, lng: 2.388, contactName: 'Rose', email: 'resto@capture.test', phone: '+22990000002' }, admin.token);
  if (m.devPassword) merchant = await loginAny('resto@capture.test', m.devPassword, 'merchant');
  const d = await post('/drivers/register/start', { name: 'Koffi', email: 'livreur@capture.test', password: PWD, phone: '+22990000003', vehicleType: 'moto', vehiclePlate: 'AB 1234 RB', zone: 'Cotonou' });
  await post('/drivers/register/verify', { email: 'livreur@capture.test', code: d.devCode });
  const all = await (await fetch(API + '/admin/drivers', { headers: { authorization: `Bearer ${admin.token}` } })).json().catch(() => ({}));
  const list = Array.isArray(all) ? all : (all.drivers || []);
  const me = list.find((x) => x.email === 'livreur@capture.test');
  if (me) await post(`/admin/drivers/${me.id}/reactivate`, {}, admin.token, 'PUT');
  driver = await loginAny('livreur@capture.test', PWD, 'driver');
}
console.log('comptes :', { client: !!client, merchant: !!merchant, driver: !!driver });

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const W = 390, H = 844;
async function open(session) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
  page.on('pageerror', (e) => console.log('  erreur page :', String(e).slice(0, 200)));
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2000);
  await page.evaluate((sess) => {
    localStorage.clear();
    if (sess) {
      localStorage.setItem('flutter.wayi.token', JSON.stringify(sess.token));
      localStorage.setItem('flutter.wayi.role', JSON.stringify(sess.role));
      localStorage.setItem('flutter.wayi.name', JSON.stringify(sess.name || ''));
    }
  }, session);
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2000);
  await sleep(9000);
  return page;
}
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  capture', name); };
const tap = async (page, x, y, wait = 3500) => { await page.mouse.click(x, y); await sleep(wait); };
const scroll = async (page, dy) => { await page.mouse.move(W / 2, H / 2); await page.mouse.wheel({ deltaY: dy }); await sleep(1500); };
const tabX = (i, n) => Math.round((W / n) * (i + 0.5));
const navY = H - 34;

// Accueil sans compte, puis connexion et inscription
let p = await open(null);
await shot(p, '01-bienvenue');
await tap(p, W / 2, 795, 4000); await shot(p, '02-connexion');
await p.close();
p = await open(null);
await tap(p, W / 2, 730, 4000); await shot(p, '03-inscription');
await p.close();

// Site client (web) : accueil, connexion, inscription
{
  const w = await browser.newPage();
  await w.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true });
  w.on('pageerror', (e) => console.log('  erreur site :', String(e).slice(0, 200)));
  await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  await w.screenshot({ path: `${OUT}/40-site-accueil.png` }); console.log('  capture 40-site-accueil');
  const clickText = async (txt) => w.evaluate((t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); if (b) b.click(); return !!b; }, txt);
  await clickText("J'ai déjà un compte"); await sleep(3500);
  await w.screenshot({ path: `${OUT}/41-site-connexion.png` }); console.log('  capture 41-site-connexion');
  await clickText('Inscription'); await sleep(2500);
  await w.screenshot({ path: `${OUT}/42-site-inscription.png` }); console.log('  capture 42-site-inscription');
  if (client) {
    await w.evaluate((t) => localStorage.setItem('wayi_token', t), client.token);
    await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);
    await w.screenshot({ path: `${OUT}/43-site-accueil-connecte.png` }); console.log('  capture 43-site-accueil-connecte');
    await w.evaluate(() => window.scrollBy(0, 600)); await w.evaluate(() => document.querySelector('.w-scroll')?.scrollBy(0, 560)); await sleep(1500);
    await w.screenshot({ path: `${OUT}/44-site-restaurants-phares.png` }); console.log('  capture 44-site-restaurants-phares');
    if (await clickText('Guédalia Restaurant')) {
      await sleep(4000);
      await w.screenshot({ path: `${OUT}/49-site-carte-restaurant.png` }); console.log('  capture 49-site-carte-restaurant');
      await w.evaluate(() => document.querySelector('.rs-scroll')?.scrollBy(0, 520)); await sleep(1500);
      await w.evaluate(() => document.querySelector('.rs-add')?.click()); await sleep(1200);
      await w.screenshot({ path: `${OUT}/50-site-carte-incontournables.png` }); console.log('  capture 50-site-carte-incontournables');
      await w.evaluate(() => document.querySelector('.rs-scroll')?.scrollBy(0, 700)); await sleep(1500);
      await w.screenshot({ path: `${OUT}/51-site-carte-menu.png` }); console.log('  capture 51-site-carte-menu');
      await w.evaluate(() => document.querySelector('.rs-back')?.click()); await sleep(2500);
    }
    await clickText('Panier'); await sleep(3500);
    await w.screenshot({ path: `${OUT}/45-site-panier-vide.png` }); console.log('  capture 45-site-panier-vide');
    await clickText('Ajouter'); await sleep(800); await clickText('Ajouter'); await sleep(1200);
    await clickText('Panier'); await sleep(3000);
    await w.screenshot({ path: `${OUT}/46-site-panier.png` }); console.log('  capture 46-site-panier');
    await clickText('Yivi'); await sleep(3000);
    await w.screenshot({ path: `${OUT}/47-site-yivi.png` }); console.log('  capture 47-site-yivi');
    await clickText('Profil'); await sleep(3000);
    await w.screenshot({ path: `${OUT}/48-site-profil.png` }); console.log('  capture 48-site-profil');
  }
  await w.close();
}

if (client) {
  p = await open({ token: client.token, role: 'client', name: client.name });
  await shot(p, '10-client-accueil');
  await scroll(p, 620); await shot(p, '11-client-accueil-suite');
  await scroll(p, 900); await shot(p, '12-client-accueil-bas');
  await tap(p, tabX(1, 5), navY); await shot(p, '13-client-explorer');
  await tap(p, tabX(2, 5), navY); await shot(p, '14-client-yivi');
  await tap(p, tabX(3, 5), navY); await shot(p, '15-client-commandes');
  await tap(p, tabX(4, 5), navY); await shot(p, '16-client-profil');
  await tap(p, tabX(0, 5), navY);
  await scroll(p, -3000);
  await scroll(p, 1150); await tap(p, W / 2, 420, 4000); await shot(p, '17-client-plat');
  await p.close();
}
if (client) {
  // Panier de l'appli : deux plats deja dans le panier, puis ouverture par la barre du panier
  const menu = await (await fetch(API + '/menu')).json().catch(() => ({}));
  const ds = (menu.dishes || []).filter(d => d.image).slice(0, 2);
  const items = ds.map((d, i) => ({ id: d.id, name: d.name, price: d.price, image: d.image, restaurantId: d.restaurantId, restaurantName: d.restaurant?.name || 'Restaurant', qty: i + 1 }));
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true });
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(2000);
  await page.evaluate((t, cart) => {
    localStorage.setItem('flutter.wayi.token', JSON.stringify(t));
    localStorage.setItem('flutter.wayi.role', JSON.stringify('client'));
    localStorage.setItem('flutter.wayi.name', JSON.stringify('Marzouk'));
    localStorage.setItem('flutter.wayi.cart', JSON.stringify(JSON.stringify(cart)));
  }, client.token, items);
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000);
  await tap(page, W / 2, H - 100, 4000);
  await shot(page, '18-client-panier');
  await page.close();
}
if (merchant) {
  p = await open({ token: merchant.token, role: 'merchant', name: merchant.name });
  await shot(p, '20-restaurant-commandes');
  for (let i = 1; i < 4; i++) { await tap(p, tabX(i, 4), navY); await shot(p, `2${i}-restaurant-onglet-${i + 1}`); }
  await p.close();
}
if (driver) {
  p = await open({ token: driver.token, role: 'driver', name: driver.name });
  await shot(p, '30-livreur-accueil');
  await scroll(p, 700); await shot(p, '31-livreur-suite');
  await p.close();
}
// ── Back office (admin.wayibenin.com en local) ──
if (admin) {
  // une commande de demonstration pour remplir les listes
  try {
    const menu = await (await fetch(API + '/menu')).json();
    const d = (menu.dishes || []).find(x => x.restaurantId === 'resto-guedalia') || (menu.dishes || [])[0];
    if (d && client) await post('/orders', { items: [{ dishId: d.id, qty: 2 }], address: 'Campus UAC, Abomey-Calavi', lat: 6.4415, lng: 2.3505, paymentMethod: 'cash' }, client.token);
  } catch (e) { console.log('  commande demo :', e.message); }
  const OPS = 'http://localhost:8082/';
  for (const [w, h, tag] of [[1440, 900, 'bureau'], [390, 844, 'mobile']]) {
    const bo = await browser.newPage();
    await bo.setViewport({ width: w, height: h, deviceScaleFactor: tag === 'mobile' ? 2 : 1 });
    await bo.goto(OPS, { waitUntil: 'domcontentloaded' });
    await bo.evaluate(t => localStorage.setItem('wayi_admin_token', t), admin.token);
    await bo.goto(OPS, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    const tabs = ["Vue d'ensemble", 'Restaurants', 'Plats', 'Commandes', 'Livreurs'];
    for (const [i, t] of tabs.entries()) {
      await bo.evaluate(t => {
        const sel = window.innerWidth > 900 ? '.bo-side nav button' : '.bo-mtabs button';
        const el = [...document.querySelectorAll(sel)].find(b => b.textContent.includes(t)); if (el) el.click();
      }, t);
      await new Promise(r => setTimeout(r, 3500));
      await bo.screenshot({ path: `${OUT}/6${i}-backoffice-${tag}-${i}.png` }); console.log(`  capture 6${i}-backoffice-${tag}`);
      if (tag === 'bureau' && i < 3) {
        await bo.evaluate(() => document.querySelector('.bo-content')?.scrollBy(0, 760)); await new Promise(r => setTimeout(r, 1500));
        await bo.screenshot({ path: `${OUT}/6${i}-backoffice-${tag}-${i}b.png` });
        await bo.evaluate(() => document.querySelector('.bo-content')?.scrollTo(0, 0));
      }
      if (tag === 'mobile' && i >= 2) break;
    }
    await bo.close();
  }
}
// Univers Mode de WAYI Bénin (masqué au public : les comptes de capture sont testeurs)
try {
  const reg = async (name, email, phone) => {
    const st = await post('/auth/register/start', { name, phone, email, password: PWD });
    await post('/auth/register/verify', { email, code: st.devCode });
    return loginAny(email, PWD, 'client');
  };
  const seller = await reg('Aïcha Bio', 'vendeuse@capture.test', '+22990000005');
  const before = await (await fetch(API + '/verticals', { headers: { authorization: `Bearer ${client.token}` } })).json();
  console.log('  Mode avant activation :', JSON.stringify(before.verticals));
  await post('/mode/admin/settings', { testers: ['client@capture.test', 'vendeuse@capture.test'] }, admin.token, 'PUT');
  // Photos libres de droits (Openverse), envoyees comme le ferait un vendeur
  const photo = async (q) => {
    try {
      const r = await (await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=5&license_type=all&aspect_ratio=tall`)).json();
      for (const it of r.results || []) {
        const img = await fetch(it.url, { headers: { 'user-agent': 'WAYI-captures/1.0' } });
        if (!img.ok) continue;
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length < 5000 || buf.length > 2900000) continue;
        const up = await post('/mode/photos', { data: buf.toString('base64'), ext: (img.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg' }, seller.token);
        if (up.url) return up.url;
      }
    } catch (e) { console.log('  photo', q, e.message); }
    return null;
  };
  const ads = [
    { title: 'Robe en wax', category: 'robes', size: 'M', condition: 'tres_bon', price: 8000, city: 'Cotonou', q: 'african wax print dress', description: 'Robe portée deux fois, tissu sans défaut, aucune retouche nécessaire.' },
    { title: 'Jean slim', category: 'pantalons', size: '40', condition: 'neuf', price: 6500, city: 'Abomey-Calavi', q: 'blue jeans', anonymous: true },
    { title: 'Baskets blanches', category: 'chaussures', size: '42', condition: 'bon', price: 12000, city: 'Cotonou', q: 'white sneakers' },
    { title: 'Chemise en lin', category: 'homme', size: 'L', condition: 'occasion', price: 4000, city: 'Porto-Novo', q: 'linen shirt' },
    { title: 'Sac à main en cuir', category: 'sacs', size: 'Taille unique', condition: 'tres_bon', price: 15000, city: 'Cotonou', q: 'leather handbag' },
    { title: 'Pagne tissé', category: 'pagnes', size: 'Taille unique', condition: 'neuf', price: 9500, city: 'Parakou', q: 'kente cloth' },
  ];
  const made = [];
  for (const a of ads) {
    const url = await photo(a.q);
    const r = await post('/mode/listings', { ...a, q: undefined, photos: url ? [url] : ['https://www.wayibenin.com/icon-512.png'] }, seller.token);
    if (r.listing) made.push(r.listing);
  }
  // Boutique partenaire : compte créé par WAYI, articles avec tailles et stock
  const sh = await post('/mode/admin/shops', { name: 'Maison Akpé', contactName: 'Akpé', email: 'boutique@capture.test', phone: '+22990000007', city: 'Cotonou', commissionRate: 0.12 }, admin.token);
  const shopLogin = sh.devPassword ? await post('/mode/shop/login', { email: 'boutique@capture.test', password: sh.devPassword }) : {};
  const shopToken = shopLogin.token;
  const shopAds = [
    { title: 'Robe en bazin brodée', category: 'robes', condition: 'neuf', price: 25000, q: 'embroidered african dress', variants: [{ size: 'S', qty: 0 }, { size: 'M', qty: 3 }, { size: 'L', qty: 2 }, { size: 'XL', qty: 1 }], description: 'Bazin riche, broderie faite main. Coupe ajustée.' },
    { title: 'Chemise en pagne homme', category: 'homme', condition: 'neuf', price: 15000, q: 'african print shirt men', variants: [{ size: 'M', qty: 4 }, { size: 'L', qty: 4 }, { size: 'XL', qty: 2 }] },
    { title: 'Sandales en cuir', category: 'chaussures', condition: 'neuf', price: 12000, q: 'leather sandals', variants: [{ size: '39', qty: 2 }, { size: '40', qty: 3 }, { size: '41', qty: 1 }] },
  ];
  const shopMade = [];
  if (shopToken) {
    for (const a of shopAds) {
      const url = await (async () => { const u = await photo(a.q); return u; })();
      const r = await post('/mode/listings', { ...a, q: undefined, city: 'Cotonou', photos: url ? [url] : ['https://www.wayibenin.com/icon-512.png'] }, shopToken);
      if (r.listing) shopMade.push(r.listing);
    }
  }
  // Une vente terminée et notée, une commande à payer, une conversation
  const sold = await post('/mode/orders', { listingId: made[5].id, method: 'cash', address: { label: 'Fidjrossè, Cotonou' } }, client.token);
  await post(`/mode/orders/${sold.order.id}/status`, { status: 'handed' }, seller.token, 'PUT');
  await post(`/mode/orders/${sold.order.id}/status`, { status: 'delivered' }, client.token, 'PUT');
  await post(`/mode/orders/${sold.order.id}/review`, { rating: 5, comment: 'Article conforme, vendeuse très sérieuse.' }, client.token);
  const c = await post(`/mode/listings/${made[0].id}/conversation`, { text: 'Bonjour, est-ce encore disponible ?' }, client.token);
  await post(`/mode/conversations/${c.conversation.id}/messages`, { text: 'Oui, toujours disponible. Je peux la remettre au livreur aujourd\'hui.' }, seller.token);
  if (shopMade[0]) {
    const so = await post('/mode/orders', { listingId: shopMade[0].id, method: 'cash', size: 'M', address: { label: 'Haie Vive, Cotonou' } }, client.token);
    const sc = (await (await fetch(API + '/mode/conversations', { headers: { authorization: `Bearer ${client.token}` } })).json()).conversations?.find(c => c.listingId === shopMade[0].id);
    if (sc) await post(`/mode/conversations/${sc.id}/messages`, { text: 'Bonjour, la taille M taille-t-elle grand ?' }, client.token);
    void so;
  }
  const pending = await post('/mode/orders', { listingId: made[2].id, method: 'mtn', phone: '0197000000', address: { label: 'Campus UAC, Abomey-Calavi' } }, client.token);

  const w = await browser.newPage();
  await w.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true });
  w.on('pageerror', (e) => console.log('  erreur mode :', String(e).slice(0, 200)));
  const shot = async (n) => { await w.screenshot({ path: `${OUT}/${n}.png` }); console.log('  capture', n); };
  const click = (sel, txt) => w.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(x => !t || x.textContent.includes(t)); if (el) el.click(); return !!el; }, sel, txt);
  await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await w.evaluate((t) => { localStorage.setItem('wayi_token', t); localStorage.setItem('wayi_universe', 'food'); }, client.token);
  await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' }); await sleep(6000);
  await shot('70-mode-restaurant-avec-choix');
  await click('.md-switch button', 'Mode'); await sleep(4000);
  await shot('71-mode-accueil');
  await w.evaluate(() => document.querySelector('.w-scroll')?.scrollBy(0, 640)); await sleep(1500);
  await shot('72-mode-annonces');
  await click('.md-chip', 'Boutiques'); await sleep(2500);
  await shot('89-mode-filtre-boutiques');
  await click('.md-card'); await sleep(3500);
  await shot('90-mode-fiche-boutique');
  await click('.md-sizes button:not([disabled])'); await sleep(600);
  await w.evaluate(() => document.querySelector('.w-scroll')?.scrollBy(0, 420)); await sleep(1000);
  await shot('91-mode-fiche-boutique-taille');
  await click('.back-btn'); await sleep(2500);
  await click('.md-chip', 'Boutiques'); await sleep(2500);
  await click('.md-card', 'Sac à main'); await sleep(3500);
  await shot('73-mode-fiche');
  await w.evaluate(() => document.querySelector('.w-scroll')?.scrollBy(0, 560)); await sleep(1200);
  await shot('74-mode-fiche-suite');
  await click('.md-seller'); await sleep(3000);
  await shot('75-mode-avis-vendeur');
  await click('.back-btn'); await sleep(2500);
  await click('.md-actions .md-btn', 'Acheter'); await sleep(3500);
  await shot('76-mode-paiement');
  await w.evaluate(() => { localStorage.setItem('wayi_universe', 'mode'); }); await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' }); await sleep(5000);
  await click('.nav-item', 'Messages'); await sleep(3000);
  await shot('77-mode-messages');
  await click('.md-conv'); await sleep(3000);
  await shot('78-mode-conversation');
  await click('.back-btn'); await sleep(2000);
  await click('.nav-item', 'Vendre'); await sleep(3000);
  await shot('79-mode-publier');
  await w.evaluate(() => document.querySelector('.w-scroll')?.scrollBy(0, 700)); await sleep(1200);
  await shot('80-mode-publier-suite');
  await click('.nav-item', 'Compte'); await sleep(3000);
  await shot('81-mode-compte');
  await click('.md-menu button', 'Mes achats'); await sleep(3000);
  await shot('82-mode-achats');
  await click('.md-line'); await sleep(3500);
  await shot('83-mode-suivi');
  // Etat « Bientot » : un client qui n'est pas testeur
  const other = await reg('Koffi Mensah', 'koffi@capture.test', '+22990000006');
  await post('/mode/admin/settings', { state: 'soon' }, admin.token, 'PUT');
  await w.evaluate((t) => { localStorage.setItem('wayi_token', t); localStorage.setItem('wayi_universe', 'food'); }, other.token);
  await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' }); await sleep(6000);
  await shot('84-mode-bientot-accueil');
  await click('.md-switch button', 'Mode'); await sleep(3000);
  await shot('85-mode-bientot-page');
  await post('/mode/admin/settings', { state: 'hidden' }, admin.token, 'PUT');
  await w.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' }); await sleep(6000);
  await shot('86-mode-masque-accueil');
  await w.close();

  const bo = await browser.newPage();
  await bo.setViewport({ width: 1440, height: 900 });
  await bo.goto('http://localhost:8082/', { waitUntil: 'domcontentloaded' });
  await bo.evaluate(t => localStorage.setItem('wayi_admin_token', t), admin.token);
  await bo.goto('http://localhost:8082/', { waitUntil: 'networkidle2' }); await sleep(3500);
  await bo.evaluate(() => { const el = [...document.querySelectorAll('.bo-side nav button')].find(b => b.textContent.includes('Mode')); if (el) el.click(); }); await sleep(3500);
  await bo.screenshot({ path: `${OUT}/87-backoffice-mode.png` }); console.log('  capture 87-backoffice-mode');
  await bo.evaluate(() => document.querySelector('.bo-content')?.scrollBy(0, 800)); await sleep(1500);
  await bo.screenshot({ path: `${OUT}/88-backoffice-mode-annonces.png` }); console.log('  capture 88-backoffice-mode-annonces');
  await bo.evaluate(() => document.querySelector('.bo-content')?.scrollBy(0, 400)); await sleep(1200);
  await bo.screenshot({ path: `${OUT}/92-backoffice-boutiques.png` }); console.log('  capture 92-backoffice-boutiques');
  await bo.close();

  // Espace boutique
  if (shopToken) {
    for (const [vw, vh, tag] of [[1440, 900, 'bureau'], [390, 844, 'mobile']]) {
      const sp = await browser.newPage();
      await sp.setViewport({ width: vw, height: vh, deviceScaleFactor: tag === 'mobile' ? 2 : 1 });
      sp.on('pageerror', (e) => console.log('  erreur boutique :', String(e).slice(0, 200)));
      await sp.goto('http://localhost:8082/', { waitUntil: 'domcontentloaded' });
      await sp.evaluate(t => { localStorage.clear(); localStorage.setItem('wayi_shop_token', t); }, shopToken);
      await sp.goto('http://localhost:8082/', { waitUntil: 'networkidle2' }); await sleep(4500);
      await sp.screenshot({ path: `${OUT}/93-boutique-${tag}-accueil.png` }); console.log('  capture 93-boutique', tag);
      const tabSel = tag === 'bureau' ? '.bo-side nav button' : '.bo-mtabs button';
      for (const [n, t] of [['94', 'Articles'], ['96', 'Commandes'], ['97', 'Messages']]) {
        await sp.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find(b => b.textContent.includes(t)); if (el) el.click(); }, tabSel, t); await sleep(2500);
        if (t === 'Messages') { await sp.evaluate(() => document.querySelector('.sh-conv')?.click()); await sleep(2500); }
        await sp.screenshot({ path: `${OUT}/${n}-boutique-${tag}-${t.toLowerCase()}.png` }); console.log('  capture', n, tag);
        if (t === 'Articles') {
          await sp.evaluate(() => document.querySelector('.bo-md-item .bo-icon-btn')?.click()); await sleep(2000);
          await sp.screenshot({ path: `${OUT}/95-boutique-${tag}-modifier.png` }); console.log('  capture 95', tag);
          await sp.evaluate(() => document.querySelector('.bo-modal-head .bo-icon-btn')?.click()); await sleep(800);
        }
      }
      await sp.close();
    }
  } else console.log('  boutique : pas de jeton', JSON.stringify(sh).slice(0, 200));
} catch (e) { console.log('  captures Mode :', e.message); }

await browser.close();
