// server/state/bookingStore.js
// Stores all citizen bookings.
//
// Booking shape:
// {
//   booking_id:   string,   // uuid
//   booking_code: string,   // e.g. "PKB-A3F7"
//   citizen_id:   string,   // NIK
//   citizen_name: string,
//   service_id:   string,
//   slot_id:      string,   // "YYYY-MM-DD_HHMM" (shared slot)
//   slot_time:    string,   // "HH:MM"
//   slot_date:    string,   // "YYYY-MM-DD"
//   queue_number: number,   // assigned on check-in (0 = not yet checked in)
//   status:       string,   // BOOKED | ARRIVED | CALLED | DONE | CANCELLED | EXPIRED
//   created_at:   string,
// }

'use strict';

const bookings     = new Map();  // Map<booking_id, Booking>
const citizenIndex = new Map();  // Map<citizen_id, Set<booking_id>>
const codeIndex    = new Map();  // Map<booking_code, booking_id>
const queueIndex   = new Map();  // Map<"service_id:queue_number", booking_id>

module.exports = {
  get: (id) => bookings.get(id),
  has: (id) => bookings.has(id),

  set(id, booking) {
    bookings.set(id, booking);
    // citizen index
    if (!citizenIndex.has(booking.citizen_id)) citizenIndex.set(booking.citizen_id, new Set());
    citizenIndex.get(booking.citizen_id).add(id);
    // code index
    if (booking.booking_code) codeIndex.set(booking.booking_code, id);
  },

  // Look up booking by booking_code (used by officer check-in)
  getByCode(booking_code) {
    const id = codeIndex.get(booking_code);
    return id ? bookings.get(id) : null;
  },

  // Check if citizen already has an active booking (BOOKED or ARRIVED) at a given slot
  hasActiveAtSlot(citizen_id, slot_id) {
    const ids = citizenIndex.get(citizen_id);
    if (!ids) return false;
    for (const id of ids) {
      const b = bookings.get(id);
      if (b && b.slot_id === slot_id && (b.status === 'BOOKED' || b.status === 'ARRIVED')) {
        return true;
      }
    }
    return false;
  },

  // Called after CheckInCitizen assigns a queue_number
  indexQueue(booking_id, service_id, queue_number) {
    const key = `${service_id}:${queue_number}`;
    queueIndex.set(key, booking_id);
  },

  // Called by CallNext to mark booking as CALLED
  markCalled(service_id, queue_number) {
    const key     = `${service_id}:${queue_number}`;
    const bkId    = queueIndex.get(key);
    if (!bkId) return;
    const booking = bookings.get(bkId);
    if (booking && booking.status === 'ARRIVED') {
      booking.status = 'CALLED';
    }
  },

  getByCitizen(citizen_id) {
    const ids = citizenIndex.get(citizen_id);
    if (!ids) return [];
    return Array.from(ids).map(id => bookings.get(id)).filter(Boolean);
  },

  // Return all bookings with status BOOKED (for auto-cancel scanner)
  getAllBooked() {
    const result = [];
    for (const b of bookings.values()) {
      if (b.status === 'BOOKED') result.push(b);
    }
    return result;
  },

  countByStatus(status) {
    let n = 0;
    for (const b of bookings.values()) { if (b.status === status) n++; }
    return n;
  },
};
