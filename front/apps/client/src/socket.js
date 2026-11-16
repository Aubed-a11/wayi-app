import { io } from 'socket.io-client';

let socket = null;

// Se connecte (ou réutilise la connexion) avec le token courant (buyer ou livreur)
export function getSocket(tokenOverride) {
  const token = tokenOverride || localStorage.getItem('wayi_driver_token') || localStorage.getItem('wayi_token');
  if (socket && socket.connected && socket.auth?.token === token) return socket;
  if (socket) socket.disconnect();
  // En développement, se connecte au même hôte (proxy Vite). En production,
  // VITE_API_URL doit pointer vers l'URL complète du backend déployé.
  const socketUrl = import.meta.env.VITE_API_URL || '/';
  socket = io(socketUrl, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
