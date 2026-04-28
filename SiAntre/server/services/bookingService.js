// server/services/bookingService.js
// Implements BookingService — 4 Unary RPCs.
// ConfirmArrival has been removed — check-in is now done by officers via AdminService.CheckInCitizen

'use strict';

const { v4: uuidv4 } = require('uuid');
const { serviceStore, slotStore, bookingStore, queueStore } = require('../state');
const errors    = require('../helpers/errors');
const { broadcast } = require('../helpers/broadcast');
const {
  generateBookingCode,
  estimatedWait,
  isExpired,
} = require('../helpers/utils');

// ─── CreateBooking ────────────────────────────────────────────────────────────

function CreateBooking(call, callback) {
  try {
    const { citizen_id, citizen_name, service_id, slot_id } = call.request;

    if (!citizen_id || !citizen_name || !service_id || !slot_id) {
      return callback(errors.invalidArgument('citizen_id, citizen_name, service_id, dan slot_id wajib diisi.'));
    }

    const svc = serviceStore.get(service_id);
    if (!svc)         return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));
    if (!svc.is_open) return callback(errors.serviceClosed());

    const slot = slotStore.get(slot_id);
    if (!slot)                       return callback(errors.notFound('Slot tidak ditemukan.'));
    if (slot.status === 'FULL')      return callback(errors.slotNotAvailable());
    if (slot.booked_count >= slot.capacity) return callback(errors.slotNotAvailable());

    // Check if this slot is already in the past (check-in deadline expired)
    if (isExpired(slot.date, slot.time)) {
      return callback(errors.invalidArgument('Slot ini sudah tidak dapat dibooking (waktu check-in telah lewat).'));
    }

    // RULE: 1 citizen = 1 booking per session (cannot book 2 services at same time slot)
    if (bookingStore.hasActiveAtSlot(citizen_id, slot_id)) {
      return callback(errors.invalidArgument('Anda sudah memiliki booking aktif di sesi waktu yang sama. Satu warga hanya bisa booking di satu layanan per sesi.'));
    }

    const queue = queueStore.get(service_id);
    if (queue.quota_remaining <= 0) return callback(errors.quotaExhausted());

    // ── All checks passed → synchronous mutations ──
    const booked = slotStore.book(slot_id);
    if (!booked) return callback(errors.slotNotAvailable());

    queue.quota_remaining--;

    const booking = {
      booking_id:   uuidv4(),
      booking_code: generateBookingCode(svc.short_code),
      citizen_id,
      citizen_name,
      service_id,
      slot_id,
      slot_time:    slot.time,
      slot_date:    slot.date,
      queue_number: 0,
      status:       'BOOKED',
      created_at:   new Date().toISOString(),
    };
    bookingStore.set(booking.booking_id, booking);

    // Broadcast QUOTA_EXHAUSTED if quota just hit 0
    if (queue.quota_remaining === 0) {
      broadcast(service_id, {
        event_type:      'QUOTA_EXHAUSTED',
        service_id,
        current_number:  queue.current_number,
        total_waiting:   queue.waiting_list.length,
        quota_remaining: 0,
        message:         'Kuota hari ini telah habis. Tidak ada slot tersisa.',
      });
    }

    console.log(`[RPC] CreateBooking — ${citizen_name} → ${booking.booking_code} (${slot.date} ${slot.time}, layanan: ${svc.name})`);
    callback(null, {
      booking_id:   booking.booking_id,
      booking_code: booking.booking_code,
      slot_time:    slot.time,
      slot_date:    slot.date,
      status:       'BOOKED',
      message:      `Booking berhasil! Kode: ${booking.booking_code}. Tunjukkan kode ini ke petugas SAMSAT saat tiba. Hadir maks. 15 menit sebelum sesi ${slot.time}.`,
    });
  } catch (err) {
    console.error('[RPC] CreateBooking ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── CancelBooking ────────────────────────────────────────────────────────────

function CancelBooking(call, callback) {
  try {
    const { booking_code, citizen_id } = call.request;

    const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());
    if (!booking)                          return callback(errors.notFound(`Booking dengan kode '${booking_code}' tidak ditemukan.`));
    if (booking.citizen_id !== citizen_id) return callback(errors.permissionDenied());
    if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
      return callback(errors.bookingCancelled());
    }
    if (booking.status === 'DONE' || booking.status === 'CALLED') {
      return callback(errors.bookingNotPending());
    }

    // ── Synchronous mutations ──
    const queue = queueStore.get(booking.service_id);

    slotStore.release(booking.slot_id);
    if (queue) {
      queue.quota_remaining++;
      // Remove from waiting_list if already arrived
      if (booking.status === 'ARRIVED') {
        queue.waiting_list = queue.waiting_list.filter(n => n !== booking.queue_number);
      }
    }

    booking.status = 'CANCELLED';

    console.log(`[RPC] CancelBooking — ${citizen_id}, booking ${booking.booking_code}`);
    callback(null, {
      success: true,
      message: 'Booking berhasil dibatalkan. Slot telah dikembalikan dan dapat diambil warga lain.',
    });
  } catch (err) {
    console.error('[RPC] CancelBooking ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── GetMyBooking ─────────────────────────────────────────────────────────────

function GetMyBooking(call, callback) {
  try {
    const { citizen_id } = call.request;

    if (!citizen_id) return callback(errors.invalidArgument('citizen_id wajib diisi.'));

    const bookings = bookingStore.getByCitizen(citizen_id).map(b => {
      const svc = serviceStore.get(b.service_id);
      return {
        booking_id:   b.booking_id,
        booking_code: b.booking_code,
        service_name: svc ? svc.name : b.service_id,
        service_id:   b.service_id,
        slot_time:    b.slot_time,
        slot_date:    b.slot_date,
        status:       b.status,
        queue_number: b.queue_number || 0,
        created_at:   b.created_at,
      };
    });

    console.log(`[RPC] GetMyBooking — ${citizen_id} → ${bookings.length} booking`);
    callback(null, { bookings });
  } catch (err) {
    console.error('[RPC] GetMyBooking ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── RescheduleBooking ────────────────────────────────────────────────────────

function RescheduleBooking(call, callback) {
  try {
    const { booking_code, citizen_id, new_slot_id } = call.request;

    const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());
    if (!booking)                          return callback(errors.notFound(`Booking dengan kode '${booking_code}' tidak ditemukan.`));
    if (booking.citizen_id !== citizen_id) return callback(errors.permissionDenied());
    if (booking.status !== 'BOOKED')       return callback(errors.bookingNotPending());

    const newSlot = slotStore.get(new_slot_id);
    if (!newSlot)                        return callback(errors.notFound('Slot baru tidak ditemukan.'));
    if (newSlot.status === 'FULL')       return callback(errors.slotNotAvailable());
    if (newSlot.booked_count >= newSlot.capacity) return callback(errors.slotNotAvailable());

    if (isExpired(newSlot.date, newSlot.time)) {
      return callback(errors.invalidArgument('Slot baru sudah tidak dapat dibooking (waktu check-in telah lewat).'));
    }

    // Check if citizen already has another booking at the new slot time
    if (bookingStore.hasActiveAtSlot(citizen_id, new_slot_id) && new_slot_id !== booking.slot_id) {
      return callback(errors.invalidArgument('Anda sudah memiliki booking lain di sesi waktu tersebut.'));
    }

    // ── Atomic swap: release old slot, claim new slot ──
    slotStore.release(booking.slot_id);
    const booked = slotStore.book(new_slot_id);
    if (!booked) {
      // If somehow booking fails, re-claim old slot
      slotStore.book(booking.slot_id);
      return callback(errors.slotNotAvailable());
    }

    booking.slot_id   = new_slot_id;
    booking.slot_time = newSlot.time;
    booking.slot_date = newSlot.date;

    console.log(`[RPC] RescheduleBooking — ${citizen_id}, ${booking.booking_code} → ${newSlot.time} ${newSlot.date}`);
    callback(null, {
      success:       true,
      new_slot_time: newSlot.time,
      new_slot_date: newSlot.date,
      message:       `Jadwal berhasil diubah ke sesi ${newSlot.time} (${newSlot.date}). Hadir maks. 15 menit sebelum sesi.`,
    });
  } catch (err) {
    console.error('[RPC] RescheduleBooking ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  CreateBooking,
  CancelBooking,
  GetMyBooking,
  RescheduleBooking,
};
