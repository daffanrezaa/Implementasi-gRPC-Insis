// server/state/officerStore.js
// Stores registered officers. ID Pegawai (short, e.g. P001) is the primary key.
// PIN is SHA-256 hashed.

'use strict';

const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

// Map<id_pegawai, OfficerProfile>
const officers = new Map();

module.exports = {
  get:    (id) => officers.get(id),
  has:    (id) => officers.has(id),
  getAll: ()   => Array.from(officers.values()),
  hashPin,

  register(data) {
    officers.set(data.id_pegawai, {
      id_pegawai:    data.id_pegawai,
      nama:          data.nama,
      jabatan:       data.jabatan,
      role:          data.role,
      pin_hash:      hashPin(data.pin),
      registered_at: new Date().toISOString(),
    });
  },

  verifyPin(id_pegawai, pin) {
    const o = officers.get(id_pegawai);
    if (!o) return false;
    return o.pin_hash === hashPin(pin);
  },

  isRegistered(id_pegawai) {
    return officers.has(id_pegawai);
  },

  update(id_pegawai, updates) {
    const o = officers.get(id_pegawai);
    if (!o) return false;
    if (updates.nama) o.nama = updates.nama;
    if (updates.jabatan) o.jabatan = updates.jabatan;
    if (updates.role) o.role = updates.role;
    if (updates.pin) o.pin_hash = hashPin(updates.pin);
    return true;
  },

  delete(id_pegawai) {
    return officers.delete(id_pegawai);
  }
};
