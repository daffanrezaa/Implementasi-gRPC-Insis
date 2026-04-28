# SiAntre — Frontend & WebSocket Implementation Guide

> Panduan lengkap integrasi WebSocket Gateway + Web UI untuk sistem antrian SiAntre berbasis gRPC

---

## Daftar Isi

1. [Gambaran Arsitektur](#1-gambaran-arsitektur)
2. [Prasyarat & Setup Awal](#2-prasyarat--setup-awal)
3. [Struktur Direktori Akhir](#3-struktur-direktori-akhir)
4. [Tahap 1 — WebSocket Gateway](#4-tahap-1--websocket-gateway)
   - [4.1 Inisialisasi Project Gateway](#41-inisialisasi-project-gateway)
   - [4.2 Entry Point Gateway](#42-entry-point-gateway)
   - [4.3 gRPC Client Manager](#43-grpc-client-manager)
   - [4.4 Stream Bridge (gRPC → WebSocket)](#44-stream-bridge-grpc--websocket)
   - [4.5 Command Handler (WebSocket → gRPC)](#45-command-handler-websocket--grpc)
   - [4.6 Push Scheduler (Server-Initiated Events)](#46-push-scheduler-server-initiated-events)
   - [4.7 WebSocket Server Manager](#47-websocket-server-manager)
5. [Tahap 2 — Frontend Web UI](#5-tahap-2--frontend-web-ui)
   - [5.1 Struktur HTML Utama](#51-struktur-html-utama)
   - [5.2 Stylesheet](#52-stylesheet)
   - [5.3 WebSocket Client & State Management](#53-websocket-client--state-management)
   - [5.4 Komponen: Grafik Antrian Live](#54-komponen-grafik-antrian-live)
   - [5.5 Komponen: Activity Log](#55-komponen-activity-log)
   - [5.6 Komponen: Status Indikator Layanan](#56-komponen-status-indikator-layanan)
   - [5.7 Komponen: Notifikasi & Alert](#57-komponen-notifikasi--alert)
   - [5.8 Halaman Warga](#58-halaman-warga)
   - [5.9 Halaman Admin](#59-halaman-admin)
6. [Protokol Pesan WebSocket](#6-protokol-pesan-websocket)
7. [Mapping Fitur Tugas ke Implementasi](#7-mapping-fitur-tugas-ke-implementasi)
8. [Cara Menjalankan Sistem Lengkap](#8-cara-menjalankan-sistem-lengkap)
9. [Troubleshooting](#9-troubleshooting)
10. [Referensi & Dependensi](#10-referensi--dependensi)

---

## 1. Gambaran Arsitektur

Browser tidak bisa berbicara langsung dengan gRPC server karena gRPC menggunakan HTTP/2 dengan binary framing yang tidak didukung natively oleh browser. Solusinya adalah sebuah **WebSocket Gateway** — proses Node.js tambahan yang bertindak sebagai jembatan.

```
┌────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Port 3001)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────────┐ │
│  │  Grafik      │  │ Activity Log │  │  Status    │  │   Panel     │ │
│  │  Antrian     │  │  (Event Feed)│  │  Indikator │  │   Admin     │ │
│  │  (Chart.js)  │  │              │  │  per Svc   │  │  (Commands) │ │
│  └──────────────┘  └──────────────┘  └────────────┘  └─────────────┘ │
│                          │  WebSocket API (built-in)  │               │
└──────────────────────────┼────────────────────────────┼───────────────┘
                           │ ws://localhost:3001         │
                           ▼                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET GATEWAY (Port 3001)                      │
│                         gateway/index.js                              │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  WS Server      │  │  Stream Bridge   │  │  Push Scheduler      │ │
│  │  (ws library)   │  │  gRPC → WS fanout│  │  Server-initiated    │ │
│  │  Client manager │  │  WatchQueue sub  │  │  events (stats, etc) │ │
│  └─────────────────┘  └──────────────────┘  └──────────────────────┘ │
│  ┌─────────────────┐  ┌──────────────────┐                           │
│  │  Command Handler│  │  gRPC Clients    │                           │
│  │  WS → gRPC call │  │  (stubs per svc) │                           │
│  └─────────────────┘  └──────────────────┘                           │
│                          │ @grpc/grpc-js                              │
└──────────────────────────┼────────────────────────────────────────────┘
                           │ localhost:50051
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       GRPC SERVER (Port 50051)                        │
│                    SiAntre — server/index.js                          │
│  ServiceInfoService │ BookingService │ QueueService │ AdminService    │
└──────────────────────────────────────────────────────────────────────┘
```

### Alur Data per Fitur Tugas

| Fitur | Arah Data | Komponen yang Terlibat |
|-------|-----------|----------------------|
| Streaming gRPC → WebSocket | Server → Gateway → Browser | `WatchQueue` stream, Stream Bridge, grafik |
| Event-Driven UI (3 komponen) | Server → Browser | Grafik, Log, Status Badge |
| Server-Initiated Events | Gateway → Browser (tanpa request) | Push Scheduler, notifikasi alert |
| Command & Control Bridge | Browser → Gateway → gRPC | Panel admin, Command Handler, AdminSession |

---

## 2. Prasyarat & Setup Awal

### Prasyarat Sistem

- **Node.js** v18 atau lebih baru
- **npm** v8+
- gRPC server SiAntre sudah bisa dijalankan (`npm run server`)
- Browser modern (Chrome, Firefox, Edge)

### Verifikasi gRPC Server Berjalan

Sebelum membangun gateway, pastikan server lama sudah berjalan:

```bash
cd SiAntre
npm run server
# Pastikan muncul: gRPC server running on 0.0.0.0:50051
```

---

## 3. Struktur Direktori Akhir

Setelah implementasi selesai, struktur proyek akan terlihat seperti ini:

```
SiAntre/
├── proto/                          # Tidak diubah
│   ├── admin.proto
│   ├── booking.proto
│   ├── queue.proto
│   └── service_info.proto
│
├── server/                         # Tidak diubah
│   ├── index.js
│   ├── services/
│   ├── state/
│   └── helpers/
│
├── client/                         # Tidak diubah (CLI lama)
│   ├── warga.js
│   └── admin.js
│
├── gateway/                        # BARU — WebSocket Bridge
│   ├── package.json
│   ├── index.js                    # Entry point gateway
│   ├── grpcClients.js              # Inisialisasi semua gRPC stubs
│   ├── streamBridge.js             # gRPC stream → WS broadcast
│   ├── commandHandler.js           # WS command → gRPC call
│   ├── pushScheduler.js            # Server-initiated events
│   └── wsManager.js                # WebSocket server & client registry
│
└── frontend/                       # BARU — Web UI
    ├── index.html                  # Halaman utama (warga)
    ├── admin.html                  # Halaman admin
    ├── css/
    │   └── style.css               # Stylesheet global
    └── js/
        ├── ws-client.js            # WebSocket client & event router
        ├── chart.js                # Grafik antrian (Chart.js)
        ├── activity-log.js         # Komponen log aktivitas
        ├── status-indicator.js     # Badge status layanan
        ├── notification.js         # Toast notification & alert
        ├── warga.js                # Logic halaman warga
        └── admin.js                # Logic halaman admin
```

---

## 4. Tahap 1 — WebSocket Gateway

Gateway adalah proses Node.js terpisah yang berjalan di port **3001**. Tugasnya:
1. Menerima koneksi WebSocket dari browser
2. Menjaga koneksi gRPC ke server SiAntre
3. Meneruskan event gRPC ke semua browser yang terhubung
4. Menerjemahkan perintah dari browser menjadi panggilan gRPC

### 4.1 Inisialisasi Project Gateway

```bash
# Dari root proyek SiAntre
mkdir gateway
cd gateway
npm init -y
npm install ws express @grpc/grpc-js @grpc/proto-loader
```

Edit `gateway/package.json` dan tambahkan script:

```json
{
  "name": "siantre-gateway",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.10.0",
    "@grpc/proto-loader": "^0.7.0",
    "express": "^4.18.0",
    "ws": "^8.16.0"
  }
}
```

---

### 4.2 Entry Point Gateway

**File: `gateway/index.js`**

Ini adalah file utama yang mengorkestrasi semua modul gateway.

```javascript
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');

const { initGrpcClients } = require('./grpcClients');
const { initWsServer } = require('./wsManager');
const { startStreamBridge } = require('./streamBridge');
const { startPushScheduler } = require('./pushScheduler');

const PORT = process.env.GATEWAY_PORT || 3001;
const GRPC_ADDR = process.env.GRPC_ADDR || 'localhost:50051';

async function main() {
  console.log('[Gateway] Memulai SiAntre WebSocket Gateway...');

  // 1. Inisialisasi semua gRPC client stubs
  const clients = initGrpcClients(GRPC_ADDR);
  console.log('[Gateway] gRPC clients berhasil dibuat');

  // 2. Setup Express untuk serve frontend statis
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../frontend')));

  // Health check endpoint
  app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

  // 3. Buat HTTP server (WebSocket akan di-attach ke sini)
  const server = http.createServer(app);

  // 4. Inisialisasi WebSocket server & command handler
  initWsServer(server, clients);
  console.log('[Gateway] WebSocket server siap');

  // 5. Mulai stream bridge — subscribe ke gRPC streams
  startStreamBridge(clients);
  console.log('[Gateway] Stream bridge aktif');

  // 6. Mulai push scheduler — server-initiated events
  startPushScheduler(clients);
  console.log('[Gateway] Push scheduler aktif');

  // 7. Jalankan server
  server.listen(PORT, () => {
    console.log(`[Gateway] Berjalan di http://localhost:${PORT}`);
    console.log(`[Gateway] WebSocket tersedia di ws://localhost:${PORT}`);
    console.log(`[Gateway] Frontend tersedia di http://localhost:${PORT}/index.html`);
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
```

---

### 4.3 gRPC Client Manager

**File: `gateway/grpcClients.js`**

Membuat semua gRPC stubs yang dibutuhkan untuk berkomunikasi dengan SiAntre server.

```javascript
'use strict';

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Path ke direktori proto (relatif dari gateway/)
const PROTO_DIR = path.join(__dirname, '../proto');

const LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

function loadProto(filename) {
  const protoPath = path.join(PROTO_DIR, filename);
  const packageDef = protoLoader.loadSync(protoPath, LOADER_OPTIONS);
  return grpc.loadPackageDefinition(packageDef);
}

function initGrpcClients(grpcAddr) {
  const creds = grpc.credentials.createInsecure();

  // Load semua proto
  const serviceInfoProto = loadProto('service_info.proto');
  const bookingProto = loadProto('booking.proto');
  const queueProto = loadProto('queue.proto');
  const adminProto = loadProto('admin.proto');

  // Buat stub untuk setiap service
  // CATATAN: Sesuaikan nama package dengan definisi di file .proto masing-masing
  const clients = {
    serviceInfo: new serviceInfoProto.ServiceInfoService(grpcAddr, creds),
    booking: new bookingProto.BookingService(grpcAddr, creds),
    queue: new queueProto.QueueService(grpcAddr, creds),
    admin: new adminProto.AdminService(grpcAddr, creds),
  };

  return clients;
}

module.exports = { initGrpcClients };
```

> **Catatan Penting:** Nama package di atas (`serviceInfoProto.ServiceInfoService`, dll.) harus disesuaikan dengan nama yang terdefinisi di masing-masing file `.proto`. Cek baris `package` dan `service` di setiap file proto untuk memastikan namespace-nya benar.

---

### 4.4 Stream Bridge (gRPC → WebSocket)

**File: `gateway/streamBridge.js`**

Ini adalah implementasi **Fitur Wajib 1**: menghubungkan gRPC streaming ke WebSocket. Stream bridge subscribe ke `WatchQueue` dan mem-forward setiap event ke semua browser yang terhubung.

```javascript
'use strict';

const { broadcast } = require('./wsManager');

// Registry stream yang aktif: { streamKey -> grpc.ClientReadableStream }
const activeStreams = new Map();

/**
 * Subscribe ke WatchQueue untuk service_id tertentu.
 * Setiap event yang diterima akan di-broadcast ke semua WS client.
 *
 * @param {object} clients - gRPC client stubs
 * @param {string} serviceId - ID layanan yang akan di-watch
 * @param {number} queueNumber - 0 berarti watch semua nomor antrian
 */
function subscribeToQueue(clients, serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;

  // Hindari duplikat subscription
  if (activeStreams.has(streamKey)) {
    console.log(`[StreamBridge] Stream ${streamKey} sudah aktif, skip.`);
    return;
  }

  console.log(`[StreamBridge] Subscribing ke WatchQueue untuk service: ${serviceId}`);

  const stream = clients.queue.WatchQueue({
    service_id: serviceId,
    queue_number: queueNumber,
  });

  stream.on('data', (update) => {
    console.log(`[StreamBridge] Event dari WatchQueue [${serviceId}]:`, update.event_type);

    // Forward event ke semua browser via WebSocket
    broadcast({
      type: 'QUEUE_UPDATE',
      service_id: serviceId,
      payload: {
        event_type: update.event_type,         // QUEUE_MOVED, YOUR_TURN, SERVICE_CLOSED, dll.
        current_number: update.current_number,
        your_number: update.your_number,
        waiting_count: update.waiting_count,
        message: update.message,
        timestamp: new Date().toISOString(),
      },
    });
  });

  stream.on('error', (err) => {
    console.error(`[StreamBridge] Error pada stream ${streamKey}:`, err.message);
    activeStreams.delete(streamKey);

    // Auto-reconnect setelah 5 detik jika server masih berjalan
    setTimeout(() => {
      console.log(`[StreamBridge] Mencoba reconnect stream ${streamKey}...`);
      subscribeToQueue(clients, serviceId, queueNumber);
    }, 5000);
  });

  stream.on('end', () => {
    console.log(`[StreamBridge] Stream ${streamKey} berakhir.`);
    activeStreams.delete(streamKey);
  });

  activeStreams.set(streamKey, stream);
}

/**
 * Hentikan subscription untuk service tertentu.
 */
function unsubscribeFromQueue(serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;
  const stream = activeStreams.get(streamKey);
  if (stream) {
    stream.cancel();
    activeStreams.delete(streamKey);
    console.log(`[StreamBridge] Stream ${streamKey} dihentikan.`);
  }
}

/**
 * Entry point: ambil daftar semua layanan dari gRPC, lalu subscribe ke semuanya.
 * Dipanggil sekali saat gateway start.
 */
function startStreamBridge(clients) {
  // Pertama, ambil daftar semua layanan yang tersedia
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err) {
      console.error('[StreamBridge] Gagal mengambil daftar layanan:', err.message);
      console.log('[StreamBridge] Mencoba ulang dalam 3 detik...');
      setTimeout(() => startStreamBridge(clients), 3000);
      return;
    }

    const services = response.services || [];
    console.log(`[StreamBridge] Ditemukan ${services.length} layanan, memulai subscription...`);

    services.forEach(service => {
      subscribeToQueue(clients, service.service_id);
    });

    // Jika tidak ada layanan sama sekali, coba lagi setelah 5 detik
    // (mungkin admin belum inisialisasi sistem)
    if (services.length === 0) {
      console.log('[StreamBridge] Belum ada layanan. Mencoba ulang dalam 5 detik...');
      setTimeout(() => startStreamBridge(clients), 5000);
    }
  });
}

module.exports = { startStreamBridge, subscribeToQueue, unsubscribeFromQueue };
```

---

### 4.5 Command Handler (WebSocket → gRPC)

**File: `gateway/commandHandler.js`**

Ini adalah implementasi **Fitur Wajib 4**: Command & Control Bridge. Browser mengirim perintah via WebSocket, gateway menerjemahkannya menjadi panggilan gRPC.

```javascript
'use strict';

const { broadcast, sendToClient } = require('./wsManager');

// Menyimpan satu AdminSession BiDi stream yang persistent
// Satu stream untuk satu admin yang login
let adminSession = null;
let adminSessionActive = false;

/**
 * Memulai sesi admin BiDi streaming.
 * Stream ini persistent — tidak dibuat ulang setiap perintah.
 *
 * @param {object} clients - gRPC stubs
 * @param {object} authInfo - { officer_id, pin } untuk otentikasi admin
 */
function startAdminSession(clients, authInfo) {
  if (adminSessionActive) {
    console.log('[CommandHandler] Admin session sudah aktif.');
    return;
  }

  console.log('[CommandHandler] Memulai admin BiDi session...');

  adminSession = clients.admin.AdminSession();
  adminSessionActive = true;

  // Terima event dari server melalui BiDi stream
  adminSession.on('data', (event) => {
    console.log('[CommandHandler] Event dari AdminSession:', event.event_type);

    // Forward semua event admin ke browser
    broadcast({
      type: 'ADMIN_EVENT',
      payload: {
        event_type: event.event_type,  // QUEUE_UPDATE, STATS_SNAPSHOT, ACK, ERROR
        data: event,
        timestamp: new Date().toISOString(),
      },
    });
  });

  adminSession.on('error', (err) => {
    console.error('[CommandHandler] Admin session error:', err.message);
    adminSessionActive = false;
    adminSession = null;

    broadcast({
      type: 'ADMIN_SESSION_ERROR',
      payload: { message: err.message },
    });
  });

  adminSession.on('end', () => {
    console.log('[CommandHandler] Admin session berakhir.');
    adminSessionActive = false;
    adminSession = null;
  });

  // Login pertama — kirim command LOGIN jika proto mendukung
  // Atau bisa langsung kirim command pertama yang memerlukan auth
  if (authInfo) {
    adminSession.write({
      command_type: 'LOGIN',
      officer_id: authInfo.officer_id,
      pin: authInfo.pin,
    });
  }
}

/**
 * Mengirim perintah ke gRPC AdminSession.
 * Dipanggil ketika browser mengirim perintah via WebSocket.
 */
function sendAdminCommand(command) {
  if (!adminSession || !adminSessionActive) {
    console.warn('[CommandHandler] Admin session belum aktif. Perintah diabaikan:', command);
    broadcast({
      type: 'ERROR',
      payload: { message: 'Admin session belum aktif. Silakan login terlebih dahulu.' },
    });
    return;
  }

  console.log('[CommandHandler] Mengirim perintah ke AdminSession:', command.command_type);
  adminSession.write(command);
}

/**
 * Router utama untuk semua pesan yang masuk dari browser via WebSocket.
 * Dipanggil oleh wsManager setiap kali ada pesan baru dari client.
 *
 * @param {object} message - Pesan yang sudah di-parse dari JSON
 * @param {WebSocket} ws - WebSocket connection dari client yang mengirim
 * @param {object} clients - gRPC stubs
 */
function handleCommand(message, ws, clients) {
  const { cmd, payload } = message;
  console.log(`[CommandHandler] Menerima command: ${cmd}`);

  switch (cmd) {
    // ── Unary gRPC calls (panggil → response langsung) ──────────────────────

    case 'REGISTER_CITIZEN':
      clients.serviceInfo.RegisterCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LOGIN_CITIZEN':
      clients.serviceInfo.LoginCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'LOGIN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LIST_SERVICES':
      clients.serviceInfo.ListServices(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'SERVICES_LIST', error: err?.message, payload: res });
      });
      break;

    case 'GET_SERVICE_DETAIL':
      clients.serviceInfo.GetServiceDetail(payload, (err, res) => {
        sendToClient(ws, { type: 'SERVICE_DETAIL', error: err?.message, payload: res });
      });
      break;

    case 'GET_AVAILABLE_SLOTS':
      clients.serviceInfo.GetAvailableSlots(payload, (err, res) => {
        sendToClient(ws, { type: 'SLOTS_LIST', error: err?.message, payload: res });
      });
      break;

    case 'GET_ANNOUNCEMENTS':
      clients.serviceInfo.GetAnnouncements(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'ANNOUNCEMENTS', error: err?.message, payload: res });
      });
      break;

    case 'CREATE_BOOKING':
      clients.booking.CreateBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'BOOKING_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'CANCEL_BOOKING':
      clients.booking.CancelBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'CANCEL_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'GET_MY_BOOKING':
      clients.booking.GetMyBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'MY_BOOKING', error: err?.message, payload: res });
      });
      break;

    case 'RESCHEDULE_BOOKING':
      clients.booking.RescheduleBooking(payload, (err, res) => {
        sendToClient(ws, { type: 'RESCHEDULE_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'GET_QUEUE_STATUS':
      clients.queue.GetQueueStatus(payload, (err, res) => {
        sendToClient(ws, { type: 'QUEUE_STATUS', error: err?.message, payload: res });
      });
      break;

    // ── Admin unary calls ────────────────────────────────────────────────────

    case 'ADMIN_LOGIN':
      // Login admin via unary RPC, kemudian start BiDi session
      clients.admin.LoginOfficer(payload, (err, res) => {
        if (err) {
          sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', error: err.message });
          return;
        }
        sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', payload: res });
        // Mulai BiDi session setelah login berhasil
        startAdminSession(clients, payload);
      });
      break;

    case 'GET_SYSTEM_STATS':
      clients.admin.GetSystemStats(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'SYSTEM_STATS', error: err?.message, payload: res });
      });
      break;

    case 'WALK_IN_CITIZEN':
      clients.admin.WalkInCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'WALK_IN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'CHECKIN_CITIZEN':
      clients.admin.CheckInCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'CHECKIN_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'RESET_DAILY_QUOTA':
      clients.admin.ResetDailyQuota(payload, (err, res) => {
        sendToClient(ws, { type: 'RESET_QUOTA_RESULT', error: err?.message, payload: res });
      });
      break;

    // ── BiDi stream commands (dikirim ke AdminSession yang sudah aktif) ──────

    case 'CALL_NEXT':
      sendAdminCommand({
        command_type: 'CALL_NEXT',
        service_id: payload.service_id,
      });
      break;

    case 'ANNOUNCE':
      sendAdminCommand({
        command_type: 'ANNOUNCE',
        service_id: payload.service_id,
        message: payload.message,
      });
      break;

    case 'PAUSE_SERVICE':
      sendAdminCommand({
        command_type: 'PAUSE',
        service_id: payload.service_id,
      });
      break;

    case 'RESUME_SERVICE':
      sendAdminCommand({
        command_type: 'RESUME',
        service_id: payload.service_id,
      });
      break;

    case 'GET_STATS_STREAM':
      sendAdminCommand({ command_type: 'GET_STATS' });
      break;

    default:
      console.warn('[CommandHandler] Command tidak dikenal:', cmd);
      sendToClient(ws, {
        type: 'ERROR',
        payload: { message: `Command tidak dikenal: ${cmd}` },
      });
  }
}

module.exports = { handleCommand, startAdminSession };
```

---

### 4.6 Push Scheduler (Server-Initiated Events)

**File: `gateway/pushScheduler.js`**

Ini adalah implementasi **Fitur Wajib 3**: Server-Initiated Events. Gateway secara proaktif mendorong data ke browser tanpa diminta.

```javascript
'use strict';

const { broadcast } = require('./wsManager');

// Interval handles untuk cleanup saat shutdown
const intervals = [];

/**
 * Push statistik sistem ke semua browser setiap N milidetik.
 * Browser tidak perlu meminta — data dikirim otomatis.
 */
function startStatsPusher(clients, intervalMs = 5000) {
  console.log(`[PushScheduler] Memulai stats pusher (interval: ${intervalMs}ms)`);

  const handle = setInterval(() => {
    clients.admin.GetSystemStats({}, (err, stats) => {
      if (err) {
        // Server mungkin belum diinisialisasi, abaikan error ini
        return;
      }

      broadcast({
        type: 'STATS_PUSH',
        payload: {
          total_bookings_today: stats.total_bookings_today,
          total_served_today: stats.total_served_today,
          total_cancelled_today: stats.total_cancelled_today,
          active_subscribers: stats.active_subscribers,
          per_service: stats.per_service,
          timestamp: new Date().toISOString(),
        },
      });
    });
  }, intervalMs);

  intervals.push(handle);
}

/**
 * Push status semua layanan secara berkala.
 * Berguna untuk update badge OPEN/PAUSED/CLOSED di UI.
 */
function startServiceStatusPusher(clients, intervalMs = 10000) {
  console.log(`[PushScheduler] Memulai service status pusher (interval: ${intervalMs}ms)`);

  const handle = setInterval(() => {
    clients.serviceInfo.ListServices({}, (err, response) => {
      if (err) return;

      broadcast({
        type: 'SERVICES_STATUS_UPDATE',
        payload: {
          services: (response.services || []).map(s => ({
            service_id: s.service_id,
            name: s.name,
            status: s.status,              // OPEN, PAUSED, CLOSED
            quota_remaining: s.quota_remaining,
            waiting_count: s.waiting_count,
          })),
          timestamp: new Date().toISOString(),
        },
      });
    });
  }, intervalMs);

  intervals.push(handle);
}

/**
 * Push pengumuman terbaru secara berkala.
 * Ini mensimulasikan server-initiated announcement push.
 */
function startAnnouncementPusher(clients, intervalMs = 15000) {
  console.log(`[PushScheduler] Memulai announcement pusher (interval: ${intervalMs}ms)`);

  let lastAnnouncementId = null;

  const handle = setInterval(() => {
    clients.serviceInfo.GetAnnouncements({}, (err, response) => {
      if (err || !response.announcements || response.announcements.length === 0) return;

      const latest = response.announcements[0];

      // Hanya broadcast jika ada pengumuman baru
      if (latest.id !== lastAnnouncementId) {
        lastAnnouncementId = latest.id;

        broadcast({
          type: 'NEW_ANNOUNCEMENT',
          payload: {
            id: latest.id,
            title: latest.title,
            message: latest.message,
            service_id: latest.service_id,
            created_at: latest.created_at,
            timestamp: new Date().toISOString(),
          },
        });
      }
    });
  }, intervalMs);

  intervals.push(handle);
}

/**
 * Push "heartbeat" ke browser untuk memastikan koneksi tetap hidup
 * dan browser bisa mendeteksi jika gateway mati.
 */
function startHeartbeat(intervalMs = 30000) {
  console.log(`[PushScheduler] Memulai heartbeat (interval: ${intervalMs}ms)`);

  const handle = setInterval(() => {
    broadcast({
      type: 'HEARTBEAT',
      payload: { timestamp: new Date().toISOString() },
    });
  }, intervalMs);

  intervals.push(handle);
}

/**
 * Entry point: mulai semua scheduled tasks.
 */
function startPushScheduler(clients) {
  startStatsPusher(clients, 5000);           // Stats setiap 5 detik
  startServiceStatusPusher(clients, 8000);   // Status layanan setiap 8 detik
  startAnnouncementPusher(clients, 12000);   // Cek pengumuman baru setiap 12 detik
  startHeartbeat(30000);                     // Heartbeat setiap 30 detik
}

/**
 * Bersihkan semua interval (untuk graceful shutdown).
 */
function stopPushScheduler() {
  intervals.forEach(handle => clearInterval(handle));
  intervals.length = 0;
  console.log('[PushScheduler] Semua scheduler dihentikan.');
}

module.exports = { startPushScheduler, stopPushScheduler };
```

---

### 4.7 WebSocket Server Manager

**File: `gateway/wsManager.js`**

Mengelola semua koneksi WebSocket yang aktif dan menyediakan fungsi `broadcast` serta `sendToClient`.

```javascript
'use strict';

const WebSocket = require('ws');
const { handleCommand } = require('./commandHandler');

// Registry semua WebSocket client yang aktif
const clients = new Set();

// Referensi ke gRPC stubs (di-set saat init)
let grpcClients = null;

/**
 * Inisialisasi WebSocket server.
 * Di-attach ke HTTP server yang sudah ada (bukan port terpisah).
 *
 * @param {http.Server} httpServer - HTTP server dari Express
 * @param {object} gClients - gRPC client stubs
 */
function initWsServer(httpServer, gClients) {
  grpcClients = gClients;

  const wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    ws.clientId = clientId;

    clients.add(ws);
    console.log(`[WsManager] Client baru terhubung: ${clientId} (total: ${clients.size})`);

    // Kirim pesan selamat datang dengan state awal
    sendToClient(ws, {
      type: 'CONNECTED',
      payload: {
        clientId,
        message: 'Terhubung ke SiAntre Gateway',
        timestamp: new Date().toISOString(),
      },
    });

    // Handle pesan masuk dari browser
    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        console.log(`[WsManager] Pesan dari ${clientId}:`, message.cmd);
        handleCommand(message, ws, grpcClients);
      } catch (err) {
        console.error(`[WsManager] Gagal parse pesan dari ${clientId}:`, err.message);
        sendToClient(ws, {
          type: 'ERROR',
          payload: { message: 'Format pesan tidak valid. Harus berupa JSON.' },
        });
      }
    });

    // Handle koneksi terputus
    ws.on('close', (code, reason) => {
      clients.delete(ws);
      console.log(`[WsManager] Client terputus: ${clientId} (sisa: ${clients.size})`);
    });

    // Handle error pada koneksi
    ws.on('error', (err) => {
      console.error(`[WsManager] Error pada client ${clientId}:`, err.message);
      clients.delete(ws);
    });
  });

  wss.on('error', (err) => {
    console.error('[WsManager] WebSocket server error:', err.message);
  });

  console.log(`[WsManager] WebSocket server aktif. Menunggu koneksi...`);
  return wss;
}

/**
 * Broadcast pesan ke SEMUA client yang terhubung.
 * Digunakan untuk event dari gRPC stream dan push scheduler.
 *
 * @param {object} message - Object yang akan di-serialize ke JSON
 */
function broadcast(message) {
  const payload = JSON.stringify(message);
  let sent = 0;

  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sent++;
    }
  });

  if (clients.size > 0) {
    console.log(`[WsManager] Broadcast [${message.type}] ke ${sent}/${clients.size} client`);
  }
}

/**
 * Kirim pesan ke satu client spesifik.
 * Digunakan untuk response dari perintah unary (hanya pengirim yang perlu tahu).
 *
 * @param {WebSocket} ws - WebSocket connection target
 * @param {object} message - Object yang akan di-serialize ke JSON
 */
function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Mengembalikan jumlah client yang aktif.
 */
function getClientCount() {
  return clients.size;
}

module.exports = { initWsServer, broadcast, sendToClient, getClientCount };
```

---

## 5. Tahap 2 — Frontend Web UI

Frontend adalah kumpulan file statis (HTML, CSS, JS) yang di-serve oleh gateway melalui Express. Tidak ada framework yang diperlukan — semua menggunakan vanilla JavaScript dan WebSocket API bawaan browser.

### 5.1 Struktur HTML Utama

**File: `frontend/index.html`** (Halaman Warga)

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Sistem Antrian Digital</title>
  <link rel="stylesheet" href="css/style.css" />
  <!-- Chart.js dari CDN untuk grafik antrian -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <!-- ─── Header ─────────────────────────────────────────────── -->
  <header class="app-header">
    <div class="header-brand">
      <span class="header-logo">🏛️</span>
      <div>
        <h1 class="header-title">SiAntre</h1>
        <p class="header-subtitle">Sistem Antrian Layanan Publik Digital</p>
      </div>
    </div>
    <div class="header-status">
      <span id="ws-status-badge" class="status-badge status-connecting">● Menghubungkan...</span>
    </div>
  </header>

  <!-- ─── Notifikasi Toast (ditambahkan dinamis via JS) ──────── -->
  <div id="notification-container" aria-live="polite"></div>

  <!-- ─── Layout Utama ──────────────────────────────────────── -->
  <main class="app-layout">

    <!-- Sidebar Kiri: Info & Form -->
    <aside class="sidebar">

      <!-- Panel Login/Register -->
      <section class="card" id="auth-panel">
        <h2 class="card-title">Masuk / Daftar</h2>
        <div class="tab-group">
          <button class="tab-btn active" data-tab="login">Masuk</button>
          <button class="tab-btn" data-tab="register">Daftar</button>
        </div>

        <!-- Form Login -->
        <div id="tab-login" class="tab-content active">
          <div class="form-group">
            <label for="login-nik">NIK (16 digit)</label>
            <input type="text" id="login-nik" maxlength="16" placeholder="Masukkan NIK Anda" />
          </div>
          <button class="btn btn-primary" id="btn-login">Masuk</button>
        </div>

        <!-- Form Register -->
        <div id="tab-register" class="tab-content">
          <div class="form-group">
            <label for="reg-nik">NIK (16 digit)</label>
            <input type="text" id="reg-nik" maxlength="16" placeholder="Nomor Induk Kependudukan" />
          </div>
          <div class="form-group">
            <label for="reg-name">Nama Lengkap</label>
            <input type="text" id="reg-name" placeholder="Sesuai KTP" />
          </div>
          <div class="form-group">
            <label for="reg-phone">Nomor HP</label>
            <input type="tel" id="reg-phone" placeholder="08xxxxxxxxxx" />
          </div>
          <div class="form-group">
            <label for="reg-address">Alamat</label>
            <input type="text" id="reg-address" placeholder="Alamat lengkap" />
          </div>
          <button class="btn btn-primary" id="btn-register">Daftar Akun</button>
        </div>
      </section>

      <!-- Panel Info Warga (muncul setelah login) -->
      <section class="card hidden" id="user-panel">
        <h2 class="card-title">Selamat Datang</h2>
        <div class="user-info">
          <p class="user-name" id="user-name-display">—</p>
          <p class="user-nik" id="user-nik-display">NIK: —</p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-logout">Keluar</button>
      </section>

      <!-- Panel Booking -->
      <section class="card hidden" id="booking-panel">
        <h2 class="card-title">Buat Booking</h2>
        <div class="form-group">
          <label for="select-service">Pilih Layanan</label>
          <select id="select-service">
            <option value="">-- Pilih layanan --</option>
          </select>
        </div>
        <div class="form-group">
          <label for="select-slot">Pilih Slot Waktu</label>
          <select id="select-slot" disabled>
            <option value="">-- Pilih layanan dahulu --</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-create-booking" disabled>Pesan Sekarang</button>
      </section>

      <!-- Panel Status Booking -->
      <section class="card hidden" id="my-booking-panel">
        <h2 class="card-title">Booking Saya</h2>
        <div id="my-booking-detail" class="booking-detail">
          <p class="text-muted">Belum ada booking aktif.</p>
        </div>
      </section>

    </aside>

    <!-- Konten Utama: Dashboard Real-Time -->
    <div class="main-content">

      <!-- ── Komponen 1: Status Indikator Layanan (Fitur Wajib 2) ── -->
      <section class="card">
        <h2 class="card-title">
          Status Layanan
          <span class="live-badge">● LIVE</span>
        </h2>
        <div id="service-status-grid" class="service-grid">
          <p class="text-muted">Memuat data layanan...</p>
        </div>
      </section>

      <!-- ── Komponen 2: Grafik Antrian Live (Fitur Wajib 2) ──────── -->
      <section class="card">
        <h2 class="card-title">
          Posisi Antrian Real-Time
          <span class="live-badge">● LIVE</span>
        </h2>
        <div class="chart-wrapper">
          <canvas id="queue-chart"></canvas>
        </div>
        <div class="chart-legend" id="chart-stats">
          <div class="stat-item">
            <span class="stat-label">Total Dilayani Hari Ini</span>
            <span class="stat-value" id="stat-served">—</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Booking Aktif</span>
            <span class="stat-value" id="stat-bookings">—</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Subscriber Live</span>
            <span class="stat-value" id="stat-subscribers">—</span>
          </div>
        </div>
      </section>

      <!-- ── Komponen 3: Activity Log (Fitur Wajib 2) ─────────────── -->
      <section class="card">
        <h2 class="card-title">
          Log Aktivitas
          <button class="btn btn-sm btn-ghost" id="btn-clear-log">Bersihkan</button>
        </h2>
        <div id="activity-log" class="activity-log" role="log" aria-live="polite">
          <p class="log-empty">Belum ada aktivitas. Sistem terhubung dan menunggu event...</p>
        </div>
      </section>

    </div>
  </main>

  <!-- ─── Scripts ────────────────────────────────────────────── -->
  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/chart.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/warga.js"></script>
</body>
</html>
```

---

### 5.2 Stylesheet

**File: `frontend/css/style.css`**

```css
/* ─── Reset & Base ──────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-base: #f4f6f9;
  --bg-card: #ffffff;
  --bg-sidebar: #1e2740;
  --color-primary: #2563eb;
  --color-primary-dark: #1d4ed8;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-muted: #6b7280;
  --color-text: #111827;
  --color-border: #e5e7eb;
  --color-live: #10b981;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

body {
  font-family: var(--font);
  background: var(--bg-base);
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
}

/* ─── Header ───────────────────────────────────────────────── */
.app-header {
  background: var(--bg-sidebar);
  color: #fff;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: var(--shadow-md);
}
.header-brand { display: flex; align-items: center; gap: 12px; }
.header-logo { font-size: 28px; }
.header-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.header-subtitle { font-size: 12px; color: #94a3b8; margin-top: 1px; }

/* ─── Layout ───────────────────────────────────────────────── */
.app-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
@media (max-width: 900px) {
  .app-layout { grid-template-columns: 1fr; }
}
.sidebar { display: flex; flex-direction: column; gap: 16px; }
.main-content { display: flex; flex-direction: column; gap: 16px; }

/* ─── Card ─────────────────────────────────────────────────── */
.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* ─── Badges ───────────────────────────────────────────────── */
.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  transition: all 0.3s ease;
}
.status-connected    { background: #dcfce7; color: #15803d; }
.status-disconnected { background: #fee2e2; color: #b91c1c; }
.status-connecting   { background: #fef9c3; color: #a16207; }

.live-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-live);
  animation: pulse-live 2s infinite;
}
@keyframes pulse-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ─── Buttons ──────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary  { background: var(--color-primary); color: #fff; width: 100%; }
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); }
.btn-outline  { background: transparent; border: 1.5px solid var(--color-primary); color: var(--color-primary); }
.btn-ghost    { background: transparent; color: var(--color-muted); padding: 4px 8px; font-weight: 400; }
.btn-ghost:hover { color: var(--color-text); background: var(--bg-base); }
.btn-sm       { padding: 5px 12px; font-size: 12px; }
.btn-danger   { background: var(--color-danger); color: #fff; }

/* ─── Forms ─────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-group input,
.form-group select {
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  transition: border-color 0.15s ease;
  background: #fff;
  width: 100%;
}
.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

/* ─── Tabs ──────────────────────────────────────────────────── */
.tab-group { display: flex; gap: 4px; margin-bottom: 16px; background: var(--bg-base); border-radius: var(--radius-sm); padding: 3px; }
.tab-btn { flex: 1; padding: 7px; border: none; background: transparent; cursor: pointer; border-radius: 4px; font-size: 13px; font-weight: 500; color: var(--color-muted); transition: all 0.15s; }
.tab-btn.active { background: #fff; color: var(--color-primary); font-weight: 600; box-shadow: var(--shadow-sm); }
.tab-content { display: none; }
.tab-content.active { display: block; }

/* ─── Service Status Grid (Komponen 1) ─────────────────────── */
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }

.service-card {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--color-border);
  transition: all 0.3s ease;
}
.service-card .svc-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.service-card .svc-meta { font-size: 11px; color: var(--color-muted); }
.service-card .svc-status-label {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.svc-open   { border-color: #bbf7d0; background: #f0fdf4; }
.svc-open .svc-status-label { background: #dcfce7; color: #15803d; }
.svc-paused { border-color: #fde68a; background: #fffbeb; }
.svc-paused .svc-status-label { background: #fef3c7; color: #92400e; }
.svc-closed { border-color: #fecaca; background: #fff5f5; }
.svc-closed .svc-status-label { background: #fee2e2; color: #991b1b; }

/* ─── Chart (Komponen 2) ────────────────────────────────────── */
.chart-wrapper { position: relative; height: 220px; margin-bottom: 14px; }
.chart-legend { display: flex; gap: 16px; flex-wrap: wrap; }
.stat-item { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 11px; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--color-text); }

/* ─── Activity Log (Komponen 3) ─────────────────────────────── */
.activity-log {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  scroll-behavior: smooth;
}
.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-base);
  animation: slide-in 0.2s ease;
  border-left: 3px solid transparent;
}
@keyframes slide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.log-entry.type-queue    { border-left-color: var(--color-primary); }
.log-entry.type-announce { border-left-color: var(--color-warning); }
.log-entry.type-admin    { border-left-color: var(--color-success); }
.log-entry.type-system   { border-left-color: var(--color-muted); }
.log-entry.type-error    { border-left-color: var(--color-danger); background: #fff5f5; }

.log-time { font-size: 11px; color: var(--color-muted); white-space: nowrap; min-width: 55px; padding-top: 1px; }
.log-text { flex: 1; line-height: 1.4; }
.log-empty { color: var(--color-muted); font-style: italic; text-align: center; padding: 20px 0; }

/* ─── Notifications / Toast ─────────────────────────────────── */
#notification-container {
  position: fixed;
  top: 72px;
  right: 20px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 360px;
}
.toast {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 13px;
  animation: toast-in 0.3s ease;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-left: 4px solid transparent;
}
@keyframes toast-in {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
.toast.success { background: #f0fdf4; border-color: var(--color-success); }
.toast.warning { background: #fffbeb; border-color: var(--color-warning); }
.toast.error   { background: #fff5f5; border-color: var(--color-danger); }
.toast.info    { background: #eff6ff; border-color: var(--color-primary); }
.toast-icon    { font-size: 16px; }
.toast-body    { flex: 1; }
.toast-title   { font-weight: 600; margin-bottom: 2px; }
.toast-message { color: var(--color-muted); font-size: 12px; }

/* ─── User Info ─────────────────────────────────────────────── */
.user-info { margin-bottom: 12px; }
.user-name { font-weight: 700; font-size: 16px; }
.user-nik  { font-size: 12px; color: var(--color-muted); }

/* ─── Booking Detail ────────────────────────────────────────── */
.booking-detail {
  background: var(--bg-base);
  border-radius: var(--radius-sm);
  padding: 12px;
  font-size: 13px;
}
.booking-detail .booking-code { font-size: 18px; font-weight: 700; color: var(--color-primary); letter-spacing: 2px; }
.booking-detail .booking-row  { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--color-border); }
.booking-detail .booking-row:last-child { border-bottom: none; }

/* ─── Helper classes ─────────────────────────────────────────── */
.hidden    { display: none !important; }
.text-muted { color: var(--color-muted); font-size: 13px; }
```

---

### 5.3 WebSocket Client & State Management

**File: `frontend/js/ws-client.js`**

Ini adalah inti dari frontend — mengelola koneksi WebSocket dan mendistribusikan event ke komponen yang tepat.

```javascript
// ─── State Aplikasi Global ───────────────────────────────────────────────────
const AppState = {
  ws: null,
  isConnected: false,
  currentUser: null,      // { nik, name, citizen_id }
  currentAdmin: null,     // { officer_id, name, role }
  services: [],           // Daftar layanan dari server
  myBooking: null,        // Booking aktif milik user
  queueData: {},          // { service_id: { waiting: N, current: N } }
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
};

// ─── Event Bus Sederhana ─────────────────────────────────────────────────────
// Komponen lain mendaftarkan diri di sini untuk mendengarkan event WebSocket
const EventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },
  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  },
};

// ─── Fungsi Utama: Kirim Perintah ke Gateway ────────────────────────────────
function sendCommand(cmd, payload = {}) {
  if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {
    console.warn('[WsClient] WebSocket belum terhubung. Perintah diabaikan:', cmd);
    showNotification('Koneksi terputus', 'Mencoba menghubungkan kembali...', 'warning');
    return;
  }
  AppState.ws.send(JSON.stringify({ cmd, payload }));
}

// ─── Router Pesan WebSocket ──────────────────────────────────────────────────
function routeMessage(msg) {
  switch (msg.type) {
    // ── Koneksi ──────────────────────────────────────────────────────────────
    case 'CONNECTED':
      console.log('[WsClient] Terhubung ke gateway:', msg.payload.clientId);
      // Minta daftar layanan segera setelah terhubung
      sendCommand('LIST_SERVICES');
      sendCommand('GET_SYSTEM_STATS');
      break;

    case 'HEARTBEAT':
      // Tidak perlu tindakan, heartbeat hanya untuk mempertahankan koneksi
      break;

    // ── Streaming gRPC → WebSocket (Fitur Wajib 1) ───────────────────────────
    case 'QUEUE_UPDATE':
      EventBus.emit('queueUpdate', msg);
      EventBus.emit('activityLog', {
        type: 'queue',
        message: formatQueueEvent(msg.payload),
        timestamp: msg.payload.timestamp,
      });
      break;

    // ── Server-Initiated Events (Fitur Wajib 3) ──────────────────────────────
    case 'STATS_PUSH':
      EventBus.emit('statsUpdate', msg.payload);
      EventBus.emit('queueChartUpdate', msg.payload);
      break;

    case 'SERVICES_STATUS_UPDATE':
      AppState.services = msg.payload.services;
      EventBus.emit('servicesUpdate', msg.payload.services);
      EventBus.emit('activityLog', {
        type: 'system',
        message: `Status layanan diperbarui (${msg.payload.services.length} layanan)`,
        timestamp: msg.payload.timestamp,
      });
      break;

    case 'NEW_ANNOUNCEMENT':
      EventBus.emit('newAnnouncement', msg.payload);
      EventBus.emit('activityLog', {
        type: 'announce',
        message: `📢 ${msg.payload.title}: ${msg.payload.message}`,
        timestamp: msg.payload.timestamp,
      });
      showNotification('Pengumuman Baru', msg.payload.message, 'info');
      break;

    // ── Respons dari Command (Fitur Wajib 4) ────────────────────────────────
    case 'LOGIN_RESULT':
      EventBus.emit('loginResult', msg);
      break;

    case 'REGISTER_RESULT':
      EventBus.emit('registerResult', msg);
      break;

    case 'SERVICES_LIST':
      if (!msg.error) {
        AppState.services = msg.payload.services || [];
        EventBus.emit('servicesLoaded', AppState.services);
      }
      break;

    case 'SLOTS_LIST':
      EventBus.emit('slotsLoaded', msg);
      break;

    case 'BOOKING_RESULT':
      EventBus.emit('bookingResult', msg);
      break;

    case 'MY_BOOKING':
      EventBus.emit('myBookingLoaded', msg);
      break;

    case 'CANCEL_RESULT':
      EventBus.emit('cancelResult', msg);
      break;

    case 'RESCHEDULE_RESULT':
      EventBus.emit('rescheduleResult', msg);
      break;

    case 'QUEUE_STATUS':
      EventBus.emit('queueStatus', msg);
      break;

    // ── Event Admin ──────────────────────────────────────────────────────────
    case 'ADMIN_LOGIN_RESULT':
      EventBus.emit('adminLoginResult', msg);
      break;

    case 'ADMIN_EVENT':
      EventBus.emit('adminEvent', msg.payload);
      EventBus.emit('activityLog', {
        type: 'admin',
        message: `Admin event: ${msg.payload.event_type}`,
        timestamp: msg.payload.timestamp,
      });
      break;

    case 'SYSTEM_STATS':
      EventBus.emit('statsUpdate', msg.payload);
      break;

    case 'CHECKIN_RESULT':
      EventBus.emit('checkinResult', msg);
      break;

    case 'WALK_IN_RESULT':
      EventBus.emit('walkInResult', msg);
      break;

    case 'RESET_QUOTA_RESULT':
      EventBus.emit('resetQuotaResult', msg);
      break;

    // ── Error ────────────────────────────────────────────────────────────────
    case 'ERROR':
      console.error('[WsClient] Error dari server:', msg.payload?.message);
      showNotification('Terjadi Kesalahan', msg.payload?.message || 'Error tidak diketahui', 'error');
      EventBus.emit('activityLog', {
        type: 'error',
        message: `Error: ${msg.payload?.message}`,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      console.log('[WsClient] Pesan tidak dikenal:', msg.type, msg);
  }
}

// ─── Format Event Antrian untuk Log ─────────────────────────────────────────
function formatQueueEvent(payload) {
  const eventLabels = {
    QUEUE_MOVED:    `Antrian bergerak — nomor sekarang: ${payload.current_number}`,
    YOUR_TURN:      `🎉 Giliran Anda tiba! Segera menuju loket.`,
    SERVICE_CLOSED: `⚠️ Layanan ditutup sementara.`,
    SERVICE_RESUMED:`✅ Layanan dibuka kembali.`,
    ANNOUNCEMENT:   `📢 ${payload.message}`,
    QUOTA_OPENED:   `Slot baru tersedia — quota bertambah.`,
  };
  return eventLabels[payload.event_type] || `Event: ${payload.event_type}`;
}

// ─── Inisialisasi Koneksi WebSocket ─────────────────────────────────────────
function initWebSocket() {
  const wsUrl = `ws://${window.location.host}`;
  console.log('[WsClient] Menghubungkan ke:', wsUrl);
  updateConnectionStatus('connecting');

  const ws = new WebSocket(wsUrl);
  AppState.ws = ws;

  ws.onopen = () => {
    console.log('[WsClient] WebSocket terhubung!');
    AppState.isConnected = true;
    AppState.reconnectAttempts = 0;
    updateConnectionStatus('connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      routeMessage(msg);
    } catch (err) {
      console.error('[WsClient] Gagal parse pesan:', err);
    }
  };

  ws.onclose = (event) => {
    console.warn('[WsClient] Koneksi terputus:', event.code, event.reason);
    AppState.isConnected = false;
    AppState.ws = null;
    updateConnectionStatus('disconnected');
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('[WsClient] WebSocket error:', err);
    updateConnectionStatus('disconnected');
  };
}

// ─── Auto-Reconnect ──────────────────────────────────────────────────────────
function scheduleReconnect() {
  if (AppState.reconnectAttempts >= AppState.maxReconnectAttempts) {
    console.error('[WsClient] Gagal terhubung setelah banyak percobaan. Berhenti mencoba.');
    showNotification('Koneksi Gagal', 'Tidak bisa menghubungkan ke server. Refresh halaman.', 'error');
    return;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  const delay = Math.min(1000 * Math.pow(2, AppState.reconnectAttempts), 30000);
  AppState.reconnectAttempts++;

  console.log(`[WsClient] Mencoba reconnect dalam ${delay}ms (percobaan ke-${AppState.reconnectAttempts})`);
  setTimeout(initWebSocket, delay);
}

// ─── Update Status Badge di Header ──────────────────────────────────────────
function updateConnectionStatus(status) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;

  const labels = {
    connected:    '● Terhubung',
    disconnected: '● Terputus',
    connecting:   '● Menghubungkan...',
  };
  const classes = {
    connected:    'status-connected',
    disconnected: 'status-disconnected',
    connecting:   'status-connecting',
  };

  badge.textContent = labels[status];
  badge.className = `status-badge ${classes[status]}`;
}

// ─── Start ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
});
```

---

### 5.4 Komponen: Grafik Antrian Live

**File: `frontend/js/chart.js`**

```javascript
// ─── Grafik Antrian Real-Time (Komponen Dinamis #2) ─────────────────────────
(function() {
  let chart = null;
  let chartData = {
    labels: [],
    waiting: [],
    served: [],
  };

  function initChart() {
    const canvas = document.getElementById('queue-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Menunggu',
            data: chartData.waiting,
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderColor: 'rgba(37, 99, 235, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Sudah Dilayani',
            data: chartData.served,
            backgroundColor: 'rgba(22, 163, 74, 0.7)',
            borderColor: 'rgba(22, 163, 74, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              title: (items) => `Layanan: ${items[0].label}`,
              label: (item) => `${item.dataset.label}: ${item.raw} orang`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0 },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
        },
      },
    });
  }

  function updateChart(services) {
    if (!chart || !services || services.length === 0) return;

    chartData.labels  = services.map(s => s.name || s.service_id);
    chartData.waiting = services.map(s => s.waiting_count || 0);
    chartData.served  = services.map(s => s.quota_remaining || 0);

    chart.data.labels = chartData.labels;
    chart.data.datasets[0].data = chartData.waiting;
    chart.data.datasets[1].data = chartData.served;
    chart.update('active');
  }

  function updateStats(stats) {
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '—';
    };
    setEl('stat-served',      stats.total_served_today);
    setEl('stat-bookings',    stats.total_bookings_today);
    setEl('stat-subscribers', stats.active_subscribers);

    if (stats.per_service) {
      updateChart(stats.per_service);
    }
  }

  // Daftarkan ke EventBus
  document.addEventListener('DOMContentLoaded', () => {
    initChart();
    EventBus.on('statsUpdate',       updateStats);
    EventBus.on('queueChartUpdate',  (data) => data.per_service && updateChart(data.per_service));
    EventBus.on('servicesUpdate',    updateChart);
    EventBus.on('servicesLoaded',    updateChart);
  });
})();
```

---

### 5.5 Komponen: Activity Log

**File: `frontend/js/activity-log.js`**

```javascript
// ─── Activity Log (Komponen Dinamis #3) ─────────────────────────────────────
(function() {
  const MAX_LOG_ENTRIES = 100;
  let logContainer = null;

  function formatTime(isoString) {
    const d = new Date(isoString || Date.now());
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function addLogEntry({ type = 'system', message, timestamp }) {
    if (!logContainer) return;

    // Hapus placeholder kosong jika masih ada
    const empty = logContainer.querySelector('.log-empty');
    if (empty) empty.remove();

    // Buat entry baru
    const entry = document.createElement('div');
    entry.className = `log-entry type-${type}`;
    entry.innerHTML = `
      <span class="log-time">${formatTime(timestamp)}</span>
      <span class="log-text">${escapeHtml(message)}</span>
    `;

    // Sisipkan di atas (newest first)
    logContainer.insertBefore(entry, logContainer.firstChild);

    // Batasi jumlah entry agar tidak overflow memori
    while (logContainer.children.length > MAX_LOG_ENTRIES) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function clearLog() {
    if (!logContainer) return;
    logContainer.innerHTML = '<p class="log-empty">Log dibersihkan.</p>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    logContainer = document.getElementById('activity-log');

    const clearBtn = document.getElementById('btn-clear-log');
    if (clearBtn) clearBtn.addEventListener('click', clearLog);

    // Subscribe ke semua event yang perlu masuk log
    EventBus.on('activityLog', addLogEntry);

    // Log saat koneksi berubah
    EventBus.on('wsConnected',    () => addLogEntry({ type: 'system', message: '✅ Terhubung ke SiAntre Gateway' }));
    EventBus.on('wsDisconnected', () => addLogEntry({ type: 'error',  message: '❌ Koneksi ke gateway terputus' }));
  });
})();
```

---

### 5.6 Komponen: Status Indikator Layanan

**File: `frontend/js/status-indicator.js`**

```javascript
// ─── Status Indikator Layanan (Komponen Dinamis #1) ──────────────────────────
// Badge status per layanan yang berubah otomatis berdasarkan event WebSocket
(function() {
  const statusLabels = {
    'OPEN':   'Buka',
    'PAUSED': 'Jeda',
    'CLOSED': 'Tutup',
  };

  function renderServices(services) {
    const grid = document.getElementById('service-status-grid');
    if (!grid || !services) return;

    if (services.length === 0) {
      grid.innerHTML = '<p class="text-muted">Belum ada layanan. Admin belum menginisialisasi sistem.</p>';
      return;
    }

    grid.innerHTML = '';
    services.forEach(svc => {
      const status = (svc.status || 'CLOSED').toUpperCase();
      const cssClass = status === 'OPEN' ? 'svc-open' : status === 'PAUSED' ? 'svc-paused' : 'svc-closed';

      const card = document.createElement('div');
      card.className = `service-card ${cssClass}`;
      card.dataset.serviceId = svc.service_id;
      card.innerHTML = `
        <div class="svc-name">${escHtml(svc.name || svc.service_id)}</div>
        <div class="svc-meta">
          Menunggu: <strong>${svc.waiting_count ?? '—'}</strong> &nbsp;|&nbsp;
          Sisa Quota: <strong>${svc.quota_remaining ?? '—'}</strong>
        </div>
        <span class="svc-status-label">${statusLabels[status] || status}</span>
      `;
      grid.appendChild(card);
    });
  }

  function updateSingleService(serviceId, updates) {
    const card = document.querySelector(`.service-card[data-service-id="${serviceId}"]`);
    if (!card) return;

    const status = (updates.status || 'CLOSED').toUpperCase();
    card.className = `service-card ${status === 'OPEN' ? 'svc-open' : status === 'PAUSED' ? 'svc-paused' : 'svc-closed'}`;

    const badge = card.querySelector('.svc-status-label');
    if (badge) badge.textContent = statusLabels[status] || status;

    const meta = card.querySelector('.svc-meta');
    if (meta) {
      meta.innerHTML = `Menunggu: <strong>${updates.waiting_count ?? '—'}</strong> &nbsp;|&nbsp; Sisa Quota: <strong>${updates.quota_remaining ?? '—'}</strong>`;
    }
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    EventBus.on('servicesLoaded',    renderServices);
    EventBus.on('servicesUpdate',    renderServices);

    // Update individual service card saat ada queue event
    EventBus.on('queueUpdate', (msg) => {
      if (msg.service_id && msg.payload) {
        updateSingleService(msg.service_id, {
          waiting_count: msg.payload.waiting_count,
        });
      }
    });
  });
})();
```

---

### 5.7 Komponen: Notifikasi & Alert

**File: `frontend/js/notification.js`**

```javascript
// ─── Toast Notification System ───────────────────────────────────────────────
// Dipanggil via showNotification() dari ws-client.js dan komponen lain
function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-message">${escHtml(message)}</div>` : ''}
    </div>
  `;

  container.appendChild(toast);

  // Auto-remove setelah duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);

  // Klik untuk menutup
  toast.addEventListener('click', () => toast.remove());
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
```

