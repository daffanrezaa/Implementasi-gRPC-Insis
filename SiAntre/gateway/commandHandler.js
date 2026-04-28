'use strict';

// Import konstanta readyState dari library ws (menghindari magic number)
const { OPEN: WS_OPEN } = require('ws');

const { broadcast, sendToClient, getClientState, setClientState } = require('./wsManager');

// Satu session BiDi per koneksi WebSocket — bukan singleton global
// Map<clientId, { session: grpc.ClientDuplexStream, active: boolean, clients, ws }>
const adminSessions = new Map();

// ── Admin Session Management ──────────────────────────────────────────────────

/**
 * Membuka BiDi AdminSession untuk satu koneksi admin.
 * Dipanggil setelah LoginOfficer (unary) berhasil.
 * TIDAK ada command LOGIN yang ditulis ke stream — autentikasi sudah selesai.
 */
function startAdminSession(ws, clients) {
  const state    = getClientState(ws);
  const clientId = state?.clientId;
  if (!clientId) return;

  if (adminSessions.has(clientId) && adminSessions.get(clientId).active) {
    console.log(`[CommandHandler] Session untuk ${clientId} sudah aktif.`);
    return;
  }

  console.log(`[CommandHandler] Membuka AdminSession untuk client: ${clientId}`);

  const session = clients.admin.AdminSession();

  adminSessions.set(clientId, { session, active: true, clients, ws });

  session.on('data', (event) => {
    console.log(`[CommandHandler] AdminEvent [${clientId}]:`, event.event_type);
    sendToClient(ws, {
      type: 'ADMIN_EVENT',
      payload: {
        event_type: event.event_type,
        data:       event,
        timestamp:  new Date().toISOString(),
      },
    });
  });

  session.on('error', (err) => {
    console.error(`[CommandHandler] AdminSession error [${clientId}]:`, err.message);
    const entry = adminSessions.get(clientId);
    if (entry) entry.active = false;

    sendToClient(ws, {
      type:    'ADMIN_SESSION_ERROR',
      payload: { message: err.message },
    });

    // Auto-reconnect session setelah 5 detik jika WS masih terhubung
    console.log(`[CommandHandler] Mencoba reconnect AdminSession ${clientId} dalam 5s...`);
    setTimeout(() => {
      if (ws.readyState === WS_OPEN) {
        startAdminSession(ws, clients);
      }
    }, 5000);
  });

  session.on('end', () => {
    console.log(`[CommandHandler] AdminSession [${clientId}] berakhir.`);
    const entry = adminSessions.get(clientId);
    if (entry) entry.active = false;
  });
}

/**
 * Mengirim perintah ke AdminSession milik client tertentu.
 */
function sendAdminCommand(ws, command) {
  const state    = getClientState(ws);
  const clientId = state?.clientId;
  const entry    = adminSessions.get(clientId);

  if (!entry || !entry.active || !entry.session) {
    sendToClient(ws, {
      type:    'ERROR',
      payload: { message: 'Admin session belum aktif. Silakan login terlebih dahulu.' },
    });
    return;
  }

  console.log(`[CommandHandler] Command → AdminSession [${clientId}]:`, command.command_type);
  entry.session.write(command);
}

/**
 * Membersihkan session admin saat client disconnect.
 * Dipanggil dari wsManager ketika koneksi WS terputus.
 */
function cleanupAdminSession(clientId) {
  const entry = adminSessions.get(clientId);
  if (entry && entry.session) {
    try { entry.session.end(); } catch (_) {}
    adminSessions.delete(clientId);
    console.log(`[CommandHandler] Session admin ${clientId} dibersihkan.`);
  }
}

// ── Main Command Router ───────────────────────────────────────────────────────

