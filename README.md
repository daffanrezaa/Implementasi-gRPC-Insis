# SiAntre (Sistem Antrian Layanan Publik Digital)

> Implementasi gRPC untuk sistem antrian layanan publik berbasis Node.js

---

## Anggota Kelompok

| Nama | NRP |
|------|-----|
| Ahmad Rafi Fadhillah Dwiputra | 5027241068 |
| Aditya Reza Daffansyah | 5027241034 |

---

## Deskripsi Proyek

**SiAntre** adalah sistem antrian layanan publik digital yang memungkinkan warga untuk mendaftar, memesan slot layanan, dan memantau posisi antrian secara real-time. Petugas/admin dapat mengelola antrian, check-in warga, dan melakukan kontrol layanan melalui sesi interaktif dua arah.

Proyek ini dibangun menggunakan **gRPC** (Google Remote Procedure Call) dengan **Node.js**, memanfaatkan berbagai pola komunikasi gRPC termasuk unary, server-side streaming, dan bi-directional streaming.

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                         gRPC SERVER                             │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ ServiceInfo    │  │   Booking     │  │     Queue        │  │
│  │ Service        │  │   Service     │  │     Service      │  │
│  │ (Unary)        │  │   (Unary)     │  │ (Unary+Stream)   │  │
│  └────────────────┘  └───────────────┘  └──────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Admin Service (Unary + BiDi Stream)        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│              ┌──────────▼──────────┐                           │
│              │   In-Memory State   │                           │
│              │  citizenStore       │                           │
│              │  officerStore       │                           │
│              │  bookingStore       │                           │
│              │  queueStore         │                           │
│              │  serviceStore       │                           │
│              │  slotStore          │                           │
│              │  announcementStore  │                           │
│              └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ Unary / Server-Stream        │ Unary / BiDi-Stream
         │                              │
┌────────┴──────────┐        ┌──────────┴──────────┐
│  Client: Warga    │        │  Client: Admin/      │
│  (warga.js)       │        │  Petugas (admin.js)  │
└───────────────────┘        └─────────────────────┘
```

---

##  Struktur Direktori

```
SiAntre/
├── proto/
│   ├── admin.proto           # Definisi AdminService (BiDi streaming)
│   ├── booking.proto         # Definisi BookingService (unary)
│   ├── queue.proto           # Definisi QueueService (server streaming)
│   └── service_info.proto    # Definisi ServiceInfoService (unary)
│
├── server/
│   ├── index.js              # Entry point server gRPC
│   ├── services/
│   │   ├── adminService.js       # Implementasi AdminService
│   │   ├── bookingService.js     # Implementasi BookingService
│   │   ├── queueService.js       # Implementasi QueueService
│   │   └── serviceInfoService.js # Implementasi ServiceInfoService
│   ├── state/
│   │   ├── index.js              # Ekspor semua store
│   │   ├── citizenStore.js       # Data warga
│   │   ├── officerStore.js       # Data petugas/admin
│   │   ├── bookingStore.js       # Data pemesanan
│   │   ├── queueStore.js         # Status antrian real-time
│   │   ├── serviceStore.js       # Data layanan publik
│   │   ├── slotStore.js          # Data slot waktu
│   │   └── announcementStore.js  # Data pengumuman
│   └── helpers/
│
└── client/
    ├── warga.js              # Client interaktif untuk warga/warga
    └── admin.js              # Client interaktif untuk admin/petugas
