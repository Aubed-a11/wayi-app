// ============================================================
// WAYI — Persistance PostgreSQL (sauvegarde/restauration de l'état complet)
//
// Même approche que la version Supabase précédente, mais avec un vrai
// serveur PostgreSQL sous ton contrôle (conteneur Docker sur le VPS) plutôt
// qu'un service tiers : on sauvegarde périodiquement TOUT l'état applicatif
// (users, drivers, merchants, admins, restaurants, dishes, reviews, orders,
// receipts) comme un seul objet JSON dans une table `app_state`, et on le
// recharge au démarrage. Aucune route n'a besoin de changer : store.js reste
// la même interface synchrone pour le reste du code.
//
// Limites assumées (à connaître) :
//  - Fenêtre de perte de données entre deux sauvegardes (quelques secondes,
//    voir SAVE_INTERVAL_MS dans server.js) — mitigée par une sauvegarde à
//    chaque arrêt propre du serveur (SIGINT/SIGTERM) en plus de l'intervalle.
//  - Pensé pour une seule instance du backend (PM2 fork mode, comme
//    actuellement) ; pas adapté à plusieurs instances qui écriraient en
//    parallèle (le dernier "save" écraserait les autres).
//  - Un seul gros blob JSON plutôt que des tables relationnelles distinctes :
//    simple et robuste pour la taille actuelle du projet, mais à revoir
//    (vraies tables + vraies requêtes) si le volume de commandes grossit
//    beaucoup un jour.
// ============================================================

const STATE_KEY = process.env.DB_STATE_KEY || 'wayi-main';

let pool = null;
let dbUnavailable = false;

function getPool() {
  if (pool) return pool;
  if (dbUnavailable) return null;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null; // Pas configuré → store en mémoire uniquement

  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString });
    pool.on('error', (err) => {
      // Erreur asynchrone sur une connexion inactive du pool — on la log sans
      // planter le serveur (pg recommande explicitement ce pattern).
      console.error('[Postgres] Erreur de pool inattendue :', err.message);
    });
    console.log('[Postgres] Pool de connexions créé ✓');
    return pool;
  } catch (err) {
    dbUnavailable = true;
    console.warn('[Postgres] Module "pg" indisponible, utilisation du store en mémoire uniquement.');
    console.warn('[Postgres] Détail :', err.message);
    return null;
  }
}

// ── SCHEMA SQL (à exécuter une fois : voir DEPLOIEMENT.md ou le message
//    affiché par le script d'installation) ──
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function ensureSchema() {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(SCHEMA_SQL);
    return true;
  } catch (err) {
    console.warn('[Postgres] Échec de la création du schéma :', err.message);
    return false;
  }
}

/**
 * Charge l'état sauvegardé depuis PostgreSQL.
 * @returns {Promise<object|null>} l'objet d'état, ou null si absent/non configuré.
 */
async function loadAppState() {
  const p = getPool();
  if (!p) return null;
  try {
    await ensureSchema();
    const { rows } = await p.query('SELECT data FROM app_state WHERE key = $1', [STATE_KEY]);
    return rows[0]?.data || null;
  } catch (err) {
    console.warn('[Postgres] Échec du chargement de l\'état :', err.message);
    return null;
  }
}

/**
 * Sauvegarde (upsert) l'état applicatif complet dans PostgreSQL.
 * @param {object} state
 * @returns {Promise<boolean>} true si la sauvegarde a réussi.
 */
async function saveAppState(state) {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `INSERT INTO app_state (key, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
      [STATE_KEY, JSON.stringify(state)]
    );
    return true;
  } catch (err) {
    console.warn('[Postgres] Échec de la sauvegarde de l\'état :', err.message);
    return false;
  }
}

module.exports = { getPool, loadAppState, saveAppState, SCHEMA_SQL };
