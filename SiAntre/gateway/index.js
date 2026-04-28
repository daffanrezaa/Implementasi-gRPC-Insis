'use strict';

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const path    = require('path');

const { initGrpcClients }    = require('./grpcClients');
const { initWsServer }       = require('./wsManager');
const { startStreamBridge }  = require('./streamBridge');
const { startPushScheduler } = require('./pushScheduler');

const PORT      = process.env.GATEWAY_PORT || 3001;
const GRPC_ADDR = process.env.GRPC_ADDR    || 'localhost:50051';

async function main() {
  console.log('[Gateway] Memulai SiAntre WebSocket Gateway...');

  // 1. Inisialisasi semua gRPC client stubs
  const clients = initGrpcClients(GRPC_ADDR);
  console.log('[Gateway] gRPC clients berhasil dibuat');

  // 2. Setup Express
  const app = express();

  // CORS agar frontend bisa diakses dari origin berbeda
  app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST'],
  }));
  app.use(express.json());

  // Serve frontend statis
  app.use(express.static(path.join(__dirname, '../frontend')));

  // Health check endpoint
  app.get('/health', (req, res) => res.json({
    status:    'ok',
    time:      new Date(),
    grpc_addr: GRPC_ADDR,
  }));

  // 3. Buat HTTP server (shared antara Express dan WebSocket)
  const server = http.createServer(app);

  // 4. Inisialisasi WebSocket server & command handler
  initWsServer(server, clients);
  console.log('[Gateway] WebSocket server siap');

  // 5. Mulai stream bridge (gRPC WatchQueue → broadcast ke browser)
  startStreamBridge(clients);
  console.log('[Gateway] Stream bridge aktif');

  // 6. Mulai push scheduler (server-initiated events)
  startPushScheduler(clients);
  console.log('[Gateway] Push scheduler aktif');

  // 7. Jalankan server
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║     SiAntre — WebSocket Gateway Aktif        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  HTTP  : http://localhost:${PORT}               ║`);
    console.log(`║  WS    : ws://localhost:${PORT}                 ║`);
    console.log('║  Warga : /index.html                        ║');
    console.log('║  Admin : /admin.html                        ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Gateway] Mematikan gateway...');
    server.close(() => process.exit(0));
  });
}

main().catch(err => {
  console.error('[Gateway] Fatal error:', err);
  process.exit(1);
});
