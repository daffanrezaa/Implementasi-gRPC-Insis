# Government Service Queue — gRPC System Draft

---

## 1. Judul

**SiAntre: Sistem Antrian Layanan Publik Digital via gRPC**
*Simulasi platform antrian digital untuk layanan pemerintahan (SAMSAT, Disdukcapil, Imigrasi) berbasis komunikasi client-server real-time menggunakan protokol gRPC*

---

## 2. Deskripsi & Tujuan

### Deskripsi
SiAntre adalah simulasi sistem antrian layanan publik digital yang memungkinkan warga mengambil nomor antrian, memesan slot waktu, dan memantau posisi antrian secara real-time dari rumah — tanpa harus datang dan berdiri mengantri fisik.

Sistem ini mengelola beberapa jenis layanan pemerintahan (misal: SIM, KTP, Paspor) yang masing-masing memiliki kuota harian terbatas. Ketika kuota habis, seluruh client yang sedang aktif langsung mendapat notifikasi secara otomatis dari server. Ketika hari berganti dan kuota dibuka kembali, server kembali mem-broadcast pemberitahuan ke semua client yang terhubung.

Proyek ini mendemonstrasikan bagaimana gRPC digunakan dalam domain layanan publik yang nyata, dengan penekanan pada **server-push notification**, **concurrent multi-client subscription**, dan **state management** yang mencerminkan alur kerja birokrasi sesungguhnya.

### Tujuan
- Mengimplementasikan **Unary gRPC** untuk aksi transaksional seperti booking slot, konfirmasi kedatangan, dan pembatalan.
- Mengimplementasikan **Server-side Streaming** agar server dapat mem-push perubahan antrian secara real-time ke semua warga yang sedang menunggu, tanpa client perlu melakukan polling berulang.
- Menerapkan **error handling** yang mencerminkan kondisi nyata layanan publik: kuota habis, jadwal bentrok, slot tidak ditemukan.
- Mengelola **in-memory state** yang mencakup kuota harian per layanan, antrian aktif, dan daftar booking warga.
- Mendukung **multi-client** — banyak warga bisa terhubung secara bersamaan dan masing-masing menerima update antrian sesuai layanan yang mereka ikuti.

---

## 3. Design Sistem

### 3.1 Arsitektur Umum

```
┌──────────────┐
│  Warga A     │──┐
│ (nunggu SIM) │  │
└──────────────┘  │
                  │     gRPC Stream / Unary
┌──────────────┐  ├──────────────────────────► ┌─────────────────────┐
│  Warga B     │──┤                             │       SERVER        │
│ (nunggu KTP) │  │                             │                     │
└──────────────┘  │                             │  ┌───────────────┐  │
                  │                             │  │  In-Memory    │  │
┌──────────────┐  │                             │  │  State        │  │
│  Warga C     │──┘                             │  └───────────────┘  │
│ (nunggu SIM) │                                └─────────────────────┘
└──────────────┘         ▲
                         │  Unary (admin panel)
                ┌────────────────┐
                │  Admin/Petugas │
                │  (opsional)    │
                └────────────────┘
```

Server adalah **sumber kebenaran tunggal**. Warga A dan Warga C sama-sama subscribe ke antrian layanan SIM — keduanya menerima update yang sama dari server secara bersamaan saat nomor antrian bergerak maju.

### 3.2 Services

Sistem terdiri dari **3 gRPC Services**:

#### `ServiceInfoService`
Menangani informasi statis dan semi-statis tentang layanan yang tersedia. Tidak berubah sering, cocok untuk Unary.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `ListServices` | Unary | Ambil daftar semua jenis layanan (SIM, KTP, Paspor, dll.) |
| `GetServiceDetail` | Unary | Detail satu layanan: jam buka, kuota per hari, persyaratan |
| `GetAvailableSlots` | Unary | Daftar slot waktu yang masih tersedia untuk layanan tertentu di tanggal tertentu |

