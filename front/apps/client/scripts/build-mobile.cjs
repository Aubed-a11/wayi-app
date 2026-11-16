// ============================================================
// WAYI - Construction de l'application mobile unique
// L'appli WAYI contient les trois espaces :
//   /         client (et l'ecran de connexion / inscription commun)
//   /livreur/ espace livreur   (code de apps/driver)
//   /pro/     espace restaurant et administration (code de apps/ops)
// Usage : npm run build:mobile   (dans apps/client)
// ============================================================
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..');
const run = (cmd, cwd) => { console.log(`\n> ${cmd}   (${path.basename(cwd)})`); execSync(cmd, { cwd, stdio: 'inherit', shell: true }); };
const ensureDeps = (dir) => { if (!fs.existsSync(path.join(dir, 'node_modules'))) run('npm install --no-audit --no-fund', dir); };

// 1. Espace client (base /)
run('npx vite build --mode mobile', CLIENT);

// 2. Espaces livreur et restaurant, copies dans le meme dossier
for (const [app, base] of [['driver', 'livreur'], ['ops', 'pro']]) {
  const dir = path.join(CLIENT, '..', app);
  ensureDeps(dir);
  run(`npx vite build --mode mobile --base /${base}/ --outDir "${path.join(CLIENT, 'dist', base)}" --emptyOutDir`, dir);
}

// 3. Copie dans les projets Android / iOS
run('npx cap sync', CLIENT);
console.log('\nAppli WAYI prête : client + livreur + restaurant dans une seule application.');
