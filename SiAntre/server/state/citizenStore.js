// server/state/citizenStore.js
// Stores registered citizens. NIK (16-digit) is the primary key.

'use strict';

// Map<nik, CitizenProfile>
// CitizenProfile: { nik, nama_lengkap, no_hp, alamat, registered_at }
const citizens = new Map();

module.exports = {
  get:    (nik)        => citizens.get(nik),
  set:    (nik, data)  => citizens.set(nik, data),
  has:    (nik)        => citizens.has(nik),
  getAll: ()           => Array.from(citizens.values()),
};
