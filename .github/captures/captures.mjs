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
await browser.close();
