#!/usr/bin/env node
// =====================================================================
// WAYI : déploie une application (tableau de bord, livreur ou client) sur Vercel, ET VÉRIFIE le résultat.
//
//   node deploy-front.mjs admin                  compile, déploie, puis vérifie que le site en ligne fonctionne
//   node deploy-front.mjs admin --verify-only    ne déploie rien : dit ce que le site en ligne sert réellement
//   node deploy-front.mjs all --verify-only      idem pour les trois applications
//   node deploy-front.mjs admin --build-only     compile et contrôle le résultat sur ce PC, sans déployer
//
// Applications : admin (tableau de bord, administration et restaurants), driver (livreur), client.
// Prérequis : Node.js 18 ou plus, et pour déployer : le programme « vercel » (npm install -g vercel) + vercel login.
// =====================================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEAM = process.env.VERCEL_SCOPE || 'aubed-a11s-projects';
const API_URL = process.env.WAYI_API_URL || 'https://api.wayibenin.com';
const WIN = process.platform === 'win32';

const APPS = {
  admin:  { dir: 'apps/ops',    project: 'wayi-admin',  url: 'https://admin.wayibenin.com',  label: 'Tableau de bord (administration et restaurants)' },
  driver: { dir: 'apps/driver', project: 'wayi-driver', url: 'https://driver.wayibenin.com', label: 'Application livreur' },
  client: { dir: 'apps/client', project: 'wayi-client', url: 'https://www.wayibenin.com',    label: 'Application client' },
};
APPS.ops = APPS.admin;

const [, , appArg, ...flags] = process.argv;
const has = (f) => flags.includes(f);
const say = (m = '') => console.log(m);
const ok = (m) => console.log(`  OK     ${m}`);
const bad = (m) => console.log(`  ECHEC  ${m}`);
function die(msg) { console.error(`\nERREUR : ${msg}\n`); process.exit(1); }

if (Number(process.versions.node.split('.')[0]) < 18) die(`Node.js 18 ou plus est nécessaire (vous avez ${process.versions.node}). Installez-le depuis nodejs.org.`);
if (!appArg || (!APPS[appArg] && appArg !== 'all')) die('Usage : node deploy-front.mjs <admin|driver|client|all> [--verify-only | --build-only]');
if (appArg === 'all' && !has('--verify-only')) die('« all » ne s\'utilise qu\'avec --verify-only (on déploie une application à la fois).');

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) }, shell: WIN, stdio: opts.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
}

// ── Vérification d'un site (en ligne, ou servi en local pour les tests) ───────────────────────────
async function checkSite(base, { retries = 1, delayMs = 5000 } = {}) {
  let last = [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    const problems = [];
    try {
      const res = await fetch(`${base}/?cb=${Date.now()}`, { cache: 'no-store', redirect: 'follow' });
      const html = await res.text();
      if (!res.ok) problems.push(`la page d'accueil répond ${res.status}`);
      else if (/\/src\/main\.jsx/.test(html)) problems.push('le site sert le CODE SOURCE non compilé (la page référence /src/main.jsx) : c\'est la cause d\'une page blanche. Le déploiement n\'a pas compilé l\'application ou a publié le mauvais dossier.');
      else {
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
        const js = assets.filter((a) => a.endsWith('.js')), css = assets.filter((a) => a.endsWith('.css'));
        if (!js.length || !css.length) problems.push(`la page ne référence pas l'application compilée (fichiers .js : ${js.length}, .css : ${css.length}).`);
        let apiSeen = false;
        for (const a of assets) {
          const r = await fetch(new URL(a, base), { cache: 'no-store' });
          const ct = r.headers.get('content-type') || '';
          const want = a.endsWith('.js') ? 'javascript' : 'css';
          if (!r.ok) problems.push(`${a} répond ${r.status} (le fichier n'existe pas sur le serveur)`);
          else if (!ct.includes(want)) problems.push(`${a} est servi comme « ${ct || 'type inconnu'} » au lieu de ${want} : le serveur renvoie la page d'accueil à la place du fichier`);
          else if (want === 'javascript' && (await r.text()).includes(new URL(API_URL).host)) apiSeen = true;
        }
        if (js.length && !problems.length && !apiSeen) problems.push(`l'application en ligne n'utilise pas l'adresse de l'API (${new URL(API_URL).host}) : elle a été compilée sans VITE_API_URL.`);
      }
    } catch (e) { problems.push(`le site est injoignable (${e.cause?.code || e.message})`); }
    last = problems;
    if (!problems.length) return [];
    if (attempt < retries) { say(`  ... pas encore bon (tentative ${attempt}/${retries}), nouvel essai dans ${delayMs / 1000} s`); await new Promise((r) => setTimeout(r, delayMs)); }
  }
  return last;
}

async function verifyOnly(names) {
  let failures = 0;
  for (const n of names) {
    const a = APPS[n];
    say(`\n${a.label}  ${process.env.WAYI_VERIFY_BASE || a.url}`);
    const problems = await checkSite(process.env.WAYI_VERIFY_BASE || a.url);
    if (!problems.length) ok('le site en ligne sert bien l\'application compilée et ses fichiers se chargent');
    else { failures++; problems.forEach(bad); }
  }
  say(failures ? `\n${failures} application(s) à corriger.` : '\nTout est en ordre.');
  process.exit(failures ? 1 : 0);
}

