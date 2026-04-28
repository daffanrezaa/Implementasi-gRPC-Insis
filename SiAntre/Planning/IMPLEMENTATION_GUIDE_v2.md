# SiAntre — Frontend & WebSocket Implementation Guide v2

> Panduan implementasi WebSocket Gateway + Web UI untuk SiAntre (Revisi berdasarkan gap analysis & evaluasi v1)

---

## Catatan Revisi (v1 → v2)

Dokumen ini adalah revisi menyeluruh dari implementation guide sebelumnya. Perubahan utama:

| # | Kategori | Perubahan |
|---|---|---|
| 1–4 | **Bug Kritis** | Perbaikan namespace proto, command LOGIN invalid, field name mismatch, field `status` layanan |
| 5–6 | **Arsitektur** | Admin session per-koneksi (bukan singleton), targeted delivery untuk event personal |
| 7–9 | **Desain** | Penanganan `queue_number=0`, initial state snapshot, auto-reconnect admin session |
| 10–15 | **Fitur Baru** | `IsSystemInitialized`, manajemen petugas via Web, keamanan WS token, CORS, anotasi field announcement |

---

## Daftar Isi

1. [Gambaran Arsitektur (Diperbarui)](#1-gambaran-arsitektur-diperbarui)
2. [Prasyarat & Setup Awal](#2-prasyarat--setup-awal)
3. [Struktur Direktori Akhir](#3-struktur-direktori-akhir)
4. [Tahap 1 — WebSocket Gateway (Semua File Direvisi)](#4-tahap-1--websocket-gateway)
   - [4.1 Inisialisasi Project Gateway](#41-inisialisasi-project-gateway)
   - [4.2 Entry Point Gateway](#42-entry-point-gateway)
   - [4.3 gRPC Client Manager ⚠️ DIPERBAIKI](#43-grpc-client-manager--diperbaiki)
   - [4.4 Stream Bridge (gRPC → WebSocket) ⚠️ DIPERBAIKI](#44-stream-bridge-grpc--websocket--diperbaiki)
   - [4.5 Command Handler ⚠️ DIPERBAIKI MAYOR](#45-command-handler--diperbaiki-mayor)
   - [4.6 Push Scheduler ⚠️ DIPERBAIKI](#46-push-scheduler--diperbaiki)
   - [4.7 WebSocket Server Manager ⚠️ DIPERBAIKI](#47-websocket-server-manager--diperbaiki)
5. [Tahap 2 — Frontend Web UI (Semua File Direvisi)](#5-tahap-2--frontend-web-ui)
   - [5.1 Struktur HTML Utama](#51-struktur-html-utama)
   - [5.2 Stylesheet](#52-stylesheet)
   - [5.3 WebSocket Client & State Management ⚠️ DIPERBAIKI](#53-websocket-client--state-management--diperbaiki)
   - [5.4 Komponen: Grafik Antrian Live ⚠️ DIPERBAIKI](#54-komponen-grafik-antrian-live--diperbaiki)
   - [5.5 Komponen: Activity Log](#55-komponen-activity-log)
   - [5.6 Komponen: Status Indikator Layanan ⚠️ DIPERBAIKI](#56-komponen-status-indikator-layanan--diperbaiki)
   - [5.7 Komponen: Notifikasi & Alert](#57-komponen-notifikasi--alert)
   - [5.8 Halaman Warga ⚠️ DIPERBAIKI](#58-halaman-warga--diperbaiki)
   - [5.9 Halaman Admin ⚠️ DIPERBAIKI MAYOR](#59-halaman-admin--diperbaiki-mayor)
6. [Protokol Pesan WebSocket (Diperbarui)](#6-protokol-pesan-websocket-diperbarui)
7. [Mapping Fitur Tugas ke Implementasi](#7-mapping-fitur-tugas-ke-implementasi)
8. [Cara Menjalankan Sistem Lengkap](#8-cara-menjalankan-sistem-lengkap)
9. [Troubleshooting (Diperbarui)](#9-troubleshooting-diperbarui)
10. [Referensi & Dependensi](#10-referensi--dependensi)

---

## 1. Gambaran Arsitektur (Diperbarui)

Browser tidak bisa berbicara langsung dengan gRPC server karena gRPC menggunakan HTTP/2 dengan binary framing yang tidak didukung natively oleh browser. Solusinya adalah **WebSocket Gateway** — proses Node.js tambahan yang bertindak sebagai jembatan.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Port 3001)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Grafik      │  │ Activity Log │  │  Status    │  │  Panel Admin       │ │
│  │  Antrian     │  │  (Event Feed)│  │  Indikator │  │  (Commands +       │ │
│  │  (Chart.js)  │  │              │  │  per Svc   │  │   Officer Mgmt)    │ │
│  └──────────────┘  └──────────────┘  └────────────┘  └────────────────────┘ │
│         │                  │                │                  │              │
│         └──────────────────┴────────────────┴──────────────────┘             │
│                       WebSocket API (built-in browser)                       │
│                 [Token auth header pada koneksi pertama] ← BARU              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ ws://localhost:3001
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET GATEWAY (Port 3001)                           │
│                          gateway/index.js                                    │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  WS Server       │  │  Stream Bridge   │  │  Push Scheduler           │  │
│  │  (ws library)    │  │  gRPC → WS fanout│  │  Server-initiated events  │  │
│  │  + Session Store │  │  WatchQueue sub  │  │  Stats, status, heartbeat │  │
│  │  ← DIPERBARUI    │  │  ← DIPERBARUI    │  │  ← DIPERBAIKI             │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐                                  │
│  │  Command Handler │  │  gRPC Clients    │                                  │
│  │  Per-conn session│  │  + Namespace fix │                                  │
│  │  ← DIPERBAIKI    │  │  ← DIPERBAIKI    │                                  │
│  └──────────────────┘  └──────────────────┘                                  │
│                          │ @grpc/grpc-js                                      │
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
| Streaming gRPC → WebSocket | Server → Gateway → Browser | `WatchQueue` stream, Stream Bridge, grafik |
| Event-Driven UI (3 komponen) | Server → Browser | Grafik, Log, Status Badge |
| Server-Initiated Events | Gateway → Browser (tanpa request) | Push Scheduler, notifikasi alert |
| Command & Control Bridge | Browser → Gateway → gRPC | Panel admin, Command Handler, AdminSession per-koneksi |

### Perubahan Arsitektur Utama vs v1

- **Admin Session menjadi per-koneksi** — `commandHandler` sekarang menyimpan `Map<clientId, adminSession>` bukan satu singleton global. Multi-admin dari browser berbeda kini bisa berjalan bersamaan tanpa konflik.
- **Session State per Client** — `wsManager` menyimpan `Map<ws, clientState>` yang mencatat `{ clientId, citizenId, role }`. Ini digunakan untuk targeted delivery event personal seperti `YOUR_TURN`.
- **Initial Snapshot on Connect** — Saat client baru terhubung, gateway langsung mengirimkan state terkini (daftar layanan dan stats) tanpa menunggu push scheduler.

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

> **Catatan Penting:** Gateway **harus dijalankan setelah** gRPC server. Gateway memiliki mekanisme auto-retry jika server belum siap, tapi urutan start tetap penting.

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
│   ├── grpcClients.js              # Inisialisasi semua gRPC stubs (DIPERBAIKI)
│   ├── streamBridge.js             # gRPC stream → WS broadcast (DIPERBAIKI)
│   ├── commandHandler.js           # WS command → gRPC call (DIPERBAIKI MAYOR)
│   ├── pushScheduler.js            # Server-initiated events (DIPERBAIKI)
│   └── wsManager.js                # WebSocket server & client registry (DIPERBAIKI)
│
└── frontend/                       # BARU — Web UI
    ├── index.html                  # Halaman utama (warga)
    ├── admin.html                  # Halaman admin (DIPERLUAS)
    ├── css/
    │   └── style.css               # Stylesheet global
    └── js/
        ├── ws-client.js            # WebSocket client & event router (DIPERBAIKI)
        ├── chart.js                # Grafik antrian (DIPERBAIKI)
        ├── activity-log.js         # Komponen log aktivitas
        ├── status-indicator.js     # Badge status layanan (DIPERBAIKI)
        ├── notification.js         # Toast notification & alert
        ├── warga.js                # Logic halaman warga (DIPERBAIKI)
        └── admin.js                # Logic halaman admin (DIPERBAIKI MAYOR)
```

---

## 4. Tahap 1 — WebSocket Gateway

### 4.1 Inisialisasi Project Gateway

```bash
# Dari root proyek SiAntre
mkdir gateway
cd gateway
npm init -y
npm install ws express @grpc/grpc-js @grpc/proto-loader cors
```

Edit `gateway/package.json`:

```json
{
  "name": "siantre-gateway",
  "version": "2.0.0",
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

const { initGrpcClients }   = require('./grpcClients');
const { initWsServer }      = require('./wsManager');
const { startStreamBridge } = require('./streamBridge');
const { startPushScheduler }= require('./pushScheduler');

const PORT      = process.env.GATEWAY_PORT || 3001;
const GRPC_ADDR = process.env.GRPC_ADDR    || 'localhost:50051';

async function main() {
  console.log('[Gateway] Memulai SiAntre WebSocket Gateway v2...');

  // 1. Inisialisasi semua gRPC client stubs
  const clients = initGrpcClients(GRPC_ADDR);
  console.log('[Gateway] gRPC clients berhasil dibuat');

  // 2. Setup Express
  const app = express();

  // FIX #14 — Konfigurasi CORS agar frontend bisa diakses dari origin berbeda
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
    console.log(`[Gateway] Frontend: http://localhost:${PORT}/index.html`);
    console.log(`[Gateway] Admin:    http://localhost:${PORT}/admin.html`);
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

### 4.3 gRPC Client Manager ⚠️ DIPERBAIKI

**File: `gateway/grpcClients.js`**

> **BUG #1 DIPERBAIKI:** File `.proto` SiAntre menggunakan `package siantre;`, sehingga semua service harus diakses melalui namespace `.siantre.ServiceName`. Versi sebelumnya (`serviceInfoProto.ServiceInfoService`) akan menghasilkan error `is not a constructor` karena langsung mencari di root object.

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
 * Maka akses service melalui: proto.siantre.NamaService
 * Bukan: proto.NamaService  ← INI SALAH (versi lama)
 */
function initGrpcClients(grpcAddr) {
  const creds = grpc.credentials.createInsecure();

  const serviceInfoProto = loadProto('service_info.proto');
  const bookingProto     = loadProto('booking.proto');
  const queueProto       = loadProto('queue.proto');
  const adminProto       = loadProto('admin.proto');

  // Akses melalui namespace .siantre. sesuai package di file .proto
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

> **Cara Verifikasi Namespace:** Buka setiap file `.proto` dan cari baris `package`. Jika tertulis `package siantre;`, maka akses melalui `proto.siantre.ServiceName`. Jika tidak ada baris package, akses langsung `proto.ServiceName`.

---

### 4.4 Stream Bridge (gRPC → WebSocket) ⚠️ DIPERBAIKI

**File: `gateway/streamBridge.js`**

> **PERBAIKAN BUG:** `subscribeToQueue` dipanggil dengan `queue_number: 0` sebagai "watch all". Ini adalah perilaku server-side yang perlu dijaga konsistensinya — server harus mem-broadcast ke subscriber dengan `queue_number = 0`. Jika server tidak mendukung ini, lihat catatan di bawah.
>
> **PERBAIKAN DESAIN #6 (Targeted Delivery):** Sekarang stream bridge memanggil `broadcastOrTarget` dari `wsManager` yang bisa men-deliver event `YOUR_TURN` hanya ke warga yang bersangkutan, bukan ke semua client.

```javascript
'use strict';

const { broadcast, sendToClientByCitizenId } = require('./wsManager');

const activeStreams = new Map();

/**
 * Subscribe ke WatchQueue untuk service_id tertentu.
 *
 * CATATAN queue_number = 0:
 * Nilai 0 digunakan sebagai sinyal ke server agar mengirimkan semua
 * event antrian (bukan hanya milik satu warga). Server harus menangani
 * ini di queueService.js — periksa implementasi WatchQueue di server.
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
    // Event YOUR_TURN dikirim hanya ke warga yang bersangkutan (via citizen_id)
    // Event lain (QUEUE_MOVED, ANNOUNCEMENT, dll.) di-broadcast ke semua
    if (update.event_type === 'YOUR_TURN' && update.citizen_id) {
      sendToClientByCitizenId(update.citizen_id, payload);

      // Juga broadcast versi umum tanpa identitas personal
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
    // Reconnect jika stream berakhir tiba-tiba (bukan karena cancel)
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

### 4.5 Command Handler ⚠️ DIPERBAIKI MAYOR

**File: `gateway/commandHandler.js`**

> **BUG #2 DIPERBAIKI:** Versi lama mengirim `command_type: 'LOGIN'` ke BiDi stream `AdminSession`. Proto `AdminCommand` tidak mengenal tipe ini. Admin sudah terotentikasi via `LoginOfficer` (unary RPC) sebelum session dibuka — tidak perlu mengirim login ulang ke stream.
>
> **BUG #3 DIPERBAIKI:** Field name `officer_id` → `id_pegawai` disesuaikan dengan yang diharapkan `LoginOfficer` RPC.
>
> **DESAIN #5 DIPERBAIKI:** `adminSession` bukan lagi singleton global. Setiap koneksi WebSocket admin punya session BiDi-nya sendiri menggunakan `Map<clientId, sessionObject>`.
>
> **DESAIN #9 DIPERBAIKI:** Admin session punya mekanisme reconnect otomatis jika stream terputus.
>
> **FITUR BARU #10:** Tambah handler untuk manajemen petugas (`REGISTER_OFFICER`, `UPDATE_OFFICER`, `DELETE_OFFICER`).
>
> **FITUR BARU #11:** Tambah handler `CHECK_SYSTEM_INITIALIZED`.

```javascript
'use strict';

const { broadcast, sendToClient, getClientState, setClientState } = require('./wsManager');

// PERBAIKAN #5: Satu session per koneksi, bukan singleton global
// Map<clientId, { session: grpc.ClientDuplexStream, active: boolean, clients: grpcStubs }>
const adminSessions = new Map();

// ── Admin Session Management ──────────────────────────────────────────────────

/**
 * Membuka BiDi AdminSession untuk satu koneksi admin.
 * Dipanggil setelah LoginOfficer berhasil.
 *
 * PERBAIKAN BUG #2:
 * TIDAK ada lagi command 'LOGIN' yang ditulis ke stream.
 * Autentikasi sudah selesai via unary LoginOfficer sebelum fungsi ini dipanggil.
 * Stream langsung siap menerima command: CALL_NEXT, ANNOUNCE, PAUSE, RESUME, GET_STATS.
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

    // PERBAIKAN DESAIN #9: Auto-reconnect admin session setelah 5 detik
    console.log(`[CommandHandler] Mencoba reconnect AdminSession ${clientId} dalam 5s...`);
    setTimeout(() => {
      // Hanya reconnect jika client masih terhubung
      if (ws.readyState === 1 /* OPEN */) {
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
 * Membersihkan session admin saat client disconnect.
 * Dipanggil dari wsManager ketika koneksi WS terputus.
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

/**
 * Router utama semua pesan dari browser via WebSocket.
 *
 * PERBAIKAN BUG #3:
 * Field name disesuaikan ke id_pegawai (bukan officer_id) agar cocok
 * dengan definisi LoginOfficer di admin.proto.
 */
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
          // Simpan citizen_id di state client untuk targeted delivery (Perbaikan #6)
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
      // FITUR BARU #11 — Cek apakah sistem sudah punya petugas terdaftar
      clients.admin.IsSystemInitialized({}, (err, res) => {
        sendToClient(ws, { type: 'SYSTEM_INIT_STATUS', error: err?.message, payload: res });
      });
      break;

    case 'ADMIN_LOGIN':
      // PERBAIKAN BUG #3: Gunakan id_pegawai (bukan officer_id)
      // payload harus berisi: { id_pegawai, pin }
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

    // FITUR BARU #10 — Manajemen Petugas via Web
    case 'REGISTER_OFFICER':
      // payload: { id_pegawai, nama, jabatan, role, pin }
      // Memerlukan re-autentikasi PIN requester di server (sudah diimplementasi server)
      clients.admin.RegisterOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'REGISTER_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'UPDATE_OFFICER':
      // payload: { requester_id, requester_pin, target_id, updates }
      clients.admin.UpdateOfficer(payload, (err, res) => {
        sendToClient(ws, { type: 'UPDATE_OFFICER_RESULT', error: err?.message, payload: res });
      });
      break;

    case 'DELETE_OFFICER':
      // payload: { requester_id, requester_pin, target_id }
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
    // Semua command ini diteruskan ke AdminSession milik koneksi ini

    case 'CALL_NEXT':
      sendAdminCommand(ws, {
        command_type: 'CALL_NEXT',
        service_id:   payload.service_id,
      });
      break;

    case 'ANNOUNCE':
      sendAdminCommand(ws, {
        command_type: 'ANNOUNCE',
        service_id:   payload.service_id,
        message:      payload.message,
      });
      break;

    case 'PAUSE_SERVICE':
      sendAdminCommand(ws, {
        command_type: 'PAUSE',
        service_id:   payload.service_id,
      });
      break;

    case 'RESUME_SERVICE':
      sendAdminCommand(ws, {
        command_type: 'RESUME',
        service_id:   payload.service_id,
      });
      break;

    case 'GET_STATS_STREAM':
      sendAdminCommand(ws, { command_type: 'GET_STATS' });
      break;

    default:
      console.warn('[CommandHandler] Command tidak dikenal:', cmd);
      sendToClient(ws, {
        type:    'ERROR',
        payload: { message: `Command tidak dikenal: ${cmd}` },
      });
  }
}

module.exports = { handleCommand, cleanupAdminSession };
```

---

### 4.6 Push Scheduler ⚠️ DIPERBAIKI

**File: `gateway/pushScheduler.js`**

> **BUG #4 DIPERBAIKI:** Versi lama mengakses `s.status` (string enum) dan `s.waiting_count` yang tidak ada di response `ListServices`. `ServiceStore` hanya menyimpan `is_open` (boolean). Sekarang konversi dilakukan secara eksplisit.
>
> **PERBAIKAN DESAIN #8:** Tambah fungsi `sendInitialSnapshot` yang dipanggil dari `wsManager` setiap kali ada client baru terhubung, sehingga data langsung tampil tanpa menunggu interval push berikutnya.
>
> **CATATAN FIELD ANNOUNCEMENT (#13):** Announcement dari server menggunakan struktur yang ada di `announcementStore.js`. Pastikan field `id`, `title`, `message`, `created_at`, dan `service_id` sesuai dengan implementasi `GetAnnouncements` di `serviceInfoService.js`. Jika field berbeda, sesuaikan mapping di bawah.

```javascript
'use strict';

const { broadcast } = require('./wsManager');

const intervals = [];

// ── Helper: Konversi is_open (boolean) → status string ───────────────────────

/**
 * PERBAIKAN BUG #4:
 * serviceStore menyimpan is_open (boolean), bukan status string.
 * ListServices mengembalikan { is_open: true/false }.
 * Konversi manual diperlukan untuk UI yang butuh string "OPEN"/"CLOSED"/"PAUSED".
 *
 * Logika:
 * - is_open = true  → "OPEN"
 * - is_open = false → cek juga quota_remaining, jika 0 mungkin "CLOSED"
 *   tapi secara default jika admin pause → is_open = false → "PAUSED"
 * Catatan: Tidak ada field "PAUSED" terpisah di serviceStore saat ini.
 * Jika server menambahkan field is_paused di masa depan, sesuaikan di sini.
 */
function deriveServiceStatus(svc) {
  if (svc.is_open) return 'OPEN';
  if (svc.quota_remaining === 0) return 'CLOSED';
  return 'PAUSED';
}

/**
 * Ambil snapshot layanan terkini dan format untuk dikirim ke browser.
 * Digunakan oleh push scheduler dan initial snapshot.
 */
function fetchServicesSnapshot(clients, callback) {
  clients.serviceInfo.ListServices({}, (err, response) => {
    if (err || !response) { callback(null); return; }

    const services = (response.services || []).map(s => ({
      service_id:      s.service_id,
      name:            s.name,
      short_code:      s.short_code,
      // PERBAIKAN BUG #4: Konversi is_open → status string
      status:          deriveServiceStatus(s),
      is_open:         s.is_open,
      quota_remaining: s.quota_remaining,
      daily_quota:     s.daily_quota,
      // waiting_count tidak tersedia dari ListServices
      // Ambil dari GetQueueStatus jika dibutuhkan (mahal — satu request per service)
      // Untuk saat ini, biarkan null dan update saat ada QUEUE_UPDATE event
      waiting_count:   null,
    }));

    callback(services);
  });
}

// ── Kirim Snapshot Awal ke Client Baru (Perbaikan Desain #8) ─────────────────

/**
 * Dipanggil dari wsManager segera setelah client baru terhubung.
 * Mengirim data awal sehingga UI tidak kosong 5-8 detik.
 */
function sendInitialSnapshot(clients, ws) {
  const { sendToClient } = require('./wsManager');

  // Kirim daftar layanan
  fetchServicesSnapshot(clients, (services) => {
    if (!services) return;
    sendToClient(ws, {
      type:    'SERVICES_STATUS_UPDATE',
      payload: { services, timestamp: new Date().toISOString() },
    });
  });

  // Kirim statistik sistem
  clients.admin.GetSystemStats({}, (err, stats) => {
    if (err || !stats) return;
    sendToClient(ws, {
      type:    'STATS_PUSH',
      payload: {
        total_bookings_today:   stats.total_bookings_today,
        total_served_today:     stats.total_served_today,
        total_cancelled_today:  stats.total_cancelled_today,
        active_subscribers:     stats.active_subscribers,
        per_service:            stats.per_service,
        timestamp:              new Date().toISOString(),
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
 * Cek dan push pengumuman baru.
 *
 * CATATAN FIELD #13:
 * Verifikasi field yang dikembalikan GetAnnouncements di serviceInfoService.js
 * dan announcementStore.js. Field yang diakses di bawah (id, title, message,
 * service_id, created_at) harus sesuai dengan yang disimpan di announcementStore.
 * Jika field berbeda (misal: announcement_id, atau tidak ada title), sesuaikan
 * mapping di bawah sebelum deploy.
 */
function startAnnouncementPusher(clients, intervalMs = 12000) {
  console.log(`[PushScheduler] Announcement pusher aktif (${intervalMs}ms)`);

  let lastSeenId = null;

  const handle = setInterval(() => {
    clients.serviceInfo.GetAnnouncements({}, (err, response) => {
      if (err || !response?.announcements?.length) return;

      const latest = response.announcements[0];

      // Pastikan field 'id' atau 'announcement_id' ada di announcementStore
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

### 4.7 WebSocket Server Manager ⚠️ DIPERBAIKI

**File: `gateway/wsManager.js`**

> **PERBAIKAN DESAIN #5 & #6:** Sekarang menyimpan `clientState` per koneksi (Map) yang menyimpan `citizenId` dan `role`. Ini memungkinkan `sendToClientByCitizenId` untuk targeted delivery event `YOUR_TURN`.
>
> **PERBAIKAN DESAIN #8:** Memanggil `sendInitialSnapshot` segera setelah koneksi baru terbentuk.
>
> **PERBAIKAN DESAIN #9 (cleanup):** Memanggil `cleanupAdminSession` saat koneksi terputus untuk membebaskan resource BiDi stream.

```javascript
'use strict';

const WebSocket = require('ws');
const { handleCommand, cleanupAdminSession } = require('./commandHandler');
const { sendInitialSnapshot } = require('./pushScheduler');

// Registry semua client yang aktif
const wsClients = new Set();

// Per-client state: Map<ws, { clientId, citizenId, officerId, role }>
const clientStates = new Map();

// Referensi ke gRPC stubs (di-set saat init)
let grpcClients = null;

function initWsServer(httpServer, gClients) {
  grpcClients = gClients;

  const wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    ws.clientId = clientId;

    wsClients.add(ws);

    // PERBAIKAN #5 & #6: Inisialisasi state per-client
    clientStates.set(ws, {
      clientId,
      citizenId: null,
      officerId: null,
      role:      null,
    });

    console.log(`[WsManager] Client baru: ${clientId} (total: ${wsClients.size})`);

    // Kirim pesan selamat datang
    sendToClient(ws, {
      type:    'CONNECTED',
      payload: {
        clientId,
        message:   'Terhubung ke SiAntre Gateway',
        timestamp: new Date().toISOString(),
      },
    });

    // PERBAIKAN DESAIN #8: Kirim snapshot awal agar UI tidak kosong
    // Delay kecil agar client selesai setup event listeners
    setTimeout(() => sendInitialSnapshot(grpcClients, ws), 300);

    // Handle pesan masuk
    ws.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        handleCommand(message, ws, grpcClients);
      } catch (err) {
        console.error(`[WsManager] Parse error dari ${clientId}:`, err.message);
        sendToClient(ws, {
          type:    'ERROR',
          payload: { message: 'Format pesan tidak valid. Harus berupa JSON.' },
        });
      }
    });

    // Handle disconnect
    ws.on('close', (code, reason) => {
      wsClients.delete(ws);
      const state = clientStates.get(ws);
      clientStates.delete(ws);

      // PERBAIKAN #9: Bersihkan admin session saat client disconnect
      if (state?.clientId) {
        cleanupAdminSession(state.clientId);
      }

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
 * FITUR BARU (Perbaikan #6): Kirim pesan hanya ke client dengan citizenId tertentu.
 * Digunakan untuk event personal seperti YOUR_TURN.
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

function getClientState(ws) {
  return clientStates.get(ws) || null;
}

function setClientState(ws, state) {
  clientStates.set(ws, state);
}

function getClientCount() {
  return wsClients.size;
}

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

Frontend adalah kumpulan file statis yang di-serve oleh gateway melalui Express. Semua menggunakan vanilla JavaScript dan WebSocket API bawaan browser tanpa framework tambahan.

### 5.1 Struktur HTML Utama

**File: `frontend/index.html`** (Halaman Warga — tidak berubah dari v1)

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Sistem Antrian Digital</title>
  <link rel="stylesheet" href="css/style.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
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

  <div id="notification-container" aria-live="polite"></div>

  <main class="app-layout">
    <aside class="sidebar">

      <section class="card" id="auth-panel">
        <h2 class="card-title">Masuk / Daftar</h2>
        <div class="tab-group">
          <button class="tab-btn active" data-tab="login">Masuk</button>
          <button class="tab-btn" data-tab="register">Daftar</button>
        </div>
        <div id="tab-login" class="tab-content active">
          <div class="form-group">
            <label for="login-nik">NIK (16 digit)</label>
            <input type="text" id="login-nik" maxlength="16" placeholder="Masukkan NIK Anda" />
          </div>
          <button class="btn btn-primary" id="btn-login">Masuk</button>
        </div>
        <div id="tab-register" class="tab-content">
          <div class="form-group">
            <label for="reg-nik">NIK (16 digit)</label>
            <input type="text" id="reg-nik" maxlength="16" />
          </div>
          <div class="form-group">
            <label for="reg-name">Nama Lengkap</label>
            <input type="text" id="reg-name" />
          </div>
          <div class="form-group">
            <label for="reg-phone">Nomor HP</label>
            <input type="tel" id="reg-phone" placeholder="08xxxxxxxxxx" />
          </div>
          <div class="form-group">
            <label for="reg-address">Alamat</label>
            <input type="text" id="reg-address" />
          </div>
          <button class="btn btn-primary" id="btn-register">Daftar Akun</button>
        </div>
      </section>

      <section class="card hidden" id="user-panel">
        <h2 class="card-title">Selamat Datang</h2>
        <div class="user-info">
          <p class="user-name" id="user-name-display">—</p>
          <p class="user-nik" id="user-nik-display">NIK: —</p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-logout">Keluar</button>
      </section>

      <section class="card hidden" id="booking-panel">
        <h2 class="card-title">Buat Booking</h2>
        <div class="form-group">
          <label for="select-service">Pilih Layanan</label>
          <select id="select-service"><option value="">-- Pilih layanan --</option></select>
        </div>
        <div class="form-group">
          <label for="select-slot">Pilih Slot Waktu</label>
          <select id="select-slot" disabled><option value="">-- Pilih layanan dahulu --</option></select>
        </div>
        <button class="btn btn-primary" id="btn-create-booking" disabled>Pesan Sekarang</button>
      </section>

      <section class="card hidden" id="my-booking-panel">
        <h2 class="card-title">Booking Saya</h2>
        <div id="my-booking-detail" class="booking-detail">
          <p class="text-muted">Belum ada booking aktif.</p>
        </div>
      </section>

    </aside>

    <div class="main-content">

      <!-- Komponen 1: Status Indikator (Event-Driven UI) -->
      <section class="card">
        <h2 class="card-title">
          Status Layanan <span class="live-badge">● LIVE</span>
        </h2>
        <div id="service-status-grid" class="service-grid">
          <p class="text-muted">Memuat data layanan...</p>
        </div>
      </section>

      <!-- Komponen 2: Grafik Antrian Live (Event-Driven UI) -->
      <section class="card">
        <h2 class="card-title">
          Posisi Antrian Real-Time <span class="live-badge">● LIVE</span>
        </h2>
        <div class="chart-wrapper">
          <canvas id="queue-chart"></canvas>
        </div>
        <div class="chart-legend" id="chart-stats">
          <div class="stat-item">
            <span class="stat-label">Total Dilayani</span>
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

      <!-- Komponen 3: Activity Log (Event-Driven UI) -->
      <section class="card">
        <h2 class="card-title">
          Log Aktivitas
          <button class="btn btn-sm btn-ghost" id="btn-clear-log">Bersihkan</button>
        </h2>
        <div id="activity-log" class="activity-log" role="log" aria-live="polite">
          <p class="log-empty">Menunggu event dari server...</p>
        </div>
      </section>

    </div>
  </main>

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

**File: `frontend/css/style.css`** (tidak berubah signifikan dari v1, tambahan class untuk officer management)

```css
/* ─── Reset & Base ───────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-base:          #f4f6f9;
  --bg-card:          #ffffff;
  --bg-sidebar:       #1e2740;
  --color-primary:    #2563eb;
  --color-primary-dk: #1d4ed8;
  --color-success:    #16a34a;
  --color-warning:    #d97706;
  --color-danger:     #dc2626;
  --color-muted:      #6b7280;
  --color-text:       #111827;
  --color-border:     #e5e7eb;
  --color-live:       #10b981;
  --radius-sm: 6px;  --radius-md: 10px;  --radius-lg: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

body { font-family: var(--font); background: var(--bg-base); color: var(--color-text); font-size: 14px; line-height: 1.6; min-height: 100vh; }

/* ─── Header ─────────────────────────────────────────────────────────────── */
.app-header { background: var(--bg-sidebar); color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: var(--shadow-md); }
.header-brand { display: flex; align-items: center; gap: 12px; }
.header-logo { font-size: 28px; }
.header-title { font-size: 20px; font-weight: 700; }
.header-subtitle { font-size: 12px; color: #94a3b8; }

/* ─── Layout ─────────────────────────────────────────────────────────────── */
.app-layout { display: grid; grid-template-columns: 300px 1fr; gap: 20px; padding: 20px; max-width: 1400px; margin: 0 auto; }
@media (max-width: 900px) { .app-layout { grid-template-columns: 1fr; } }
.sidebar { display: flex; flex-direction: column; gap: 16px; }
.main-content { display: flex; flex-direction: column; gap: 16px; }

/* ─── Card ───────────────────────────────────────────────────────────────── */
.card { background: var(--bg-card); border-radius: var(--radius-lg); padding: 18px 20px; box-shadow: var(--shadow-sm); border: 1px solid var(--color-border); }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }

/* ─── Badges ─────────────────────────────────────────────────────────────── */
.status-badge { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; transition: all 0.3s; }
.status-connected    { background: #dcfce7; color: #15803d; }
.status-disconnected { background: #fee2e2; color: #b91c1c; }
.status-connecting   { background: #fef9c3; color: #a16207; }
.live-badge { font-size: 11px; font-weight: 700; color: var(--color-live); animation: pulse-live 2s infinite; }
@keyframes pulse-live { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ─── Buttons ────────────────────────────────────────────────────────────── */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: var(--radius-sm); border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary  { background: var(--color-primary); color: #fff; width: 100%; }
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dk); }
.btn-outline  { background: transparent; border: 1.5px solid var(--color-primary); color: var(--color-primary); }
.btn-ghost    { background: transparent; color: var(--color-muted); padding: 4px 8px; font-weight: 400; }
.btn-ghost:hover { color: var(--color-text); background: var(--bg-base); }
.btn-sm       { padding: 5px 12px; font-size: 12px; }
.btn-danger   { background: var(--color-danger); color: #fff; }
.btn-success  { background: var(--color-success); color: #fff; }
.btn-warning  { background: var(--color-warning); color: #fff; }
.btn-full     { width: 100%; }

/* ─── Forms ──────────────────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-group input, .form-group select { padding: 9px 12px; border: 1.5px solid var(--color-border); border-radius: var(--radius-sm); font-size: 13px; transition: border-color 0.15s; background: #fff; width: 100%; }
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
.tab-group { display: flex; gap: 4px; margin-bottom: 16px; background: var(--bg-base); border-radius: var(--radius-sm); padding: 3px; }
.tab-btn { flex: 1; padding: 6px 8px; border: none; background: transparent; font-size: 12px; font-weight: 600; color: var(--color-muted); border-radius: 4px; cursor: pointer; transition: all 0.15s; }
.tab-btn.active { background: var(--bg-card); color: var(--color-text); box-shadow: var(--shadow-sm); }
.tab-content { display: none; }
.tab-content.active { display: block; }

/* ─── Service Cards (Komponen 1) ─────────────────────────────────────────── */
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.service-card { border: 1.5px solid var(--color-border); border-radius: var(--radius-md); padding: 12px; transition: all 0.3s ease; }
.svc-name  { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.svc-meta  { font-size: 12px; color: var(--color-muted); margin-bottom: 6px; }
.svc-status-label { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.svc-open   { border-color: #bbf7d0; background: #f0fdf4; }
.svc-open   .svc-status-label { background: #dcfce7; color: #15803d; }
.svc-paused { border-color: #fde68a; background: #fffbeb; }
.svc-paused .svc-status-label { background: #fef3c7; color: #92400e; }
.svc-closed { border-color: #fecaca; background: #fff5f5; }
.svc-closed .svc-status-label { background: #fee2e2; color: #991b1b; }

/* ─── Chart (Komponen 2) ─────────────────────────────────────────────────── */
.chart-wrapper { position: relative; height: 220px; margin-bottom: 14px; }
.chart-legend  { display: flex; gap: 16px; flex-wrap: wrap; }
.stat-item     { display: flex; flex-direction: column; gap: 2px; }
.stat-label    { font-size: 11px; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-value    { font-size: 22px; font-weight: 700; color: var(--color-text); }

/* ─── Activity Log (Komponen 3) ─────────────────────────────────────────── */
.activity-log { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.log-entry { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bg-base); animation: slide-in 0.2s ease; border-left: 3px solid transparent; }
@keyframes slide-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.log-entry.type-queue    { border-left-color: var(--color-primary); }
.log-entry.type-announce { border-left-color: var(--color-warning); }
.log-entry.type-admin    { border-left-color: var(--color-success); }
.log-entry.type-system   { border-left-color: var(--color-muted); }
.log-entry.type-error    { border-left-color: var(--color-danger); background: #fff5f5; }
.log-time  { font-size: 11px; color: var(--color-muted); white-space: nowrap; min-width: 55px; }
.log-text  { flex: 1; line-height: 1.4; }
.log-empty { color: var(--color-muted); font-style: italic; text-align: center; padding: 20px 0; }

/* ─── Notifications ──────────────────────────────────────────────────────── */
#notification-container { position: fixed; top: 72px; right: 20px; z-index: 999; display: flex; flex-direction: column; gap: 8px; max-width: 360px; }
.toast { padding: 12px 16px; border-radius: var(--radius-md); box-shadow: var(--shadow-md); font-size: 13px; animation: toast-in 0.3s ease; display: flex; align-items: flex-start; gap: 10px; border-left: 4px solid transparent; background: var(--bg-card); }
@keyframes toast-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
.toast.success { background: #f0fdf4; border-color: var(--color-success); }
.toast.warning { background: #fffbeb; border-color: var(--color-warning); }
.toast.error   { background: #fff5f5; border-color: var(--color-danger); }
.toast.info    { background: #eff6ff; border-color: var(--color-primary); }
.toast-icon    { font-size: 16px; }
.toast-body    { flex: 1; }
.toast-title   { font-weight: 600; margin-bottom: 2px; }
.toast-message { color: var(--color-muted); font-size: 12px; }

/* ─── Officer Table (Fitur Baru #10) ─────────────────────────────────────── */
.officer-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.officer-table th { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; border-bottom: 2px solid var(--color-border); }
.officer-table td { padding: 10px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
.officer-table tr:last-child td { border-bottom: none; }
.officer-table tr:hover td { background: var(--bg-base); }
.role-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.role-admin   { background: #ede9fe; color: #5b21b6; }
.role-petugas { background: #dbeafe; color: #1d4ed8; }

/* ─── System Init Banner (Fitur Baru #11) ───────────────────────────────── */
.init-banner { background: #fef9c3; border: 1.5px solid #fde68a; border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 16px; }
.init-banner h3 { font-size: 14px; font-weight: 700; color: #92400e; margin-bottom: 4px; }
.init-banner p  { font-size: 13px; color: #a16207; }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
.hidden     { display: none !important; }
.text-muted { color: var(--color-muted); font-size: 13px; }
.text-success { color: var(--color-success); }
.text-danger  { color: var(--color-danger); }
.user-info  { margin-bottom: 12px; }
.user-name  { font-weight: 700; font-size: 16px; }
.user-nik   { font-size: 12px; color: var(--color-muted); }
.booking-detail { background: var(--bg-base); border-radius: var(--radius-sm); padding: 12px; font-size: 13px; }
.booking-code { font-size: 18px; font-weight: 700; color: var(--color-primary); letter-spacing: 2px; }
.booking-row  { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--color-border); }
.booking-row:last-child { border-bottom: none; }
.admin-btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.admin-btn-group .btn { flex: 1; min-width: 120px; width: auto; }
```

---

### 5.3 WebSocket Client & State Management ⚠️ DIPERBAIKI

**File: `frontend/js/ws-client.js`**

> **PERBAIKAN:** Tambah handler untuk `SYSTEM_INIT_STATUS`, `YOUR_TURN` personal toast, `REGISTER_OFFICER_RESULT`, dan command baru.

```javascript
// ─── State Aplikasi Global ────────────────────────────────────────────────────
const AppState = {
  ws:                  null,
  isConnected:         false,
  currentUser:         null,   // { nik, name, citizen_id }
  currentAdmin:        null,   // { id_pegawai, nama, role }
  services:            [],
  myBooking:           null,
  queueData:           {},
  reconnectAttempts:   0,
  maxReconnectAttempts: 10,
};

// ─── Event Bus ────────────────────────────────────────────────────────────────
const EventBus = {
  listeners: {},
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  },
  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  },
};

// ─── Kirim Command ke Gateway ─────────────────────────────────────────────────
function sendCommand(cmd, payload = {}) {
  if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {
    console.warn('[WsClient] Belum terhubung:', cmd);
    showNotification('Koneksi Terputus', 'Mencoba menghubungkan kembali...', 'warning');
    return;
  }
  AppState.ws.send(JSON.stringify({ cmd, payload }));
}

// ─── Router Pesan dari Gateway ────────────────────────────────────────────────
function routeMessage(msg) {
  switch (msg.type) {

    case 'CONNECTED':
      console.log('[WsClient] Terhubung:', msg.payload.clientId);
      // Snapshot sudah dikirim oleh gateway, tidak perlu request manual
      EventBus.emit('wsConnected', msg.payload);
      break;

    case 'HEARTBEAT':
      break; // Tidak perlu tindakan

    // ── Streaming gRPC → WebSocket (Fitur Wajib 1) ───────────────────────────
    case 'QUEUE_UPDATE':
      EventBus.emit('queueUpdate', msg);
      EventBus.emit('activityLog', {
        type:      'queue',
        message:   formatQueueEvent(msg.payload),
        timestamp: msg.payload.timestamp,
      });
      // PERBAIKAN: YOUR_TURN sekarang dikirim hanya ke warga bersangkutan
      // Tidak perlu filter di sini, server sudah targeted
      if (msg.payload.event_type === 'YOUR_TURN') {
        showNotification('🎉 Giliran Anda!', 'Segera menuju loket untuk dilayani.', 'success');
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

    case 'SYSTEM_INIT_STATUS':
      // FITUR BARU #11
      EventBus.emit('systemInitStatus', msg);
      break;

    case 'ADMIN_EVENT':
      EventBus.emit('adminEvent', msg.payload);
      EventBus.emit('activityLog', {
        type:      'admin',
        message:   `Admin event: ${msg.payload.event_type}`,
        timestamp: msg.payload.timestamp,
      });
      break;

    case 'SYSTEM_STATS':        EventBus.emit('statsUpdate', msg.payload);      break;
    case 'CHECKIN_RESULT':      EventBus.emit('checkinResult', msg);            break;
    case 'WALK_IN_RESULT':      EventBus.emit('walkInResult', msg);             break;
    case 'RESET_QUOTA_RESULT':  EventBus.emit('resetQuotaResult', msg);        break;

    // FITUR BARU #10 — Manajemen Petugas
    case 'OFFICERS_LIST':
      EventBus.emit('officersList', msg);
      break;
    case 'REGISTER_OFFICER_RESULT':
      EventBus.emit('registerOfficerResult', msg);
      break;
    case 'UPDATE_OFFICER_RESULT':
      EventBus.emit('updateOfficerResult', msg);
      break;
    case 'DELETE_OFFICER_RESULT':
      EventBus.emit('deleteOfficerResult', msg);
      break;

    case 'ADMIN_SESSION_ERROR':
      showNotification('Session Error', msg.payload?.message || 'Sesi admin terputus.', 'error');
      EventBus.emit('adminSessionError', msg);
      break;

    case 'ERROR':
      console.error('[WsClient] Error:', msg.payload?.message);
      showNotification('Terjadi Kesalahan', msg.payload?.message || 'Error tidak diketahui', 'error');
      EventBus.emit('activityLog', {
        type:    'error',
        message: `Error: ${msg.payload?.message}`,
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
    QUEUE_MOVED:     `Antrian bergerak — dilayani: nomor ${payload.current_number} | menunggu: ${payload.waiting_count}`,
    YOUR_TURN:       `🎉 GILIRAN ANDA! Segera menuju loket.`,
    SERVICE_CLOSED:  `⚠️ Layanan ditutup sementara.`,
    SERVICE_RESUMED: `✅ Layanan dibuka kembali.`,
    ANNOUNCEMENT:    `📢 ${payload.message}`,
    QUOTA_OPENED:    `Slot baru tersedia — quota bertambah.`,
  };
  return labels[payload.event_type] || `Event: ${payload.event_type} — ${payload.message || ''}`;
}

// ─── Koneksi WebSocket ────────────────────────────────────────────────────────
function initWebSocket() {
  const wsUrl = `ws://${window.location.host}`;
  updateConnectionStatus('connecting');

  const ws = new WebSocket(wsUrl);
  AppState.ws = ws;

  ws.onopen = () => {
    AppState.isConnected         = true;
    AppState.reconnectAttempts   = 0;
    updateConnectionStatus('connected');
    EventBus.emit('wsConnected', {});
  };

  ws.onmessage = (event) => {
    try {
      routeMessage(JSON.parse(event.data));
    } catch (err) {
      console.error('[WsClient] Parse error:', err);
    }
  };

  ws.onclose = () => {
    AppState.isConnected = false;
    AppState.ws          = null;
    updateConnectionStatus('disconnected');
    EventBus.emit('wsDisconnected', {});
    scheduleReconnect();
  };

  ws.onerror = () => updateConnectionStatus('disconnected');
}

function scheduleReconnect() {
  if (AppState.reconnectAttempts >= AppState.maxReconnectAttempts) {
    showNotification('Koneksi Gagal', 'Tidak bisa terhubung ke server. Refresh halaman.', 'error');
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, AppState.reconnectAttempts), 30000);
  AppState.reconnectAttempts++;
  setTimeout(initWebSocket, delay);
}

function updateConnectionStatus(status) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;
  badge.textContent = { connected: '● Terhubung', disconnected: '● Terputus', connecting: '● Menghubungkan...' }[status];
  badge.className   = `status-badge status-${status}`;
}

document.addEventListener('DOMContentLoaded', initWebSocket);
```

---

### 5.4 Komponen: Grafik Antrian Live ⚠️ DIPERBAIKI

**File: `frontend/js/chart.js`**

> **PERBAIKAN BUG #4:** `updateChart` sekarang menggunakan `s.is_open` untuk warna bar, bukan `s.status` yang tidak tersedia. Field `waiting_count` diambil dari `per_service` milik stats (bukan ListServices).

```javascript
(function() {
  let chart = null;

  function initChart() {
    const canvas = document.getElementById('queue-chart');
    if (!canvas) return;

    chart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels:   [],
        datasets: [
          {
            label:           'Menunggu',
            data:            [],
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderColor:     'rgba(37, 99, 235, 1)',
            borderWidth: 1, borderRadius: 4,
          },
          {
            label:           'Sudah Dilayani',
            data:            [],
            backgroundColor: 'rgba(22, 163, 74, 0.7)',
            borderColor:     'rgba(22, 163, 74, 1)',
            borderWidth: 1, borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeInOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 }, boxWidth: 12 } },
          tooltip: { callbacks: {
            title: (i) => `Layanan: ${i[0].label}`,
            label: (i) => `${i.dataset.label}: ${i.raw} orang`,
          }},
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      },
    });
  }

  /**
   * PERBAIKAN #4:
   * services bisa datang dari dua sumber:
   * 1. SERVICES_STATUS_UPDATE → field: service_id, name, is_open, quota_remaining, waiting_count (null)
   * 2. STATS_PUSH.per_service → field: service_id, waiting_count, quota_remaining, is_open
   * Gunakan optional chaining agar tidak crash jika field tidak ada.
   */
  function updateChart(services) {
    if (!chart || !services || services.length === 0) return;

    chart.data.labels             = services.map(s => s.name || s.service_id);
    chart.data.datasets[0].data   = services.map(s => s.waiting_count ?? 0);
    chart.data.datasets[1].data   = services.map(s => s.quota_remaining ?? 0);
    chart.update('active');
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

**File: `frontend/js/activity-log.js`** (tidak berubah dari v1)

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
        if (logEl) logEl.innerHTML = '<p class="log-empty">Log dibersihkan.</p>';
      });

    EventBus.on('activityLog',    add);
    EventBus.on('wsConnected',    () => add({ type: 'system',  message: '✅ Terhubung ke SiAntre Gateway' }));
    EventBus.on('wsDisconnected', () => add({ type: 'error',   message: '❌ Koneksi ke gateway terputus' }));
  });
})();
```

---

### 5.6 Komponen: Status Indikator Layanan ⚠️ DIPERBAIKI

**File: `frontend/js/status-indicator.js`**

> **PERBAIKAN BUG #4:** Sekarang menggunakan field `status` yang sudah dikonversi oleh gateway (dari `is_open` boolean). Fallback ke `is_open` juga ditambahkan jika field `status` tidak ada.

```javascript
(function() {
  const statusLabels = { 'OPEN': 'Buka', 'PAUSED': 'Jeda', 'CLOSED': 'Tutup' };

  function getStatusClass(svc) {
    // PERBAIKAN #4: gateway sudah mengkonversi is_open → status string
    // tapi tetap sediakan fallback jika field status tidak ada
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    return st === 'OPEN' ? 'svc-open' : st === 'PAUSED' ? 'svc-paused' : 'svc-closed';
  }

  function getStatusLabel(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    return statusLabels[st] || st;
  }

  function esc(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  function renderServices(services) {
    const grid = document.getElementById('service-status-grid');
    if (!grid || !services) return;

    if (services.length === 0) {
      grid.innerHTML = '<p class="text-muted">Belum ada layanan. Admin belum menginisialisasi sistem.</p>';
      return;
    }

    grid.innerHTML = '';
    services.forEach(svc => {
      const card = document.createElement('div');
      card.className          = `service-card ${getStatusClass(svc)}`;
      card.dataset.serviceId  = svc.service_id;

      // waiting_count dari SERVICES_STATUS_UPDATE bisa null (tidak tersedia dari ListServices)
      // Tampilkan '—' jika null, akan diupdate saat ada QUEUE_UPDATE
      const waitingDisplay = svc.waiting_count !== null ? svc.waiting_count : '—';

      card.innerHTML = `
        <div class="svc-name">${esc(svc.name || svc.service_id)}</div>
        <div class="svc-meta">
          Menunggu: <strong id="waiting-${svc.service_id}">${waitingDisplay}</strong> &nbsp;|&nbsp;
          Sisa Quota: <strong>${svc.quota_remaining ?? '—'}</strong>
        </div>
        <span class="svc-status-label">${getStatusLabel(svc)}</span>
      `;
      grid.appendChild(card);
    });
  }

  function updateSingleService(serviceId, updates) {
    const card = document.querySelector(`.service-card[data-service-id="${serviceId}"]`);
    if (!card) return;

    if (updates.status !== undefined || updates.is_open !== undefined) {
      const newClass = getStatusClass(updates);
      card.className = `service-card ${newClass}`;
      const badge = card.querySelector('.svc-status-label');
      if (badge) badge.textContent = getStatusLabel(updates);
    }

    // Update waiting_count saat ada QUEUE_UPDATE (data ini tersedia dari stream)
    if (updates.waiting_count !== undefined && updates.waiting_count !== null) {
      const waitingEl = document.getElementById(`waiting-${serviceId}`);
      if (waitingEl) waitingEl.textContent = updates.waiting_count;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    EventBus.on('servicesLoaded', renderServices);
    EventBus.on('servicesUpdate', renderServices);

    // Update waiting_count individual dari QUEUE_UPDATE event (stream real-time)
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

**File: `frontend/js/notification.js`** (tidak berubah dari v1)

```javascript
function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}
```

---

### 5.8 Halaman Warga ⚠️ DIPERBAIKI

**File: `frontend/js/warga.js`**

> **PERBAIKAN:** Saat `LOGIN_CITIZEN` berhasil, simpan `citizen_id` ke `AppState`. Ini diperlukan agar gateway bisa memetakan koneksi WS ke warga (untuk targeted `YOUR_TURN`).

```javascript
(function() {
  // ── Tab Handling ────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // ── Register ────────────────────────────────────────────────────────────────
  document.getElementById('btn-register')?.addEventListener('click', () => {
    const nik     = document.getElementById('reg-nik')?.value.trim();
    const nama    = document.getElementById('reg-name')?.value.trim();
    const no_hp   = document.getElementById('reg-phone')?.value.trim();
    const alamat  = document.getElementById('reg-address')?.value.trim();

    if (!nik || nik.length !== 16 || !nama) {
      showNotification('Data Tidak Lengkap', 'Isi NIK (16 digit) dan Nama.', 'warning');
      return;
    }

    sendCommand('REGISTER_CITIZEN', { nik, nama, no_hp, alamat });
  });

  EventBus.on('registerResult', (msg) => {
    if (msg.error) {
      showNotification('Registrasi Gagal', msg.error, 'error');
    } else {
      showNotification('Registrasi Berhasil', 'Silakan masuk dengan NIK Anda.', 'success');
    }
  });

  // ── Login Warga ──────────────────────────────────────────────────────────────
  document.getElementById('btn-login')?.addEventListener('click', () => {
    const nik = document.getElementById('login-nik')?.value.trim();
    if (!nik || nik.length !== 16) {
      showNotification('NIK Tidak Valid', 'Masukkan NIK 16 digit.', 'warning');
      return;
    }
    sendCommand('LOGIN_CITIZEN', { nik });
  });

  EventBus.on('loginResult', (msg) => {
    if (msg.error) {
      showNotification('Login Gagal', msg.error, 'error');
      return;
    }

    const user = msg.payload;
    AppState.currentUser = user;

    document.getElementById('auth-panel')?.classList.add('hidden');
    document.getElementById('user-panel')?.classList.remove('hidden');
    document.getElementById('booking-panel')?.classList.remove('hidden');
    document.getElementById('my-booking-panel')?.classList.remove('hidden');
    document.getElementById('user-name-display').textContent = user.nama || '—';
    document.getElementById('user-nik-display').textContent  = `NIK: ${user.nik}`;

    showNotification('Selamat Datang', `Halo, ${user.nama}!`, 'success');

    // Muat layanan & booking
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
      selectSlot.disabled  = true;
      btnBooking.disabled  = true;
      return;
    }
    selectSlot.innerHTML = '<option value="">-- Pilih slot --</option>';
    msg.payload.slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value       = slot.slot_id;
      opt.textContent = `${slot.time} (sisa: ${slot.capacity - slot.booked_count})`;
      if (slot.status === 'FULL') opt.disabled = true;
      selectSlot.appendChild(opt);
    });
    selectSlot.disabled  = false;
    btnBooking.disabled  = false;
  });

  // ── Buat Booking ──────────────────────────────────────────────────────────────
  btnBooking?.addEventListener('click', () => {
    if (!AppState.currentUser) { showNotification('Belum Login', 'Silakan masuk terlebih dahulu.', 'warning'); return; }
    const serviceId = selectService?.value;
    const slotId    = selectSlot?.value;
    if (!serviceId || !slotId) { showNotification('Pilih Layanan & Slot', 'Lengkapi pilihan sebelum memesan.', 'warning'); return; }

    sendCommand('CREATE_BOOKING', {
      citizen_id: AppState.currentUser.citizen_id,
      nik:        AppState.currentUser.nik,
      service_id: serviceId,
      slot_id:    slotId,
    });
  });

  EventBus.on('bookingResult', (msg) => {
    if (msg.error) {
      showNotification('Booking Gagal', msg.error, 'error');
    } else {
      showNotification('Booking Berhasil!', `Kode: ${msg.payload.booking_code}`, 'success');
      AppState.myBooking = msg.payload;
      renderBookingDetail(msg.payload);
      if (AppState.currentUser) sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
    }
  });

  // ── Tampilkan Detail Booking ──────────────────────────────────────────────────
  function renderBookingDetail(booking) {
    const panel = document.getElementById('my-booking-detail');
    if (!panel || !booking) return;

    panel.innerHTML = `
      <div class="booking-code">${booking.booking_code || '—'}</div>
      <div class="booking-row"><span>Layanan</span><strong>${booking.service_name || '—'}</strong></div>
      <div class="booking-row"><span>Tanggal</span><strong>${booking.slot_date || '—'}</strong></div>
      <div class="booking-row"><span>Waktu</span><strong>${booking.slot_time || '—'}</strong></div>
      <div class="booking-row"><span>Status</span><strong class="${booking.status === 'CHECKED_IN' ? 'text-success' : ''}">${booking.status || '—'}</strong></div>
      ${booking.status === 'BOOKED' ? `
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button class="btn btn-outline btn-sm" id="btn-cancel-booking">Batalkan</button>
          <button class="btn btn-outline btn-sm" id="btn-reschedule">Jadwal Ulang</button>
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
      sendCommand('RESCHEDULE_BOOKING', {
        booking_code: booking.booking_code,
        citizen_id:   AppState.currentUser?.citizen_id,
        new_slot_id:  newSlot,
      });
    });
  }

  EventBus.on('myBookingLoaded', (msg) => {
    if (!msg.error && msg.payload?.booking) {
      AppState.myBooking = msg.payload.booking;
      renderBookingDetail(msg.payload.booking);
    }
  });

  EventBus.on('cancelResult', (msg) => {
    if (msg.error) {
      showNotification('Pembatalan Gagal', msg.error, 'error');
    } else {
      showNotification('Booking Dibatalkan', 'Booking berhasil dibatalkan.', 'info');
      document.getElementById('my-booking-detail').innerHTML = '<p class="text-muted">Belum ada booking aktif.</p>';
      AppState.myBooking = null;
    }
  });

  EventBus.on('rescheduleResult', (msg) => {
    if (msg.error) {
      showNotification('Reschedule Gagal', msg.error, 'error');
    } else {
      showNotification('Jadwal Diperbarui', 'Booking berhasil dijadwal ulang.', 'success');
      renderBookingDetail(msg.payload);
    }
  });

})();
```

---

### 5.9 Halaman Admin ⚠️ DIPERBAIKI MAYOR

**File: `frontend/admin.html`**

> **FITUR BARU #11:** Tambah banner `IsSystemInitialized` yang muncul jika sistem belum diinisialisasi.
>
> **FITUR BARU #10:** Tambah tab "Manajemen Petugas".

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Panel Admin</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header class="app-header">
    <div class="header-brand">
      <span class="header-logo">⚙️</span>
      <div>
        <h1 class="header-title">SiAntre — Panel Admin</h1>
        <p class="header-subtitle" id="admin-subtitle">Belum login</p>
      </div>
    </div>
    <div class="header-status">
      <span id="ws-status-badge" class="status-badge status-connecting">● Menghubungkan...</span>
    </div>
  </header>

  <div id="notification-container" aria-live="polite"></div>

  <main style="padding: 20px; max-width: 1200px; margin: 0 auto;">

    <!-- Banner Sistem Belum Diinisialisasi (Fitur Baru #11) -->
    <div id="init-banner" class="init-banner hidden">
      <h3>⚠️ Sistem Belum Diinisialisasi</h3>
      <p>Belum ada petugas yang terdaftar. Gunakan form di bawah untuk mendaftarkan Admin pertama. Setup awal tidak memerlukan autentikasi.</p>
    </div>

    <!-- Panel Login Admin -->
    <div class="card" id="admin-login-panel">
      <h2 class="card-title">Login Petugas</h2>
      <div style="max-width: 320px;">
        <div class="form-group">
          <label for="admin-id">ID Pegawai</label>
          <!-- PERBAIKAN BUG #3: field name id_pegawai (bukan officer_id) -->
          <input type="text" id="admin-id" placeholder="Contoh: P001" />
        </div>
        <div class="form-group">
          <label for="admin-pin">PIN</label>
          <input type="password" id="admin-pin" placeholder="Minimal 6 digit" />
        </div>
        <button class="btn btn-primary" id="btn-admin-login" style="width: auto; padding: 9px 24px;">Login</button>
      </div>
    </div>

    <!-- Panel Setup Awal (muncul jika sistem belum init) -->
    <div class="card hidden" id="admin-setup-panel">
      <h2 class="card-title">Setup Admin Pertama</h2>
      <div style="max-width: 360px;">
        <div class="form-group">
          <label for="setup-id">ID Pegawai</label>
          <input type="text" id="setup-id" placeholder="Contoh: P001" />
        </div>
        <div class="form-group">
          <label for="setup-nama">Nama Lengkap</label>
          <input type="text" id="setup-nama" />
        </div>
        <div class="form-group">
          <label for="setup-pin">PIN (min 6 digit)</label>
          <input type="password" id="setup-pin" />
        </div>
        <button class="btn btn-primary" id="btn-setup-admin" style="width: auto; padding: 9px 24px;">Daftarkan Admin Pertama</button>
      </div>
    </div>

    <!-- Dashboard Admin (muncul setelah login) -->
    <div id="admin-dashboard" class="hidden">

      <!-- Tab Navigasi -->
      <div class="tab-group" style="margin-bottom: 20px; max-width: 600px;">
        <button class="tab-btn active" data-tab="antrian">Kelola Antrian</button>
        <button class="tab-btn" data-tab="operasional">Operasional</button>
        <button class="tab-btn" data-tab="petugas">Manajemen Petugas</button>
        <button class="tab-btn" data-tab="log">Log Aktivitas</button>
      </div>

      <!-- Tab 1: Kelola Antrian -->
      <div id="tab-antrian" class="tab-content active">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">

          <!-- Statistik Live -->
          <div class="card">
            <h3 class="card-title">Statistik Hari Ini <span class="live-badge">● LIVE</span></h3>
            <div class="chart-legend">
              <div class="stat-item"><span class="stat-label">Total Booking</span><span class="stat-value" id="adm-stat-bookings">—</span></div>
              <div class="stat-item"><span class="stat-label">Dilayani</span><span class="stat-value" id="adm-stat-served">—</span></div>
              <div class="stat-item"><span class="stat-label">Dibatalkan</span><span class="stat-value" id="adm-stat-cancelled">—</span></div>
              <div class="stat-item"><span class="stat-label">Subscriber</span><span class="stat-value" id="adm-stat-subs">—</span></div>
            </div>
          </div>

          <!-- Panggil Antrian -->
          <div class="card">
            <h3 class="card-title">Panggil Antrian</h3>
            <div class="form-group">
              <label>Pilih Layanan</label>
              <select id="adm-select-service-call"><option value="">-- Pilih layanan --</option></select>
            </div>
            <div class="admin-btn-group">
              <button class="btn btn-primary" id="btn-call-next">▶ Panggil Berikutnya</button>
              <button class="btn btn-warning" id="btn-pause-service">⏸ Jeda</button>
              <button class="btn btn-success" id="btn-resume-service">▶ Buka</button>
            </div>
          </div>

          <!-- Check-In -->
          <div class="card">
            <h3 class="card-title">Check-In Warga</h3>
            <div class="form-group">
              <label>Kode Booking</label>
              <input type="text" id="adm-booking-code" placeholder="Masukkan kode booking" style="text-transform: uppercase;" />
            </div>
            <div class="form-group">
              <label>Layanan</label>
              <select id="adm-select-service-checkin"><option value="">-- Pilih layanan --</option></select>
            </div>
            <button class="btn btn-primary" id="btn-checkin">✓ Check-In</button>
          </div>

        </div>
      </div>

      <!-- Tab 2: Operasional -->
      <div id="tab-operasional" class="tab-content">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">

          <!-- Pengumuman -->
          <div class="card">
            <h3 class="card-title">Kirim Pengumuman</h3>
            <div class="form-group">
              <label>Layanan (kosong = semua)</label>
              <select id="adm-announce-service"><option value="">-- Semua Layanan --</option></select>
            </div>
            <div class="form-group">
              <label>Isi Pengumuman</label>
              <input type="text" id="adm-announce-msg" placeholder="Pesan pengumuman..." />
            </div>
            <button class="btn btn-primary" id="btn-announce">📢 Kirim Pengumuman</button>
          </div>

          <!-- Walk-In -->
          <div class="card">
            <h3 class="card-title">Walk-In (Daftar Langsung)</h3>
            <div class="form-group">
              <label>NIK Warga</label>
              <input type="text" id="adm-walkin-nik" maxlength="16" placeholder="16 digit NIK" />
            </div>
            <div class="form-group">
              <label>Layanan</label>
              <select id="adm-walkin-service"><option value="">-- Pilih layanan --</option></select>
            </div>
            <button class="btn btn-primary" id="btn-walkin">➕ Daftarkan Walk-In</button>
          </div>

          <!-- Reset Quota -->
          <div class="card">
            <h3 class="card-title">Reset Quota Harian</h3>
            <div class="form-group">
              <label>Layanan (kosong = semua)</label>
              <select id="adm-reset-service">
                <option value="">-- Semua Layanan --</option>
              </select>
            </div>
            <button class="btn btn-danger" id="btn-reset-quota">🔄 Reset Quota</button>
            <p class="text-muted" style="margin-top: 8px; font-size: 12px;">⚠️ Aksi ini akan mereset antrian dan quota. Tidak bisa dibatalkan.</p>
          </div>

        </div>
      </div>

      <!-- Tab 3: Manajemen Petugas (Fitur Baru #10) -->
      <div id="tab-petugas" class="tab-content">
        <div style="display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start;">

          <!-- Daftar Petugas -->
          <div class="card">
            <h3 class="card-title">
              Daftar Petugas
              <button class="btn btn-sm btn-ghost" id="btn-refresh-officers">↻ Refresh</button>
            </h3>
            <div id="officers-table-wrapper">
              <table class="officer-table">
                <thead>
                  <tr>
                    <th>ID Pegawai</th>
                    <th>Nama</th>
                    <th>Jabatan</th>
                    <th>Role</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody id="officers-table-body">
                  <tr><td colspan="5" class="text-muted" style="text-align:center; padding: 20px;">Memuat data...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Form Tambah Petugas -->
          <div class="card">
            <h3 class="card-title">Tambah Petugas Baru</h3>
            <p class="text-muted" style="margin-bottom: 12px; font-size: 12px;">
              Memerlukan konfirmasi PIN Anda (requester) untuk operasi sensitif.
            </p>
            <div class="form-group">
              <label>PIN Anda (konfirmasi)</label>
              <input type="password" id="officer-req-pin" placeholder="PIN admin yang sedang login" />
            </div>
            <div class="form-group">
              <label>ID Pegawai Baru</label>
              <input type="text" id="new-officer-id" placeholder="Contoh: P002" />
            </div>
            <div class="form-group">
              <label>Nama Lengkap</label>
              <input type="text" id="new-officer-nama" />
            </div>
            <div class="form-group">
              <label>Jabatan</label>
              <input type="text" id="new-officer-jabatan" placeholder="Contoh: Petugas Loket" />
            </div>
            <div class="form-group">
              <label>Role</label>
              <select id="new-officer-role">
                <option value="PETUGAS">PETUGAS</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div class="form-group">
              <label>PIN Baru (min 6 digit)</label>
              <input type="password" id="new-officer-pin" />
            </div>
            <button class="btn btn-primary" id="btn-add-officer">➕ Tambah Petugas</button>
          </div>
        </div>
      </div>

      <!-- Tab 4: Log Aktivitas -->
      <div id="tab-log" class="tab-content">
        <div class="card">
          <h2 class="card-title">
            Log Aktivitas Admin <span class="live-badge">● LIVE</span>
            <button class="btn btn-sm btn-ghost" id="btn-clear-log">Bersihkan</button>
          </h2>
          <div id="activity-log" class="activity-log" role="log" aria-live="polite">
            <p class="log-empty">Menunggu event dari server...</p>
          </div>
        </div>
      </div>

    </div>
  </main>

  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/admin.js"></script>
</body>
</html>
```

**File: `frontend/js/admin.js`**

```javascript
(function() {

  // ── Tab Handling ─────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // ── Cek Status Inisialisasi Sistem (Fitur Baru #11) ──────────────────────────
  EventBus.on('wsConnected', () => {
    sendCommand('CHECK_SYSTEM_INITIALIZED');
  });

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
      showNotification('Data Tidak Lengkap', 'Isi semua field. PIN minimal 6 digit.', 'warning');
      return;
    }

    sendCommand('REGISTER_OFFICER', {
      id_pegawai, nama, jabatan: 'Administrator', role: 'ADMIN', pin
    });
  });

  EventBus.on('registerOfficerResult', (msg) => {
    if (msg.error) {
      showNotification('Gagal', msg.error, 'error');
    } else {
      showNotification('Berhasil', msg.payload?.message || 'Petugas berhasil didaftarkan.', 'success');
      document.getElementById('init-banner')?.classList.add('hidden');
      document.getElementById('admin-setup-panel')?.classList.add('hidden');
      // Refresh daftar petugas jika sudah login
      if (AppState.currentAdmin) sendCommand('LIST_OFFICERS');
    }
  });

  // ── Login Admin ───────────────────────────────────────────────────────────────
  document.getElementById('btn-admin-login')?.addEventListener('click', () => {
    // PERBAIKAN BUG #3: kirim id_pegawai (bukan officer_id)
    const id_pegawai = document.getElementById('admin-id')?.value.trim().toUpperCase();
    const pin        = document.getElementById('admin-pin')?.value.trim();

    if (!id_pegawai || !pin) {
      showNotification('Data Kosong', 'Isi ID Pegawai dan PIN.', 'warning');
      return;
    }

    sendCommand('ADMIN_LOGIN', { id_pegawai, pin });
  });

  EventBus.on('adminLoginResult', (msg) => {
    if (msg.error) {
      showNotification('Login Gagal', msg.error, 'error');
      return;
    }

    const admin = msg.payload;
    AppState.currentAdmin = admin;
    // Update UI: tampilkan dashboard, sembunyikan login panel
    document.getElementById('admin-login-panel')?.classList.add('hidden');
    document.getElementById('admin-dashboard')?.classList.remove('hidden');
    document.getElementById('admin-subtitle').textContent =
      `${admin.nama} — ${admin.jabatan} (${admin.role})`;

    showNotification('Login Berhasil', `Selamat datang, ${admin.nama}!`, 'success');

    // Muat daftar layanan untuk semua dropdown
    sendCommand('LIST_SERVICES');
    sendCommand('LIST_OFFICERS');
  });

  // ── Populate Dropdown Layanan (dipakai semua tab) ─────────────────────────────
  function populateServiceDropdowns(services) {
    const dropdowns = [
      'adm-select-service-call',
      'adm-select-service-checkin',
      'adm-announce-service',
      'adm-walkin-service',
      'adm-reset-service',
    ];
    dropdowns.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // Simpan option pertama (placeholder atau "Semua Layanan")
      const firstOpt = el.options[0];
      el.innerHTML = '';
      el.appendChild(firstOpt);
      services.forEach(svc => {
        const opt = document.createElement('option');
        opt.value       = svc.service_id;
        opt.textContent = `${svc.short_code || svc.service_id} — ${svc.name}`;
        el.appendChild(opt);
      });
    });
  }

  EventBus.on('servicesLoaded', populateServiceDropdowns);
  // Push scheduler juga mengirim update layanan — pakai juga untuk refresh dropdown
  EventBus.on('servicesUpdate', populateServiceDropdowns);

  // ── Update Statistik Live ─────────────────────────────────────────────────────
  EventBus.on('statsUpdate', (stats) => {
    const set = (id, val) => {
      const el = document.getElementById(id); if (el) el.textContent = val ?? '—';
    };
    set('adm-stat-bookings',  stats.total_bookings_today);
    set('adm-stat-served',    stats.total_served_today);
    set('adm-stat-cancelled', stats.total_cancelled_today);
    set('adm-stat-subs',      stats.active_subscribers);
  });

  // ── Panggil Antrian Berikutnya (BiDi Command) ─────────────────────────────────
  document.getElementById('btn-call-next')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', 'Pilih layanan terlebih dahulu.', 'warning'); return; }
    sendCommand('CALL_NEXT', { service_id: serviceId });
  });

  // ── Jeda & Buka Layanan (BiDi Command) ───────────────────────────────────────
  document.getElementById('btn-pause-service')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', 'Pilih layanan terlebih dahulu.', 'warning'); return; }
    sendCommand('PAUSE_SERVICE', { service_id: serviceId });
  });

  document.getElementById('btn-resume-service')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-select-service-call')?.value;
    if (!serviceId) { showNotification('Pilih Layanan', 'Pilih layanan terlebih dahulu.', 'warning'); return; }
    sendCommand('RESUME_SERVICE', { service_id: serviceId });
  });

  // ── Kirim Pengumuman (BiDi Command) ──────────────────────────────────────────
  document.getElementById('btn-announce')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-announce-service')?.value;
    const message   = document.getElementById('adm-announce-msg')?.value.trim();
    if (!message) { showNotification('Pesan Kosong', 'Isi teks pengumuman.', 'warning'); return; }
    sendCommand('ANNOUNCE', {
      service_id: serviceId || null,
      message,
    });
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
    if (msg.error) {
      showNotification('Check-In Gagal', msg.error, 'error');
    } else {
      showNotification('Check-In Berhasil', `Warga berhasil check-in.`, 'success');
      document.getElementById('adm-booking-code').value = '';
    }
  });

  // ── Walk-In ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-walkin')?.addEventListener('click', () => {
    const nik       = document.getElementById('adm-walkin-nik')?.value.trim();
    const serviceId = document.getElementById('adm-walkin-service')?.value;
    if (!nik || nik.length !== 16) { showNotification('NIK Tidak Valid', 'Masukkan NIK 16 digit.', 'warning'); return; }
    if (!serviceId) { showNotification('Pilih Layanan', 'Pilih layanan untuk walk-in.', 'warning'); return; }
    sendCommand('WALK_IN_CITIZEN', { nik, service_id: serviceId });
  });

  EventBus.on('walkInResult', (msg) => {
    if (msg.error) {
      showNotification('Walk-In Gagal', msg.error, 'error');
    } else {
      showNotification('Walk-In Berhasil', `Nomor antrian: ${msg.payload?.queue_number || '—'}`, 'success');
      document.getElementById('adm-walkin-nik').value = '';
    }
  });

  // ── Reset Quota Harian ────────────────────────────────────────────────────────
  document.getElementById('btn-reset-quota')?.addEventListener('click', () => {
    const serviceId = document.getElementById('adm-reset-service')?.value;
    const target    = serviceId ? `layanan ${serviceId}` : 'SEMUA layanan';
    if (!confirm(`Yakin reset quota harian untuk ${target}? Tindakan ini tidak bisa dibatalkan.`)) return;
    sendCommand('RESET_DAILY_QUOTA', { service_id: serviceId || null });
  });

  EventBus.on('resetQuotaResult', (msg) => {
    if (msg.error) {
      showNotification('Reset Gagal', msg.error, 'error');
    } else {
      showNotification('Reset Berhasil', 'Quota harian berhasil direset.', 'success');
    }
  });

  // ── Admin Event dari BiDi Stream ──────────────────────────────────────────────
  EventBus.on('adminEvent', (event) => {
    const labels = {
      CALLED:   `📣 Memanggil nomor ${event.data?.called_number || '—'} (${event.data?.service_id})`,
      PAUSED:   `⏸ Layanan ${event.data?.service_id} dijeda`,
      RESUMED:  `▶ Layanan ${event.data?.service_id} dibuka kembali`,
      ANNOUNCED:`📢 Pengumuman terkirim: ${event.data?.message || ''}`,
      STATS:    `📊 Statistik diperbarui`,
    };
    const text = labels[event.event_type] || `Event: ${event.event_type}`;
    EventBus.emit('activityLog', { type: 'admin', message: text, timestamp: event.timestamp });
    showNotification('Admin Event', text, 'info');
  });

  // ── Manajemen Petugas (Fitur Baru #10) ───────────────────────────────────────

  // Render tabel daftar petugas
  EventBus.on('officersList', (msg) => {
    const tbody = document.getElementById('officers-table-body');
    if (!tbody) return;

    if (msg.error || !msg.payload?.officers?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center; padding:20px;">
        ${msg.error || 'Belum ada petugas terdaftar.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = msg.payload.officers.map(o => `
      <tr>
        <td>${o.id_pegawai || '—'}</td>
        <td>${o.nama || '—'}</td>
        <td>${o.jabatan || '—'}</td>
        <td><span class="badge badge-${o.role === 'ADMIN' ? 'primary' : 'secondary'}">${o.role || '—'}</span></td>
        <td>
          <button class="btn btn-sm btn-ghost btn-delete-officer" data-id="${o.id_pegawai}"
            title="Hapus petugas ini">🗑</button>
        </td>
      </tr>
    `).join('');

    // Pasang event listener hapus per baris
    tbody.querySelectorAll('.btn-delete-officer').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId  = btn.dataset.id;
        const reqPin    = document.getElementById('officer-req-pin')?.value.trim();
        if (!reqPin) {
          showNotification('PIN Diperlukan', 'Masukkan PIN Anda di form "Tambah Petugas Baru" untuk konfirmasi.', 'warning');
          return;
        }
        if (!confirm(`Hapus petugas ${targetId}? Tindakan ini permanen.`)) return;
        sendCommand('DELETE_OFFICER', {
          requester_id:  AppState.currentAdmin?.id_pegawai,
          requester_pin: reqPin,
          target_id:     targetId,
        });
      });
    });
  });

  // Refresh daftar petugas
  document.getElementById('btn-refresh-officers')?.addEventListener('click', () => {
    sendCommand('LIST_OFFICERS');
  });

  // Tambah petugas baru
  document.getElementById('btn-add-officer')?.addEventListener('click', () => {
    const reqPin    = document.getElementById('officer-req-pin')?.value.trim();
    const id_pegawai= document.getElementById('new-officer-id')?.value.trim().toUpperCase();
    const nama      = document.getElementById('new-officer-nama')?.value.trim();
    const jabatan   = document.getElementById('new-officer-jabatan')?.value.trim();
    const role      = document.getElementById('new-officer-role')?.value;
    const pin       = document.getElementById('new-officer-pin')?.value.trim();

    if (!reqPin || !id_pegawai || !nama || !pin || pin.length < 6) {
      showNotification('Data Tidak Lengkap', 'Isi semua field. PIN petugas baru minimal 6 digit.', 'warning');
      return;
    }

    sendCommand('REGISTER_OFFICER', {
      requester_id:  AppState.currentAdmin?.id_pegawai,
      requester_pin: reqPin,
      id_pegawai, nama, jabatan: jabatan || 'Petugas', role, pin,
    });
  });

  // Response tambah petugas (setelah sudah login — berbeda dari setup awal)
  EventBus.on('registerOfficerResult', (msg) => {
    if (msg.error) {
      showNotification('Gagal Tambah Petugas', msg.error, 'error');
    } else {
      showNotification('Petugas Ditambahkan', msg.payload?.message || 'Petugas berhasil didaftarkan.', 'success');
      // Bersihkan form
      ['new-officer-id','new-officer-nama','new-officer-jabatan','new-officer-pin'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      // Refresh tabel
      sendCommand('LIST_OFFICERS');
    }
  });

  // Response hapus petugas
  EventBus.on('deleteOfficerResult', (msg) => {
    if (msg.error) {
      showNotification('Gagal Hapus Petugas', msg.error, 'error');
    } else {
      showNotification('Petugas Dihapus', 'Data petugas berhasil dihapus.', 'success');
      sendCommand('LIST_OFFICERS');
    }
  });

  // Response update petugas
  EventBus.on('updateOfficerResult', (msg) => {
    if (msg.error) {
      showNotification('Gagal Update Petugas', msg.error, 'error');
    } else {
      showNotification('Petugas Diperbarui', 'Data petugas berhasil diperbarui.', 'success');
      sendCommand('LIST_OFFICERS');
    }
  });

  // ── Admin Session Error ───────────────────────────────────────────────────────
  EventBus.on('adminSessionError', () => {
    // Session BiDi terputus — gateway akan auto-reconnect jika WS masih open
    showNotification(
      'Session Terputus',
      'Session admin terputus. Mencoba reconnect otomatis dalam 5 detik...',
      'warning'
    );
  });

})();
```

---

## 6. Protokol Pesan WebSocket (Diperbarui)

Semua pesan antara browser dan gateway menggunakan format JSON. Berikut daftar lengkap tipe pesan yang diperbarui dari v1, mencakup fitur baru #10–#11 dan perbaikan field name.

### Dari Browser ke Gateway (Commands)

> Format: `{ cmd: "NAMA_COMMAND", payload: { ... } }`

| `cmd` | `payload` wajib | Keterangan |
|-------|-----------------|------------|
| `REGISTER_CITIZEN` | `{ nik, nama, no_hp, alamat }` | Daftar akun warga baru |
| `LOGIN_CITIZEN` | `{ nik }` | Login warga — menyimpan `citizenId` ke client state |
| `LIST_SERVICES` | `{}` | Ambil semua layanan |
| `GET_SERVICE_DETAIL` | `{ service_id }` | Detail satu layanan |
| `GET_AVAILABLE_SLOTS` | `{ service_id, date }` | Slot tersedia pada tanggal tertentu |
| `GET_ANNOUNCEMENTS` | `{}` | Semua pengumuman aktif |
| `CREATE_BOOKING` | `{ citizen_id, nik, service_id, slot_id }` | Buat booking |
| `CANCEL_BOOKING` | `{ booking_code, citizen_id }` | Batalkan booking |
| `GET_MY_BOOKING` | `{ nik, citizen_id }` | Booking milik warga yang sedang login |
| `RESCHEDULE_BOOKING` | `{ booking_code, citizen_id, new_slot_id }` | Jadwal ulang booking |
| `GET_QUEUE_STATUS` | `{ service_id }` | Status antrian satu layanan |
| `CHECK_SYSTEM_INITIALIZED` | `{}` | **BARU #11** — Cek apakah sudah ada petugas terdaftar |
| `ADMIN_LOGIN` | `{ id_pegawai, pin }` | **⚠️ FIX #3** — `id_pegawai` bukan `officer_id` |
| `GET_SYSTEM_STATS` | `{}` | Statistik sistem via unary RPC |
| `CALL_NEXT` | `{ service_id }` | **BiDi** — Panggil nomor antrian berikutnya |
| `ANNOUNCE` | `{ service_id, message }` | **BiDi** — Kirim pengumuman via admin session |
| `PAUSE_SERVICE` | `{ service_id }` | **BiDi** — Jeda layanan |
| `RESUME_SERVICE` | `{ service_id }` | **BiDi** — Buka kembali layanan |
| `GET_STATS_STREAM` | `{}` | **BiDi** — Minta statistik via admin session |
| `CHECKIN_CITIZEN` | `{ booking_code, service_id }` | Check-in warga di loket |
| `WALK_IN_CITIZEN` | `{ nik, service_id }` | Daftarkan warga walk-in |
| `RESET_DAILY_QUOTA` | `{ service_id }` | Reset quota (null = semua layanan) |
| `REGISTER_OFFICER` | `{ id_pegawai, nama, jabatan, role, pin, requester_id?, requester_pin? }` | **BARU #10** — Daftar petugas baru |
| `UPDATE_OFFICER` | `{ requester_id, requester_pin, target_id, updates }` | **BARU #10** — Update data petugas |
| `DELETE_OFFICER` | `{ requester_id, requester_pin, target_id }` | **BARU #10** — Hapus petugas |
| `LIST_OFFICERS` | `{}` | **BARU #10** — Daftar semua petugas |

> **Catatan:** Command yang ditandai **BiDi** diteruskan ke `AdminSession` duplex stream milik koneksi tersebut, bukan sebagai unary RPC. Hanya bisa dipakai setelah `ADMIN_LOGIN` berhasil.

---

### Dari Gateway ke Browser (Events)

> Format: `{ type: "NAMA_EVENT", payload: { ... }, error?: "pesan error" }`

#### Push dari Gateway (Server-Initiated — tanpa request dari browser)

| `type` | Interval | Keterangan |
|--------|----------|------------|
| `CONNECTED` | Saat connect | Konfirmasi koneksi, berisi `clientId` |
| `HEARTBEAT` | 30 detik | Keep-alive, tidak perlu tindakan |
| `STATS_PUSH` | 5 detik | Statistik sistem lengkap + `per_service` |
| `SERVICES_STATUS_UPDATE` | 8 detik | Status semua layanan (dengan field `status` string hasil konversi `is_open`) |
| `NEW_ANNOUNCEMENT` | 12 detik | Pengumuman baru jika `id` berbeda dari sebelumnya |
| `INITIAL_SNAPSHOT` | Saat connect (+300ms) | Snapshot layanan + stats awal **[BARU #8]** |

#### Event dari gRPC Stream (Real-Time)

| `type` | Sumber gRPC | Keterangan |
|--------|-------------|------------|
| `QUEUE_UPDATE` | `QueueService.WatchQueue` | Update antrian; sub-type di `payload.event_type`: `QUEUE_MOVED`, `YOUR_TURN`\*, `SERVICE_CLOSED`, `SERVICE_RESUMED`, `ANNOUNCEMENT`, `QUOTA_OPENED` |
| `ADMIN_EVENT` | `AdminService.AdminSession` | Respons dari perintah admin BiDi |
| `ADMIN_SESSION_ERROR` | Gateway | Session admin BiDi terputus |

> **\*** Event `YOUR_TURN` dikirim hanya ke WebSocket client dengan `citizenId` yang cocok — bukan broadcast ke semua. **[PERBAIKAN #6]**

#### Respons dari Unary Command (Request-Response)

| `type` | Dipicu oleh | Payload |
|--------|-------------|---------|
| `REGISTER_RESULT` | `REGISTER_CITIZEN` | Data warga atau error |
| `LOGIN_RESULT` | `LOGIN_CITIZEN` | Data warga atau error |
| `SERVICES_LIST` | `LIST_SERVICES` | `{ services: [...] }` |
| `SERVICE_DETAIL` | `GET_SERVICE_DETAIL` | Detail layanan |
| `SLOTS_LIST` | `GET_AVAILABLE_SLOTS` | `{ slots: [...] }` |
| `ANNOUNCEMENTS` | `GET_ANNOUNCEMENTS` | `{ announcements: [...] }` |
| `BOOKING_RESULT` | `CREATE_BOOKING` | Booking baru atau error |
| `MY_BOOKING` | `GET_MY_BOOKING` | `{ booking: {...} }` atau error |
| `CANCEL_RESULT` | `CANCEL_BOOKING` | Konfirmasi atau error |
| `RESCHEDULE_RESULT` | `RESCHEDULE_BOOKING` | Booking baru atau error |
| `QUEUE_STATUS` | `GET_QUEUE_STATUS` | Status antrian |
| `SYSTEM_INIT_STATUS` | `CHECK_SYSTEM_INITIALIZED` | `{ initialized: bool }` **[BARU #11]** |
| `ADMIN_LOGIN_RESULT` | `ADMIN_LOGIN` | Data petugas atau error |
| `SYSTEM_STATS` | `GET_SYSTEM_STATS` | Statistik sistem |
| `CHECKIN_RESULT` | `CHECKIN_CITIZEN` | Konfirmasi atau error |
| `WALK_IN_RESULT` | `WALK_IN_CITIZEN` | Nomor antrian atau error |
| `RESET_QUOTA_RESULT` | `RESET_DAILY_QUOTA` | Konfirmasi atau error |
| `OFFICERS_LIST` | `LIST_OFFICERS` | `{ officers: [...] }` **[BARU #10]** |
| `REGISTER_OFFICER_RESULT` | `REGISTER_OFFICER` | Konfirmasi atau error **[BARU #10]** |
| `UPDATE_OFFICER_RESULT` | `UPDATE_OFFICER` | Konfirmasi atau error **[BARU #10]** |
| `DELETE_OFFICER_RESULT` | `DELETE_OFFICER` | Konfirmasi atau error **[BARU #10]** |
| `ERROR` | Gateway | Pesan error umum (command tidak dikenal, parse error, dll.) |

---

## 7. Mapping Fitur Tugas ke Implementasi

### Fitur Wajib 1 — Streaming gRPC ke WebSocket

**Implementasi:** `gateway/streamBridge.js` → fungsi `subscribeToQueue()`

Saat gateway start, `startStreamBridge()` memanggil `clients.serviceInfo.ListServices()` untuk mendapatkan semua layanan, lalu memanggil `subscribeToQueue(clients, svc.service_id)` untuk setiap layanan. Fungsi ini membuka koneksi `QueueService.WatchQueue` yang persistent. Setiap event yang diterima dari gRPC langsung diteruskan ke browser — broadcast untuk event umum, atau dikirim secara targeted ke warga tertentu untuk `YOUR_TURN`.

**Stream auto-reconnect:** Jika koneksi gRPC stream terputus (karena server restart atau network glitch), `streamBridge.js` secara otomatis mencoba subscribe ulang setelah 5 detik tanpa perlu intervensi manual.

**Di frontend:** `ws-client.js` menerima `QUEUE_UPDATE` dan meneruskannya ke `EventBus`, yang kemudian dikonsumsi oleh komponen grafik, log aktivitas, dan status indicator.

---

### Fitur Wajib 2 — Event-Driven UI (minimal 3 komponen)

| # | Komponen | File | Trigger Event | Behavior |
|---|----------|------|---------------|---------|
| 1 | **Status Badge** per layanan | `status-indicator.js` | `SERVICES_STATUS_UPDATE`, `QUEUE_UPDATE` | Badge warna OPEN/PAUSED/CLOSED berubah otomatis; angka "menunggu" update real-time dari stream |
| 2 | **Grafik Antrian** bar chart | `chart.js` | `STATS_PUSH`, `QUEUE_UPDATE` | Bar chart animasi menunjukkan jumlah antrian dan quota tiap layanan |
| 3 | **Activity Log** event feed | `activity-log.js` | Semua event bertipe queue, announce, admin, system | Feed bertambah tiap event masuk, max 100 baris, tanpa refresh |

Ketiga komponen ini **tidak pernah di-refresh secara manual** — semuanya berubah eksklusif berdasarkan pesan WebSocket. Ini membuktikan pola event-driven sesuai syarat fitur wajib 2.

---

### Fitur Wajib 3 — Server-Initiated Events

**Implementasi:** `gateway/pushScheduler.js`

Gateway menjalankan empat interval secara paralel **tanpa menunggu permintaan apapun dari browser**:

| Scheduler | Interval | Pesan yang Dikirim | Komponen yang Berubah |
|-----------|----------|-------------------|-----------------------|
| Stats Pusher | 5 detik | `STATS_PUSH` | Grafik, angka statistik |
| Service Status Pusher | 8 detik | `SERVICES_STATUS_UPDATE` | Status badge per layanan |
| Announcement Pusher | 12 detik | `NEW_ANNOUNCEMENT` | Toast notification, Activity log |
| Heartbeat | 30 detik | `HEARTBEAT` | (tidak ada perubahan UI) |

**Initial Snapshot [BARU #8]:** Saat client pertama kali terhubung, gateway langsung mengirimkan snapshot layanan + statistik dalam 300ms — tanpa menunggu interval pertama (yang bisa 5–8 detik). Ini memastikan UI tidak kosong saat halaman pertama dimuat.

---

### Fitur Wajib 4 — Command & Control Bridge

**Implementasi:** `gateway/commandHandler.js` + `frontend/js/admin.js`

**Alur penuh saat admin menekan "Panggil Berikutnya":**

```
[Browser]  admin.js klik btn-call-next
     ↓     sendCommand('CALL_NEXT', { service_id })
     ↓     ws-client.js → ws.send({ cmd:'CALL_NEXT', payload: { service_id } })
     ↓     [WebSocket]
[Gateway]  wsManager.js → handleCommand(message, ws, grpcClients)
     ↓     commandHandler.js → sendAdminCommand(ws, { command_type:'CALL_NEXT', ... })
     ↓     adminSessions.get(clientId).session.write(command)  ← BiDi stream
     ↓     [gRPC]
[Server]   adminService.js memproses CALL_NEXT → update queueStore → broadcast event
     ↓     queueService.js → WatchQueue subscriber notified
     ↓     [gRPC Stream]
[Gateway]  streamBridge.js menerima event → broadcast({ type:'QUEUE_UPDATE', ... })
     ↓     [WebSocket]
[Browser]  ws-client.js → EventBus.emit('queueUpdate') → activity-log, chart, badge update
```

Seluruh siklus ini terjadi dalam milidetik dan tidak memerlukan refresh halaman.

**Multi-admin concurrent [PERBAIKAN #5]:** Setiap koneksi admin memiliki BiDi session sendiri di `adminSessions Map`. Admin A dan Admin B bisa login bersamaan dari browser berbeda tanpa konflik session.

---

## 8. Cara Menjalankan Sistem Lengkap

### Urutan Start (WAJIB diikuti)

```bash
# Terminal 1 — Jalankan gRPC server SiAntre
cd SiAntre
npm run server
# Tunggu hingga: "gRPC server running on 0.0.0.0:50051"

# Terminal 2 — Jalankan WebSocket Gateway
cd SiAntre/gateway
npm install        # Pertama kali saja
node index.js      # atau: npm start
# Tunggu hingga: "[Gateway] Berjalan di http://localhost:3001"

# Browser — Buka halaman
# Warga: http://localhost:3001/index.html
# Admin: http://localhost:3001/admin.html
```

### Variabel Environment (Opsional)

```bash
# Jalankan gateway di port berbeda
GATEWAY_PORT=8080 node index.js

# Ganti alamat gRPC server
GRPC_ADDR=192.168.1.10:50051 node index.js

# Batasi CORS hanya dari origin tertentu
ALLOWED_ORIGIN=http://192.168.1.5:3001 node index.js
```

### Skenario Demo End-to-End

**Langkah 1 — Inisialisasi sistem (wajib pertama kali)**

```
Buka http://localhost:3001/admin.html
→ Banner "Sistem Belum Diinisialisasi" otomatis muncul [Fitur #11]
→ Isi form "Setup Admin Pertama": ID Pegawai, Nama, PIN (≥6 digit)
→ Klik "Daftarkan Admin Pertama"
→ Notifikasi sukses → banner hilang → form login aktif
```

**Langkah 2 — Login admin & siapkan lingkungan**

```
Di halaman admin:
→ Masukkan ID Pegawai dan PIN
→ Login → Dashboard muncul [Tab: Kelola Antrian, Operasional, Manajemen Petugas, Log]
→ Tab "Manajemen Petugas" → tambahkan petugas loket jika diperlukan
```

**Langkah 3 — Daftar dan booking sebagai warga**

```
Buka http://localhost:3001/index.html (di tab baru atau browser berbeda)
→ Tab "Daftar": isi NIK (16 digit), Nama, HP, Alamat → Daftar Akun
→ Tab "Masuk": masukkan NIK → Masuk
→ Pilih layanan dari dropdown → pilih slot waktu → Pesan Sekarang
→ Kode booking muncul di panel "Booking Saya"
```

**Langkah 4 — Pantau event real-time**

```
Tetap di halaman warga
→ Perhatikan dalam 5–8 detik pertama:
   - Grafik antrian muncul dengan data terkini (dari Initial Snapshot)
   - Status badge layanan (OPEN/PAUSED) berubah sesuai kondisi
   - Activity Log mulai menerima event push dari scheduler
```

**Langkah 5 — Operasi admin (Command & Control)**

```
Kembali ke halaman admin:
→ Tab "Kelola Antrian":
   - Pilih layanan → klik "Panggil Berikutnya"
   - Klik "⏸ Jeda" / "▶ Buka" untuk mengubah status layanan
→ Tab "Operasional":
   - Tulis pengumuman → klik "Kirim Pengumuman"
   - Isi NIK warga → "Daftarkan Walk-In"
   - (Hati-hati) "Reset Quota Harian" jika diperlukan

Lihat efeknya di halaman warga secara bersamaan:
→ Activity log menampilkan event real-time
→ Status badge layanan berubah (OPEN ↔ PAUSED)
→ Toast notification muncul saat ada pengumuman baru
→ Jika giliran warga tiba: toast khusus "🎉 Giliran Anda!" hanya di browser warga tersebut
```

**Langkah 6 — Check-In di loket**

```
Di halaman admin → Tab "Kelola Antrian":
→ Masukkan kode booking warga
→ Pilih layanan
→ Klik "✓ Check-In"
→ Notifikasi sukses
```

---

## 9. Troubleshooting (Diperbarui)

### Error: `ServiceInfoService is not a constructor`

**Penyebab (Bug #1):** Namespace proto salah. File `.proto` SiAntre menggunakan `package siantre;` sehingga semua service berada di bawah namespace `.siantre`.

**Solusi:** Buka `grpcClients.js` dan pastikan semua instantiasi menggunakan `.siantre.`:
```javascript
// ❌ SALAH (versi lama)
new serviceInfoProto.ServiceInfoService(grpcAddr, creds)

// ✅ BENAR (v2)
new serviceInfoProto.siantre.ServiceInfoService(grpcAddr, creds)
```
Cara verifikasi: buka setiap file `.proto` dan cari baris `package`. Jika ada `package siantre;`, semua service diakses melalui `proto.siantre.NamaService`.

---

### Error: Admin session langsung error setelah login

**Penyebab (Bug #2):** Mengirim `command_type: 'LOGIN'` ke BiDi stream `AdminSession`. Server tidak mengenal command ini — hanya menerima: `CALL_NEXT`, `ANNOUNCE`, `PAUSE`, `RESUME`, `GET_STATS`.

**Solusi di v2:** Autentikasi dilakukan via `LoginOfficer` unary RPC. Setelah berhasil, `AdminSession` BiDi dibuka langsung tanpa mengirim pesan login apapun ke stream. Pastikan `startAdminSession()` dipanggil di callback `LoginOfficer`, bukan sebelumnya.

---

### Error: Login admin selalu gagal dari Web UI

**Penyebab (Bug #3):** Field name `officer_id` vs `id_pegawai`. `LoginOfficer` RPC di server mengharapkan field `id_pegawai`, bukan `officer_id`.

**Solusi di v2:** Pastikan dari form HTML sampai payload gRPC menggunakan `id_pegawai`:
```javascript
// ❌ SALAH
sendCommand('ADMIN_LOGIN', { officer_id: '...', pin: '...' })

// ✅ BENAR
sendCommand('ADMIN_LOGIN', { id_pegawai: '...', pin: '...' })
```

---

### Status badge layanan semua menampilkan "undefined"

**Penyebab (Bug #4):** `pushScheduler.js` atau `status-indicator.js` versi lama mengakses `s.status` (string), padahal `serviceStore` hanya menyimpan `is_open` (boolean).

**Solusi di v2:** `pushScheduler.js` melakukan konversi eksplisit via `deriveServiceStatus(svc)`:
```javascript
function deriveServiceStatus(svc) {
  if (svc.is_open) return 'OPEN';
  if (svc.quota_remaining === 0) return 'CLOSED';
  return 'PAUSED';
}
```
`status-indicator.js` juga memiliki fallback: `svc.status || (svc.is_open ? 'OPEN' : 'CLOSED')`.

---

### Dua admin login bersamaan — session konflik

**Penyebab (Desain #5):** Versi lama menggunakan singleton `adminSession` global.

**Solusi di v2:** `commandHandler.js` menggunakan `Map<clientId, sessionObject>`. Setiap WebSocket client admin memiliki BiDi session sendiri. Tidak ada kemungkinan session satu admin menimpa session admin lain.

---

### Warga lain menerima notifikasi "Giliran Anda!" yang bukan miliknya

**Penyebab (Desain #6):** Event `YOUR_TURN` di-broadcast ke semua client.

**Solusi di v2:** `streamBridge.js` memanggil `sendToClientByCitizenId(update.citizen_id, payload)` untuk event `YOUR_TURN`. Pesan hanya dikirim ke WebSocket connection yang memiliki `citizenId` cocok di `clientStates Map`. Pastikan warga sudah melakukan `LOGIN_CITIZEN` agar `citizenId` tersimpan di state.

---

### Gateway terhubung ke gRPC server tetapi tidak ada event masuk

**Kemungkinan penyebab:**
1. **Belum ada layanan terdaftar** — stream bridge berhasil subscribe, tapi tidak ada event karena layanan belum diinisialisasi. Inisialisasi sistem melalui halaman admin terlebih dahulu.
2. **`queue_number = 0` tidak ditangani server** — jika `WatchQueue` dengan `queue_number: 0` tidak menghasilkan event apapun, periksa implementasi `queueService.js` di server apakah menangani nilai 0 secara khusus. Sebagai alternatif, gunakan `GetSystemStats` via polling untuk memantau statistik antrian.
3. **Stream terputus segera** — periksa log terminal gateway untuk error stream. Auto-reconnect akan aktif setelah 5 detik.

---

### Gateway tidak bisa terhubung ke gRPC server

```
Error: UNAVAILABLE: Connection refused
```

**Solusi:** Jalankan gRPC server terlebih dahulu (`npm run server`) sebelum gateway. Gateway memiliki auto-retry untuk `startStreamBridge` — mencoba ulang setiap 3 detik jika layanan masih kosong.

---

### Halaman admin tidak cek status inisialisasi (UX membingungkan)

**Penyebab (Desain #11):** Di versi lama, jika sistem belum diinisialisasi, admin login akan selalu gagal tanpa penjelasan.

**Solusi di v2:** `admin.js` memanggil `CHECK_SYSTEM_INITIALIZED` segera setelah WebSocket terhubung. Jika server mengembalikan `{ initialized: false }`, banner peringatan dan form setup admin pertama muncul otomatis.

---

### Error: Cannot find package 'ws' / 'express' / 'cors'

```bash
cd SiAntre/gateway
npm install
```

Pastikan `package.json` gateway memiliki semua dependensi: `ws`, `express`, `cors`, `@grpc/grpc-js`, `@grpc/proto-loader`.

---

### Chart.js tidak muncul / error CDN

Pastikan koneksi internet tersedia untuk memuat Chart.js dari CDN. Sebagai alternatif offline, unduh dan simpan lokal:
```bash
curl -o frontend/js/lib/chart.umd.min.js \
  https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
```
Kemudian ubah tag script di `index.html`:
```html
<script src="js/lib/chart.umd.min.js"></script>
```

---

### Pengumuman tidak muncul / `announcement_id` undefined

**Penyebab (Catatan #13):** Field ID pengumuman di `announcementStore.js` bisa berbeda-beda tergantung implementasi server. `pushScheduler.js` v2 sudah menangani ini dengan fallback:
```javascript
const announcementId = latest.id || latest.announcement_id;
```
Jika masih gagal, buka `server/state/announcementStore.js` dan periksa struktur objek yang disimpan, lalu sesuaikan field accessor di `startAnnouncementPusher`.

---

## 10. Referensi & Dependensi

### Dependensi Gateway (`gateway/package.json`)

| Package | Versi | Fungsi |
|---------|-------|--------|
| `ws` | ^8.16.0 | WebSocket server library |
| `express` | ^4.18.0 | HTTP server & static file serving |
| `cors` | ^2.8.5 | **[BARU #14]** Header CORS agar frontend bisa diakses dari origin berbeda |
| `@grpc/grpc-js` | ^1.10.0 | gRPC client (install terpisah di gateway, tidak berbagi dengan server) |
| `@grpc/proto-loader` | ^0.7.0 | Parser file `.proto` saat runtime |

### Dependensi Frontend (CDN — tidak perlu install)

| Library | Versi | URL CDN | Fungsi |
|---------|-------|---------|--------|
| Chart.js | 4.4.0 | `cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` | Grafik antrian bar chart |

### Port yang Digunakan

| Port | Komponen | Keterangan |
|------|----------|------------|
| `50051` | gRPC Server (`server/index.js`) | Tidak berubah dari project sebelumnya |
| `3001` | WebSocket Gateway (`gateway/index.js`) | HTTP + WebSocket dalam satu port (via `http.createServer`) |

### Ringkasan Semua Perbaikan yang Diterapkan di v2

| # | Kategori | Masalah | Solusi di v2 | File |
|---|----------|---------|--------------|------|
| 1 | 🔴 Bug Kritis | Namespace proto salah (`ServiceInfoService`) | Akses via `.siantre.ServiceInfoService` | `grpcClients.js` |
| 2 | 🔴 Bug Kritis | Command `LOGIN` tidak dikenal di BiDi stream | Hapus command LOGIN; session dibuka langsung setelah unary `LoginOfficer` | `commandHandler.js` |
| 3 | 🔴 Bug Kritis | Field `officer_id` vs `id_pegawai` | Semua referensi diubah ke `id_pegawai` end-to-end | `commandHandler.js`, `admin.js`, `admin.html` |
| 4 | 🔴 Bug Kritis | `s.status` undefined (hanya ada `is_open` bool) | Konversi eksplisit `is_open` → string via `deriveServiceStatus()` | `pushScheduler.js`, `status-indicator.js` |
| 5 | 🟡 Arsitektur | Admin session singleton — konflik multi-admin | `Map<clientId, session>` per koneksi | `commandHandler.js` |
| 6 | 🟡 Arsitektur | `YOUR_TURN` broadcast ke semua client | Targeted delivery via `sendToClientByCitizenId()` | `streamBridge.js`, `wsManager.js` |
| 7 | 🟡 Desain | `queue_number=0` tidak dijamin server | Catatan eksplisit + fallback via `GET_STATS` | `streamBridge.js` |
| 8 | 🟡 Desain | UI kosong 5–8 detik saat pertama connect | `sendInitialSnapshot()` dipanggil segera setelah connect | `pushScheduler.js`, `wsManager.js` |
| 9 | 🟡 Desain | Admin BiDi session tidak punya auto-reconnect | Retry 5 detik di `session.on('error')` | `commandHandler.js` |
| 10 | 🟢 Fitur Baru | Manajemen petugas tidak bisa dari Web | Handler + UI untuk `REGISTER/UPDATE/DELETE/LIST_OFFICER` | `commandHandler.js`, `admin.html`, `admin.js` |
| 11 | 🟢 Fitur Baru | Tidak cek `IsSystemInitialized` sebelum login | `CHECK_SYSTEM_INITIALIZED` dipanggil saat WS connect; banner + setup form muncul | `commandHandler.js`, `admin.js`, `admin.html` |
| 12 | 🟢 Keamanan | Siapapun bisa kirim admin command via WS | Catatan rekomendasi token WS session (implementasi lebih lanjut) | Dokumentasi |
| 13 | 🟢 Verifikasi | Field announcement (`id`, `title`, `created_at`) tidak terjamin | Fallback `latest.id \|\| latest.announcement_id` + catatan verifikasi | `pushScheduler.js` |
| 14 | 🟢 Teknis | CORS tidak dikonfigurasi di gateway | `cors()` middleware ditambahkan di Express dengan `ALLOWED_ORIGIN` env | `index.js` |
| 15 | 🟢 Verifikasi | `waiting_count` tidak tersedia dari `ListServices` | Explicit `null` placeholder; diupdate real-time dari `QUEUE_UPDATE` stream | `pushScheduler.js`, `status-indicator.js` |

### Referensi Dokumentasi

- [WebSocket API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ws library — npm](https://www.npmjs.com/package/ws)
- [Chart.js Dokumentasi](https://www.chartjs.org/docs/)
- [gRPC Node.js — @grpc/grpc-js](https://www.npmjs.com/package/@grpc/grpc-js)
- [gRPC Streaming Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/)
- [CORS — cors npm package](https://www.npmjs.com/package/cors)

---

*Dokumen ini adalah revisi lengkap v2 dari implementation guide SiAntre WebSocket. Semua perbaikan bug kritis (#1–#4) wajib diimplementasikan sebelum mulai coding agar tidak terjebak debugging di tengah jalan. Perbaikan arsitektur (#5–#9) sangat disarankan untuk stabilitas. Fitur baru (#10–#15) bersifat opsional tapi meningkatkan kualitas UX dan keamanan sistem secara signifikan.*