---

### 5.8 Halaman Warga

**File: `frontend/js/warga.js`**

```javascript
// ─── Logic Halaman Warga ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Elemen DOM ─────────────────────────────────────────────────────────────
  const authPanel       = document.getElementById('auth-panel');
  const userPanel       = document.getElementById('user-panel');
  const bookingPanel    = document.getElementById('booking-panel');
  const myBookingPanel  = document.getElementById('my-booking-panel');
  const userNameDisplay = document.getElementById('user-name-display');
  const userNikDisplay  = document.getElementById('user-nik-display');
  const selectService   = document.getElementById('select-service');
  const selectSlot      = document.getElementById('select-slot');
  const btnCreateBooking = document.getElementById('btn-create-booking');

  // ── Tab Switch ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-login').addEventListener('click', () => {
    const nik = document.getElementById('login-nik').value.trim();
    if (nik.length !== 16 || !/^\d+$/.test(nik)) {
      showNotification('NIK Tidak Valid', 'NIK harus 16 digit angka', 'warning');
      return;
    }
    sendCommand('LOGIN_CITIZEN', { nik });
  });

  EventBus.on('loginResult', (msg) => {
    if (msg.error) {
      showNotification('Login Gagal', msg.error, 'error');
      return;
    }
    const citizen = msg.payload.citizen;
    AppState.currentUser = citizen;

    userNameDisplay.textContent = citizen.name;
    userNikDisplay.textContent  = `NIK: ${citizen.nik}`;
    authPanel.classList.add('hidden');
    userPanel.classList.remove('hidden');
    bookingPanel.classList.remove('hidden');
    myBookingPanel.classList.remove('hidden');

    showNotification('Selamat Datang!', `Halo, ${citizen.name}`, 'success');

    // Muat booking aktif
    sendCommand('GET_MY_BOOKING', { nik: citizen.nik });
  });

  // ── Register ────────────────────────────────────────────────────────────────
  document.getElementById('btn-register').addEventListener('click', () => {
    const payload = {
      nik:     document.getElementById('reg-nik').value.trim(),
      name:    document.getElementById('reg-name').value.trim(),
      phone:   document.getElementById('reg-phone').value.trim(),
      address: document.getElementById('reg-address').value.trim(),
    };
    if (payload.nik.length !== 16 || !payload.name) {
      showNotification('Data Tidak Lengkap', 'Isi semua field dengan benar', 'warning');
      return;
    }
    sendCommand('REGISTER_CITIZEN', payload);
  });

  EventBus.on('registerResult', (msg) => {
    if (msg.error) {
      showNotification('Registrasi Gagal', msg.error, 'error');
      return;
    }
    showNotification('Registrasi Berhasil!', 'Silakan login dengan NIK Anda', 'success');
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', () => {
    AppState.currentUser = null;
    AppState.myBooking   = null;
    authPanel.classList.remove('hidden');
    userPanel.classList.add('hidden');
    bookingPanel.classList.add('hidden');
    myBookingPanel.classList.add('hidden');
    document.getElementById('login-nik').value = '';
    showNotification('Berhasil Keluar', 'Sampai jumpa!', 'info');
  });

  // ── Pilih Layanan → Load Slot ────────────────────────────────────────────────
  EventBus.on('servicesLoaded', (services) => {
    selectService.innerHTML = '<option value="">-- Pilih layanan --</option>';
    services.forEach(svc => {
      const opt = document.createElement('option');
      opt.value = svc.service_id;
      opt.textContent = `${svc.name} (sisa: ${svc.quota_remaining})`;
      selectService.appendChild(opt);
    });
  });

  selectService.addEventListener('change', () => {
    const serviceId = selectService.value;
    selectSlot.disabled = true;
    selectSlot.innerHTML = '<option value="">Memuat slot...</option>';
    btnCreateBooking.disabled = true;

    if (!serviceId) {
      selectSlot.innerHTML = '<option value="">-- Pilih layanan dahulu --</option>';
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    sendCommand('GET_AVAILABLE_SLOTS', { service_id: serviceId, date: today });
  });

  EventBus.on('slotsLoaded', (msg) => {
    selectSlot.innerHTML = '<option value="">-- Pilih slot --</option>';
    selectSlot.disabled = false;
    btnCreateBooking.disabled = false;

    if (msg.error || !msg.payload.slots || msg.payload.slots.length === 0) {
      selectSlot.innerHTML = '<option value="">Tidak ada slot tersedia</option>';
      selectSlot.disabled = true;
      btnCreateBooking.disabled = true;
      return;
    }

    msg.payload.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot.slot_id;
      opt.textContent = `${slot.slot_time} (sisa: ${slot.remaining_capacity} tempat)`;
      opt.disabled = slot.remaining_capacity === 0;
      selectSlot.appendChild(opt);
    });
  });

  // ── Buat Booking ─────────────────────────────────────────────────────────────
  btnCreateBooking.addEventListener('click', () => {
    if (!AppState.currentUser) {
      showNotification('Belum Login', 'Silakan login terlebih dahulu', 'warning');
      return;
    }
    const serviceId = selectService.value;
    const slotId    = selectSlot.value;
    if (!serviceId || !slotId) {
      showNotification('Pilihan Tidak Lengkap', 'Pilih layanan dan slot waktu', 'warning');
      return;
    }
    sendCommand('CREATE_BOOKING', {
      nik:        AppState.currentUser.nik,
      service_id: serviceId,
      slot_id:    slotId,
    });
  });

  EventBus.on('bookingResult', (msg) => {
    if (msg.error) {
      showNotification('Booking Gagal', msg.error, 'error');
      return;
    }
    const booking = msg.payload.booking;
    AppState.myBooking = booking;
    renderMyBooking(booking);
    showNotification('Booking Berhasil!', `Kode booking: ${booking.booking_code}`, 'success');
  });

  // ── Tampilkan Booking Saya ───────────────────────────────────────────────────
  EventBus.on('myBookingLoaded', (msg) => {
    if (msg.error || !msg.payload.booking) return;
    AppState.myBooking = msg.payload.booking;
    renderMyBooking(msg.payload.booking);
  });

  function renderMyBooking(booking) {
    const panel = document.getElementById('my-booking-detail');
    if (!panel) return;

    const statusColors = { BOOKED: '#2563eb', CHECKED_IN: '#16a34a', EXPIRED: '#dc2626', DONE: '#6b7280', CANCELLED: '#dc2626' };

    panel.innerHTML = `
      <div style="text-align:center; margin-bottom:12px;">
        <div class="booking-code">${booking.booking_code}</div>
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; background:${statusColors[booking.status] || '#ccc'}22; color:${statusColors[booking.status] || '#333'}">${booking.status}</span>
      </div>
      <div class="booking-row"><span>Layanan</span><strong>${booking.service_name || booking.service_id}</strong></div>
      <div class="booking-row"><span>Tanggal</span><strong>${booking.slot_date}</strong></div>
      <div class="booking-row"><span>Waktu</span><strong>${booking.slot_time}</strong></div>
      <div class="booking-row"><span>No. Antrian</span><strong>${booking.queue_number || '—'}</strong></div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" id="btn-cancel-booking">Batalkan</button>
        <button class="btn btn-ghost btn-sm" id="btn-watch-queue">Pantau Live ▶</button>
      </div>
    `;

    document.getElementById('btn-cancel-booking')?.addEventListener('click', () => {
      if (!confirm('Yakin ingin membatalkan booking ini?')) return;
      sendCommand('CANCEL_BOOKING', { booking_code: booking.booking_code, nik: AppState.currentUser?.nik });
    });

    document.getElementById('btn-watch-queue')?.addEventListener('click', () => {
      sendCommand('GET_QUEUE_STATUS', { service_id: booking.service_id });
      showNotification('Pantau Antrian', 'Log aktivitas akan menampilkan posisi antrian Anda secara real-time', 'info');
    });
  }

  EventBus.on('cancelResult', (msg) => {
    if (msg.error) {
      showNotification('Gagal Batalkan', msg.error, 'error');
      return;
    }
    AppState.myBooking = null;
    document.getElementById('my-booking-detail').innerHTML = '<p class="text-muted">Booking berhasil dibatalkan.</p>';
    showNotification('Booking Dibatalkan', 'Booking Anda telah berhasil dibatalkan', 'info');
  });

  // ── Live Queue Update untuk Warga ────────────────────────────────────────────
  EventBus.on('queueUpdate', (msg) => {
    if (!AppState.myBooking) return;
    if (msg.service_id !== AppState.myBooking.service_id) return;

    if (msg.payload.event_type === 'YOUR_TURN') {
      showNotification('Giliran Anda!', 'Segera menuju loket untuk dilayani', 'success', 10000);
    }
  });
});
```

