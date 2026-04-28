'use strict';

const { broadcast } = require('./wsManager');

const activeStreams = new Map();

/**
 * Subscribe ke WatchQueue stream untuk satu layanan.
 *
 * FIXES dari FINAL guide:
 * - field: my_queue_number (bukan queue_number)
 * - field: total_waiting (bukan waiting_count)
 * - YOUR_TURN: gateway subscribe sebagai observer (my_queue_number=0),
 *   server TIDAK kirim YOUR_TURN ke observer.
 *   Deteksi YOUR_TURN dilakukan client-side di ws-client.js.
 */
function subscribeToQueue(clients, serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;

  if (activeStreams.has(streamKey)) {
    console.log(`[StreamBridge] Stream ${streamKey} sudah aktif, skip.`);
    return;
  }

  console.log(`[StreamBridge] Subscribing ke WatchQueue: service=${serviceId}`);

  const stream = clients.queue.WatchQueue({
    service_id:      serviceId,
    citizen_id:      '',
    my_queue_number: queueNumber,  // FIX: was queue_number
  });

  stream.on('data', (update) => {
    console.log(`[StreamBridge] Event [${serviceId}]: ${update.event_type}`);

    const payload = {
      type:       'QUEUE_UPDATE',
      service_id: serviceId,
      payload: {
        event_type:      update.event_type,
        current_number:  update.current_number,
        your_number:     update.your_number,
        total_waiting:   update.total_waiting,   // FIX: was waiting_count
        people_ahead:    update.people_ahead,
        estimated_wait:  update.estimated_wait,
        quota_remaining: update.quota_remaining,
        message:         update.message,
        timestamp:       update.timestamp || new Date().toISOString(),
      },
    };

    // Gateway subscribe sebagai observer (my_queue_number=0)
    // Server TIDAK akan kirim YOUR_TURN ke observer
    // YOUR_TURN dideteksi di client-side (lihat frontend/js/ws-client.js)
    broadcast(payload);
  });

  stream.on('error', (err) => {
    console.error(`[StreamBridge] Error stream ${streamKey}:`, err.message);
    activeStreams.delete(streamKey);
    // Auto-reconnect setelah 5 detik
    setTimeout(() => subscribeToQueue(clients, serviceId, queueNumber), 5000);
  });

  stream.on('end', () => {
    console.log(`[StreamBridge] Stream ${streamKey} ended.`);
    activeStreams.delete(streamKey);
  });

  activeStreams.set(streamKey, stream);
}

function unsubscribeFromQueue(serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;
  const stream = activeStreams.get(streamKey);
  if (stream) {
    stream.cancel();
    activeStreams.delete(streamKey);
    console.log(`[StreamBridge] Stream ${streamKey} dihentikan.`);
  }
}

function startStreamBridge(clients) {
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err) {
      console.error('[StreamBridge] Gagal ambil daftar layanan:', err.message);
      console.log('[StreamBridge] Retry dalam 3 detik...');
      setTimeout(() => startStreamBridge(clients), 3000);
      return;
    }

    const services = response.services || [];
    console.log(`[StreamBridge] ${services.length} layanan ditemukan, memulai subscription...`);

    services.forEach(svc => subscribeToQueue(clients, svc.service_id));

    if (services.length === 0) {
      console.log('[StreamBridge] Belum ada layanan. Retry dalam 5 detik...');
      setTimeout(() => startStreamBridge(clients), 5000);
    }
  });
}

module.exports = { startStreamBridge, subscribeToQueue, unsubscribeFromQueue };