```

---

## Fitur yang Diimplementasikan

### 1.  Request-Response (Unary) gRPC

Unary RPC adalah pola paling sederhana, di mana client mengirim satu request dan menerima satu response. Hampir semua operasi CRUD dalam SiAntre menggunakan pola ini.

**Contoh implementasi pada `BookingService`:**

```proto
// booking.proto
service BookingService {
  rpc CreateBooking     (CreateBookingRequest)     returns (CreateBookingResponse);
  rpc CancelBooking     (CancelBookingRequest)     returns (CancelBookingResponse);
  rpc GetMyBooking      (GetMyBookingRequest)      returns (GetMyBookingResponse);
  rpc RescheduleBooking (RescheduleBookingRequest) returns (RescheduleBookingResponse);
}
```

**Contoh implementasi pada `ServiceInfoService`:**

```proto
// service_info.proto
service ServiceInfoService {
  rpc RegisterCitizen   (RegisterCitizenRequest)   returns (RegisterCitizenResponse);
  rpc LoginCitizen      (LoginCitizenRequest)       returns (LoginCitizenResponse);
  rpc ListServices      (ListServicesRequest)        returns (ListServicesResponse);
  rpc GetServiceDetail  (GetServiceDetailRequest)   returns (GetServiceDetailResponse);
  rpc GetAvailableSlots (GetAvailableSlotsRequest)  returns (GetAvailableSlotsResponse);
  rpc GetAnnouncements  (GetAnnouncementsRequest)   returns (GetAnnouncementsResponse);
}
```

---

### 2. Streaming gRPC

SiAntre mengimplementasikan **dua** pola streaming sekaligus:

#### 2a. Server-side Streaming — `QueueService.WatchQueue`

Server-side streaming memungkinkan client berlangganan ke satu stream, dan server akan terus-menerus mengirimkan update setiap kali ada perubahan status antrian.

```proto
// queue.proto
service QueueService {
  // Server-side streaming: client subscribe sekali, server push update terus-menerus
  rpc WatchQueue     (WatchQueueRequest)     returns (stream QueueUpdate);
  rpc GetQueueStatus (GetQueueStatusRequest) returns (GetQueueStatusResponse);
  rpc CallNext       (CallNextRequest)       returns (CallNextResponse);
}
```

**Alur kerja:**
1. Warga memanggil `WatchQueue` dengan `service_id` dan `queue_number`-nya
2. Server menyimpan koneksi streaming warga tersebut
3. Setiap kali admin memanggil giliran berikutnya, server **mem-broadcast** `QueueUpdate` ke semua subscriber yang aktif
4. Warga menerima event seperti `QUEUE_MOVED`, `YOUR_TURN`, `SERVICE_CLOSED`, `ANNOUNCEMENT`, dll.

#### 2b. Bi-directional Streaming — `AdminService.AdminSession`

Bi-directional streaming memungkinkan client dan server saling mengirim pesan secara independen dalam satu koneksi yang sama.

```proto
// admin.proto
service AdminService {
  // BiDi: admin mengirim perintah, server membalas dengan event
  rpc AdminSession (stream AdminCommand) returns (stream AdminEvent);
  // ...unary methods lainnya
}
```

**Tipe perintah (AdminCommand) yang didukung:**

| `command_type` | Deskripsi |
|---|---|
| `CALL_NEXT` | Panggil nomor antrian berikutnya untuk suatu layanan |
| `ANNOUNCE` | Broadcast pengumuman ke semua subscriber |
| `PAUSE` | Tutup sementara layanan |
| `RESUME` | Buka kembali layanan yang dijeda |
| `GET_STATS` | Minta snapshot statistik sistem |

**Tipe event (AdminEvent) yang dikembalikan server:**

| `event_type` | Deskripsi |
|---|---|
| `QUEUE_UPDATE` | Hasil dari perintah `CALL_NEXT` |
| `STATS_SNAPSHOT` | Hasil dari perintah `GET_STATS` |
| `ACK` | Konfirmasi umum berhasil |
| `ERROR` | Perintah gagal diproses |

---

### 3.  Error Handling

SiAntre menerapkan error handling yang konsisten menggunakan **gRPC status codes** standar.

**Contoh error yang ditangani:**

| Skenario | gRPC Status Code |
|---|---|
| Resource tidak ditemukan (booking, layanan, warga) | `NOT_FOUND` |
| Data sudah ada / duplikat (NIK terdaftar) | `ALREADY_EXISTS` |
| Input tidak valid (field kosong, format salah) | `INVALID_ARGUMENT` |
| Aksi tidak diizinkan (bukan ADMIN, quota habis) | `PERMISSION_DENIED` |
| Layanan sedang tutup | `FAILED_PRECONDITION` |
| Autentikasi gagal (PIN salah, NIK tidak dikenal) | `UNAUTHENTICATED` |

**Contoh implementasi di server (`bookingService.js`):**

```js
// Jika layanan tidak ditemukan
if (!service) {
  return callback({
    code: grpc.status.NOT_FOUND,
    message: `Layanan '${call.request.service_id}' tidak ditemukan`,
  });
}

