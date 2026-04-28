// server/services/serviceInfoService.js
// Implements ServiceInfoService — 6 RPCs

'use strict';

const { serviceStore, slotStore, queueStore, citizenStore, announcementStore } = require('../state');
const errors  = require('../helpers/errors');
const { todayStr, isValidFutureDate, buildSlotId, isExpired } = require('../helpers/utils');

// ─── RegisterCitizen ──────────────────────────────────────────────────────────

function RegisterCitizen(call, callback) {
  try {
    const { nik, nama_lengkap, no_hp, alamat } = call.request;

    if (!nik || !/^\d{16}$/.test(nik)) {
      return callback(errors.invalidArgument('NIK harus terdiri dari 16 digit angka.'));
    }
    if (!nama_lengkap || nama_lengkap.trim().length < 2) {
      return callback(errors.invalidArgument('Nama lengkap wajib diisi (minimal 2 karakter).'));
    }

    if (citizenStore.has(nik)) {
      return callback(errors.invalidArgument('NIK sudah terdaftar. Silakan gunakan menu Masuk.'));
    }

    const citizen_id = citizenStore.generateCitizenId();
    citizenStore.set(nik, {
      nik,
      citizen_id,
      nama_lengkap: nama_lengkap.trim(),
      no_hp:        (no_hp || '').trim(),
      alamat:       (alamat || '').trim(),
      registered_at: new Date().toISOString(),
    });

    console.log(`[RPC] RegisterCitizen — NIK ${nik}, ${nama_lengkap.trim()} → ${citizen_id}`);
    callback(null, {
      success: true,
      nik,
      message: `Pendaftaran berhasil! Selamat datang, ${nama_lengkap.trim()}.`,
      citizen_id,
    });
  } catch (err) {
    console.error('[RPC] RegisterCitizen ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── LoginCitizen ─────────────────────────────────────────────────────────────

function LoginCitizen(call, callback) {
  try {
    const { nik } = call.request;

    if (!nik || !/^\d{16}$/.test(nik)) {
      return callback(errors.invalidArgument('NIK harus terdiri dari 16 digit angka.'));
    }

    const citizen = citizenStore.get(nik);
    if (!citizen) {
      return callback(errors.notFound('NIK tidak terdaftar. Silakan daftar terlebih dahulu.'));
    }

    console.log(`[RPC] LoginCitizen — NIK ${nik}, ${citizen.nama_lengkap}`);
    callback(null, {
      success:      true,
      nik:          citizen.nik,
      nama_lengkap: citizen.nama_lengkap,
      no_hp:        citizen.no_hp,
      alamat:       citizen.alamat,
      message:      `Selamat datang kembali, ${citizen.nama_lengkap}!`,
      citizen_id:   citizen.citizen_id,
    });
  } catch (err) {
    console.error('[RPC] LoginCitizen ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── ListServices ─────────────────────────────────────────────────────────────

function ListServices(call, callback) {
  try {
    const services = serviceStore.getAll().map(svc => {
      const queue = queueStore.get(svc.service_id);
      return {
        service_id:      svc.service_id,
        name:            svc.name,
        short_code:      svc.short_code,
        daily_quota:     svc.daily_quota,
        quota_remaining: queue ? queue.quota_remaining : 0,
        is_open:         svc.is_open,
        open_hour:       svc.open_hour,
        close_hour:      svc.close_hour,
        location:        svc.location,
      };
    });

    console.log(`[RPC] ListServices — ${services.length} layanan`);
    callback(null, { services, server_time: new Date().toISOString() });
  } catch (err) {
    console.error('[RPC] ListServices ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── GetServiceDetail ─────────────────────────────────────────────────────────

function GetServiceDetail(call, callback) {
  try {
    const { service_id } = call.request;

    const svc = serviceStore.get(service_id);
    if (!svc) return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));

    const queue = queueStore.get(service_id);

    console.log(`[RPC] GetServiceDetail — ${service_id}`);
    callback(null, {
      service_id:      svc.service_id,
      name:            svc.name,
      short_code:      svc.short_code,
      daily_quota:     svc.daily_quota,
      open_hour:       svc.open_hour,
      close_hour:      svc.close_hour,
      location:        svc.location,
      requirements:    svc.requirements,
      is_open:         svc.is_open,
      quota_remaining: queue ? queue.quota_remaining : 0,
    });
  } catch (err) {
    console.error('[RPC] GetServiceDetail ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── GetAvailableSlots ────────────────────────────────────────────────────────
// Returns slots for a given date. Slots are shared across services.
// We filter out FULL slots and slots whose check-in deadline has passed.

function GetAvailableSlots(call, callback) {
  try {
    const { service_id, date: rawDate } = call.request;
    const date = rawDate && rawDate.trim() ? rawDate.trim() : todayStr();

    if (!serviceStore.has(service_id)) {
      return callback(errors.notFound(`Layanan '${service_id}' tidak ditemukan.`));
    }

    if (!isValidFutureDate(date)) {
      return callback(errors.invalidArgument('Tanggal tidak valid atau sudah lewat.'));
    }

    // Get slots for this date; filter to service operating hours
    const svc = serviceStore.get(service_id);
    const allSlots = slotStore.getByDate(date);

    // Filter to within service operating hours, not FULL, and check-in deadline not passed
    const available = allSlots
      .filter(s => {
        if (s.status === 'FULL') return false;
        // Hide past/expired slots
        if (isExpired(s.date, s.time)) return false;
        // Check if slot time is within service hours
        return s.time >= svc.open_hour && s.time < svc.close_hour;
      })
      .map(s => ({
        slot_id:      s.slot_id,
        service_id,
        date:         s.date,
        time:         s.time,
        status:       s.status,
        capacity:     s.capacity,
        booked_count: s.booked_count,
        available:    s.capacity - s.booked_count,
      }));

    console.log(`[RPC] GetAvailableSlots — ${service_id} ${date} → ${available.length} slot tersedia`);
    callback(null, {
      service_id,
      date,
      slots:           available,
      total_available: available.length,
    });
  } catch (err) {
    console.error('[RPC] GetAvailableSlots ERROR:', err.message);
    callback(errors.internal());
  }
}

// ─── GetAnnouncements ─────────────────────────────────────────────────────────

function GetAnnouncements(call, callback) {
  try {
    const list = announcementStore.getAll();
    callback(null, { announcements: list });
  } catch (err) {
    console.error('[RPC] GetAnnouncements ERROR:', err.message);
    callback(errors.internal());
  }
}

module.exports = {
  RegisterCitizen,
  LoginCitizen,
  ListServices,
  GetServiceDetail,
  GetAvailableSlots,
  GetAnnouncements,
};
