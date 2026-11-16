// ============================================================
// WAYI - Telephones qui recoivent les notifications push
// POST   /api/devices  { token }  enregistre le telephone du compte connecte
// DELETE /api/devices  { token }  a la deconnexion
// ============================================================
const express = require('express');
const { auth } = require('../middleware/auth');
const { accountFor, registerToken, removeToken } = require('../services/push');

const router = express.Router();

router.post('/', auth, (req, res) => {
  const account = accountFor(req.user);
  if (!account) return res.status(404).json({ error: 'Compte introuvable' });
  if (!registerToken(account, req.body?.token)) return res.status(400).json({ error: 'Jeton de notification invalide' });
  res.json({ ok: true });
});

router.delete('/', auth, (req, res) => {
  removeToken(accountFor(req.user), String(req.body?.token || req.query?.token || ''));
  res.json({ ok: true });
});

module.exports = router;
