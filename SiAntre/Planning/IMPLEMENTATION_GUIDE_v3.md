# SiAntre — Frontend & WebSocket Implementation Guide v3

> Panduan implementasi WebSocket Gateway + Web UI untuk SiAntre
> (Revisi v3: Perbaikan MDN WebSocket API + Stack FE DaisyUI · anime.js · ApexCharts · Web Audio API)

---

## Catatan Revisi (v2 → v3)

Dokumen ini adalah revisi dari v2. Fokus perubahan ada di **dua area**:

### Area 1 — Evaluasi MDN WebSocket API (6 perbaikan)

Berdasarkan gap analysis terhadap spesifikasi MDN WebSocket API, ditemukan 6 ketidaksesuaian di `ws-client.js` dan `commandHandler.js`. Tiga di antaranya bersifat **wajib** diperbaiki sebelum implementasi.

| # | Issue | Severity | File | Status di v3 |
|---|-------|----------|------|-------------|
| M1 | Magic number `readyState === 1` — harus pakai `WebSocket.OPEN` | 🔴 Wajib | `ws-client.js`, `commandHandler.js` | ✅ Diperbaiki |
| M2 | `CloseEvent` diabaikan — reconnect selalu aktif meski penutupan normal | 🔴 Wajib | `ws-client.js` | ✅ Diperbaiki |
| M3 | `ws://` hardcoded — HTTPS akan diblok browser sebagai mixed content | 🔴 Wajib | `ws-client.js` | ✅ Diperbaiki |
| M4 | `oneventname` vs `addEventListener` — pola lama, tidak mendukung multi-listener | 🟡 Disarankan | `ws-client.js` | ✅ Diperbaiki |
| M5 | `bufferedAmount` tidak dicek sebelum `send()` | 🟡 Disarankan | `ws-client.js` | ✅ Diperbaiki |
| M6 | Koneksi tidak ditutup saat navigasi — masalah bfcache | 🟡 Disarankan | `ws-client.js` | ✅ Diperbaiki |

### Area 2 — Stack Frontend Baru

| Library | Peran | Gantikan |
|---------|-------|---------|
| **DaisyUI** (CDN) | Base styling — card, badge, btn, toast, table, modal | Semua custom CSS di `style.css` |
| **anime.js** (CDN) | Mikro-animasi antrian (flip angka, spring toast `YOUR_TURN`) | Animasi manual CSS |
| **ApexCharts** (CDN) | Grafik realtime dengan animasi update halus | Chart.js |
| **Web Audio API** | Notifikasi suara saat `YOUR_TURN` | — (fitur baru, bawaan browser) |

> **Tidak berubah:** Seluruh kode gateway (Tahap 1 — `gateway/`), kecuali satu perbaikan kecil di `commandHandler.js` (magic number M1). Vanilla JS tetap digunakan — tidak ada framework FE.

---

## Daftar Isi

