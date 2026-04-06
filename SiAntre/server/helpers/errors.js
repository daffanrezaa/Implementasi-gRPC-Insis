// server/helpers/errors.js
// Centralized gRPC error factory.
// Usage: return callback(errors.notFound('Booking tidak ditemukan'));

'use strict';

const grpc = require('@grpc/grpc-js');

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const errors = {
  notFound:          (msg = 'Data tidak ditemukan') =>
    makeError(grpc.status.NOT_FOUND, msg),

  slotNotAvailable:  () =>
    makeError(grpc.status.RESOURCE_EXHAUSTED, 'Slot sudah tidak tersedia. Pilih slot lain.'),

  quotaExhausted:    () =>
    makeError(grpc.status.RESOURCE_EXHAUSTED, 'Kuota hari ini sudah habis. Coba hari berikutnya.'),

  alreadyConfirmed:  () =>
    makeError(grpc.status.FAILED_PRECONDITION, 'Kedatangan sudah dikonfirmasi sebelumnya.'),

  bookingCancelled:  () =>
    makeError(grpc.status.FAILED_PRECONDITION, 'Booking ini sudah dibatalkan.'),

  bookingNotPending: () =>
    makeError(grpc.status.FAILED_PRECONDITION, 'Booking tidak dalam status yang dapat diubah.'),

  queueEmpty:        () =>
    makeError(grpc.status.FAILED_PRECONDITION, 'Tidak ada nomor dalam antrian.'),

  serviceClosed:     () =>
    makeError(grpc.status.FAILED_PRECONDITION, 'Layanan sedang tutup sementara.'),

  alreadyExists:     (msg = 'Data sudah ada.') =>
    makeError(grpc.status.ALREADY_EXISTS, msg),

  permissionDenied:  (msg = 'Akses ditolak. Hanya petugas yang diizinkan.') =>
    makeError(grpc.status.PERMISSION_DENIED, msg),

  invalidArgument:   (msg = 'Argumen tidak valid.') =>
    makeError(grpc.status.INVALID_ARGUMENT, msg),

  internal:          (msg = 'Terjadi kesalahan internal.') =>
    makeError(grpc.status.INTERNAL, msg),
};

module.exports = errors;