// Jika quota sudah habis
if (service.quotaRemaining <= 0) {
  return callback({
    code: grpc.status.FAILED_PRECONDITION,
    message: 'Kuota layanan hari ini sudah habis',
  });
}
```

---

### 4. State Management In-Memory Server

Semua data disimpan langsung di memori server menggunakan JavaScript `Map` dan `Array`. Pendekatan ini cepat dan cocok untuk demo/prototipe tanpa ketergantungan database eksternal.

**Store yang tersedia (`server/state/`):**

| Store | Deskripsi |
|---|---|
| `citizenStore` | Data registrasi warga (NIK, nama, no HP, alamat) |
| `officerStore` | Data petugas & admin (ID pegawai, jabatan, PIN, role) |
| `bookingStore` | Data pemesanan (booking ID, kode booking, status) |
| `queueStore` | Status antrian per layanan (nomor aktif, subscriber aktif) |
| `serviceStore` | Data layanan publik (quota, jam buka, lokasi) |
| `slotStore` | Data slot waktu per layanan per hari |
| `announcementStore` | Riwayat pengumuman yang dibroadcast admin |

**Contoh struktur `queueStore`:**
```js
// queueStore.js - menyimpan state antrian dan daftar subscriber streaming
const queueStore = new Map();
// key: service_id
// value: { currentNumber, waitingList: [], subscribers: [stream1, stream2, ...] }
```

>  Catatan: Karena menggunakan in-memory, seluruh data akan **reset** saat server dimatikan. Untuk persistensi, dapat diganti dengan database seperti PostgreSQL atau MongoDB.

---

### 5. Multi Client

SiAntre mendukung **multi client** secara bersamaan dengan dua tipe klien yang berbeda:

#### Client 1 — `client/warga.js` (Warga/Citizen)
Antarmuka CLI interaktif untuk warga. Dalam satu instance, warga dapat:
- Mendaftar / login dengan NIK
- Melihat daftar & detail layanan publik
- Memesan, membatalkan, atau menjadwal ulang antrian
- **Berlangganan live update antrian** melalui server-side streaming

#### Client 2 — `client/admin.js` (Admin/Petugas)
Antarmuka CLI interaktif untuk petugas. Admin dapat:
- Login dengan ID Pegawai & PIN
- Melakukan check-in warga berdasarkan kode booking
- Mengelola walk-in (warga tanpa booking)
- Menjalankan **sesi admin interaktif** melalui bi-directional streaming (panggil antrian, pause layanan, broadcast pengumuman, dll.)
- Mengelola daftar petugas (tambah, ubah, hapus)

**Menjalankan beberapa client sekaligus:**

Buka beberapa terminal secara bersamaan dan jalankan:

```bash
# Terminal 1 — Server
npm run server

# Terminal 2 — Client Warga pertama
npm run warga

# Terminal 3 — Client Warga kedua (berjalan paralel)
npm run warga

