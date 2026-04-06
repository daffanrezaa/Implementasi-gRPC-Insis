// server/state/slotStore.js
// Stores time slots (sessions) shared across all services.
//
// SAMSAT uses capacity-based slots:
// - 1 slot = 1 session (30 minutes)
// - 1 session = 4 capacity (4 general-purpose loket)
// - Loket assignments are NOT tracked — petugas decide at service time
//
// Slot ID format: "<YYYY-MM-DD>_<HHMM>"  e.g. "2026-04-07_0900"
// (No service_id in slot_id — slots are shared across all services)
//
// Slot shape:
// {
//   slot_id:      string,   // "YYYY-MM-DD_HHMM"
//   date:         string,   // "YYYY-MM-DD"
//   time:         string,   // "HH:MM"
//   capacity:     number,   // max bookings per session (default: 4)
//   booked_count: number,   // how many active bookings exist
//   status:       string,   // "AVAILABLE" | "FULL"
// }

'use strict';

const SLOT_CAPACITY = 4; // 4 general loket

// Map<slot_id, Slot>
const slots = new Map();

module.exports = {
  SLOT_CAPACITY,

  get:    (id)       => slots.get(id),
  set:    (id, slot) => slots.set(id, slot),
  has:    (id)       => slots.has(id),
  delete: (id)       => slots.delete(id),

  // Return all slots for a given date (shared across services)
  getByDate(date) {
    const result = [];
    for (const slot of slots.values()) {
      if (slot.date === date) result.push(slot);
    }
    return result.sort((a, b) => a.time.localeCompare(b.time));
  },

  // Return only AVAILABLE slots for a given date
  getAvailable(date) {
    return this.getByDate(date).filter(s => s.status === 'AVAILABLE');
  },

  // Return all slots for a specific date (each with capacity info)
  // Used by warga client to pick a session time
  getForService(service_id, date) {
    // Since slots are shared, all date slots are valid for any service
    return this.getByDate(date);
  },

  // Book one capacity unit in a slot
  // Returns true if successful, false if slot is full
  book(slot_id) {
    const slot = slots.get(slot_id);
    if (!slot) return false;
    if (slot.booked_count >= slot.capacity) return false;
    slot.booked_count++;
    if (slot.booked_count >= slot.capacity) {
      slot.status = 'FULL';
    }
    return true;
  },

  // Release one capacity unit (on cancel or expire)
  release(slot_id) {
    const slot = slots.get(slot_id);
    if (!slot) return false;
    if (slot.booked_count > 0) slot.booked_count--;
    if (slot.booked_count < slot.capacity) {
      slot.status = 'AVAILABLE';
    }
    return true;
  },
};
