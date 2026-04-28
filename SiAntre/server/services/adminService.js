// server/services/adminService.js
// Implements AdminService:
//   IsSystemInitialized — check if any officers exist
//   RegisterOfficer     — ADMIN-only: create a new officer account
//   LoginOfficer        — NIP+PIN auth
//   AdminSession        — Bi-directional streaming
//   ResetDailyQuota     — Unary
//   GetSystemStats      — Unary

'use strict';

const { serviceStore, slotStore, queueStore, bookingStore, officerStore, announcementStore } = require('../state');
const errors    = require('../helpers/errors');
const { broadcast, broadcastAll } = require('../helpers/broadcast');
const { generateTimeSlots, buildSlotId, todayStr, isOfficer, isWithinCheckinDeadline, estimatedWait } = require('../helpers/utils');
const { countPeopleAhead } = require('../helpers/broadcast');
const { v4: uuidv4 } = require('uuid');
const { generateBookingCode } = require('../helpers/utils');

// ─── IsSystemInitialized (Unary) ─────────────────────────────────────────────

function IsSystemInitialized(call, callback) {
  const initialized = officerStore.getAll().length > 0;
  console.log(`[RPC] IsSystemInitialized → ${initialized}`);
  callback(null, { initialized });
}

// ─── RegisterOfficer (Unary) ──────────────────────────────────────────────────

