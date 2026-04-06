// server/index.js
// Entry point: load protos, register all 4 services, seed state, start server.
// Handles graceful shutdown on SIGINT/SIGTERM.

'use strict';

const grpc        = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path        = require('path');

const { seed }          = require('./helpers/seed');
const { broadcastAll }  = require('./helpers/broadcast');

const serviceInfoImpl = require('./services/serviceInfoService');
const bookingImpl     = require('./services/bookingService');
const queueImpl       = require('./services/queueService');
const adminImpl       = require('./services/adminService');

const PROTO_DIR = path.join(__dirname, '../proto');
const PORT      = process.env.PORT || '50051';

const LOADER_OPTIONS = {
  keepCase:  true,
  longs:     String,
  enums:     String,
  defaults:  true,
  oneofs:    true,
};

function loadProto(filename) {
  const def = protoLoader.loadSync(path.join(PROTO_DIR, filename), LOADER_OPTIONS);
  return grpc.loadPackageDefinition(def).siantre;
}

function main() {
  // Load all proto definitions
  const serviceInfoProto = loadProto('service_info.proto');
  const bookingProto     = loadProto('booking.proto');
  const queueProto       = loadProto('queue.proto');
  const adminProto       = loadProto('admin.proto');

  // Create gRPC server instance
  const server = new grpc.Server();

  // Register all services
  server.addService(serviceInfoProto.ServiceInfoService.service, serviceInfoImpl);
  server.addService(bookingProto.BookingService.service,         bookingImpl);
  server.addService(queueProto.QueueService.service,             queueImpl);
  server.addService(adminProto.AdminService.service,             adminImpl);

  // Seed in-memory state
  seed();

  // Bind and start
  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('[Server] Gagal bind port:', err.message);
        process.exit(1);
      }
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║      SiAntre — gRPC Server Aktif         ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║  Port    : ${port}                          ║`);
      console.log('║  Services: ServiceInfo, Booking,         ║');
      console.log('║            Queue, Admin                  ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
    }
  );

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  function shutdown(signal) {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

    // Notify all streaming clients before closing
    broadcastAll({
      event_type: 'SERVICE_CLOSED',
      message:    'Server sedang dimatikan. Koneksi akan ditutup.',
    });

    server.tryShutdown((err) => {
      if (err) {
        console.error('[Server] Shutdown error:', err.message);
        server.forceShutdown();
      } else {
        console.log('[Server] Shutdown selesai.');
      }
      process.exit(0);
    });

    // Force kill after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timeout — forcing exit.');
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