function handleCommand(message, ws, clients) {
  const { cmd, payload } = message;
  console.log(`[CommandHandler] Command: ${cmd}`);

  switch (cmd) {

    // ── ServiceInfo (Unary) ──────────────────────────────────────────────────

    case 'REGISTER_CITIZEN':
      clients.serviceInfo.RegisterCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LOGIN_CITIZEN':
      clients.serviceInfo.LoginCitizen(payload, (err, res) => {
        if (!err && res) {
          // Simpan citizen_id (system-generated) di state client
          const state = getClientState(ws);
          if (state) {
            state.citizenId = res.citizen_id;  // FIX: gunakan system-generated citizen_id
            state.nik       = res.nik;         // Simpan NIK juga
            state.role      = 'CITIZEN';
            setClientState(ws, state);
          }
        }
        sendToClient(ws, { type: 'LOGIN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LIST_SERVICES':
      clients.serviceInfo.ListServices(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'SERVICES_LIST', error: err?.message, payload: res });
      });
      break;

    case 'GET_SERVICE_DETAIL':
      clients.serviceInfo.GetServiceDetail(payload, (err, res) => {
        sendToClient(ws, { type: 'SERVICE_DETAIL', error: err?.message, payload: res });
      });
      break;

    case 'GET_AVAILABLE_SLOTS':
      clients.serviceInfo.GetAvailableSlots(payload, (err, res) => {
        sendToClient(ws, { type: 'SLOTS_LIST', error: err?.message, payload: res });
      });
      break;

    case 'GET_ANNOUNCEMENTS':
      clients.serviceInfo.GetAnnouncements(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'ANNOUNCEMENTS', error: err?.message, payload: res });
      });
      break;

    // ── Booking (Unary) ──────────────────────────────────────────────────────

    case 'CREATE_BOOKING':
      clients.booking.CreateBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'BOOKING_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'CANCEL_BOOKING':
      // FIX: payload now uses booking_code (not booking_id)
      clients.booking.CancelBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'CANCEL_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'GET_MY_BOOKING':
      clients.booking.GetMyBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'MY_BOOKING', error: err?.message, payload: res });
      });
      break;

    case 'RESCHEDULE_BOOKING':
      // FIX: payload now uses booking_code (not booking_id)
      clients.booking.RescheduleBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'RESCHEDULE_RESULT', error: err?.message, payload: res });
      });
      break;

    // ── Queue (Unary) ────────────────────────────────────────────────────────

    case 'GET_QUEUE_STATUS':
      clients.queue.GetQueueStatus(payload, (err, res) => {
        sendToClient(ws, { type: 'QUEUE_STATUS', error: err?.message, payload: res });
      });
      break;

    // ── Admin Unary ──────────────────────────────────────────────────────────

    case 'CHECK_SYSTEM_INITIALIZED':
      clients.admin.IsSystemInitialized({}, (err, res) => {
        sendToClient(ws, { type: 'SYSTEM_INIT_STATUS', error: err?.message, payload: res });
      });
      break;

    case 'ADMIN_LOGIN':
      // payload: { id_pegawai, pin } — id_pegawai = NIP (external ID)
      clients.admin.LoginOfficer(payload, (err, res) => {
        if (err) {
          sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', error: err.message });
          return;
        }
        // Simpan info admin ke client state
        const state = getClientState(ws);
        if (state) {
          state.officerId  = res.officer_id;   // FIX: system-generated ID
          state.idPegawai  = res.id_pegawai;   // NIP (external ID)
          state.role       = res.role;
          setClientState(ws, state);
        }
        sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', payload: res });

        // Buka BiDi session TANPA mengirim command LOGIN ke stream
        startAdminSession(ws, clients);
      });
      break;

    case 'GET_SYSTEM_STATS':
      clients.admin.GetSystemStats(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'SYSTEM_STATS', error: err?.message, payload: res });
      });
      break;

    case 'WALK_IN_CITIZEN':
      payload.officer_id = getClientState(ws)?.idPegawai || '';
      clients.admin.WalkInCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'WALK_IN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'CHECKIN_CITIZEN':
      payload.officer_id = getClientState(ws)?.idPegawai || '';
      clients.admin.CheckInCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'CHECKIN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'RESET_DAILY_QUOTA':
      payload.officer_id = getClientState(ws)?.idPegawai || '';
      clients.admin.ResetDailyQuota(payload, (err, res) => {
        sendToClient(ws, { type: 'RESET_QUOTA_RESULT', error: err?.message, payload: res });
      });
      break;

    // ── Manajemen Petugas (Unary) ────────────────────────────────────────────

    case 'REGISTER_OFFICER':
      // payload: { id_pegawai, nama, jabatan, role, pin, requester_id?, requester_pin? }
      clients.admin.RegisterOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'UPDATE_OFFICER':
      clients.admin.UpdateOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'UPDATE_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'DELETE_OFFICER':
      clients.admin.DeleteOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'DELETE_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LIST_OFFICERS':
      clients.admin.ListOfficers(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'OFFICERS_LIST', error: err?.message, payload: res });
      });
      break;

    // ── BiDi Stream Commands — diteruskan ke AdminSession koneksi ini ─────────

    case 'CALL_NEXT':
      sendAdminCommand(ws, {
        command_type: 'CALL_NEXT',
        service_id:   payload.service_id,
        officer_id:   getClientState(ws)?.idPegawai || '',  // Use NIP for isOfficer check
      });
      break;

    case 'ANNOUNCE':
      // FIX: Proto AdminCommand tidak punya field "message"
      // Server expect JSON string di field "payload"
      sendAdminCommand(ws, {
        command_type: 'ANNOUNCE',
        service_id:   payload.service_id || '',
        officer_id:   getClientState(ws)?.idPegawai || '',
        payload:      JSON.stringify({ message: payload.message }),
      });
      break;

    case 'PAUSE':
    case 'RESUME':
      sendAdminCommand(ws, {
        command_type: cmd,
        service_id:   payload.service_id,
        officer_id:   getClientState(ws)?.idPegawai || '',
      });
      break;

    case 'GET_STATS_STREAM':
      sendAdminCommand(ws, { command_type: 'GET_STATS' });
      break;

    default:
      console.warn('[CommandHandler] Command tidak dikenal:', cmd);
      sendToClient(ws, {
        type:    'ERROR',
        payload: { message: `Command tidak dikenal: ${cmd}` },
      });
  }
}

module.exports = { handleCommand, cleanupAdminSession };
