# SiAntre — Frontend & WebSocket Implementation Guide (FINAL)

> Panduan implementasi WebSocket Gateway + Web UI untuk SiAntre  
> **Versi Final** — Konsolidasi v1 · v2 (bug fixes + arsitektur) · v3 (MDN fixes + stack FE baru)

---

## Ringkasan Revisi v1 → v2 → v3 (yang sudah diterapkan di dokumen ini)

| # | Kategori | Perubahan | File |
|---|----------|-----------|------|
| 1 | 🔴 Bug Kritis | Namespace proto salah → akses via `.siantre.ServiceName` | `grpcClients.js` |
| 2 | 🔴 Bug Kritis | Command `LOGIN` invalid di BiDi stream → dihapus | `commandHandler.js` |
| 3 | 🔴 Bug Kritis | Field `officer_id` → `id_pegawai` end-to-end | `commandHandler.js`, `admin.js`, `admin.html` |
| 4 | 🔴 Bug Kritis | `s.status` undefined → konversi eksplisit `is_open` → string | `pushScheduler.js`, `status-indicator.js` |
| 5 | 🟡 Arsitektur | Admin session singleton → `Map<clientId, session>` per koneksi | `commandHandler.js` |
| 6 | 🟡 Arsitektur | `YOUR_TURN` broadcast → targeted delivery via `citizenId` | `streamBridge.js`, `wsManager.js` |
| 7 | 🟡 Desain | `queue_number=0` catatan + fallback `GET_STATS` | `streamBridge.js` |
| 8 | 🟡 Desain | Initial snapshot saat connect (UI tidak kosong 5–8 detik) | `pushScheduler.js`, `wsManager.js` |
| 9 | 🟡 Desain | Admin BiDi session auto-reconnect setelah 5 detik | `commandHandler.js` |
| 10 | 🟢 Fitur Baru | Manajemen petugas via Web (Register/Update/Delete/List) | `commandHandler.js`, `admin.html`, `admin.js` |
| 11 | 🟢 Fitur Baru | `IsSystemInitialized` check + banner + setup form | `commandHandler.js`, `admin.js`, `admin.html` |
| 12 | 🟢 Keamanan | CORS middleware di gateway via env `ALLOWED_ORIGIN` | `index.js` |
| 13 | 🟢 Verifikasi | Fallback field `latest.id \|\| latest.announcement_id` | `pushScheduler.js` |
| M1 | 🔴 MDN WebSocket | Magic number `1` → `WebSocket.OPEN` / `WS_OPEN` | `ws-client.js`, `commandHandler.js` |
| M2 | 🔴 MDN WebSocket | `CloseEvent` dibaca — reconnect selektif per close code | `ws-client.js` |
| M3 | 🔴 MDN WebSocket | `wss://` auto-detect dari `window.location.protocol` | `ws-client.js` |
| M4 | 🟡 MDN WebSocket | `addEventListener` menggantikan `oneventname` | `ws-client.js` |
| M5 | 🟡 MDN WebSocket | `bufferedAmount` dicek sebelum `send()` (16 KB threshold) | `ws-client.js` |
| M6 | 🟡 MDN WebSocket | `beforeunload` tutup koneksi bersih + `visibilitychange` pause | `ws-client.js` |
| FE1 | 🟢 Stack FE | DaisyUI via CDN — menggantikan seluruh `style.css` custom | `index.html`, `admin.html` |
| FE2 | 🟢 Stack FE | anime.js — flip angka antrian + spring toast YOUR_TURN | `queue-animation.js`, `notification.js` |
| FE3 | 🟢 Stack FE | ApexCharts — menggantikan Chart.js, animasi update lebih halus | `chart.js` |
| FE4 | 🟢 Stack FE | Web Audio API — notifikasi suara YOUR_TURN (bawaan browser) | `notification.js` |

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
   - [5.1 Struktur HTML Utama — Halaman Warga (DaisyUI)](#51-struktur-html-utama--halaman-warga-daisyui)
   - [5.2 Stylesheet Global (Minimal)](#52-stylesheet-global-minimal)
   - [5.3 WebSocket Client & State Management (MDN Fixes)](#53-websocket-client--state-management-mdn-fixes)
   - [5.4 Komponen: Grafik Antrian Live — ApexCharts](#54-komponen-grafik-antrian-live--apexcharts)
   - [5.5 Komponen: Activity Log](#55-komponen-activity-log)
   - [5.6 Komponen: Status Indikator Layanan](#56-komponen-status-indikator-layanan)
   - [5.7 Komponen: Notifikasi — anime.js + Web Audio API](#57-komponen-notifikasi--animejs--web-audio-api)
   - [5.8 Komponen: Animasi Nomor Antrian — anime.js](#58-komponen-animasi-nomor-antrian--animejs)
   - [5.9 Halaman Warga](#59-halaman-warga)
   - [5.10 Halaman Admin (DaisyUI)](#510-halaman-admin-daisyui)
   - [5.11 Logic Halaman Admin](#511-logic-halaman-admin)
6. [Protokol Pesan WebSocket](#6-protokol-pesan-websocket)
7. [Mapping Fitur Tugas ke Implementasi](#7-mapping-fitur-tugas-ke-implementasi)
8. [Cara Menjalankan Sistem Lengkap](#8-cara-menjalankan-sistem-lengkap)
9. [Troubleshooting](#9-troubleshooting)
10. [Referensi & Dependensi](#10-referensi--dependensi)

---

## 1. Gambaran Arsitektur

Browser tidak bisa berbicara langsung dengan gRPC server karena gRPC menggunakan HTTP/2 dengan binary framing yang tidak didukung natively oleh browser. Solusinya adalah sebuah **WebSocket Gateway** — proses Node.js tambahan yang bertindak sebagai jembatan tiga lapis.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Port 3001)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Grafik      │  │ Activity Log │  │  Status    │  │  Panel Admin       │ │
│  │  Antrian     │  │  (Event Feed)│  │  Indikator │  │  (Commands +       │ │
│  │ (ApexCharts) │  │              │  │  per Svc   │  │   Officer Mgmt)    │ │
│  └──────────────┘  └──────────────┘  └────────────┘  └────────────────────┘ │
│         │                  │                │                  │              │
│         └──────────────────┴────────────────┴──────────────────┘             │
│                DaisyUI · anime.js · ApexCharts · Web Audio API               │
│                   WebSocket API (built-in browser, MDN-compliant)            │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ ws:// atau wss:// (auto-detect) ke port 3001
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET GATEWAY (Port 3001)                           │
│                          gateway/index.js                                    │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  WS Server       │  │  Stream Bridge   │  │  Push Scheduler           │  │
│  │  (ws library)    │  │  gRPC → WS fanout│  │  Server-initiated events  │  │
│  │  + Session Store │  │  WatchQueue sub  │  │  Stats, status, heartbeat │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐                                  │
│  │  Command Handler │  │  gRPC Clients    │                                  │
│  │  Per-conn session│  │  namespace fix   │                                  │
│  └──────────────────┘  └──────────────────┘                                  │
│                          │ @grpc/grpc-js (package siantre.*)                 │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │ localhost:50051
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GRPC SERVER (Port 50051)                              │
│                     SiAntre — server/index.js (TIDAK DIUBAH)                 │
│  ServiceInfoService │ BookingService │ QueueService │ AdminService            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Alur Data per Fitur Tugas

| Fitur | Arah Data | Komponen yang Terlibat |
|-------|-----------|------------------------|
| Streaming gRPC → WebSocket | Server → Gateway → Browser | `WatchQueue` stream, `streamBridge.js`, grafik ApexCharts |
| Event-Driven UI (3 komponen) | Server → Browser | Grafik, Activity Log, Status Badge |
| Server-Initiated Events | Gateway → Browser (tanpa request) | `pushScheduler.js`, notifikasi anime.js |
| Command & Control Bridge | Browser → Gateway → gRPC | Panel admin, `commandHandler.js`, AdminSession per-koneksi |

### Poin Arsitektur Penting

- **Admin Session per-koneksi** — `commandHandler.js` menyimpan `Map<clientId, adminSession>` bukan singleton global. Multi-admin dari browser berbeda bisa berjalan bersamaan.
- **Session State per Client** — `wsManager.js` menyimpan `{ clientId, citizenId, role }` per koneksi untuk targeted delivery `YOUR_TURN`.
- **Initial Snapshot** — Saat client baru terhubung, gateway langsung mengirimkan state terkini dalam 300ms tanpa menunggu interval push scheduler.

---

## 2. Prasyarat & Setup Awal

### Prasyarat Sistem

- **Node.js** v18 atau lebih baru
- **npm** v8+
- gRPC server SiAntre sudah bisa dijalankan (`npm run server`)
- Browser modern (Chrome, Firefox, Edge)

### Verifikasi gRPC Server Berjalan

```bash
cd SiAntre
npm run server
# Pastikan muncul: gRPC server running on 0.0.0.0:50051
```

> **Penting:** Gateway **harus dijalankan setelah** gRPC server. Gateway memiliki mekanisme auto-retry jika server belum siap, namun urutan start tetap penting.

---

## 3. Struktur Direktori Akhir

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
├── client/                         # Tidak diubah (CLI lama tetap berfungsi)
│   ├── warga.js
│   └── admin.js
│
├── gateway/                        # BARU — WebSocket Bridge
│   ├── package.json
│   ├── index.js                    # Entry point gateway
│   ├── grpcClients.js              # Inisialisasi gRPC stubs (namespace fix)
│   ├── streamBridge.js             # gRPC stream → WS broadcast + targeted delivery
│   ├── commandHandler.js           # WS command → gRPC (per-conn session + M1 fix)
│   ├── pushScheduler.js            # Server-initiated events + initial snapshot
│   └── wsManager.js                # WebSocket server & per-client state registry
│
└── frontend/                       # BARU — Web UI
    ├── index.html                  # Halaman warga (DaisyUI + ApexCharts + anime.js)
    ├── admin.html                  # Halaman admin (DaisyUI)
    ├── css/
    │   └── style.css               # Override minimal (DaisyUI handle base)
    └── js/
        ├── ws-client.js            # WebSocket client — 6 MDN fixes
        ├── chart.js                # Grafik antrian — ApexCharts
        ├── queue-animation.js      # Flip angka antrian — anime.js (baru)
        ├── activity-log.js         # Komponen log aktivitas
        ├── status-indicator.js     # Badge status layanan — DaisyUI classes
        ├── notification.js         # Toast — anime.js spring + Web Audio API
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
npm install ws express cors @grpc/grpc-js @grpc/proto-loader
```

**File: `gateway/package.json`**

```json
{
  "name": "siantre-gateway",
  "version": "3.0.0",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.10.0",
    "@grpc/proto-loader": "^0.7.0",
    "cors": "^2.8.5",
    "express": "^4.18.0",
    "ws": "^8.16.0"
  }
}
```

---

### 4.2 Entry Point Gateway

**File: `gateway/index.js`**

```javascript
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
    status: 'ok',
    time: new Date(),
    grpc_addr: GRPC_ADDR,
  }));

  // 3. Buat HTTP server
  const server = http.createServer(app);

  // 4. Inisialisasi WebSocket server & command handler
  initWsServer(server, clients);
  console.log('[Gateway] WebSocket server siap');

  // 5. Mulai stream bridge
  startStreamBridge(clients);
  console.log('[Gateway] Stream bridge aktif');

  // 6. Mulai push scheduler
  startPushScheduler(clients);
  console.log('[Gateway] Push scheduler aktif');

  // 7. Jalankan server
  server.listen(PORT, () => {
    console.log(`[Gateway] Berjalan di http://localhost:${PORT}`);
    console.log(`[Gateway] WebSocket tersedia di ws://localhost:${PORT}`);
    console.log(`[Gateway] Warga: http://localhost:${PORT}/index.html`);
    console.log(`[Gateway] Admin:  http://localhost:${PORT}/admin.html`);
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

> **BUG #1 DIPERBAIKI:** Semua file `.proto` SiAntre menggunakan `package siantre;`. Akses service harus melalui namespace `.siantre.ServiceName`, bukan langsung `proto.ServiceName`.

```javascript
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
 * PERBAIKAN BUG #1:
 * Semua file .proto SiAntre menggunakan `package siantre;`
 * Akses service: proto.siantre.NamaService  ← BENAR
 * Bukan:         proto.NamaService           ← SALAH (versi lama)
 *
 * Cara verifikasi: buka setiap file .proto, cari baris `package`.
 * Jika ada `package siantre;`, akses melalui proto.siantre.*
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
```

---

### 4.4 Stream Bridge (gRPC → WebSocket)

**File: `gateway/streamBridge.js`**

> **PERBAIKAN DESAIN #6 (Targeted Delivery):** Event `YOUR_TURN` dikirim hanya ke WebSocket client yang memiliki `citizenId` cocok, bukan broadcast ke semua.

```javascript
'use strict';

const { broadcast, sendToClientByCitizenId } = require('./wsManager');

const activeStreams = new Map();

/**
 * Subscribe ke WatchQueue untuk service_id tertentu.
 *
 * CATATAN queue_number = 0:
 * Nilai 0 digunakan sebagai sinyal agar server mengirimkan semua event antrian.
 * Server harus menangani nilai 0 di queueService.js (implementasi WatchQueue).
 * Jika server tidak mendukung nilai 0, alternatifnya adalah menggunakan
 * AdminSession.GET_STATS untuk polling status antrian.
 */
function subscribeToQueue(clients, serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;

  if (activeStreams.has(streamKey)) {
    console.log(`[StreamBridge] Stream ${streamKey} sudah aktif, skip.`);
    return;
  }

  console.log(`[StreamBridge] Subscribing ke WatchQueue: service=${serviceId}`);

  const stream = clients.queue.WatchQueue({
    service_id:   serviceId,
    queue_number: queueNumber,
  });

  stream.on('data', (update) => {
    console.log(`[StreamBridge] Event [${serviceId}]: ${update.event_type}`);

    const payload = {
      type:       'QUEUE_UPDATE',
      service_id: serviceId,
      payload: {
        event_type:     update.event_type,
        current_number: update.current_number,
        your_number:    update.your_number,
        waiting_count:  update.waiting_count,
        message:        update.message,
        timestamp:      new Date().toISOString(),
      },
    };

    // PERBAIKAN DESAIN #6:
    // YOUR_TURN → dikirim HANYA ke warga bersangkutan (via citizen_id)
    // Event lain → broadcast ke semua client
    if (update.event_type === 'YOUR_TURN' && update.citizen_id) {
      sendToClientByCitizenId(update.citizen_id, payload);

      // Broadcast versi umum tanpa data personal ke semua client
      broadcast({
        type:       'QUEUE_UPDATE',
        service_id: serviceId,
        payload: {
          event_type:     'QUEUE_MOVED',
          current_number: update.current_number,
          waiting_count:  update.waiting_count,
          timestamp:      new Date().toISOString(),
        },
      });
    } else {
      broadcast(payload);
    }
  });

  stream.on('error', (err) => {
    console.error(`[StreamBridge] Error stream ${streamKey}:`, err.message);
    activeStreams.delete(streamKey);
    // Auto-reconnect setelah 5 detik
    setTimeout(() => subscribeToQueue(clients, serviceId, queueNumber), 5000);
  });

  stream.on('end', () => {
    console.log(`[StreamBridge] Stream ${streamKey} berakhir.`);
    activeStreams.delete(streamKey);
    // Reconnect jika stream berakhir tiba-tiba
    setTimeout(() => subscribeToQueue(clients, serviceId, queueNumber), 3000);
  });

  activeStreams.set(streamKey, stream);
}

function unsubscribeFromQueue(serviceId, queueNumber = 0) {
  const streamKey = `queue:${serviceId}:${queueNumber}`;
  const stream    = activeStreams.get(streamKey);
  if (stream) {
    stream.cancel();
    activeStreams.delete(streamKey);
    console.log(`[StreamBridge] Stream ${streamKey} dihentikan.`);
  }
}

function startStreamBridge(clients) {
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err) {
      console.error('[StreamBridge] Gagal ambil daftar layanan:', err.message);
      console.log('[StreamBridge] Retry dalam 3 detik...');
      setTimeout(() => startStreamBridge(clients), 3000);
      return;
    }

    const services = response.services || [];
    console.log(`[StreamBridge] ${services.length} layanan ditemukan, memulai subscription...`);

    services.forEach(svc => subscribeToQueue(clients, svc.service_id));

    if (services.length === 0) {
      console.log('[StreamBridge] Belum ada layanan. Retry dalam 5 detik...');
      setTimeout(() => startStreamBridge(clients), 5000);
    }
  });
}

module.exports = { startStreamBridge, subscribeToQueue, unsubscribeFromQueue };
```

---

### 4.5 Command Handler (WebSocket → gRPC)

**File: `gateway/commandHandler.js`**

> **BUG #2 DIPERBAIKI:** Tidak ada lagi command `LOGIN` dikirim ke BiDi stream. Autentikasi selesai via `LoginOfficer` unary.
>
> **BUG #3 DIPERBAIKI:** Field `id_pegawai` (bukan `officer_id`) digunakan end-to-end.
>
> **DESAIN #5 DIPERBAIKI:** `Map<clientId, session>` per koneksi — bukan singleton.
>
> **DESAIN #9 DIPERBAIKI:** Auto-reconnect admin session setelah 5 detik.
>
> **FIX M1:** `WS_OPEN` konstanta bernama menggantikan magic number `1`.

```javascript
'use strict';

// FIX M1: Import konstanta readyState dari library ws
// Menggantikan magic number 1 yang tidak jelas
const { OPEN: WS_OPEN } = require('ws');

const { broadcast, sendToClient, getClientState, setClientState } = require('./wsManager');

// PERBAIKAN #5: Satu session per koneksi, bukan singleton global
// Map<clientId, { session: grpc.ClientDuplexStream, active: boolean }>
const adminSessions = new Map();

// ── Admin Session Management ──────────────────────────────────────────────────

/**
 * Membuka BiDi AdminSession untuk satu koneksi admin.
 * Dipanggil setelah LoginOfficer berhasil.
 *
 * PERBAIKAN BUG #2:
 * TIDAK ada command 'LOGIN' yang ditulis ke stream.
 * Autentikasi sudah selesai via unary LoginOfficer.
 * Stream langsung siap menerima: CALL_NEXT, ANNOUNCE, PAUSE, RESUME, GET_STATS.
 */
function startAdminSession(ws, clients) {
  const state    = getClientState(ws);
  const clientId = state?.clientId;
  if (!clientId) return;

  // Jangan buka duplikat session untuk client yang sama
  if (adminSessions.has(clientId) && adminSessions.get(clientId).active) {
    console.log(`[CommandHandler] Session untuk ${clientId} sudah aktif.`);
    return;
  }

  console.log(`[CommandHandler] Membuka AdminSession untuk client: ${clientId}`);

  const session = clients.admin.AdminSession();
  adminSessions.set(clientId, { session, active: true, clients, ws });

  // Terima event dari server
  session.on('data', (event) => {
    console.log(`[CommandHandler] AdminEvent [${clientId}]:`, event.event_type);
    sendToClient(ws, {
      type: 'ADMIN_EVENT',
      payload: {
        event_type: event.event_type,
        data:       event,
        timestamp:  new Date().toISOString(),
      },
    });
  });

  session.on('error', (err) => {
    console.error(`[CommandHandler] AdminSession error [${clientId}]:`, err.message);
    const entry = adminSessions.get(clientId);
    if (entry) entry.active = false;

    sendToClient(ws, {
      type:    'ADMIN_SESSION_ERROR',
      payload: { message: err.message },
    });

    // PERBAIKAN DESAIN #9: Auto-reconnect setelah 5 detik
    console.log(`[CommandHandler] Mencoba reconnect AdminSession ${clientId} dalam 5s...`);
    setTimeout(() => {
      // FIX M1: Gunakan konstanta WS_OPEN bukan magic number 1
      if (ws.readyState === WS_OPEN) {
        startAdminSession(ws, clients);
      }
    }, 5000);
  });

  session.on('end', () => {
    console.log(`[CommandHandler] AdminSession [${clientId}] berakhir.`);
    const entry = adminSessions.get(clientId);
    if (entry) entry.active = false;
  });
}

/**
 * Mengirim perintah ke AdminSession milik client tertentu.
 */
function sendAdminCommand(ws, command) {
  const state    = getClientState(ws);
  const clientId = state?.clientId;
  const entry    = adminSessions.get(clientId);

  if (!entry || !entry.active || !entry.session) {
    sendToClient(ws, {
      type:    'ERROR',
      payload: { message: 'Admin session belum aktif. Silakan login terlebih dahulu.' },
    });
    return;
  }

  console.log(`[CommandHandler] Command → AdminSession [${clientId}]:`, command.command_type);
  entry.session.write(command);
}

/**
 * Bersihkan session admin saat client disconnect.
 * Dipanggil dari wsManager.
 */
function cleanupAdminSession(clientId) {
  const entry = adminSessions.get(clientId);
  if (entry && entry.session) {
    try { entry.session.end(); } catch (_) {}
    adminSessions.delete(clientId);
    console.log(`[CommandHandler] Session admin ${clientId} dibersihkan.`);
  }
}

// ── Main Command Router ───────────────────────────────────────────────────────

function handleCommand(message, ws, clients) {
  const { cmd, payload } = message;
  console.log(`[CommandHandler] Command: ${cmd}`);

  switch (cmd) {

    // ── ServiceInfo (Unary) ─────────────────────────────────────────────────

    case 'REGISTER_CITIZEN':
      clients.serviceInfo.RegisterCitizen(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LOGIN_CITIZEN':
      clients.serviceInfo.LoginCitizen(payload, (err, res) => {
        if (!err && res) {
          // Simpan citizen_id di state untuk targeted delivery YOUR_TURN (Perbaikan #6)
          const state = getClientState(ws);
          if (state) {
            state.citizenId = res.citizen_id;
            state.role = 'CITIZEN';
            setClientState(ws, state);
          }
        }
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

    // ── Booking (Unary) ──────────────────────────────────────────────────────

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

    // ── Queue (Unary) ────────────────────────────────────────────────────────

    case 'GET_QUEUE_STATUS':
      clients.queue.GetQueueStatus(payload, (err, res) => {
        sendToClient(ws, { type: 'QUEUE_STATUS', error: err?.message, payload: res });
      });
      break;

    // ── Admin Unary ──────────────────────────────────────────────────────────

    case 'CHECK_SYSTEM_INITIALIZED':
      // Cek apakah sistem sudah punya petugas terdaftar
      clients.admin.IsSystemInitialized({}, (err, res) => {
        sendToClient(ws, { type: 'SYSTEM_INIT_STATUS', error: err?.message, payload: res });
      });
      break;

    case 'ADMIN_LOGIN':
      // PERBAIKAN BUG #3: Gunakan id_pegawai (bukan officer_id)
      clients.admin.LoginOfficer(payload, (err, res) => {
        if (err) {
          sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', error: err.message });
          return;
        }
        // Simpan info admin ke client state
        const state = getClientState(ws);
        if (state) {
          state.officerId = res.id_pegawai;
          state.role      = res.role;
          setClientState(ws, state);
        }
        sendToClient(ws, { type: 'ADMIN_LOGIN_RESULT', payload: res });

        // PERBAIKAN BUG #2: Buka BiDi session TANPA mengirim command LOGIN
        // Autentikasi sudah selesai via LoginOfficer di atas
        startAdminSession(ws, clients);
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

    // Manajemen Petugas via Web
    case 'REGISTER_OFFICER':
      clients.admin.RegisterOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'UPDATE_OFFICER':
      clients.admin.UpdateOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'UPDATE_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'DELETE_OFFICER':
      clients.admin.DeleteOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'DELETE_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'LIST_OFFICERS':
      clients.admin.ListOfficers(payload || {}, (err, res) => {
        sendToClient(ws, { type: 'OFFICERS_LIST', error: err?.message, payload: res });
      });
      break;

    // ── BiDi Stream Commands ─────────────────────────────────────────────────
    // Semua diteruskan ke AdminSession milik koneksi ini

    case 'CALL_NEXT':
      sendAdminCommand(ws, { command_type: 'CALL_NEXT', service_id: payload.service_id });
      break;

    case 'ANNOUNCE':
      sendAdminCommand(ws, { command_type: 'ANNOUNCE', service_id: payload.service_id, message: payload.message });
      break;

    case 'PAUSE_SERVICE':
      sendAdminCommand(ws, { command_type: 'PAUSE', service_id: payload.service_id });
      break;

    case 'RESUME_SERVICE':
      sendAdminCommand(ws, { command_type: 'RESUME', service_id: payload.service_id });
      break;

    case 'GET_STATS_STREAM':
      sendAdminCommand(ws, { command_type: 'GET_STATS' });
      break;

    default:
      console.warn('[CommandHandler] Command tidak dikenal:', cmd);
      sendToClient(ws, { type: 'ERROR', payload: { message: `Command tidak dikenal: ${cmd}` } });
  }
}

module.exports = { handleCommand, cleanupAdminSession };
```

---

### 4.6 Push Scheduler (Server-Initiated Events)

**File: `gateway/pushScheduler.js`**

> **BUG #4 DIPERBAIKI:** `s.status` tidak ada di `serviceStore` — hanya `is_open` (boolean). Konversi eksplisit via `deriveServiceStatus()`.
>
> **PERBAIKAN DESAIN #8:** `sendInitialSnapshot` dikirim segera setelah client baru connect.

```javascript
'use strict';

const { broadcast } = require('./wsManager');

const intervals = [];

// ── Helper: Konversi is_open (boolean) → status string ───────────────────────

/**
 * PERBAIKAN BUG #4:
 * serviceStore hanya menyimpan is_open (boolean), bukan string status.
 * Logika: is_open=true → "OPEN", quota=0 → "CLOSED", sisanya → "PAUSED"
 */
function deriveServiceStatus(svc) {
  if (svc.is_open) return 'OPEN';
  if (svc.quota_remaining === 0) return 'CLOSED';
  return 'PAUSED';
}

/**
 * Ambil snapshot layanan terkini dan format untuk browser.
 */
function fetchServicesSnapshot(clients, callback) {
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err || !response) { callback(null); return; }

    const services = (response.services || []).map(s => ({
      service_id:      s.service_id,
      name:            s.name,
      short_code:      s.short_code,
      status:          deriveServiceStatus(s),  // PERBAIKAN BUG #4
      is_open:         s.is_open,
      quota_remaining: s.quota_remaining,
      daily_quota:     s.daily_quota,
      // waiting_count tidak tersedia dari ListServices
      // Akan diupdate real-time saat ada QUEUE_UPDATE dari stream
      waiting_count:   null,
    }));

    callback(services);
  });
}

// ── Initial Snapshot untuk Client Baru (Perbaikan #8) ─────────────────────────

/**
 * Dipanggil dari wsManager segera setelah client baru terhubung.
 * Mengirim data awal sehingga UI tidak kosong 5–8 detik.
 */
function sendInitialSnapshot(clients, ws) {
  const { sendToClient } = require('./wsManager');

  fetchServicesSnapshot(clients, (services) => {
    if (!services) return;
    sendToClient(ws, {
      type:    'SERVICES_STATUS_UPDATE',
      payload: { services, timestamp: new Date().toISOString() },
    });
  });

  clients.admin.GetSystemStats({}, (err, stats) => {
    if (err || !stats) return;
    sendToClient(ws, {
      type:    'STATS_PUSH',
      payload: {
        total_bookings_today:  stats.total_bookings_today,
        total_served_today:    stats.total_served_today,
        total_cancelled_today: stats.total_cancelled_today,
        active_subscribers:    stats.active_subscribers,
        per_service:           stats.per_service,
        timestamp:             new Date().toISOString(),
      },
    });
  });
}

// ── Scheduled Pushers ─────────────────────────────────────────────────────────

function startStatsPusher(clients, intervalMs = 5000) {
  console.log(`[PushScheduler] Stats pusher aktif (${intervalMs}ms)`);
  const handle = setInterval(() => {
    clients.admin.GetSystemStats({}, (err, stats) => {
      if (err || !stats) return;
      broadcast({
        type:    'STATS_PUSH',
        payload: {
          total_bookings_today:  stats.total_bookings_today,
          total_served_today:    stats.total_served_today,
          total_cancelled_today: stats.total_cancelled_today,
          active_subscribers:    stats.active_subscribers,
          per_service:           stats.per_service,
          timestamp:             new Date().toISOString(),
        },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

function startServiceStatusPusher(clients, intervalMs = 8000) {
  console.log(`[PushScheduler] Service status pusher aktif (${intervalMs}ms)`);
  const handle = setInterval(() => {
    fetchServicesSnapshot(clients, (services) => {
      if (!services) return;
      broadcast({
        type:    'SERVICES_STATUS_UPDATE',
        payload: { services, timestamp: new Date().toISOString() },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

/**
 * Push pengumuman baru jika ada yang belum dikirim.
 *
 * CATATAN #13: Verifikasi field announcement di announcementStore.js.
 * Fallback `latest.id || latest.announcement_id` untuk kompatibilitas.
 */
function startAnnouncementPusher(clients, intervalMs = 12000) {
  console.log(`[PushScheduler] Announcement pusher aktif (${intervalMs}ms)`);
  let lastSeenId = null;

  const handle = setInterval(() => {
    clients.serviceInfo.GetAnnouncements({}, (err, response) => {
      if (err || !response?.announcements?.length) return;
      const latest = response.announcements[0];
      const announcementId = latest.id || latest.announcement_id;
      if (!announcementId || announcementId === lastSeenId) return;
      lastSeenId = announcementId;
      broadcast({
        type:    'NEW_ANNOUNCEMENT',
        payload: {
          id:         announcementId,
          title:      latest.title   || 'Pengumuman',
          message:    latest.message || latest.content || '',
          service_id: latest.service_id || null,
          created_at: latest.created_at || new Date().toISOString(),
          timestamp:  new Date().toISOString(),
        },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}

function startHeartbeat(intervalMs = 30000) {
  const handle = setInterval(() => {
    broadcast({ type: 'HEARTBEAT', payload: { timestamp: new Date().toISOString() } });
  }, intervalMs);
  intervals.push(handle);
}

function startPushScheduler(clients) {
  startStatsPusher(clients, 5000);
  startServiceStatusPusher(clients, 8000);
  startAnnouncementPusher(clients, 12000);
  startHeartbeat(30000);
}

function stopPushScheduler() {
  intervals.forEach(h => clearInterval(h));
  intervals.length = 0;
  console.log('[PushScheduler] Semua scheduler dihentikan.');
}

module.exports = { startPushScheduler, stopPushScheduler, sendInitialSnapshot };
```

---

### 4.7 WebSocket Server Manager

**File: `gateway/wsManager.js`**

> **PERBAIKAN #5 & #6:** Menyimpan `clientState` per koneksi. Memungkinkan targeted delivery `YOUR_TURN`.
>
> **PERBAIKAN #8:** Memanggil `sendInitialSnapshot` segera setelah koneksi baru.
>
> **PERBAIKAN #9:** Memanggil `cleanupAdminSession` saat client disconnect.

```javascript
'use strict';

const WebSocket = require('ws');
const { handleCommand, cleanupAdminSession } = require('./commandHandler');
const { sendInitialSnapshot } = require('./pushScheduler');

// Registry semua client aktif
const wsClients = new Set();

// Per-client state: Map<ws, { clientId, citizenId, officerId, role }>
const clientStates = new Map();

let grpcClients = null;

function initWsServer(httpServer, gClients) {
  grpcClients = gClients;

  const wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    ws.clientId = clientId;

    wsClients.add(ws);
    clientStates.set(ws, { clientId, citizenId: null, officerId: null, role: null });

    console.log(`[WsManager] Client baru: ${clientId} (total: ${wsClients.size})`);

    // Kirim pesan selamat datang
    sendToClient(ws, {
      type:    'CONNECTED',
      payload: { clientId, message: 'Terhubung ke SiAntre Gateway', timestamp: new Date().toISOString() },
    });

    // PERBAIKAN #8: Kirim snapshot awal agar UI tidak kosong
    setTimeout(() => sendInitialSnapshot(grpcClients, ws), 300);

    // Handle pesan masuk dari browser
    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        handleCommand(message, ws, grpcClients);
      } catch (err) {
        console.error(`[WsManager] Parse error dari ${clientId}:`, err.message);
        sendToClient(ws, { type: 'ERROR', payload: { message: 'Format pesan tidak valid. Harus berupa JSON.' } });
      }
    });

    ws.on('close', (code, reason) => {
      wsClients.delete(ws);
      const state = clientStates.get(ws);
      clientStates.delete(ws);

      // PERBAIKAN #9: Bersihkan admin session saat client disconnect
      if (state?.clientId) cleanupAdminSession(state.clientId);

      console.log(`[WsManager] Client terputus: ${clientId} (sisa: ${wsClients.size})`);
    });

    ws.on('error', (err) => {
      console.error(`[WsManager] Error client ${clientId}:`, err.message);
      wsClients.delete(ws);
      clientStates.delete(ws);
    });
  });

  wss.on('error', (err) => {
    console.error('[WsManager] Server error:', err.message);
  });

  return wss;
}

// ── Broadcast & Send Helpers ──────────────────────────────────────────────────

function broadcast(message) {
  const payload = JSON.stringify(message);
  let sent = 0;
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sent++;
    }
  });
  if (wsClients.size > 0) {
    console.log(`[WsManager] Broadcast [${message.type}] → ${sent}/${wsClients.size} client`);
  }
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Kirim pesan hanya ke client dengan citizenId tertentu.
 * Digunakan untuk event personal: YOUR_TURN. (Perbaikan #6)
 */
function sendToClientByCitizenId(citizenId, message) {
  let found = false;
  wsClients.forEach((ws) => {
    const state = clientStates.get(ws);
    if (state?.citizenId === citizenId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      found = true;
    }
  });
  if (!found) {
    console.log(`[WsManager] Citizen ${citizenId} tidak terhubung, YOUR_TURN tidak terkirim.`);
  }
}

function getClientState(ws) { return clientStates.get(ws) || null; }
function setClientState(ws, state) { clientStates.set(ws, state); }
function getClientCount() { return wsClients.size; }

module.exports = {
  initWsServer,
  broadcast,
  sendToClient,
  sendToClientByCitizenId,
  getClientState,
  setClientState,
  getClientCount,
};
```

---

## 5. Tahap 2 — Frontend Web UI

Frontend menggunakan **DaisyUI + Tailwind CDN** (styling), **ApexCharts** (grafik), **anime.js** (animasi), dan **Web Audio API** (suara). Semua vanilla JavaScript — tidak ada framework FE.

### 5.1 Struktur HTML Utama — Halaman Warga (DaisyUI)

**File: `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Sistem Antrian Digital</title>

  <!-- DaisyUI + Tailwind CDN (tanpa build step) -->
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css"
        rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Custom overrides minimal -->
  <link rel="stylesheet" href="css/style.css" />

  <!-- ApexCharts (ganti Chart.js) -->
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js"></script>

  <!-- anime.js (mikro-animasi) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"
          integrity="sha512-aNMyYYxdIxIaot0Y1/PLuEu3eipGCmsEUBrUq+7aVyPGMFH8z0eeSK9o4yHEq8snMF7GHx/rN7RNdjIFzHHeg=="
          crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body class="bg-base-200 min-h-screen">

  <!-- Header -->
  <div class="navbar bg-neutral text-neutral-content sticky top-0 z-50 shadow-lg">
    <div class="navbar-start gap-3 px-4">
      <span class="text-3xl">🏛️</span>
      <div>
        <p class="font-bold text-lg leading-tight">SiAntre</p>
        <p class="text-xs text-neutral-content/60">Sistem Antrian Layanan Publik Digital</p>
      </div>
    </div>
    <div class="navbar-end px-4">
      <span id="ws-status-badge" class="badge badge-warning gap-1">
        <span class="loading loading-ring loading-xs"></span>
        Menghubungkan...
      </span>
    </div>
  </div>

  <!-- Toast container (DaisyUI + anime.js) -->
  <div id="toast-container" class="toast toast-top toast-end z-[999]"></div>

  <!-- Layout utama -->
  <div class="container mx-auto px-4 py-6 max-w-7xl">
    <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

      <!-- Sidebar kiri -->
      <aside class="flex flex-col gap-4">

        <!-- Panel Auth -->
        <div class="card bg-base-100 shadow-sm" id="auth-panel">
          <div class="card-body">
            <h2 class="card-title text-base">Masuk / Daftar</h2>
            <div role="tablist" class="tabs tabs-boxed mb-3">
              <button role="tab" class="tab tab-active" data-tab="login">Masuk</button>
              <button role="tab" class="tab" data-tab="register">Daftar</button>
            </div>
            <div id="tab-login" class="tab-content">
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">NIK (16 digit)</span></div>
                <input type="text" id="login-nik" maxlength="16" placeholder="Masukkan NIK Anda"
                       class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-login">Masuk</button>
            </div>
            <div id="tab-register" class="tab-content hidden">
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">NIK</span></div>
                <input type="text" id="reg-nik" maxlength="16" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Nama Lengkap</span></div>
                <input type="text" id="reg-name" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Nomor HP</span></div>
                <input type="tel" id="reg-phone" placeholder="08xxxxxxxxxx"
                       class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Alamat</span></div>
                <input type="text" id="reg-address" class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-register">Daftar Akun</button>
            </div>
          </div>
        </div>

        <!-- Panel User (setelah login) -->
        <div class="card bg-base-100 shadow-sm hidden" id="user-panel">
          <div class="card-body">
            <h2 class="card-title text-base">Selamat Datang</h2>
            <p class="font-bold text-lg" id="user-name-display">—</p>
            <p class="text-xs text-base-content/60" id="user-nik-display">NIK: —</p>
            <button class="btn btn-outline btn-xs mt-2" id="btn-logout">Keluar</button>
          </div>
        </div>

        <!-- Panel Booking -->
        <div class="card bg-base-100 shadow-sm hidden" id="booking-panel">
          <div class="card-body">
            <h2 class="card-title text-base">Buat Booking</h2>
            <label class="form-control w-full mb-2">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">Pilih Layanan</span></div>
              <select id="select-service" class="select select-bordered select-sm w-full">
                <option value="">-- Pilih layanan --</option>
              </select>
            </label>
            <label class="form-control w-full mb-3">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">Pilih Slot Waktu</span></div>
              <select id="select-slot" class="select select-bordered select-sm w-full" disabled>
                <option value="">-- Pilih layanan dahulu --</option>
              </select>
            </label>
            <button class="btn btn-primary btn-sm w-full" id="btn-create-booking" disabled>
              Pesan Sekarang
            </button>
          </div>
        </div>

        <!-- Panel Booking Saya -->
        <div class="card bg-base-100 shadow-sm hidden" id="my-booking-panel">
          <div class="card-body">
            <h2 class="card-title text-base">Booking Saya</h2>
            <div id="my-booking-detail">
              <p class="text-sm text-base-content/50">Belum ada booking aktif.</p>
            </div>
          </div>
        </div>

      </aside>

      <!-- Main content kanan -->
      <main class="flex flex-col gap-6">

        <!-- Komponen 1: Status Layanan (Event-Driven UI) -->
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h2 class="card-title text-base">Status Layanan</h2>
              <span class="badge badge-success gap-1 animate-pulse">● LIVE</span>
            </div>
            <div id="service-status-grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <div class="skeleton h-20 rounded-xl"></div>
              <div class="skeleton h-20 rounded-xl"></div>
              <div class="skeleton h-20 rounded-xl"></div>
            </div>
          </div>
        </div>

        <!-- Komponen 2: Grafik Antrian + Animasi Nomor (Event-Driven UI) -->
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h2 class="card-title text-base">Antrian Real-Time</h2>
              <span class="badge badge-success gap-1 animate-pulse">● LIVE</span>
            </div>

            <!-- Nomor antrian dipanggil — anime.js flip -->
            <div id="current-queue-display"
                 class="hidden mb-4 rounded-2xl bg-primary/10 border border-primary/20 p-4 text-center">
              <p class="text-xs font-semibold uppercase text-primary/60 mb-1">Nomor Dipanggil Sekarang</p>
              <div id="queue-number-value"
                   class="text-6xl font-black text-primary tabular-nums">—</div>
              <p class="text-xs text-primary/50 mt-1" id="queue-service-label">—</p>
            </div>

            <!-- ApexCharts container -->
            <div id="queue-chart" style="min-height: 220px;"></div>

            <!-- Statistik ringkasan -->
            <div class="stats stats-horizontal shadow-none bg-base-200 rounded-xl mt-3 w-full">
              <div class="stat place-items-center py-2">
                <div class="stat-title text-xs">Dilayani</div>
                <div class="stat-value text-xl" id="stat-served">—</div>
              </div>
              <div class="stat place-items-center py-2">
                <div class="stat-title text-xs">Booking</div>
                <div class="stat-value text-xl" id="stat-bookings">—</div>
              </div>
              <div class="stat place-items-center py-2">
                <div class="stat-title text-xs">Live</div>
                <div class="stat-value text-xl" id="stat-subscribers">—</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Komponen 3: Activity Log (Event-Driven UI) -->
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h2 class="card-title text-base">Log Aktivitas</h2>
              <button class="btn btn-ghost btn-xs" id="btn-clear-log">Bersihkan</button>
            </div>
            <div id="activity-log"
                 class="flex flex-col gap-1 max-h-64 overflow-y-auto text-sm"
                 role="log" aria-live="polite">
              <p class="text-base-content/40 italic text-center py-6">
                Menunggu event dari server...
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>

  <!-- Scripts — urutan penting -->
  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/queue-animation.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/chart.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/warga.js"></script>
</body>
</html>
```

---

### 5.2 Stylesheet Global (Minimal)

**File: `frontend/css/style.css`**

DaisyUI menangani seluruh base styling. File ini hanya berisi customisasi yang tidak bisa dilakukan via DaisyUI utility classes.

```css
/* ── Log Entries ─────────────────────────────────────────────────────────── */
.log-entry {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 6px 10px; border-radius: 6px;
  background: oklch(var(--b2));
  border-left: 3px solid transparent;
  font-size: 13px;
  animation: slide-in 0.2s ease;
}
@keyframes slide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.log-entry.type-queue    { border-left-color: oklch(var(--p)); }
.log-entry.type-announce { border-left-color: oklch(var(--wa)); }
.log-entry.type-admin    { border-left-color: oklch(var(--su)); }
.log-entry.type-system   { border-left-color: oklch(var(--n)); }
.log-entry.type-error    { border-left-color: oklch(var(--er)); background: oklch(var(--er)/0.1); }
.log-time { font-size: 11px; color: oklch(var(--bc)/0.4); white-space: nowrap; min-width: 55px; }
.log-text { flex: 1; line-height: 1.4; }

/* ── YOUR_TURN Toast — initial state, anime.js handle animasi ─────────────── */
.toast-your-turn {
  position: fixed; top: 80px; right: -400px; z-index: 9999; min-width: 320px;
}

/* ── Queue Number Flip — target anime.js ──────────────────────────────────── */
#queue-number-value { display: inline-block; transform-origin: center bottom; }

/* ── ApexCharts override ──────────────────────────────────────────────────── */
.apexcharts-toolbar { display: none !important; }

/* ── Booking Detail ───────────────────────────────────────────────────────── */
.booking-code { font-size: 18px; font-weight: 700; color: oklch(var(--p)); letter-spacing: 2px; }
.booking-row  { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid oklch(var(--b3)); }
.booking-row:last-child { border-bottom: none; }
```

---

### 5.3 WebSocket Client & State Management (MDN Fixes)

**File: `frontend/js/ws-client.js`**

> **6 perbaikan MDN WebSocket API:**
> - **M1** — `WebSocket.OPEN` menggantikan magic number `1`
> - **M2** — `CloseEvent` dibaca; reconnect hanya jika `code !== 1000 && !== 1001`
> - **M3** — `wss://` auto-detect dari `window.location.protocol`
> - **M4** — `addEventListener` menggantikan `oneventname`
> - **M5** — `bufferedAmount` dicek sebelum `send()` (16 KB threshold)
> - **M6** — `beforeunload` menutup koneksi bersih (bfcache fix) + `visibilitychange` pause

```javascript
// ─── State Aplikasi Global ────────────────────────────────────────────────────
const AppState = {
  ws:                   null,
  isConnected:          false,
  currentUser:          null,   // { nik, name, citizen_id }
  currentAdmin:         null,   // { id_pegawai, nama, role }
  services:             [],
  myBooking:            null,
  queueData:            {},
  reconnectAttempts:    0,
  maxReconnectAttempts: 10,
  pauseReconnect:       false,
};

// ─── Event Bus ────────────────────────────────────────────────────────────────
const EventBus = {
  listeners: {},
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  },
  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (err) { console.error(`[EventBus] Error in "${event}":`, err); }
    });
  },
};

// ─── Kirim Command ke Gateway ─────────────────────────────────────────────────
//
// FIX M1: WebSocket.OPEN (konstanta bernama) bukan angka 1
// FIX M5: Cek bufferedAmount — hindari overflow buffer saat koneksi lambat
//
function sendCommand(cmd, payload = {}) {
  if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {  // FIX M1
    console.warn('[WsClient] Belum terhubung, command diabaikan:', cmd);
    showNotification('Koneksi Terputus', 'Mencoba menghubungkan kembali...', 'warning');
    return;
  }
  if (AppState.ws.bufferedAmount > 16 * 1024) {  // FIX M5: 16 KB threshold
    console.warn('[WsClient] Buffer penuh, pesan ditunda:', cmd);
    return;
  }
  AppState.ws.send(JSON.stringify({ cmd, payload }));
}

// ─── Router Pesan dari Gateway ────────────────────────────────────────────────
function routeMessage(msg) {
  switch (msg.type) {

    case 'CONNECTED':
      console.log('[WsClient] Terhubung:', msg.payload.clientId);
      EventBus.emit('wsConnected', msg.payload);
      break;

    case 'HEARTBEAT':
      break; // Keep-alive, tidak perlu tindakan UI

    // ── Streaming gRPC → WebSocket (Fitur Wajib 1) ───────────────────────────
    case 'QUEUE_UPDATE':
      EventBus.emit('queueUpdate', msg);
      EventBus.emit('activityLog', {
        type:      'queue',
        message:   formatQueueEvent(msg.payload),
        timestamp: msg.payload.timestamp,
      });
      if (msg.payload.event_type === 'YOUR_TURN') {
        // Spring toast + suara via notification.js
        EventBus.emit('yourTurn', msg);
      }
      if (msg.payload.current_number && msg.payload.event_type === 'QUEUE_MOVED') {
        EventBus.emit('queueNumberCalled', {
          number:     msg.payload.current_number,
          service_id: msg.service_id,
        });
      }
      break;

    // ── Server-Initiated Events (Fitur Wajib 3) ──────────────────────────────
    case 'STATS_PUSH':
      EventBus.emit('statsUpdate', msg.payload);
      EventBus.emit('queueChartUpdate', msg.payload);
      break;

    case 'SERVICES_STATUS_UPDATE':
      AppState.services = msg.payload.services;
      EventBus.emit('servicesUpdate', msg.payload.services);
      break;

    case 'NEW_ANNOUNCEMENT':
      EventBus.emit('newAnnouncement', msg.payload);
      EventBus.emit('activityLog', {
        type:      'announce',
        message:   `📢 ${msg.payload.title}: ${msg.payload.message}`,
        timestamp: msg.payload.timestamp,
      });
      showNotification('Pengumuman', msg.payload.message, 'info');
      break;

    // ── Responses Command Warga ──────────────────────────────────────────────
    case 'LOGIN_RESULT':      EventBus.emit('loginResult', msg);      break;
    case 'REGISTER_RESULT':   EventBus.emit('registerResult', msg);   break;
    case 'SERVICES_LIST':
      if (!msg.error) {
        AppState.services = msg.payload.services || [];
        EventBus.emit('servicesLoaded', AppState.services);
      }
      break;
    case 'SLOTS_LIST':        EventBus.emit('slotsLoaded', msg);      break;
    case 'BOOKING_RESULT':    EventBus.emit('bookingResult', msg);    break;
    case 'MY_BOOKING':        EventBus.emit('myBookingLoaded', msg);  break;
    case 'CANCEL_RESULT':     EventBus.emit('cancelResult', msg);     break;
    case 'RESCHEDULE_RESULT': EventBus.emit('rescheduleResult', msg); break;
    case 'QUEUE_STATUS':      EventBus.emit('queueStatus', msg);      break;
    case 'ANNOUNCEMENTS':     EventBus.emit('announcements', msg);    break;

    // ── Responses Command Admin ──────────────────────────────────────────────
    case 'ADMIN_LOGIN_RESULT':
      if (!msg.error) AppState.currentAdmin = msg.payload;
      EventBus.emit('adminLoginResult', msg);
      break;
    case 'SYSTEM_INIT_STATUS':          EventBus.emit('systemInitStatus', msg);       break;
    case 'ADMIN_EVENT':
      EventBus.emit('adminEvent', msg.payload);
      EventBus.emit('activityLog', {
        type:      'admin',
        message:   `Admin event: ${msg.payload.event_type}`,
        timestamp: msg.payload.timestamp,
      });
      break;
    case 'SYSTEM_STATS':                EventBus.emit('statsUpdate', msg.payload);    break;
    case 'CHECKIN_RESULT':              EventBus.emit('checkinResult', msg);          break;
    case 'WALK_IN_RESULT':              EventBus.emit('walkInResult', msg);           break;
    case 'RESET_QUOTA_RESULT':          EventBus.emit('resetQuotaResult', msg);       break;
    case 'OFFICERS_LIST':               EventBus.emit('officersList', msg);           break;
    case 'REGISTER_OFFICER_RESULT':     EventBus.emit('registerOfficerResult', msg);  break;
    case 'UPDATE_OFFICER_RESULT':       EventBus.emit('updateOfficerResult', msg);    break;
    case 'DELETE_OFFICER_RESULT':       EventBus.emit('deleteOfficerResult', msg);    break;
    case 'ADMIN_SESSION_ERROR':
      showNotification('Session Error', msg.payload?.message || 'Sesi admin terputus.', 'error');
      EventBus.emit('adminSessionError', msg);
      break;

    case 'ERROR':
      console.error('[WsClient] Error:', msg.payload?.message);
      showNotification('Terjadi Kesalahan', msg.payload?.message || 'Error tidak diketahui', 'error');
      EventBus.emit('activityLog', {
        type:      'error',
        message:   `Error: ${msg.payload?.message}`,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      console.log('[WsClient] Pesan tidak dikenal:', msg.type);
  }
}

// ─── Format Event Antrian ─────────────────────────────────────────────────────
function formatQueueEvent(payload) {
  const labels = {
    QUEUE_MOVED:     `Antrian bergerak — nomor ${payload.current_number} | menunggu: ${payload.waiting_count}`,
    YOUR_TURN:       `🎉 GILIRAN ANDA! Segera menuju loket.`,
    SERVICE_CLOSED:  `⚠️ Layanan ditutup sementara.`,
    SERVICE_RESUMED: `✅ Layanan dibuka kembali.`,
    ANNOUNCEMENT:    `📢 ${payload.message}`,
    QUOTA_OPENED:    `Slot baru tersedia — quota bertambah.`,
  };
  return labels[payload.event_type] || `Event: ${payload.event_type} — ${payload.message || ''}`;
}

// ─── Update Badge Koneksi ─────────────────────────────────────────────────────
function updateConnectionStatus(status) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;
  const configs = {
    connected:    { text: '● Terhubung',                                                       class: 'badge badge-success' },
    disconnected: { text: '● Terputus',                                                        class: 'badge badge-error' },
    connecting:   { text: '<span class="loading loading-ring loading-xs"></span> Menghubungkan...', class: 'badge badge-warning gap-1' },
  };
  const cfg = configs[status] || configs.connecting;
  badge.className = cfg.class;
  badge.innerHTML = cfg.text;
}

// ─── Inisialisasi WebSocket ───────────────────────────────────────────────────
//
// FIX M3: Auto-detect wss:// vs ws:// dari protocol halaman
// FIX M4: addEventListener bukan oneventname
//
function initWebSocket() {
  // FIX M3: HTTPS halaman → wss:// (browser blokir ws:// sebagai mixed content)
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl      = `${wsProtocol}//${window.location.host}`;

  updateConnectionStatus('connecting');
  const ws = new WebSocket(wsUrl);
  AppState.ws = ws;

  // FIX M4: addEventListener
  ws.addEventListener('open', () => {
    AppState.isConnected       = true;
    AppState.reconnectAttempts = 0;
    updateConnectionStatus('connected');
    EventBus.emit('wsConnected', {});
    console.log('[WsClient] Koneksi dibuka.');
  });

  ws.addEventListener('message', (event) => {
    try { routeMessage(JSON.parse(event.data)); }
    catch (err) { console.error('[WsClient] Parse error:', err); }
  });

  // FIX M2: Baca CloseEvent — jangan selalu reconnect
  // 1000 = Normal Closure, 1001 = Going Away → tidak reconnect
  // 1006 = Abnormal, 1011 = Internal Error → reconnect
  ws.addEventListener('close', (event) => {
    AppState.isConnected = false;
    AppState.ws          = null;
    updateConnectionStatus('disconnected');
    EventBus.emit('wsDisconnected', { code: event.code, reason: event.reason });
    console.log(`[WsClient] Koneksi ditutup — code: ${event.code}, clean: ${event.wasClean}`);

    if (event.code !== 1000 && event.code !== 1001) {
      scheduleReconnect();
    } else {
      console.log('[WsClient] Penutupan normal, tidak reconnect.');
    }
  });

  ws.addEventListener('error', () => {
    updateConnectionStatus('disconnected');
  });
}

// ─── Reconnect dengan Exponential Backoff ─────────────────────────────────────
function scheduleReconnect() {
  if (AppState.pauseReconnect) {
    console.log('[WsClient] Reconnect di-pause (tab background).');
    return;
  }
  if (AppState.reconnectAttempts >= AppState.maxReconnectAttempts) {
    showNotification('Koneksi Gagal', 'Tidak bisa terhubung ke server. Refresh halaman untuk mencoba lagi.', 'error', 0);
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, AppState.reconnectAttempts), 30000);
  AppState.reconnectAttempts++;
  console.log(`[WsClient] Reconnect attempt ${AppState.reconnectAttempts} dalam ${delay}ms...`);
  setTimeout(initWebSocket, delay);
}

// ─── FIX M6: Tutup koneksi saat navigasi (bfcache fix) ───────────────────────
window.addEventListener('beforeunload', () => {
  if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
    AppState.ws.close(1000, 'User navigating away');
  }
});

// ─── Opsional: Pause reconnect saat tab di-background ─────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    AppState.pauseReconnect = true;
  } else {
    AppState.pauseReconnect = false;
    if (!AppState.isConnected && AppState.ws === null) {
      AppState.reconnectAttempts = 0;
      initWebSocket();
    }
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initWebSocket);
```

---

### 5.4 Komponen: Grafik Antrian Live — ApexCharts

**File: `frontend/js/chart.js`**

> ApexCharts memberikan animasi update data yang halus — bar "meluncur" ke nilai baru, bukan langsung teleport.

```javascript
(function () {
  let chart = null;

  const chartOptions = {
    chart: {
      type: 'bar', height: 220, fontFamily: 'inherit',
      toolbar: { show: false },
      animations: {
        enabled: true, easing: 'easeinout', speed: 500,
        dynamicAnimation: { enabled: true, speed: 400 },
      },
      background: 'transparent',
    },
    plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
    colors: ['#4f46e5', '#16a34a'],  // Indigo (menunggu) + Green (quota sisa)
    series: [
      { name: 'Menunggu',   data: [] },
      { name: 'Sisa Quota', data: [] },
    ],
    xaxis: { categories: [], labels: { style: { fontSize: '12px' } } },
    yaxis: { min: 0, labels: { formatter: (v) => Math.floor(v) }, tickAmount: 5 },
    legend: { position: 'bottom', fontSize: '12px' },
    dataLabels: { enabled: false },
    grid: { borderColor: '#e5e7eb', strokeDashArray: 3 },
    tooltip: { y: { formatter: (val) => `${val} orang` } },
    theme: { mode: 'light' },
  };

  function initChart() {
    const el = document.getElementById('queue-chart');
    if (!el || typeof ApexCharts === 'undefined') return;
    chart = new ApexCharts(el, chartOptions);
    chart.render();
  }

  function updateChart(services) {
    if (!chart || !services || services.length === 0) return;
    chart.updateOptions({ xaxis: { categories: services.map(s => s.name || s.service_id || '?') } }, false, false);
    chart.updateSeries([
      { name: 'Menunggu',   data: services.map(s => s.waiting_count  ?? 0) },
      { name: 'Sisa Quota', data: services.map(s => s.quota_remaining ?? 0) },
    ]);
  }

  function updateStats(stats) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
    set('stat-served',      stats.total_served_today);
    set('stat-bookings',    stats.total_bookings_today);
    set('stat-subscribers', stats.active_subscribers);
    if (stats.per_service) updateChart(stats.per_service);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initChart();
    EventBus.on('statsUpdate',      updateStats);
    EventBus.on('queueChartUpdate', (d) => d.per_service && updateChart(d.per_service));
    EventBus.on('servicesUpdate',   updateChart);
    EventBus.on('servicesLoaded',   updateChart);
  });
})();
```

---

### 5.5 Komponen: Activity Log

**File: `frontend/js/activity-log.js`**

```javascript
(function() {
  const MAX_LOG = 100;
  let logEl = null;

  function fmt(iso) {
    return new Date(iso || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function esc(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  function add({ type = 'system', message, timestamp }) {
    if (!logEl) return;
    logEl.querySelector('.log-empty')?.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry type-${type}`;
    entry.innerHTML = `<span class="log-time">${fmt(timestamp)}</span><span class="log-text">${esc(message)}</span>`;
    logEl.insertBefore(entry, logEl.firstChild);

    while (logEl.children.length > MAX_LOG) logEl.removeChild(logEl.lastChild);
  }

  document.addEventListener('DOMContentLoaded', () => {
    logEl = document.getElementById('activity-log');

    document.getElementById('btn-clear-log')
      ?.addEventListener('click', () => {
        if (logEl) logEl.innerHTML = '<p class="text-base-content/40 italic text-center py-6">Log dibersihkan.</p>';
      });

    EventBus.on('activityLog',    add);
    EventBus.on('wsConnected',    () => add({ type: 'system', message: '✅ Terhubung ke SiAntre Gateway' }));
    EventBus.on('wsDisconnected', () => add({ type: 'error',  message: '❌ Koneksi ke gateway terputus' }));
  });
})();
```

---

### 5.6 Komponen: Status Indikator Layanan

**File: `frontend/js/status-indicator.js`**

> Class CSS menggunakan DaisyUI (`badge-success`, `badge-warning`, `badge-error`). Fallback `is_open` tetap ada jika field `status` tidak tersedia.

```javascript
(function() {
  function getStatusBadgeClass(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    if (st === 'OPEN')   return 'badge badge-success';
    if (st === 'PAUSED') return 'badge badge-warning';
    return 'badge badge-error';
  }

  function getStatusLabel(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    return { OPEN: 'Buka', PAUSED: 'Jeda', CLOSED: 'Tutup' }[st] || st;
  }

  function esc(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  function renderServices(services) {
    const grid = document.getElementById('service-status-grid');
    if (!grid || !services) return;

    if (services.length === 0) {
      grid.innerHTML = '<p class="text-sm text-base-content/50 col-span-full">Belum ada layanan. Sistem belum diinisialisasi.</p>';
      return;
    }

    grid.innerHTML = '';
    services.forEach(svc => {
      const isOpen         = svc.status === 'OPEN' || svc.is_open;
      const waitingDisplay = svc.waiting_count !== null && svc.waiting_count !== undefined
                             ? svc.waiting_count : '—';

      const card = document.createElement('div');
      card.className          = `card bg-base-100 border ${isOpen ? 'border-success/30' : 'border-error/20'} shadow-xs`;
      card.dataset.serviceId  = svc.service_id;
      card.innerHTML = `
        <div class="card-body p-3">
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-sm leading-tight">${esc(svc.name || svc.service_id)}</p>
            <span class="${getStatusBadgeClass(svc)} badge-sm whitespace-nowrap">${getStatusLabel(svc)}</span>
          </div>
          <div class="text-xs text-base-content/50 mt-1">
            Menunggu: <strong class="text-base-content" id="waiting-${svc.service_id}">${waitingDisplay}</strong>
            &nbsp;·&nbsp;
            Quota: <strong class="text-base-content">${svc.quota_remaining ?? '—'}</strong>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function updateSingleService(serviceId, updates) {
    const card = document.querySelector(`[data-service-id="${serviceId}"]`);
    if (!card) return;

    if (updates.status !== undefined || updates.is_open !== undefined) {
      const badge = card.querySelector('[class*="badge"]');
      if (badge) {
        badge.className   = `${getStatusBadgeClass(updates)} badge-sm whitespace-nowrap`;
        badge.textContent = getStatusLabel(updates);
      }
    }

    if (updates.waiting_count !== undefined && updates.waiting_count !== null) {
      const el = document.getElementById(`waiting-${serviceId}`);
      if (el) el.textContent = updates.waiting_count;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    EventBus.on('servicesLoaded', renderServices);
    EventBus.on('servicesUpdate', renderServices);
    EventBus.on('queueUpdate', (msg) => {
      if (msg.service_id && msg.payload) {
        updateSingleService(msg.service_id, { waiting_count: msg.payload.waiting_count });
      }
    });
  });
})();
```

---

### 5.7 Komponen: Notifikasi — anime.js + Web Audio API

**File: `frontend/js/notification.js`**

```javascript
// ─── Web Audio API: Sound Notification ───────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx  = null;

function getAudioContext() {
  if (!_audioCtx) _audioCtx = new AudioCtx();
  return _audioCtx;
}

function playTone(notes = [523, 659], volume = 0.3) {
  try {
    const ctx   = getAudioContext();
    let startAt = ctx.currentTime;
    notes.forEach((freq) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type            = 'sine';
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.35);
      osc.start(startAt);
      osc.stop(startAt + 0.4);
      startAt += 0.18;
    });
  } catch (e) { /* AudioContext belum ready sebelum user gesture */ }
}

// ─── Toast Biasa (DaisyUI + anime.js) ─────────────────────────────────────────
function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const alertClass = {
    success: 'alert alert-success',
    warning: 'alert alert-warning',
    error:   'alert alert-error',
    info:    'alert alert-info',
  }[type] || 'alert alert-info';

  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `${alertClass} shadow-md min-w-56 max-w-xs opacity-0`;
  toast.style.transform = 'translateX(20px)';
  toast.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <div>
      <p class="font-semibold text-sm">${title}</p>
      <p class="text-xs opacity-75">${message}</p>
    </div>
  `;
  container.appendChild(toast);

  anime({ targets: toast, opacity: [0, 1], translateX: [20, 0], duration: 300, easing: 'easeOutQuart' });

  if (duration > 0) {
    setTimeout(() => {
      anime({
        targets: toast, opacity: [1, 0], translateX: [0, 20], duration: 250,
        easing: 'easeInQuart', complete: () => toast.remove(),
      });
    }, duration);
  }
}

// ─── Toast YOUR_TURN (Spring Animation + Suara) ───────────────────────────────
function showYourTurnAlert(serviceLabel) {
  // 1. Suara: tiga nada naik (C5 - E5 - G5)
  playTone([523, 659, 784], 0.4);

  // 2. Banner besar
  const banner = document.createElement('div');
  banner.id        = 'your-turn-banner';
  banner.className = 'fixed top-20 right-4 z-[9999] w-80 rounded-2xl shadow-2xl overflow-hidden';
  banner.style.cssText = 'background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; transform: translateX(400px); opacity: 0;';
  banner.innerHTML = `
    <div class="p-5">
      <div class="text-4xl text-center mb-2">🎉</div>
      <h3 class="font-black text-xl text-center mb-1">GILIRAN ANDA!</h3>
      <p class="text-center text-white/80 text-sm mb-4">
        ${serviceLabel ? `Layanan: <strong>${serviceLabel}</strong>` : 'Segera menuju loket untuk dilayani.'}
      </p>
      <button onclick="dismissYourTurn()"
              class="w-full bg-white/20 hover:bg-white/30 text-white font-semibold rounded-xl py-2 text-sm transition-colors">
        Tutup
      </button>
    </div>
    <div id="your-turn-progress"
         style="height: 4px; background: rgba(255,255,255,0.4); transform-origin: left;"></div>
  `;
  document.body.appendChild(banner);

  // 3. Spring animation masuk
  anime({
    targets: banner, translateX: [400, 0], opacity: [0, 1],
    duration: 700, easing: 'spring(1, 80, 10, 0)',
  });

  // 4. Progress bar countdown 12 detik
  anime({
    targets: banner.querySelector('#your-turn-progress'),
    scaleX: [1, 0], duration: 12000, easing: 'linear',
    complete: () => dismissYourTurn(),
  });

  // 5. Ulangi suara sekali lagi setelah 2 detik
  setTimeout(() => playTone([784, 659, 523], 0.3), 2000);
}

window.dismissYourTurn = function () {
  const banner = document.getElementById('your-turn-banner');
  if (!banner) return;
  anime({
    targets: banner, translateX: [0, 400], opacity: [1, 0],
    duration: 350, easing: 'easeInQuart', complete: () => banner.remove(),
  });
};

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  EventBus.on('yourTurn', (msg) => {
    const serviceId    = msg.service_id;
    const serviceLabel = AppState.services?.find(s => s.service_id === serviceId)?.name || serviceId;
    showYourTurnAlert(serviceLabel);
  });

  EventBus.on('newAnnouncement', () => playTone([440, 523], 0.2));

  // Inisialisasi AudioContext saat user pertama kali berinteraksi (browser policy)
  document.addEventListener('click', () => getAudioContext(), { once: true });
});
```

---

### 5.8 Komponen: Animasi Nomor Antrian — anime.js

**File: `frontend/js/queue-animation.js`** *(File baru di v3)*

```javascript
(function() {
  const FLIP_DURATION = 400; // ms

  function animateNumberFlip(element, newValue) {
    // Phase 1: Flip keluar (angka lama berputar ke atas)
    anime({
      targets: element, rotateX: [0, -90], opacity: [1, 0],
      duration: FLIP_DURATION / 2, easing: 'easeInQuart',
      complete: () => {
        element.textContent = newValue;
        // Phase 2: Flip masuk (angka baru berputar dari bawah)
        anime({ targets: element, rotateX: [90, 0], opacity: [0, 1], duration: FLIP_DURATION / 2, easing: 'easeOutQuart' });
      },
    });
  }

  let currentDisplayedNumber = null;

  function updateQueueDisplay({ number, service_id }) {
    if (number === currentDisplayedNumber) return;
    currentDisplayedNumber = number;

    const displaySection = document.getElementById('current-queue-display');
    const numberEl       = document.getElementById('queue-number-value');
    const labelEl        = document.getElementById('queue-service-label');

    if (!displaySection || !numberEl) return;

    if (displaySection.classList.contains('hidden')) {
      displaySection.classList.remove('hidden');
      anime({ targets: displaySection, opacity: [0, 1], translateY: [-10, 0], duration: 400, easing: 'easeOutQuart' });
    }

    if (labelEl && service_id) {
      const svc = AppState.services?.find(s => s.service_id === service_id);
      if (svc) labelEl.textContent = svc.name || service_id;
    }

    animateNumberFlip(numberEl, number);

    anime({
      targets: displaySection,
      backgroundColor: ['rgba(79, 70, 229, 0.2)', 'rgba(79, 70, 229, 0.05)'],
      duration: 800, easing: 'easeOutQuart',
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    EventBus.on('queueNumberCalled', updateQueueDisplay);
  });
})();
```

---

### 5.9 Halaman Warga

**File: `frontend/js/warga.js`**

```javascript
(function() {
  // ── Tab Handling ────────────────────────────────────────────────────────────
  document.querySelectorAll('[role="tab"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[role="tab"]').forEach(b => b.classList.remove('tab-active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('tab-active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // ── Register ────────────────────────────────────────────────────────────────
  document.getElementById('btn-register')?.addEventListener('click', () => {
    const nik    = document.getElementById('reg-nik')?.value.trim();
    const nama   = document.getElementById('reg-name')?.value.trim();
    const no_hp  = document.getElementById('reg-phone')?.value.trim();
    const alamat = document.getElementById('reg-address')?.value.trim();
    if (!nik || nik.length !== 16 || !nama) {
      showNotification('Data Tidak Lengkap', 'Isi NIK (16 digit) dan Nama.', 'warning'); return;
    }
    sendCommand('REGISTER_CITIZEN', { nik, nama, no_hp, alamat });
  });

  EventBus.on('registerResult', (msg) => {
    if (msg.error) showNotification('Registrasi Gagal', msg.error, 'error');
    else showNotification('Registrasi Berhasil', 'Silakan masuk dengan NIK Anda.', 'success');
  });

  // ── Login Warga ──────────────────────────────────────────────────────────────
  document.getElementById('btn-login')?.addEventListener('click', () => {
    const nik = document.getElementById('login-nik')?.value.trim();
    if (!nik || nik.length !== 16) {
      showNotification('NIK Tidak Valid', 'Masukkan NIK 16 digit.', 'warning'); return;
    }
    sendCommand('LOGIN_CITIZEN', { nik });
  });

  EventBus.on('loginResult', (msg) => {
    if (msg.error) { showNotification('Login Gagal', msg.error, 'error'); return; }
    const user = msg.payload;
    AppState.currentUser = user;
    document.getElementById('auth-panel')?.classList.add('hidden');
    document.getElementById('user-panel')?.classList.remove('hidden');
    document.getElementById('booking-panel')?.classList.remove('hidden');
    document.getElementById('my-booking-panel')?.classList.remove('hidden');
    document.getElementById('user-name-display').textContent = user.nama || '—';
    document.getElementById('user-nik-display').textContent  = `NIK: ${user.nik}`;
    showNotification('Selamat Datang', `Halo, ${user.nama}!`, 'success');
    sendCommand('LIST_SERVICES');
    sendCommand('GET_MY_BOOKING', { nik: user.nik, citizen_id: user.citizen_id });
  });

  // ── Logout ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    AppState.currentUser = null;
    document.getElementById('auth-panel')?.classList.remove('hidden');
    document.getElementById('user-panel')?.classList.add('hidden');
    document.getElementById('booking-panel')?.classList.add('hidden');
    document.getElementById('my-booking-panel')?.classList.add('hidden');
  });

  // ── Daftar Layanan & Slot ─────────────────────────────────────────────────────
  const selectService = document.getElementById('select-service');
  const selectSlot    = document.getElementById('select-slot');
  const btnBooking    = document.getElementById('btn-create-booking');

  EventBus.on('servicesLoaded', (services) => {
    if (!selectService) return;
    selectService.innerHTML = '<option value="">-- Pilih layanan --</option>';
    services.forEach(svc => {
      const opt = document.createElement('option');
      opt.value       = svc.service_id;
      opt.textContent = `${svc.short_code} — ${svc.name}`;
      if (!svc.is_open && svc.status !== 'OPEN') opt.disabled = true;
      selectService.appendChild(opt);
    });
  });

  selectService?.addEventListener('change', () => {
    const serviceId = selectService.value;
    if (!serviceId) { selectSlot.disabled = true; btnBooking.disabled = true; return; }
    const today = new Date().toISOString().split('T')[0];
    sendCommand('GET_AVAILABLE_SLOTS', { service_id: serviceId, date: today });
  });

  EventBus.on('slotsLoaded', (msg) => {
    if (!selectSlot) return;
    if (msg.error || !msg.payload?.slots?.length) {
      selectSlot.innerHTML = '<option value="">Tidak ada slot tersedia</option>';
      selectSlot.disabled  = true; btnBooking.disabled = true; return;
    }
    selectSlot.innerHTML = '<option value="">-- Pilih slot --</option>';
    msg.payload.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value       = slot.slot_id;
      opt.textContent = `${slot.time} (sisa: ${slot.capacity - slot.booked_count})`;
      if (slot.status === 'FULL') opt.disabled = true;
      selectSlot.appendChild(opt);
    });
    selectSlot.disabled = false; btnBooking.disabled = false;
  });

  // ── Buat Booking ──────────────────────────────────────────────────────────────
  btnBooking?.addEventListener('click', () => {
    if (!AppState.currentUser) { showNotification('Belum Login', 'Silakan masuk terlebih dahulu.', 'warning'); return; }
    const serviceId = selectService?.value;
    const slotId    = selectSlot?.value;
    if (!serviceId || !slotId) { showNotification('Pilih Layanan & Slot', 'Lengkapi pilihan.', 'warning'); return; }
    sendCommand('CREATE_BOOKING', {
      citizen_id: AppState.currentUser.citizen_id,
      nik:        AppState.currentUser.nik,
      service_id: serviceId,
      slot_id:    slotId,
    });
  });

  EventBus.on('bookingResult', (msg) => {
    if (msg.error) { showNotification('Booking Gagal', msg.error, 'error'); }
    else {
      showNotification('Booking Berhasil!', `Kode: ${msg.payload.booking_code}`, 'success');
      AppState.myBooking = msg.payload;
      renderBookingDetail(msg.payload);
      if (AppState.currentUser) sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
    }
  });

  function renderBookingDetail(booking) {
    const panel = document.getElementById('my-booking-detail');
    if (!panel || !booking) return;
    panel.innerHTML = `
      <p class="booking-code mb-3">${booking.booking_code || '—'}</p>
      <div class="booking-row"><span>Layanan</span><strong>${booking.service_name || '—'}</strong></div>
      <div class="booking-row"><span>Tanggal</span><strong>${booking.slot_date || '—'}</strong></div>
      <div class="booking-row"><span>Waktu</span><strong>${booking.slot_time || '—'}</strong></div>
      <div class="booking-row"><span>Status</span><strong>${booking.status || '—'}</strong></div>
      ${booking.status === 'BOOKED' ? `
        <div class="flex gap-2 mt-3">
          <button class="btn btn-outline btn-xs flex-1" id="btn-cancel-booking">Batalkan</button>
          <button class="btn btn-outline btn-xs flex-1" id="btn-reschedule">Jadwal Ulang</button>
        </div>
      ` : ''}
    `;
    document.getElementById('btn-cancel-booking')?.addEventListener('click', () => {
      if (!confirm('Batalkan booking ini?')) return;
      sendCommand('CANCEL_BOOKING', { booking_code: booking.booking_code, citizen_id: AppState.currentUser?.citizen_id });
    });
    document.getElementById('btn-reschedule')?.addEventListener('click', () => {
      const newSlot = prompt('Masukkan slot_id baru:');
      if (!newSlot) return;
      sendCommand('RESCHEDULE_BOOKING', { booking_code: booking.booking_code, citizen_id: AppState.currentUser?.citizen_id, new_slot_id: newSlot });
    });
  }

  EventBus.on('myBookingLoaded', (msg) => {
    if (!msg.error && msg.payload?.booking) { AppState.myBooking = msg.payload.booking; renderBookingDetail(msg.payload.booking); }
  });
  EventBus.on('cancelResult', (msg) => {
    if (msg.error) showNotification('Pembatalan Gagal', msg.error, 'error');
    else { showNotification('Booking Dibatalkan', 'Berhasil dibatalkan.', 'info'); document.getElementById('my-booking-detail').innerHTML = '<p class="text-sm text-base-content/50">Belum ada booking aktif.</p>'; AppState.myBooking = null; }
  });
  EventBus.on('rescheduleResult', (msg) => {
    if (msg.error) showNotification('Reschedule Gagal', msg.error, 'error');
    else { showNotification('Jadwal Diperbarui', 'Berhasil dijadwal ulang.', 'success'); renderBookingDetail(msg.payload); }
  });
})();
```

---

### 5.10 Halaman Admin (DaisyUI)

**File: `frontend/admin.html`**

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Panel Admin</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css"
        rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="css/style.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"
          integrity="sha512-aNMyYYxdIxIaot0Y1/PLuEu3eipGCmsEUBrUq+7aVyPGMFH8z0eeSK9o4yHEq8snMF7GHx/rN7RNdjIFzHHeg=="
          crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body class="bg-base-200 min-h-screen">

  <!-- Header -->
  <div class="navbar bg-neutral text-neutral-content sticky top-0 z-50 shadow-lg">
    <div class="navbar-start gap-3 px-4">
      <span class="text-3xl">⚙️</span>
      <div>
        <p class="font-bold text-lg leading-tight">SiAntre — Panel Admin</p>
        <p class="text-xs text-neutral-content/60" id="admin-subtitle">Belum login</p>
      </div>
    </div>
    <div class="navbar-end px-4">
      <span id="ws-status-badge" class="badge badge-warning gap-1">
        <span class="loading loading-ring loading-xs"></span>
        Menghubungkan...
      </span>
    </div>
  </div>

  <div id="toast-container" class="toast toast-top toast-end z-[999]"></div>

  <div class="container mx-auto px-4 py-6 max-w-5xl">

    <!-- Banner Sistem Belum Diinisialisasi -->
    <div id="init-banner" class="alert alert-warning mb-4 hidden">
      <span>⚠️</span>
      <div>
        <h3 class="font-bold">Sistem Belum Diinisialisasi</h3>
        <p class="text-sm">Belum ada petugas yang terdaftar. Daftarkan Admin pertama di form di bawah.</p>
      </div>
    </div>

    <!-- Panel Login Admin -->
    <div class="card bg-base-100 shadow-sm mb-4" id="admin-login-panel">
      <div class="card-body">
        <h2 class="card-title text-base">Login Petugas</h2>
        <div class="flex flex-col sm:flex-row gap-3 max-w-md">
          <label class="form-control w-full">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai</span></div>
            <input type="text" id="admin-id" placeholder="Contoh: P001" class="input input-bordered input-sm w-full" />
          </label>
          <label class="form-control w-full">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN</span></div>
            <input type="password" id="admin-pin" placeholder="Min 6 digit" class="input input-bordered input-sm w-full" />
          </label>
        </div>
        <div class="card-actions mt-2">
          <button class="btn btn-primary btn-sm" id="btn-admin-login">Login</button>
        </div>
      </div>
    </div>

    <!-- Panel Setup Admin Pertama -->
    <div class="card bg-base-100 shadow-sm mb-4 hidden" id="admin-setup-panel">
      <div class="card-body">
        <h2 class="card-title text-base text-warning">Setup Admin Pertama</h2>
        <p class="text-sm text-base-content/60 mb-3">Setup awal tidak memerlukan autentikasi. Hanya digunakan sekali.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <label class="form-control">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai</span></div>
            <input type="text" id="setup-id" placeholder="Contoh: P001" class="input input-bordered input-sm" />
          </label>
          <label class="form-control">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">Nama Lengkap</span></div>
            <input type="text" id="setup-nama" class="input input-bordered input-sm" />
          </label>
          <label class="form-control">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN (min 6 digit)</span></div>
            <input type="password" id="setup-pin" class="input input-bordered input-sm" />
          </label>
        </div>
        <div class="card-actions mt-3">
          <button class="btn btn-warning btn-sm" id="btn-setup-admin">Daftarkan Admin Pertama</button>
        </div>
      </div>
    </div>

    <!-- Dashboard Admin (muncul setelah login) -->
    <div id="admin-dashboard" class="hidden">

      <div role="tablist" class="tabs tabs-boxed mb-4">
        <button role="tab" class="tab tab-active" data-tab="antrian">Kelola Antrian</button>
        <button role="tab" class="tab" data-tab="operasional">Operasional</button>
        <button role="tab" class="tab" data-tab="petugas">Manajemen Petugas</button>
        <button role="tab" class="tab" data-tab="log">Log Aktivitas</button>
      </div>

      <!-- Tab 1: Kelola Antrian -->
      <div id="tab-antrian" class="tab-content">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Statistik Hari Ini</h3>
                <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
              </div>
              <div class="stats stats-vertical shadow-none bg-transparent -mx-2 mt-2">
                <div class="stat py-2"><div class="stat-title text-xs">Total Booking</div><div class="stat-value text-2xl" id="adm-stat-bookings">—</div></div>
                <div class="stat py-2"><div class="stat-title text-xs">Dilayani</div><div class="stat-value text-2xl" id="adm-stat-served">—</div></div>
                <div class="stat py-2"><div class="stat-title text-xs">Dibatalkan</div><div class="stat-value text-2xl" id="adm-stat-cancelled">—</div></div>
              </div>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Panggil Antrian</h3>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Pilih Layanan</span></div>
                <select id="adm-select-service-call" class="select select-bordered select-sm w-full"><option value="">-- Pilih layanan --</option></select>
              </label>
              <div class="flex flex-col gap-2">
                <button class="btn btn-primary btn-sm w-full" id="btn-call-next">▶ Panggil Berikutnya</button>
                <div class="flex gap-2">
                  <button class="btn btn-warning btn-sm flex-1" id="btn-pause-service">⏸ Jeda</button>
                  <button class="btn btn-success btn-sm flex-1" id="btn-resume-service">▶ Buka</button>
                </div>
              </div>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Check-In Warga</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Kode Booking</span></div>
                <input type="text" id="adm-booking-code" placeholder="Masukkan kode booking" class="input input-bordered input-sm w-full uppercase" />
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan</span></div>
                <select id="adm-select-service-checkin" class="select select-bordered select-sm w-full"><option value="">-- Pilih layanan --</option></select>
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-checkin">✓ Check-In</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Operasional -->
      <div id="tab-operasional" class="tab-content hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Kirim Pengumuman</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Layanan (kosong = semua)</span></div>
                <select id="adm-announce-service" class="select select-bordered select-sm w-full"><option value="">-- Semua Layanan --</option></select>
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Isi Pengumuman</span></div>
                <input type="text" id="adm-announce-msg" placeholder="Pesan pengumuman..." class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-announce">📢 Kirim</button>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Walk-In (Daftar Langsung)</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">NIK Warga</span></div>
                <input type="text" id="adm-walkin-nik" maxlength="16" placeholder="16 digit NIK" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan</span></div>
                <select id="adm-walkin-service" class="select select-bordered select-sm w-full"><option value="">-- Pilih layanan --</option></select>
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-walkin">➕ Daftarkan Walk-In</button>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm border border-error/20">
            <div class="card-body">
              <h3 class="font-semibold mb-3 text-error">Reset Quota Harian</h3>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan (kosong = semua)</span></div>
                <select id="adm-reset-service" class="select select-bordered select-sm w-full"><option value="">-- Semua Layanan --</option></select>
              </label>
              <button class="btn btn-error btn-sm w-full" id="btn-reset-quota">🔄 Reset Quota</button>
              <p class="text-xs text-error/70 mt-2">⚠️ Tidak bisa dibatalkan.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 3: Manajemen Petugas -->
      <div id="tab-petugas" class="tab-content hidden">
        <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold">Daftar Petugas</h3>
                <button class="btn btn-ghost btn-xs" id="btn-refresh-officers">↻ Refresh</button>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead><tr><th>ID Pegawai</th><th>Nama</th><th>Jabatan</th><th>Role</th><th>Aksi</th></tr></thead>
                  <tbody id="officers-table-body">
                    <tr><td colspan="5" class="text-center text-base-content/40 py-6">Memuat data...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-1">Tambah Petugas Baru</h3>
              <p class="text-xs text-base-content/50 mb-3">Memerlukan PIN Anda untuk konfirmasi.</p>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">PIN Anda (konfirmasi)</span></div>
                <input type="password" id="officer-req-pin" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">ID Pegawai Baru</span></div>
                <input type="text" id="new-officer-id" placeholder="P002" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Nama Lengkap</span></div>
                <input type="text" id="new-officer-nama" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Jabatan</span></div>
                <input type="text" id="new-officer-jabatan" placeholder="Petugas Loket" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Role</span></div>
                <select id="new-officer-role" class="select select-bordered select-sm w-full">
                  <option value="PETUGAS">PETUGAS</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">PIN Baru (min 6 digit)</span></div>
                <input type="password" id="new-officer-pin" class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-add-officer">➕ Tambah Petugas</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 4: Log Aktivitas -->
      <div id="tab-log" class="tab-content hidden">
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <h2 class="font-semibold">Log Aktivitas Admin</h2>
                <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
              </div>
              <button class="btn btn-ghost btn-xs" id="btn-clear-log">Bersihkan</button>
            </div>
            <div id="activity-log" class="flex flex-col gap-1 max-h-96 overflow-y-auto text-sm"
                 role="log" aria-live="polite">
              <p class="text-base-content/40 italic text-center py-6">Menunggu event...</p>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /admin-dashboard -->
  </div>

  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/admin.js"></script>
</body>
</html>
```

---

### 5.11 Logic Halaman Admin

**File: `frontend/js/admin.js`**

```javascript
(function() {

  // ── Tab Handling ─────────────────────────────────────────────────────────────
  document.querySelectorAll('[role="tab"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[role="tab"]').forEach(b => b.classList.remove('tab-active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('tab-active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // ── Cek Status Inisialisasi Sistem ───────────────────────────────────────────
  EventBus.on('wsConnected', () => { sendCommand('CHECK_SYSTEM_INITIALIZED'); });

  EventBus.on('systemInitStatus', (msg) => {
    if (msg.error) return;
    const initialized = msg.payload?.initialized;
    document.getElementById('init-banner')?.classList.toggle('hidden', initialized);
    document.getElementById('admin-setup-panel')?.classList.toggle('hidden', initialized);
  });

  // ── Setup Admin Pertama ───────────────────────────────────────────────────────
  document.getElementById('btn-setup-admin')?.addEventListener('click', () => {
    const id_pegawai = document.getElementById('setup-id')?.value.trim().toUpperCase();
    const nama       = document.getElementById('setup-nama')?.value.trim();
    const pin        = document.getElementById('setup-pin')?.value.trim();
    if (!id_pegawai || !nama || !pin || pin.length < 6) {
      showNotification('Data Tidak Lengkap', 'Isi semua field. PIN minimal 6 digit.', 'warning'); return;
    }
    sendCommand('REGISTER_OFFICER', { id_pegawai, nama, jabatan: 'Administrator', role: 'ADMIN', pin });
  });

  // ── Login Admin ───────────────────────────────────────────────────────────────
  document.getElementById('btn-admin-login')?.addEventListener('click', () => {
    const id_pegawai = document.getElementById('admin-id')?.value.trim().toUpperCase();
    const pin        = document.getElementById('admin-pin')?.value.trim();
    if (!id_pegawai || !pin) { showNotification('Data Kosong', 'Isi ID Pegawai dan PIN.', 'warning'); return; }
    sendCommand('ADMIN_LOGIN', { id_pegawai, pin });
  });

  EventBus.on('adminLoginResult', (msg) => {
    if (msg.error) { showNotification('Login Gagal', msg.error, 'error'); return; }
    const admin = msg.payload;
    AppState.currentAdmin = admin;
    document.getElementById('admin-login-panel')?.classList.add('hidden');
    document.getElementById('admin-dashboard')?.classList.remove('hidden');
    document.getElementById('admin-subtitle').textContent = `${admin.nama} — ${admin.jabatan} (${admin.role})`;
    showNotification('Login Berhasil', `Selamat datang, ${admin.nama}!`, 'success');
    sendCommand('LIST_SERVICES');
    sendCommand('LIST_OFFICERS');
  });

  // ── Populate Dropdown Layanan ─────────────────────────────────────────────────
  function populateServiceDropdowns(services) {
    const dropdownIds = ['adm-select-service-call','adm-select-service-checkin','adm-announce-service','adm-walkin-service','adm-reset-service'];
    dropdownIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const firstOpt = el.options[0];
      el.innerHTML = '';
      el.appendChild(firstOpt);
      services.forEach(svc => {
        const opt = document.createElement('option');
        opt.value = svc.service_id;
        opt.textContent = `${svc.short_code || svc.service_id} — ${svc.name}`;
        el.appendChild(opt);
      });
    });
  }

  EventBus.on('servicesLoaded', populateServiceDropdowns);
  EventBus.on('servicesUpdate', populateServiceDropdowns);

  // ── Statistik Live ────────────────────────────────────────────────────────────
  EventBus.on('statsUpdate', (stats) => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
    set('adm-stat-bookings', stats.total_bookings_today);
    set('adm-stat-served',   stats.total_served_today);
    set('adm-stat-cancelled',stats.total_cancelled_today);
  });

  // ── Panggil Antrian (BiDi) ────────────────────────────────────────────────────
  document.getElementById('btn-call-next')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', 'Pilih layanan terlebih dahulu.', 'warning'); return; }
    sendCommand('CALL_NEXT', { service_id: serviceId });
  });

  document.getElementById('btn-pause-service')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', '', 'warning'); return; }
    sendCommand('PAUSE_SERVICE', { service_id: serviceId });
  });

  document.getElementById('btn-resume-service')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', '', 'warning'); return; }
    sendCommand('RESUME_SERVICE', { service_id: serviceId });
  });

  // ── Kirim Pengumuman (BiDi) ───────────────────────────────────────────────────
  document.getElementById('btn-announce')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-announce-service')?.value;
    const message   = document.getElementById('adm-announce-msg')?.value.trim();
    if (!message) { showNotification('Pesan Kosong', 'Isi teks pengumuman.', 'warning'); return; }
    sendCommand('ANNOUNCE', { service_id: serviceId || null, message });
    document.getElementById('adm-announce-msg').value = '';
  });

  // ── Check-In Warga ────────────────────────────────────────────────────────────
  document.getElementById('btn-checkin')?.addEventListener('click', () => {
    const bookingCode = document.getElementById('adm-booking-code')?.value.trim().toUpperCase();
    const serviceId   = document.getElementById('adm-select-service-checkin')?.value;
    if (!bookingCode) { showNotification('Kode Kosong', 'Masukkan kode booking.', 'warning'); return; }
    sendCommand('CHECKIN_CITIZEN', { booking_code: bookingCode, service_id: serviceId });
  });

  EventBus.on('checkinResult', (msg) => {
    if (msg.error) showNotification('Check-In Gagal', msg.error, 'error');
    else { showNotification('Check-In Berhasil', 'Warga berhasil check-in.', 'success'); document.getElementById('adm-booking-code').value = ''; }
  });

  // ── Walk-In ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-walkin')?.addEventListener('click', () => {
    const nik       = document.getElementById('adm-walkin-nik')?.value.trim();
    const serviceId = document.getElementById('adm-walkin-service')?.value;
    if (!nik || nik.length !== 16) { showNotification('NIK Tidak Valid', 'Masukkan NIK 16 digit.', 'warning'); return; }
    if (!serviceId) { showNotification('Pilih Layanan', '', 'warning'); return; }
    sendCommand('WALK_IN_CITIZEN', { nik, service_id: serviceId });
  });

  EventBus.on('walkInResult', (msg) => {
    if (msg.error) showNotification('Walk-In Gagal', msg.error, 'error');
    else { showNotification('Walk-In Berhasil', `Nomor antrian: ${msg.payload?.queue_number || '—'}`, 'success'); document.getElementById('adm-walkin-nik').value = ''; }
  });

  // ── Reset Quota Harian ────────────────────────────────────────────────────────
  document.getElementById('btn-reset-quota')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-reset-service')?.value;
    const target    = serviceId ? `layanan ${serviceId}` : 'SEMUA layanan';
    if (!confirm(`Yakin reset quota harian untuk ${target}? Tidak bisa dibatalkan.`)) return;
    sendCommand('RESET_DAILY_QUOTA', { service_id: serviceId || null });
  });

  EventBus.on('resetQuotaResult', (msg) => {
    if (msg.error) showNotification('Reset Gagal', msg.error, 'error');
    else showNotification('Reset Berhasil', 'Quota harian berhasil direset.', 'success');
  });

  // ── Admin Event dari BiDi Stream ──────────────────────────────────────────────
  EventBus.on('adminEvent', (event) => {
    const labels = {
      CALLED:    `📣 Memanggil nomor ${event.data?.called_number || '—'} (${event.data?.service_id})`,
      PAUSED:    `⏸ Layanan ${event.data?.service_id} dijeda`,
      RESUMED:   `▶ Layanan ${event.data?.service_id} dibuka kembali`,
      ANNOUNCED: `📢 Pengumuman terkirim: ${event.data?.message || ''}`,
      STATS:     `📊 Statistik diperbarui`,
    };
    const text = labels[event.event_type] || `Event: ${event.event_type}`;
    EventBus.emit('activityLog', { type: 'admin', message: text, timestamp: event.timestamp });
    showNotification('Admin Event', text, 'info');
  });

  // ── Manajemen Petugas ─────────────────────────────────────────────────────────
  EventBus.on('officersList', (msg) => {
    const tbody = document.getElementById('officers-table-body');
    if (!tbody) return;
    if (msg.error || !msg.payload?.officers?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-base-content/40 py-6">${msg.error || 'Belum ada petugas.'}</td></tr>`;
      return;
    }
    tbody.innerHTML = msg.payload.officers.map(o => `
      <tr>
        <td>${o.id_pegawai || '—'}</td>
        <td>${o.nama || '—'}</td>
        <td>${o.jabatan || '—'}</td>
        <td><span class="badge ${o.role === 'ADMIN' ? 'badge-primary' : 'badge-info'} badge-sm">${o.role || '—'}</span></td>
        <td><button class="btn btn-xs btn-ghost btn-delete-officer" data-id="${o.id_pegawai}" title="Hapus">🗑</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-delete-officer').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.id;
        const reqPin   = document.getElementById('officer-req-pin')?.value.trim();
        if (!reqPin) { showNotification('PIN Diperlukan', 'Isi PIN konfirmasi di form tambah petugas.', 'warning'); return; }
        if (!confirm(`Hapus petugas ${targetId}? Tindakan ini permanen.`)) return;
        sendCommand('DELETE_OFFICER', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: reqPin, target_id: targetId });
      });
    });
  });

  document.getElementById('btn-refresh-officers')?.addEventListener('click', () => sendCommand('LIST_OFFICERS'));

  document.getElementById('btn-add-officer')?.addEventListener('click', () => {
    const reqPin     = document.getElementById('officer-req-pin')?.value.trim();
    const id_pegawai = document.getElementById('new-officer-id')?.value.trim().toUpperCase();
    const nama       = document.getElementById('new-officer-nama')?.value.trim();
    const jabatan    = document.getElementById('new-officer-jabatan')?.value.trim();
    const role       = document.getElementById('new-officer-role')?.value;
    const pin        = document.getElementById('new-officer-pin')?.value.trim();
    if (!reqPin || !id_pegawai || !nama || !pin || pin.length < 6) {
      showNotification('Data Tidak Lengkap', 'Isi semua field. PIN baru minimal 6 digit.', 'warning'); return;
    }
    sendCommand('REGISTER_OFFICER', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: reqPin, id_pegawai, nama, jabatan: jabatan || 'Petugas', role, pin });
  });

  EventBus.on('registerOfficerResult', (msg) => {
    if (msg.error) showNotification('Gagal', msg.error, 'error');
    else {
      showNotification('Berhasil', msg.payload?.message || 'Petugas berhasil didaftarkan.', 'success');
      document.getElementById('init-banner')?.classList.add('hidden');
      document.getElementById('admin-setup-panel')?.classList.add('hidden');
      ['new-officer-id','new-officer-nama','new-officer-jabatan','new-officer-pin'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      if (AppState.currentAdmin) sendCommand('LIST_OFFICERS');
    }
  });

  EventBus.on('deleteOfficerResult', (msg) => {
    if (msg.error) showNotification('Gagal Hapus', msg.error, 'error');
    else { showNotification('Petugas Dihapus', 'Data berhasil dihapus.', 'success'); sendCommand('LIST_OFFICERS'); }
  });

  EventBus.on('updateOfficerResult', (msg) => {
    if (msg.error) showNotification('Gagal Update', msg.error, 'error');
    else { showNotification('Petugas Diperbarui', 'Data berhasil diperbarui.', 'success'); sendCommand('LIST_OFFICERS'); }
  });

  EventBus.on('adminSessionError', () => {
    showNotification('Session Terputus', 'Session admin terputus. Reconnect otomatis dalam 5 detik...', 'warning');
  });

})();
```

---

## 6. Protokol Pesan WebSocket

Semua pesan antara browser dan gateway menggunakan format JSON.

### Dari Browser ke Gateway

> Format: `{ cmd: "NAMA_COMMAND", payload: { ... } }`

| `cmd` | `payload` wajib | Keterangan |
|-------|-----------------|------------|
| `REGISTER_CITIZEN` | `{ nik, nama, no_hp, alamat }` | Daftar warga baru |
| `LOGIN_CITIZEN` | `{ nik }` | Login warga — simpan `citizenId` ke state |
| `LIST_SERVICES` | `{}` | Ambil semua layanan |
| `GET_AVAILABLE_SLOTS` | `{ service_id, date }` | Slot tersedia |
| `CREATE_BOOKING` | `{ citizen_id, nik, service_id, slot_id }` | Buat booking |
| `CANCEL_BOOKING` | `{ booking_code, citizen_id }` | Batalkan booking |
| `GET_MY_BOOKING` | `{ nik, citizen_id }` | Booking aktif warga |
| `RESCHEDULE_BOOKING` | `{ booking_code, citizen_id, new_slot_id }` | Jadwal ulang |
| `CHECK_SYSTEM_INITIALIZED` | `{}` | Cek status inisialisasi |
| `ADMIN_LOGIN` | `{ id_pegawai, pin }` | Login admin — **`id_pegawai`** bukan `officer_id` |
| `CALL_NEXT` | `{ service_id }` | **BiDi** — Panggil antrian berikutnya |
| `ANNOUNCE` | `{ service_id, message }` | **BiDi** — Kirim pengumuman |
| `PAUSE_SERVICE` | `{ service_id }` | **BiDi** — Jeda layanan |
| `RESUME_SERVICE` | `{ service_id }` | **BiDi** — Buka layanan |
| `CHECKIN_CITIZEN` | `{ booking_code, service_id }` | Check-in warga |
| `WALK_IN_CITIZEN` | `{ nik, service_id }` | Daftarkan walk-in |
| `RESET_DAILY_QUOTA` | `{ service_id }` | Reset quota (null = semua) |
| `REGISTER_OFFICER` | `{ id_pegawai, nama, jabatan, role, pin, requester_id?, requester_pin? }` | Daftar petugas |
| `DELETE_OFFICER` | `{ requester_id, requester_pin, target_id }` | Hapus petugas |
| `LIST_OFFICERS` | `{}` | Daftar semua petugas |

### Dari Gateway ke Browser

#### Push Server-Initiated (tanpa request dari browser)

| `type` | Interval | Keterangan |
|--------|----------|------------|
| `CONNECTED` | Saat connect | Konfirmasi koneksi + `clientId` |
| `HEARTBEAT` | 30 detik | Keep-alive |
| `STATS_PUSH` | 5 detik | Statistik sistem + `per_service` |
| `SERVICES_STATUS_UPDATE` | 8 detik | Status semua layanan (field `status` string hasil konversi) |
| `NEW_ANNOUNCEMENT` | 12 detik | Pengumuman baru jika ada yang belum dikirim |
| *(Initial Snapshot)* | Saat connect (+300ms) | Layanan + stats langsung saat pertama connect |

#### Event dari gRPC Stream (Real-Time)

| `type` | Sumber | Keterangan |
|--------|--------|------------|
| `QUEUE_UPDATE` | `QueueService.WatchQueue` | Sub-type di `payload.event_type`: `QUEUE_MOVED`, `YOUR_TURN`\*, `SERVICE_CLOSED`, `SERVICE_RESUMED`, `ANNOUNCEMENT`, `QUOTA_OPENED` |
| `ADMIN_EVENT` | `AdminService.AdminSession` | Response dari perintah admin BiDi |
| `ADMIN_SESSION_ERROR` | Gateway | Session BiDi terputus |

> **\*** Event `YOUR_TURN` dikirim hanya ke WebSocket client dengan `citizenId` yang cocok — **bukan broadcast ke semua**.

#### Respons dari Unary Command

| `type` | Dipicu oleh |
|--------|-------------|
| `LOGIN_RESULT` | `LOGIN_CITIZEN` |
| `REGISTER_RESULT` | `REGISTER_CITIZEN` |
| `SERVICES_LIST` | `LIST_SERVICES` |
| `SLOTS_LIST` | `GET_AVAILABLE_SLOTS` |
| `BOOKING_RESULT` | `CREATE_BOOKING` |
| `MY_BOOKING` | `GET_MY_BOOKING` |
| `CANCEL_RESULT` | `CANCEL_BOOKING` |
| `RESCHEDULE_RESULT` | `RESCHEDULE_BOOKING` |
| `SYSTEM_INIT_STATUS` | `CHECK_SYSTEM_INITIALIZED` |
| `ADMIN_LOGIN_RESULT` | `ADMIN_LOGIN` |
| `CHECKIN_RESULT` | `CHECKIN_CITIZEN` |
| `WALK_IN_RESULT` | `WALK_IN_CITIZEN` |
| `RESET_QUOTA_RESULT` | `RESET_DAILY_QUOTA` |
| `OFFICERS_LIST` | `LIST_OFFICERS` |
| `REGISTER_OFFICER_RESULT` | `REGISTER_OFFICER` |
| `DELETE_OFFICER_RESULT` | `DELETE_OFFICER` |
| `ERROR` | Gateway (command tidak dikenal, parse error) |

---

## 7. Mapping Fitur Tugas ke Implementasi

### Fitur Wajib 1 — Streaming gRPC ke WebSocket

**Implementasi:** `gateway/streamBridge.js` → `subscribeToQueue()`

Saat gateway start, `startStreamBridge()` memanggil `ListServices()` lalu memanggil `subscribeToQueue()` untuk setiap layanan. Fungsi ini membuka koneksi `QueueService.WatchQueue` yang persistent dan otomatis reconnect jika terputus. Setiap event dari gRPC diteruskan ke browser via `broadcast()` (umum) atau `sendToClientByCitizenId()` (personal).

**Di frontend:** `ws-client.js` menerima `QUEUE_UPDATE` → `EventBus.emit('queueUpdate')` → komponen grafik, log, dan status badge update secara otomatis.

---

### Fitur Wajib 2 — Event-Driven UI (minimal 3 komponen)

| # | Komponen | File | Trigger Event | Behavior |
|---|----------|------|---------------|---------|
| 1 | **Status Badge** per layanan | `status-indicator.js` | `SERVICES_STATUS_UPDATE`, `QUEUE_UPDATE` | Badge OPEN/PAUSED/CLOSED berubah; angka menunggu update dari stream real-time |
| 2 | **Grafik Antrian** — ApexCharts | `chart.js` | `STATS_PUSH`, `QUEUE_UPDATE` | Bar chart animasi menunjukkan antrian & quota tiap layanan; update halus via `updateSeries()` |
| 3 | **Activity Log** event feed | `activity-log.js` | Semua event: queue, announce, admin, system | Feed bertambah tiap event, max 100 baris, tanpa refresh halaman |

Ketiga komponen **tidak pernah di-refresh secara manual** — semuanya berubah eksklusif berdasarkan event WebSocket.

---

### Fitur Wajib 3 — Server-Initiated Events

**Implementasi:** `gateway/pushScheduler.js`

Gateway menjalankan empat interval paralel **tanpa menunggu request dari browser:**

| Scheduler | Interval | Event | Efek di UI |
|-----------|----------|-------|------------|
| Stats Pusher | 5 detik | `STATS_PUSH` | Grafik + statistik diperbarui |
| Service Status Pusher | 8 detik | `SERVICES_STATUS_UPDATE` | Badge status per layanan diperbarui |
| Announcement Pusher | 12 detik | `NEW_ANNOUNCEMENT` | Toast notification muncul di semua browser |
| Heartbeat | 30 detik | `HEARTBEAT` | Keep-alive |

**Initial Snapshot:** Saat client pertama connect, snapshot langsung dikirim dalam 300ms tanpa menunggu interval pertama.

---

### Fitur Wajib 4 — Command & Control Bridge

**Implementasi:** `commandHandler.js` + `admin.js`

Alur penuh saat admin menekan "Panggil Berikutnya":

```
[Browser]  btn-call-next diklik
    ↓      sendCommand('CALL_NEXT', { service_id })
    ↓      ws-client.js → ws.send(JSON)
    ↓      [WebSocket]
[Gateway]  wsManager → handleCommand() → commandHandler
    ↓      adminSessions.get(clientId).session.write({ command_type:'CALL_NEXT' })
    ↓      [gRPC BiDi Stream]
[Server]   adminService.js proses CALL_NEXT → update queueStore → broadcast
    ↓      queueService.js → WatchQueue subscriber notified
    ↓      [gRPC Server Stream]
[Gateway]  streamBridge.js menerima → broadcast({ type:'QUEUE_UPDATE' })
    ↓      [WebSocket]
[Browser]  ws-client.js → EventBus → chart, activity-log, badge update
```

Seluruh siklus ini terjadi dalam milidetik tanpa refresh halaman. Multi-admin concurrent didukung via `Map<clientId, session>`.

---

## 8. Cara Menjalankan Sistem Lengkap

### Urutan Start (WAJIB diikuti)

```bash
# Terminal 1 — gRPC Server SiAntre
cd SiAntre
npm run server
# Tunggu: "gRPC server running on 0.0.0.0:50051"

# Terminal 2 — WebSocket Gateway
cd SiAntre/gateway
npm install        # Pertama kali saja
node index.js      # atau: npm start
# Tunggu: "[Gateway] Berjalan di http://localhost:3001"

# Browser
# Warga: http://localhost:3001/index.html
# Admin: http://localhost:3001/admin.html
```

### Variabel Environment (Opsional)

```bash
GATEWAY_PORT=8080 node index.js             # Port berbeda
GRPC_ADDR=192.168.1.10:50051 node index.js  # gRPC server remote
ALLOWED_ORIGIN=http://192.168.1.5 node index.js  # Batasi CORS
```

### Skenario Demo End-to-End

**Langkah 1 — Inisialisasi sistem**
```
Buka http://localhost:3001/admin.html
→ Banner "Sistem Belum Diinisialisasi" muncul otomatis
→ Isi setup: ID Pegawai, Nama, PIN ≥ 6 digit → Daftarkan Admin Pertama
```

**Langkah 2 — Login admin & siapkan**
```
→ Login dengan ID Pegawai + PIN
→ Dashboard muncul (4 tab: Kelola Antrian, Operasional, Manajemen Petugas, Log)
```

**Langkah 3 — Warga daftar & booking**
```
Buka http://localhost:3001/index.html (browser/tab berbeda)
→ Tab Daftar → isi data → Daftar Akun
→ Tab Masuk → NIK → Masuk
→ Pilih layanan → pilih slot → Pesan Sekarang
```

**Langkah 4 — Pantau event real-time**
```
Di halaman warga:
→ Grafik antrian otomatis muncul (initial snapshot dalam 300ms)
→ Status badge berubah sesuai kondisi layanan
→ Activity log menerima event push dari scheduler
```

**Langkah 5 — Operasi admin (Command & Control)**
```
Di halaman admin:
→ Panggil Berikutnya → antrian maju di halaman warga secara real-time
→ Kirim Pengumuman → toast muncul di SEMUA browser warga
→ Jeda/Buka Layanan → badge status berubah di halaman warga
→ Jika giliran warga: spring toast "🎉 GILIRAN ANDA!" + suara HANYA di browser warga tersebut
```

### Catatan CDN (Untuk Demo Offline)

```bash
mkdir -p frontend/js/lib frontend/css

# DaisyUI
curl -o frontend/css/daisyui.min.css \
  https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css

# ApexCharts
curl -o frontend/js/lib/apexcharts.min.js \
  https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js

# anime.js
curl -o frontend/js/lib/anime.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js

# Tailwind CDN
curl -o frontend/js/lib/tailwind.js \
  https://cdn.tailwindcss.com/3.4.0/tailwind.min.js
```

Kemudian ubah semua link CDN di HTML menjadi path lokal (`js/lib/...`, `css/daisyui.min.css`).

---

## 9. Troubleshooting

### `ServiceInfoService is not a constructor`

**Penyebab:** Namespace proto salah.

**Solusi:** Buka `grpcClients.js`, pastikan akses via `.siantre.`:
```javascript
// ❌ SALAH
new serviceInfoProto.ServiceInfoService(grpcAddr, creds)
// ✅ BENAR
new serviceInfoProto.siantre.ServiceInfoService(grpcAddr, creds)
```

---

### Admin session error langsung setelah login

**Penyebab:** Mengirim `command_type: 'LOGIN'` ke BiDi stream (tidak dikenal server).

**Solusi:** Pastikan `startAdminSession()` dipanggil di callback `LoginOfficer` tanpa mengirim pesan login ke stream. Server hanya menerima: `CALL_NEXT`, `ANNOUNCE`, `PAUSE`, `RESUME`, `GET_STATS`.

---

### Login admin selalu gagal dari Web UI

**Penyebab:** Field name `officer_id` vs `id_pegawai`.

**Solusi:** Pastikan form dan payload menggunakan `id_pegawai`:
```javascript
sendCommand('ADMIN_LOGIN', { id_pegawai: '...', pin: '...' })
```

---

### Status badge semua menampilkan "undefined" atau "CLOSED" salah

**Penyebab:** `s.status` tidak ada di response — hanya `is_open` (boolean).

**Solusi:** Pastikan `pushScheduler.js` menggunakan `deriveServiceStatus()` dan `status-indicator.js` punya fallback `svc.status || (svc.is_open ? 'OPEN' : 'CLOSED')`.

---

### Dua admin login bersamaan — session konflik

**Penyebab:** Singleton `adminSession` global (versi lama).

**Solusi:** `commandHandler.js` final menggunakan `Map<clientId, session>`. Setiap koneksi admin punya session sendiri.

---

### Warga lain menerima `YOUR_TURN` yang bukan miliknya

**Penyebab:** Event `YOUR_TURN` di-broadcast ke semua.

**Solusi:** `streamBridge.js` memanggil `sendToClientByCitizenId()` untuk `YOUR_TURN`. Pastikan warga sudah melakukan `LOGIN_CITIZEN` agar `citizenId` tersimpan di `clientStates`.

---

### WebSocket pakai `ws://` padahal halaman di HTTPS

**Penyebab:** URL hardcoded `ws://` (browser blokir sebagai mixed content).

**Solusi (sudah ada di ws-client.js v3):**
```javascript
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
```

---

### Client terus reconnect meski server sengaja menutup koneksi

**Penyebab:** `onclose` lama selalu reconnect tanpa membaca `CloseEvent.code`.

**Solusi (sudah ada di ws-client.js v3):**
```javascript
ws.addEventListener('close', (event) => {
  if (event.code !== 1000 && event.code !== 1001) scheduleReconnect();
});
```

---

### Suara `YOUR_TURN` tidak berbunyi

**Penyebab:** Browser policy melarang `AudioContext` sebelum ada user gesture.

**Solusi:** Ini adalah browser security policy. `notification.js` sudah menangani ini dengan `document.addEventListener('click', getAudioContext, { once: true })`. Pastikan user sudah klik sesuatu sebelum notifikasi datang saat demo.

---

### ApexCharts tidak muncul / container kosong

**Penyebab:** `initChart()` dipanggil sebelum DOM siap, atau `<div id="queue-chart">` tidak ditemukan.

**Solusi:** Pastikan `initChart()` ada di dalam `DOMContentLoaded`. Jangan sembunyikan container dengan `display:none` — gunakan `opacity:0` atau `visibility:hidden` jika perlu.

---

### Gateway terhubung ke gRPC tapi tidak ada event

**Kemungkinan penyebab:**
1. Sistem belum diinisialisasi — stream bridge berhasil tapi tidak ada layanan. Inisialisasi via halaman admin.
2. `queue_number=0` tidak dihandle server — periksa implementasi `WatchQueue` di `queueService.js`.
3. Stream terputus segera — cek log terminal gateway. Auto-reconnect aktif setelah 5 detik.

---

### Error `Cannot find package 'ws' / 'cors'`

```bash
cd SiAntre/gateway
npm install
```

---

## 10. Referensi & Dependensi

### Dependensi Gateway (`gateway/package.json`)

| Package | Versi | Fungsi |
|---------|-------|--------|
| `ws` | ^8.16.0 | WebSocket server library |
| `express` | ^4.18.0 | HTTP server & static file serving |
| `cors` | ^2.8.5 | Header CORS untuk akses cross-origin |
| `@grpc/grpc-js` | ^1.10.0 | gRPC client (install terpisah di gateway) |
| `@grpc/proto-loader` | ^0.7.0 | Parser file `.proto` saat runtime |

### Dependensi Frontend (CDN — tidak perlu install)

| Library | Versi | Fungsi |
|---------|-------|--------|
| **DaisyUI** | 4.12.10 | Base styling — card, badge, btn, toast, table, modal |
| **Tailwind** | CDN Play | Utility classes untuk DaisyUI (tanpa build step) |
| **anime.js** | 3.2.2 | Flip angka antrian + spring toast YOUR_TURN |
| **ApexCharts** | 3.54.0 | Grafik realtime dengan animasi update halus |
| **Web Audio API** | — | Suara notifikasi YOUR_TURN (bawaan browser, tanpa CDN) |

### Port yang Digunakan

| Port | Komponen | Keterangan |
|------|----------|------------|
| `50051` | gRPC Server (`server/index.js`) | Tidak berubah dari project sebelumnya |
| `3001` | WebSocket Gateway (`gateway/index.js`) | HTTP + WebSocket dalam satu port |

### Referensi Dokumentasi

- [WebSocket API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) *(referensi utama)*
- [CloseEvent — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent) *(untuk perbaikan M2)*
- [Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) *(notifikasi suara)*
- [DaisyUI Components](https://daisyui.com/components/)
- [anime.js Documentation](https://animejs.com/documentation/)
- [ApexCharts — Bar Chart](https://apexcharts.com/javascript-chart-demos/bar-charts/)
- [ws library — npm](https://www.npmjs.com/package/ws)
- [gRPC Node.js — @grpc/grpc-js](https://www.npmjs.com/package/@grpc/grpc-js)
- [gRPC Streaming Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [CORS — cors npm package](https://www.npmjs.com/package/cors)

---

*Dokumen ini adalah panduan final SiAntre WebSocket Implementation, hasil konsolidasi dari v1 (rancangan awal), v2 (15 perbaikan bug kritis + fitur baru), dan v3 (6 perbaikan MDN WebSocket API + stack frontend baru). Semua perbaikan bertanda 🔴 **wajib** diimplementasikan. Perbaikan 🟡 sangat disarankan untuk stabilitas. Perbaikan 🟢 meningkatkan kualitas UX secara signifikan.*
