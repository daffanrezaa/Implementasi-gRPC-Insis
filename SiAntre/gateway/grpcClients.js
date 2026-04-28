'use strict';

const grpc        = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path        = require('path');

const PROTO_DIR = path.join(__dirname, '../proto');

const LOADER_OPTIONS = {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
};

function loadProto(filename) {
  const packageDef = protoLoader.loadSync(
    path.join(PROTO_DIR, filename),
    LOADER_OPTIONS
  );
  return grpc.loadPackageDefinition(packageDef);
}

/**
 * Membuat semua gRPC client stubs.
 *
 * Semua file .proto SiAntre menggunakan `package siantre;`
 * Akses service via: proto.siantre.NamaService
 * Bukan: proto.NamaService  ← SALAH (akan error "is not a constructor")
 */
function initGrpcClients(grpcAddr) {
  const creds = grpc.credentials.createInsecure();

  const serviceInfoProto = loadProto('service_info.proto');
  const bookingProto     = loadProto('booking.proto');
  const queueProto       = loadProto('queue.proto');
  const adminProto       = loadProto('admin.proto');

  const clients = {
    serviceInfo: new serviceInfoProto.siantre.ServiceInfoService(grpcAddr, creds),
    booking:     new bookingProto.siantre.BookingService(grpcAddr, creds),
    queue:       new queueProto.siantre.QueueService(grpcAddr, creds),
    admin:       new adminProto.siantre.AdminService(grpcAddr, creds),
  };

  console.log('[GrpcClients] Semua stub berhasil dibuat (namespace: siantre.*)');
  return clients;
}

module.exports = { initGrpcClients };