#### `BookingService`
Menangani seluruh siklus hidup pemesanan slot oleh warga.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `CreateBooking` | Unary | Warga pesan slot waktu untuk layanan tertentu |
| `ConfirmArrival` | Unary | Warga konfirmasi sudah tiba di kantor — nomor antrian aktif |
| `CancelBooking` | Unary | Warga batalkan booking, slot dikembalikan ke pool |
| `GetMyBooking` | Unary | Warga cek status booking miliknya |

#### `QueueService`
Menangani antrian aktif secara real-time di hari pelayanan.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `WatchQueue` | Server-side Streaming | Warga subscribe ke antrian layanan tertentu, terima update setiap ada perubahan |
| `CallNext` | Unary | Petugas panggil nomor antrian berikutnya — memicu broadcast ke semua subscriber |
| `GetQueueStatus` | Unary | Snapshot posisi antrian saat ini (tanpa stream, untuk client yang baru join) |

### 3.3 In-Memory State

```
Server State
├── services: Map<service_id, ServiceDefinition>
│   ├── service_id: string          ("SIM_BARU", "KTP", "PASPOR", ...)
│   ├── name: string
│   ├── daily_quota: int            (misal: 50 slot per hari)
│   ├── open_hour: string           ("08:00")
│   └── close_hour: string          ("14:00")
│
├── slots: Map<service_id, []Slot>
│   └── Slot
│       ├── slot_id: string
│       ├── date: string
│       ├── time: string            ("09:00", "09:30", ...)
│       └── status: AVAILABLE | BOOKED | DONE
│
├── bookings: Map<booking_id, Booking>
│   ├── booking_id: string
│   ├── citizen_id: string
│   ├── service_id: string
│   ├── slot_id: string
│   ├── queue_number: int           (diisi saat ConfirmArrival)
│   └── status: BOOKED | ARRIVED | CALLED | DONE | CANCELLED
│
└── active_queues: Map<service_id, QueueState>
    ├── service_id: string
    ├── current_number: int         (nomor yang sedang dilayani)
    ├── waiting_list: []int         (nomor-nomor yang sudah arrive)
    ├── quota_remaining: int        (sisa kuota hari ini)
    └── subscribers: []StreamChannel (koneksi stream aktif)
```

**Catatan penting:** `subscribers` dalam `active_queues` adalah daftar koneksi stream yang sedang terbuka. Setiap kali `CallNext` dipanggil petugas, server iterasi seluruh `subscribers` dan kirim `QueueUpdate` ke masing-masing — inilah mekanisme broadcast server-side streaming.

### 3.4 Alur Penggunaan

```
H-1 (Hari Sebelumnya) — Booking:

1. Warga → ListServices()                   [Unary - ServiceInfoService]
   Server → kembalikan daftar layanan

2. Warga → GetAvailableSlots(service, date) [Unary - ServiceInfoService]
   Server → kembalikan slot yang masih kosong

3. Warga → CreateBooking(service, slot)     [Unary - BookingService]
   Server → kurangi quota_remaining, kembalikan booking_id & kode booking
   Server → jika quota_remaining = 0, broadcast QUOTA_EXHAUSTED ke semua
            client yang masih memanggil GetAvailableSlots

─────────────────────────────────────────────────────────────────

Hari H (Hari Pelayanan) — Antrian Aktif:

4. Warga datang → ConfirmArrival(booking_id) [Unary - BookingService]
   Server → assign nomor antrian, masukkan ke waiting_list

5. Warga → WatchQueue(service_id)            [Server-stream - QueueService]
   Server → kirim snapshot antrian saat ini, lalu terus push setiap ada update

6. Petugas → CallNext(service_id)            [Unary - QueueService]
   Server → naikkan current_number
   Server → broadcast QueueUpdate ke SEMUA subscriber layanan ini

7. Warga yang nomornya dipanggil →
   Server stream mereka terima { event: YOUR_TURN, queue_number: 17 }

─────────────────────────────────────────────────────────────────

Reset Kuota (Otomatis tengah malam / simulasi manual):

8. Server reset quota_remaining ke daily_quota untuk semua layanan
   Server → broadcast QUOTA_OPENED ke semua client yang terhubung
```

