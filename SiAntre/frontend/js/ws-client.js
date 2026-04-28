// ─── State Aplikasi Global ────────────────────────────────────────────────────
const AppState = {
  ws:                   null,
  isConnected:          false,
  currentUser:          null,   // { nik, nama, citizen_id, no_hp, alamat }
  currentAdmin:         null,   // { id_pegawai, nama, role, jabatan }
  _reqPin:              null,   // BUG-H1 FIX: store admin PIN in memory, not form
  services:             [],
  myBooking:            null,
  queueData:            {},
  reconnectAttempts:    0,
  maxReconnectAttempts: 10,
  pauseReconnect:       false,

  // === WARGA ===
  allBookings:          [],     // BUG-M6 FIX: initialized to [] to prevent undefined errors
  selectedService:      null,
  selectedSlot:         null,
  monitorServiceId:     null,
  unreadAnnouncements:  0,

  // === ADMIN ===
  queueSnapshots:       {},
  statsSnapshot:        null,
};

// ─── Event Bus ────────────────────────────────────────────────────────────────
const EventBus = {
  listeners: {},
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  },
  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (err) { console.error(`[EventBus] Error in "${event}":`, err); }
    });
  },
};

// ─── Kirim Command ke Gateway ─────────────────────────────────────────────────
function sendCommand(cmd, payload = {}) {
  if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {
    console.warn('[WsClient] Belum terhubung, command diabaikan:', cmd);
    if(typeof showNotification === 'function') showNotification('Koneksi Terputus', 'Mencoba menghubungkan kembali...', 'warning');
    return;
  }
  if (AppState.ws.bufferedAmount > 16 * 1024) {
    console.warn('[WsClient] Buffer penuh, pesan ditunda:', cmd);
    return;
  }
  AppState.ws.send(JSON.stringify({ cmd, payload }));
}