---

### 5.9 Halaman Admin

**File: `frontend/admin.html`** — Tambahkan konten berikut setelah struktur HTML standar (mirip `index.html` tapi tanpa form warga, diganti panel admin):

```html
<!-- Panel Admin Session (Command & Control Bridge) -->
<section class="card" id="admin-control-panel">
  <h2 class="card-title">Panel Kontrol Admin</h2>

  <!-- Login Admin -->
  <div id="admin-login-form">
    <div class="form-group">
      <label>ID Pegawai</label>
      <input type="text" id="admin-officer-id" placeholder="ID Pegawai" />
    </div>
    <div class="form-group">
      <label>PIN</label>
      <input type="password" id="admin-pin" placeholder="Minimal 6 digit" />
    </div>
    <button class="btn btn-primary" id="btn-admin-login">Login Admin</button>
  </div>

  <!-- Kontrol setelah login -->
  <div id="admin-controls" class="hidden">
    <p style="margin-bottom:12px; font-weight:600;">Kontrol Antrian:</p>

    <div class="form-group">
      <label>Pilih Layanan</label>
      <select id="admin-select-service">
        <option value="">-- Pilih layanan --</option>
      </select>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" id="btn-call-next">⏭ Panggil Berikutnya</button>
      <button class="btn btn-outline btn-sm" id="btn-get-stats">📊 Ambil Statistik</button>
      <button class="btn btn-danger btn-sm" id="btn-pause-service">⏸ Jeda Layanan</button>
      <button class="btn btn-outline btn-sm" id="btn-resume-service">▶ Buka Layanan</button>
    </div>

    <div class="form-group">
      <label>Broadcast Pengumuman</label>
      <input type="text" id="admin-announce-msg" placeholder="Isi pengumuman..." />
      <button class="btn btn-outline btn-sm" style="margin-top:6px;" id="btn-announce">📢 Kirim Pengumuman</button>
    </div>

    <div style="border-top:1px solid var(--color-border); padding-top:12px; margin-top:4px;">
      <p style="margin-bottom:8px; font-weight:600;">Check-in Warga:</p>
      <div class="form-group">
        <input type="text" id="admin-booking-code" placeholder="Kode Booking" />
      </div>
      <button class="btn btn-primary btn-sm" id="btn-checkin">✅ Check-in</button>
    </div>

    <button class="btn btn-ghost btn-sm" style="margin-top:12px;" id="btn-reset-quota">🔄 Reset Quota Harian</button>
  </div>
</section>
```

