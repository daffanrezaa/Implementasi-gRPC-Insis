// server/state/citizenStore.js
// Stores registered citizens. NIK (16-digit) is the primary key.
// citizen_id is a system-generated unique ID (e.g. "CIT-0001").

'use strict';

// Map<nik, CitizenProfile>
// CitizenProfile: { nik, citizen_id, nama_lengkap, no_hp, alamat, registered_at }
const citizens = new Map();

let citizenCounter = 0;

function generateCitizenId() {
  citizenCounter++;
  return `CIT-${String(citizenCounter).padStart(4, '0')}`;
}

module.exports = {
  get:    (nik)        => citizens.get(nik),
  set:    (nik, data)  => citizens.set(nik, data),
  has:    (nik)        => citizens.has(nik),
  getAll: ()           => Array.from(citizens.values()),
  generateCitizenId,
};
