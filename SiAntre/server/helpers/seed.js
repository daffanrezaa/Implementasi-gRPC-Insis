// server/helpers/seed.js
// Seeds initial state on server startup:
// - 3 SAMSAT services (Pajak Tahunan, Perpanjang STNK, Buat STNK)
// - Shared time slots for today and tomorrow (capacity-based, 4 loket per 30-min session)
// - Demo citizens
// - Auto-cancel timer (runs every 60 seconds, expires overdue bookings)

'use strict';

const { serviceStore, slotStore, queueStore, citizenStore, bookingStore } = require('../state');
const { todayStr, generateTimeSlots, buildSlotId, isExpired } = require('./utils');
const { broadcast } = require('./broadcast');

const SLOT_CAPACITY = 4; // 4 general loket shared across ALL services

// SAMSAT Services
const SERVICES_DATA = [
  {
    service_id:   'PAJAK_TAHUNAN',
    name:         'Pembayaran Pajak Tahunan Kendaraan',
    short_code:   'PKB',
    daily_quota:  48,
    open_hour:    '08:00',
    close_hour:   '14:00',
    location:     'Kantor SAMSAT, Lantai 1, Loket 1–4',
    requirements: ['STNK Asli', 'KTP Pemilik Kendaraan', 'BPKB Asli (untuk pembayaran pertama)'],
  },
  {
    service_id:   'PERPANJANG_STNK',
    name:         'Perpanjangan STNK (Ganti Plat)',
    short_code:   'STNK',
    daily_quota:  48,
    open_hour:    '08:00',
    close_hour:   '14:00',
    location:     'Kantor SAMSAT, Lantai 1, Loket 1–4',
    requirements: ['STNK Asli', 'KTP Pemilik Kendaraan', 'BPKB Asli', 'Formulir Permohonan'],
  },
  {
    service_id:   'BUAT_STNK',
    name:         'Pembuatan STNK Baru',
    short_code:   'BSTNK',
    daily_quota:  32,
    open_hour:    '08:00',
    close_hour:   '12:00',
    location:     'Kantor SAMSAT, Lantai 2, Loket 1–4',
    requirements: ['BPKB Asli', 'KTP Pemilik Kendaraan', 'Faktur Pembelian Kendaraan', 'Hasil Cek Fisik Kendaraan'],
  },
];

// Generate shared slots for a date based on the WIDEST operating hours
// Slots are SHARED across all SAMSAT services (general loket)
function seedSharedSlotsForDate(date) {
  // Operating window: 08:00–14:00 (widest of all services)
  const times = generateTimeSlots('08:00', '14:00');
  for (const time of times) {
    const slot_id = buildSlotId(date, time);
    if (!slotStore.has(slot_id)) {
      slotStore.set(slot_id, {
        slot_id,
        date,
        time,
        capacity:     SLOT_CAPACITY,
        booked_count: 0,
        status:       'AVAILABLE',
      });
    }
  }
}

// Auto-cancel timer: runs every 60 seconds
// Cancels bookings where warga failed to check in before 15 min before session
function startAutoCancelTimer() {
  setInterval(() => {
    const booked = bookingStore.getAllBooked();
    let cancelledCount = 0;

    for (const booking of booked) {
      if (isExpired(booking.slot_date, booking.slot_time)) {
        // Auto-expire this booking
        booking.status = 'EXPIRED';
        slotStore.release(booking.slot_id);

        // Return quota to service queue
        const queue = queueStore.get(booking.service_id);
        if (queue) queue.quota_remaining++;

        // Broadcast slot availability restored
        broadcast(booking.service_id, {
          event_type:      'QUOTA_OPENED',
          service_id:      booking.service_id,
          message:         `Satu slot ${booking.slot_time} dikembalikan (booking expired).`,
        });

        cancelledCount++;
        console.log(`[AutoCancel] Booking ${booking.booking_code} (${booking.citizen_name}) expired — sesi ${booking.slot_time} ${booking.slot_date}`);
      }
    }

    if (cancelledCount > 0) {
      console.log(`[AutoCancel] ${cancelledCount} booking(s) di-expire otomatis`);
    }
  }, 60 * 1000); // setiap 60 detik
}

function seed() {
  const today    = todayStr();
  const d        = new Date(today);
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);

  // Seed SAMSAT services + their individual queues
  for (const svc of SERVICES_DATA) {
    serviceStore.set(svc.service_id, { ...svc, is_open: true });

    queueStore.set(svc.service_id, {
      service_id:        svc.service_id,
      current_number:    0,
      next_queue_number: 1,
      waiting_list:      [],
      quota_remaining:   svc.daily_quota,
      subscribers:       [],
    });
  }

  // Seed SHARED slots (date-only, no service_id) for today and tomorrow
  seedSharedSlotsForDate(today);
  seedSharedSlotsForDate(tomorrow);

  // Seed demo citizens
  const CITIZENS = [
    { nik: '3201234567890001', nama_lengkap: 'Budi Santoso',   no_hp: '081234567890', alamat: 'Jl. Merdeka No. 10, Jakarta' },
    { nik: '3201234567890002', nama_lengkap: 'Siti Rahayu',    no_hp: '082345678901', alamat: 'Jl. Sudirman No. 25, Bandung' },
    { nik: '3201234567890003', nama_lengkap: 'Ahmad Fauzi',    no_hp: '083456789012', alamat: 'Jl. Diponegoro No. 5, Surabaya' },
  ];
  for (const c of CITIZENS) {
    citizenStore.set(c.nik, { ...c, registered_at: new Date().toISOString() });
  }

  const slotCount = generateTimeSlots('08:00', '14:00').length * 2; // today + tomorrow
  console.log(`[Seed] ✓ ${SERVICES_DATA.length} layanan SAMSAT dimuat`);
  console.log(`[Seed] ✓ ${slotCount} shared slot dibuat (${today}, ${tomorrow})`);
  console.log(`[Seed] ✓ ${CITIZENS.length} warga demo terdaftar`);
  console.log(`[Seed] ✓ Auto-cancel timer aktif (cek tiap 60 detik)`);
  // Officers are intentionally NOT seeded to demonstrate the Setup Awal flow

  // Start auto-cancel background timer
  startAutoCancelTimer();
}

module.exports = { seed };
