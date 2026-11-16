// ============================================================
// WAYI — Service Temps Réel (Socket.io)
// Tracking livreur live · Statuts commandes · Notifications
// ============================================================

let io = null;
const activeConnections = new Map(); // userId/driverId → socketId
const orderRooms = new Map();        // orderId → Set(socketIds)

/**
 * Initialiser Socket.io sur le serveur Express
 */
function initSocket(server) {
  const { Server } = require('socket.io');

  const { allowedOrigins } = require('../../config/origins');

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // ── Middleware d'auth JWT ──────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      // Permettre la connexion anonyme pour le tracking public
      socket.userId = `anon-${socket.id}`;
      return next();
    }
    try {
      // Même secret que l'API REST : aucun secret de secours écrit dans le code (un secret connu
      // permettrait de fabriquer un faux token et d'écouter les événements d'un autre compte).
      const { verifyToken } = require('../../middleware/auth');
      const decoded = verifyToken(token);
      socket.userId = decoded.id;
      socket.userRole = decoded.role || 'buyer';
      next();
    } catch {
      socket.userId = `anon-${socket.id}`;
      next();
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    activeConnections.set(userId, socket.id);

    console.log(`[Socket.io] Connected: ${userId} (${socket.userRole || 'anon'}) — Total: ${activeConnections.size}`);

    // ── ACHETEUR : rejoindre la room de sa commande ──────────
    socket.on('join:order', ({ orderId }) => {
      try {
        const { orders } = require('../data/store');
        const order = orders.find(o => o.id === orderId);
        // Client de la commande, son livreur, le restaurant concerne ou un admin
        const { merchants } = require('../../data/store');
        const merchantRestaurant = socket.userRole === 'merchant' ? merchants.find(m => m.id === userId)?.restaurantId : null;
        const authorized = order && (order.userId === userId || order.driver?.id === userId || socket.userRole === 'admin'
          || (merchantRestaurant && merchantRestaurant === order.restaurantId) || socket.userRole === undefined);
        if (order && !authorized) {
          socket.emit('order:join_denied', { orderId });
          return;
        }
      } catch {}
      socket.join(`order:${orderId}`);
      if (!orderRooms.has(orderId)) orderRooms.set(orderId, new Set());
      orderRooms.get(orderId).add(socket.id);
      socket.emit('order:joined', { orderId, message: `Connecté au suivi de ${orderId}` });
      console.log(`[Socket.io] ${userId} joined order:${orderId}`);
    });

    socket.on('leave:order', ({ orderId }) => {
      socket.leave(`order:${orderId}`);
      orderRooms.get(orderId)?.delete(socket.id);
    });

    // ── LIVREUR : mise à jour position GPS ──────────────────
    socket.on('driver:location', ({ orderId, lat, lng, speed, heading }) => {
      if (!orderId || socket.userRole !== 'driver') return; // seul un livreur connecte peut publier une position
      const { point } = require('../../utils/tracking');
      if (!point(lat, lng)) return;

      // Broadcaster la position à tous les watchers de la commande
      socket.to(`order:${orderId}`).emit('driver:position', {
        orderId, lat, lng, speed, heading,
        timestamp: new Date().toISOString(),
        driverId: userId,
      });

      // Mettre à jour la position dans le store (si accessible)
      try {
        const store = require('../data/store');
        const driver = store.drivers?.find(d => d.id === userId);
        if (driver) driver.location = { ...driver.location, lat, lng, updatedAt: new Date().toISOString() };
        const order = store.orders?.find(o => o.id === orderId && o.driver?.id === userId);
        if (order) require('../../utils/tracking').recordTrail(order, { lat: Number(lat), lng: Number(lng) });
      } catch {}
    });

    // ── LIVREUR : mise à jour statut commande ────────────────
    socket.on('driver:status_update', ({ orderId, status, eta }) => {
      socket.to(`order:${orderId}`).emit('order:status_changed', {
        orderId, status, eta,
        timestamp: new Date().toISOString(),
      });
      console.log(`[Socket.io] Order ${orderId} → ${status}`);
    });

    // ── COMMERCE : confirmer la commande ────────────────────
    socket.on('merchant:order_ready', ({ orderId }) => {
      io.to(`order:${orderId}`).emit('order:status_changed', {
        orderId, status: 'ready',
        message: 'Ta commande est prête ! Le livreur arrive.',
        timestamp: new Date().toISOString(),
      });
    });

    // ── CHAT SUPPORT ────────────────────────────────────────
    socket.on('support:message', ({ message, orderId }) => {
      socket.emit('support:reply', {
        message: `Support Wayi : Nous avons bien reçu ton message concernant la commande ${orderId}. Un agent te répondra sous 5 minutes.`,
        timestamp: new Date().toISOString(),
      });
    });

    // ── DÉCONNEXION ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      activeConnections.delete(userId);
      console.log(`[Socket.io] Disconnected: ${userId} (${reason}) — Total: ${activeConnections.size}`);
    });

    // Envoyer un ping de bienvenue
    socket.emit('wayi:welcome', {
      message: 'Connecté à Wayi en temps réel',
      userId,
      timestamp: new Date().toISOString(),
      features: ['order_tracking', 'driver_location', 'status_updates'],
    });
  });

  console.log('[Socket.io] Initialized ✓');
  return io;
}

// ── ÉMISSIONS SERVEUR → CLIENTS ───────────────────────────────

/**
 * Notifier un changement de statut commande à tous les watchers
 */
function emitOrderStatusChange(orderId, status, extra = {}) {
  // Notification push au client (meme appli fermee)
  try { require('../push').orderStatusToClient(orderId, status); } catch { /* facultatif */ }
  if (!io) return;
  const STATUS_MESSAGES = {
    confirmed:  'Commande confirmée !',
    preparing:  'En préparation...',
    ready:      'Prête à être récupérée !',
    on_the_way: 'Ton livreur est en route !',
    delivered:  'Livré ! Bon appétit !',
    cancelled:  'Commande annulée.',
  };
  io.to(`order:${orderId}`).emit('order:status_changed', {
    orderId, status,
    message: STATUS_MESSAGES[status] || status,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Envoyer une notification push-like à un utilisateur connecté
 */
function emitToUser(userId, event, data) {
  if (!io) return;
  const socketId = activeConnections.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, { ...data, timestamp: new Date().toISOString() });
    return true;
  }
  return false; // Utilisateur non connecté → utiliser FCM/WhatsApp
}

/**
 * Broadcaster à tous les livreurs disponibles (nouvelle commande dispo)
 */
function broadcastToDrivers(event, data) {
  if (!io) return;
  io.emit(`driver:${event}`, { ...data, timestamp: new Date().toISOString() });
}

/**
 * Stats temps réel
 */
function getRealtimeStats() {
  return {
    connectedUsers: activeConnections.size,
    activeOrders: orderRooms.size,
    connections: [...activeConnections.keys()],
  };
}

module.exports = {
  initSocket, emitOrderStatusChange, emitToUser,
  broadcastToDrivers, getRealtimeStats,
  getIO: () => io,
};
