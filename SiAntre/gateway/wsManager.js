'use strict';

const WebSocket = require('ws');

// NOTE: commandHandler and pushScheduler are lazy-required inside functions
// to avoid circular dependency (both of them require wsManager back).

// Registry semua client yang aktif
const wsClients = new Set();

// Per-client state: Map<ws, { clientId, citizenId, officerId, role }>
const clientStates = new Map();

let grpcClients = null;

function initWsServer(httpServer, gClients) {
  grpcClients = gClients;

  // Lazy require to break circular dependency
  const { handleCommand, cleanupAdminSession } = require('./commandHandler');
  const { sendInitialSnapshot } = require('./pushScheduler');

  const wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    ws.clientId = clientId;

    wsClients.add(ws);
    clientStates.set(ws, {
      clientId,
      citizenId: null,
      officerId: null,
      role:      null,
    });

    console.log(`[WsManager] Client baru: ${clientId} (total: ${wsClients.size})`);

    // Kirim pesan selamat datang
    sendToClient(ws, {
      type:    'CONNECTED',
      payload: {
        clientId,
        message:   'Terhubung ke SiAntre Gateway',
        timestamp: new Date().toISOString(),
      },
    });

    // Kirim snapshot awal agar UI tidak kosong (delay 300ms untuk setup listener)
    setTimeout(() => sendInitialSnapshot(grpcClients, ws), 300);

    // Handle pesan masuk
    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        handleCommand(message, ws, grpcClients);
      } catch (err) {
        console.error(`[WsManager] Parse error dari ${clientId}:`, err.message);
        sendToClient(ws, {
          type:    'ERROR',
          payload: { message: 'Format pesan tidak valid. Harus berupa JSON.' },
        });
      }
    });

    // Handle disconnect
    ws.on('close', (code, reason) => {
      wsClients.delete(ws);
      const state = clientStates.get(ws);
      clientStates.delete(ws);

      // Bersihkan admin session saat client disconnect
      if (state?.clientId) {
        cleanupAdminSession(state.clientId);
      }

      console.log(`[WsManager] Client terputus: ${clientId} (sisa: ${wsClients.size})`);
    });

    ws.on('error', (err) => {
      console.error(`[WsManager] Error client ${clientId}:`, err.message);
      wsClients.delete(ws);
      clientStates.delete(ws);
    });
  });

  wss.on('error', (err) => {
    console.error('[WsManager] Server error:', err.message);
  });

  return wss;
}

// ── Broadcast & Send Helpers ──────────────────────────────────────────────────

function broadcast(message) {
  const payload = JSON.stringify(message);
  let sent = 0;
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sent++;
    }
  });
  if (wsClients.size > 0) {
    console.log(`[WsManager] Broadcast [${message.type}] → ${sent}/${wsClients.size} client`);
  }
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Kirim pesan hanya ke client dengan citizenId tertentu.
 * Digunakan untuk event personal YOUR_TURN.
 */
function sendToClientByCitizenId(citizenId, message) {
  let found = false;
  wsClients.forEach((ws) => {
    const state = clientStates.get(ws);
    if (state?.citizenId === citizenId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      found = true;
    }
  });
  if (!found) {
    console.log(`[WsManager] Citizen ${citizenId} tidak terhubung, YOUR_TURN tidak terkirim.`);
  }
}

function getClientState(ws) {
  return clientStates.get(ws) || null;
}

function setClientState(ws, state) {
  clientStates.set(ws, state);
}

function getClientCount() {
  return wsClients.size;
}

module.exports = {
  initWsServer,
  broadcast,
  sendToClient,
  sendToClientByCitizenId,
  getClientState,
  setClientState,
  getClientCount,
};