**File: `frontend/js/admin.js`**

```javascript
// ─── Logic Halaman Admin ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminControls  = document.getElementById('admin-controls');
  const adminSelectSvc = document.getElementById('admin-select-service');

  // ── Login Admin ──────────────────────────────────────────────────────────────
  document.getElementById('btn-admin-login')?.addEventListener('click', () => {
    const officerId = document.getElementById('admin-officer-id').value.trim();
    const pin       = document.getElementById('admin-pin').value.trim();
    if (!officerId || !pin) {
      showNotification('Data Tidak Lengkap', 'Isi ID dan PIN', 'warning');
      return;
    }
    sendCommand('ADMIN_LOGIN', { officer_id: officerId, pin });
  });

  EventBus.on('adminLoginResult', (msg) => {
    if (msg.error) {
      showNotification('Login Gagal', msg.error, 'error');
      return;
    }
    AppState.currentAdmin = msg.payload;
    adminLoginForm.classList.add('hidden');
    adminControls.classList.remove('hidden');
    showNotification('Login Berhasil', `Selamat datang, ${msg.payload.name}`, 'success');
  });

  // ── Isi Dropdown Layanan ─────────────────────────────────────────────────────
  EventBus.on('servicesLoaded', (services) => {
    if (!adminSelectSvc) return;
    adminSelectSvc.innerHTML = '<option value="">-- Pilih layanan --</option>';
    services.forEach(svc => {
      const opt = document.createElement('option');
      opt.value = svc.service_id;
      opt.textContent = svc.name;
      adminSelectSvc.appendChild(opt);
    });
  });

  function getSelectedServiceId() {
    const id = adminSelectSvc?.value;
    if (!id) showNotification('Pilih Layanan', 'Pilih layanan terlebih dahulu', 'warning');
    return id;
  }

  // ── Tombol-tombol Kontrol ────────────────────────────────────────────────────
  document.getElementById('btn-call-next')?.addEventListener('click', () => {
    const id = getSelectedServiceId();
    if (id) sendCommand('CALL_NEXT', { service_id: id });
  });

  document.getElementById('btn-get-stats')?.addEventListener('click', () => {
    sendCommand('GET_STATS_STREAM');
  });

  document.getElementById('btn-pause-service')?.addEventListener('click', () => {
    const id = getSelectedServiceId();
    if (id) sendCommand('PAUSE_SERVICE', { service_id: id });
  });

  document.getElementById('btn-resume-service')?.addEventListener('click', () => {
    const id = getSelectedServiceId();
    if (id) sendCommand('RESUME_SERVICE', { service_id: id });
  });

  document.getElementById('btn-announce')?.addEventListener('click', () => {
    const id  = getSelectedServiceId();
    const msg = document.getElementById('admin-announce-msg')?.value.trim();
    if (!id || !msg) return;
    sendCommand('ANNOUNCE', { service_id: id, message: msg });
    document.getElementById('admin-announce-msg').value = '';
  });

  document.getElementById('btn-checkin')?.addEventListener('click', () => {
    const code = document.getElementById('admin-booking-code')?.value.trim();
    if (!code) {
      showNotification('Kode Kosong', 'Masukkan kode booking', 'warning');
      return;
    }
    sendCommand('CHECKIN_CITIZEN', { booking_code: code });
  });

  document.getElementById('btn-reset-quota')?.addEventListener('click', () => {
    if (!confirm('Reset quota harian SEMUA layanan? Tindakan ini tidak bisa dibatalkan.')) return;
    sendCommand('RESET_DAILY_QUOTA', { service_id: 'ALL' });
  });

  // ── Tampilkan Hasil Admin Event ──────────────────────────────────────────────
  EventBus.on('adminEvent', (payload) => {
    const type = payload.event_type;
    if (type === 'ACK')            showNotification('Berhasil', 'Perintah berhasil dijalankan', 'success');
    if (type === 'ERROR')          showNotification('Gagal', payload.data?.message || 'Error', 'error');
    if (type === 'STATS_SNAPSHOT') showNotification('Statistik', `Dilayani hari ini: ${payload.data?.total_served_today || 0}`, 'info');
  });

  EventBus.on('checkinResult', (msg) => {
    if (msg.error) showNotification('Check-in Gagal', msg.error, 'error');
    else {
      showNotification('Check-in Berhasil', `Warga berhasil check-in`, 'success');
      document.getElementById('admin-booking-code').value = '';
    }
  });

  EventBus.on('walkInResult', (msg) => {
    if (msg.error) showNotification('Walk-in Gagal', msg.error, 'error');
    else showNotification('Walk-in Berhasil', `Nomor antrian: ${msg.payload.queue_number}`, 'success');
  });

  EventBus.on('resetQuotaResult', (msg) => {
    if (msg.error) showNotification('Reset Gagal', msg.error, 'error');
    else showNotification('Quota Direset', 'Quota semua layanan berhasil direset', 'success');
  });
});
```

