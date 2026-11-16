// ============================================================
// WAYI - Boite de notifications du compte connecte
// GET /api/notifications?since=<horodatage ms>  notifications plus recentes
// ============================================================
const express = require('express');
const { auth } = require('../middleware/auth');
const { accountFor, inboxSince } = require('../services/push');

const router = express.Router();

router.get('/', auth, (req, res) => {
  const account = accountFor(req.user);
  if (!account) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({ notifications: inboxSince(account, req.query.since), now: Date.now() });
});

module.exports = router;