// ── Compilation locale + contrôle du résultat ────────────────────────────────────────────────────
function buildAndCheck(app) {
  const dir = path.join(ROOT, app.dir);
  if (!fs.existsSync(path.join(dir, 'package.json')) || !fs.existsSync(path.join(dir, 'src', 'main.jsx'))) die(`Dossier introuvable ou incomplet : ${dir}\nLancez ce script depuis le dossier du projet (celui qui contient « apps »).`);
  if (!has('--skip-install')) { say('\n1/4  Installation des dépendances...'); if (run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir }).status !== 0) die('npm install a échoué (voir ci-dessus).'); }
  say('\n2/4  Compilation (avec l\'adresse de l\'API ' + API_URL + ')...');
  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  if (run('npm', ['run', 'build'], { cwd: dir, env: { VITE_API_URL: API_URL } }).status !== 0) die('La compilation a échoué (voir ci-dessus). Rien n\'a été envoyé.');
  const index = path.join(dir, 'dist', 'index.html');
  if (!fs.existsSync(index)) die('La compilation n\'a pas produit dist/index.html.');
  const html = fs.readFileSync(index, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  if (/\/src\/main\.jsx/.test(html) || assets.length < 2) die('dist/index.html n\'est pas une version compilée valide.');
  for (const a of assets) if (!fs.existsSync(path.join(dir, 'dist', a))) die(`Fichier manquant après compilation : dist/${a}`);
  const jsFile = assets.find((a) => a.endsWith('.js'));
  if (!fs.readFileSync(path.join(dir, 'dist', jsFile), 'utf8').includes(new URL(API_URL).host)) die(`La version compilée n'utilise pas l'adresse de l'API (${API_URL}).`);
  say('\n3/4  Contrôle de la version compilée sur ce PC :');
  ok(`dist/index.html référence ${assets.length} fichiers, tous présents`);
  ok(`l'adresse de l'API (${new URL(API_URL).host}) est bien intégrée`);
  return dir;
}

// ── Lien avec le bon projet Vercel + déploiement ─────────────────────────────────────────────────
function linkProject(app, dir) {
  const file = path.join(dir, '.vercel', 'project.json');
  const current = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const cur = current();
  if (cur && (!cur.projectName || cur.projectName === app.project)) return;       // déjà lié au bon projet
  if (cur) { say(`  Le dossier est lié au projet « ${cur.projectName} » au lieu de « ${app.project} » : nouveau lien.`); fs.rmSync(path.join(dir, '.vercel'), { recursive: true, force: true }); }
  say(`\n  Lien avec le projet Vercel « ${app.project} »...`);
  let r = run('vercel', ['link', '--yes', '--project', app.project, '--scope', TEAM], { cwd: dir });
  if (r.status !== 0 || !current()) {
    say(`\n  Le lien automatique n'a pas fonctionné. Répondez aux questions : équipe « ${TEAM} », « Link to existing project » = oui, nom « ${app.project} ».`);
    r = run('vercel', ['link', '--scope', TEAM], { cwd: dir });
    if (r.status !== 0 || !current()) die('Impossible de lier le dossier au projet Vercel.');
  }
  const linked = current();
  if (linked?.projectName && linked.projectName !== app.project) die(`Le dossier est lié à « ${linked.projectName} » et non à « ${app.project} ». Supprimez le dossier « ${path.join(dir, '.vercel')} » et relancez.`);
}

function deploy(app, dir) {
  if (run('vercel', ['--version'], { capture: true }).status !== 0) die('Le programme « vercel » est introuvable. Installez-le :  npm install -g vercel   puis :  vercel login');
  say('\n4/4  Envoi vers Vercel...');
  linkProject(app, dir);
  // --build-env : l'adresse de l'API est imposée à la compilation faite par Vercel, quel que soit le réglage du projet.
  const r = run('vercel', ['deploy', '--prod', '--yes', '--scope', TEAM, '--build-env', `VITE_API_URL=${API_URL}`], { cwd: dir, capture: true });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  process.stdout.write(out);
  if (r.status !== 0) die('Le déploiement Vercel a échoué (voir ci-dessus).');
  if (!out.includes(app.url.replace('https://', ''))) say(`\n  ATTENTION : la ligne « Aliased: ${app.url} » n'apparaît pas ci-dessus. Le déploiement est peut-être parti dans un autre projet que celui qui porte ${app.url}.`);
}

async function main() {
  if (has('--verify-only')) return verifyOnly(appArg === 'all' ? ['admin', 'driver', 'client'] : [appArg]);
  const app = APPS[appArg];
  say(`\n=== ${app.label} ===`);
  const dir = buildAndCheck(app);
  if (has('--build-only')) { say('\nCompilation validée sur ce PC. (--build-only : rien n\'a été envoyé.)'); return; }
  deploy(app, dir);
  const base = process.env.WAYI_VERIFY_BASE || app.url;
  say(`\nVérification du site en ligne ${base} (jusqu'à 1 minute, le temps que Vercel publie)...`);
  const problems = await checkSite(base, { retries: Number(process.env.WAYI_VERIFY_RETRIES || 12), delayMs: Number(process.env.WAYI_VERIFY_DELAY_MS || 5000) });
  if (!problems.length) { ok(`${base} sert bien l'application compilée, ses fichiers se chargent et elle utilise ${new URL(API_URL).host}`); say('\nTERMINÉ : ouvrez le lien dans une fenêtre privée (Ctrl+Maj+N), puis rechargez avec Ctrl+F5.'); return; }
  problems.forEach(bad);
  say(`\nLe déploiement est parti mais le site en ligne n'est pas bon. À contrôler dans Vercel (projet « ${app.project} », Settings, General) :\n  - Root Directory : VIDE (ou « ./ »)\n  - Framework Preset : Vite (ou Other), Build Command et Output Directory : laissés par défaut (le fichier vercel.json du dossier les impose)\n  - Domains : ${app.url.replace('https://', '')} doit être rattaché à CE projet\nPuis copiez-moi les lignes ci-dessus.`);
  process.exit(1);
}
main().catch((e) => die(e.message));