// ─── Router Pesan dari Gateway ────────────────────────────────────────────────
function routeMessage(msg) {
  switch (msg.type) {

    case 'CONNECTED':
      console.log('[WsClient] Terhubung:', msg.payload.clientId);
      EventBus.emit('wsConnected', msg.payload);
      break;

    case 'HEARTBEAT':
      break;

    // ── Fitur Wajib 1 — Streaming gRPC → WebSocket ───────────────────────────
    case 'QUEUE_UPDATE':
      EventBus.emit('queueUpdate', msg);
      EventBus.emit('activityLog', {
        type:      'queue',
        message:   formatQueueEvent(msg.payload),
        timestamp: msg.payload.timestamp,
      });
      
      // CLIENT-SIDE YOUR_TURN DETECTION
      if (AppState.myBooking
          && msg.payload.current_number === AppState.myBooking.queue_number
          && msg.service_id === AppState.myBooking.service_id) {
        EventBus.emit('yourTurn', msg);
      }

      if (msg.payload.current_number && msg.payload.event_type === 'QUEUE_MOVED') {
        EventBus.emit('queueNumberCalled', {
          number:     msg.payload.current_number,
          service_id: msg.service_id,
        });
      }
      break;

    // ── Fitur Wajib 3 — Server-Initiated Events ──────────────────────────────
    case 'STATS_PUSH':
      EventBus.emit('statsUpdate', msg.payload);
      EventBus.emit('queueChartUpdate', msg.payload);
      break;

    case 'SERVICES_STATUS_UPDATE':
      AppState.services = msg.payload.services;
      EventBus.emit('servicesUpdate', msg.payload.services);
      break;

    case 'NEW_ANNOUNCEMENT':
      EventBus.emit('newAnnouncement', msg.payload);
      EventBus.emit('activityLog', {
        type:      'announce',
        message:   `📢 ${msg.payload.title}: ${msg.payload.message}`,
        timestamp: msg.payload.timestamp,
      });
      if(typeof showNotification === 'function') showNotification('Pengumuman', msg.payload.message, 'info');
      break;

    // ── Responses Warga ──────────────────────────────────────────────────────
    case 'LOGIN_RESULT':      EventBus.emit('loginResult', msg);      break;
    case 'REGISTER_RESULT':   EventBus.emit('registerResult', msg);   break;
    case 'SERVICES_LIST':
      if (!msg.error) {
        AppState.services = msg.payload.services || [];
        EventBus.emit('servicesLoaded', AppState.services);
      }
      break;
    case 'SLOTS_LIST':        EventBus.emit('slotsLoaded', msg);      break;
    case 'BOOKING_RESULT':    EventBus.emit('bookingResult', msg);    break;
    case 'MY_BOOKING':        EventBus.emit('myBookingLoaded', msg);  break;
    case 'CANCEL_RESULT':     EventBus.emit('cancelResult', msg);     break;
    case 'RESCHEDULE_RESULT': EventBus.emit('rescheduleResult', msg); break;
    case 'QUEUE_STATUS':      EventBus.emit('queueStatus', msg);      break;
    case 'ANNOUNCEMENTS':     EventBus.emit('announcements', msg);    break;

    // ── Responses Admin ──────────────────────────────────────────────────────
    case 'ADMIN_LOGIN_RESULT':
      if (!msg.error) AppState.currentAdmin = msg.payload;
      EventBus.emit('adminLoginResult', msg);
      break;
    case 'SYSTEM_INIT_STATUS':         EventBus.emit('systemInitStatus', msg);          break;
    case 'ADMIN_EVENT':
      EventBus.emit('adminEvent', msg.payload);
      EventBus.emit('activityLog', {
        type:      'admin',
        message:   `Admin event: ${msg.payload.event_type}`,
        timestamp: msg.payload.timestamp,
      });
      break;
    case 'SYSTEM_STATS':               EventBus.emit('statsUpdate', msg.payload);        break;
    case 'CHECKIN_RESULT':             EventBus.emit('checkinResult', msg);              break;
    case 'WALK_IN_RESULT':             EventBus.emit('walkInResult', msg);               break;
    case 'RESET_QUOTA_RESULT':         EventBus.emit('resetQuotaResult', msg);           break;
    case 'OFFICERS_LIST':              EventBus.emit('officersList', msg);               break;
    case 'REGISTER_OFFICER_RESULT':    EventBus.emit('registerOfficerResult', msg);      break;
    case 'UPDATE_OFFICER_RESULT':      EventBus.emit('updateOfficerResult', msg);        break;
    case 'DELETE_OFFICER_RESULT':      EventBus.emit('deleteOfficerResult', msg);        break;
    case 'ADMIN_SESSION_ERROR':
      if(typeof showNotification === 'function') showNotification('Session Error', msg.payload?.message || 'Sesi admin terputus.', 'error');
      EventBus.emit('adminSessionError', msg);
      break;

    case 'ERROR':
      console.error('[WsClient] Error:', msg.payload?.message);
      if(typeof showNotification === 'function') showNotification('Terjadi Kesalahan', msg.payload?.message || 'Error tidak diketahui', 'error');
      EventBus.emit('activityLog', {
        type:      'error',
        message:   `Error: ${msg.payload?.message}`,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      console.log('[WsClient] Pesan tidak dikenal:', msg.type);
  }
}

function formatQueueEvent(payload) {
  const labels = {
    QUEUE_MOVED:     `Antrian bergerak — nomor ${payload.current_number} | menunggu: ${payload.total_waiting}`,
    YOUR_TURN:       `🎉 GILIRAN ANDA! Segera menuju loket.`,
    SERVICE_CLOSED:  `⚠️ Layanan ditutup sementara.`,
    SERVICE_RESUMED: `✅ Layanan dibuka kembali.`,
    ANNOUNCEMENT:    `📢 ${payload.message}`,
    QUOTA_OPENED:    `Slot baru tersedia.`,
  };
  return labels[payload.event_type] || `Event: ${payload.event_type}`;
}

// ─── Update Badge Koneksi ──────────────────────────────────────────────────────
function updateConnectionStatus(status) {
  const configs = {
    connected:    { text: '● Terhubung',    class: 'badge badge-success badge-sm' },
    disconnected: { text: '● Terputus',     class: 'badge badge-error badge-sm' },
    connecting:   { text: '<span class="loading loading-ring loading-xs"></span> Menghubungkan...', class: 'badge badge-warning gap-1 badge-sm' },
  };
  const cfg = configs[status] || configs.connecting;
  // Update all WS badges on the page
  document.querySelectorAll('[id^="ws-status-badge"]').forEach(badge => {
    badge.className = cfg.class;
    badge.innerHTML = cfg.text;
  });
}

// ─── Global Helper: setLoading ────────────────────────────────────────────────
window.setLoading = function(btnId, loading) {
  const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
    btn.disabled  = true;
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Memproses...';
  } else {
    btn.disabled  = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
};

// ─── Inisialisasi WebSocket ───────────────────────────────────────────────────
function initWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl      = `${wsProtocol}//${window.location.host}`;

  updateConnectionStatus('connecting');

  const ws = new WebSocket(wsUrl);
  AppState.ws = ws;

  ws.addEventListener('open', () => {
    AppState.isConnected       = true;
    AppState.reconnectAttempts = 0;
    updateConnectionStatus('connected');
    // Note: wsConnected event is emitted when server sends CONNECTED message (routeMessage)
    console.log('[WsClient] Koneksi dibuka.');
  });

  ws.addEventListener('message', (event) => {
    try {
      routeMessage(JSON.parse(event.data));
    } catch (err) {
      console.error('[WsClient] Parse error:', err);
    }
  });

  ws.addEventListener('close', (event) => {
    AppState.isConnected = false;
    AppState.ws          = null;
    updateConnectionStatus('disconnected');
    EventBus.emit('wsDisconnected', { code: event.code, reason: event.reason });
    console.log(`[WsClient] Koneksi ditutup — code: ${event.code}, clean: ${event.wasClean}`);

    if (event.code !== 1000 && event.code !== 1001) {
      scheduleReconnect();
    } else {
      console.log('[WsClient] Penutupan normal, tidak reconnect.');
    }
  });

  ws.addEventListener('error', () => {
    updateConnectionStatus('disconnected');
  });
}

// ─── Reconnect dengan Exponential Backoff ─────────────────────────────────────
function scheduleReconnect() {
  if (AppState.pauseReconnect) {
    console.log('[WsClient] Reconnect di-pause (tab background).');
    return;
  }
  if (AppState.reconnectAttempts >= AppState.maxReconnectAttempts) {
    if(typeof showNotification === 'function') showNotification('Koneksi Gagal', 'Tidak bisa terhubung ke server. Refresh halaman.', 'error', 0);
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, AppState.reconnectAttempts), 30000);
  AppState.reconnectAttempts++;
  console.log(`[WsClient] Reconnect attempt ${AppState.reconnectAttempts} dalam ${delay}ms...`);
  setTimeout(initWebSocket, delay);
}

window.addEventListener('beforeunload', () => {
  if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
    AppState.ws.close(1000, 'User navigating away');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    AppState.pauseReconnect = true;
  } else {
    AppState.pauseReconnect = false;
    if (!AppState.isConnected && AppState.ws === null) {
      AppState.reconnectAttempts = 0;
      initWebSocket();
    }
  }
});

document.addEventListener('DOMContentLoaded', initWebSocket);
