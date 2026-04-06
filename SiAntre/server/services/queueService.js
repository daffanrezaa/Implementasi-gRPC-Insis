// server/services/queueService.js
// Implements QueueService:
//   WatchQueue     — Server-side streaming
//   GetQueueStatus — Unary snapshot
//   CallNext       — Unary, triggers broadcast to all subscribers

'use strict';

const { serviceStore, queueStore, bookingStore } = require('../state');
const errors    = require('../helpers/errors');
const { broadcast, countPeopleAhead } = require('../helpers/broadcast');
const { estimatedWait, isOfficer }    = require('../helpers/utils');

// ─── WatchQueue (Server-Side Streaming) ──────────────────────────────────────

function WatchQueue(call) {
  const { service_id, citizen_id, my_queue_number } = call.request;

  // Validate service exists
  const svc = serviceStore.get(service_id);
  if (!svc) {
    call.destroy(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));
    return;
  }

  const queue = queueStore.get(service_id);
  const peopleAhead = countPeopleAhead(queue.waiting_list, my_queue_number);

  // 1. Send immediate snapshot so client has current state
  try {
    call.write({
      event_type:      'QUEUE_MOVED',
      service_id,
      current_number:  queue.current_number,
      your_number:     my_queue_number || 0,
      people_ahead:    peopleAhead,
      total_waiting:   queue.waiting_list.length,
      estimated_wait:  estimatedWait(peopleAhead),
      quota_remaining: queue.quota_remaining,
      message:         `Terhubung ke antrian ${svc.name}. Nomor dilayani: ${queue.current_number || '-'}`,
      timestamp:       new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Stream] WatchQueue snapshot error for ${citizen_id}:`, err.message);
    return;
  }

  // 2. Register subscriber
  const subscriber = { citizen_id, my_queue_number: my_queue_number || 0, call };
  queue.subscribers.push(subscriber);
  console.log(`[Stream] ${citizen_id} subscribed to ${service_id} (total subs: ${queue.subscribers.length})`);

  // 3. Clean up on disconnect
  call.on('cancelled', () => {
    queue.subscribers = queue.subscribers.filter(s => s.citizen_id !== citizen_id);
    console.log(`[Stream] ${citizen_id} disconnected from ${service_id} (remaining: ${queue.subscribers.length})`);
  });

  call.on('error', (err) => {
    queue.subscribers = queue.subscribers.filter(s => s.citizen_id !== citizen_id);
    console.log(`[Stream] ${citizen_id} stream error on ${service_id}: ${err.message}`);
  });
}

// ─── GetQueueStatus (Unary) ───────────────────────────────────────────────────

function GetQueueStatus(call, callback) {
  try {
    const { service_id } = call.request;

    const svc = serviceStore.get(service_id);
    if (!svc) return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));

    const queue = queueStore.get(service_id);

    console.log(`[RPC] GetQueueStatus — ${service_id}`);
    callback(null, {
      service_id,
      service_name:    svc.name,
      current_number:  queue.current_number,
      total_waiting:   queue.waiting_list.length,
      quota_remaining: queue.quota_remaining,
      is_open:         svc.is_open,
      waiting_numbers: [...queue.waiting_list],
      timestamp:       new Date().toISOString(),
    });
  } catch (err) {
    console.error('[RPC] GetQueueStatus ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── CallNext (Unary + broadcast trigger) ────────────────────────────────────

function CallNext(call, callback) {
  try {
    const { service_id, officer_id } = call.request;

    if (!isOfficer(officer_id)) return callback(errors.permissionDenied());

    const svc = serviceStore.get(service_id);
    if (!svc) return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));

    const queue = queueStore.get(service_id);
    if (queue.waiting_list.length === 0) return callback(errors.queueEmpty());

    // ── Advance queue — synchronous ──
    const calledNumber = queue.waiting_list.shift();
    queue.current_number = calledNumber;

    // Mark matching booking as CALLED via queue index
    bookingStore.markCalled(service_id, calledNumber);

    // Broadcast to all subscribers
    const sentCount = broadcast(service_id, {
      event_type:      'QUEUE_MOVED',
      service_id,
      current_number:  calledNumber,
      total_waiting:   queue.waiting_list.length,
      quota_remaining: queue.quota_remaining,
      message:         `Nomor ${calledNumber} dipanggil. Sisa antrian: ${queue.waiting_list.length}.`,
    });

    console.log(`[RPC] CallNext — ${service_id}: nomor ${calledNumber} dipanggil | subs notified: ${sentCount}`);
    callback(null, {
      called_number:   calledNumber,
      total_waiting:   queue.waiting_list.length,
      broadcast_count: sentCount,
      message:         `Nomor ${calledNumber} berhasil dipanggil. ${sentCount} warga diberitahu.`,
    });
  } catch (err) {
    console.error('[RPC] CallNext ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = { WatchQueue, GetQueueStatus, CallNext };