---

## 6. Protokol Pesan WebSocket

Semua pesan antara browser dan gateway menggunakan format JSON. Berikut adalah daftar lengkap tipe pesan:

### Dari Browser ke Gateway (Commands)

| `cmd` | `payload` | Keterangan |
|-------|-----------|------------|
| `REGISTER_CITIZEN` | `{ nik, name, phone, address }` | Daftar akun baru |
| `LOGIN_CITIZEN` | `{ nik }` | Login warga |
| `LIST_SERVICES` | `{}` | Ambil semua layanan |
| `GET_SERVICE_DETAIL` | `{ service_id }` | Detail satu layanan |
| `GET_AVAILABLE_SLOTS` | `{ service_id, date }` | Slot tersedia |
| `GET_ANNOUNCEMENTS` | `{}` | Semua pengumuman |
| `CREATE_BOOKING` | `{ nik, service_id, slot_id }` | Buat booking |
| `CANCEL_BOOKING` | `{ booking_code, nik }` | Batalkan booking |
| `GET_MY_BOOKING` | `{ nik }` | Booking milik saya |
| `RESCHEDULE_BOOKING` | `{ booking_code, new_slot_id }` | Reschedule |
| `GET_QUEUE_STATUS` | `{ service_id }` | Status antrian |
| `ADMIN_LOGIN` | `{ officer_id, pin }` | Login admin |
| `GET_SYSTEM_STATS` | `{}` | Statistik sistem |
| `CALL_NEXT` | `{ service_id }` | Panggil antrian berikutnya |
| `ANNOUNCE` | `{ service_id, message }` | Broadcast pengumuman |
| `PAUSE_SERVICE` | `{ service_id }` | Jeda layanan |
| `RESUME_SERVICE` | `{ service_id }` | Buka layanan |
| `GET_STATS_STREAM` | `{}` | Minta statistik via BiDi |
| `CHECKIN_CITIZEN` | `{ booking_code }` | Check-in warga |
| `WALK_IN_CITIZEN` | `{ ... }` | Pendaftaran walk-in |
| `RESET_DAILY_QUOTA` | `{ service_id }` | Reset quota |