### 3.5 Proto Sketch

```proto
syntax = "proto3";

// ── ServiceInfoService ────────────────────────────────────
service ServiceInfoService {
  rpc ListServices(ListServicesRequest)     returns (ListServicesResponse);
  rpc GetServiceDetail(ServiceDetailRequest) returns (ServiceDetailResponse);
  rpc GetAvailableSlots(SlotRequest)        returns (SlotResponse);
}

// ── BookingService ────────────────────────────────────────
service BookingService {
  rpc CreateBooking(CreateBookingRequest)   returns (CreateBookingResponse);
  rpc ConfirmArrival(ConfirmRequest)        returns (ConfirmResponse);
  rpc CancelBooking(CancelRequest)          returns (CancelResponse);
  rpc GetMyBooking(GetBookingRequest)       returns (GetBookingResponse);
}

// ── QueueService ──────────────────────────────────────────
service QueueService {
  rpc WatchQueue(WatchQueueRequest)  returns (stream QueueUpdate);
  rpc CallNext(CallNextRequest)      returns (CallNextResponse);
  rpc GetQueueStatus(QueueStatusRequest) returns (QueueStatusResponse);
}

// ── Core Messages ─────────────────────────────────────────
message QueueUpdate {
  enum EventType {
    QUEUE_MOVED    = 0;  // nomor berikutnya dipanggil
    YOUR_TURN      = 1;  // khusus untuk warga yang nomornya dipanggil
    QUOTA_EXHAUSTED = 2; // kuota hari ini habis
    QUOTA_OPENED   = 3;  // kuota hari baru dibuka
    SERVICE_CLOSED = 4;  // layanan tutup hari ini
  }
  EventType event          = 1;
  int32 current_number     = 2;  // nomor yang sedang dilayani
  int32 your_number        = 3;  // nomor antrian warga ini (jika relevan)
  int32 people_ahead       = 4;  // berapa orang di depan warga ini
  string message           = 5;  // pesan human-readable
  int32 quota_remaining    = 6;  // sisa kuota (untuk event QUOTA_*)
}

message CreateBookingRequest {
  string citizen_id  = 1;
  string service_id  = 2;
  string slot_id     = 3;
}

message CreateBookingResponse {
  string booking_id    = 1;
  string booking_code  = 2;  // kode pendek untuk konfirmasi, misal "SIM-A3F7"
  int32  slot_number   = 3;  // urutan slot yang dipesan
  string slot_time     = 4;  // "09:30"
}
```

---

## 4. Fitur-fitur

### 4.1 Fitur Wajib (Memenuhi Syarat Tugas)

| No | Fitur | Implementasi |
|----|-------|-------------|
| 1 | **Unary gRPC** | `ListServices`, `CreateBooking`, `ConfirmArrival`, `CancelBooking`, `CallNext`, `GetQueueStatus` |
| 2 | **Server-side Streaming** | `WatchQueue` — server push update antrian ke semua subscriber secara real-time |
| 3 | **Error Handling** | Lihat bagian 4.3 |
| 4 | **In-memory State** | Services, slots, bookings, active queues, subscribers |
| 5 | **Multi-client** | Banyak warga terhubung bersamaan, masing-masing subscribe ke layanan berbeda |
| 6 | **Minimal 3 Services** | `ServiceInfoService`, `BookingService`, `QueueService` |

### 4.2 Fitur Utama