function RegisterOfficer(call, callback) {
  try {
    const { requester_id, requester_pin, id_pegawai, nama, jabatan, role, pin } = call.request;
    const idUp = (id_pegawai || '').trim().toUpperCase();

    // ── If system is empty, allow first-time ADMIN creation without auth ──
    const isFirstSetup = officerStore.getAll().length === 0;

    if (!isFirstSetup) {
      // Require valid ADMIN credentials
      if (!requester_id || !requester_pin) {
        return callback(errors.permissionDenied('Diperlukan autentikasi Admin untuk mendaftar petugas.'));
      }
      const reqId  = requester_id.toUpperCase();
      const req    = officerStore.get(reqId);
      if (!req || req.role !== 'ADMIN') {
        return callback(errors.permissionDenied('Hanya Admin yang dapat mendaftarkan akun petugas.'));
      }
      if (!officerStore.verifyPin(reqId, requester_pin)) {
        return callback(errors.permissionDenied('PIN Admin salah. Aksi ditolak.'));
      }
    }

    // Validate new officer fields
    if (!idUp || idUp.length < 2) {
      return callback(errors.invalidArgument('ID Pegawai minimal 2 karakter.'));
    }
    if (officerStore.has(idUp)) {
      return callback(errors.alreadyExists(`ID Pegawai '${idUp}' sudah digunakan.`));
    }
    if (!nama || nama.trim().length < 2) {
      return callback(errors.invalidArgument('Nama tidak boleh kosong.'));
    }
    if (!pin || pin.length < 6) {
      return callback(errors.invalidArgument('PIN minimal 6 digit.'));
    }
    if (!['PETUGAS', 'ADMIN'].includes((role || '').toUpperCase())) {
      return callback(errors.invalidArgument('Role harus PETUGAS atau ADMIN.'));
    }

    const officer_id = officerStore.register({
      id_pegawai: idUp,
      nama:       nama.trim(),
      jabatan:    (role || '').toUpperCase() === 'ADMIN' ? 'Administrator' : 'Petugas Loket',
      role:       role.toUpperCase(),
      pin,
    });

    const label = isFirstSetup ? 'Setup Awal' : `oleh ${requester_id}`;
    console.log(`[RPC] RegisterOfficer — ${idUp} (${role}) [${label}] → ${officer_id}`);
    callback(null, {
      success:    true,
      id_pegawai: idUp,
      message:    `Akun '${idUp}' (${nama.trim()}) berhasil didaftarkan.`,
      officer_id,
    });
  } catch (err) {
    console.error('[RPC] RegisterOfficer ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── ListOfficers (Unary) ─────────────────────────────────────────────────────

function ListOfficers(call, callback) {
  try {
    const { requester_id, requester_pin } = call.request;
    const reqId = (requester_id || '').toUpperCase();
    
    if (!officerStore.verifyPin(reqId, requester_pin)) {
      return callback(errors.permissionDenied('Autentikasi Admin gagal.'));
    }
    const admin = officerStore.get(reqId);
    if (!admin || admin.role !== 'ADMIN') {
      return callback(errors.permissionDenied('Hanya Admin yang dapat melihat daftar petugas.'));
    }

    const all = officerStore.getAll().map(o => ({
      id_pegawai: o.id_pegawai,
      nama: o.nama,
      jabatan: o.jabatan,
      role: o.role
    }));

    callback(null, { officers: all });
  } catch (err) {
    console.error('[RPC] ListOfficers ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── UpdateOfficer (Unary) ────────────────────────────────────────────────────

function UpdateOfficer(call, callback) {
  try {
    const { requester_id, requester_pin, id_pegawai, new_nama, new_jabatan, new_role, new_pin } = call.request;
    const reqId = (requester_id || '').toUpperCase();
    const targetId = (id_pegawai || '').toUpperCase();

    if (!officerStore.verifyPin(reqId, requester_pin)) {
      return callback(errors.permissionDenied('Autentikasi Admin gagal.'));
    }
    const admin = officerStore.get(reqId);
    if (!admin || admin.role !== 'ADMIN') {
      return callback(errors.permissionDenied('Hanya Admin yang dapat mengubah data petugas.'));
    }

    if (!officerStore.has(targetId)) {
      return callback(errors.notFound(`Petugas dengan ID '${targetId}' tidak ditemukan.`));
    }

    const updates = {};
    if (new_nama && new_nama.trim().length >= 2) updates.nama = new_nama.trim();
    if (new_role && ['PETUGAS', 'ADMIN'].includes(new_role.toUpperCase())) {
      updates.role = new_role.toUpperCase();
      updates.jabatan = updates.role === 'ADMIN' ? 'Administrator' : 'Petugas Loket';
    }
    if (new_pin && new_pin.trim().length >= 6) updates.pin = new_pin.trim();

    officerStore.update(targetId, updates);
    console.log(`[RPC] UpdateOfficer — target: ${targetId} by ${reqId}`);
    
    callback(null, { success: true, message: `Data petugas '${targetId}' berhasil diperbarui.` });
  } catch (err) {
    console.error('[RPC] UpdateOfficer ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── DeleteOfficer (Unary) ────────────────────────────────────────────────────

function DeleteOfficer(call, callback) {
  try {
    const { requester_id, requester_pin, id_pegawai } = call.request;
    const reqId = (requester_id || '').toUpperCase();
    const targetId = (id_pegawai || '').toUpperCase();

    if (!officerStore.verifyPin(reqId, requester_pin)) {
      return callback(errors.permissionDenied('Autentikasi Admin gagal.'));
    }
    const admin = officerStore.get(reqId);
    if (!admin || admin.role !== 'ADMIN') {
      return callback(errors.permissionDenied('Hanya Admin yang dapat menghapus data petugas.'));
    }

    if (!officerStore.has(targetId)) {
      return callback(errors.notFound(`Petugas dengan ID '${targetId}' tidak ditemukan.`));
    }
    
    if (reqId === targetId) {
      return callback(errors.invalidArgument('Admin tidak dapat menghapus akunnya sendiri.'));
    }

    officerStore.delete(targetId);
    console.log(`[RPC] DeleteOfficer — target: ${targetId} by ${reqId}`);
    
    callback(null, { success: true, message: `Akun petugas '${targetId}' berhasil dihapus.` });
  } catch (err) {
    console.error('[RPC] DeleteOfficer ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── LoginOfficer (Unary) ─────────────────────────────────────────────────────

function LoginOfficer(call, callback) {
  try {
    const { id_pegawai, pin } = call.request;

    if (!id_pegawai || id_pegawai.trim().length < 2) {
      return callback(errors.invalidArgument('ID Pegawai tidak boleh kosong.'));
    }
    if (!pin || pin.length < 4) {
      return callback(errors.invalidArgument('PIN minimal 4 digit.'));
    }

    const officer = officerStore.get(id_pegawai.toUpperCase());
    if (!officer) {
      return callback(errors.notFound('ID Pegawai tidak ditemukan dalam sistem.'));
    }

    if (!officerStore.verifyPin(id_pegawai.toUpperCase(), pin)) {
      return callback(errors.permissionDenied('PIN salah. Silakan coba lagi.'));
    }

    console.log(`[RPC] LoginOfficer — ${id_pegawai}, ${officer.nama} (${officer.role})`);
    callback(null, {
      success:    true,
      id_pegawai: officer.id_pegawai,
      nama:       officer.nama,
      jabatan:    officer.jabatan,
      role:       officer.role,
      message:    `Selamat datang, ${officer.nama} — ${officer.jabatan}.`,
      officer_id: officer.officer_id,
    });
  } catch (err) {
    console.error('[RPC] LoginOfficer ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── Shared logic (used by both BiDi and Unary) ───────────────────────────────

function callNextLogic(service_id, officer_id) {
  if (!isOfficer(officer_id)) throw errors.permissionDenied();

  const svc = serviceStore.get(service_id);
  if (!svc) throw errors.notFound(`Layanan '${service_id}' tidak ditemukan.`);

  const queue = queueStore.get(service_id);
  if (queue.waiting_list.length === 0) throw errors.queueEmpty();

  const calledNumber   = queue.waiting_list.shift();
  queue.current_number = calledNumber;

  // Mark booking as CALLED via queue index
  bookingStore.markCalled(service_id, calledNumber);

  const sentCount = broadcast(service_id, {
    event_type:      'QUEUE_MOVED',
    service_id,
    current_number:  calledNumber,
    total_waiting:   queue.waiting_list.length,
    quota_remaining: queue.quota_remaining,
    message:         `Nomor ${calledNumber} dipanggil.`,
  });

  return { called_number: calledNumber, total_waiting: queue.waiting_list.length, broadcast_count: sentCount };
}

function buildStatsPayload() {
  const perService = serviceStore.getAll().map(svc => {
    const queue = queueStore.get(svc.service_id);
    const used  = svc.daily_quota - (queue ? queue.quota_remaining : 0);
    return {
      service_id:      svc.service_id,
      service_name:    svc.name,
      quota_total:     svc.daily_quota,
      quota_used:      used,
      quota_remaining: queue ? queue.quota_remaining : 0,
      waiting_count:   queue ? queue.waiting_list.length : 0,
      current_number:  queue ? queue.current_number : 0,
      is_open:         svc.is_open,
    };
  });

  return {
    total_bookings_today:  bookingStore.countByStatus('BOOKED')
                         + bookingStore.countByStatus('ARRIVED')
                         + bookingStore.countByStatus('CALLED')
                         + bookingStore.countByStatus('DONE'),
    total_served_today:    bookingStore.countByStatus('DONE'),
    total_cancelled_today: bookingStore.countByStatus('CANCELLED'),
    active_subscribers:    queueStore.totalSubscribers(),
    per_service:           perService,
  };
}

// ─── AdminSession (Bi-Directional Streaming) ──────────────────────────────────

function AdminSession(call) {
  console.log('[BiDi] Admin session opened');

  call.on('data', (command) => {
    const { command_type, service_id, officer_id, payload } = command;
    console.log(`[BiDi] Command: ${command_type} | service: ${service_id} | officer: ${officer_id}`);

    try {
      if (!isOfficer(officer_id)) {
        call.write({
          event_type: 'ERROR',
          service_id: service_id || '',
          payload:    JSON.stringify({ message: 'Akses ditolak. Hanya petugas yang diizinkan.' }),
          timestamp:  new Date().toISOString(),
        });
        return;
      }

      switch (command_type) {

        case 'CALL_NEXT': {
          const result = callNextLogic(service_id, officer_id);
          call.write({
            event_type: 'QUEUE_UPDATE',
            service_id,
            payload:    JSON.stringify(result),
            timestamp:  new Date().toISOString(),
          });
          break;
        }

        case 'GET_STATS': {
          const stats = buildStatsPayload();
          call.write({
            event_type: 'STATS_SNAPSHOT',
            service_id: '',
            payload:    JSON.stringify(stats),
            timestamp:  new Date().toISOString(),
          });
          break;
        }

        case 'ANNOUNCE': {
          let data = {};
          try { data = JSON.parse(payload || '{}'); } catch {}
          const message = data.message || 'Pengumuman dari petugas.';

          let sentCount;
          if (service_id) {
            sentCount = broadcast(service_id, {
              event_type: 'ANNOUNCEMENT',
              service_id,
              message,
            });
            announcementStore.add(message, service_id);
          } else {
            sentCount = broadcastAll({ event_type: 'ANNOUNCEMENT', message });
            announcementStore.add(message);
          }

          call.write({
            event_type: 'ACK',
            service_id: service_id || 'ALL',
            payload:    JSON.stringify({ recipients_count: sentCount, message }),
            timestamp:  new Date().toISOString(),
          });
          break;
        }

        case 'PAUSE': {
          const svc = serviceStore.get(service_id);
          if (!svc) {
            call.write({ event_type: 'ERROR', service_id, payload: JSON.stringify({ message: 'Layanan tidak ditemukan.' }), timestamp: new Date().toISOString() });
            break;
          }
          svc.is_open = false;
          const sent = broadcast(service_id, {
            event_type: 'SERVICE_CLOSED',
            service_id,
            message:    `Layanan ${svc.name} ditutup sementara oleh petugas.`,
          });
          call.write({
            event_type: 'ACK',
            service_id,
            payload:    JSON.stringify({ message: `Layanan ${svc.name} dijeda. ${sent} warga diberitahu.` }),
            timestamp:  new Date().toISOString(),
          });
          break;
        }

        case 'RESUME': {
          const svc = serviceStore.get(service_id);
          if (!svc) {
            call.write({ event_type: 'ERROR', service_id, payload: JSON.stringify({ message: 'Layanan tidak ditemukan.' }), timestamp: new Date().toISOString() });
            break;
          }
          svc.is_open = true;
          const sent = broadcast(service_id, {
            event_type: 'SERVICE_RESUMED',
            service_id,
            message:    `Layanan ${svc.name} telah dibuka kembali.`,
          });
          call.write({
            event_type: 'ACK',
            service_id,
            payload:    JSON.stringify({ message: `Layanan ${svc.name} dilanjutkan. ${sent} warga diberitahu.` }),
            timestamp:  new Date().toISOString(),
          });
          break;
        }

        default:
          call.write({
            event_type: 'ERROR',
            service_id: service_id || '',
            payload:    JSON.stringify({ message: `Command tidak dikenal: '${command_type}'` }),
            timestamp:  new Date().toISOString(),
          });
      }
    } catch (err) {
      call.write({
        event_type: 'ERROR',
        service_id: service_id || '',
        payload:    JSON.stringify({ message: err.message }),
        timestamp:  new Date().toISOString(),
      });
    }
  });

  call.on('end', () => {
    console.log('[BiDi] Admin session closed');
    call.end();
  });

  call.on('error', (err) => {
    console.error('[BiDi] Admin session error:', err.message);
  });
}

// ─── ResetDailyQuota (Unary) ──────────────────────────────────────────────────

function ResetDailyQuota(call, callback) {
  try {
    const { service_id } = call.request;
    const today = todayStr();

    let servicesReset = 0;
    const targets = service_id ? [service_id] : serviceStore.getAll().map(s => s.service_id);

    for (const sid of targets) {
      const svc   = serviceStore.get(sid);
      const queue = queueStore.get(sid);
      if (!svc || !queue) continue;

      // Reset queue state
      queue.quota_remaining   = svc.daily_quota;
      queue.current_number    = 0;
      queue.next_queue_number = 1;
      queue.waiting_list      = [];

      // Re-generate shared slots for today (capacity-based)
      const times = generateTimeSlots('08:00', '14:00');
      for (const time of times) {
        const slot_id = buildSlotId(today, time);
        const existing = slotStore.get(slot_id);
        if (existing) {
          existing.booked_count = 0;
          existing.status = 'AVAILABLE';
        } else {
          slotStore.set(slot_id, {
            slot_id, date: today, time,
            capacity: 4, booked_count: 0, status: 'AVAILABLE',
          });
        }
      }

      // Re-open service
      svc.is_open = true;

      // Broadcast QUOTA_OPENED to all subscribers
      broadcast(sid, {
        event_type:      'QUOTA_OPENED',
        service_id:      sid,
        quota_remaining: svc.daily_quota,
        message:         `Kuota harian ${svc.name} telah direset. Slot tersedia: ${times.length}.`,
      });

      servicesReset++;
    }

    console.log(`[RPC] ResetDailyQuota — ${servicesReset} layanan direset`);
    callback(null, {
      success:        true,
      services_reset: servicesReset,
      message:        `${servicesReset} layanan berhasil direset. Kuota harian dibuka kembali.`,
    });
  } catch (err) {
    console.error('[RPC] ResetDailyQuota ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── GetSystemStats (Unary) ───────────────────────────────────────────────────

function GetSystemStats(call, callback) {
  try {
    console.log('[RPC] GetSystemStats');
    callback(null, buildStatsPayload());
  } catch (err) {
    console.error('[RPC] GetSystemStats ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── CheckInCitizen (Unary) ──────────────────────────────────────────────────

function CheckInCitizen(call, callback) {
  try {
    const { officer_id, booking_code } = call.request;

    if (!isOfficer(officer_id)) {
      return callback(errors.permissionDenied('Hanya petugas yang dapat melakukan check-in.'));
    }

    const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());
    if (!booking) {
      return callback(errors.notFound(`Kode booking '${booking_code}' tidak ditemukan.`));
    }

    if (booking.status === 'ARRIVED' || booking.status === 'CALLED') {
      return callback(errors.invalidArgument(`Warga sudah check-in (status: ${booking.status}).`));
    }
    if (booking.status === 'DONE') {
      return callback(errors.invalidArgument('Layanan untuk warga ini sudah selesai.'));
    }
    if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
      return callback(errors.invalidArgument(`Booking ini sudah ${booking.status === 'EXPIRED' ? 'kedaluwarsa' : 'dibatalkan'}.`));
    }
    if (booking.status !== 'BOOKED') {
      return callback(errors.invalidArgument(`Status booking tidak valid: ${booking.status}.`));
    }

    // Check check-in deadline: must arrive at least 15 minutes before session
    if (!isWithinCheckinDeadline(booking.slot_date, booking.slot_time)) {
      // Auto-expire this booking
      booking.status = 'EXPIRED';
      slotStore.release(booking.slot_id);
      const q = queueStore.get(booking.service_id);
      if (q) q.quota_remaining++;
      return callback(errors.invalidArgument(`Check-in ditolak: batas waktu check-in sesi ${booking.slot_time} sudah lewat. Booking telah diexpire.`));
    }

    // ── Assign queue number & mark ARRIVED ──
    const svc   = serviceStore.get(booking.service_id);
    const queue = queueStore.get(booking.service_id);
    if (!queue) return callback(errors.notFound('Antrian layanan tidak ditemukan.'));
    if (svc && !svc.is_open) return callback(errors.serviceClosed());

    const queueNumber = queue.next_queue_number++;
    booking.queue_number = queueNumber;
    booking.status       = 'ARRIVED';
    queue.waiting_list.push(queueNumber);

    bookingStore.indexQueue(booking.booking_id, booking.service_id, queueNumber);

    const peopleAhead = queue.waiting_list.indexOf(queueNumber);

    console.log(`[RPC] CheckInCitizen — ${officer_id} check-in ${booking_code} (${booking.citizen_name}) → Nomor ${queueNumber}`);
    callback(null, {
      queue_number:   queueNumber,
      citizen_name:   booking.citizen_name,
      service_name:   svc ? svc.name : booking.service_id,
      people_ahead:   peopleAhead,
      estimated_wait: estimatedWait(peopleAhead),
      message:        `Check-in berhasil! ${booking.citizen_name} — Nomor antrian ${queueNumber}. Ada ${peopleAhead} orang di depan.`,
    });
  } catch (err) {
    console.error('[RPC] CheckInCitizen ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── WalkInCitizen (Unary) ────────────────────────────────────────────────────

function WalkInCitizen(call, callback) {
  try {
    const { officer_id, citizen_name, service_id } = call.request;

    if (!isOfficer(officer_id)) {
      return callback(errors.permissionDenied('Hanya petugas yang dapat mendaftarkan walk-in.'));
    }
    if (!citizen_name || citizen_name.trim().length < 2) {
      return callback(errors.invalidArgument('Nama warga wajib diisi.'));
    }

    const svc = serviceStore.get(service_id);
    if (!svc) return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));
    if (!svc.is_open) return callback(errors.serviceClosed());

    const queue = queueStore.get(service_id);
    if (queue.quota_remaining <= 0) return callback(errors.quotaExhausted());

    // Find current session slot (based on current time)
    const now   = new Date();
    const hh    = String(now.getHours()).padStart(2, '0');
    const mm    = now.getMinutes() < 30 ? '00' : '30';
    const slotTime = `${hh}:${mm}`;
    const today = todayStr();
    const slot_id = buildSlotId(today, slotTime);

    const slot = slotStore.get(slot_id);
    if (!slot) {
      return callback(errors.invalidArgument('Tidak ada sesi aktif saat ini untuk walk-in.'));
    }
    if (slot.booked_count >= slot.capacity) {
      return callback(errors.slotNotAvailable());
    }

    // If slot time is outside service hours, reject
    if (slotTime < svc.open_hour || slotTime >= svc.close_hour) {
      return callback(errors.invalidArgument(`Walk-in tidak bisa dilakukan di luar jam operasional ${svc.open_hour}–${svc.close_hour}.`));
    }

    // ── Create walk-in booking + immediate check-in ──
    slotStore.book(slot_id);
    queue.quota_remaining--;

    const booking = {
      booking_id:   uuidv4(),
      booking_code: generateBookingCode(svc.short_code),
      citizen_id:   `WALKIN_${Date.now()}`,
      citizen_name: citizen_name.trim(),
      service_id,
      slot_id,
      slot_time:    slotTime,
      slot_date:    today,
      queue_number: 0,
      status:       'BOOKED',
      created_at:   new Date().toISOString(),
    };
    bookingStore.set(booking.booking_id, booking);

    // Immediately check-in (walk-in = arrived)
    const queueNumber = queue.next_queue_number++;
    booking.queue_number = queueNumber;
    booking.status       = 'ARRIVED';
    queue.waiting_list.push(queueNumber);
    bookingStore.indexQueue(booking.booking_id, service_id, queueNumber);

    const peopleAhead = queue.waiting_list.indexOf(queueNumber);

    console.log(`[RPC] WalkInCitizen — ${officer_id} daftarkan ${citizen_name.trim()} walk-in → Nomor ${queueNumber}`);
    callback(null, {
      queue_number: queueNumber,
      booking_code: booking.booking_code,
      people_ahead: peopleAhead,
      message:      `Walk-in berhasil! ${citizen_name.trim()} — Nomor antrian ${queueNumber}. Ada ${peopleAhead} orang di depan.`,
    });
  } catch (err) {
    console.error('[RPC] WalkInCitizen ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  IsSystemInitialized,
  RegisterOfficer,
  ListOfficers,
  UpdateOfficer,
  DeleteOfficer,
  LoginOfficer,
  AdminSession,
  ResetDailyQuota,
  GetSystemStats,
  CheckInCitizen,
  WalkInCitizen,
};