### Dari Gateway ke Browser (Events)

| `type` | Sumber | Keterangan |
|--------|--------|------------|
| `CONNECTED` | Gateway | Konfirmasi koneksi berhasil |
| `HEARTBEAT` | Push Scheduler | Keep-alive setiap 30 detik |
| `QUEUE_UPDATE` | gRPC Stream | Update posisi antrian real-time |
| `STATS_PUSH` | Push Scheduler | Statistik dikirim otomatis tiap 5 detik |
| `SERVICES_STATUS_UPDATE` | Push Scheduler | Status semua layanan tiap 8 detik |
| `NEW_ANNOUNCEMENT` | Push Scheduler | Pengumuman baru (server-initiated) |
| `ADMIN_EVENT` | gRPC BiDi | Response dari perintah admin |
| `ADMIN_SESSION_ERROR` | Gateway | Error pada admin session |
| `ERROR` | Gateway | Pesan error umum |
| `*_RESULT` | Gateway | Response dari semua unary command |

---

## 7. Mapping Fitur Tugas ke Implementasi

### Fitur Wajib 1 — Streaming gRPC ke WebSocket

**Implementasi:** `gateway/streamBridge.js` → fungsi `subscribeToQueue()`

Saat gateway start, `startStreamBridge()` memanggil `clients.serviceInfo.ListServices()` untuk mendapatkan semua layanan, lalu memanggil `subscribeToQueue()` untuk setiap layanan. Fungsi ini membuat koneksi `QueueService.WatchQueue` yang persistent. Setiap event yang diterima dari gRPC langsung di-broadcast ke semua WebSocket client dengan tipe pesan `QUEUE_UPDATE`.

