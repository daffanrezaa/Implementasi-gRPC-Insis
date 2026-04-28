'use strict';

const { broadcast } = require('./wsManager');

const intervals = [];

// ── Helper: Konversi is_open (boolean) → status string ───────────────────────

/**
 * serviceStore hanya menyimpan is_open (boolean).
 * ListServices mengembalikan { is_open: true/false }.
 * UI membutuhkan string "OPEN" / "PAUSED" / "CLOSED".
 */
function deriveServiceStatus(svc) {
  if (svc.is_open) return 'OPEN';
  if (svc.quota_remaining === 0) return 'CLOSED';
  return 'PAUSED';
}

function fetchServicesSnapshot(clients, callback) {
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err || !response) { callback(null); return; }

    const services = (response.services || []).map(s => ({
      service_id:      s.service_id,
      name:            s.name,
      short_code:      s.short_code,
      // Konversi is_open → status string
      status:          deriveServiceStatus(s),
      is_open:         s.is_open,
      quota_remaining: s.quota_remaining,
      daily_quota:     s.daily_quota,
      // waiting_count tidak tersedia dari ListServices — diisi null,
      // akan diupdate real-time dari QUEUE_UPDATE stream (total_waiting)
      waiting_count:   null,
    }));

    callback(services);
  });
}

// ── Initial Snapshot (dipanggil saat client baru connect) ─────────────────────

function sendInitialSnapshot(clients, ws) {
  const { sendToClient } = require('./wsManager');

  fetchServicesSnapshot(clients, (services) => {
    if (!services) return;
    sendToClient(ws, {
      type:    'SERVICES_STATUS_UPDATE',
      payload: { services, timestamp: new Date().toISOString() },
    });
  });

  clients.admin.GetSystemStats({}, (err, stats) => {
    if (err || !stats) return;
    sendToClient(ws, {
      type:    'STATS_PUSH',
      payload: {
        total_bookings_today:  stats.total_bookings_today,
        total_served_today:    stats.total_served_today,
        total_cancelled_today: stats.total_cancelled_today,
        active_subscribers:    stats.active_subscribers,
        per_service:           stats.per_service,
        timestamp:             new Date().toISOString(),
      },
    });
  });
}

// ── Scheduled Pushers ─────────────────────────────────────────────────────────

function startStatsPusher(clients, intervalMs = 5000) {
  console.log(`[PushScheduler] Stats pusher aktif (${intervalMs}ms)`);
  const handle = setInterval(() => {
    clients.admin.GetSystemStats({}, (err, stats) => {
      if (err || !stats) return;
      broadcast({
        type:    'STATS_PUSH',
        payload: {
          total_bookings_today:  stats.total_bookings_today,
          total_served_today:    stats.total_served_today,
          total_cancelled_today: stats.total_cancelled_today,
          active_subscribers:    stats.active_subscribers,
          per_service:           stats.per_service,
          timestamp:             new Date().toISOString(),
        },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

function startServiceStatusPusher(clients, intervalMs = 8000) {
  console.log(`[PushScheduler] Service status pusher aktif (${intervalMs}ms)`);
  const handle = setInterval(() => {
    fetchServicesSnapshot(clients, (services) => {
      if (!services) return;
      broadcast({
        type:    'SERVICES_STATUS_UPDATE',
        payload: { services, timestamp: new Date().toISOString() },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

/**
 * Cek dan push pengumuman baru.
 *
 * FIX dari FINAL guide:
 * - Proto Announcement sekarang punya field: id, message, service_id, timestamp
 * - Tidak perlu fallback latest.id || latest.announcement_id
 * - Ambil announcement terakhir (index terakhir, bukan index 0)
 */
function startAnnouncementPusher(clients, intervalMs = 12000) {
  console.log(`[PushScheduler] Announcement pusher aktif (${intervalMs}ms)`);
  let lastSeenId = null;

  const handle = setInterval(() => {
    clients.serviceInfo.GetAnnouncements({}, (err, response) => {
      if (err || !response?.announcements?.length) return;

      // Announcement terbaru ada di index terakhir (push order)
      const latest = response.announcements[response.announcements.length - 1];

      if (!latest.id || latest.id === lastSeenId) return;
      lastSeenId = latest.id;

      broadcast({
        type:    'NEW_ANNOUNCEMENT',
        payload: {
          id:         latest.id,
          title:      'Pengumuman',
          message:    latest.message || '',
          service_id: latest.service_id || null,
          timestamp:  latest.timestamp || new Date().toISOString(),
        },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

function startHeartbeat(intervalMs = 30000) {
  const handle = setInterval(() => {
    broadcast({ type: 'HEARTBEAT', payload: { timestamp: new Date().toISOString() } });
  }, intervalMs);
  intervals.push(handle);
}

function startPushScheduler(clients) {
  startStatsPusher(clients,         5000);
  startServiceStatusPusher(clients, 8000);
  startAnnouncementPusher(clients,  12000);
  startHeartbeat(30000);
}

function stopPushScheduler() {
  intervals.forEach(h => clearInterval(h));
  intervals.length = 0;
  console.log('[PushScheduler] Semua scheduler dihentikan.');
}

module.exports = { startPushScheduler, stopPushScheduler, sendInitialSnapshot };