- **Multi-layanan paralel** — antrian SIM, KTP, dan Paspor berjalan secara independen dan paralel. Warga yang subscribe ke SIM tidak terganggu oleh update antrian KTP.
- **Daily quota system** — setiap layanan punya kuota harian. Saat kuota habis, semua client aktif langsung mendapat broadcast `QUOTA_EXHAUSTED` tanpa perlu refresh.
- **Booking dengan slot waktu** — warga tidak sekadar ambil nomor, tapi pesan slot jam tertentu (08:00, 08:30, 09:00, dst.) untuk mengurangi penumpukan di jam yang sama.
- **Confirm arrival flow** — booking tidak langsung mengaktifkan antrian. Warga harus `ConfirmArrival` saat tiba di kantor untuk mendapat nomor antrian aktif. Ini mensimulasikan alur nyata.
- **People ahead counter** — setiap update yang diterima warga menyertakan `people_ahead` — berapa orang di depannya dalam antrian. Lebih informatif dari sekadar nomor saat ini.
- **YOUR_TURN notification** — saat nomor warga dipanggil, stream mereka menerima event khusus `YOUR_TURN` sebagai sinyal untuk segera menuju loket.

### 4.3 Error Handling

| Error Code | Kondisi Pemicu |
|------------|----------------|
| `QUOTA_EXHAUSTED` | Warga coba booking saat kuota hari ini sudah habis |
| `SLOT_NOT_AVAILABLE` | Slot yang dipilih sudah dibooking orang lain (race condition) |
| `BOOKING_NOT_FOUND` | `booking_id` tidak ditemukan di server |
| `ALREADY_CONFIRMED` | `ConfirmArrival` dipanggil dua kali untuk booking yang sama |
| `SERVICE_NOT_OPEN` | Warga coba booking di luar jam operasional |
| `INVALID_DATE` | Tanggal yang diminta sudah lewat atau terlalu jauh ke depan |
| `BOOKING_CANCELLED` | Warga coba confirm arrival untuk booking yang sudah dibatalkan |
| `NOT_AUTHORIZED` | Client non-petugas mencoba memanggil `CallNext` |

### 4.4 Twist Kreatif — Server-Push Events

Inilah fitur yang paling mendemonstrasikan kekuatan gRPC streaming secara nyata:

**Skenario QUOTA_EXHAUSTED:**
Warga D membuka halaman booking dan terhubung ke server. Saat itu kuota masih tersisa 1. Warga E (client lain) berhasil booking lebih dulu, kuota menjadi 0. Server otomatis broadcast `QUOTA_EXHAUSTED` ke Warga D tanpa Warga D perlu refresh — halaman langsung menampilkan "Kuota hari ini telah habis."

**Skenario QUOTA_OPENED:**
Tengah malam (atau dieksekusi manual untuk demo), server mereset kuota semua layanan. Server kemudian broadcast `QUOTA_OPENED` ke semua client yang masih terhubung — mensimulasikan notifikasi "Kuota hari baru sudah dibuka, segera booking!"

**Skenario YOUR_TURN:**
Warga F menunggu dengan nomor antrian 17. Antrian saat ini di nomor 14. Setiap petugas memanggil `CallNext`, semua subscriber antrian SIM menerima update — `current_number` naik, `people_ahead` Warga F berkurang. Saat nomor 17 tiba, Warga F menerima event `YOUR_TURN` yang berbeda dari update biasa.

### 4.5 Fitur Tambahan (Opsional, Nilai Lebih)

- **Waitlist otomatis** — jika kuota habis, warga bisa masuk waitlist. Saat ada pembatalan, server otomatis assign slot ke warga pertama di waitlist dan kirim notifikasi via stream.
- **Estimasi waktu tunggu** — server hitung dan kirim estimasi waktu tunggu berdasarkan rata-rata waktu pelayanan per orang (configurable, default 10 menit/orang).
- **Admin panel mode** — client yang login sebagai petugas mendapat akses ke `CallNext` dan bisa melihat seluruh antrian aktif semua layanan sekaligus.
- **Reschedule booking** — warga bisa ganti slot tanpa harus cancel dan booking ulang, selama slot baru masih tersedia.