**Di frontend:** `ws-client.js` menerima `QUEUE_UPDATE` dan meneruskannya ke EventBus, yang kemudian diambil oleh komponen grafik, log, dan status indicator.

---

### Fitur Wajib 2 — Event-Driven UI (minimal 3 komponen)

| # | Komponen | File | Event yang Memicunya |
|---|----------|------|----------------------|
| 1 | **Status Indikator** badge per layanan | `status-indicator.js` | `SERVICES_STATUS_UPDATE`, `QUEUE_UPDATE` |
| 2 | **Grafik Antrian** bar chart real-time | `chart.js` | `STATS_PUSH`, `QUEUE_UPDATE` |
| 3 | **Activity Log** feed event | `activity-log.js` | Semua event bertipe `QUEUE_UPDATE`, `NEW_ANNOUNCEMENT`, dll. |

Ketiga komponen ini **tidak pernah di-refresh secara manual** — semuanya berubah berdasarkan pesan WebSocket.

---

### Fitur Wajib 3 — Server-Initiated Events

**Implementasi:** `gateway/pushScheduler.js`

Gateway menjalankan empat interval secara paralel tanpa menunggu permintaan dari browser:
- **Stats Pusher** — mengirim `STATS_PUSH` setiap 5 detik
- **Service Status Pusher** — mengirim `SERVICES_STATUS_UPDATE` setiap 8 detik
- **Announcement Pusher** — mengecek pengumuman baru dan mengirim `NEW_ANNOUNCEMENT` jika ada yang baru
- **Heartbeat** — mengirim `HEARTBEAT` setiap 30 detik