1. [Gambaran Arsitektur](#1-gambaran-arsitektur) *(tidak berubah dari v2)*
2. [Prasyarat & Setup Awal](#2-prasyarat--setup-awal) *(tidak berubah dari v2)*
3. [Struktur Direktori Akhir](#3-struktur-direktori-akhir)
4. [Tahap 1 — WebSocket Gateway](#4-tahap-1--websocket-gateway) *(berubah: hanya commandHandler.js)*
5. [Tahap 2 — Frontend Web UI](#5-tahap-2--frontend-web-ui) *(berubah semua)*
   - [5.1 Struktur HTML Utama (DaisyUI)](#51-struktur-html-utama-daisyui)
   - [5.2 Stylesheet Global (Minimal)](#52-stylesheet-global-minimal)
   - [5.3 WebSocket Client — MDN Fixes ⚠️ DIREVISI MAYOR](#53-websocket-client--mdn-fixes)
   - [5.4 Grafik Antrian Live — ApexCharts](#54-grafik-antrian-live--apexcharts)
   - [5.5 Activity Log](#55-activity-log) *(tidak berubah dari v2)*
   - [5.6 Status Indikator Layanan](#56-status-indikator-layanan) *(DaisyUI classes)*
   - [5.7 Notifikasi — anime.js + Web Audio API](#57-notifikasi--animejs--web-audio-api)
   - [5.8 Animasi Nomor Antrian — anime.js](#58-animasi-nomor-antrian--animejs)
   - [5.9 Halaman Warga](#59-halaman-warga) *(tidak berubah dari v2)*
   - [5.10 Halaman Admin (DaisyUI)](#510-halaman-admin-daisyui)
6. [Protokol Pesan WebSocket](#6-protokol-pesan-websocket) *(tidak berubah dari v2)*
7. [Mapping Fitur Tugas ke Implementasi](#7-mapping-fitur-tugas-ke-implementasi) *(tidak berubah dari v2)*
8. [Cara Menjalankan Sistem Lengkap](#8-cara-menjalankan-sistem-lengkap)
9. [Troubleshooting](#9-troubleshooting)
10. [Referensi & Dependensi](#10-referensi--dependensi) *(diperbarui)*

---

## 1. Gambaran Arsitektur

*(Tidak berubah dari v2 — lihat IMPLEMENTATION_GUIDE_v2.md §1)*

Arsitektur tiga lapis tetap sama:

```
Browser (Port 3001) ←→ WebSocket Gateway (Port 3001) ←→ gRPC Server (Port 50051)
```

---

## 2. Prasyarat & Setup Awal

*(Tidak berubah dari v2 — lihat IMPLEMENTATION_GUIDE_v2.md §2)*

---

## 3. Struktur Direktori Akhir

```
SiAntre/
├── proto/                          # Tidak diubah
├── server/                         # Tidak diubah
├── client/                         # Tidak diubah
│
├── gateway/                        # Berubah: hanya commandHandler.js (fix M1)
│   ├── package.json
│   ├── index.js
│   ├── grpcClients.js
│   ├── streamBridge.js
│   ├── commandHandler.js           # ⚠️ Fix M1: WebSocket.OPEN constant
│   ├── pushScheduler.js
│   └── wsManager.js
│
└── frontend/                       # Berubah: semua file FE diperbarui
    ├── index.html                  # ⚠️ DaisyUI + anime.js + ApexCharts CDN
    ├── admin.html                  # ⚠️ DaisyUI layout
    ├── css/
    │   └── style.css               # ⚠️ Drastis diperkecil (DaisyUI handle base)
    └── js/
        ├── ws-client.js            # ⚠️ DIREVISI MAYOR — 6 MDN fixes
        ├── chart.js                # ⚠️ Diganti ApexCharts
        ├── queue-animation.js      # 🆕 anime.js flip angka antrian
        ├── activity-log.js         # Tidak berubah
        ├── status-indicator.js     # Minor: DaisyUI class names
        ├── notification.js         # ⚠️ anime.js spring + Web Audio
        ├── warga.js                # Tidak berubah dari v2
        └── admin.js                # Minor: DaisyUI class updates
```

---

## 4. Tahap 1 — WebSocket Gateway

Seluruh kode gateway (§4.1–4.2, 4.3–4.4, 4.6–4.7) **tidak berubah** dari v2. Satu-satunya perubahan ada di `commandHandler.js` untuk memperbaiki magic number (perbaikan M1).

### 4.5 Command Handler — Fix M1: `WebSocket.OPEN`

**File: `gateway/commandHandler.js`**

> **PERBAIKAN M1:** Ganti `ws.readyState === 1` dengan konstanta bernama. Dalam library `ws` (Node.js), konstanta `OPEN = 1` diekspos via `const { OPEN: WS_OPEN } = require('ws')`. Perubahan ini hanya pada satu baris di fungsi `startAdminSession`.
>
> **Semua kode lainnya dari v2 tetap sama.**

Tambahkan baris ini di bagian atas file, setelah baris `'use strict';`:

```javascript
'use strict';

// FIX M1: Import konstanta readyState dari library ws
// Menggantikan magic number 1 yang digunakan di v2
const { OPEN: WS_OPEN } = require('ws');

const { broadcast, sendToClient, getClientState, setClientState } = require('./wsManager');

// ... (sisa imports sama dengan v2)
```

Dan ubah baris auto-reconnect di `startAdminSession`:

```javascript
// ❌ v2 — magic number
if (ws.readyState === 1 /* OPEN */) {
  startAdminSession(ws, clients);
}

// ✅ v3 — konstanta bernama (FIX M1)
if (ws.readyState === WS_OPEN) {
  startAdminSession(ws, clients);
}
```

> **Semua kode lain di `commandHandler.js` identik dengan v2.** Salin dari v2 dan terapkan dua perubahan di atas.

---

## 5. Tahap 2 — Frontend Web UI

### 5.1 Struktur HTML Utama (DaisyUI)

**File: `frontend/index.html`**

> **Perubahan dari v2:**
> - Tambah CDN DaisyUI (via link CSS) + Tailwind CDN (required untuk DaisyUI utility classes)
> - Tambah CDN anime.js dan ApexCharts — ganti Chart.js
> - Tambah div `#queue-number-display` untuk animasi flip nomor antrian
> - Class HTML diubah ke class DaisyUI (`card`, `badge`, `btn`, dll.)
> - Load `queue-animation.js` setelah `ws-client.js`

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Sistem Antrian Digital</title>

  <!-- DaisyUI + Tailwind (CDN — no build step required) -->
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css"
        rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Custom overrides (minimal — DaisyUI handles base) -->
  <link rel="stylesheet" href="css/style.css" />

  <!-- ApexCharts — ganti Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js"></script>

  <!-- anime.js — mikro-animasi -->
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

  <!-- Toast container (managed by notification.js via DaisyUI + anime.js) -->
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
            <!-- Tab Masuk -->
            <div id="tab-login" class="tab-content">
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">NIK (16 digit)</span></div>
                <input type="text" id="login-nik" maxlength="16"
                       placeholder="Masukkan NIK Anda"
                       class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-login">Masuk</button>
            </div>
            <!-- Tab Daftar -->
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

        <!-- Komponen 2: Grafik Antrian Live + Animasi Nomor (Event-Driven UI) -->
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h2 class="card-title text-base">Antrian Real-Time</h2>
              <span class="badge badge-success gap-1 animate-pulse">● LIVE</span>
            </div>

            <!-- Nomor antrian dipanggil (anime.js flip) -->
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

> DaisyUI menangani seluruh base styling. File ini hanya berisi customisasi yang tidak bisa dilakukan via DaisyUI utility classes — animasi custom, komponen log, dan override minor.

```css
/* ── Custom: tidak ada di DaisyUI ───────────────────────────────────────────── */

/* Log entries */
.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
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

/* Animasi YOUR_TURN toast — dikelola anime.js, class ini hanya initial state */
.toast-your-turn {
  position: fixed;
  top: 80px;
  right: -400px;  /* mulai di luar layar */
  z-index: 9999;
  min-width: 320px;
}

/* Queue number flip — target anime.js */
#queue-number-value {
  display: inline-block;
  transform-origin: center bottom;
}

/* ApexCharts override minimal */
.apexcharts-toolbar { display: none !important; }
```

---

### 5.3 WebSocket Client — MDN Fixes

**File: `frontend/js/ws-client.js`**

> **DIREVISI MAYOR — 6 perbaikan MDN WebSocket API:**
>
> - **M1** — `WebSocket.OPEN` constant menggantikan magic number `1`
> - **M2** — `CloseEvent` dibaca; reconnect hanya jika `code !== 1000 && code !== 1001`
> - **M3** — `wss://` otomatis dipilih jika halaman di-serve via HTTPS
> - **M4** — `addEventListener` pattern menggantikan `oneventname`
> - **M5** — `bufferedAmount` dicek sebelum `send()` (threshold 16 KB)
> - **M6** — `beforeunload` menutup koneksi dengan clean close `code 1000`

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
      try { cb(data); } catch (err) { console.error(`[EventBus] Error in listener for "${event}":`, err); }
    });
  },
};

// ─── Kirim Command ke Gateway ─────────────────────────────────────────────────
//
// FIX M1: Gunakan WebSocket.OPEN (konstanta bernama) bukan angka 1
// FIX M5: Cek bufferedAmount sebelum send agar tidak overflow buffer saat koneksi lambat
//
function sendCommand(cmd, payload = {}) {
  if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) {  // FIX M1
    console.warn('[WsClient] Belum terhubung, command diabaikan:', cmd);
    showNotification('Koneksi Terputus', 'Mencoba menghubungkan kembali...', 'warning');
    return;
  }

  // FIX M5: Cek bufferedAmount — untuk pesan JSON kecil SiAntre ini jarang terjadi,
  // tapi ini best practice MDN terutama saat koneksi lambat / mobile
  if (AppState.ws.bufferedAmount > 16 * 1024) {  // 16 KB threshold
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
        // Toast YOUR_TURN ditangani notification.js dengan animasi spring anime.js
        // dan suara Web Audio API
        EventBus.emit('yourTurn', msg);
      }
      // Update animasi nomor antrian dipanggil (untuk semua orang, bukan hanya yang bersangkutan)
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
    case 'SYSTEM_INIT_STATUS': EventBus.emit('systemInitStatus', msg); break;
    case 'ADMIN_EVENT':
      EventBus.emit('adminEvent', msg.payload);
      EventBus.emit('activityLog', {
        type:      'admin',
        message:   `Admin event: ${msg.payload.event_type}`,
        timestamp: msg.payload.timestamp,
      });
      break;
    case 'SYSTEM_STATS':        EventBus.emit('statsUpdate', msg.payload);   break;
    case 'CHECKIN_RESULT':      EventBus.emit('checkinResult', msg);         break;
    case 'WALK_IN_RESULT':      EventBus.emit('walkInResult', msg);          break;
    case 'RESET_QUOTA_RESULT':  EventBus.emit('resetQuotaResult', msg);      break;
    case 'OFFICERS_LIST':       EventBus.emit('officersList', msg);          break;
    case 'REGISTER_OFFICER_RESULT': EventBus.emit('registerOfficerResult', msg); break;
    case 'UPDATE_OFFICER_RESULT':   EventBus.emit('updateOfficerResult', msg);   break;
    case 'DELETE_OFFICER_RESULT':   EventBus.emit('deleteOfficerResult', msg);   break;
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
    connected: {
      text:  '● Terhubung',
      class: 'badge badge-success',
    },
    disconnected: {
      text:  '● Terputus',
      class: 'badge badge-error',
    },
    connecting: {
      // DaisyUI loading spinner
      text:  '<span class="loading loading-ring loading-xs"></span> Menghubungkan...',
      class: 'badge badge-warning gap-1',
    },
  };

  const cfg = configs[status] || configs.connecting;
  badge.className   = cfg.class;
  badge.innerHTML   = cfg.text;
}

// ─── Inisialisasi WebSocket ───────────────────────────────────────────────────
//
// FIX M3: Auto-detect wss:// vs ws:// berdasarkan protocol halaman
//   Jika halaman dimuat via HTTPS, browser akan MEMBLOK ws:// sebagai mixed content
//
// FIX M4: Pakai addEventListener bukan oneventname
//   addEventListener memungkinkan multiple listener pada event yang sama,
//   lebih modular, dan konsisten dengan Web API modern lainnya
//
function initWebSocket() {
  // FIX M3: Protocol detection
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl      = `${wsProtocol}//${window.location.host}`;

  updateConnectionStatus('connecting');

  const ws = new WebSocket(wsUrl);
  AppState.ws = ws;

  // FIX M4: addEventListener (bukan ws.onopen = ...)
  ws.addEventListener('open', () => {
    AppState.isConnected       = true;
    AppState.reconnectAttempts = 0;
    updateConnectionStatus('connected');
    EventBus.emit('wsConnected', {});
    console.log('[WsClient] Koneksi dibuka.');
  });

  ws.addEventListener('message', (event) => {
    try {
      routeMessage(JSON.parse(event.data));
    } catch (err) {
      console.error('[WsClient] Parse error:', err);
    }
  });

  // FIX M2: Baca CloseEvent — jangan selalu reconnect
  //
  // CloseEvent memiliki 3 properti: code, reason, wasClean
  // Kode penting yang perlu dihandle:
  //   1000 = Normal Closure    → TIDAK perlu reconnect (server sengaja menutup)
  //   1001 = Going Away        → TIDAK perlu reconnect (navigasi)
  //   1006 = Abnormal Closure  → perlu reconnect (network drop)
  //   1011 = Internal Error    → perlu reconnect (server crash)
  //   1012 = Service Restart   → perlu reconnect
  //
  ws.addEventListener('close', (event) => {
    AppState.isConnected = false;
    AppState.ws          = null;
    updateConnectionStatus('disconnected');
    EventBus.emit('wsDisconnected', { code: event.code, reason: event.reason });

    console.log(`[WsClient] Koneksi ditutup — code: ${event.code}, clean: ${event.wasClean}`);

    // FIX M2: Hanya reconnect jika BUKAN penutupan normal
    if (event.code !== 1000 && event.code !== 1001) {
      scheduleReconnect();
    } else {
      console.log('[WsClient] Penutupan normal, tidak reconnect.');
    }
  });

  ws.addEventListener('error', () => {
    // Error event selalu diikuti oleh close event, cukup update status di sini
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
    showNotification(
      'Koneksi Gagal',
      'Tidak bisa terhubung ke server. Refresh halaman untuk mencoba lagi.',
      'error',
      0  // durasi 0 = tidak auto-dismiss
    );
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, AppState.reconnectAttempts), 30000);
  AppState.reconnectAttempts++;
  console.log(`[WsClient] Reconnect attempt ${AppState.reconnectAttempts} dalam ${delay}ms...`);
  setTimeout(initWebSocket, delay);
}

// ─── FIX M6: Tutup koneksi saat user navigasi ─────────────────────────────────
//
// MDN memperingatkan: halaman dengan open WebSocket connection mungkin tidak
// masuk ke bfcache (back-forward cache) browser — memperlambat navigasi.
// Solusi: tutup koneksi dengan clean close code 1000 saat beforeunload.
//
window.addEventListener('beforeunload', () => {
  if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {  // FIX M1 juga diterapkan di sini
    AppState.ws.close(1000, 'User navigating away');
  }
});

// ─── Opsional: Pause reconnect saat tab di-background ─────────────────────────
//
// Ini menghemat resource — tidak ada gunanya mencoba reconnect jika tab tersembunyi.
// Saat tab aktif kembali, reconnect otomatis jika masih terputus.
//
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    AppState.pauseReconnect = true;
  } else {
    AppState.pauseReconnect = false;
    // Reconnect jika terputus saat tab di-background
    if (!AppState.isConnected && AppState.ws === null) {
      AppState.reconnectAttempts = 0; // reset counter agar tidak terjebak di max
      initWebSocket();
    }
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initWebSocket);
```

---

### 5.4 Grafik Antrian Live — ApexCharts

**File: `frontend/js/chart.js`**

> **Diganti sepenuhnya dari Chart.js ke ApexCharts.** ApexCharts menggunakan SVG natively dan memberikan animasi update data yang jauh lebih halus — bar "meluncur" ke nilai baru saat data berubah, bukan langsung teleport. Setup API-nya mirip, perubahan minimal di struktur data.

```javascript
(function () {
  let chart = null;

  const chartOptions = {
    chart: {
      type:       'bar',
      height:     220,
      fontFamily: 'inherit',
      toolbar:    { show: false },
      animations: {
        enabled:        true,
        easing:         'easeinout',
        speed:          500,
        dynamicAnimation: { enabled: true, speed: 400 },
      },
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        horizontal:   false,
        columnWidth:  '55%',
        borderRadius: 4,
      },
    },
    colors: ['#4f46e5', '#16a34a'],  // Indigo (menunggu) + Green (quota sisa)
    series: [
      { name: 'Menunggu', data: [] },
      { name: 'Sisa Quota', data: [] },
    ],
    xaxis: {
      categories: [],
      labels: { style: { fontSize: '12px' } },
    },
    yaxis: {
      min: 0,
      labels: { formatter: (v) => Math.floor(v) },
      tickAmount: 5,
    },
    legend: {
      position: 'bottom',
      fontSize:  '12px',
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: '#e5e7eb',
      strokeDashArray: 3,
    },
    tooltip: {
      y: { formatter: (val) => `${val} orang` },
    },
    theme: { mode: 'light' },
  };

  function initChart() {
    const el = document.getElementById('queue-chart');
    if (!el || typeof ApexCharts === 'undefined') return;

    chart = new ApexCharts(el, chartOptions);
    chart.render();
  }

  /**
   * Update grafik dengan data layanan terbaru.
   * Bisa menerima data dari dua sumber:
   * 1. SERVICES_STATUS_UPDATE → services array dengan waiting_count (bisa null)
   * 2. STATS_PUSH.per_service → per-service stats dengan waiting_count
   *
   * ApexCharts.updateSeries() akan animasi transisi ke nilai baru secara halus.
   */
  function updateChart(services) {
    if (!chart || !services || services.length === 0) return;

    chart.updateOptions({
      xaxis: {
        categories: services.map(s => s.name || s.service_id || '?'),
      },
    }, false, false);

    chart.updateSeries([
      { name: 'Menunggu',    data: services.map(s => s.waiting_count ?? 0) },
      { name: 'Sisa Quota',  data: services.map(s => s.quota_remaining ?? 0) },
    ]);
  }

  function updateStats(stats) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '—';
    };
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

### 5.5 Activity Log

**File: `frontend/js/activity-log.js`** — **Tidak berubah dari v2**

*(Salin langsung dari IMPLEMENTATION_GUIDE_v2.md §5.5)*

---

### 5.6 Status Indikator Layanan

**File: `frontend/js/status-indicator.js`**

> **Perubahan dari v2:** Hanya nama class CSS diubah ke DaisyUI (`badge-success`, `badge-warning`, `badge-error`). Logic renderServices dan updateSingleService identik dengan v2.

```javascript
(function() {
  function getStatusBadgeClass(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    // DaisyUI badge classes
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
                             ? svc.waiting_count
                             : '—';

      const card = document.createElement('div');
      card.className          = `card bg-base-100 border ${isOpen ? 'border-success/30' : 'border-error/20'} shadow-xs`;
      card.dataset.serviceId  = svc.service_id;

      card.innerHTML = `
        <div class="card-body p-3">
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-sm leading-tight">${esc(svc.name || svc.service_id)}</p>
            <span class="${getStatusBadgeClass(svc)} badge-sm whitespace-nowrap">
              ${getStatusLabel(svc)}
            </span>
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

    // Update badge status
    if (updates.status !== undefined || updates.is_open !== undefined) {
      const badge = card.querySelector('[class*="badge"]');
      if (badge) {
        badge.className = `${getStatusBadgeClass(updates)} badge-sm whitespace-nowrap`;
        badge.textContent = getStatusLabel(updates);
      }
    }

    // Update waiting count dari QUEUE_UPDATE stream (real-time)
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

### 5.7 Notifikasi — anime.js + Web Audio API

**File: `frontend/js/notification.js`**

> **Perubahan dari v2:**
> - Toast biasa pakai DaisyUI `alert` component
> - Toast `YOUR_TURN` menggunakan **anime.js spring animation** — slide masuk dari kanan dengan spring bounce
> - Suara notifikasi menggunakan **Web Audio API** (bawaan browser, tanpa library/CDN)

```javascript
// ─── Web Audio API: Sound Notification ───────────────────────────────────────
//
// Menggunakan Web Audio API bawaan browser — tidak perlu CDN atau file audio.
// Tone yang dihasilkan adalah dua nada naik (pleasant chime) untuk YOUR_TURN,
// dan satu beep pendek untuk notifikasi biasa.
//
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx  = null;

function getAudioContext() {
  // AudioContext harus dibuat setelah user gesture (klik pertama) — browser policy
  if (!_audioCtx) _audioCtx = new AudioCtx();
  return _audioCtx;
}

/**
 * Mainkan nada sederhana menggunakan Web Audio API.
 * @param {number[]} notes   - Frekuensi dalam Hz, dimainkan berurutan
 * @param {number}   volume  - Gain 0.0–1.0
 */
function playTone(notes = [523, 659], volume = 0.3) {
  try {
    const ctx   = getAudioContext();
    let startAt = ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();

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
  } catch (e) {
    // AudioContext mungkin belum bisa digunakan sebelum ada user gesture — abaikan
  }
}

// ─── Toast Biasa (DaisyUI alert component) ────────────────────────────────────
//
// Menggunakan DaisyUI toast container #toast-container yang sudah ada di HTML.
// Animasi masuk/keluar dihandle anime.js sederhana (fade + slide).
//
function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // DaisyUI alert classes
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

  // Animasi masuk dengan anime.js
  anime({
    targets:   toast,
    opacity:   [0, 1],
    translateX: [20, 0],
    duration:  300,
    easing:    'easeOutQuart',
  });

  if (duration > 0) {
    setTimeout(() => {
      anime({
        targets:   toast,
        opacity:   [1, 0],
        translateX: [0, 20],
        duration:  250,
        easing:    'easeInQuart',
        complete:  () => toast.remove(),
      });
    }, duration);
  }
}

// ─── Toast YOUR_TURN (Spring Animation + Suara) ───────────────────────────────
//
// Ini adalah momen paling penting saat demo:
// - Banner besar dengan spring bounce masuk dari kanan
// - Suara chime tiga nada naik via Web Audio API
// - Auto-dismiss setelah 12 detik
//
function showYourTurnAlert(serviceLabel) {
  // 1. Suara: tiga nada naik (C5 - E5 - G5) — pleasant major chord arpeggio
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
    <!-- Progress bar countdown -->
    <div id="your-turn-progress"
         style="height: 4px; background: rgba(255,255,255,0.4); transform-origin: left;"></div>
  `;

  document.body.appendChild(banner);

  // 3. Spring animation masuk — inilah momen pakai anime.js
  anime({
    targets:  banner,
    translateX: [400, 0],
    opacity:    [0, 1],
    duration:   700,
    easing:     'spring(1, 80, 10, 0)',  // spring(mass, stiffness, damping, velocity)
  });

  // 4. Progress bar countdown 12 detik
  const progressBar = banner.querySelector('#your-turn-progress');
  anime({
    targets:  progressBar,
    scaleX:   [1, 0],
    duration: 12000,
    easing:   'linear',
    complete: () => dismissYourTurn(),
  });

  // 5. Ulangi suara sekali lagi setelah 2 detik (agar lebih perhatian)
  setTimeout(() => playTone([784, 659, 523], 0.3), 2000);
}

window.dismissYourTurn = function () {
  const banner = document.getElementById('your-turn-banner');
  if (!banner) return;
  anime({
    targets:  banner,
    translateX: [0, 400],
    opacity:    [1, 0],
    duration:   350,
    easing:     'easeInQuart',
    complete:   () => banner.remove(),
  });
};

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // YOUR_TURN — spring toast khusus
  EventBus.on('yourTurn', (msg) => {
    const serviceId    = msg.service_id;
    const serviceLabel = AppState.services?.find(s => s.service_id === serviceId)?.name || serviceId;
    showYourTurnAlert(serviceLabel);
  });

  // Pengumuman baru — beep pendek
  EventBus.on('newAnnouncement', () => {
    playTone([440, 523], 0.2);
  });

  // Inisialisasi AudioContext saat user pertama kali berinteraksi (browser policy)
  document.addEventListener('click', () => getAudioContext(), { once: true });
});
```

---

### 5.8 Animasi Nomor Antrian — anime.js

**File: `frontend/js/queue-animation.js`** *(File baru)*

> Menganimasikan nomor antrian yang dipanggil. Saat nomor berubah, angka "flip" dari atas ke bawah menggunakan anime.js — efek yang paling mencolok saat demo. Ini adalah komponen terpisah yang hanya ada di v3.

```javascript
(function() {
  const FLIP_DURATION = 400; // ms

  function animateNumberFlip(element, newValue) {
    // Phase 1: Flip keluar (angka lama berputar ke atas)
    anime({
      targets:   element,
      rotateX:   [0, -90],
      opacity:   [1, 0],
      duration:  FLIP_DURATION / 2,
      easing:    'easeInQuart',
      complete: () => {
        element.textContent = newValue;
        // Phase 2: Flip masuk (angka baru berputar dari bawah)
        anime({
          targets:  element,
          rotateX:  [90, 0],
          opacity:  [0, 1],
          duration: FLIP_DURATION / 2,
          easing:   'easeOutQuart',
        });
      },
    });
  }

  let currentDisplayedNumber = null;

  function updateQueueDisplay({ number, service_id }) {
    if (number === currentDisplayedNumber) return; // Tidak ada perubahan
    currentDisplayedNumber = number;

    const displaySection = document.getElementById('current-queue-display');
    const numberEl       = document.getElementById('queue-number-value');
    const labelEl        = document.getElementById('queue-service-label');

    if (!displaySection || !numberEl) return;

    // Tampilkan section jika masih tersembunyi
    if (displaySection.classList.contains('hidden')) {
      displaySection.classList.remove('hidden');
      anime({
        targets:  displaySection,
        opacity:  [0, 1],
        translateY: [-10, 0],
        duration: 400,
        easing:   'easeOutQuart',
      });
    }

    // Update label layanan
    if (labelEl && service_id) {
      const svc = AppState.services?.find(s => s.service_id === service_id);
      if (svc) labelEl.textContent = svc.name || service_id;
    }

    // Animasi flip angka
    animateNumberFlip(numberEl, number);

    // Highlight flash singkat pada section
    anime({
      targets:         displaySection,
      backgroundColor: ['rgba(79, 70, 229, 0.2)', 'rgba(79, 70, 229, 0.05)'],
      duration:        800,
      easing:          'easeOutQuart',
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    EventBus.on('queueNumberCalled', updateQueueDisplay);
  });
})();
```

---

### 5.9 Halaman Warga

**File: `frontend/js/warga.js`** — **Tidak berubah dari v2**

*(Salin langsung dari IMPLEMENTATION_GUIDE_v2.md §5.8)*

---

### 5.10 Halaman Admin (DaisyUI)

**File: `frontend/admin.html`**

> **Perubahan dari v2:** Layout dan class diubah ke DaisyUI. Semua logic di `admin.js` tidak berubah — hanya ada pembaruan minor di class name yang di-set via JavaScript (misal `badge badge-primary` → `badge badge-primary`). Fungsionalitas identik.

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Panel Admin</title>

  <!-- DaisyUI + Tailwind CDN -->
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css"
        rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Custom overrides -->
  <link rel="stylesheet" href="css/style.css" />

  <!-- anime.js -->
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

  <!-- Toast container -->
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
            <input type="text" id="admin-id" placeholder="Contoh: P001"
                   class="input input-bordered input-sm w-full" />
          </label>
          <label class="form-control w-full">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN</span></div>
            <input type="password" id="admin-pin" placeholder="Min 6 digit"
                   class="input input-bordered input-sm w-full" />
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
        <p class="text-sm text-base-content/60 mb-3">
          Setup awal tidak memerlukan autentikasi. Hanya digunakan sekali.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <label class="form-control">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai</span></div>
            <input type="text" id="setup-id" placeholder="Contoh: P001"
                   class="input input-bordered input-sm" />
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

      <!-- Tab navigasi -->
      <div role="tablist" class="tabs tabs-boxed mb-4">
        <button role="tab" class="tab tab-active" data-tab="antrian">Kelola Antrian</button>
        <button role="tab" class="tab" data-tab="operasional">Operasional</button>
        <button role="tab" class="tab" data-tab="petugas">Manajemen Petugas</button>
        <button role="tab" class="tab" data-tab="log">Log Aktivitas</button>
      </div>

      <!-- Tab 1: Kelola Antrian -->
      <div id="tab-antrian" class="tab-content">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          <!-- Statistik Live -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Statistik Hari Ini</h3>
                <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
              </div>
              <div class="stats stats-vertical shadow-none bg-transparent -mx-2 mt-2">
                <div class="stat py-2">
                  <div class="stat-title text-xs">Total Booking</div>
                  <div class="stat-value text-2xl" id="adm-stat-bookings">—</div>
                </div>
                <div class="stat py-2">
                  <div class="stat-title text-xs">Dilayani</div>
                  <div class="stat-value text-2xl" id="adm-stat-served">—</div>
                </div>
                <div class="stat py-2">
                  <div class="stat-title text-xs">Dibatalkan</div>
                  <div class="stat-value text-2xl" id="adm-stat-cancelled">—</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Panggil Antrian -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Panggil Antrian</h3>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Pilih Layanan</span></div>
                <select id="adm-select-service-call" class="select select-bordered select-sm w-full">
                  <option value="">-- Pilih layanan --</option>
                </select>
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

          <!-- Check-In -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Check-In Warga</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Kode Booking</span></div>
                <input type="text" id="adm-booking-code"
                       placeholder="Masukkan kode booking"
                       class="input input-bordered input-sm w-full uppercase" />
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan</span></div>
                <select id="adm-select-service-checkin" class="select select-bordered select-sm w-full">
                  <option value="">-- Pilih layanan --</option>
                </select>
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-checkin">✓ Check-In</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Operasional -->
      <div id="tab-operasional" class="tab-content hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          <!-- Pengumuman -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Kirim Pengumuman</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Layanan (kosong = semua)</span></div>
                <select id="adm-announce-service" class="select select-bordered select-sm w-full">
                  <option value="">-- Semua Layanan --</option>
                </select>
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Isi Pengumuman</span></div>
                <input type="text" id="adm-announce-msg"
                       placeholder="Pesan pengumuman..."
                       class="input input-bordered input-sm w-full" />
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-announce">📢 Kirim</button>
            </div>
          </div>

          <!-- Walk-In -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Walk-In (Daftar Langsung)</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">NIK Warga</span></div>
                <input type="text" id="adm-walkin-nik" maxlength="16"
                       placeholder="16 digit NIK"
                       class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan</span></div>
                <select id="adm-walkin-service" class="select select-bordered select-sm w-full">
                  <option value="">-- Pilih layanan --</option>
                </select>
              </label>
              <button class="btn btn-primary btn-sm w-full" id="btn-walkin">➕ Daftarkan Walk-In</button>
            </div>
          </div>

          <!-- Reset Quota -->
          <div class="card bg-base-100 shadow-sm border border-error/20">
            <div class="card-body">
              <h3 class="font-semibold mb-3 text-error">Reset Quota Harian</h3>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs">Layanan (kosong = semua)</span></div>
                <select id="adm-reset-service" class="select select-bordered select-sm w-full">
                  <option value="">-- Semua Layanan --</option>
                </select>
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

          <!-- Tabel petugas -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold">Daftar Petugas</h3>
                <button class="btn btn-ghost btn-xs" id="btn-refresh-officers">↻ Refresh</button>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-sm">
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
                    <tr><td colspan="5" class="text-center text-base-content/40 py-6">Memuat data...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Form tambah petugas -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold mb-1">Tambah Petugas Baru</h3>
              <p class="text-xs text-base-content/50 mb-3">Memerlukan PIN Anda untuk konfirmasi.</p>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">PIN Anda (konfirmasi)</span></div>
                <input type="password" id="officer-req-pin"
                       class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">ID Pegawai Baru</span></div>
                <input type="text" id="new-officer-id" placeholder="P002"
                       class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Nama Lengkap</span></div>
                <input type="text" id="new-officer-nama" class="input input-bordered input-sm w-full" />
              </label>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs">Jabatan</span></div>
                <input type="text" id="new-officer-jabatan" placeholder="Petugas Loket"
                       class="input input-bordered input-sm w-full" />
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

**File: `frontend/js/admin.js`** — **Tidak berubah dari v2**

*(Salin langsung dari IMPLEMENTATION_GUIDE_v2.md §5.9. Satu-satunya update minor: dalam `officersList` handler, ubah badge class dari `badge-${o.role === 'ADMIN' ? 'primary' : 'secondary'}` menjadi `badge ${o.role === 'ADMIN' ? 'badge-primary' : 'badge-info'}` agar sesuai class DaisyUI yang valid.)*

---

## 6. Protokol Pesan WebSocket

*(Tidak berubah dari v2 — lihat IMPLEMENTATION_GUIDE_v2.md §6)*

---

## 7. Mapping Fitur Tugas ke Implementasi

*(Tidak berubah dari v2 — lihat IMPLEMENTATION_GUIDE_v2.md §7)*

Catatan tambahan v3: **ApexCharts** pada grafik Komponen 2 memberikan animasi update yang terlihat lebih "live" saat data berubah — bar meluncur ke nilai baru daripada langsung berubah. Ini meningkatkan kesan event-driven yang diminta Fitur Wajib 2.

---

## 8. Cara Menjalankan Sistem Lengkap

### Urutan Start (sama dengan v2)

```bash
# Terminal 1 — gRPC server
cd SiAntre
npm run server

# Terminal 2 — WebSocket Gateway
cd SiAntre/gateway
npm install   # Pertama kali saja
node index.js

# Browser
# Warga: http://localhost:3001/index.html
# Admin: http://localhost:3001/admin.html
```

### Catatan CDN

Semua library FE dimuat via CDN dan **membutuhkan koneksi internet saat pertama load**. Jika demo di lingkungan tanpa internet, download dulu:

```bash
mkdir -p frontend/js/lib

# DaisyUI
curl -o frontend/css/daisyui.min.css \
  https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css

# ApexCharts
curl -o frontend/js/lib/apexcharts.min.js \
  https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js

# anime.js
curl -o frontend/js/lib/anime.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js

# Tailwind (untuk DaisyUI utility classes)
curl -o frontend/js/lib/tailwind.js \
  https://cdn.tailwindcss.com/3.4.0/tailwind.min.js
```

Kemudian ubah semua link CDN di HTML menjadi path lokal (`js/lib/...`).

> **Tailwind CDN vs Compiler:** DaisyUI via CDN membutuhkan Tailwind CDN Play (bukan Tailwind compiler). Kelas Tailwind yang digunakan harus tersedia di browser stylesheet — Tailwind CDN Play memindai DOM dan menggenerate CSS yang dibutuhkan secara otomatis.

---

## 9. Troubleshooting

### Tambahan Troubleshooting v3

#### WebSocket masih pakai `ws://` padahal halaman di HTTPS

**Penyebab:** `ws-client.js` versi v2 hardcode `ws://`. Browser HTTPS akan memblok koneksi ini sebagai mixed content.

**Solusi (sudah ada di v3):** Pastikan menggunakan ws-client.js v3 yang memiliki auto-detection:
```javascript
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}`;
```

---

#### Client terus-menerus reconnect meski server sengaja menutup koneksi

**Penyebab:** `onclose` versi v2 selalu memanggil `scheduleReconnect()` tanpa membaca `CloseEvent.code`.

**Solusi (sudah ada di v3):** ws-client.js v3 membaca `event.code`:
```javascript
ws.addEventListener('close', (event) => {
  if (event.code !== 1000 && event.code !== 1001) {
    scheduleReconnect();
  }
});
```

---

#### anime.js tidak ditemukan (`anime is not defined`)

**Penyebab:** Script CDN anime.js gagal dimuat, atau urutan script salah.

**Solusi:** Pastikan `<script src="anime.min.js">` ada di `<head>` *sebelum* file JavaScript lainnya. Periksa di DevTools Network tab apakah CDN berhasil dimuat (status 200).

---

#### ApexCharts tidak muncul / container kosong

**Penyebab:** `chart.js` dieksekusi sebelum DOM siap, atau `document.getElementById('queue-chart')` mengembalikan null.

**Solusi:** Pastikan `initChart()` dipanggil di dalam `DOMContentLoaded`. Periksa bahwa `<div id="queue-chart">` ada di HTML dan tidak di-hide dengan `display:none` (gunakan `visibility:hidden` atau `opacity:0` jika perlu tersembunyi tapi tetap punya dimensi).

---

#### Suara `YOUR_TURN` tidak berbunyi

**Penyebab:** Browser policy melarang `AudioContext` dibuat sebelum ada user gesture (klik/tap). Jika warga belum pernah mengklik apapun sebelum notifikasi datang, suara tidak bisa diputar.

**Solusi:** Ini adalah browser security policy yang tidak bisa diabaikan. `notification.js` v3 sudah menangani ini dengan `document.addEventListener('click', getAudioContext, { once: true })` — suara akan berfungsi setelah user pertama kali mengklik di halaman. Saat demo, pastikan user sudah berinteraksi dengan halaman sebelum memicu `YOUR_TURN`.

---

*(Semua troubleshooting v2 tetap berlaku — lihat IMPLEMENTATION_GUIDE_v2.md §9)*

---

## 10. Referensi & Dependensi

### Dependensi Gateway (`gateway/package.json`) — Tidak berubah dari v2

| Package | Versi | Fungsi |
|---------|-------|--------|
| `ws` | ^8.16.0 | WebSocket server library |
| `express` | ^4.18.0 | HTTP server & static file serving |
| `cors` | ^2.8.5 | Header CORS |
| `@grpc/grpc-js` | ^1.10.0 | gRPC client |
| `@grpc/proto-loader` | ^0.7.0 | Parser file `.proto` |

### Dependensi Frontend (CDN) — **Diperbarui di v3**

| Library | Versi | URL CDN | Fungsi |
|---------|-------|---------|--------|
| **DaisyUI** | 4.12.10 | `cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css` | Base styling — menggantikan seluruh `style.css` custom |
| **Tailwind** | Latest CDN Play | `cdn.tailwindcss.com` | Required untuk DaisyUI utility classes (tanpa build step) |
| **anime.js** | 3.2.2 | `cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js` | Mikro-animasi: flip nomor antrian + spring toast YOUR_TURN |
| **ApexCharts** | 3.54.0 | `cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js` | Grafik realtime — menggantikan Chart.js |
| **Web Audio API** | — | *Bawaan browser, tidak perlu CDN* | Notifikasi suara YOUR_TURN |

> ~~**Chart.js** 4.4.0~~ → Digantikan ApexCharts di v3.

### Port yang Digunakan

| Port | Komponen | Keterangan |
|------|----------|------------|
| `50051` | gRPC Server | Tidak berubah |
| `3001` | WebSocket Gateway | HTTP + WebSocket |

### Ringkasan Semua Perubahan (v2 → v3)

| # | Area | Perubahan | File |
|---|------|-----------|------|
| M1 | MDN WebSocket | Magic number → `WebSocket.OPEN` / `WS_OPEN` | `ws-client.js`, `commandHandler.js` |
| M2 | MDN WebSocket | `CloseEvent` dibaca — reconnect selektif per close code | `ws-client.js` |
| M3 | MDN WebSocket | `wss://` auto-detect dari `window.location.protocol` | `ws-client.js` |
| M4 | MDN WebSocket | `addEventListener` pattern menggantikan `oneventname` | `ws-client.js` |
| M5 | MDN WebSocket | `bufferedAmount` dicek sebelum `send()` | `ws-client.js` |
| M6 | MDN WebSocket | `beforeunload` menutup koneksi bersih (bfcache fix) + `visibilitychange` pause | `ws-client.js` |
| FE1 | Stack FE | DaisyUI via CDN menggantikan custom CSS | `index.html`, `admin.html`, `style.css` |
| FE2 | Stack FE | anime.js: flip angka antrian + spring toast YOUR_TURN | `queue-animation.js`, `notification.js` |
| FE3 | Stack FE | ApexCharts menggantikan Chart.js | `chart.js` |
| FE4 | Stack FE | Web Audio API: suara notifikasi bawaan browser | `notification.js` |

### Referensi Dokumentasi

- [WebSocket API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) *(panduan utama v3)*
- [CloseEvent — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent)
- [Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [DaisyUI Components](https://daisyui.com/components/)
- [anime.js Documentation](https://animejs.com/documentation/)
- [ApexCharts — Bar Chart](https://apexcharts.com/javascript-chart-demos/bar-charts/)
- [ws library — npm](https://www.npmjs.com/package/ws)
- [gRPC Node.js — @grpc/grpc-js](https://www.npmjs.com/package/@grpc/grpc-js)

---

*Dokumen ini adalah revisi v3 dari SiAntre WebSocket Implementation Guide. Semua perbaikan MDN (M1–M3) **wajib** diimplementasikan. Perbaikan M4–M6 dan seluruh pembaruan stack FE meningkatkan kualitas dan kesan demo secara signifikan. Gateway tidak perlu disentuh kecuali satu baris di `commandHandler.js` (perbaikan M1).*
