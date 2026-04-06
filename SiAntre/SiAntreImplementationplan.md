# SiAntre — Implementation Plan
### Sistem Antrian Layanan Publik Digital via gRPC

---

## Daftar Isi

1. [Gambaran Sistem](#1-gambaran-sistem)
2. [Tech Stack](#2-tech-stack)
3. [Struktur Proyek](#3-struktur-proyek)
4. [Protocol Buffer — Definisi Lengkap](#4-protocol-buffer--definisi-lengkap)
5. [Arsitektur & Design Services](#5-arsitektur--design-services)
6. [In-Memory State](#6-in-memory-state)
7. [Mekanisme Streaming & Broadcast](#7-mekanisme-streaming--broadcast)
8. [Error Handling](#8-error-handling)
9. [Alur Penggunaan](#9-alur-penggunaan)
10. [Langkah Implementasi](#10-langkah-implementasi)

---

## 1. Gambaran Sistem

**SiAntre** (_Sistem Antrian Elektronik_) mensimulasikan platform antrian digital untuk layanan pemerintahan. Warga dapat memesan slot waktu dari rumah, mengonfirmasi kedatangan, dan memantau posisi antrian secara real-time tanpa perlu antre fisik.

Sistem mengelola tiga layanan paralel: **SAMSAT (SIM)**, **Disdukcapil (KTP)**, dan **Imigrasi (Paspor)** — masing-masing dengan kuota harian dan antrian independen.

### Pemenuhan Syarat Tugas

| Syarat | Implementasi |
|--------|-------------|
| Unary gRPC | `ListServices`, `CreateBooking`, `ConfirmArrival`, `CancelBooking`, `GetMyBooking`, `CallNext`, `GetQueueStatus`, `ResetDailyQuota`, `BroadcastAnnouncement`, `GetSystemStats` |
| Streaming gRPC | Server-side: `WatchQueue` — Bi-directional: `AdminSession` |
| Error Handling | 11 error code, mapping ke gRPC status codes standar |
| In-memory State | 4-layer state: services, slots, bookings, queues |
| Multi Client | N client simultan via goroutine/stream per koneksi |
| Minimal 3 Services | 4 services: `ServiceInfoService`, `BookingService`, `QueueService`, `AdminService` |

---

## 2. Tech Stack

### Runtime & Framework

| Komponen | Pilihan | Keterangan |
|----------|---------|-----------|
| Runtime | **Node.js v20+** | LTS, native ES Modules |
| gRPC library | **`@grpc/grpc-js`** | Library gRPC resmi untuk Node.js |
| Proto loader | **`@grpc/proto-loader`** | Load `.proto` langsung saat runtime |
| ID generation | **`uuid`** | Generate booking ID, slot ID |
| CLI warna | **`chalk`** | Warna output terminal (YOUR_TURN, error, dll.) |
| CLI interaktif | **`readline`** (stdlib) | Menu interaktif tanpa dependency tambahan |

### Dev Tools

| Tool | Fungsi |
|------|--------|
| `nodemon` | Auto-restart server saat file berubah |
| `grpcurl` | Test RPC dari terminal tanpa perlu tulis client |

### Tidak Diperlukan
- TypeScript — tidak perlu untuk skala proyek ini
- Database — in-memory sudah cukup, state di-seed ulang tiap server start
- Framework HTTP — gRPC berjalan di atas HTTP/2 sendiri via `@grpc/grpc-js`

### `package.json` Scripts

```json
{
  "scripts": {
    "server": "nodemon server/index.js",
    "citizen": "node client/citizen.js",
    "admin": "node client/admin.js"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.10.0",
    "@grpc/proto-loader": "^0.7.0",
    "chalk": "^5.3.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## 3. Struktur Proyek

```
siantre/
│
├── proto/                        # Semua definisi .proto
│   ├── service_info.proto
│   ├── booking.proto
│   ├── queue.proto
│   └── admin.proto
│
├── server/
│   ├── index.js                  # Entry point — init server, register semua service
│   │
│   ├── state/
│   │   ├── index.js              # Export satu store instance (singleton)
│   │   ├── serviceStore.js       # State: daftar layanan & kuota
│   │   ├── slotStore.js          # State: slot waktu per layanan per tanggal
│   │   ├── bookingStore.js       # State: booking warga
│   │   └── queueStore.js         # State: antrian aktif & daftar subscriber
│   │
│   ├── services/
│   │   ├── serviceInfoService.js # Implementasi ServiceInfoService
│   │   ├── bookingService.js     # Implementasi BookingService
│   │   ├── queueService.js       # Implementasi QueueService (+ streaming)
│   │   └── adminService.js       # Implementasi AdminService (+ BiDi stream)
│   │
│   └── helpers/
│       ├── seed.js               # Seed data awal saat server start
│       ├── errors.js             # Factory function untuk semua gRPC error
│       └── broadcast.js          # Utilitas broadcast ke semua subscriber
│
├── client/
│   ├── citizen.js                # CLI interaktif untuk warga
│   └── admin.js                  # CLI interaktif untuk petugas
│
├── package.json
└── README.md
```

### Pola Singleton Store

Seluruh services mengakses state via satu instance yang sama:

```js
// server/state/index.js
const serviceStore = require('./serviceStore');
const slotStore    = require('./slotStore');
const bookingStore = require('./bookingStore');
const queueStore   = require('./queueStore');

module.exports = { serviceStore, slotStore, bookingStore, queueStore };
```

```js
// Di dalam service, misalnya bookingService.js
const { slotStore, bookingStore, queueStore } = require('../state');
```

---

## 4. Protocol Buffer — Definisi Lengkap

### 4.1 `proto/service_info.proto`

```proto
syntax = "proto3";
package siantre;

service ServiceInfoService {
  rpc ListServices      (ListServicesRequest)      returns (ListServicesResponse);
  rpc GetServiceDetail  (GetServiceDetailRequest)  returns (GetServiceDetailResponse);
  rpc GetAvailableSlots (GetAvailableSlotsRequest) returns (GetAvailableSlotsResponse);
}

message ListServicesRequest {}

message ListServicesResponse {
  repeated ServiceDefinition services = 1;
  string server_time = 2;
}

message GetServiceDetailRequest {
  string service_id = 1;
}

message GetServiceDetailResponse {
  ServiceDefinition service      = 1;
  int32  quota_remaining_today   = 2;
  bool   is_open_now             = 3;
}

message GetAvailableSlotsRequest {
  string service_id = 1;
  string date       = 2;  // format: "YYYY-MM-DD", kosong = hari ini
}

message GetAvailableSlotsResponse {
  string service_id        = 1;
  string date              = 2;
  repeated SlotInfo slots  = 3;
  int32  total_available   = 4;
}

// ── Shared messages ──────────────────────────────────────────────

message ServiceDefinition {
  string   service_id               = 1;
  string   name                     = 2;
  string   short_code               = 3;  // "SIM", "KTP", "PSP"
  int32    daily_quota              = 4;
  string   open_hour                = 5;  // "08:00"
  string   close_hour               = 6;  // "14:00"
  string   location                 = 7;
  repeated string requirements      = 8;
  bool     is_open                  = 9;
}

message SlotInfo {
  string slot_id    = 1;
  string service_id = 2;
  string date       = 3;
  string time       = 4;  // "09:00", "09:30", dst.
  string status     = 5;  // "AVAILABLE" | "BOOKED" | "DONE"
}
```

### 4.2 `proto/booking.proto`

```proto
syntax = "proto3";
package siantre;

service BookingService {
  rpc CreateBooking     (CreateBookingRequest)     returns (CreateBookingResponse);
  rpc ConfirmArrival    (ConfirmArrivalRequest)    returns (ConfirmArrivalResponse);
  rpc CancelBooking     (CancelBookingRequest)     returns (CancelBookingResponse);
  rpc GetMyBooking      (GetMyBookingRequest)      returns (GetMyBookingResponse);
  rpc RescheduleBooking (RescheduleBookingRequest) returns (RescheduleBookingResponse);
  rpc JoinWaitlist      (JoinWaitlistRequest)      returns (JoinWaitlistResponse);
}

message CreateBookingRequest {
  string citizen_id   = 1;
  string citizen_name = 2;
  string service_id   = 3;
  string slot_id      = 4;
}

message CreateBookingResponse {
  string booking_id   = 1;
  string booking_code = 2;  // kode pendek, misal "SIM-A3F7"
  SlotInfo slot       = 3;
  string status       = 4;  // "BOOKED"
  string message      = 5;
}

message ConfirmArrivalRequest {
  string booking_id = 1;
  string citizen_id = 2;
}

message ConfirmArrivalResponse {
  int32  queue_number   = 1;
  int32  people_ahead   = 2;
  string estimated_wait = 3;  // "± 20 menit"
  string status         = 4;  // "ARRIVED"
  string message        = 5;
}

message CancelBookingRequest {
  string booking_id = 1;
  string citizen_id = 2;
  string reason     = 3;
}

message CancelBookingResponse {
  bool   success = 1;
  string message = 2;
}

message GetMyBookingRequest {
  string citizen_id = 1;
  string booking_id = 2;  // opsional: kosong = ambil semua booking citizen ini
}

message GetMyBookingResponse {
  repeated BookingDetail bookings = 1;
}

message BookingDetail {
  string booking_id   = 1;
  string booking_code = 2;
  string service_name = 3;
  string slot_time    = 4;
  string slot_date    = 5;
  string status       = 6;
  int32  queue_number = 7;  // terisi setelah ConfirmArrival
  string created_at   = 8;
}

message RescheduleBookingRequest {
  string booking_id  = 1;
  string citizen_id  = 2;
  string new_slot_id = 3;
}

message RescheduleBookingResponse {
  bool     success  = 1;
  SlotInfo new_slot = 2;
  string   message  = 3;
}

message JoinWaitlistRequest {
  string citizen_id   = 1;
  string citizen_name = 2;
  string service_id   = 3;
  string date         = 4;
}

message JoinWaitlistResponse {
  string waitlist_id = 1;
  int32  position    = 2;
  string message     = 3;
}
```

### 4.3 `proto/queue.proto`

```proto
syntax = "proto3";
package siantre;

service QueueService {
  rpc WatchQueue      (WatchQueueRequest)      returns (stream QueueUpdate);  // Server-side stream
  rpc GetQueueStatus  (GetQueueStatusRequest)  returns (GetQueueStatusResponse);
  rpc CallNext        (CallNextRequest)        returns (CallNextResponse);
  rpc SkipNumber      (SkipNumberRequest)      returns (SkipNumberResponse);
  rpc CompleteService (CompleteServiceRequest) returns (CompleteServiceResponse);
}

message WatchQueueRequest {
  string service_id      = 1;
  string citizen_id      = 2;
  int32  my_queue_number = 3;  // 0 jika belum ConfirmArrival
}

message QueueUpdate {
  string event_type      = 1;  // Lihat enum di bawah
  string service_id      = 2;
  int32  current_number  = 3;
  int32  your_number     = 4;
  int32  people_ahead    = 5;
  int32  total_waiting   = 6;
  string estimated_wait  = 7;
  int32  quota_remaining = 8;
  string message         = 9;
  string timestamp       = 10;
}

// Nilai event_type yang mungkin:
// "QUEUE_MOVED"       — nomor berikutnya dipanggil
// "YOUR_TURN"         — khusus subscriber yang nomornya dipanggil
// "QUOTA_EXHAUSTED"   — kuota hari ini habis
// "QUOTA_OPENED"      — kuota hari baru dibuka (setelah reset)
// "SERVICE_CLOSED"    — layanan ditutup sementara
// "WAITLIST_NOTIFIED" — slot tersedia dari pembatalan
// "ANNOUNCEMENT"      — pesan broadcast dari admin

message GetQueueStatusRequest {
  string service_id = 1;
}

message GetQueueStatusResponse {
  string service_id        = 1;
  int32  current_number    = 2;
  int32  total_waiting     = 3;
  int32  quota_remaining   = 4;
  bool   is_open           = 5;
  repeated int32 waiting_numbers = 6;
}

message CallNextRequest {
  string service_id = 1;
  string officer_id = 2;
}

message CallNextResponse {
  int32  called_number = 1;
  int32  total_waiting = 2;
  string message       = 3;
}

message SkipNumberRequest {
  string service_id = 1;
  string officer_id = 2;
  int32  number     = 3;
  string reason     = 4;
}

message SkipNumberResponse {
  bool   success = 1;
  string message = 2;
}

message CompleteServiceRequest {
  string service_id = 1;
  string officer_id = 2;
}

message CompleteServiceResponse {
  bool   success       = 1;
  int32  served_number = 2;
  string message       = 3;
}
```

### 4.4 `proto/admin.proto`

```proto
syntax = "proto3";
package siantre;

service AdminService {
  rpc AdminSession          (stream AdminCommand)      returns (stream AdminEvent);  // BiDi stream
  rpc ResetDailyQuota       (ResetQuotaRequest)        returns (ResetQuotaResponse);
  rpc GetSystemStats        (GetSystemStatsRequest)    returns (GetSystemStatsResponse);
  rpc BroadcastAnnouncement (AnnouncementRequest)      returns (AnnouncementResponse);
  rpc SetServiceStatus      (SetServiceStatusRequest)  returns (SetServiceStatusResponse);
}

// ── AdminSession (Bi-directional) ─────────────────────────────────

message AdminCommand {
  string command_type = 1;  // "CALL_NEXT" | "SKIP_NUMBER" | "ANNOUNCE" | "PAUSE" | "RESUME" | "GET_STATS"
  string service_id   = 2;
  string officer_id   = 3;
  string payload      = 4;  // JSON string untuk data tambahan (misal: alasan skip)
}

message AdminEvent {
  string event_type = 1;  // "QUEUE_UPDATE" | "STATS_SNAPSHOT" | "ACK" | "ERROR"
  string service_id = 2;
  string payload    = 3;  // JSON string respons
  string timestamp  = 4;
}

// ── Unary RPCs ─────────────────────────────────────────────────────

message ResetQuotaRequest {
  string service_id = 1;  // kosong = reset semua layanan
}

message ResetQuotaResponse {
  bool   success        = 1;
  int32  services_reset = 2;
  string message        = 3;
}

message GetSystemStatsRequest {}

message GetSystemStatsResponse {
  int32  total_bookings_today  = 1;
  int32  total_served_today    = 2;
  int32  total_cancelled_today = 3;
  int32  active_subscribers    = 4;
  repeated ServiceStats per_service = 5;
}

message ServiceStats {
  string service_id        = 1;
  string service_name      = 2;
  int32  quota_total       = 3;
  int32  quota_used        = 4;
  int32  quota_remaining   = 5;
  int32  currently_serving = 6;
  int32  waiting_count     = 7;
  bool   is_open           = 8;
}

message AnnouncementRequest {
  string service_id = 1;  // kosong = broadcast ke semua layanan
  string message    = 2;
  bool   is_urgent  = 3;
}

message AnnouncementResponse {
  bool   success          = 1;
  int32  recipients_count = 2;
  string message          = 3;
}

message SetServiceStatusRequest {
  string service_id = 1;
  bool   is_open    = 2;
  string reason     = 3;
}

message SetServiceStatusResponse {
  bool   success = 1;
  string message = 2;
}
```

---

## 5. Arsitektur & Design Services

### 5.1 Gambaran Arsitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ citizen.js  │  │ citizen.js  │  │ citizen.js  │  . . .     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│                                                                 │
│               ┌───────────────────────┐                        │
│               │      admin.js         │                        │
│               └───────────┬───────────┘                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │  gRPC (HTTP/2)
┌───────────────────────────▼─────────────────────────────────────┐
│                        SERVER LAYER                             │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │ ServiceInfoSvc   │  │           BookingService            │ │
│  │────────────────  │  │─────────────────────────────────────│ │
│  │ ListServices     │  │ CreateBooking  · ConfirmArrival      │ │
│  │ GetServiceDetail │  │ CancelBooking  · GetMyBooking        │ │
│  │ GetAvailableSlots│  │ RescheduleBooking · JoinWaitlist     │ │
│  └──────────────────┘  └─────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │  QueueService    │  │           AdminService              │ │
│  │────────────────  │  │─────────────────────────────────────│ │
│  │ WatchQueue ◄─────┼──┤ AdminSession (BiDi stream)          │ │
│  │  (SS-stream)     │  │ ResetDailyQuota · GetSystemStats    │ │
│  │ GetQueueStatus   │  │ BroadcastAnnouncement               │ │
│  │ CallNext         │  │ SetServiceStatus                    │ │
│  │ SkipNumber       │  └─────────────────────────────────────┘ │
│  └──────────────────┘                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  In-Memory State                        │   │
│  │   serviceStore · slotStore · bookingStore · queueStore  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Tanggung Jawab Tiap Service

#### `ServiceInfoService`
Hanya membaca state, tidak pernah memodifikasi. Semua RPC bersifat Unary.

- `ListServices` — kembalikan semua `ServiceDefinition` beserta `quota_remaining` hari ini
- `GetServiceDetail` — detail satu layanan, termasuk apakah saat ini sedang buka
- `GetAvailableSlots` — daftar slot dengan status `AVAILABLE` untuk layanan dan tanggal tertentu

#### `BookingService`
Satu-satunya service yang **memodifikasi state booking dan slot**. Setiap operasi write harus berjalan secara synchronous (tanpa `await` di tengah operasi read-then-write) untuk menghindari interleaving di Node.js.

- `CreateBooking` — validasi slot tersedia + kuota ada → tulis booking → kurangi quota
- `ConfirmArrival` — validasi status booking `BOOKED` → assign nomor antrian → masukkan ke waiting list
- `CancelBooking` — kembalikan slot ke pool → cek waitlist → auto-assign jika ada
- `GetMyBooking` — baca semua booking milik `citizen_id` tertentu
- `RescheduleBooking` — lepas slot lama, ambil slot baru, update booking
- `JoinWaitlist` — tambah ke antrian tunggu jika kuota habis

#### `QueueService`
Mengelola antrian aktif hari pelayanan. Inti dari demonstrasi streaming.

- `WatchQueue` — **Server-side Streaming**: daftarkan client sebagai subscriber, kirim snapshot awal, lalu terus push setiap ada perubahan
- `GetQueueStatus` — snapshot antrian saat ini (Unary, untuk client yang baru join tanpa stream)
- `CallNext` — panggil nomor berikutnya → **broadcast** ke semua subscriber layanan itu
- `SkipNumber` — tandai nomor sebagai no-show, hapus dari waiting list
- `CompleteService` — tandai nomor saat ini selesai dilayani

#### `AdminService`
Panel kontrol petugas. Sebagian besar operasi sama dengan `QueueService.CallNext` dll., tapi dikemas dalam sesi interaktif.

- `AdminSession` — **Bi-directional Streaming**: admin kirim command, server respons dengan event. Satu sesi bisa berisi banyak command tanpa reconnect
- `ResetDailyQuota` — reset quota semua (atau satu) layanan → broadcast `QUOTA_OPENED`
- `GetSystemStats` — statistik keseluruhan sistem hari ini
- `BroadcastAnnouncement` — kirim pesan ke semua subscriber layanan tertentu (atau semua layanan)
- `SetServiceStatus` — pause/resume layanan → broadcast `SERVICE_CLOSED` atau `SERVICE_RESUMED`

### 5.3 Inisialisasi Server

```js
// server/index.js
const grpc       = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path        = require('path');

const { seed } = require('./helpers/seed');

// Load semua proto
function loadProto(filename) {
  const def = protoLoader.loadSync(path.join(__dirname, '../proto', filename), {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
  });
  return grpc.loadPackageDefinition(def).siantre;
}

const serviceInfoProto = loadProto('service_info.proto');
const bookingProto     = loadProto('booking.proto');
const queueProto       = loadProto('queue.proto');
const adminProto       = loadProto('admin.proto');

// Import implementasi
const serviceInfoImpl = require('./services/serviceInfoService');
const bookingImpl     = require('./services/bookingService');
const queueImpl       = require('./services/queueService');
const adminImpl       = require('./services/adminService');

// Inisialisasi server
const server = new grpc.Server();

server.addService(serviceInfoProto.ServiceInfoService.service, serviceInfoImpl);
server.addService(bookingProto.BookingService.service,         bookingImpl);
server.addService(queueProto.QueueService.service,             queueImpl);
server.addService(adminProto.AdminService.service,             adminImpl);

// Seed data awal
seed();

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Server SiAntre berjalan di port ${port}`);
});
```

---

## 6. In-Memory State

### 6.1 Struktur Data

```js
// server/state/serviceStore.js
// Map<service_id, ServiceDefinition>
const services = new Map([
  ['SIM_BARU', {
    service_id:   'SIM_BARU',
    name:         'Pembuatan SIM Baru',
    short_code:   'SIM',
    daily_quota:  20,
    open_hour:    '08:00',
    close_hour:   '14:00',
    location:     'Gedung SAMSAT, Lantai 1, Loket 1-5',
    requirements: ['KTP Asli', 'Surat Keterangan Sehat', 'Formulir A-1'],
    is_open:      true,
  }],
  // KTP_BARU, PASPOR_BARU (sama strukturnya)
]);
```

```js
// server/state/slotStore.js
// Map<slot_id, Slot>
const slots = new Map();
// slot_id format: "SIM_BARU_2024-01-15_0900"

// Struktur tiap Slot:
// {
//   slot_id:    "SIM_BARU_2024-01-15_0900",
//   service_id: "SIM_BARU",
//   date:       "2024-01-15",
//   time:       "09:00",
//   status:     "AVAILABLE" | "BOOKED" | "DONE"
// }
```

```js
// server/state/bookingStore.js
// Map<booking_id, Booking>
const bookings = new Map();

// Reverse index: citizen_id → Set<booking_id>
const citizenIndex = new Map();

// Struktur tiap Booking:
// {
//   booking_id:   "uuid-...",
//   booking_code: "SIM-A3F7",
//   citizen_id:   "CITIZEN_001",
//   citizen_name: "Budi Santoso",
//   service_id:   "SIM_BARU",
//   slot_id:      "SIM_BARU_2024-01-15_0900",
//   queue_number: 0,           // diisi saat ConfirmArrival
//   status:       "BOOKED" | "ARRIVED" | "CALLED" | "DONE" | "CANCELLED" | "NO_SHOW",
//   created_at:   "2024-01-14T10:30:00.000Z"
// }
```

```js
// server/state/queueStore.js
// Map<service_id, QueueState>
const queues = new Map();

// Struktur tiap QueueState:
// {
//   service_id:       "SIM_BARU",
//   current_number:   0,          // nomor yang sedang dilayani (0 = belum mulai)
//   waiting_list:     [],         // array int, urut: [3, 5, 7, 12, ...]
//   quota_remaining:  20,
//   next_queue_number: 1,         // counter untuk assign nomor antrian berikutnya
//   subscribers:      []          // array objek {citizen_id, my_queue_number, call}
// }

// Waitlist: Map<"service_id:date", WaitlistEntry[]>
const waitlists = new Map();
// { waitlist_id, citizen_id, citizen_name, service_id, date, joined_at }
```

### 6.2 Pola Write yang Aman di Node.js

Node.js single-threaded, tapi tetap bisa terjadi interleaving jika ada `await` di antara operasi read dan write. Solusinya: lakukan semua operasi read-then-write dalam satu blok synchronous.

```js
// ❌ Berbahaya — ada jeda async di antara cek dan write
async function createBooking(req) {
  const slot = slotStore.get(req.slot_id);          // baca
  await someAsyncOperation();                        // jeda! request lain bisa masuk sini
  if (slot.status !== 'AVAILABLE') throw error;     // kondisi sudah bisa berubah
  slot.status = 'BOOKED';                           // write yang mungkin salah
}

// ✅ Aman — read dan write dalam satu synchronous block
function createBooking(req) {
  // Semua validasi dan write harus synchronous, tidak ada await di tengah
  const slot    = slotStore.get(req.slot_id);
  const queue   = queueStore.get(req.service_id);

  if (!slot)                         throw grpcError.NOT_FOUND('Slot tidak ditemukan');
  if (slot.status !== 'AVAILABLE')   throw grpcError.SLOT_NOT_AVAILABLE();
  if (queue.quota_remaining <= 0)    throw grpcError.QUOTA_EXHAUSTED(req.service_id);

  // Mutasi state — semua synchronous
  slot.status = 'BOOKED';
  queue.quota_remaining--;

  const booking = {
    booking_id:   uuidv4(),
    booking_code: generateCode(req.service_id),
    citizen_id:   req.citizen_id,
    citizen_name: req.citizen_name,
    service_id:   req.service_id,
    slot_id:      req.slot_id,
    queue_number: 0,
    status:       'BOOKED',
    created_at:   new Date().toISOString(),
  };
  bookingStore.set(booking.booking_id, booking);

  // Side effect — broadcast jika quota habis
  if (queue.quota_remaining === 0) {
    broadcast(req.service_id, {
      event_type:      'QUOTA_EXHAUSTED',
      service_id:      req.service_id,
      quota_remaining: 0,
      message:         'Kuota hari ini telah habis.',
      timestamp:       new Date().toISOString(),
    });
  }

  return booking;
}
```

### 6.3 Seed Data

```js
// server/helpers/seed.js
function seed() {
  // Seed services
  const servicesData = [
    {
      service_id: 'SIM_BARU', name: 'Pembuatan SIM Baru',
      short_code: 'SIM', daily_quota: 20,
      open_hour: '08:00', close_hour: '14:00',
      location: 'Gedung SAMSAT, Lantai 1',
      requirements: ['KTP Asli', 'Surat Keterangan Sehat'],
    },
    {
      service_id: 'KTP_BARU', name: 'Perekaman KTP Elektronik',
      short_code: 'KTP', daily_quota: 30,
      open_hour: '08:00', close_hour: '15:00',
      location: 'Disdukcapil, Lantai 2',
      requirements: ['Surat Pengantar RT/RW', 'KK Asli'],
    },
    {
      service_id: 'PASPOR_BARU', name: 'Permohonan Paspor Baru',
      short_code: 'PSP', daily_quota: 15,
      open_hour: '08:00', close_hour: '12:00',
      location: 'Kantor Imigrasi, Gedung B',
      requirements: ['KTP Asli', 'KK Asli', 'Akta Lahir'],
    },
  ];

  for (const svc of servicesData) {
    serviceStore.set(svc.service_id, { ...svc, is_open: true });
    queueStore.set(svc.service_id, {
      service_id: svc.service_id,
      current_number: 0,
      waiting_list: [],
      quota_remaining: svc.daily_quota,
      next_queue_number: 1,
      subscribers: [],
    });
    // Generate slot waktu untuk hari ini (08:00–14:00 setiap 30 menit)
    generateSlots(svc.service_id, svc.open_hour, svc.close_hour, svc.daily_quota);
  }

  console.log('[Seed] Data awal berhasil dimuat.');
}
```

---

## 7. Mekanisme Streaming & Broadcast

### 7.1 Server-Side Streaming — `WatchQueue`

Setiap client yang memanggil `WatchQueue` akan mendapat objek `call` dari gRPC. Objek ini disimpan sebagai subscriber dan digunakan untuk push data.

```js
// server/services/queueService.js
function WatchQueue(call) {
  const { service_id, citizen_id, my_queue_number } = call.request;

  const queue = queueStore.get(service_id);
  if (!queue) {
    call.destroy(errors.notFound('Layanan tidak ditemukan'));
    return;
  }

  // 1. Kirim snapshot awal segera setelah subscribe
  call.write({
    event_type:      'QUEUE_MOVED',
    service_id,
    current_number:  queue.current_number,
    your_number:     my_queue_number,
    people_ahead:    countPeopleAhead(queue.waiting_list, my_queue_number),
    total_waiting:   queue.waiting_list.length,
    quota_remaining: queue.quota_remaining,
    message:         'Berhasil terhubung ke antrian.',
    timestamp:       new Date().toISOString(),
  });

  // 2. Daftarkan sebagai subscriber
  const subscriber = { citizen_id, my_queue_number, call };
  queue.subscribers.push(subscriber);

  // 3. Hapus dari subscribers saat koneksi putus
  call.on('cancelled', () => {
    queue.subscribers = queue.subscribers.filter(s => s.citizen_id !== citizen_id);
    console.log(`[Stream] ${citizen_id} disconnect dari ${service_id}`);
  });
}
```

### 7.2 Mekanisme Broadcast

Setiap kali `CallNext`, `SkipNumber`, `BroadcastAnnouncement`, atau `ResetDailyQuota` dipanggil, server iterasi semua subscriber dan kirim update yang dipersonalisasi.

```js
// server/helpers/broadcast.js
function broadcast(service_id, baseUpdate) {
  const queue = queueStore.get(service_id);
  if (!queue) return;

  let sentCount = 0;
  const deadSubscribers = [];

  for (const sub of queue.subscribers) {
    // Personalisasi: hitung people_ahead untuk tiap subscriber
    const people_ahead = countPeopleAhead(queue.waiting_list, sub.my_queue_number);

    // Tentukan apakah ini giliran subscriber ini
    const isYourTurn = (
      baseUpdate.event_type === 'QUEUE_MOVED' &&
      sub.my_queue_number > 0 &&
      sub.my_queue_number === queue.current_number
    );

    const update = {
      ...baseUpdate,
      your_number: sub.my_queue_number,
      people_ahead,
      event_type: isYourTurn ? 'YOUR_TURN' : baseUpdate.event_type,
      message:    isYourTurn
        ? `Giliran Anda! Silakan menuju loket sekarang.`
        : baseUpdate.message,
    };

    try {
      sub.call.write(update);
      sentCount++;
    } catch (err) {
      // Subscriber sudah disconnect tapi belum ter-cleanup
      deadSubscribers.push(sub.citizen_id);
    }
  }

  // Bersihkan subscriber yang sudah mati
  if (deadSubscribers.length > 0) {
    queue.subscribers = queue.subscribers.filter(
      s => !deadSubscribers.includes(s.citizen_id)
    );
  }

  return sentCount;
}

function countPeopleAhead(waiting_list, my_number) {
  if (!my_number || my_number === 0) return 0;
  const idx = waiting_list.indexOf(my_number);
  return idx === -1 ? 0 : idx; // posisi dalam array = jumlah orang di depan
}
```

### 7.3 Bi-Directional Streaming — `AdminSession`

```js
// server/services/adminService.js
function AdminSession(call) {
  console.log('[Admin] Sesi admin dibuka');

  call.on('data', (command) => {
    // Server menerima command dari admin, proses, kirim event balik
    const { command_type, service_id, officer_id, payload } = command;

    switch (command_type) {
      case 'CALL_NEXT': {
        const result = callNextLogic(service_id, officer_id); // fungsi yang sama dengan CallNext unary
        call.write({
          event_type: 'QUEUE_UPDATE',
          service_id,
          payload:    JSON.stringify(result),
          timestamp:  new Date().toISOString(),
        });
        break;
      }
      case 'GET_STATS': {
        const stats = buildSystemStats();
        call.write({
          event_type: 'STATS_SNAPSHOT',
          payload:    JSON.stringify(stats),
          timestamp:  new Date().toISOString(),
        });
        break;
      }
      case 'ANNOUNCE': {
        const data    = JSON.parse(payload || '{}');
        const count   = broadcast(service_id, {
          event_type: 'ANNOUNCEMENT',
          service_id,
          message:    data.message || '',
        });
        call.write({
          event_type: 'ACK',
          payload:    JSON.stringify({ recipients_count: count }),
          timestamp:  new Date().toISOString(),
        });
        break;
      }
      default:
        call.write({
          event_type: 'ERROR',
          payload:    JSON.stringify({ message: `Command tidak dikenal: ${command_type}` }),
          timestamp:  new Date().toISOString(),
        });
    }
  });

  call.on('end', () => {
    console.log('[Admin] Sesi admin ditutup');
    call.end();
  });
}
```

---

## 8. Error Handling

### 8.1 Mapping Error ke gRPC Status Code

```js
// server/helpers/errors.js
const grpc = require('@grpc/grpc-js');

const errors = {
  notFound:           (msg) => Object.assign(new Error(msg || 'Tidak ditemukan'),          { code: grpc.status.NOT_FOUND }),
  slotNotAvailable:   ()    => Object.assign(new Error('Slot sudah tidak tersedia. Pilih slot lain.'),  { code: grpc.status.RESOURCE_EXHAUSTED }),
  quotaExhausted:     ()    => Object.assign(new Error('Kuota hari ini habis. Coba hari berikutnya.'),  { code: grpc.status.RESOURCE_EXHAUSTED }),
  alreadyConfirmed:   ()    => Object.assign(new Error('Kedatangan sudah dikonfirmasi sebelumnya.'),    { code: grpc.status.FAILED_PRECONDITION }),
  bookingCancelled:   ()    => Object.assign(new Error('Booking ini sudah dibatalkan.'),                { code: grpc.status.FAILED_PRECONDITION }),
  bookingNotPending:  ()    => Object.assign(new Error('Booking tidak dalam status yang dapat diubah.'),{ code: grpc.status.FAILED_PRECONDITION }),
  queueEmpty:         ()    => Object.assign(new Error('Tidak ada nomor dalam antrian.'),               { code: grpc.status.FAILED_PRECONDITION }),
  serviceClosed:      ()    => Object.assign(new Error('Layanan sedang tutup.'),                        { code: grpc.status.FAILED_PRECONDITION }),
  permissionDenied:   ()    => Object.assign(new Error('Akses ditolak. Hanya petugas yang diizinkan.'),{ code: grpc.status.PERMISSION_DENIED }),
  invalidDate:        ()    => Object.assign(new Error('Tanggal tidak valid atau sudah lewat.'),        { code: grpc.status.INVALID_ARGUMENT }),
  alreadyInWaitlist:  ()    => Object.assign(new Error('Anda sudah terdaftar di waitlist ini.'),        { code: grpc.status.ALREADY_EXISTS }),
};

module.exports = errors;
```

### 8.2 Penggunaan di Service

```js
// Di dalam implementasi service
function ConfirmArrival(call, callback) {
  const { booking_id, citizen_id } = call.request;

  const booking = bookingStore.get(booking_id);
  if (!booking)                        return callback(errors.notFound('Booking tidak ditemukan'));
  if (booking.citizen_id !== citizen_id) return callback(errors.permissionDenied());
  if (booking.status === 'ARRIVED')    return callback(errors.alreadyConfirmed());
  if (booking.status === 'CANCELLED')  return callback(errors.bookingCancelled());
  if (booking.status === 'DONE')       return callback(errors.bookingNotPending());

  // Assign nomor antrian
  const queue = queueStore.get(booking.service_id);
  const queueNumber = queue.next_queue_number++;
  booking.queue_number = queueNumber;
  booking.status = 'ARRIVED';
  queue.waiting_list.push(queueNumber);

  const peopleAhead = queue.waiting_list.indexOf(queueNumber);

  callback(null, {
    queue_number:   queueNumber,
    people_ahead:   peopleAhead,
    estimated_wait: `± ${peopleAhead * 10} menit`,
    status:         'ARRIVED',
    message:        `Nomor antrian Anda: ${queueNumber}. Silakan tunggu panggilan.`,
  });
}
```

### 8.3 Penanganan Error di Client

```js
// Contoh di client/citizen.js
stub.CreateBooking(req, (err, response) => {
  if (err) {
    switch (err.code) {
      case grpc.status.RESOURCE_EXHAUSTED:
        console.log(chalk.red(`✗ ${err.message}`));
        break;
      case grpc.status.NOT_FOUND:
        console.log(chalk.yellow(`✗ Data tidak ditemukan: ${err.message}`));
        break;
      case grpc.status.FAILED_PRECONDITION:
        console.log(chalk.yellow(`⚠ ${err.message}`));
        break;
      case grpc.status.PERMISSION_DENIED:
        console.log(chalk.red(`✗ Akses ditolak: ${err.message}`));
        break;
      default:
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
    return;
  }
  console.log(chalk.green(`✓ Booking berhasil! Kode: ${response.booking_code}`));
});
```

---

## 9. Alur Penggunaan

### 9.1 Happy Path: Booking → Antrian → Dilayani

```
━━━━━━ H-1: FASE BOOKING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Warga Budi]                              [Server]

ListServices()              ──────────►   Baca serviceStore
                            ◄──────────   [{SIM, KTP, PSP}]

GetAvailableSlots("SIM")    ──────────►   Filter slot.status == AVAILABLE
                            ◄──────────   [{09:00, AVAILABLE}, {09:30, AVAILABLE}, ...]

CreateBooking("SIM", slot_0930) ────────►
                                          slot.status = 'BOOKED'
                                          queue.quota_remaining: 20 → 19
                            ◄──────────   { booking_id, booking_code: "SIM-F3A9" }

━━━━━━ Hari H: FASE KEDATANGAN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ConfirmArrival("BK-001")    ──────────►
                                          booking.status: BOOKED → ARRIVED
                                          queue_number = 5 (next_queue_number++)
                                          waiting_list: [3, 4, 5]
                            ◄──────────   { queue_number: 5, people_ahead: 2, est: "±20 menit" }

━━━━━━ Hari H: FASE ANTRIAN REAL-TIME ━━━━━━━━━━━━━━━━━━━━━━━━━━━

WatchQueue("SIM", my_number=5) ─────────►
                                          subscriber terdaftar di queue.subscribers
                            ◄──────────   [snapshot] QUEUE_MOVED, current=3, ahead=2

[Warga Ani & Cici juga WatchQueue("SIM") — 3 subscriber aktif]

[Petugas] CallNext("SIM")   ──────────►
                                          current_number: 3 → 4
                                          broadcast ke 3 subscriber:
Budi ◄─────────────────────────────────   QUEUE_MOVED, current=4, ahead=1, est="±10 menit"
Ani  ◄─────────────────────────────────   QUEUE_MOVED, current=4
Cici ◄─────────────────────────────────   QUEUE_MOVED, current=4

[Petugas] CallNext("SIM")   ──────────►
                                          current_number: 4 → 5
                                          broadcast ke 3 subscriber:
Budi ◄─────────────────────────────────   YOUR_TURN, "Silakan menuju loket!"
Ani  ◄─────────────────────────────────   QUEUE_MOVED, current=5
Cici ◄─────────────────────────────────   QUEUE_MOVED, current=5

[Budi pergi ke loket, stream disconnect — dihapus dari subscribers]
```

### 9.2 Skenario: Race Condition Booking

```
[Warga X]                [Server]              [Warga Y]

GetAvailableSlots ──────►                ◄───── GetAvailableSlots
◄── [SLOT_0930: AVAILABLE]               [SLOT_0930: AVAILABLE] ──►

(Keduanya melihat slot yang sama tersedia)

CreateBooking(SLOT_0930) ──►
                             Cek slot → AVAILABLE ✓ (synchronous)
                             slot.status = 'BOOKED'
◄── booking_id="BK-002" ────

                        ◄─── CreateBooking(SLOT_0930)
                             Cek slot → BOOKED ✗
                             ──────────────────────────────► Error: SLOT_NOT_AVAILABLE
                                                             "Slot sudah tidak tersedia.
                                                              Pilih slot lain."
```

### 9.3 Skenario: Kuota Habis → Waitlist → Auto-Assign

```
Server: quota_remaining = 1

[Warga A] CreateBooking ──────►   quota: 1 → 0
                                  broadcast QUOTA_EXHAUSTED ke semua subscriber
[Warga B] ◄───────────────────    QUOTA_EXHAUSTED (tanpa refresh!)

[Warga B] JoinWaitlist("SIM") ──► waitlists["SIM:today"].push(WarnaB)
◄── { waitlist_id, position: 1 }

[Warga A] CancelBooking ──────►   slot.status = 'AVAILABLE', quota: 0 → 1
                                  Cek waitlist → ada Warga B!
                                  Auto-assign slot ke Warga B
                                  broadcast WAITLIST_NOTIFIED ke Warga B
[Warga B] ◄───────────────────    WAITLIST_NOTIFIED, "Slot tersedia! Segera booking."
```

### 9.4 Skenario: Admin Session (Bi-Directional)

```
[Admin]                              [Server]

AdminSession() ─────────────────►   [Buka koneksi BiDi]

──[GET_STATS]──────────────────────►
◄──[STATS_SNAPSHOT: SIM 18/20 ...]───

──[CALL_NEXT, service=SIM]─────────►
                                     CallNext logic + broadcast
◄──[QUEUE_UPDATE, current=8, wait=4]─

──[ANNOUNCE, "Tutup pukul 13:00"]──►
                                     broadcast ANNOUNCEMENT ke 12 subscriber
◄──[ACK, recipients=12]──────────────

[Admin tutup program → stream end]
```

---

## 10. Langkah Implementasi

Implementasi dilakukan secara bertahap dari fondasi ke fitur paling kompleks. Setiap tahap menghasilkan sesuatu yang bisa dijalankan dan diuji.

### Tahap 1 — Fondasi

Tujuan: server bisa jalan, semua proto terdefinisi, state seed berhasil.

- Setup project (`npm init`, install dependencies)
- Tulis semua 4 file `.proto`
- Buat `server/state/` — semua store dengan seed data
- Buat `server/helpers/seed.js` — isi data layanan + slot awal
- Buat `server/index.js` — load proto, register service (handler masih kosong), bind port
- Verifikasi: `node server/index.js` berjalan tanpa error

### Tahap 2 — Unary RPC

Tujuan: semua RPC non-streaming berfungsi dan bisa diuji via `grpcurl`.

- Implementasi `ServiceInfoService` (3 RPC): `ListServices`, `GetServiceDetail`, `GetAvailableSlots`
- Implementasi `BookingService` (6 RPC): semua kecuali streaming
- Implementasi `QueueService` unary: `GetQueueStatus`, `CallNext`, `SkipNumber`, `CompleteService`
- Implementasi `AdminService` unary: `ResetDailyQuota`, `GetSystemStats`, `BroadcastAnnouncement`, `SetServiceStatus`
- Buat `server/helpers/errors.js` — semua factory function error
- Verifikasi tiap RPC dengan `grpcurl`:
  ```bash
  grpcurl -plaintext -d '{}' localhost:50051 siantre.ServiceInfoService/ListServices
  ```

### Tahap 3 — Streaming

Tujuan: `WatchQueue` berfungsi, broadcast bekerja ke banyak client.

- Buat `server/helpers/broadcast.js` — fungsi broadcast dengan personalisasi `YOUR_TURN`
- Implementasi `WatchQueue` di `queueService.js`:
  - Kirim snapshot awal
  - Daftarkan subscriber
  - Handle `call.on('cancelled')` untuk cleanup
- Hubungkan `CallNext` → `broadcast()`
- Hubungkan `CancelBooking` → cek waitlist → `broadcast()` jika ada `WAITLIST_NOTIFIED`
- Hubungkan `ResetDailyQuota` → `broadcast()` dengan event `QUOTA_OPENED`
- Verifikasi: jalankan 3 node client sekaligus, panggil `CallNext`, pastikan semua mendapat update

### Tahap 4 — Bi-Directional Streaming (AdminService)

Tujuan: `AdminSession` berfungsi — admin bisa kirim command dan terima event.

- Implementasi `AdminSession` di `adminService.js`
- Handle semua `command_type`: `CALL_NEXT`, `GET_STATS`, `ANNOUNCE`, `PAUSE`, `RESUME`
- Tangani `call.on('end')` untuk cleanup sesi
- Verifikasi: jalankan admin CLI, kirim beberapa command berturut-turut dalam satu koneksi

### Tahap 5 — CLI Client

Tujuan: dua client interaktif siap dipakai untuk demo.

**`client/citizen.js`** — menu untuk warga:
```
[1] Lihat semua layanan       → ListServices()
[2] Cek slot tersedia         → GetAvailableSlots()
[3] Booking slot              → CreateBooking()
[4] Lihat booking saya        → GetMyBooking()
[5] Konfirmasi kedatangan     → ConfirmArrival()
[6] Batalkan booking          → CancelBooking()
[7] Pantau antrian real-time  → WatchQueue() [blocking]
[8] Daftar waitlist           → JoinWaitlist()
[0] Keluar
```

**`client/admin.js`** — menu untuk petugas:
```
[1] Panggil nomor berikutnya  → CallNext()
[2] Skip nomor (no-show)      → SkipNumber()
[3] Status antrian            → GetQueueStatus()
[4] Statistik sistem          → GetSystemStats()
[5] Reset kuota harian        → ResetDailyQuota()
[6] Broadcast pengumuman      → BroadcastAnnouncement()
[7] Buka sesi admin (live)    → AdminSession() [BiDi stream]
[0] Keluar
```

Perhatikan tampilan output:
- `YOUR_TURN` → chalk merah terang + border
- Error → chalk merah
- Update biasa → chalk putih/abu
- Notifikasi penting → chalk kuning

### Tahap 6 — Polish

Tujuan: sistem stabil, siap demo, tidak ada edge case yang mengcrash server.

- Pastikan semua `call.on('cancelled')` dan `call.on('end')` ter-handle di semua streaming RPC
- Tambahkan `try/catch` di semua handler untuk menghindari unhandled exception yang crash server
- Logging di server: setiap RPC yang masuk dicatat (`[RPC] CreateBooking - CITIZEN_001`)
- Logging broadcast: berapa subscriber yang menerima tiap event
- Cek: apakah server tetap jalan jika semua client disconnect tiba-tiba?
- Cek: apakah state konsisten setelah serangkaian booking → cancel → booking ulang?

---

## Appendix — Contoh Output CLI

### Client Warga
```
╔══════════════════════════════════════════╗
║        SiAntre — Antrian Digital         ║
╚══════════════════════════════════════════╝
  Selamat datang, Budi Santoso
  Server: localhost:50051 ✓ Terhubung

  Pilih: 7
  Layanan (SIM/KTP/PSP): SIM
  Nomor antrian Anda (0 jika belum): 5

  ────────────────────────────────────────
  📡 Memantau antrian SIM_BARU...
     Tekan Ctrl+C untuk berhenti
  ────────────────────────────────────────
  [09:15] Nomor dilayani: 3 | Di depan: 2 | Est: ±20 menit
  [09:25] Nomor dilayani: 4 | Di depan: 1 | Est: ±10 menit
  [09:35] 🔔 GILIRAN ANDA! Nomor: 5 — Segera menuju loket!
```

### Client Admin
```
  Pilih: 1 (Panggil Nomor)
  Layanan: SIM

  ✓ Nomor 5 dipanggil!
  Status: Dilayani=5 | Menunggu=3 | Sisa kuota=12
  Broadcast terkirim ke 3 subscriber aktif.
```

---

*SiAntre — Implementation Plan v2.0 (JavaScript Edition)*