Browser menampilkan toast notification untuk `NEW_ANNOUNCEMENT` tanpa perlu me-refresh atau meminta apapun.

---

### Fitur Wajib 4 — Command & Control Bridge

**Implementasi:** `gateway/commandHandler.js` + `frontend/js/admin.js`

Saat tombol "Panggil Berikutnya" ditekan di browser:
1. `admin.js` memanggil `sendCommand('CALL_NEXT', { service_id })`
2. `ws-client.js` mengirim `{ cmd: 'CALL_NEXT', payload: { service_id } }` via WebSocket
3. `wsManager.js` menerima dan memanggil `handleCommand()`
4. `commandHandler.js` memanggil `adminSession.write({ command_type: 'CALL_NEXT', service_id })`
5. gRPC server memproses dan mengirim event `QUEUE_UPDATE` ke semua subscriber
6. `streamBridge.js` meneruskan update itu ke semua browser via WebSocket

Seluruh siklus ini terjadi dalam milidetik dan tidak memerlukan refresh halaman.

---

## 8. Cara Menjalankan Sistem Lengkap

### Urutan Start (WAJIB diikuti)

```bash
# Terminal 1 — Jalankan gRPC server SiAntre
cd SiAntre
npm run server

# Terminal 2 — Jalankan WebSocket Gateway
cd SiAntre/gateway
node index.js
# atau: npm start

# Browser — Buka frontend
# Warga:  http://localhost:3001/index.html
# Admin:  http://localhost:3001/admin.html
```

### Skenario Demo Lengkap (End-to-End)

**Langkah 1 — Inisialisasi sistem (wajib pertama kali)**

```
Buka http://localhost:3001/admin.html
→ Form Login Admin: masukkan ID dan PIN admin pertama
  (atau gunakan CLI: npm run admin → Daftar Petugas Baru)
```

**Langkah 2 — Daftar dan booking sebagai warga**

```
Buka http://localhost:3001/index.html (tab baru atau browser lain)
→ Tab "Daftar": isi NIK, Nama, HP, Alamat → klik Daftar
→ Tab "Masuk": masukkan NIK → klik Masuk
→ Pilih layanan → pilih slot → klik Pesan Sekarang
→ Kode booking muncul di panel "Booking Saya"
```

**Langkah 3 — Pantau event real-time**

```
Tetap di halaman warga
→ Perhatikan:
   - Grafik antrian berubah otomatis (dari STATS_PUSH tiap 5 detik)
   - Activity Log menampilkan semua event
   - Status badge layanan berubah sesuai kondisi
```

**Langkah 4 — Operasi admin (Command & Control)**

```
Di halaman admin:
→ Login
→ Pilih layanan → klik "Panggil Berikutnya"
→ Tulis pengumuman → klik "Kirim Pengumuman"
→ Klik "Jeda Layanan" / "Buka Layanan"

Lihat di halaman warga:
→ Activity log menampilkan event secara real-time
→ Status badge layanan berubah
→ Toast notification muncul saat ada pengumuman baru
→ Jika giliran warga tiba: toast khusus "Giliran Anda!"
```

---

## 9. Troubleshooting

### Gateway tidak bisa terhubung ke gRPC server

```
Error: UNAVAILABLE: Connection refused
```

**Solusi:** Pastikan gRPC server berjalan dulu (`npm run server`) sebelum menjalankan gateway. Gateway memiliki auto-retry untuk `startStreamBridge` — ia akan mencoba ulang setiap 3 detik.

---

### Error "Cannot find package 'ws'"

```bash
cd gateway && npm install
```

---

### Nama service tidak ditemukan di proto

Jika muncul error seperti:
```
Error: serviceInfoProto.ServiceInfoService is not a constructor
```

**Solusi:** Buka file `service_info.proto` dan perhatikan baris `package` dan `service`. Contoh:
```proto
package siantre;
service ServiceInfoService { ... }
```
Maka di `grpcClients.js` aksesnya adalah:
```javascript
new serviceInfoProto.siantre.ServiceInfoService(grpcAddr, creds)
```

---

### WebSocket terhubung tapi tidak ada event masuk

Kemungkinan: stream bridge gagal subscribe karena admin belum diinisialisasi. Periksa log terminal gateway — akan ada pesan "Belum ada layanan". Inisialisasi sistem via CLI admin atau melalui halaman admin terlebih dahulu.

---

### Chart.js tidak muncul

Pastikan koneksi internet ada untuk memuat Chart.js dari CDN. Atau unduh dan simpan secara lokal:
```html
<script src="js/lib/chart.umd.min.js"></script>
```

---

## 10. Referensi & Dependensi

### Dependensi Gateway Baru

| Package | Versi | Fungsi |
|---------|-------|--------|
| `ws` | ^8.16.0 | WebSocket server library |
| `express` | ^4.18.0 | HTTP server & static file serving |
| `@grpc/grpc-js` | ^1.10.0 | Sudah ada di server, install ulang di gateway |
| `@grpc/proto-loader` | ^0.7.0 | Sudah ada di server, install ulang di gateway |

### Dependensi Frontend (CDN)

| Library | Versi | Fungsi |
|---------|-------|--------|
| Chart.js | 4.4.0 | Grafik antrian bar chart |

### Port yang Digunakan

| Port | Komponen | Keterangan |
|------|----------|------------|
| `50051` | gRPC Server | Server SiAntre (tidak berubah) |
| `3001` | WebSocket Gateway | HTTP + WS dalam satu port |

### Referensi Dokumentasi

- [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ws library (npm)](https://www.npmjs.com/package/ws)
- [Chart.js Dokumentasi](https://www.chartjs.org/docs/)
- [gRPC Node.js (@grpc/grpc-js)](https://www.npmjs.com/package/@grpc/grpc-js)
- [gRPC Streaming Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/#server-streaming-rpc)

---

*Panduan ini mencakup seluruh implementasi fitur wajib tugas integrasi sistem. Semua kode di atas dapat langsung digunakan dan disesuaikan dengan nama package proto yang ada di proyek SiAntre kamu.*