# Terminal 4 — Client Admin
npm run admin
```

Semua client terhubung ke server yang sama. Ketika admin memanggil antrian, **semua warga yang aktif berlangganan** akan menerima notifikasi secara real-time secara bersamaan.

---

### 6. Services yang Ditawarkan

SiAntre mengimplementasikan tepat **4 gRPC services**:

| # | Service | File Proto | Pola RPC | Deskripsi |
|---|---|---|---|---|
| 1 | `ServiceInfoService` | `service_info.proto` | Unary | Registrasi/login warga, info layanan & slot |
| 2 | `BookingService` | `booking.proto` | Unary | Pemesanan, pembatalan, penjadwalan ulang |
| 3 | `QueueService` | `queue.proto` | Unary + **Server Streaming** | Monitoring antrian real-time |
| 4 | `AdminService` | `admin.proto` | Unary + **BiDi Streaming** | Manajemen sistem, antrian, & petugas |

---

## Fitur Tambahan

Selain fitur-fitur wajib di atas, SiAntre juga mengimplementasikan beberapa fitur tambahan berikut:

### Sistem Autentikasi Berbasis Role

Sistem membedakan dua jenis pengguna dengan hak akses yang berbeda: **Warga** (citizen) yang login menggunakan NIK 16 digit, dan **Petugas/Admin** yang login menggunakan ID Pegawai dan PIN minimal 6 digit. Role `ADMIN` memiliki hak penuh untuk mengelola petugas lain, sedangkan role `PETUGAS` hanya dapat mengoperasikan antrian.

Fitur keamanan tambahan yang diimplementasikan:
- Admin tidak dapat menghapus akun miliknya sendiri
- Setiap operasi sensitif (tambah/ubah/hapus petugas) memerlukan re-autentikasi PIN requester
- Setup awal sistem (pendaftaran petugas pertama) bebas autentikasi — setelah petugas pertama terdaftar, semua operasi selanjutnya wajib terautentikasi

### Sistem Slot Waktu Berbasis Kapasitas (Capacity-Based Slot)

Setiap hari terdapat slot waktu setiap 30 menit dari pukul 08:00 hingga 14:00 (12 slot/hari). Setiap slot memiliki kapasitas **4 loket** yang digunakan bersama oleh semua layanan. Sistem mencegah warga memiliki lebih dari satu booking aktif di sesi waktu yang sama.

```
Slot 08:00  →  kapasitas 4 (bisa diisi booking dari layanan manapun)
Slot 08:30  →  kapasitas 4
...
Slot 13:30  →  kapasitas 4
```

Slot di-seed otomatis untuk hari ini dan hari esok saat server pertama kali dijalankan.

### Auto-Expire Booking

Server menjalankan background timer setiap **60 detik** yang secara otomatis meng-expire booking yang pemiliknya gagal check-in tepat waktu. Batas check-in adalah **15 menit sebelum sesi dimulai**.

Ketika booking di-expire:
- Status booking berubah menjadi `EXPIRED`
- Slot dikembalikan ke pool, sehingga bisa diambil warga lain
- Quota layanan dikembalikan (+1)
- Subscribers yang aktif menerima event `QUOTA_OPENED` via server-side streaming

```js
// seed.js — timer berjalan setiap 60 detik
setInterval(() => {
  const booked = bookingStore.getAllBooked();
  for (const booking of booked) {
    if (isExpired(booking.slot_date, booking.slot_time)) {
      booking.status = 'EXPIRED';
      slotStore.release(booking.slot_id);
      // ...broadcast QUOTA_OPENED ke subscribers
    }
  }
}, 60 * 1000);
```

### Walk-in (Pendaftaran Langsung di Tempat)

Selain booking online, petugas dapat mendaftarkan warga yang datang langsung tanpa booking terlebih dahulu melalui RPC `WalkInCitizen`. Sistem akan otomatis membuat booking dan langsung melakukan check-in dalam satu operasi. Walk-in hanya diperbolehkan selama jam operasional layanan dan jika masih ada kapasitas slot aktif.

### Reschedule Booking

Warga dapat mengubah jadwal booking ke slot waktu lain selama booking masih berstatus `BOOKED` (belum check-in). Proses reschedule dilakukan secara atomik: slot lama dilepas dan slot baru diklaim dalam satu operasi, sehingga tidak ada risiko race condition antar booking.

### Reset Quota Harian

Admin dapat mereset quota harian sebuah layanan (atau semua layanan sekaligus) melalui RPC `ResetDailyQuota`. Reset ini akan:
- Mengembalikan `quota_remaining` ke nilai `daily_quota` semula
- Mengosongkan waiting list antrian
- Me-reset nomor antrian ke 1
- Membuka kembali layanan yang sedang dijeda
- Meregenerasi slot waktu untuk hari ini
- Mem-broadcast event `QUOTA_OPENED` ke semua subscriber aktif

### Dashboard Statistik Sistem

Admin dapat mengambil snapshot statistik sistem secara real-time melalui `GetSystemStats` (unary) atau melalui command `GET_STATS` di dalam sesi BiDi streaming. Data statistik mencakup:

| Field | Deskripsi |
|---|---|
| `total_bookings_today` | Total booking yang dibuat hari ini |
| `total_served_today` | Total warga yang sudah dilayani (status `DONE`) |
| `total_cancelled_today` | Total booking yang dibatalkan |
| `active_subscribers` | Jumlah warga yang sedang berlangganan live update |
| `per_service` | Detail quota, waiting count, dan status per layanan |

---

## Cara Menjalankan

### Prasyarat
- **Node.js** v18 atau lebih baru
- **npm**

### Instalasi

```bash
# Clone repositori
git clone <repo-url>
cd SiAntre

# Install dependensi
npm install
```

### Menjalankan Aplikasi

```bash
# 1. Jalankan server (di terminal terpisah)
npm run server

# 2. Jalankan client warga
npm run warga

# 3. Jalankan client admin
npm run admin
```

### Skrip yang Tersedia

| Skrip | Perintah | Keterangan |
|---|---|---|
| `npm run server` | `nodemon server/index.js` | Server dengan auto-reload (development) |
| `npm run server:start` | `node server/index.js` | Server tanpa auto-reload (production) |
| `npm run warga` | `node client/warga.js` | Client untuk warga |
| `npm run admin` | `node client/admin.js` | Client untuk admin/petugas |

---

## Dependensi

| Package | Versi | Fungsi |
|---|---|---|
| `@grpc/grpc-js` | ^1.10.0 | Library gRPC untuk Node.js |
| `@grpc/proto-loader` | ^0.7.0 | Loader file `.proto` |
| `chalk` | ^5.3.0 | Pewarnaan output CLI |
| `uuid` | ^9.0.0 | Generate UUID unik |
| `nodemon` | ^3.0.0 | Auto-reload server saat development |

---

## Catatan Tambahan

- Server berjalan pada port **`50051`** secara default
- Sistem wajib diinisialisasi terlebih dahulu melalui client admin (mendaftarkan petugas pertama)
- Semua komunikasi menggunakan **Protocol Buffers (protobuf)** sebagai format serialisasi
- State in-memory akan direset setiap kali server di-restart
